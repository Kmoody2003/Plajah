// mediaEngine/blackmagic/auth.ts — pairing proofs shared by the bridge (Node) and the app (browser).
// Web Crypto only, so one implementation runs in both. The token itself never crosses the wire:
// the bridge sends a random nonce, the client answers HMAC-SHA256(token, nonce), and the relay room id is
// a one-way hash of the token.

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

function subtle(): SubtleCrypto {
  const s = (globalThis as any).crypto?.subtle as SubtleCrypto | undefined;
  if (!s) throw new Error('This page cannot do secure pairing (needs https or localhost).');
  return s;
}

export async function hmacHex(token: string, message: string): Promise<string> {
  const key = await subtle().importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await subtle().sign('HMAC', key, enc.encode(message)));
}

export async function roomIdFor(token: string): Promise<string> {
  return hex(await subtle().digest('SHA-256', enc.encode(`plajah-bm-room:${token}`)));
}

export function randomNonce(): string {
  const b = new Uint8Array(16);
  (globalThis as any).crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Constant-time compare of two hex strings. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
