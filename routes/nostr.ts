// ─── Nostr (opt-in) ───────────────────────────────────────────────────────────
// Mount:  app.use('/api/nostr', createNostrRouter());
//         app.get('/.well-known/nostr.json', createNip05Handler());
// (or const nostr = createNostr(); use nostr.router / nostr.nip05 / nostr.service so they share caches)
//
// OFF by default. Nothing is published until the person links a key they control, and every publish is signed by
// THEIR signer (NIP-07 extension / NIP-46 bunker) — unless they explicitly asked Plajah to generate and hold a key
// (encrypted, exportable, deletable). Zaps go fan wallet → creator's own Lightning address; Plajah never holds funds.

import { randomBytes } from 'node:crypto';
import express, { Router, type Request, type Response, type RequestHandler } from 'express';
import { verifyIdToken as realVerifyIdToken, fsGetUser } from '../services/firebaseAdminRest';
import { verifyEvent, finalizeEvent, isSensitive, KIND, nowSec, tagValues, type NostrEvent, type UnsignedEvent } from '../services/nostr/event';
import { RelayPool, DEFAULT_RELAYS, sanitizeRelays, type Filter, type PublishResult } from '../services/nostr/relay';
import { npubEncode, nsecEncode, neventEncode, normalizePubkey } from '../services/nostr/bech32';
import { generateSecretKey, getPublicKey } from '../services/nostr/schnorr';
import {
  resolveLnurlPay, buildZapRequestTemplate, validateZapRequest, requestInvoice, sumZapReceipts, parseLud16, assertPublicHttps,
  type FetchLike, type HostCheck, type LnurlPay,
} from '../services/nostr/zap';
import {
  userIneligibleReason, orgIneligibleReason, postToNote, trackToNote, profileTemplate, deleteTemplate, challengeTemplate, normalizeNip05Name,
} from '../services/nostr/policy';
import {
  firestoreStore, signTicket, readTicket, templateHash, encryptSecret, decryptSecret, publishedPath,
  type NostrStore, type NostrAccount,
} from '../services/nostr/store';

