// PeerTube publishing: a creator's OWN PeerTube account on a server they choose. Plajah stays home (Mux playback,
// comments, the master copy); PeerTube gets a copy. Server-side only.
//
// Separate from services/peertubeService.ts, which is the read-only Cinema allowlist.
//
// Also holds the instance guard the Funkwhale client reuses (services/funkwhale/api.ts): every URL a user typed or
// stored is checked for https, shape (checkUrlShape) and every DNS answer (isBlockedIp) before Plajah's server talks to
// it, and redirects are never followed, so a pod can't bounce us into the private network.
//
// API facts (PeerTube openapi.yaml, checked 2026-11-10 where marked ✓; the rest is from PeerTube's source/docs as known
// and has not been run against a live server):
//   ✓ GET  /api/v1/oauth-clients/local → { client_id, client_secret }
//   ✓ POST /api/v1/users/token (form) grant_type=password|refresh_token → { access_token, refresh_token, expires_in, refresh_token_expires_in }
//   ✓ POST /api/v1/videos/imports → VideoUploadResponse { video: { id, uuid, shortUUID } }; 409 when HTTP import is disabled
//   ✓ POST /api/v1/videos/upload-resumable → 201 + Location (…?upload_id=…); PUT chunks → 308 + Range, last → 200 VideoUploadResponse
//   ✓ DELETE /api/v1/videos/{id} → 204
//     GET  /api/v1/users/me → { username, account, videoChannels: [{ id, name, displayName }] }
//     GET  /api/v1/videos/{id} → { state: { id }, views, shortUUID, url }   (state 1 = published, 7/8 = failed)
//     GET  /api/v1/users/me/videos/imports → { data: [{ state: { id }, error, video: { id } }] }  (3 failed, 4 rejected, 5 cancelled)
//     POST /api/v1/users/revoke-token

import { lookup as dnsLookup } from 'node:dns/promises';
import { checkUrlShape, isBlockedIp } from '../linkPreviewCore';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type ResolveHost = (host: string) => Promise<string[]>;

export interface NetCtx {
  fetch: FetchLike;
  resolve: ResolveHost;
  now: () => number;
  timeoutMs?: number;
}

export const defaultResolve: ResolveHost = async (host) => (await dnsLookup(host, { all: true })).map(a => a.address);

export class OpenPublishError extends Error {
  constructor(message: string, public status = 400, public code = 'bad_request') { super(message); }
}

// ─── Instance guard ─────────────────────────────────────────────────────────

/** Static part: https only, no path/query/credentials, public-looking hostname. Returns the origin. */
export function instanceOrigin(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) throw new OpenPublishError('Enter your server address, like video.example.org.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const shape = checkUrlShape(s);
  if (!shape.ok) throw new OpenPublishError(`That server address can't be used (${(shape as { reason?: string }).reason}).`);
  if (shape.url.protocol !== 'https:') throw new OpenPublishError('The server must use https.');
  if (shape.url.port && shape.url.port !== '443') throw new OpenPublishError('Use the server’s normal https address (no port).');
  return shape.url.origin;
}

/** DNS part: every address the host resolves to must be public. Throws otherwise. */
export async function assertPublicHost(ctx: NetCtx, url: string): Promise<void> {
  const shape = checkUrlShape(url);
  if (!shape.ok) throw new OpenPublishError(`Blocked address (${(shape as { reason?: string }).reason}).`);
  if (shape.url.protocol !== 'https:') throw new OpenPublishError('Only https addresses are allowed.');
  let addrs: string[];
  try { addrs = await ctx.resolve(shape.url.hostname); } catch { throw new OpenPublishError(`Couldn't find ${shape.url.hostname}.`, 502, 'dns'); }
  if (!addrs.length || addrs.some(a => isBlockedIp(a))) throw new OpenPublishError('That server address points at a private network.', 400, 'blocked_host');
}

/** Fetch against a checked origin: no redirects, a timeout, and the URL must stay on that origin. */
export async function guardedFetch(ctx: NetCtx, origin: string, url: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const u = new URL(url, origin);
  if (u.origin !== origin) throw new OpenPublishError('Refusing to follow the server off its own address.', 502, 'off_origin');
  await assertPublicHost(ctx, u.toString());
  const res = await ctx.fetch(u.toString(), { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs ?? ctx.timeoutMs ?? 20_000) });
  if (res.status >= 300 && res.status < 400 && res.status !== 308) {
    throw new OpenPublishError(`The server redirected (${res.status}); check the address.`, 502, 'redirect');
  }
  return res;
}

async function json(res: Response): Promise<any> { try { return await res.json(); } catch { return {}; } }

