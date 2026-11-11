// Nostr: crypto, NIP-19, policy, relay client, zaps, and the full owner flow — no network (fake relay + fake LNURL).
// Run: npx tsx --test tests/nostr.test.ts
process.env.ENCRYPTION_KEY ||= 'ab'.repeat(32);
process.env.NOSTR_TICKET_SECRET ||= 'test-ticket-secret-0123456789';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { schnorrSign, schnorrVerify, getPublicKey } from '../services/nostr/schnorr';
import { npubEncode, nsecEncode, nip19Decode, neventEncode, naddrEncode, nprofileEncode, normalizePubkey } from '../services/nostr/bech32';
import { finalizeEvent, verifyEvent, isSensitive, KIND, nowSec, type NostrEvent } from '../services/nostr/event';
import { RelayPool, sanitizeRelays, type SocketLike, type Filter } from '../services/nostr/relay';
import { bolt11AmountMsats, parseLud16, sumZapReceipts, validateZapRequest, buildZapRequestTemplate } from '../services/nostr/zap';
import { postToNote, trackToNote, userIneligibleReason, orgIneligibleReason } from '../services/nostr/policy';
import { memoryStore } from '../services/nostr/store';
import { createNostr } from '../routes/nostr';

// ── fake relay network ────────────────────────────────────────────────────────
function matches(e: NostrEvent, f: Filter): boolean {
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.since && e.created_at < f.since) return false;
  for (const [k, v] of Object.entries(f)) {
    if (k.startsWith('#') && Array.isArray(v) && !e.tags.some(t => t[0] === k.slice(1) && v.includes(t[1]))) return false;
  }
  return true;
}
function fakeNetwork(opts: { down?: string[]; reject?: string[] } = {}) {
  const events = new Map<string, NostrEvent>();
  const sent: { relay: string; msg: any }[] = [];
  const factory = (url: string): SocketLike => {
    const s: SocketLike & { readyState: number } = {
      readyState: 0, onopen: null, onmessage: null, onerror: null, onclose: null,
      send(data: string) {
        const msg = JSON.parse(data); sent.push({ relay: url, msg });
        const reply = (m: unknown) => setTimeout(() => s.onmessage?.({ data: JSON.stringify(m) }), 0);
        if (msg[0] === 'EVENT') {
          if (opts.reject?.includes(url)) return reply(['OK', msg[1].id, false, 'blocked: test']);
          if (!verifyEvent(msg[1])) return reply(['OK', msg[1].id, false, 'invalid: bad signature']);
          events.set(msg[1].id, msg[1]); reply(['OK', msg[1].id, true, '']);
        } else if (msg[0] === 'REQ') {
          const [, sub, ...filters] = msg;
          for (const e of events.values()) if (filters.some((f: Filter) => matches(e, f))) reply(['EVENT', sub, e]);
          reply(['EOSE', sub]);
        }
      },
      close() { s.readyState = 3; },
    };
    setTimeout(() => {
      if (opts.down?.includes(url)) { s.onerror?.({}); return; }
      s.readyState = 1; s.onopen?.({});
    }, 0);
    return s;
  };
  return { events, sent, factory, pool: new RelayPool(factory) };
}

const SK_A = '0000000000000000000000000000000000000000000000000000000000000003';
const SK_B = 'b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef';
const SK_PROVIDER = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';