export interface NostrDeps {
  store: NostrStore;
  pool: RelayPool;
  verifyIdToken: (token: string) => Promise<string | null>;
  getUser: (uid: string) => Promise<Record<string, any> | null>;
  fetch: FetchLike;
  hostCheck: HostCheck;
  /** Domain for NIP-05 identifiers (name@domain). */
  nip05Domain: string;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const HEX64 = /^[0-9a-f]{64}$/;
type RefType = 'post' | 'track' | 'profile' | 'delete';
export interface PublishOutcome {
  ok?: boolean; id?: string; note?: string; results?: PublishResult[];
  blocked?: string; needsSigner?: boolean; template?: UnsignedEvent; ticket?: string;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const bad = (msg: string, status = 400) => new HttpError(status, msg);

function defaultDeps(): NostrDeps {
  const host = (() => { try { return new URL(process.env.VITE_APP_URL || 'https://plajah.com').hostname; } catch { return 'plajah.com'; } })();
  return {
    store: firestoreStore, pool: new RelayPool(), verifyIdToken: realVerifyIdToken, getUser: fsGetUser,
    fetch: (u, i) => fetch(u, i as any) as any, hostCheck: assertPublicHttps, nip05Domain: host,
  };
}

/** Small TTL cache with single-flight. */
function ttlCache<T>(ttlMs: number, max = 200) {
  const m = new Map<string, { at: number; p: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = m.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.p;
    const p = load();
    m.set(key, { at: Date.now(), p });
    p.catch(() => m.delete(key));
    if (m.size > max) m.delete(m.keys().next().value!);
    return p;
  };
}

export function createNostrService(partial: Partial<NostrDeps> = {}) {
  const d: NostrDeps = { ...defaultDeps(), ...partial };
  const lnurlCache = ttlCache<LnurlPay>(5 * 60_000);
  const feedCache = ttlCache<any>(3 * 60_000, 10);
  const zapCache = ttlCache<any>(2 * 60_000, 500);

  const accountOf = async (uid: string) => (await d.store.get(`nostr_accounts/${uid}`)) as NostrAccount | null;

  async function eligibility(uid: string) {
    const user = await d.getUser(uid);
    return { user, reason: userIneligibleReason(user) };
  }
  async function requireLinked(uid: string) {
    const { user, reason } = await eligibility(uid);
    if (reason) throw bad(reason, 403);
    const acct = await accountOf(uid);
    if (!acct?.pubkey) throw bad('Link a Nostr key first.', 409);
    return { user: user!, acct };
  }
  const publicAccount = (a: NostrAccount | null) => a && ({
    pubkey: a.pubkey, npub: a.npub, method: a.method, linkedAt: a.linkedAt, relays: a.relays, lud16: a.lud16 ?? null,
    nip05: a.nip05Name ? `${a.nip05Name}@${d.nip05Domain}` : null, autoPublish: !!a.autoPublish, hasServerKey: !!a.hasServerKey,
  });

  // ── linking ────────────────────────────────────────────────────────────────
  async function linkChallenge(uid: string) {
    const { reason } = await eligibility(uid);
    if (reason) throw bad(reason, 403);
    const challenge = randomBytes(16).toString('hex');
    return { challenge, ticket: signTicket({ p: 'link', u: uid, c: challenge }), template: challengeTemplate(challenge) };
  }

  async function reserveName(uid: string, pubkey: string, wanted: string | null, prior?: string): Promise<string | undefined> {
    if (!wanted) return prior;
    if (wanted === prior) { await d.store.set(`nostr_names/${wanted}`, { uid, pubkey }); return wanted; }
    const taken = await d.store.get(`nostr_names/${wanted}`);
    if (taken && taken.uid !== uid) throw bad('That NIP-05 name is taken.', 409);
    await d.store.set(`nostr_names/${wanted}`, { uid, pubkey });
    if (prior) await d.store.delete(`nostr_names/${prior}`);
    return wanted;
  }

  async function storeLink(uid: string, pubkey: string, method: NostrAccount['method'], body: any, extra: Partial<NostrAccount> = {}) {
    const owner = await d.store.get(`nostr_pubkeys/${pubkey}`);
    if (owner?.uid && owner.uid !== uid) throw bad('That Nostr key is linked to another Plajah account.', 409);
    const prior = await accountOf(uid);
    if (prior?.pubkey && prior.pubkey !== pubkey) await d.store.delete(`nostr_pubkeys/${prior.pubkey}`);
    const lud16 = body?.lud16 ? parseLud16(String(body.lud16)) : null;
    if (body?.lud16 && !lud16) throw bad('That is not a Lightning address (name@domain).');
    const name = await reserveName(uid, pubkey, normalizeNip05Name(body?.nip05Name), prior?.pubkey === pubkey ? prior?.nip05Name : undefined);
    const acct: NostrAccount = {
      pubkey, npub: npubEncode(pubkey), method, linkedAt: Date.now(),
      relays: sanitizeRelays(body?.relays ?? prior?.relays),
      autoPublish: false, // always starts off; the person turns it on
      ...(lud16 ? { lud16: `${lud16.name}@${lud16.domain}` } : prior?.lud16 ? { lud16: prior.lud16 } : {}),
      ...(name ? { nip05Name: name } : {}),
      hasServerKey: false, ...extra,
    };
    if (prior?.hasServerKey && method !== 'server') await d.store.delete(`nostr_keys/${uid}`);
    await d.store.set(`nostr_accounts/${uid}`, acct as any);
    await d.store.set(`nostr_pubkeys/${pubkey}`, { uid });
    if (name) await d.store.set(`nostr_names/${name}`, { uid, pubkey });
    return publicAccount(acct)!;
  }

  async function link(uid: string, body: any) {
    const { reason } = await eligibility(uid);
    if (reason) throw bad(reason, 403);
    const t = readTicket<{ p: string; u: string; c: string }>(body?.ticket);
    if (!t || t.p !== 'link' || t.u !== uid) throw bad('Challenge expired. Try again.');
    const ev = body?.event;
    if (!verifyEvent(ev)) throw bad('Signature check failed.');
    if (ev.kind !== KIND.CLIENT_AUTH || tagValues(ev, 'challenge')[0] !== t.c) throw bad('That is not the challenge we sent.');
    if (Math.abs(nowSec() - ev.created_at) > 600) throw bad('Signed challenge is too old.');
    if (body?.npub) {
      const claimed = normalizePubkey(String(body.npub));
      if (claimed && claimed !== ev.pubkey) throw bad('The challenge was signed by a different key than the npub you entered.');
    }
    const method = ['nip07', 'nip46', 'manual'].includes(body?.method) ? body.method : 'manual';
    return storeLink(uid, ev.pubkey, method, body);
  }

  async function unlink(uid: string) {
    const a = await accountOf(uid);
    if (a?.nip05Name) await d.store.delete(`nostr_names/${a.nip05Name}`);
    if (a?.pubkey) await d.store.delete(`nostr_pubkeys/${a.pubkey}`);
    await d.store.delete(`nostr_keys/${uid}`);
    await d.store.delete(`nostr_accounts/${uid}`);
    return { ok: true };
  }

  async function updateSettings(uid: string, body: any) {
    const { acct } = await requireLinked(uid);
    const patch: Partial<NostrAccount> = {};
    if (body?.relays !== undefined) patch.relays = sanitizeRelays(body.relays);
    if (body?.lud16 !== undefined) {
      if (body.lud16 === '' || body.lud16 === null) patch.lud16 = '';
      else { const l = parseLud16(String(body.lud16)); if (!l) throw bad('That is not a Lightning address (name@domain).'); patch.lud16 = `${l.name}@${l.domain}`; }
    }
    if (body?.autoPublish !== undefined) patch.autoPublish = body.autoPublish === true;
    if (body?.nip05Name !== undefined) {
      if (body.nip05Name === '' || body.nip05Name === null) {
        if (acct.nip05Name) await d.store.delete(`nostr_names/${acct.nip05Name}`);
        patch.nip05Name = '';
      } else {
        const n = normalizeNip05Name(body.nip05Name);
        if (!n) throw bad('NIP-05 names use a-z, 0-9, dot, dash, underscore.');
        patch.nip05Name = await reserveName(uid, acct.pubkey, n, acct.nip05Name);
      }
    }
    await d.store.patch(`nostr_accounts/${uid}`, patch as any);
    return publicAccount({ ...acct, ...patch })!;
  }

  // ── server-held key (explicit opt-in only) ─────────────────────────────────
  async function generateKey(uid: string, body: any) {
    if (body?.confirm !== true) throw bad('Confirm that Plajah should hold an encrypted key for you.');
    const { reason } = await eligibility(uid);
    if (reason) throw bad(reason, 403);
    const prior = await accountOf(uid);
    if (prior?.pubkey && prior.method !== 'server') throw bad('You already linked your own key. Unlink it first.', 409);
    const sec = generateSecretKey();
    const pubkey = getPublicKey(sec);
    await d.store.set(`nostr_keys/${uid}`, { enc: encryptSecret(sec), pubkey, createdAt: Date.now() });
    return storeLink(uid, pubkey, 'server', body, { hasServerKey: true });
  }
  async function serverSecret(uid: string, pubkey: string): Promise<string | null> {
    const k = await d.store.get(`nostr_keys/${uid}`);
    if (!k?.enc || k.pubkey !== pubkey) return null;
    return decryptSecret(String(k.enc));
  }
  async function exportKey(uid: string, body: any) {
    if (body?.confirm !== true) throw bad('Confirm the export. Anyone with this key can post as you.');
    const { acct } = await requireLinked(uid);
    const sec = await serverSecret(uid, acct.pubkey);
    if (!sec) throw bad('Plajah does not hold a key for you.', 404);
    return { nsec: nsecEncode(sec), npub: acct.npub };
  }
  async function deleteKey(uid: string) {
    const a = await accountOf(uid);
    await d.store.delete(`nostr_keys/${uid}`);
    if (a?.method === 'server') return unlink(uid);
    if (a) await d.store.patch(`nostr_accounts/${uid}`, { hasServerKey: false });
    return { ok: true };
  }

  // ── prepare / publish ──────────────────────────────────────────────────────
  async function prepare(uid: string, body: any): Promise<{ blocked?: string; template?: UnsignedEvent; ticket?: string; refType?: RefType; refId?: string }> {
    const { user, acct } = await requireLinked(uid);
    const type = String(body?.type || '') as RefType;
    let r: { blocked?: string; template?: UnsignedEvent }; let refId = '';
    if (type === 'post') {
      const postId = String(body?.postId || '');
      if (!SAFE_ID.test(postId)) throw bad('postId required');
      const post = await d.store.get(`posts/${postId}`);
      if (!post) throw bad('Post not found', 404);
      if (post.authorId !== uid) throw bad('You can only share your own posts', 403);
      if (post.authorIsOrg && post.authorOrgId && SAFE_ID.test(String(post.authorOrgId))) {
        const [org, opt] = await Promise.all([d.store.get(`organizations/${post.authorOrgId}`), d.store.get(`nostr_orgs/${post.authorOrgId}`)]);
        const why = orgIneligibleReason(org, opt?.optIn === true);
        if (why) return { blocked: why };
      }
      r = postToNote(post, postId); refId = postId;
    } else if (type === 'track') {
      const albumId = String(body?.albumId || ''), trackId = String(body?.trackId || '');
      if (!SAFE_ID.test(albumId) || !trackId || trackId.length > 200) throw bad('albumId and trackId required');
      const album = await d.store.get(`albums/${albumId}`);
      if (!album) throw bad('Album not found', 404);
      if (album.ownerId !== uid) throw bad('You can only share your own music', 403);
      const track = (Array.isArray(album.tracks) ? album.tracks : []).find((t: any) => String(t?.id) === trackId);
      if (!track) throw bad('Track not found', 404);
      r = trackToNote(album, track, albumId); refId = `${albumId}_${trackId}`.replace(/[^A-Za-z0-9_-]/g, '_');
    } else if (type === 'profile') {
      r = { template: profileTemplate(user, uid, { nip05: acct.nip05Name ? `${acct.nip05Name}@${d.nip05Domain}` : undefined, lud16: acct.lud16 || undefined }) };
      refId = 'profile';
    } else if (type === 'delete') {
      const refType = String(body?.refType || ''), rid = String(body?.refId || '');
      if (!['post', 'track'].includes(refType) || !/^[A-Za-z0-9_-]{1,260}$/.test(rid)) throw bad('refType and refId required');
      const rec = await d.store.get(publishedPath(uid, refType, rid));
      const ids: string[] = Array.isArray(rec?.eventIds) ? rec!.eventIds.filter((x: unknown) => typeof x === 'string' && HEX64.test(x as string)) : [];
      if (!ids.length) throw bad('Nothing from this was published to Nostr.', 404);
      r = { template: deleteTemplate(ids) }; refId = `${refType}:${rid}`;
    } else throw bad('type must be post, track, profile or delete');
    if (r.blocked || !r.template) return { blocked: r.blocked ?? 'Nothing to share.' };
    const tpl = { ...r.template, pubkey: acct.pubkey };
    return { template: tpl, ticket: signTicket({ p: 'pub', u: uid, h: templateHash(tpl), t: type, i: refId }), refType: type, refId };
  }

  async function record(uid: string, type: RefType, refId: string, ev: NostrEvent, okRelays: string[]) {
    if (type === 'post' || type === 'track') {
      const path = publishedPath(uid, type, refId);
      const prior = await d.store.get(path);
      const ids = [...new Set([...(Array.isArray(prior?.eventIds) ? prior!.eventIds : []), ev.id])].slice(-20);
      await d.store.set(path, { uid, refType: type, refId, eventIds: ids, lastEventId: ev.id, relays: okRelays, at: Date.now() });
    } else if (type === 'delete') {
      const [rt, ...rest] = refId.split(':');
      await d.store.delete(publishedPath(uid, rt, rest.join(':')));
    }
  }

  async function publishSigned(uid: string, body: any) {
    const { acct } = await requireLinked(uid);
    const t = readTicket<{ p: string; u: string; h: string; t: RefType; i: string }>(body?.ticket);
    if (!t || t.p !== 'pub' || t.u !== uid) throw bad('This publish request expired. Prepare it again.');
    const ev = body?.event;
    if (!verifyEvent(ev)) throw bad('Signature check failed.');
    if (ev.pubkey !== acct.pubkey) throw bad('Signed with a different key than the one you linked.');
    if (templateHash(ev) !== t.h) throw bad('The signed event does not match what Plajah prepared.');
    return send(uid, acct, t.t, t.i, ev);
  }

  async function send(uid: string, acct: NostrAccount, type: RefType, refId: string, ev: NostrEvent) {
    const relays = sanitizeRelays(acct.relays);
    const results = await d.pool.publish(ev, relays);
    const ok = results.filter(r => r.ok).map(r => r.relay);
    if (ok.length) await record(uid, type, refId, ev, ok);
    return { ok: ok.length > 0, id: ev.id, note: neventEncode({ id: ev.id, author: ev.pubkey, relays: ok.slice(0, 2), kind: ev.kind }), results };
  }

  /** Publish with the server-held key when there is one; otherwise hand back the template for the browser signer. */
  async function publishRef(uid: string, body: any): Promise<PublishOutcome> {
    const prep = await prepare(uid, body);
    if (prep.blocked || !prep.template) return { blocked: prep.blocked };
    const acct = (await accountOf(uid))!;
    const sec = acct.hasServerKey ? await serverSecret(uid, acct.pubkey) : null;
    if (!sec) return { needsSigner: true, template: prep.template, ticket: prep.ticket };
    return send(uid, acct, prep.refType!, prep.refId!, finalizeEvent(prep.template, sec));
  }

  /** Hook for post creation (lead wires this): only runs when the author turned auto-publish on AND Plajah holds
   *  their key. With a browser signer, the composer calls /prepare + /publish itself. Never throws. */
  async function autoPublishPost(uid: string, postId: string): Promise<{ skipped?: string; result?: unknown }> {
    try {
      const acct = await accountOf(uid);
      if (!acct?.pubkey) return { skipped: 'not linked' };
      if (!acct.autoPublish) return { skipped: 'auto-publish off' };
      if (!acct.hasServerKey) return { skipped: 'needs browser signer' };
      const r: any = await publishRef(uid, { type: 'post', postId });
      return r.blocked ? { skipped: r.blocked } : { result: r };
    } catch (e: any) { return { skipped: String(e?.message || e) }; }
  }

  async function setOrgOptIn(uid: string, orgId: string, enabled: boolean) {
    if (!SAFE_ID.test(orgId)) throw bad('orgId required');
    const org = await d.store.get(`organizations/${orgId}`);
    if (!org) throw bad('Organization not found', 404);
    const admins: string[] = Array.isArray(org.admins) ? org.admins : [];
    if (org.ownerId !== uid && !admins.includes(uid)) throw bad('Only org admins can change this.', 403);
    await d.store.set(`nostr_orgs/${orgId}`, { optIn: enabled, by: uid, at: Date.now() });
    return { orgId, optIn: enabled };
  }

  // ── public reads ───────────────────────────────────────────────────────────
  async function publicUser(uid: string) {
    const acct = await accountOf(uid);
    if (!acct?.pubkey) return { enabled: false };
    const user = await d.getUser(uid);
    if (userIneligibleReason(user)) return { enabled: false };
    return { enabled: true, pubkey: acct.pubkey, npub: acct.npub, lud16: acct.lud16 || null, canZap: !!acct.lud16, nip05: acct.nip05Name ? `${acct.nip05Name}@${d.nip05Domain}` : null };
  }

  async function recipient(uid: string) {
    if (!SAFE_ID.test(uid)) throw bad('recipientUid required');
    const acct = await accountOf(uid);
    if (!acct?.pubkey || !acct.lud16) throw bad('This creator has not set up Lightning tips.', 404);
    const user = await d.getUser(uid);
    if (userIneligibleReason(user)) throw bad('Tips are not available for this account.', 403);
    const pay = await lnurlCache(acct.lud16, () => resolveLnurlPay(acct.lud16!, d));
    return { acct, pay };
  }
  const satsToMsats = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 10_000_000) throw bad('amountSats must be a whole number of sats'); return n * 1000; };

