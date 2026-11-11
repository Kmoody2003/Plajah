// Open publishing: Reello videos → the creator's PeerTube channel, Chora tracks/albums → the creator's Funkwhale pod.
// Plajah stays home: Mux playback, comments and the master copy never move; the networks get copies, and the returned
// URL + remote id are written onto the Plajah item (`openPublishLinks`) so the UI can link out and show a view count.
//
// Mount (server.ts):
//   import { createOpenPublishRouter } from './routes/openPublish';
//   app.use('/api/open-publish', apiLimiter, express.json({ limit: '64kb' }), createOpenPublishRouter());
//
// Collections (server-only, no client rules; the Admin REST helpers bypass rules, so every handler authorises itself):
//   openPublishAccounts/{autoId}  { uid, network, instance, username, displayName, status, credsEnc, … } tokens AES-GCM encrypted
//   openPublishJobs/{autoId}      { uid, network, accountId, kind, itemId, status, progress, items[], error, … }
// Passwords are never stored: PeerTube's goes once to the creator's own server for a token; Funkwhale uses an OAuth code.
//
// Long work (resumable video upload, audio uploads) runs in-process after the response (deps.defer). Remote processing
// (PeerTube import/transcode, Funkwhale import) is advanced by GET /jobs/:id polling, so it needs no worker.

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsCreate, fsQuery, fsDelete, fsGetUser,
} from '../services/firebaseAdminRest';
import { encryptCreds, decryptCreds } from '../services/fediverse/auth';
import { isFutureRelease, releaseMs } from '../services/releases/visibility';
import { trackClearance, isSongTrack } from '../services/rights/trackClearance';
import {
  type NetCtx, defaultResolve, OpenPublishError, instanceOrigin, assertPublicHost,
  peertubeLogin, peertubeRefresh, peertubeRevoke, peertubeMe, findMuxMp4, peertubeImportUrl, peertubeUploadFromUrl,
  peertubeVideoStatus, peertubeImportFailure, peertubeDeleteVideo, peertubeWatchUrl,
  type PeerTubeCreds, type PeerTubePrivacy,
} from '../services/peertube/publish';
import {
  funkwhaleRegisterApp, funkwhaleAuthorizeUrl, funkwhaleExchangeCode, funkwhaleRefresh, funkwhaleMe, funkwhaleTargets,
  funkwhaleCreateAlbum, funkwhaleUpload, funkwhaleUploadStatus, funkwhaleDeleteUpload, funkwhaleTrackUrl,
  type FunkwhaleCreds,
} from '../services/funkwhale/api';

export const ACCOUNTS = 'openPublishAccounts';
export const JOBS = 'openPublishJobs';
const SAFE_ID = /^[A-Za-z0-9_-]{4,128}$/;

export type Network = 'peertube' | 'funkwhale';

// ─── Deps ───────────────────────────────────────────────────────────────────

export interface OpenPublishStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<boolean>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  create(collection: string, data: Record<string, unknown>): Promise<string | null>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
  delete(path: string): Promise<boolean>;
}

export interface OpenPublishDeps {
  store: OpenPublishStore;
  verify: (idToken: string) => Promise<string | null>;
  getUser: (uid: string) => Promise<Record<string, any> | null>;
  net: NetCtx;
  encrypt: (o: object) => string;
  decrypt: (s: string) => any;
  defer: (fn: () => Promise<void>) => void;
  appBase: string;
}

export function defaultDeps(): OpenPublishDeps {
  return {
    store: { get: fsGet, set: fsSet, patch: fsPatch, create: fsCreate, query: (c, f, l) => fsQuery(c, f, l), delete: fsDelete },
    verify: verifyIdToken,
    getUser: fsGetUser,
    net: { fetch: (u, i) => fetch(u, i), resolve: defaultResolve, now: Date.now },
    encrypt: (o) => encryptCreds(o as any),
    decrypt: (s) => decryptCreds(s),
    defer: (fn) => { setImmediate(() => { fn().catch(e => console.warn('[open-publish] job failed:', e?.message || e)); }); },
    appBase: (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, ''),
  };
}

const clean = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ─── Publish policy (pure) ──────────────────────────────────────────────────

export type BlockCode = 'private' | 'unreleased' | 'paywalled' | 'exclusive' | 'rights_held' | 'child_account' | 'no_source' | 'not_audio';
export interface Blocker { code: BlockCode; message: string; trackId?: string }

export const BLOCK_COPY: Record<BlockCode, string> = {
  private: 'Private or members-only items stay on Plajah.',
  unreleased: 'Drafts and scheduled releases can go out once they are released.',
  paywalled: 'Paid or paywalled work stays on Plajah, where you set the price.',
  exclusive: 'Exclusive or members-only content stays on Plajah.',
  rights_held: 'This is on a rights hold or its rights questions aren’t cleared.',
  child_account: 'Accounts for young people can’t publish to outside networks.',
  no_source: 'There’s no file to send yet.',
  not_audio: 'Only audio tracks can go to Funkwhale.',
};
const b = (code: BlockCode, trackId?: string): Blocker => ({ code, message: BLOCK_COPY[code], ...(trackId ? { trackId } : {}) });

