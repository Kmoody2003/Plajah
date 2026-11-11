// Matrix bridge — connect an account, list joined rooms, send + read messages (Client-Server API v3).
//
//   discovery: GET  https://<server-name>/.well-known/matrix/client → m.homeserver.base_url (optional; falls back)
//   login:     POST /_matrix/client/v3/login { type: m.login.password, identifier: { type: m.id.user, user }, password }
//              → { access_token, user_id, device_id }   (password used once, never stored)
//   verify:    GET  /_matrix/client/v3/account/whoami
//   rooms:     GET  /_matrix/client/v3/joined_rooms ; GET /rooms/{id}/state/m.room.name (best effort)
//   send:      PUT  /_matrix/client/v3/rooms/{id}/send/m.room.message/{txnId}  { msgtype: m.text, body }
//   read:      GET  /_matrix/client/v3/rooms/{id}/messages?dir=b&limit=N
//   logout:    POST /_matrix/client/v3/logout  (only for tokens WE minted via password login)
//
// Limits stated plainly: no end-to-end encryption. Encrypted rooms show "encrypted message" placeholders and sending
// into them posts plaintext, which most clients flag — the UI warns. Homeservers that only allow SSO login (no
// m.login.password) must use the access-token path. Built so huddles/org chat can mirror into a room later.

import { randomUUID } from 'node:crypto';
import { type NetDeps, OpenNetworkError, netFetch, normalizeServer, clean, remoteError } from './common';

