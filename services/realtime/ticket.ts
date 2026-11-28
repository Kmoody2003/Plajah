// Plajah Realtime: join tickets and server-to-server signatures. Pure node:crypto, no Firebase, so the
// realtime service verifies a join in microseconds on the hot path.
//
//   ticket  = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, payload part))
//   The API (routes/gamerRealtime.ts) issues one after matchmaking; the realtime server checks it on join.
//   Secrets are server-only env vars (GAMER_RT_TICKET_SECRET, GAMER_RT_RESULT_SECRET), never VITE_.
//
//   result signature: the realtime server posts a finished match to the API with
//   x-plajah-rt-ts: <ms>  and  x-plajah-rt-sig: base64url(HMAC-SHA256(resultSecret, ts + '.' + canonical(body)))
//   Signing the canonical JSON (sorted keys) means the API can check the parsed body without the raw bytes.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TicketPayload {
  /** 'join' comes from the API; 'resume' is minted by the room so a dropped player can rejoin without the API. */
  k: 'join' | 'resume';
  /** Room id = the realtime match id the API created. */
  room: string;
  game: string;
  uid: string;
  seat: number;
  name: string;
  /** Players needed before the room may start (a queued 2-player match: 2). */
  min: number;
  rated: boolean;
  /** Optional flat room metadata (e.g. circuitId, region), signed by the API so every peer agrees on settings. */
  meta?: Record<string, string | number | boolean>;
  iat: number;
  exp: number;
}

export const TICKET_TTL_MS = 60_000;
export const RESUME_TTL_MS = 15 * 60_000;
export const RESULT_SKEW_MS = 5 * 60_000;

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();

function safeEq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Deterministic JSON: sorted keys, undefined dropped (same rule as services/ledger/licenseLedger.ts). */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export function signTicket(p: TicketPayload, secret: string): string {
  if (!secret || secret.length < 16) throw new Error('ticket secret missing or too short');
  const body = b64u(JSON.stringify(p));
  return `${body}.${b64u(mac(secret, body))}`;
}

export type TicketCheck = { ok: true; ticket: TicketPayload } | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'fields' };

export function verifyTicket(token: unknown, secret: string, now: number): TicketCheck {
  if (typeof token !== 'string' || token.length > 2048 || !secret) return { ok: false, reason: 'malformed' };
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  let sig: Buffer;
  try { sig = Buffer.from(token.slice(dot + 1), 'base64url'); } catch { return { ok: false, reason: 'malformed' }; }
  if (!safeEq(sig, mac(secret, body))) return { ok: false, reason: 'signature' };
  let p: TicketPayload;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  const metaOk = p?.meta === undefined || (
    typeof p.meta === 'object' && p.meta !== null && !Array.isArray(p.meta)
    && Object.keys(p.meta).length <= 8
    && Object.entries(p.meta).every(([k, v]) => k.length > 0 && k.length <= 24 && (
      (typeof v === 'string' && v.length <= 64)
      || (typeof v === 'number' && Number.isFinite(v))
      || typeof v === 'boolean'
    ))
  );
  const fieldsOk = p && (p.k === 'join' || p.k === 'resume') && typeof p.room === 'string' && p.room.length > 0 && p.room.length <= 64
    && typeof p.game === 'string' && typeof p.uid === 'string' && p.uid.length > 0 && p.uid.length <= 128
    && Number.isInteger(p.seat) && p.seat >= 0 && p.seat < 64 && typeof p.name === 'string'
    && Number.isInteger(p.min) && typeof p.rated === 'boolean' && typeof p.exp === 'number' && typeof p.iat === 'number' && metaOk;
  if (!fieldsOk) return { ok: false, reason: 'fields' };
  if (now > p.exp) return { ok: false, reason: 'expired' };
  return { ok: true, ticket: p };
}

/** Room-minted ticket for reconnecting within the grace window (same secret, longer life). */
export const resumeTicket = (t: TicketPayload, secret: string, now: number): string =>
  signTicket({ ...t, k: 'resume', iat: now, exp: now + RESUME_TTL_MS }, secret);

// ── server-to-server (realtime → API) ─────────────────────────────────────────────
export const RESULT_TS_HEADER = 'x-plajah-rt-ts';
export const RESULT_SIG_HEADER = 'x-plajah-rt-sig';

export function signBody(body: unknown, secret: string, ts: number): string {
  if (!secret || secret.length < 16) throw new Error('result secret missing or too short');
  return b64u(mac(secret, `${ts}.${canonical(body)}`));
}

export function verifyBody(body: unknown, ts: unknown, sig: unknown, secret: string, now: number): boolean {
  if (!secret || typeof sig !== 'string' || sig.length > 128) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > RESULT_SKEW_MS) return false;
  let got: Buffer;
  try { got = Buffer.from(sig, 'base64url'); } catch { return false; }
  return safeEq(got, mac(secret, `${t}.${canonical(body)}`));
}
