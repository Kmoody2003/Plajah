// registerAuthServer - NODE-ONLY: PIN hashing and register-session tokens. Never import from client code.
//
// PINs: salted scrypt hashes ONLY. Plaintext PINs no longer exist anywhere (the old plaintext field is deleted by
// the one-time migration). Hashes live in businesses/{b}/staffSecrets/{staffId}, which no client rule allows.
//
// Sessions: stateless HMAC tokens "<b64url payload>.<sig>" so any Cloud Run instance can verify.
// Secret = REGISTER_SESSION_SECRET, else derived from server credentials already in the env.

import nodeCrypto from 'node:crypto';

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const s = salt || nodeCrypto.randomBytes(16).toString('hex');
  return { hash: nodeCrypto.scryptSync(pin, s, 32).toString('hex'), salt: s };
}

export function verifyPin(pin: string, secret: { pinHash?: string; pinSalt?: string }): boolean {
  if (!secret.pinHash || !secret.pinSalt) return false;
  const a = Buffer.from(hashPin(pin, secret.pinSalt).hash, 'hex'), b = Buffer.from(secret.pinHash, 'hex');
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}

const secret = (): string =>
  process.env.REGISTER_SESSION_SECRET
  || nodeCrypto.createHash('sha256').update(String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.STRIPE_SECRET_KEY || 'plajah-dev-register-secret')).digest('hex');

export interface RegisterSession { b: string; sid: string; name: string; role: string; perms?: string[]; exp: number }
const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function signSession(s: RegisterSession): string {
  const payload = b64(JSON.stringify(s));
  return `${payload}.${nodeCrypto.createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function verifySession(token: string | undefined, now = Date.now()): RegisterSession | null {
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const want = nodeCrypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) return null;
  try { const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RegisterSession; return s.exp > now ? s : null; } catch { return null; }
}
export const SESSION_TTL_MS = 12 * 3600_000;
