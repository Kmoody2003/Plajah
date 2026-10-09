// Client-side sealing for sensitive source details. WebCrypto only.
//
//   key  = PBKDF2-SHA256(passphrase, random 16-byte salt, 310,000 iterations) -> AES-256-GCM
//   data = JSON, encrypted with a random 12-byte IV; salt + IV travel with the ciphertext.
//
// What this protects: a database leak or a curious admin sees ciphertext, not the sealed fields.
// What it does NOT protect: a weak passphrase (PBKDF2 slows guessing, it cannot stop it); a
// compromised device or browser extension that reads the page while it is unlocked; metadata
// (source name, timestamps, log entries are NOT sealed unless you seal them); a lost passphrase
// (there is no recovery, by design). Plajah cannot read or reset a sealed vault.
// It is not audited. Journalists with a serious threat model should use dedicated tools
// (Signal, SecureDrop, an encrypted local vault) and treat this as a convenience layer.

import type { SealedEnvelope } from './types';

export const VAULT_ITERATIONS = 310_000;

const subtle = (): SubtleCrypto => {
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (!c?.subtle) throw new Error('WebCrypto is not available in this environment.');
  return c.subtle;
};
const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function passphraseProblem(p: string): string | null {
  if (p.length < 12) return 'Use at least 12 characters. A short passphrase can be guessed offline.';
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwertyuiop)/i.test(p)) return 'That passphrase is too predictable.';
  return null;
}

export async function seal(data: unknown, passphrase: string, iterations = VAULT_ITERATIONS): Promise<SealedEnvelope> {
  const bad = passphraseProblem(passphrase);
  if (bad) throw new Error(bad);
  const salt = (globalThis as any).crypto.getRandomValues(new Uint8Array(16)) as Uint8Array;
  const iv = (globalThis as any).crypto.getRandomValues(new Uint8Array(12)) as Uint8Array;
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: iterations, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/** Throws on a wrong passphrase or tampered ciphertext (GCM authenticates). */
export async function open<T = unknown>(env: SealedEnvelope, passphrase: string): Promise<T> {
  if (env.v !== 1 || env.alg !== 'AES-GCM') throw new Error('Unsupported vault format.');
  const key = await deriveKey(passphrase, unb64(env.salt), env.iter);
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(env.iv) as BufferSource }, key, unb64(env.ct) as BufferSource);
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    throw new Error('Wrong passphrase, or the sealed data was altered.');
  }
}

/** The fields we seal on a confidential source. */
export interface SourceSecrets { contact?: string; notes?: string; realName?: string; location?: string }