// ── crypto ────────────────────────────────────────────────────────────────────
test('BIP-340 official vectors', () => {
  const zero = '00'.repeat(32);
  assert.equal(getPublicKey(SK_A), 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
  assert.equal(schnorrSign(zero, SK_A, zero).toUpperCase(),
    'E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0');
  // vector 1
  assert.equal(getPublicKey(SK_B), 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659');
  const sig1 = schnorrSign('243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89', SK_B, '0000000000000000000000000000000000000000000000000000000000000001');
  assert.equal(sig1.toUpperCase(), '6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A');
  assert.ok(schnorrVerify(sig1, '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89', getPublicKey(SK_B)));
  // vector 5: public key not on the curve
  assert.equal(schnorrVerify('6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E17776969E89B4C5564D00349106B8497785DD7D1D713A8AE82B32FA79D5F7FC407D39B'.toLowerCase(),
    '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89', 'eefdea4cdb677750a420fee807eacf21eb9898ae79b9768766e4faa04a2d4a34'), false);
  // tamper
  const flipped = sig1.slice(0, -1) + (sig1.endsWith('a') ? 'b' : 'a');
  assert.equal(schnorrVerify(flipped, '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89', getPublicKey(SK_B)), false);
});

test('cross-check against @noble/curves when it is installed', async (t) => {
  let noble: any;
  try { noble = await import('@noble/curves/secp256k1' as string); } catch { return t.skip('@noble/curves not installed'); }
  for (let i = 0; i < 5; i++) {
    const sk = (i + 7).toString(16).padStart(64, 'c');
    const msg = (i * 1234567).toString(16).padStart(64, '0');
    const ours = schnorrSign(msg, sk);
    assert.ok(noble.schnorr.verify(ours, msg, getPublicKey(sk)));
    const theirs = Buffer.from(noble.schnorr.sign(msg, sk)).toString('hex');
    assert.ok(schnorrVerify(theirs, msg, getPublicKey(sk)));
  }
});

test('NIP-19 encodings (spec examples + round trips)', () => {
  assert.equal(npubEncode('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'), 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6');
  assert.equal(nsecEncode('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa'), 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5');
  assert.deepEqual(nip19Decode('npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'), { type: 'npub', data: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d' });
  const pk = getPublicKey(SK_A);
  const ne = nip19Decode(neventEncode({ id: 'ab'.repeat(32), relays: ['wss://nos.lol'], author: pk, kind: 1 }));
  assert.deepEqual(ne, { type: 'nevent', data: { id: 'ab'.repeat(32), relays: ['wss://nos.lol'], author: pk, kind: 1 } });
  const na = nip19Decode(naddrEncode({ identifier: 'my-track', pubkey: pk, kind: 30023, relays: [] }));
  assert.deepEqual(na, { type: 'naddr', data: { identifier: 'my-track', pubkey: pk, kind: 30023, relays: [] } });
  assert.equal(normalizePubkey(nprofileEncode({ pubkey: pk, relays: ['wss://relay.damus.io'] })), pk);
  assert.equal(normalizePubkey('nostr:' + npubEncode(pk)), pk);
  assert.equal(normalizePubkey('npub1garbage'), null);
});

test('events: sign, verify, tamper, sensitivity', () => {
  const e = finalizeEvent({ kind: 1, created_at: 1700000000, tags: [['t', 'music']], content: 'hello "world"\n ' }, SK_A);
  assert.ok(verifyEvent(e));
  assert.equal(verifyEvent({ ...e, content: 'changed' }), false);
  assert.equal(verifyEvent({ ...e, tags: [] }), false);
  assert.ok(isSensitive({ tags: [['content-warning', 'x']], content: '' }));
  assert.ok(isSensitive({ tags: [['t', 'NSFW']], content: '' }));
  assert.ok(isSensitive({ tags: [], content: 'look #nsfw' }));
  assert.ok(!isSensitive({ tags: [['t', 'music']], content: 'new track' }));
});

test('relay list sanitizing', () => {
  assert.deepEqual(sanitizeRelays(['wss://nos.lol/', 'ws://insecure.example', 'wss://127.0.0.1', 'wss://localhost', 'wss://NOS.lol', 'https://x.com']), ['wss://nos.lol']);
  assert.equal(sanitizeRelays([]).length, 4);
});

// ── policy ────────────────────────────────────────────────────────────────────
const publicPost = (o: Record<string, any> = {}) => ({ authorId: 'u1', authorName: 'Ana', text: 'New song out #indie', isPublic: true, media: [{ type: 'PHOTO', url: 'https://cdn.plajah.com/a.jpg', alt: 'cover' }], ...o });

test('policy: who may use Nostr', () => {
  assert.match(userIneligibleReason({ accountType: 'CHILD' })!, /under-18/);
  assert.match(userIneligibleReason({ isChild: true })!, /under-18/);
  assert.match(userIneligibleReason({ birthYear: new Date().getFullYear() - 12 })!, /under-18/);
  assert.equal(userIneligibleReason({ accountType: 'ARTIST', birthYear: 1990 }), null);
  assert.ok(orgIneligibleReason({ orgType: 'CHURCH' }, false));
  assert.ok(orgIneligibleReason({ orgType: 'NONPROFIT' }, false));
  assert.equal(orgIneligibleReason({ orgType: 'CHURCH' }, true), null);
  assert.equal(orgIneligibleReason({ orgType: 'BRAND' }, false), null);
});

test('policy: posts — private/locked/internal stay home; public go out with media, link back, CW', () => {
  assert.ok(postToNote(publicPost({ isPublic: false }), 'p1').blocked);
  assert.ok(postToNote(publicPost({ sanctuaryGate: { id: 's' } }), 'p1').blocked);
  assert.ok(postToNote(publicPost({ exclusive: true }), 'p1').blocked);
  assert.ok(postToNote(publicPost({ orgAudience: 'INTERNAL' }), 'p1').blocked);
  const ok = postToNote(publicPost({ contentLabels: ['GRAPHIC_VIOLENCE'] }), 'p1');
  assert.ok(ok.template);
  assert.match(ok.template!.content, /https:\/\/cdn\.plajah\.com\/a\.jpg/);
  assert.match(ok.template!.content, /share\?type=feed&id=p1/);
  assert.ok(ok.template!.tags.some(t => t[0] === 'imeta' && t[1] === 'url https://cdn.plajah.com/a.jpg' && t.includes('m image/jpeg')));
  assert.ok(ok.template!.tags.some(t => t[0] === 't' && t[1] === 'indie'));
  assert.ok(ok.template!.tags.some(t => t[0] === 'content-warning'));
});

test('policy: tracks — paywalled/private/unreleased blocked; priced = link only; free carries audio imeta', () => {
  const album = { ownerId: 'u1', title: 'LP', artist: 'Ana', coverImage: 'https://cdn.plajah.com/c.webp', isPublic: true };
  const track = { id: 't1', title: 'Song', url: 'https://cdn.plajah.com/s.mp3' };
  assert.ok(trackToNote({ ...album, isPaywalled: true }, track, 'a1').blocked);
  assert.ok(trackToNote({ ...album, previewOnly: true }, track, 'a1').blocked);
  assert.ok(trackToNote(album, { ...track, isExclusive: true }, 'a1').blocked);
  assert.ok(trackToNote({ ...album, isPrivate: true }, track, 'a1').blocked);
  assert.ok(trackToNote({ ...album, releaseDate: Date.now() + 86400000 }, track, 'a1').blocked);
  const priced = trackToNote({ ...album, price: 9 }, track, 'a1').template!;
  assert.doesNotMatch(priced.content, /s\.mp3/);
  const free = trackToNote(album, track, 'a1').template!;
  assert.equal(free.kind, 1);
  assert.match(free.content, /s\.mp3/);
  assert.ok(free.tags.some(t => t[0] === 'imeta' && t.includes('m audio/mpeg')));
  assert.ok(free.tags.some(t => t[0] === 't' && t[1] === 'music'));
});

// ── zaps ──────────────────────────────────────────────────────────────────────
test('bolt11 amounts and lud16 parsing', () => {
  assert.equal(bolt11AmountMsats('lnbc210n1pjqqqqq'), 21000);
  assert.equal(bolt11AmountMsats('lnbc2500u1pvjluez'), 250_000_000);
  assert.equal(bolt11AmountMsats('lnbc1m1pxyz'), 100_000_000);
  assert.equal(bolt11AmountMsats('lnbc10p1pxyz'), 1);
  assert.equal(bolt11AmountMsats('lnbc1pvjluez'), null);
  assert.equal(bolt11AmountMsats('LIGHTNING:LNBC210N1PJQQQQQ'), 21000);
  assert.deepEqual(parseLud16('Ana@Getalby.com'), { name: 'ana', domain: 'getalby.com', url: 'https://getalby.com/.well-known/lnurlp/ana' });
  assert.equal(parseLud16('not an address'), null);
});

function zapReceipt(zr: NostrEvent, msatsInInvoice: number, signer = SK_PROVIDER): NostrEvent {
  const n = msatsInInvoice / 100;
  return finalizeEvent({ kind: KIND.ZAP_RECEIPT, created_at: nowSec(), content: '', tags: [
    ['p', zr.tags.find(t => t[0] === 'p')![1]], ...zr.tags.filter(t => t[0] === 'e'), ['bolt11', `lnbc${n}n1pjqqqqq`], ['description', JSON.stringify(zr)],
  ] }, signer);
}

test('zap request validation and receipt totals (forged receipts ignored)', () => {
  const recipient = getPublicKey(SK_A);
  const tpl = buildZapRequestTemplate({ recipientPubkey: recipient, amountMsats: 21000, relays: ['wss://nos.lol'], lnurl: 'lnurl1x', eventId: 'cd'.repeat(32) });
  const zr = finalizeEvent(tpl, SK_B);
  assert.equal(validateZapRequest(zr, { recipientPubkey: recipient, amountMsats: 21000 }), null);
  assert.match(validateZapRequest(zr, { recipientPubkey: recipient, amountMsats: 5000 })!, /amount/);
  assert.match(validateZapRequest({ ...zr, content: 'x' }, { recipientPubkey: recipient, amountMsats: 21000 })!, /signature/);
  const good = zapReceipt(zr, 21000);
  const forged = zapReceipt(zr, 21000, SK_B);
  const mismatched = zapReceipt(zr, 99000);
  const t = sumZapReceipts([good, forged, mismatched, good], { providerPubkeys: [getPublicKey(SK_PROVIDER)] });
  assert.equal(t.count, 1);
  assert.equal(t.msats, 21000);
  assert.deepEqual(t.byEvent['cd'.repeat(32)], { count: 1, msats: 21000 });
});

// ── relay client ──────────────────────────────────────────────────────────────
test('relay pool: publish OK/reject/down, query dedupes and verifies', async () => {
  const net = fakeNetwork({ down: ['wss://down.example'], reject: ['wss://picky.example'] });
  const e = finalizeEvent({ kind: 1, created_at: nowSec(), tags: [['t', 'music']], content: 'hi' }, SK_A);
  const res = await net.pool.publish(e, ['wss://nos.lol', 'wss://relay.damus.io', 'wss://down.example', 'wss://picky.example'], 500);
  assert.deepEqual(res.map(r => r.ok), [true, true, false, false]);
  assert.match(res[3].message, /blocked/);
  const got = await net.pool.query([{ kinds: [1], '#t': ['music'] }], ['wss://nos.lol', 'wss://relay.damus.io'], { timeoutMs: 500 });
  assert.equal(got.length, 1);
  const timeout = await new RelayPool(() => ({ readyState: 0, send() {}, close() {}, onopen: null, onmessage: null, onerror: null, onclose: null })).publish(e, ['wss://slow.example'], 30);
  assert.deepEqual(timeout, [{ relay: 'wss://slow.example', ok: false, message: 'timeout' }]);
});

// ── full owner + fan flow through the service ────────────────────────────────
function setup() {
  const store = memoryStore();
  const net = fakeNetwork();
  const users: Record<string, any> = {
    u1: { displayName: 'Ana', bio: 'Singer', accountType: 'ARTIST', photoURL: 'https://cdn.plajah.com/ana.jpg' },
    u2: { displayName: 'Ben', accountType: 'FAN' },
    kid: { displayName: 'Kid', accountType: 'CHILD' },
  };
  const providerPub = getPublicKey(SK_PROVIDER);
  const fetchLog: string[] = [];
  const fakeFetch = async (url: string) => {
    fetchLog.push(url);
    const u = new URL(url);
    let body: any;
    if (u.pathname === '/.well-known/lnurlp/ana') body = { tag: 'payRequest', callback: 'https://wallet.example/cb/ana', minSendable: 1000, maxSendable: 100_000_000, metadata: '[]', allowsNostr: true, nostrPubkey: providerPub, commentAllowed: 100 };
    else if (u.pathname === '/cb/ana') body = { pr: `lnbc${Number(u.searchParams.get('amount')) / 100}n1pjqqqqq`, routes: [] };
    else return { ok: false, status: 404, json: async () => ({}), text: async () => '{"status":"ERROR","reason":"nope"}' };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const nostr = createNostr({
    store, pool: net.pool, verifyIdToken: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
    getUser: async (uid) => users[uid] ?? null, fetch: fakeFetch as any, hostCheck: async () => {}, nip05Domain: 'plajah.com',
  });
  return { store, net, nostr, svc: nostr.service, fetchLog, providerPub };
}

async function linkWithKey(svc: any, uid: string, sk: string, extra: Record<string, unknown> = {}) {
  const ch = await svc.linkChallenge(uid);
  const signed = finalizeEvent(ch.template, sk);
  return svc.link(uid, { ticket: ch.ticket, event: signed, method: 'nip07', ...extra });
}

test('flow: opt-in link via signed challenge, NIP-05, settings, children refused', async () => {
  const { svc, store } = setup();
  assert.equal((await svc.me('u1')).account, null); // off by default
  const acct = await linkWithKey(svc, 'u1', SK_A, { nip05Name: 'Ana', lud16: 'ana@getalby.com' });
  assert.equal(acct.pubkey, getPublicKey(SK_A));
  assert.equal(acct.nip05, 'ana@plajah.com');
  assert.equal(acct.autoPublish, false);
  assert.deepEqual(await svc.nip05Lookup('ana'), { names: { ana: getPublicKey(SK_A) }, relays: { [getPublicKey(SK_A)]: acct.relays } });
  assert.deepEqual(await svc.nip05Lookup('nobody'), { names: {} });

  // wrong challenge / replayed ticket for someone else / other key owner
  const ch = await svc.linkChallenge('u2');
  const wrong = finalizeEvent({ ...ch.template, tags: [['challenge', 'other']] }, SK_B);
  await assert.rejects(svc.link('u2', { ticket: ch.ticket, event: wrong }), /challenge/);
  await assert.rejects(svc.link('u1', { ticket: ch.ticket, event: finalizeEvent(ch.template, SK_B) }), /expired/);
  await assert.rejects(linkWithKey(svc, 'u2', SK_A), /another Plajah account/);
  await assert.rejects(linkWithKey(svc, 'u2', SK_B, { nip05Name: 'ana' }), /taken/);
  await assert.rejects(svc.linkChallenge('kid'), /under-18/);
  assert.equal((await svc.me('kid')).eligible, false);

  const s = await svc.updateSettings('u1', { autoPublish: true, relays: ['wss://nos.lol', 'ws://bad'], nip05Name: 'ana.music' });
  assert.deepEqual(s.relays, ['wss://nos.lol']);
  assert.equal(s.autoPublish, true);
  assert.deepEqual(await svc.nip05Lookup('ana'), { names: {} });
  assert.equal((await svc.nip05Lookup('ana.music')).names['ana.music'], getPublicKey(SK_A));

  await svc.unlink('u1');
  assert.equal((await svc.me('u1')).account, null);
  assert.deepEqual(await svc.nip05Lookup('ana.music'), { names: {} });
  assert.equal(store.data.has(`nostr_pubkeys/${getPublicKey(SK_A)}`), false);
});

test('flow: browser-signed publish of a post, mismatch rejected, delete (kind 5)', async () => {
  const { svc, store, net } = setup();
  await store.set('posts/p1', publicPost());
  await store.set('posts/p2', publicPost({ isPublic: false }));
  await store.set('posts/p3', publicPost({ authorIsOrg: true, authorOrgId: 'church1' }));
  await store.set('organizations/church1', { orgType: 'CHURCH', ownerId: 'u1', admins: ['u1'] });
  await assert.rejects(svc.prepare('u1', { type: 'post', postId: 'p1' }), /Link a Nostr key/);
  await linkWithKey(svc, 'u1', SK_A, { relays: ['wss://nos.lol', 'wss://relay.damus.io'] });

  assert.ok((await svc.prepare('u1', { type: 'post', postId: 'p2' })).blocked);
  assert.match((await svc.prepare('u1', { type: 'post', postId: 'p3' })).blocked!, /organization/);
  await assert.rejects(svc.setOrgOptIn('u2', 'church1', true), /admins/);
  await svc.setOrgOptIn('u1', 'church1', true);
  assert.ok((await svc.prepare('u1', { type: 'post', postId: 'p3' })).template);

  const prep = await svc.prepare('u1', { type: 'post', postId: 'p1' });
  // a signer that alters the content is refused
  const altered = finalizeEvent({ ...prep.template!, content: 'something else' }, SK_A);
  await assert.rejects(svc.publishSigned('u1', { ticket: prep.ticket, event: altered }), /does not match/);
  await assert.rejects(svc.publishSigned('u1', { ticket: prep.ticket, event: finalizeEvent(prep.template!, SK_B) }), /different key/);
  const signed = finalizeEvent(prep.template!, SK_A);
  const pub = await svc.publishSigned('u1', { ticket: prep.ticket, event: signed });
  assert.equal(pub.ok, true);
  assert.equal(pub.results.length, 2);
  assert.ok(net.events.has(signed.id));
  assert.match(pub.note, /^nevent1/);
  const rec = await store.get('nostr_published/u1__post_p1');
  assert.deepEqual(rec!.eventIds, [signed.id]);

  // no server key → publishRef hands back a template for the browser signer
  const r = await svc.publishRef('u1', { type: 'post', postId: 'p1' });
  assert.equal(r.needsSigner, true);
  assert.equal((await svc.autoPublishPost('u1', 'p1')).skipped, 'auto-publish off');

  const del = await svc.prepare('u1', { type: 'delete', refType: 'post', refId: 'p1' });
  assert.equal(del.template!.kind, 5);
  assert.deepEqual(del.template!.tags, [['e', signed.id]]);
  const dsigned = finalizeEvent(del.template!, SK_A);
  assert.equal((await svc.publishSigned('u1', { ticket: del.ticket, event: dsigned })).ok, true);
  assert.equal(await store.get('nostr_published/u1__post_p1'), null);
});

test('flow: explicit server-held key — encrypted, exportable, deletable, auto-publish', async () => {
  const { svc, store, net } = setup();
  await assert.rejects(svc.generateKey('u2', {}), /Confirm/);
  const acct = await svc.generateKey('u2', { confirm: true });
  assert.equal(acct.method, 'server');
  const k = await store.get('nostr_keys/u2');
  assert.ok(k!.enc && !String(k!.enc).includes(acct.pubkey));
  assert.equal(JSON.stringify(await store.get('nostr_accounts/u2')).includes(String(k!.enc)), false);
  const ex = await svc.exportKey('u2', { confirm: true });
  assert.equal(nip19Decode(ex.nsec).type, 'nsec');
  assert.equal(getPublicKey(nip19Decode(ex.nsec).data as string), acct.pubkey);

  await store.set('posts/q1', publicPost({ authorId: 'u2' }));
  await svc.updateSettings('u2', { autoPublish: true });
  const auto = await svc.autoPublishPost('u2', 'q1');
  assert.ok((auto.result as any)?.ok);
  assert.ok([...net.events.values()].some(e => e.pubkey === acct.pubkey && e.kind === 1));

  const prof = await svc.publishRef('u2', { type: 'profile' });
  assert.equal((prof as any).ok, true);
  const meta = [...net.events.values()].find(e => e.kind === 0)!;
  assert.equal(JSON.parse(meta.content).name, 'Ben');

  await svc.deleteKey('u2');
  assert.equal(await store.get('nostr_keys/u2'), null);
  assert.equal((await svc.me('u2')).account, null);
});

test('flow: zap goes to the creator\'s own LNURL server; Plajah only relays', async () => {
  const { svc, fetchLog, net, providerPub } = setup();
  await assert.rejects(svc.zapPrepare({ recipientUid: 'u1', amountSats: 21 }), /not set up/);
  await linkWithKey(svc, 'u1', SK_A, { lud16: 'ana@getalby.com', relays: ['wss://nos.lol'] });
  const prep = await svc.zapPrepare({ recipientUid: 'u1', amountSats: 21, eventId: 'cd'.repeat(32), comment: 'love it' });
  assert.equal(prep.allowsNostr, true);
  assert.equal(prep.zapRequest!.kind, 9734);
  assert.ok(prep.zapRequest!.tags.some((t: string[]) => t[0] === 'amount' && t[1] === '21000'));

  const zr = finalizeEvent(prep.zapRequest!, SK_B); // the FAN signs
  await assert.rejects(svc.zapInvoice({ recipientUid: 'u1', amountSats: 50, zapRequest: zr }), /amount/);
  const inv = await svc.zapInvoice({ recipientUid: 'u1', amountSats: 21, zapRequest: zr });
  assert.equal(inv.pr, 'lnbc210n1pjqqqqq');
  assert.equal(inv.zap, true);
  const cb = new URL(fetchLog.find(u => u.startsWith('https://wallet.example/cb/ana'))!);
  assert.equal(cb.searchParams.get('amount'), '21000');
  assert.equal(JSON.parse(cb.searchParams.get('nostr')!).id, zr.id);
  assert.ok(fetchLog.every(u => !u.includes('plajah')), 'no Plajah wallet anywhere in the path');

  // the provider publishes a receipt; totals verify it against the LNURL's nostrPubkey
  const receipt = zapReceipt(zr, 21000);
  assert.equal(receipt.pubkey, providerPub);
  await net.pool.publish(receipt, ['wss://nos.lol']);
  await net.pool.publish(zapReceipt(zr, 21000, SK_B), ['wss://nos.lol']); // forged
  const totals = await svc.zapTotals({ e: 'cd'.repeat(32), uid: 'u1' });
  assert.equal(totals.count, 1);
  assert.equal(totals.sats, 21);
  assert.equal(totals.verified, true);
});

test('public feed: music + notes, NSFW and replies dropped, author profiles attached', async () => {
  const { svc, net } = setup();
  const relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://relay.wavlake.com'];
  const ok = finalizeEvent({ kind: 1, created_at: nowSec() - 60, tags: [['t', 'music']], content: 'new single' }, SK_A);
  const nsfw = finalizeEvent({ kind: 1, created_at: nowSec() - 50, tags: [['t', 'music'], ['content-warning', 'x']], content: 'hidden' }, SK_A);
  const reply = finalizeEvent({ kind: 1, created_at: nowSec() - 40, tags: [['t', 'music'], ['e', 'ab'.repeat(32)]], content: 'a reply' }, SK_A);
  const meta = finalizeEvent({ kind: 0, created_at: nowSec() - 100, tags: [], content: JSON.stringify({ name: 'Ana', picture: 'https://x.example/p.png', lud16: 'ana@getalby.com' }) }, SK_A);
  for (const e of [ok, nsfw, reply, meta]) await net.pool.publish(e, relays.slice(0, 1));
  const feed = await svc.publicFeed('music');
  assert.deepEqual(feed.events.map((e: any) => e.id), [ok.id]);
  assert.equal(feed.events[0].author.name, 'Ana');
  assert.equal(feed.events[0].music, true);
  const again = await svc.publicFeed('music');
  assert.equal(again.cachedAt, feed.cachedAt); // cached
});

test('HTTP: bearer required for owner routes; NIP-05 served with CORS', async () => {
  const { nostr } = setup();
  const app = express();
  app.use('/api/nostr', nostr.router);
  app.get('/.well-known/nostr.json', nostr.nip05);
  const server = app.listen(0);
  try {
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/nostr/me`)).status, 401);
    const me = await fetch(`${base}/api/nostr/me`, { headers: { authorization: 'Bearer tok-u1' } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).eligible, true);
    const ch = await (await fetch(`${base}/api/nostr/link/challenge`, { method: 'POST', headers: { authorization: 'Bearer tok-u1' } })).json();
    const linked = await fetch(`${base}/api/nostr/link`, {
      method: 'POST', headers: { authorization: 'Bearer tok-u1', 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: ch.ticket, event: finalizeEvent(ch.template, SK_A), nip05Name: 'ana' }),
    });
    assert.equal(linked.status, 200);
    const wk = await fetch(`${base}/.well-known/nostr.json?name=ana`);
    assert.equal(wk.headers.get('access-control-allow-origin'), '*');
    assert.equal((await wk.json()).names.ana, getPublicKey(SK_A));
    const kid = await fetch(`${base}/api/nostr/link/challenge`, { method: 'POST', headers: { authorization: 'Bearer tok-kid' } });
    assert.equal(kid.status, 403);
  } finally { server.close(); }
});