  async function zapPrepare(body: any) {
    const { acct, pay } = await recipient(String(body?.recipientUid || ''));
    const amountMsats = satsToMsats(body?.amountSats);
    let eventId = typeof body?.eventId === 'string' && HEX64.test(body.eventId) ? body.eventId : undefined;
    if (!eventId && body?.postId && SAFE_ID.test(String(body.postId))) {
      const rec = await d.store.get(publishedPath(String(body.recipientUid), 'post', String(body.postId)));
      if (typeof rec?.lastEventId === 'string' && HEX64.test(rec.lastEventId)) eventId = rec.lastEventId;
    }
    const zapRequest = pay.allowsNostr ? buildZapRequestTemplate({
      recipientPubkey: acct.pubkey, amountMsats, relays: sanitizeRelays(acct.relays), lnurl: pay.lnurl, eventId,
      comment: typeof body?.comment === 'string' ? body.comment : undefined,
    }) : null;
    return {
      lud16: pay.lud16, recipientPubkey: acct.pubkey, amountMsats, allowsNostr: pay.allowsNostr,
      minSats: Math.ceil(pay.minSendable / 1000), maxSats: Math.floor(pay.maxSendable / 1000), commentAllowed: pay.commentAllowed,
      zapRequest, eventId: eventId ?? null,
    };
  }