async function failure(res: Response, what: string): Promise<OpenPublishError> {
  const body = await json(res);
  const msg = body?.detail || body?.error || body?.error_description || body?.message || `HTTP ${res.status}`;
  const status = res.status === 401 || res.status === 403 ? 401 : res.status === 404 ? 404 : 502;
  return new OpenPublishError(`${what}: ${String(msg).slice(0, 240)}`, status, res.status === 401 ? 'auth' : 'remote');
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface PeerTubeCreds {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

function tokensFrom(body: any, client: { clientId: string; clientSecret: string }, now: number): PeerTubeCreds {
  if (!body?.access_token) throw new OpenPublishError('The server did not return a token.', 502, 'remote');
  return {
    ...client,
    accessToken: String(body.access_token),
    refreshToken: String(body.refresh_token || ''),
    expiresAt: now + Number(body.expires_in || 86_400) * 1000,
    refreshExpiresAt: now + Number(body.refresh_token_expires_in || 1_209_600) * 1000,
  };
}

/** One-time password login. The password goes straight to the creator's server and is never stored. */
export async function peertubeLogin(ctx: NetCtx, origin: string, username: string, password: string, otp?: string): Promise<PeerTubeCreds> {
  const cr = await guardedFetch(ctx, origin, '/api/v1/oauth-clients/local');
  if (!cr.ok) throw await failure(cr, 'This server did not answer like PeerTube');
  const c = await json(cr);
  if (!c?.client_id) throw new OpenPublishError('This server did not answer like PeerTube.', 502, 'not_peertube');
  const client = { clientId: String(c.client_id), clientSecret: String(c.client_secret || '') };
  const body = new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'password', username, password });
  const tr = await guardedFetch(ctx, origin, '/api/v1/users/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(otp ? { 'x-peertube-otp': otp } : {}) },
    body: body.toString(),
  });
  if (!tr.ok) {
    const b = await json(tr);
    if (tr.headers.get('x-peertube-otp')?.includes('required')) throw new OpenPublishError('Enter your two-factor code.', 401, 'otp_required');
    throw new OpenPublishError(`Sign-in failed: ${String(b?.detail || b?.error || b?.error_description || tr.status).slice(0, 200)}`, 401, 'auth');
  }
  return tokensFrom(await json(tr), client, ctx.now());
}

export async function peertubeRefresh(ctx: NetCtx, origin: string, creds: PeerTubeCreds): Promise<PeerTubeCreds> {
  if (!creds.refreshToken || creds.refreshExpiresAt < ctx.now()) throw new OpenPublishError('Your PeerTube sign-in expired. Reconnect.', 401, 'reconnect');
  const body = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: 'refresh_token', refresh_token: creds.refreshToken });
  const r = await guardedFetch(ctx, origin, '/api/v1/users/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) throw new OpenPublishError('Your PeerTube sign-in expired. Reconnect.', 401, 'reconnect');
  return tokensFrom(await json(r), creds, ctx.now());
}

export async function peertubeRevoke(ctx: NetCtx, origin: string, creds: PeerTubeCreds): Promise<void> {
  try { await guardedFetch(ctx, origin, '/api/v1/users/revoke-token', { method: 'POST', headers: { Authorization: `Bearer ${creds.accessToken}` } }); } catch { /* best effort */ }
}

// ─── Account ────────────────────────────────────────────────────────────────

export interface PeerTubeChannel { id: number; name: string; displayName: string }

export async function peertubeMe(ctx: NetCtx, origin: string, token: string): Promise<{ username: string; displayName: string; channels: PeerTubeChannel[] }> {
  const r = await guardedFetch(ctx, origin, '/api/v1/users/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw await failure(r, 'Could not read your PeerTube account');
  const me = await json(r);
  const channels: PeerTubeChannel[] = (Array.isArray(me?.videoChannels) ? me.videoChannels : [])
    .map((c: any) => ({ id: Number(c.id), name: String(c.name || ''), displayName: String(c.displayName || c.name || '') }))
    .filter((c: PeerTubeChannel) => Number.isFinite(c.id));
  return { username: String(me?.username || ''), displayName: String(me?.account?.displayName || me?.username || ''), channels };
}

// ─── Source selection ───────────────────────────────────────────────────────

/** Mux's public MP4 renditions (the asset is created with mp4_support 'standard' in server.ts). Newer assets name them
 *  capped-1080p/highest; legacy ones high/medium/low. Returns the first that answers 200, else null. */
export const MUX_MP4_NAMES = ['capped-1080p.mp4', 'high.mp4', 'highest.mp4', 'medium.mp4', 'low.mp4'];

export async function findMuxMp4(ctx: NetCtx, playbackId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9]{10,80}$/.test(playbackId)) return null;
  for (const name of MUX_MP4_NAMES) {
    const url = `https://stream.mux.com/${playbackId}/${name}`;
    try {
      // Fixed, trusted host (Mux), so following its CDN redirect is fine here.
      const r = await ctx.fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      if (r.ok) return url;
    } catch { /* next */ }
  }
  return null;
}

