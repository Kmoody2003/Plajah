/**
 * vaultCrypto — the encryption primitives behind Source Mode's vault.
 *
 * This is REAL client-side encryption. Unlike services/cryptoService.ts (whose key
 * is derived from a constant compiled into the bundle, and which is therefore an
 * at-rest defence, NOT end-to-end), the vault key here is derived from a passphrase
 * the server never receives. Plajah cannot decrypt a vault. That is the whole point,
 * and it is the one place in the app where "we cannot read this" is literally true.
 *
 * DESIGN — envelope encryption:
 *   · A random 256-bit AES-GCM "vault key" (the DEK) encrypts every record.
 *   · That vault key is WRAPPED twice: once by a key derived from the user's
 *     passphrase, once by a key derived from a generated recovery code. Either can
 *     unwrap it, so the user can recover the vault if they lose the passphrase —
 *     without Plajah ever escrowing anything.
 *   · Wrapping uses WebCrypto's wrapKey/unwrapKey, so the raw vault-key bytes never
 *     surface in JS. The session key is unwrapped as NON-extractable, so once the
 *     vault is open the key cannot be exported either.
 *
 * KDF: PBKDF2-SHA-256, 600,000 iterations (OWASP 2023+ floor), random per-user salt.
 *
 * There is deliberately no way to recover a vault whose passphrase AND recovery code
 * are both lost. That is a feature: an escrow we could use is an escrow we could be
 * compelled to use.
 */

const PBKDF2_ITERATIONS = 600_000;
const KDF_NAME = 'PBKDF2-SHA256';
const AES = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_BYTES = 12;
const SALT_BYTES = 16;

/** A wrapped key, or an encrypted record: ciphertext + the IV it used. */
export interface Sealed {
  ct: string; // base64
  iv: string; // base64
}

export interface VaultKdfInfo {
  name: typeof KDF_NAME;
  iterations: number;
}

/* ── base64 <-> bytes ───────────────────────────────────────────────────────── */

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* ── Random material ────────────────────────────────────────────────────────── */

export function randomSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * A recovery code the user writes down. 160 bits of entropy in Crockford base32,
 * grouped for legibility: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXX.
 * Crockford omits I, L, O, U to avoid transcription errors.
 */
export function generateRecoveryCode(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
  const bytes = crypto.getRandomValues(new Uint8Array(20)); // 160 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  // Group into blocks of 5.
  return (out.match(/.{1,5}/g) || []).join('-');
}

/**
 * Normalise a typed recovery code. Crockford base32 is chosen precisely so a
 * transcription slip can be recovered: on INPUT the ambiguous glyphs map back to
 * their canonical form (O→0, I/L→1). Without this, a user who writes "0" and types
 * "O" derives a different key and — with no reset — loses the vault forever.
 */
export function normalizeRecoveryCode(code: string): string {
  return code
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Additional authenticated data binding the KDF parameters to the wrapped key.
 *
 * The salt and iteration count live in plaintext metadata that a server (or a rules
 * regression) could tamper with. Feeding them as AES-GCM AAD means any change makes
 * the unwrap fail closed — in particular an attacker cannot lower `iterations` to
 * mount a downgrade attack, because the tampered value no longer authenticates.
 */
function aadFor(saltB64: string, iterations: number): Uint8Array {
  return new TextEncoder().encode(`plajah-vault:v1:${saltB64}:${iterations}`);
}

/* ── Key derivation ─────────────────────────────────────────────────────────── */

/** Derive a wrapping key (KEK) from a secret string + salt. Not extractable. */
async function deriveKek(secret: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromB64(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: AES, length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/* ── Vault creation & unlock ────────────────────────────────────────────────── */

export interface NewVaultMaterial {
  salt: string;
  kdf: VaultKdfInfo;
  wrappedByPassphrase: Sealed;
  wrappedByRecovery: Sealed;
  /** The live session key (non-extractable) so the caller can use the vault immediately. */
  sessionKey: CryptoKey;
  /** The recovery code to show the user ONCE. Never stored anywhere by us. */
  recoveryCode: string;
}

/**
 * Create a brand-new vault: generate the vault key, wrap it under both the passphrase
 * and a fresh recovery code, and hand back everything needed to persist the metadata
 * plus a ready-to-use session key.
 */
export async function createVault(passphrase: string): Promise<NewVaultMaterial> {
  const salt = randomSalt();
  const recoveryCode = generateRecoveryCode();

  // The DEK is generated extractable so it can be wrapped; it is never exported to JS
  // ourselves — wrapKey does the export inside the WebCrypto boundary — and it is
  // discarded immediately after wrapping.
  const dek = await crypto.subtle.generateKey({ name: AES, length: KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ]);

  const passKek = await deriveKek(passphrase, salt);
  const recKek = await deriveKek(normalizeRecoveryCode(recoveryCode), salt);

  const aad = aadFor(salt, PBKDF2_ITERATIONS);
  const wrappedByPassphrase = await wrapKeyWith(dek, passKek, aad);
  const wrappedByRecovery = await wrapKeyWith(dek, recKek, aad);

  // Re-open the vault key as a non-extractable session key for immediate use.
  const sessionKey = await unwrapKeyWith(wrappedByPassphrase, passKek, aad);

  return {
    salt,
    kdf: { name: KDF_NAME, iterations: PBKDF2_ITERATIONS },
    wrappedByPassphrase,
    wrappedByRecovery,
    sessionKey,
    recoveryCode,
  };
}

async function wrapKeyWith(dek: CryptoKey, kek: CryptoKey, aad: Uint8Array): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: AES, iv, additionalData: aad });
  return { ct: toB64(wrapped), iv: toB64(iv) };
}

