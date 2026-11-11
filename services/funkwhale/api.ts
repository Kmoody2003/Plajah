// Funkwhale publishing: a creator's OWN Funkwhale account on a pod they choose. Chora stays home; the pod gets a copy.
// Server-side only. Network calls go through the instance guard in services/peertube/publish.ts.
//
// AUTH — verified against docs.funkwhale.audio/developer/api/authentication.html (2026-11-10): Funkwhale documents the
// OAuth AUTHORIZATION-CODE flow (+ refresh_token), with `urn:ietf:wg:oauth:2.0:oob` allowed for apps that can't receive
// a redirect. No password grant is documented, so Plajah never asks for a Funkwhale password: the creator approves
// Plajah on their own pod and pastes back the code it shows. A token made under Settings → Applications on the pod can
// be pasted instead (no refresh; it lasts until they revoke it).
//   The docs page names /api/v2/oauth/apps and /api/v2/oauth/token; 1.x pods serve /api/v1/oauth/apps/ and
//   /api/v1/oauth/token/. We try v1 first (every released pod has it) and fall back to v2.
//
// UPLOADS — NOT verified against a live pod or the Swagger schema (docs.funkwhale.audio/swagger/ is JS-rendered).
// From Funkwhale 1.x source as known:
//   GET  /api/v1/users/me/                      → { username, full_username }
//   GET  /api/v1/libraries/?scope=me            → { results: [{ uuid, name, privacy_level }] }
//   GET  /api/v1/channels/?scope=me             → { results: [{ uuid, artist: { id, name } }] }
//   POST /api/v1/albums/ { artist, title, release_date }  (channel artists only) → { id }
//   POST /api/v1/uploads/ multipart: audio_file, library | channel, import_status=pending, import_metadata (JSON),
//        import_reference → { uuid, import_status }
//   GET  /api/v1/uploads/{uuid}/ → { import_status: draft|pending|finished|errored|skipped, track: { id }, import_details }
//   DELETE /api/v1/uploads/{uuid}/
// Funkwhale 2.0 pods don't federate with older ones; that's the pod's business, the API above is the same shape.

import { guardedFetch, fetchSource, OpenPublishError, type NetCtx } from '../peertube/publish';

export const OOB_REDIRECT = 'urn:ietf:wg:oauth:2.0:oob';
export const FW_SCOPES = 'read write';