export const PEERTUBE_PRIVACY = { public: 1, unlisted: 2 } as const;
export type PeerTubePrivacy = keyof typeof PEERTUBE_PRIVACY;

export interface PeerTubeVideoMeta {
  channelId: number;
  name: string;
  description?: string;
  privacy: PeerTubePrivacy;
  tags?: string[];
}

/** PeerTube limits: name 3–120 chars, description ≤ 10000, ≤ 5 tags of 2–30 chars. */
export function cleanMeta(m: PeerTubeVideoMeta): PeerTubeVideoMeta {
  let name = String(m.name || '').trim().slice(0, 120);
  if (name.length < 3) name = (name + ' video').trim().slice(0, 120);
  const tags = (m.tags || []).map(t => String(t).trim().replace(/^#/, '')).filter(t => t.length >= 2 && t.length <= 30).slice(0, 5);
  return { channelId: m.channelId, name, description: String(m.description || '').slice(0, 9500), privacy: m.privacy === 'unlisted' ? 'unlisted' : 'public', tags };
}

export interface RemoteVideoRef { id: number; uuid: string; shortUUID: string }

function videoRef(body: any): RemoteVideoRef {
  const v = body?.video || body;
  if (v?.id == null) throw new OpenPublishError('PeerTube did not return the new video.', 502, 'remote');
  return { id: Number(v.id), uuid: String(v.uuid || ''), shortUUID: String(v.shortUUID || v.uuid || v.id) };
}

export const peertubeWatchUrl = (origin: string, ref: { shortUUID?: string; uuid?: string; id: number | string }) =>
  `${origin}/w/${encodeURIComponent(String(ref.shortUUID || ref.uuid || ref.id))}`;

// ─── Import by URL ──────────────────────────────────────────────────────────

/** Ask the PeerTube server to pull a public URL itself. Throws code 'import_disabled' on 409 so the caller can fall back. */
export async function peertubeImportUrl(ctx: NetCtx, origin: string, token: string, meta: PeerTubeVideoMeta, targetUrl: string): Promise<RemoteVideoRef> {
  const m = cleanMeta(meta);
  const fd = new FormData();
  fd.set('channelId', String(m.channelId));
  fd.set('name', m.name);
  fd.set('privacy', String(PEERTUBE_PRIVACY[m.privacy]));
  fd.set('targetUrl', targetUrl);
  if (m.description) fd.set('description', m.description);
  for (const t of m.tags || []) fd.append('tags[]', t);
  const r = await guardedFetch(ctx, origin, '/api/v1/videos/imports', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }, 60_000);
  if (r.status === 409) throw new OpenPublishError('This PeerTube server has importing turned off.', 409, 'import_disabled');
  if (!r.ok) throw await failure(r, 'PeerTube refused the import');
  return videoRef(await json(r));
}

// ─── Resumable upload, streamed from the source ─────────────────────────────

export const CHUNK_BYTES = 8 * 1024 * 1024;           // multiple of 256 KiB
export const MAX_UNSIZED_BYTES = 1024 * 1024 * 1024;  // a source without Content-Length is buffered, up to 1 GiB

/** Pull `size` bytes off a reader in CHUNK_BYTES pieces. */
async function* chunked(reader: ReadableStreamDefaultReader<Uint8Array>, chunk: number): AsyncGenerator<Uint8Array> {
  let parts: Uint8Array[] = []; let have = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (value?.length) { parts.push(value); have += value.length; }
    while (have >= chunk || (done && have > 0)) {
      const all = parts.length === 1 ? parts[0] : concat(parts, have);
      const take = Math.min(chunk, have);
      yield all.subarray(0, take);
      const rest = all.subarray(take);
      parts = rest.length ? [rest] : []; have = rest.length;
    }
    if (done) return;
  }
}

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** GET a media source (a stored Plajah URL — still user-influenced, so guarded), following ≤3 checked redirects. */
export async function fetchSource(ctx: NetCtx, url: string, timeoutMs = 30 * 60_000): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHost(ctx, current);
    const r = await ctx.fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location')!, current).toString();
      continue;
    }
    return r;
  }
  throw new OpenPublishError('The media file redirected too many times.', 502, 'source');
}

