// Per-actor RSA keys. The public half is published on the actor document; the private half is stored ONLY
// server-side, AES-256-GCM encrypted with ENCRYPTION_KEY — the same key and wire format as encryptCreds in
// services/fediverse/auth.ts ("{iv_hex}:{tag_hex}:{ciphertext_hex}"), so one secret protects all network creds.
// PURE apart from node:crypto; the key material can be injected for tests.

import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes } from 'node:crypto';

export function encryptionKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.ENCRYPTION_KEY ?? '';
  if (raw.length < 16) throw new Error('ENCRYPTION_KEY env var must be at least 16 chars (32 hex = 64 chars ideal)');
  return Buffer.from(raw.padEnd(64, '0').slice(0, 64), 'hex');
}

export function generateActorKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

export function encryptPrivateKey(pem: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(pem, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

export function decryptPrivateKey(stored: string, key: Buffer = encryptionKey()): string {
  const [ivHex, tagHex, ctHex] = String(stored).split(':');
  if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid encrypted key format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}