  async function zapInvoice(body: any) {
    const { acct, pay } = await recipient(String(body?.recipientUid || ''));
    const amountMsats = satsToMsats(body?.amountSats);
    let zapRequest: NostrEvent | undefined;
    if (body?.zapRequest) {
      const why = validateZapRequest(body.zapRequest, { recipientPubkey: acct.pubkey, amountMsats });
      if (why) throw bad(why);
      zapRequest = body.zapRequest;
    }
    const inv = await requestInvoice(pay, { amountMsats, zapRequest, comment: typeof body?.comment === 'string' ? body.comment : undefined }, d);
    // The invoice is payable only to the creator's own node/wallet. Plajah stores nothing about the payment.
    return { pr: inv.pr, lud16: pay.lud16, amountSats: amountMsats / 1000, zap: !!zapRequest, verify: inv.verify ?? null };
  }

  async function zapTotals(q: any) {
    const ids = String(q?.e || '').split(',').map(s => s.trim()).filter(s => HEX64.test(s)).slice(0, 50);
    const uid = typeof q?.uid === 'string' && SAFE_ID.test(q.uid) ? q.uid : '';
    if (!ids.length && !uid) throw bad('e (event ids) or uid required');
    return zapCache(`${uid}|${ids.join(',')}`, async () => {
      const acct = uid ? await accountOf(uid) : null;
      let providers: string[] | undefined;
      if (acct?.lud16) { try { const p = await lnurlCache(acct.lud16, () => resolveLnurlPay(acct.lud16!, d)); if (p.nostrPubkey) providers = [p.nostrPubkey]; } catch { /* unverifiable: count none */ providers = ['-']; } }
      const filters: Filter[] = ids.length ? [{ kinds: [KIND.ZAP_RECEIPT], '#e': ids, limit: 500 }] : [{ kinds: [KIND.ZAP_RECEIPT], '#p': [acct?.pubkey ?? '0'.repeat(64)], limit: 500 }];
      if (!ids.length && !acct?.pubkey) return { count: 0, sats: 0, byEvent: {} };
      const receipts = await d.pool.query(filters, sanitizeRelays(acct?.relays), { timeoutMs: 5000 });
      const t = sumZapReceipts(receipts, { providerPubkeys: providers, recipientPubkey: acct?.pubkey });
      return {
        count: t.count, sats: Math.floor(t.msats / 1000), verified: !!providers && providers[0] !== '-',
        byEvent: Object.fromEntries(Object.entries(t.byEvent).map(([k, v]) => [k, { count: v.count, sats: Math.floor(v.msats / 1000) }])),
      };
    });
  }

