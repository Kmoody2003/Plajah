/**
 * Application-layer AES-GCM-256 encryption for private messages.
 * Keys are derived per-room via PBKDF2 so no message text is ever stored in
 * plaintext in Firestore, protecting data at rest against database breaches.
 *
 * Security model: keys are deterministically derived from the room ID + an
 * app-wide salt. This means the ciphertext is unreadable to anyone without
 * the source — it is NOT true end-to-end encryption (the server owner could
 * derive keys). For full E2E, per-user asymmetric keys are required.
 */

const APP_SALT = 'plajah-e2e-v1-salt-2026';

// Warm key cache — avoids re-running 100k PBKDF2 iterations on every message
const keyCache = new Map<string, Promise<CryptoKey>>();

async function deriveRoomKey(roomId: string): Promise<CryptoKey> {
  if (keyCache.has(roomId)) return keyCache.get(roomId)!;

  const promise = (async () => {
    const enc = new TextEncoder();
    const raw = await crypto.subtle.importKey(
      'raw',
      enc.encode(roomId),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(APP_SALT),
        iterations: 100_000,
        hash: 'SHA-256',
      },
      raw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  })();

  keyCache.set(roomId, promise);
  return promise;
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Encrypt a plaintext string for a given room. Returns a base64 blob. */
export async function encryptText(plaintext: string, roomId: string): Promise<string> {
  const key = await deriveRoomKey(roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Prepend IV so we can use a fresh IV per message
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return `enc:${toBase64(combined.buffer)}`;
}

/**
 * Decrypt a previously encrypted blob. Returns the original plaintext.
 * If the string does not start with the "enc:" prefix it was stored before
 * encryption was enabled — return as-is for backward compatibility.
 */
export async function decryptText(encrypted: string, roomId: string): Promise<string> {
  if (!encrypted.startsWith('enc:')) return encrypted;
  try {
    const combined = fromBase64(encrypted.slice(4));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveRoomKey(roomId);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '[Encrypted message]';
  }
}

/** Returns true if a string is an encrypted blob produced by encryptText. */
export const isEncrypted = (s: string) => s.startsWith('enc:');

// ── Safeword-scoped encryption (Couples Diary) ──────────────────────────────────
// The key is derived from arbitrary secret material (deriveRoomKey treats its arg
// as key material), so passing `${roomId}::${safeword}` yields a key that requires
// BOTH the room and the shared safeword. Same AES-GCM/PBKDF2 pipeline as messages.

/** Encrypt with an arbitrary secret (e.g. `roomId::safeword`). Returns a base64 blob. */
export async function encryptWith(plaintext: string, secret: string): Promise<string> {
  return encryptText(plaintext, secret);
}

/** Decrypt a blob produced by encryptWith using the same secret. */
export async function decryptWith(encrypted: string, secret: string): Promise<string> {
  return decryptText(encrypted, secret);
}

/**
 * One-way hash of a secret (SHA-256 → base64), salted with the app salt.
 * Used to VERIFY a safeword without ever storing it in plaintext.
 */
export async function hashSecret(secret: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${APP_SALT}:${secret}`));
  return toBase64(buf);
}
