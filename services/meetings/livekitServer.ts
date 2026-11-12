/**
 * Server-only LiveKit plumbing, with no SDK: LiveKit's access tokens and webhook signatures are
 * plain HS256 JWTs and its RoomService is Twirp-over-JSON, so node:crypto + fetch cover it and the
 * same code talks to LiveKit Cloud or a self-hosted server (only LIVEKIT_URL / keys change).
 *
 * Env (server only, never shipped to the client):
 *   LIVEKIT_URL         wss://<project>.livekit.cloud  (or wss://sfu.plajah.com when self-hosted)
 *   LIVEKIT_API_KEY     API key
 *   LIVEKIT_API_SECRET  API secret
 *   MEETINGS_SFU        '1' turns the SFU path on (off = every meeting stays on the mesh)
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface LiveKitConfig { url: string; apiKey: string; apiSecret: string }

export function livekitConfigFromEnv(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  if (env.MEETINGS_SFU !== '1') return null;
  const url = (env.LIVEKIT_URL || '').trim();
  const apiKey = (env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (env.LIVEKIT_API_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Verify an HS256 JWT; returns its claims or null. Checks signature, iss (when given) and exp/nbf. */
export function verifyJwt(token: string, secret: string, opts: { issuer?: string; now?: number } = {}): Record<string, any> | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  let header: any; let claims: any;
  try { header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')); claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (header?.alg !== 'HS256') return null;
  const want = createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof claims.exp === 'number' && now > claims.exp + 30) return null;
  if (typeof claims.nbf === 'number' && now + 30 < claims.nbf) return null;
  if (opts.issuer && claims.iss !== opts.issuer) return null;
  return claims;
}

export interface JoinGrant {
  room: string;
  identity: string;
  name: string;
  /** Opaque JSON the client can read (role etc.). */
  metadata?: string;
  ttlSeconds?: number;
  canPublish?: boolean;
}

/** A LiveKit access token for joining exactly one room. */
export function mintJoinToken(cfg: LiveKitConfig, g: JoinGrant, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  return signJwt({
    iss: cfg.apiKey,
    sub: g.identity,
    jti: `${g.identity}:${iat}`,
    name: g.name,
    nbf: iat - 5,
    exp: iat + (g.ttlSeconds ?? 6 * 3600),
    ...(g.metadata ? { metadata: g.metadata } : {}),
    video: {
      room: g.room,
      roomJoin: true,
      canPublish: g.canPublish !== false,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
    },
  }, cfg.apiSecret);
}

/** Short-lived server token for RoomService calls on one room. */
function adminToken(cfg: LiveKitConfig, room: string | undefined, grants: Record<string, boolean>): string {
  const iat = Math.floor(Date.now() / 1000);
  return signJwt({ iss: cfg.apiKey, sub: 'plajah-server', nbf: iat - 5, exp: iat + 120, video: { ...(room ? { room } : {}), ...grants } }, cfg.apiSecret);
}

export function httpBase(url: string): string {
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
}

async function twirp(cfg: LiveKitConfig, method: string, body: object, token: string, fetchImpl: typeof fetch = fetch): Promise<any> {
  const r = await fetchImpl(`${httpBase(cfg.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    // Twirp "not_found" for a room nobody is in yet is normal, not an error.
    if (r.status === 404 || /not_found/.test(text)) return null;
    throw new Error(`livekit ${method} ${r.status} ${text.slice(0, 160)}`);
  }
  return r.json();
}

export interface RoomServiceLike {
  /** People in the room now, and the cap it was created with (null when the room doesn't exist). */
  roomState(room: string): Promise<{ count: number; maxParticipants: number | null }>;
  /** Create the room with its cap (no-op if it exists — LiveKit keeps the first settings). */
  ensureRoom(room: string, maxParticipants: number, metadata: string): Promise<void>;
}

export function createRoomService(cfg: LiveKitConfig, fetchImpl: typeof fetch = fetch): RoomServiceLike {
  return {
    async roomState(room) {
      const list = await twirp(cfg, 'ListRooms', { names: [room] }, adminToken(cfg, undefined, { roomList: true }), fetchImpl);
      const info = (list?.rooms || []).find((r: any) => r?.name === room);
      if (!info) return { count: 0, maxParticipants: null };
      const max = Number(info.max_participants ?? info.maxParticipants ?? 0) || null;
      // num_participants lags a little; ListParticipants is exact.
      const parts = await twirp(cfg, 'ListParticipants', { room }, adminToken(cfg, room, { roomAdmin: true }), fetchImpl);
      const count = Array.isArray(parts?.participants) ? parts.participants.length : Number(info.num_participants ?? info.numParticipants ?? 0);
      return { count, maxParticipants: max };
    },
    async ensureRoom(room, maxParticipants, metadata) {
      await twirp(cfg, 'CreateRoom', {
        name: room,
        max_participants: maxParticipants,
        empty_timeout: 300,
        departure_timeout: 20,
        metadata,
      }, adminToken(cfg, undefined, { roomCreate: true }), fetchImpl);
    },
  };
}

/**
 * Verify a LiveKit webhook: the Authorization header is a JWT signed with our API secret whose
 * `sha256` claim is the base64 SHA-256 of the raw body. Returns the parsed event or null.
 */
export function verifyWebhook(cfg: LiveKitConfig, rawBody: string | Buffer, authHeader: string | undefined): any | null {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '');
  const claims = verifyJwt(token, cfg.apiSecret, { issuer: cfg.apiKey });
  if (!claims || typeof claims.sha256 !== 'string') return null;
  const digest = createHash('sha256').update(rawBody).digest('base64');
  const a = Buffer.from(digest); const b = Buffer.from(claims.sha256);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); } catch { return null; }
}