  const MUSIC_TAGS = ['music', 'nostrmusic', 'tunestr', 'wavlake', 'zapthesong', 'newmusic'];
  async function publicFeed(mode: 'music' | 'notes' | 'all') {
    return feedCache(mode, async () => {
      const since = nowSec() - 7 * 86400;
      const filters: Filter[] = [];
      if (mode !== 'notes') filters.push({ kinds: [KIND.NOTE], '#t': MUSIC_TAGS, since, limit: 80 });
      if (mode !== 'music') filters.push({ kinds: [KIND.NOTE], '#t': ['plajah', 'art', 'photography', 'poetry'], since, limit: 60 });
      const raw = await d.pool.query(filters, DEFAULT_RELAYS, { timeoutMs: 5000, maxEvents: 400 });
      const events = raw.filter(e =>
        e.kind === KIND.NOTE && !isSensitive(e)
        && !e.tags.some(t => t[0] === 'e') // root notes only, no replies
        && e.content.trim().length > 0 && e.content.length <= 4000,
      ).slice(0, 60);
      const authors = [...new Set(events.map(e => e.pubkey))].slice(0, 60);
      const profiles = new Map<string, { name?: string; picture?: string; nip05?: string; lud16?: string }>();
      if (authors.length) {
        const metas = await d.pool.query([{ kinds: [KIND.METADATA], authors, limit: authors.length * 2 }], DEFAULT_RELAYS, { timeoutMs: 4000 });
        for (const m of metas) {
          if (profiles.has(m.pubkey)) continue; // newest first
          try {
            const j = JSON.parse(m.content);
            profiles.set(m.pubkey, {
              name: typeof j.display_name === 'string' && j.display_name ? j.display_name.slice(0, 80) : typeof j.name === 'string' ? j.name.slice(0, 80) : undefined,
              picture: typeof j.picture === 'string' && /^https:\/\//.test(j.picture) ? j.picture.slice(0, 500) : undefined,
              nip05: typeof j.nip05 === 'string' ? j.nip05.slice(0, 120) : undefined,
              lud16: typeof j.lud16 === 'string' && parseLud16(j.lud16) ? j.lud16 : undefined,
            });
          } catch { /* skip bad metadata */ }
        }
      }
      const keep = new Set(['t', 'imeta', 'subject', 'title', 'r']);
      return {
        cachedAt: Date.now(),
        events: events.map(e => ({
          id: e.id, pubkey: e.pubkey, npub: npubEncode(e.pubkey), created_at: e.created_at, kind: e.kind,
          content: e.content, tags: e.tags.filter(t => keep.has(t[0])).slice(0, 30),
          nevent: neventEncode({ id: e.id, author: e.pubkey, kind: e.kind }),
          music: tagValues(e, 't').some(t => MUSIC_TAGS.includes(t.toLowerCase())),
          author: profiles.get(e.pubkey) ?? null,
        })),
      };
    });
  }

