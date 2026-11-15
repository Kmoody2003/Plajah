// Signed Mux playback tokens (server only). Internal org media is uploaded with playback_policy 'signed',
// so https://stream.mux.com/{playbackId}.m3u8 refuses to play without ?token=<JWT>. The JWT is RS256,
// signed with a Mux signing key (Mux dashboard → Settings → Signing keys):
//   MUX_SIGNING_KEY_ID           the key id
//   MUX_SIGNING_PRIVATE_KEY      the private key, base64 as Mux shows it (a raw PEM also works)
// Claims: sub = playback id, aud = 'v' video | 't' thumbnail | 's' storyboard, exp, kid.
import * as nodeCrypto from 'node:crypto';

export type MuxTokenAud = 'v' | 't' | 's';

export interface MuxSigningKey { keyId: string; privateKeyPem: string }

/** The configured signing key, or null when signed playback isn't set up yet. */
export function signingKeyFromEnv(env: Record<string, string | undefined> = process.env): MuxSigningKey | null {
  const keyId = (env.MUX_SIGNING_KEY_ID || '').trim();
  const raw = (env.MUX_SIGNING_PRIVATE_KEY || '').trim();
  if (!keyId || !raw) return null;
  const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
  if (!pem.includes('BEGIN')) return null;
  return { keyId, privateKeyPem: pem };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** A Mux playback JWT for one playback id, valid for `ttlSec`. */
export function signMuxPlayback(playbackId: string, aud: MuxTokenAud, key: MuxSigningKey, ttlSec = 6 * 3600, now = Date.now()): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: key.keyId };
  const payload = { sub: playbackId, aud, exp: Math.floor(now / 1000) + ttlSec, kid: key.keyId };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = nodeCrypto.createSign('RSA-SHA256').update(input).sign(key.privateKeyPem);
  return `${input}.${b64url(sig)}`;
}