export interface FunkwhaleCreds {
  mode: 'oauth' | 'app_token';
  clientId?: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

async function body(res: Response): Promise<any> { try { return await res.json(); } catch { return {}; } }

async function fail(res: Response, what: string): Promise<OpenPublishError> {
  const b = await body(res);
  const detail = b?.detail || b?.error_description || b?.error || (typeof b === 'object' ? Object.values(b).flat().filter(x => typeof x === 'string')[0] : '') || `HTTP ${res.status}`;
  return new OpenPublishError(`${what}: ${String(detail).slice(0, 240)}`, res.status === 401 || res.status === 403 ? 401 : 502, res.status === 401 ? 'auth' : 'remote');
}

/** Try each path in order; the first that isn't 404/405 wins. */
async function firstPath(ctx: NetCtx, origin: string, paths: string[], init: RequestInit): Promise<Response> {
  let last: Response | null = null;
  for (const p of paths) {
    const r = await guardedFetch(ctx, origin, p, init);
    if (r.status !== 404 && r.status !== 405) return r;
    last = r;
  }
  return last!;
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

export async function funkwhaleRegisterApp(ctx: NetCtx, origin: string, appName = 'Plajah'): Promise<{ clientId: string; clientSecret: string }> {
  const payload = JSON.stringify({ name: appName, scopes: FW_SCOPES, redirect_uris: OOB_REDIRECT });
  const r = await firstPath(ctx, origin, ['/api/v1/oauth/apps/', '/api/v2/oauth/apps'], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  if (!r.ok) throw await fail(r, 'This server did not answer like Funkwhale');
  const b = await body(r);
  if (!b?.client_id) throw new OpenPublishError('This server did not answer like Funkwhale.', 502, 'not_funkwhale');
  return { clientId: String(b.client_id), clientSecret: String(b.client_secret || '') };
}

export const funkwhaleAuthorizeUrl = (origin: string, clientId: string, state: string) =>
  `${origin}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: OOB_REDIRECT, scope: FW_SCOPES, state }).toString()}`;

function credsFrom(b: any, client: { clientId: string; clientSecret: string }, now: number): FunkwhaleCreds {
  if (!b?.access_token) throw new OpenPublishError('Funkwhale did not return a token.', 502, 'remote');
  return {
    mode: 'oauth', ...client,
    accessToken: String(b.access_token),
    refreshToken: b.refresh_token ? String(b.refresh_token) : undefined,
    expiresAt: now + Number(b.expires_in || 36_000) * 1000,
  };
}

async function tokenCall(ctx: NetCtx, origin: string, params: Record<string, string>): Promise<Response> {
  return firstPath(ctx, origin, ['/api/v1/oauth/token/', '/api/v2/oauth/token'], {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
  });
}

export async function funkwhaleExchangeCode(ctx: NetCtx, origin: string, client: { clientId: string; clientSecret: string }, code: string): Promise<FunkwhaleCreds> {
  const r = await tokenCall(ctx, origin, { grant_type: 'authorization_code', code: code.trim(), redirect_uri: OOB_REDIRECT, client_id: client.clientId, client_secret: client.clientSecret });
  if (!r.ok) throw new OpenPublishError('That code didn’t work. Codes last 5 minutes; approve again and paste the new one.', 401, 'auth');
  return credsFrom(await body(r), client, ctx.now());
}

export async function funkwhaleRefresh(ctx: NetCtx, origin: string, creds: FunkwhaleCreds): Promise<FunkwhaleCreds> {
  if (creds.mode !== 'oauth' || !creds.refreshToken || !creds.clientId) throw new OpenPublishError('Your Funkwhale sign-in expired. Reconnect.', 401, 'reconnect');
  const r = await tokenCall(ctx, origin, { grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret || '' });
  if (!r.ok) throw new OpenPublishError('Your Funkwhale sign-in expired. Reconnect.', 401, 'reconnect');
  // Each refresh issues a NEW refresh token that replaces the old one (per the docs).
  return credsFrom(await body(r), { clientId: creds.clientId, clientSecret: creds.clientSecret || '' }, ctx.now());
}

// ─── Account + targets ──────────────────────────────────────────────────────

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function funkwhaleMe(ctx: NetCtx, origin: string, token: string): Promise<{ username: string; fullUsername: string }> {
  const r = await guardedFetch(ctx, origin, '/api/v1/users/me/', { headers: auth(token) });
  if (!r.ok) throw await fail(r, 'Could not read your Funkwhale account');
  const b = await body(r);
  return { username: String(b?.username || ''), fullUsername: String(b?.full_username || b?.username || '') };
}

export interface FwLibrary { uuid: string; name: string; privacy: string }
export interface FwChannel { uuid: string; name: string; artistId: number | null }

export async function funkwhaleTargets(ctx: NetCtx, origin: string, token: string): Promise<{ libraries: FwLibrary[]; channels: FwChannel[] }> {
  const [lr, cr] = await Promise.all([
    guardedFetch(ctx, origin, '/api/v1/libraries/?scope=me&page_size=50', { headers: auth(token) }),
    guardedFetch(ctx, origin, '/api/v1/channels/?scope=me&page_size=50', { headers: auth(token) }),
  ]);
  if (!lr.ok && lr.status === 401) throw await fail(lr, 'Funkwhale sign-in');
  const libs = lr.ok ? (await body(lr))?.results || [] : [];
  const chans = cr.ok ? (await body(cr))?.results || [] : [];
  return {
    libraries: libs.map((l: any) => ({ uuid: String(l.uuid), name: String(l.name || 'Library'), privacy: String(l.privacy_level || '') })).filter((l: FwLibrary) => l.uuid),
    channels: chans.map((c: any) => ({ uuid: String(c.uuid), name: String(c.artist?.name || c.name || 'Channel'), artistId: c.artist?.id != null ? Number(c.artist.id) : null })).filter((c: FwChannel) => c.uuid),
  };
}

/** Channel releases need an album owned by the channel's artist. Libraries take album info from the file tags. */
export async function funkwhaleCreateAlbum(ctx: NetCtx, origin: string, token: string, a: { artistId: number; title: string; releaseDate?: string }): Promise<number> {
  const r = await guardedFetch(ctx, origin, '/api/v1/albums/', {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist: a.artistId, title: a.title.slice(0, 255), ...(a.releaseDate ? { release_date: a.releaseDate } : {}) }),
  });
  if (!r.ok) throw await fail(r, 'Funkwhale would not create the album');
  const b = await body(r);
  if (b?.id == null) throw new OpenPublishError('Funkwhale did not return the album.', 502, 'remote');
  return Number(b.id);
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export const MAX_AUDIO_BYTES = 300 * 1024 * 1024;

export interface FwUploadInput {
  target: { type: 'library' | 'channel'; uuid: string };
  sourceUrl: string;
  filename: string;
  metadata: { title: string; position?: number; album?: number; description?: string; tags?: string[]; license?: string };
  reference: string;
}

export async function funkwhaleUpload(ctx: NetCtx, origin: string, token: string, input: FwUploadInput): Promise<{ uuid: string; status: string }> {
  const src = await fetchSource(ctx, input.sourceUrl, 10 * 60_000);
  if (!src.ok) throw new OpenPublishError(`Couldn't read the audio file (${src.status}).`, 502, 'source');
  const len = Number(src.headers.get('content-length') || 0);
  if (len > MAX_AUDIO_BYTES) throw new OpenPublishError('That audio file is over 300 MB.', 413, 'too_large');
  const type = (src.headers.get('content-type') || 'audio/mpeg').split(';')[0];
  if (/mpegurl|m3u8|text\/html/i.test(type)) throw new OpenPublishError('Only a streaming copy exists for this song; Funkwhale needs a file.', 422, 'no_file');
  const buf = await src.arrayBuffer();
  if (buf.byteLength > MAX_AUDIO_BYTES) throw new OpenPublishError('That audio file is over 300 MB.', 413, 'too_large');

  const meta: Record<string, unknown> = { title: input.metadata.title.slice(0, 255) };
  if (input.metadata.position) meta.position = input.metadata.position;
  if (input.metadata.album != null) meta.album = input.metadata.album;
  if (input.metadata.description) meta.description = { text: input.metadata.description.slice(0, 5000), content_type: 'text/plain' };
  if (input.metadata.tags?.length) meta.tags = input.metadata.tags.slice(0, 10);
  if (input.metadata.license) meta.license = input.metadata.license;

  const fd = new FormData();
  fd.set('audio_file', new Blob([buf], { type }), input.filename);
  fd.set(input.target.type, input.target.uuid);
  fd.set('import_status', 'pending');
  fd.set('import_reference', input.reference);
  fd.set('import_metadata', JSON.stringify(meta));
  fd.set('source', 'upload://' + input.filename);
  const r = await guardedFetch(ctx, origin, '/api/v1/uploads/', { method: 'POST', headers: auth(token), body: fd }, 10 * 60_000);
  if (!r.ok) throw await fail(r, 'Funkwhale refused the upload');
  const b = await body(r);
  if (!b?.uuid) throw new OpenPublishError('Funkwhale did not return the upload.', 502, 'remote');
  return { uuid: String(b.uuid), status: String(b.import_status || 'pending') };
}

export type FwState = 'processing' | 'published' | 'failed' | 'missing';

export async function funkwhaleUploadStatus(ctx: NetCtx, origin: string, token: string, uuid: string): Promise<{ state: FwState; trackId: number | null; error?: string }> {
  const r = await guardedFetch(ctx, origin, `/api/v1/uploads/${encodeURIComponent(uuid)}/`, { headers: auth(token) });
  if (r.status === 404) return { state: 'missing', trackId: null };
  if (!r.ok) throw await fail(r, 'Could not read the Funkwhale upload');
  const b = await body(r);
  const s = String(b?.import_status || '');
  const trackId = b?.track?.id != null ? Number(b.track.id) : null;
  if (s === 'finished') return { state: 'published', trackId };
  if (s === 'errored' || s === 'skipped') {
    const d = b?.import_details;
    const err = d?.error_code ? `${d.error_code}${d.detail ? `: ${JSON.stringify(d.detail).slice(0, 200)}` : ''}` : s === 'skipped' ? 'Skipped (the pod already has this file)' : 'Import failed';
    return { state: 'failed', trackId, error: err };
  }
  return { state: 'processing', trackId };
}

export async function funkwhaleDeleteUpload(ctx: NetCtx, origin: string, token: string, uuid: string): Promise<void> {
  const r = await guardedFetch(ctx, origin, `/api/v1/uploads/${encodeURIComponent(uuid)}/`, { method: 'DELETE', headers: auth(token) });
  if (r.ok || r.status === 404 || r.status === 204) return;
  throw await fail(r, 'Funkwhale would not delete the upload');
}

export const funkwhaleTrackUrl = (origin: string, trackId: number | string) => `${origin}/library/tracks/${encodeURIComponent(String(trackId))}`;