  async function nip05Lookup(name: unknown): Promise<{ names: Record<string, string>; relays?: Record<string, string[]> }> {
    const n = normalizeNip05Name(name);
    if (!n) return { names: {} };
    const rec = await d.store.get(`nostr_names/${n}`);
    if (!rec?.pubkey || !HEX64.test(rec.pubkey)) return { names: {} };
    const acct = await accountOf(String(rec.uid));
    if (!acct || acct.pubkey !== rec.pubkey || acct.nip05Name !== n) return { names: {} };
    return { names: { [n]: rec.pubkey }, relays: { [rec.pubkey]: sanitizeRelays(acct.relays) } };
  }

  async function me(uid: string) {
    const { reason } = await eligibility(uid);
    const acct = reason ? null : await accountOf(uid);
    return { eligible: !reason, reason, account: publicAccount(acct), defaultRelays: DEFAULT_RELAYS, nip05Domain: d.nip05Domain };
  }

  return {
    deps: d, me, linkChallenge, link, unlink, updateSettings, generateKey, exportKey, deleteKey,
    prepare, publishSigned, publishRef, autoPublishPost, setOrgOptIn,
    publicUser, zapPrepare, zapInvoice, zapTotals, publicFeed, nip05Lookup,
  };
}
export type NostrService = ReturnType<typeof createNostrService>;