async function unwrapKeyWith(sealed: Sealed, kek: CryptoKey, aad: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromB64(sealed.ct),
    kek,
    { name: AES, iv: fromB64(sealed.iv), additionalData: aad },
    { name: AES, length: KEY_LENGTH },
    false, // non-extractable: once the vault is open, the key cannot leave the process
    ['encrypt', 'decrypt'],
  );
}

/** Thrown when a passphrase or recovery code does not unwrap the vault. */
export class WrongSecretError extends Error {
  constructor() {
    super('That passphrase is not correct.');
    this.name = 'WrongSecretError';
  }
}

/** Unlock with the passphrase. Returns the session key, or throws WrongSecretError. */
export async function unlockWithPassphrase(
  passphrase: string,
  salt: string,
  wrappedByPassphrase: Sealed,
  iterations: number,
): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, salt);
  try {
    return await unwrapKeyWith(wrappedByPassphrase, kek, aadFor(salt, iterations));
  } catch {
    // AES-GCM authentication failure means the wrong key OR tampered metadata —
    // indistinguishable, which is correct: we reveal nothing and fail closed either way.
    throw new WrongSecretError();
  }
}

/** Unlock with the recovery code. */
export async function unlockWithRecovery(
  recoveryCode: string,
  salt: string,
  wrappedByRecovery: Sealed,
  iterations: number,
): Promise<CryptoKey> {
  const kek = await deriveKek(normalizeRecoveryCode(recoveryCode), salt);
  try {
    return await unwrapKeyWith(wrappedByRecovery, kek, aadFor(salt, iterations));
  } catch {
    throw new WrongSecretError();
  }
}

// NOTE: passphrase change / key re-wrap is intentionally NOT implemented here. Doing it
// requires an EXTRACTABLE data-encryption key in JS, which is a footgun worth avoiding
// until the feature genuinely exists — at which point it must minimise that key's
// lifetime and re-authenticate any server-supplied KDF params. Do not add an
// "unlockExtractable" helper speculatively.

/* ── Record encryption ──────────────────────────────────────────────────────── */

/** Encrypt an arbitrary JSON-serialisable record with the session key. */
export async function sealRecord(sessionKey: CryptoKey, record: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ct = await crypto.subtle.encrypt({ name: AES, iv }, sessionKey, plaintext);
  return { ct: toB64(ct), iv: toB64(iv) };
}

/** Decrypt a record. Throws if the ciphertext was tampered with or the key is wrong. */
export async function openRecord<T = unknown>(sessionKey: CryptoKey, sealed: Sealed): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: AES, iv: fromB64(sealed.iv) },
    sessionKey,
    fromB64(sealed.ct),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** True if WebCrypto is available. Old/embedded webviews without it cannot run the vault. */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && !!crypto.getRandomValues;
}

/* ── Passphrase strength ────────────────────────────────────────────────────── */

/**
 * The vault's confidentiality rests ENTIRELY on the passphrase: the adversary in the
 * threat model is precisely someone holding the wrapped key + salt from a breach,
 * attacking offline. PBKDF2-SHA256 is GPU-friendly, so a weak passphrase is recoverable
 * in hours regardless of iteration count. This gate refuses the weak passphrases a bare
 * length check would wave through. It is a heuristic, not zxcvbn — deliberately no new
 * dependency — but it blocks the common, catastrophic cases.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'passphrase', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'password1', 'password123', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon',
  'football', 'baseball', 'sunshine', 'princess', 'trustno1', 'whatever', 'changeme',
  'journalist', 'source', 'secret', 'plajah', 'postman', 'security', 'private',
]);

export type PassphraseStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PassphraseAssessment {
  ok: boolean;
  strength: PassphraseStrength;
  reason?: string;
}

/** Rough entropy estimate in bits from the character classes used and the length. */
function estimateBits(p: string): number {
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(p)) pool += 32;
  const uniqueness = new Set(p).size / Math.max(p.length, 1); // penalise "aaaaaaaa"
  return p.length * Math.log2(pool || 1) * Math.max(0.35, uniqueness);
}

export function assessPassphrase(p: string): PassphraseAssessment {
  const trimmed = p.trim();
  if (trimmed.length < 12) {
    return { ok: false, strength: 'weak', reason: 'Use at least 12 characters — a short phrase of a few words works well.' };
  }
  const lower = trimmed.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || [...COMMON_PASSWORDS].some((w) => lower === w || lower === w + '1' || lower === w + '!')) {
    return { ok: false, strength: 'weak', reason: 'That is one of the most-guessed passwords. Choose something only you would think of.' };
  }
  if (/^(.)\1+$/.test(trimmed) || /^(012|123|234|345|456|567|678|789|890|abc|qwe)/.test(lower)) {
    return { ok: false, strength: 'weak', reason: 'That is too predictable. Mix in your own words.' };
  }
  const bits = estimateBits(trimmed);
  if (bits < 45) return { ok: false, strength: 'weak', reason: 'Too easy to guess. Make it longer, or add words.' };
  if (bits < 60) return { ok: true, strength: 'fair' };
  if (bits < 80) return { ok: true, strength: 'good' };
  return { ok: true, strength: 'strong' };
}