const API = '/_matrix/client/v3';
export const ROOM_ID_RE = /^![A-Za-z0-9._~+/=-]{1,255}:[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;

const authH = (t: string) => ({ Authorization: `Bearer ${t}`, Accept: 'application/json' });

/** "matrix.org" or "https://matrix-client.matrix.org" → client base URL, honoring .well-known when present. */
export async function matrixDiscover(deps: NetDeps, raw: string): Promise<string> {
  const base = normalizeServer(raw).origin;
  try {
    const r = await netFetch(deps, `${base}/.well-known/matrix/client`, { headers: { Accept: 'application/json' } });
    const hs = (r.json as any)?.['m.homeserver']?.base_url;
    if (r.ok && typeof hs === 'string' && hs) return normalizeServer(hs).origin;
  } catch { /* no well-known — use as given */ }
  return base;
}

function errOf(r: { status: number; json: any }, fallback: string): OpenNetworkError {
  const code = r.json?.errcode;
  if (r.status === 401 || code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN') return new OpenNetworkError(401, 'Matrix token is no longer valid — reconnect', 'auth');
  if (code === 'M_FORBIDDEN') return new OpenNetworkError(403, clean(r.json?.error || 'Not allowed in that room', 200), 'forbidden');
  if (code === 'M_LIMIT_EXCEEDED' || r.status === 429) return new OpenNetworkError(429, 'Matrix is rate-limiting; try again shortly', 'rate');
  return new OpenNetworkError(r.status >= 400 && r.status < 500 ? r.status : 502, clean(r.json?.error || fallback, 200), 'remote');
}

export async function matrixWhoami(deps: NetDeps, hs: string, token: string): Promise<{ userId: string; deviceId?: string }> {
  const r = await netFetch(deps, `${hs}${API}/account/whoami`, { headers: authH(token) });
  const j: any = r.json;
  if (!r.ok || typeof j?.user_id !== 'string') throw errOf(r, 'Token check failed');
  return { userId: clean(j.user_id, 300), deviceId: clean(j.device_id, 100) || undefined };
}

export async function matrixPasswordLogin(deps: NetDeps, hs: string, user: string, password: string): Promise<{ accessToken: string; userId: string; deviceId?: string }> {
  if (!user || !password) throw new OpenNetworkError(400, 'User and password required');
  const r = await netFetch(deps, `${hs}${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: clean(user, 300) },
      password: String(password).slice(0, 1024),
      initial_device_display_name: 'Plajah',
    }),
  });
  const j: any = r.json;
  if (!r.ok || typeof j?.access_token !== 'string') {
    if (r.status === 403 || j?.errcode === 'M_FORBIDDEN') throw new OpenNetworkError(401, 'Wrong user or password', 'auth');
    throw errOf(r, 'Login failed (this homeserver may only allow SSO — paste an access token instead)');
  }
  return { accessToken: j.access_token, userId: clean(j.user_id, 300), deviceId: clean(j.device_id, 100) || undefined };
}

export async function matrixLogout(deps: NetDeps, hs: string, token: string): Promise<void> {
  try { await netFetch(deps, `${hs}${API}/logout`, { method: 'POST', headers: { ...authH(token), 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* best effort */ }
}

export interface MatrixRoom { roomId: string; name?: string }

export async function matrixJoinedRooms(deps: NetDeps, hs: string, token: string, opts: { names?: number } = {}): Promise<MatrixRoom[]> {
  const r = await netFetch(deps, `${hs}${API}/joined_rooms`, { headers: authH(token) });
  const ids = (r.json as any)?.joined_rooms;
  if (!r.ok || !Array.isArray(ids)) throw errOf(r, 'Could not list rooms');
  const rooms: MatrixRoom[] = ids.filter((x: unknown): x is string => typeof x === 'string' && ROOM_ID_RE.test(x)).slice(0, 200).map(roomId => ({ roomId }));
  const n = Math.max(0, Math.min(30, opts.names ?? 20));
  await Promise.all(rooms.slice(0, n).map(async (room) => {
    try {
      const s = await netFetch(deps, `${hs}${API}/rooms/${encodeURIComponent(room.roomId)}/state/m.room.name`, { headers: authH(token) });
      const name = clean((s.json as any)?.name, 200);
      if (s.ok && name) room.name = name;
    } catch { /* unnamed room */ }
  }));
  return rooms;
}

export function parseRoomId(raw: unknown): string {
  const s = clean(raw, 600);
  if (!ROOM_ID_RE.test(s)) throw new OpenNetworkError(400, 'Room id looks like !abc123:server.org', 'bad-room');
  return s;
}

export async function matrixSend(deps: NetDeps, hs: string, token: string, roomId: string, text: string, txnId: string = randomUUID()): Promise<{ eventId: string }> {
  const body = clean(text, 4000);
  if (!body) throw new OpenNetworkError(400, 'Message is empty');
  const room = parseRoomId(roomId);
  const r = await netFetch(deps, `${hs}${API}/rooms/${encodeURIComponent(room)}/send/m.room.message/${encodeURIComponent(txnId)}`, {
    method: 'PUT',
    headers: { ...authH(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'm.text', body }),
  });
  const id = (r.json as any)?.event_id;
  if (!r.ok || typeof id !== 'string') throw errOf(r, 'Send failed');
  return { eventId: id };
}

export interface MatrixMessage { eventId: string; sender: string; body: string; ts: number; encrypted?: boolean }

export async function matrixMessages(deps: NetDeps, hs: string, token: string, roomId: string, opts: { limit?: number; from?: string } = {}): Promise<{ messages: MatrixMessage[]; next?: string }> {
  const room = parseRoomId(roomId);
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit ?? 30)));
  const from = opts.from ? `&from=${encodeURIComponent(clean(opts.from, 500))}` : '';
  const r = await netFetch(deps, `${hs}${API}/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=${limit}${from}`, { headers: authH(token) });
  const j: any = r.json;
  if (!r.ok || !Array.isArray(j?.chunk)) throw errOf(r, remoteError(r, 'Could not read messages'));
  const messages: MatrixMessage[] = [];
  for (const ev of j.chunk) {
    if (ev?.type === 'm.room.encrypted') {
      messages.push({ eventId: String(ev.event_id), sender: clean(ev.sender, 300), body: '(encrypted message — not readable here)', ts: Number(ev.origin_server_ts) || 0, encrypted: true });
      continue;
    }
    if (ev?.type !== 'm.room.message' || typeof ev?.content?.body !== 'string') continue;
    messages.push({ eventId: String(ev.event_id), sender: clean(ev.sender, 300), body: clean(ev.content.body, 4000), ts: Number(ev.origin_server_ts) || 0 });
  }
  return { messages: messages.reverse(), next: typeof j.end === 'string' ? j.end : undefined };
}