export async function peertubeUploadFromUrl(
  ctx: NetCtx, origin: string, token: string, meta: PeerTubeVideoMeta, sourceUrl: string,
  onProgress: (pct: number) => void = () => {},
): Promise<RemoteVideoRef> {
  const src = await fetchSource(ctx, sourceUrl);
  if (!src.ok || !src.body) throw new OpenPublishError(`Couldn't read the video file (${src.status}).`, 502, 'source');
  const type = (src.headers.get('content-type') || 'video/mp4').split(';')[0];
  if (/mpegurl|m3u8/i.test(type)) throw new OpenPublishError('Only a streaming copy exists for this video; PeerTube needs a file.', 422, 'no_file');
  let size = Number(src.headers.get('content-length') || 0);
  let reader = src.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  if (!size) {
    // Buffer it to learn the size (PeerTube needs the total up front).
    const parts: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (value) { parts.push(value); total += value.length; if (total > MAX_UNSIZED_BYTES) throw new OpenPublishError('The video file is too large to send without a known size.', 413, 'too_large'); }
      if (done) break;
    }
    size = total;
    const all = concat(parts, total);
    reader = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(all); c.close(); } }).getReader() as ReadableStreamDefaultReader<Uint8Array>;
  }
  const m = cleanMeta(meta);
  const filename = (m.name.replace(/[^\w .-]+/g, '').trim() || 'video').slice(0, 80) + (type.includes('webm') ? '.webm' : type.includes('quicktime') ? '.mov' : '.mp4');
  const init = await guardedFetch(ctx, origin, '/api/v1/videos/upload-resumable', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': type },
    body: JSON.stringify({ channelId: m.channelId, name: m.name, filename, privacy: PEERTUBE_PRIVACY[m.privacy], description: m.description, tags: m.tags }),
  });
  if (init.status !== 201 && init.status !== 200) throw await failure(init, 'PeerTube refused the upload');
  const location = init.headers.get('location');
  if (!location) throw new OpenPublishError('PeerTube did not return an upload address.', 502, 'remote');
  const putUrl = new URL(location, origin).toString();
  let offset = 0;
  try {
    for await (const piece of chunked(reader, CHUNK_BYTES)) {
      const end = offset + piece.length - 1;
      const r = await guardedFetch(ctx, origin, putUrl, {
        method: 'PUT',
        // fetch sets Content-Length itself from the byte body.
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${offset}-${end}/${size}` },
        body: piece as unknown as BodyInit,
      }, 10 * 60_000);
      offset = end + 1;
      onProgress(Math.min(99, Math.round((offset / size) * 100)));
      if (r.status === 308) continue;
      if (r.ok) { onProgress(100); return videoRef(await json(r)); }
      throw await failure(r, 'Upload to PeerTube failed');
    }
  } catch (e) {
    // Free the half-finished session on the server.
    try { await guardedFetch(ctx, origin, putUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
    throw e;
  }
  throw new OpenPublishError('The video file ended early.', 502, 'source');
}

// ─── Status, views, delete ──────────────────────────────────────────────────

export type RemoteState = 'processing' | 'published' | 'failed' | 'missing';

export async function peertubeVideoStatus(ctx: NetCtx, origin: string, id: number | string, token?: string): Promise<{ state: RemoteState; views: number | null; error?: string; stateLabel?: string }> {
  const r = await guardedFetch(ctx, origin, `/api/v1/videos/${encodeURIComponent(String(id))}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (r.status === 404) return { state: 'missing', views: null };
  if (!r.ok) throw await failure(r, 'Could not read the PeerTube video');
  const v = await json(r);
  const sid = Number(v?.state?.id ?? 1);
  const state: RemoteState = sid === 1 ? 'published' : (sid === 7 || sid === 8) ? 'failed' : 'processing';
  return { state, views: Number.isFinite(Number(v?.views)) ? Number(v.views) : null, stateLabel: v?.state?.label };
}

/** Import jobs that died show up here (the video row may linger in "to import"). */
export async function peertubeImportFailure(ctx: NetCtx, origin: string, token: string, videoId: number): Promise<string | null> {
  try {
    const r = await guardedFetch(ctx, origin, '/api/v1/users/me/videos/imports?count=50&sort=-createdAt', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const list = (await json(r))?.data;
    const row = Array.isArray(list) ? list.find((x: any) => Number(x?.video?.id) === Number(videoId)) : null;
    const sid = Number(row?.state?.id);
    if (sid === 3 || sid === 4 || sid === 5) return String(row?.error || row?.state?.label || 'Import failed').slice(0, 300);
    return null;
  } catch { return null; }
}

export async function peertubeDeleteVideo(ctx: NetCtx, origin: string, token: string, id: number | string): Promise<void> {
  const r = await guardedFetch(ctx, origin, `/api/v1/videos/${encodeURIComponent(String(id))}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404 || r.status === 204 || r.ok) return;
  throw await failure(r, 'PeerTube would not delete the video');
}