export function createNostr(partial: Partial<NostrDeps> = {}) {
  const service = createNostrService(partial);
  const d = service.deps;
  const router = Router();
  router.use(express.json({ limit: '64kb' }));

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
    try { res.json(await fn(req, res)); }
    catch (e: any) {
      const status = e instanceof HttpError ? e.status : 502;
      if (!(e instanceof HttpError)) console.error('[nostr]', req.method, req.path, e?.message || e);
      res.status(status).json({ error: e instanceof HttpError ? e.message : String(e?.message || 'Nostr request failed').slice(0, 200) });
    }
  };
  const authed = (fn: (uid: string, req: Request) => Promise<unknown>): RequestHandler => wrap(async (req) => {
    const h = req.headers.authorization;
    const uid = h?.startsWith('Bearer ') ? await d.verifyIdToken(h.slice(7)) : null;
    if (!uid) throw bad('Sign in first.', 401);
    return fn(uid, req);
  });

  // public
  router.get('/public/feed', wrap(async (req) => service.publicFeed((['music', 'notes', 'all'].includes(String(req.query.mode)) ? req.query.mode : 'all') as any)));
  router.get('/public/user/:uid', wrap(async (req) => { if (!SAFE_ID.test(String(req.params.uid))) throw bad('bad uid'); return service.publicUser(String(req.params.uid)); }));
  router.get('/public/zaps', wrap(async (req) => service.zapTotals(req.query)));
  router.post('/zap/prepare', wrap(async (req) => service.zapPrepare(req.body)));
  router.post('/zap/invoice', wrap(async (req) => service.zapInvoice(req.body)));

  // owner
  router.get('/me', authed((uid) => service.me(uid)));
  router.post('/link/challenge', authed((uid) => service.linkChallenge(uid)));
  router.post('/link', authed((uid, req) => service.link(uid, req.body)));
  router.post('/unlink', authed((uid) => service.unlink(uid)));
  router.put('/settings', authed((uid, req) => service.updateSettings(uid, req.body)));
  router.post('/key/generate', authed((uid, req) => service.generateKey(uid, req.body)));
  router.post('/key/export', authed((uid, req) => service.exportKey(uid, req.body)));
  router.delete('/key', authed((uid) => service.deleteKey(uid)));
  router.post('/prepare', authed((uid, req) => service.prepare(uid, req.body)));
  router.post('/publish', authed((uid, req) => service.publishSigned(uid, req.body)));
  router.post('/publish/post', authed((uid, req) => service.publishRef(uid, { type: 'post', postId: req.body?.postId })));
  router.post('/publish/track', authed((uid, req) => service.publishRef(uid, { type: 'track', albumId: req.body?.albumId, trackId: req.body?.trackId })));
  router.post('/org/:orgId/opt-in', authed((uid, req) => service.setOrgOptIn(uid, String(req.params.orgId), req.body?.enabled === true)));

  /** GET /.well-known/nostr.json?name=<name> (NIP-05). */
  const nip05: RequestHandler = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    try { res.json(await service.nip05Lookup(req.query.name)); } catch { res.json({ names: {} }); }
  };
  return { router, nip05, service };
}

export const createNostrRouter = (deps: Partial<NostrDeps> = {}) => createNostr(deps).router;
export const createNip05Handler = (deps: Partial<NostrDeps> = {}) => createNostr(deps).nip05;