/** Accounts for minors (flags, a guardian, or a birth year under 18) never publish outward. */
export function isMinorAccount(u: Record<string, any> | null | undefined, now = Date.now()): boolean {
  if (!u) return false;
  if (u.isChild === true || u.accountType === 'CHILD' || u.guardianUid) return true;
  const by = Number(u.birthYear);
  if (Number.isFinite(by) && by > 1900) return new Date(now).getUTCFullYear() - by < 18;
  return false;
}

const onHold = (d: Record<string, any>) => !!d.copyrightHold || d.moderationStatus === 'removed' || d.rightsHold === true;
const isPaid = (d: Record<string, any>) => Number(d.price) > 0 || d.isPaywalled === true || d.previewOnly === true;
const isExclusive = (d: Record<string, any>) => d.isExclusive === true || d.exclusive === true || d.membersOnly === true;
const notPublic = (d: Record<string, any>) =>
  d.isPrivate === true || d.isIntimateOnly === true ||
  (typeof d.visibility === 'string' && d.visibility.toUpperCase() !== 'PUBLIC') ||
  (typeof d.audience === 'string' && !['public', 'everyone'].includes(d.audience.toLowerCase()));
const unreleased = (d: Record<string, any>, now: number) =>
  d.isDraft === true || isFutureRelease(d, now) || (d.isPremiere === true && releaseMs(d.releaseDate) > now);

export function videoBlockers(v: Record<string, any>, owner: Record<string, any> | null, now = Date.now()): Blocker[] {
  const out: Blocker[] = [];
  if (isMinorAccount(owner, now)) out.push(b('child_account'));
  if (notPublic(v)) out.push(b('private'));
  if (unreleased(v, now)) out.push(b('unreleased'));
  if (isPaid(v)) out.push(b('paywalled'));
  if (isExclusive(v)) out.push(b('exclusive'));
  if (onHold(v)) out.push(b('rights_held'));
  if (!v.muxPlaybackId && !/^https:\/\//.test(String(v.url || ''))) out.push(b('no_source'));
  return out;
}

/** Album-level blockers stop everything; track blockers only exclude that track. */
export function albumBlockers(a: Record<string, any>, owner: Record<string, any> | null, now = Date.now()): { album: Blocker[]; tracks: Blocker[]; eligible: Record<string, any>[] } {
  const album: Blocker[] = [];
  if (isMinorAccount(owner, now)) album.push(b('child_account'));
  if (notPublic(a) || a.isPublic === false) album.push(b('private'));
  if (unreleased(a, now)) album.push(b('unreleased'));
  if (isPaid(a)) album.push(b('paywalled'));
  if (isExclusive(a)) album.push(b('exclusive'));
  if (onHold(a)) album.push(b('rights_held'));
  const tracks: Blocker[] = []; const eligible: Record<string, any>[] = [];
  for (const t of (Array.isArray(a.tracks) ? a.tracks : []) as Record<string, any>[]) {
    const id = String(t?.id || '');
    if (!id) continue;
    let blocked: Blocker | null = null;
    if (t.mediaKind === 'VIDEO') blocked = b('not_audio', id);
    else if (isPaid(t)) blocked = b('paywalled', id);
    else if (isExclusive(t)) blocked = b('exclusive', id);
    else if (onHold(t)) blocked = b('rights_held', id);
    // A copy on another network is distribution: songs need cleared or recorded rights, not "unanswered" or held.
    else if (isSongTrack(t as any) && !['cleared', 'declared'].includes(trackClearance(t as any))) blocked = b('rights_held', id);
    else if (!/^https:\/\//.test(String(t.url || ''))) blocked = b('no_source', id);
    if (blocked) tracks.push(blocked); else eligible.push(t);
  }
  return { album, tracks, eligible };
}

// ─── Links on the Plajah item ───────────────────────────────────────────────

export interface OpenPublishLink {
  id: string;
  network: Network;
  accountId: string;
  instance: string;
  remoteId: string;
  url: string;
  state: 'processing' | 'published' | 'failed';
  jobId: string;
  trackId?: string;
  createdAt: number;
}

const itemPath = (kind: 'video' | 'album', id: string) => `${kind === 'video' ? 'videos' : 'albums'}/${id}`;

async function upsertLink(d: OpenPublishDeps, kind: 'video' | 'album', itemId: string, link: OpenPublishLink): Promise<void> {
  const doc = (await d.store.get(itemPath(kind, itemId))) || {};
  const links: OpenPublishLink[] = Array.isArray(doc.openPublishLinks) ? doc.openPublishLinks : [];
  const next = links.filter(l => l.id !== link.id).concat([link]).slice(-50);
  await d.store.patch(itemPath(kind, itemId), { openPublishLinks: clean(next) });
}

async function removeLink(d: OpenPublishDeps, kind: 'video' | 'album', itemId: string, linkId: string): Promise<void> {
  const doc = (await d.store.get(itemPath(kind, itemId))) || {};
  const links: OpenPublishLink[] = Array.isArray(doc.openPublishLinks) ? doc.openPublishLinks : [];
  await d.store.patch(itemPath(kind, itemId), { openPublishLinks: clean(links.filter(l => l.id !== linkId)) });
}

// ─── Accounts + tokens ──────────────────────────────────────────────────────

export function publicAccount(id: string, a: Record<string, any>) {
  return { id, network: a.network, instance: a.instance, username: a.username || '', displayName: a.displayName || a.username || '', status: a.status, mode: a.mode || null, createdAt: a.createdAt };
}

async function loadAccount(d: OpenPublishDeps, uid: string, id: string, network?: Network): Promise<Record<string, any>> {
  if (!SAFE_ID.test(id)) throw new OpenPublishError('Unknown account.', 404, 'not_found');
  const a = await d.store.get(`${ACCOUNTS}/${id}`);
  if (!a || a.uid !== uid || (network && a.network !== network)) throw new OpenPublishError('Unknown account.', 404, 'not_found');
  return a;
}

/** A usable token for the account, refreshed (and saved) when within a minute of expiry. */
export async function freshToken(d: OpenPublishDeps, accountId: string, a: Record<string, any>, force = false): Promise<string> {
  if (a.status !== 'active' || !a.credsEnc) throw new OpenPublishError('Finish connecting this account first.', 409, 'not_connected');
  const now = d.net.now();
  if (a.network === 'peertube') {
    let c = d.decrypt(a.credsEnc) as PeerTubeCreds;
    if (force || c.expiresAt - 60_000 < now) {
      c = await peertubeRefresh(d.net, a.instance, c);
      a.credsEnc = d.encrypt(c);
      await d.store.patch(`${ACCOUNTS}/${accountId}`, { credsEnc: a.credsEnc, updatedAt: now });
    }
    return c.accessToken;
  }
  let c = d.decrypt(a.credsEnc) as FunkwhaleCreds;
  if (c.mode === 'oauth' && (force || (c.expiresAt && c.expiresAt - 60_000 < now))) {
    c = await funkwhaleRefresh(d.net, a.instance, c);
    a.credsEnc = d.encrypt(c);
    await d.store.patch(`${ACCOUNTS}/${accountId}`, { credsEnc: a.credsEnc, updatedAt: now });
  }
  return c.accessToken;
}

/** Run with a token; on an auth failure refresh once and retry. */
async function withToken<T>(d: OpenPublishDeps, accountId: string, a: Record<string, any>, fn: (token: string) => Promise<T>): Promise<T> {
  const t = await freshToken(d, accountId, a);
  try { return await fn(t); } catch (e: any) {
    if (e?.code !== 'auth') throw e;
    return fn(await freshToken(d, accountId, a, true));
  }
}

async function guardOwner(d: OpenPublishDeps, uid: string): Promise<Record<string, any> | null> {
  const owner = await d.getUser(uid);
  if (isMinorAccount(owner, d.net.now())) throw new OpenPublishError(BLOCK_COPY.child_account, 403, 'child_account');
  return owner;
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

export interface JobItem { trackId?: string; title: string; remoteId?: string; shortUUID?: string; url?: string; state: 'queued' | 'uploading' | 'processing' | 'published' | 'failed'; error?: string }

async function patchJob(d: OpenPublishDeps, jobId: string, data: Record<string, unknown>) {
  await d.store.patch(`${JOBS}/${jobId}`, clean({ ...data, updatedAt: d.net.now() }));
}

const linkId = (network: Network, accountId: string, remoteId: string) => `${network}_${accountId}_${remoteId}`.slice(0, 200);

export async function runPeerTubeJob(d: OpenPublishDeps, jobId: string): Promise<void> {
  const job = await d.store.get(`${JOBS}/${jobId}`);
  if (!job || job.status !== 'queued') return;
  const fail = (error: string) => patchJob(d, jobId, { status: 'failed', error, items: [{ ...job.items?.[0], state: 'failed', error }] });
  try {
    const a = await loadAccount(d, job.uid, job.accountId, 'peertube');
    const v = await d.store.get(`videos/${job.itemId}`);
    if (!v || v.ownerId !== job.uid) return void await fail('The video is gone.');
    const blockers = videoBlockers(v, await d.getUser(job.uid), d.net.now());
    if (blockers.length) return void await fail(blockers[0].message);
    await assertPublicHost(d.net, a.instance);
    await patchJob(d, jobId, { status: 'running', progress: { pct: 2, note: 'Finding the best file' } });

    const share = `${d.appBase}/share?type=video&id=${encodeURIComponent(job.itemId)}`;
    const meta = {
      channelId: Number(job.options.channelId),
      name: String(v.title || 'Untitled'),
      description: `${String(v.description || '').trim()}\n\nOriginally on Plajah: ${share}`.trim(),
      privacy: job.options.privacy as PeerTubePrivacy,
      tags: Array.isArray(v.tags) ? v.tags : [],
    };
    const mp4 = v.muxPlaybackId ? await findMuxMp4(d.net, String(v.muxPlaybackId)) : null;
    const direct = /^https:\/\//.test(String(v.url || '')) && !/\.m3u8(\?|$)/i.test(String(v.url)) && !/stream\.mux\.com\/[^/]+\.m3u8/.test(String(v.url)) ? String(v.url) : null;

    let ref; let method: 'import' | 'upload';
    if (mp4) {
      try {
        ref = await withToken(d, job.accountId, a, t => peertubeImportUrl(d.net, a.instance, t, meta, mp4));
        method = 'import';
      } catch (e: any) {
        if (e?.code !== 'import_disabled') throw e;
        await patchJob(d, jobId, { progress: { pct: 5, note: 'Server has imports off; uploading instead' } });
        ref = await withToken(d, job.accountId, a, t => peertubeUploadFromUrl(d.net, a.instance, t, meta, mp4,
          pct => { void patchJob(d, jobId, { progress: { pct: Math.max(5, Math.round(pct * 0.9)), note: `Uploading ${pct}%` } }); }));
        method = 'upload';
      }
    } else if (direct) {
      ref = await withToken(d, job.accountId, a, t => peertubeUploadFromUrl(d.net, a.instance, t, meta, direct,
        pct => { void patchJob(d, jobId, { progress: { pct: Math.max(5, Math.round(pct * 0.9)), note: `Uploading ${pct}%` } }); }));
      method = 'upload';
    } else {
      return void await fail('This video has no downloadable file yet (Mux MP4 not ready). Try again in a few minutes.');
    }

    const url = peertubeWatchUrl(a.instance, ref);
    await patchJob(d, jobId, {
      status: 'processing', method, progress: { pct: 92, note: 'PeerTube is processing' },
      items: [{ title: meta.name, remoteId: String(ref.id), shortUUID: ref.shortUUID, url, state: 'processing' }],
    });
    await upsertLink(d, 'video', job.itemId, {
      id: linkId('peertube', job.accountId, String(ref.id)), network: 'peertube', accountId: job.accountId, instance: a.instance,
      remoteId: String(ref.id), url, state: 'processing', jobId, createdAt: d.net.now(),
    });
  } catch (e: any) {
    await fail(String(e?.message || e).slice(0, 300));
  }
}

export async function runFunkwhaleJob(d: OpenPublishDeps, jobId: string): Promise<void> {
  const job = await d.store.get(`${JOBS}/${jobId}`);
  if (!job || job.status !== 'queued') return;
  const items: JobItem[] = Array.isArray(job.items) ? job.items : [];
  try {
    const a = await loadAccount(d, job.uid, job.accountId, 'funkwhale');
    const album = await d.store.get(`albums/${job.itemId}`);
    if (!album || album.ownerId !== job.uid) throw new Error('The album is gone.');
    const pol = albumBlockers(album, await d.getUser(job.uid), d.net.now());
    if (pol.album.length) throw new Error(pol.album[0].message);
    const eligible = new Map(pol.eligible.map(t => [String(t.id), t]));
    await assertPublicHost(d.net, a.instance);
    await patchJob(d, jobId, { status: 'running', progress: { pct: 2, note: 'Starting' } });

    const target = job.options.target as { type: 'library' | 'channel'; uuid: string; artistId?: number | null };
    let remoteAlbum: number | undefined;
    if (target.type === 'channel' && target.artistId != null && items.length > 1) {
      remoteAlbum = await withToken(d, job.accountId, a, t => funkwhaleCreateAlbum(d.net, a.instance, t, {
        artistId: Number(target.artistId), title: String(album.title || 'Untitled'),
        releaseDate: album.releaseDate ? new Date(releaseMs(album.releaseDate)).toISOString().slice(0, 10) : undefined,
      }));
    }
    const order = (Array.isArray(album.tracks) ? album.tracks : []).map((t: any) => String(t?.id));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const t = eligible.get(String(it.trackId));
      if (!t) { items[i] = { ...it, state: 'failed', error: 'No longer eligible' }; continue; }
      items[i] = { ...it, state: 'uploading' };
      await patchJob(d, jobId, { items, progress: { pct: Math.round(5 + (i / items.length) * 85), note: `Uploading ${i + 1} of ${items.length}` } });
      try {
        const ext = (String(t.url).split('?')[0].match(/\.(mp3|flac|ogg|opus|m4a|aac|wav|aif|aiff)$/i)?.[1] || 'mp3').toLowerCase();
        const up = await withToken(d, job.accountId, a, tok => funkwhaleUpload(d.net, a.instance, tok, {
          target: { type: target.type, uuid: target.uuid },
          sourceUrl: String(t.url),
          filename: `${String(t.title || 'track').replace(/[^\w .-]+/g, '').trim().slice(0, 80) || 'track'}.${ext}`,
          metadata: { title: String(t.title || 'Untitled'), position: order.indexOf(String(t.id)) + 1 || undefined, album: remoteAlbum, description: t.description, tags: t.genre ? [String(t.genre)] : undefined },
          reference: `plajah-${jobId}`,
        }));
        items[i] = { ...it, remoteId: up.uuid, state: 'processing' };
        await upsertLink(d, 'album', job.itemId, {
          id: linkId('funkwhale', job.accountId, up.uuid), network: 'funkwhale', accountId: job.accountId, instance: a.instance,
          remoteId: up.uuid, url: '', state: 'processing', jobId, trackId: String(t.id), createdAt: d.net.now(),
        });
      } catch (e: any) {
        items[i] = { ...it, state: 'failed', error: String(e?.message || e).slice(0, 300) };
      }
    }
    const anyOk = items.some(x => x.state === 'processing');
    await patchJob(d, jobId, {
      items, status: anyOk ? 'processing' : 'failed',
      ...(anyOk ? {} : { error: items.find(x => x.error)?.error || 'Nothing uploaded' }),
      progress: { pct: anyOk ? 92 : 100, note: anyOk ? 'Funkwhale is importing' : 'Failed' },
    });
  } catch (e: any) {
    await patchJob(d, jobId, { status: 'failed', error: String(e?.message || e).slice(0, 300) });
  }
}

/** Advance a job whose remote side is still processing. Called by GET /jobs/:id. */
export async function advanceJob(d: OpenPublishDeps, jobId: string, job: Record<string, any>): Promise<Record<string, any>> {
  if (job.status !== 'processing') return job;
  const last = Number(job.checkedAt || 0);
  if (d.net.now() - last < 4000) return job; // don't hammer the pod
  const a = await loadAccount(d, job.uid, job.accountId).catch(() => null);
  if (!a) return job;
  const items: JobItem[] = Array.isArray(job.items) ? job.items.map((x: JobItem) => ({ ...x })) : [];
  const kind: 'video' | 'album' = job.network === 'peertube' ? 'video' : 'album';
  for (const it of items) {
    if (it.state !== 'processing' || !it.remoteId) continue;
    try {
      if (job.network === 'peertube') {
        const s = await withToken(d, job.accountId, a, t => peertubeVideoStatus(d.net, a.instance, it.remoteId!, t));
        if (s.state === 'published') it.state = 'published';
        else if (s.state === 'failed' || s.state === 'missing') { it.state = 'failed'; it.error = s.state === 'missing' ? 'The video disappeared from the server' : `PeerTube: ${s.stateLabel || 'processing failed'}`; }
        else if (job.method === 'import') {
          const err = await withToken(d, job.accountId, a, t => peertubeImportFailure(d.net, a.instance, t, Number(it.remoteId)));
          if (err) { it.state = 'failed'; it.error = err; }
        }
      } else {
        const s = await withToken(d, job.accountId, a, t => funkwhaleUploadStatus(d.net, a.instance, t, it.remoteId!));
        if (s.state === 'published') { it.state = 'published'; if (s.trackId != null) it.url = funkwhaleTrackUrl(a.instance, s.trackId); }
        else if (s.state === 'failed' || s.state === 'missing') { it.state = 'failed'; it.error = s.error || 'Funkwhale could not import the file'; }
      }
    } catch { /* try again next poll */ }
    if (it.state !== 'processing') {
      await upsertLink(d, kind, job.itemId, {
        id: linkId(job.network, job.accountId, it.remoteId), network: job.network, accountId: job.accountId, instance: a.instance,
        remoteId: it.remoteId, url: it.url || '', state: it.state === 'published' ? 'published' : 'failed', jobId,
        ...(it.trackId ? { trackId: it.trackId } : {}), createdAt: d.net.now(),
      });
    }
  }
  const pending = items.some(x => x.state === 'processing');
  const ok = items.filter(x => x.state === 'published').length;
  const next = {
    items, checkedAt: d.net.now(),
    ...(pending ? {} : { status: ok ? 'done' : 'failed', progress: { pct: 100, note: ok ? 'Published' : 'Failed' }, ...(ok ? {} : { error: items.find(x => x.error)?.error || 'Failed' }) }),
  };
  await patchJob(d, jobId, next);
  return { ...job, ...next };
}

// ─── Router ─────────────────────────────────────────────────────────────────

export function createOpenPublishRouter(overrides: Partial<OpenPublishDeps> = {}): Router {
  const d: OpenPublishDeps = { ...defaultDeps(), ...overrides };
  const r = Router();

  const handle = (fn: (req: Request, res: Response, uid: string) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
      const uid = m ? await d.verify(m[1]) : null;
      if (!uid) return void res.status(401).json({ error: 'Sign in first.' });
      await fn(req, res, uid);
    } catch (e: any) {
      const status = e instanceof OpenPublishError ? e.status : 500;
      res.status(status).json({ error: status === 500 ? 'Something went wrong.' : e.message, code: e?.code });
      if (status === 500) console.warn('[open-publish]', e?.message || e);
    }
  };
  const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Accounts
  r.get('/accounts', handle(async (_req, res, uid) => {
    const rows = await d.store.query(ACCOUNTS, [{ field: 'uid', value: uid }], 50);
    res.json({ accounts: rows.filter(x => x.data.status === 'active').map(x => publicAccount(x.id, x.data)) });
  }));

  r.post('/peertube/connect', handle(async (req, res, uid) => {
    await guardOwner(d, uid);
    const origin = instanceOrigin(str(req.body?.instance, 300));
    const username = str(req.body?.username, 120); const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) throw new OpenPublishError('Enter your PeerTube username and password.');
    await assertPublicHost(d.net, origin);
    const creds = await peertubeLogin(d.net, origin, username, password, str(req.body?.otp, 12) || undefined);
    const me = await peertubeMe(d.net, origin, creds.accessToken);
    const now = d.net.now();
    const existing = (await d.store.query(ACCOUNTS, [{ field: 'uid', value: uid }], 50))
      .find(x => x.data.network === 'peertube' && x.data.instance === origin && x.data.username === me.username);
    const data = { uid, network: 'peertube', instance: origin, username: me.username || username, displayName: me.displayName, status: 'active', credsEnc: d.encrypt(creds), createdAt: existing?.data.createdAt || now, updatedAt: now };
    const id = existing ? (await d.store.set(`${ACCOUNTS}/${existing.id}`, data), existing.id) : await d.store.create(ACCOUNTS, data);
    if (!id) throw new OpenPublishError('Could not save the connection.', 500);
    res.json({ account: publicAccount(id, data), channels: me.channels });
  }));

  r.post('/funkwhale/connect/start', handle(async (req, res, uid) => {
    await guardOwner(d, uid);
    const origin = instanceOrigin(str(req.body?.instance, 300));
    await assertPublicHost(d.net, origin);
    const client = await funkwhaleRegisterApp(d.net, origin);
    const state = randomBytes(12).toString('hex');
    const now = d.net.now();
    const id = await d.store.create(ACCOUNTS, { uid, network: 'funkwhale', instance: origin, status: 'pending', mode: 'oauth', pendingEnc: d.encrypt(client), state, createdAt: now, updatedAt: now });
    if (!id) throw new OpenPublishError('Could not save the connection.', 500);
    res.json({ accountId: id, authorizeUrl: funkwhaleAuthorizeUrl(origin, client.clientId, state) });
  }));

  r.post('/funkwhale/connect/finish', handle(async (req, res, uid) => {
    const id = str(req.body?.accountId, 128); const code = str(req.body?.code, 512);
    if (!code) throw new OpenPublishError('Paste the code Funkwhale showed you.');
    const a = await loadAccount(d, uid, id, 'funkwhale');
    if (a.status !== 'pending' || !a.pendingEnc) throw new OpenPublishError('Start connecting again.', 409, 'not_pending');
    const client = d.decrypt(a.pendingEnc) as { clientId: string; clientSecret: string };
    const creds = await funkwhaleExchangeCode(d.net, a.instance, client, code);
    const me = await funkwhaleMe(d.net, a.instance, creds.accessToken);
    const data = { ...a, username: me.username, displayName: me.fullUsername, status: 'active', credsEnc: d.encrypt(creds), pendingEnc: null, state: null, updatedAt: d.net.now() };
    await d.store.set(`${ACCOUNTS}/${id}`, data);
    res.json({ account: publicAccount(id, data) });
  }));

  r.post('/funkwhale/connect/token', handle(async (req, res, uid) => {
    await guardOwner(d, uid);
    const origin = instanceOrigin(str(req.body?.instance, 300));
    const token = str(req.body?.token, 512);
    if (!token) throw new OpenPublishError('Paste the access token from your pod’s Settings → Applications.');
    await assertPublicHost(d.net, origin);
    const me = await funkwhaleMe(d.net, origin, token);
    const now = d.net.now();
    const creds: FunkwhaleCreds = { mode: 'app_token', accessToken: token };
    const data = { uid, network: 'funkwhale', instance: origin, username: me.username, displayName: me.fullUsername, status: 'active', mode: 'app_token', credsEnc: d.encrypt(creds), createdAt: now, updatedAt: now };
    const id = await d.store.create(ACCOUNTS, data);
    if (!id) throw new OpenPublishError('Could not save the connection.', 500);
    res.json({ account: publicAccount(id, data) });
  }));

  r.get('/accounts/:id/targets', handle(async (req, res, uid) => {
    const id = String(req.params.id);
    const a = await loadAccount(d, uid, id);
    if (a.network === 'peertube') {
      const me = await withToken(d, id, a, t => peertubeMe(d.net, a.instance, t));
      res.json({ channels: me.channels });
    } else {
      res.json(await withToken(d, id, a, t => funkwhaleTargets(d.net, a.instance, t)));
    }
  }));

  r.delete('/accounts/:id', handle(async (req, res, uid) => {
    const id = String(req.params.id);
    const a = await loadAccount(d, uid, id);
    if (a.network === 'peertube' && a.credsEnc) {
      try { await assertPublicHost(d.net, a.instance); await peertubeRevoke(d.net, a.instance, d.decrypt(a.credsEnc)); } catch { /* still forget it */ }
    }
    await d.store.delete(`${ACCOUNTS}/${id}`);
    // Copies already published stay on that server; the links on Plajah items stay so the creator can find them.
    res.json({ ok: true });
  }));

  // Preflight
  r.post('/check', handle(async (req, res, uid) => {
    const kind = req.body?.kind === 'album' ? 'album' : 'video';
    const id = str(req.body?.id, 128);
    if (!SAFE_ID.test(id)) throw new OpenPublishError('Unknown item.', 404);
    const doc = await d.store.get(itemPath(kind, id));
    if (!doc || doc.ownerId !== uid) throw new OpenPublishError('Not found.', 404);
    const owner = await d.getUser(uid);
    if (kind === 'video') return void res.json({ blockers: videoBlockers(doc, owner, d.net.now()), links: doc.openPublishLinks || [] });
    const p = albumBlockers(doc, owner, d.net.now());
    res.json({ blockers: p.album, trackBlockers: p.tracks, eligibleTrackIds: p.eligible.map(t => String(t.id)), links: doc.openPublishLinks || [] });
  }));

  // Publish
  r.post('/peertube/publish', handle(async (req, res, uid) => {
    const accountId = str(req.body?.accountId, 128); const videoId = str(req.body?.videoId, 128);
    const channelId = Number(req.body?.channelId);
    const privacy: PeerTubePrivacy = req.body?.privacy === 'unlisted' ? 'unlisted' : 'public';
    if (!SAFE_ID.test(videoId) || !Number.isFinite(channelId)) throw new OpenPublishError('Pick a video and a channel.');
    const a = await loadAccount(d, uid, accountId, 'peertube');
    if (a.status !== 'active') throw new OpenPublishError('Finish connecting first.', 409);
    const v = await d.store.get(`videos/${videoId}`);
    if (!v || v.ownerId !== uid) throw new OpenPublishError('You can only publish your own videos.', 403);
    const blockers = videoBlockers(v, await d.getUser(uid), d.net.now());
    if (blockers.length) return void res.status(422).json({ error: blockers[0].message, blockers });
    const dup = (Array.isArray(v.openPublishLinks) ? v.openPublishLinks : []).find((l: OpenPublishLink) => l.accountId === accountId && l.state !== 'failed');
    if (dup && req.body?.again !== true) return void res.status(409).json({ error: 'Already on this PeerTube channel.', link: dup });
    const now = d.net.now();
    const jobId = await d.store.create(JOBS, clean({
      uid, network: 'peertube', accountId, kind: 'video', itemId: videoId, status: 'queued',
      options: { channelId, privacy }, progress: { pct: 0, note: 'Queued' },
      items: [{ title: String(v.title || ''), state: 'queued' }], createdAt: now, updatedAt: now,
    }));
    if (!jobId) throw new OpenPublishError('Could not start the job.', 500);
    d.defer(() => runPeerTubeJob(d, jobId));
    res.status(202).json({ jobId });
  }));

  r.post('/funkwhale/publish', handle(async (req, res, uid) => {
    const accountId = str(req.body?.accountId, 128); const albumId = str(req.body?.albumId, 128);
    const tType = req.body?.target?.type === 'channel' ? 'channel' : 'library';
    const tUuid = str(req.body?.target?.uuid, 80);
    const artistId = req.body?.target?.artistId != null && Number.isFinite(Number(req.body.target.artistId)) ? Number(req.body.target.artistId) : null;
    if (!SAFE_ID.test(albumId) || !/^[0-9a-f-]{8,64}$/i.test(tUuid)) throw new OpenPublishError('Pick a release and where it goes.');
    const a = await loadAccount(d, uid, accountId, 'funkwhale');
    if (a.status !== 'active') throw new OpenPublishError('Finish connecting first.', 409);
    const album = await d.store.get(`albums/${albumId}`);
    if (!album || album.ownerId !== uid) throw new OpenPublishError('You can only publish your own releases.', 403);
    const pol = albumBlockers(album, await d.getUser(uid), d.net.now());
    if (pol.album.length) return void res.status(422).json({ error: pol.album[0].message, blockers: pol.album });
    const want: string[] | null = Array.isArray(req.body?.trackIds) ? req.body.trackIds.map((x: unknown) => String(x)).slice(0, 100) : null;
    const already = new Set((Array.isArray(album.openPublishLinks) ? album.openPublishLinks : [])
      .filter((l: OpenPublishLink) => l.accountId === accountId && l.state !== 'failed').map((l: OpenPublishLink) => l.trackId));
    const picked = pol.eligible.filter(t => (!want || want.includes(String(t.id))) && !already.has(String(t.id)));
    if (!picked.length) return void res.status(422).json({ error: 'No eligible tracks left to send.', trackBlockers: pol.tracks });
    const now = d.net.now();
    const jobId = await d.store.create(JOBS, clean({
      uid, network: 'funkwhale', accountId, kind: 'album', itemId: albumId, status: 'queued',
      options: { target: { type: tType, uuid: tUuid, artistId } }, progress: { pct: 0, note: 'Queued' },
      items: picked.map(t => ({ trackId: String(t.id), title: String(t.title || ''), state: 'queued' })), createdAt: now, updatedAt: now,
    }));
    if (!jobId) throw new OpenPublishError('Could not start the job.', 500);
    d.defer(() => runFunkwhaleJob(d, jobId));
    res.status(202).json({ jobId, skipped: pol.tracks });
  }));

  // Status
  r.get('/jobs/:id', handle(async (req, res, uid) => {
    const id = String(req.params.id);
    if (!SAFE_ID.test(id)) throw new OpenPublishError('Unknown job.', 404);
    let job = await d.store.get(`${JOBS}/${id}`);
    if (!job || job.uid !== uid) throw new OpenPublishError('Unknown job.', 404);
    job = await advanceJob(d, id, job);
    const { uid: _u, ...rest } = job;
    res.json({ job: { id, ...rest } });
  }));

  // Links + view counts. Comments and views live on those networks; we only read the count.
  r.get('/links', handle(async (req, res, uid) => {
    const kind = req.query.kind === 'album' ? 'album' : 'video';
    const id = String(req.query.id || '');
    if (!SAFE_ID.test(id)) throw new OpenPublishError('Unknown item.', 404);
    const doc = await d.store.get(itemPath(kind, id));
    if (!doc || doc.ownerId !== uid) throw new OpenPublishError('Not found.', 404);
    const links: OpenPublishLink[] = Array.isArray(doc.openPublishLinks) ? doc.openPublishLinks : [];
    const out = await Promise.all(links.map(async l => {
      let views: number | null = null;
      if (l.network === 'peertube' && l.state === 'published') {
        try { views = (await peertubeVideoStatus(d.net, l.instance, l.remoteId)).views; } catch { /* offline pod */ }
      }
      return { ...l, views };
    }));
    res.json({ links: out });
  }));

  // Delete the remote copy (the Plajah item is untouched).
  r.delete('/links', handle(async (req, res, uid) => {
    const kind = req.body?.kind === 'album' ? 'album' : 'video';
    const id = str(req.body?.id, 128); const lid = str(req.body?.linkId, 200);
    if (!SAFE_ID.test(id)) throw new OpenPublishError('Unknown item.', 404);
    const doc = await d.store.get(itemPath(kind, id));
    if (!doc || doc.ownerId !== uid) throw new OpenPublishError('Not found.', 404);
    const link = (Array.isArray(doc.openPublishLinks) ? doc.openPublishLinks : []).find((l: OpenPublishLink) => l.id === lid) as OpenPublishLink | undefined;
    if (!link) throw new OpenPublishError('Unknown link.', 404);
    let remoteDeleted = false;
    const a = await d.store.get(`${ACCOUNTS}/${link.accountId}`);
    if (a && a.uid === uid && a.status === 'active') {
      if (link.network === 'peertube') await withToken(d, link.accountId, a, t => peertubeDeleteVideo(d.net, a.instance, t, link.remoteId));
      else await withToken(d, link.accountId, a, t => funkwhaleDeleteUpload(d.net, a.instance, t, link.remoteId));
      remoteDeleted = true;
    } else if (req.body?.forgetOnly !== true) {
      throw new OpenPublishError('Reconnect that account to delete the copy, or just remove the link.', 409, 'reconnect');
    }
    await removeLink(d, kind, id, lid);
    res.json({ ok: true, remoteDeleted, note: 'Servers that already federated a copy may keep it.' });
  }));

  return r;
}
