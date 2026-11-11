// ─── BIP-340 Schnorr over secp256k1 (Nostr signatures) ───────────────────────
// Pure TypeScript on BigInt + node:crypto SHA-256. No dependency: @noble/curves sits in node_modules only as a
// transitive dependency, so leaning on it would break the day that package drops it. The test file cross-checks
// this against the official BIP-340 vectors (and against noble when it happens to be installed).
//
// Speed: s·G uses a precomputed 4-bit fixed-window table (64 additions); e·P is plain double-and-add. A verify
// costs a few milliseconds, which is fine for challenge events, zap receipts and a cached public feed.
// Not constant-time. Server-held keys are opt-in and rare; browsers sign with the user's own NIP-07/NIP-46 signer.

import { createHash, randomBytes } from 'node:crypto';

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const mod = (a: bigint, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };

function powMod(b: bigint, e: bigint, m = P): bigint {
  let r = 1n; b = mod(b, m);
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const inv = (a: bigint, m = P) => powMod(a, m - 2n, m);

// Jacobian point (X, Y, Z); Z = 0 is infinity.
type J = [bigint, bigint, bigint];
const INF: J = [0n, 1n, 0n];

function dbl([x, y, z]: J): J {
  if (z === 0n || y === 0n) return INF;
  const yy = (y * y) % P;
  const s = (4n * x * yy) % P;
  const m = (3n * x * x) % P;
  const x3 = mod(m * m - 2n * s);
  const y3 = mod(m * (s - x3) - 8n * yy * yy);
  const z3 = (2n * y * z) % P;
  return [x3, y3, z3];
}

function add(a: J, b: J): J {
  if (a[2] === 0n) return b;
  if (b[2] === 0n) return a;
  const z1z1 = (a[2] * a[2]) % P, z2z2 = (b[2] * b[2]) % P;
  const u1 = (a[0] * z2z2) % P, u2 = (b[0] * z1z1) % P;
  const s1 = (a[1] * b[2] * z2z2) % P, s2 = (b[1] * a[2] * z1z1) % P;
  if (u1 === u2) return s1 === s2 ? dbl(a) : INF;
  const h = mod(u2 - u1), r = mod(s2 - s1);
  const hh = (h * h) % P, hhh = (h * hh) % P, v = (u1 * hh) % P;
  const x3 = mod(r * r - hhh - 2n * v);
  const y3 = mod(r * (v - x3) - s1 * hhh);
  const z3 = (a[2] * b[2] * h) % P;
  return [x3, y3, z3];
}

function toAffine(p: J): [bigint, bigint] | null {
  if (p[2] === 0n) return null;
  const zi = inv(p[2]), zi2 = (zi * zi) % P;
  return [(p[0] * zi2) % P, (p[1] * zi2 * zi) % P];
}

function mulPoint(p: J, k: bigint): J {
  let r = INF, q = p;
  while (k > 0n) { if (k & 1n) r = add(r, q); q = dbl(q); k >>= 1n; }
  return r;
}

// Fixed-window table for G: TABLE[w][d] = d · 16^w · G, d in 0..15.
let TABLE: J[][] | null = null;
function gTable(): J[][] {
  if (TABLE) return TABLE;
  const t: J[][] = [];
  let base: J = [GX, GY, 1n];
  for (let w = 0; w < 64; w++) {
    const row: J[] = [INF];
    for (let d = 1; d < 16; d++) row.push(add(row[d - 1], base));
    t.push(row);
    base = add(row[15], base); // 16 · base
  }
  return (TABLE = t);
}
function mulG(k: bigint): J {
  const t = gTable();
  let r = INF;
  for (let w = 0; w < 64 && k > 0n; w++) { const d = Number(k & 15n); if (d) r = add(r, t[w][d]); k >>= 4n; }
  return r;
}

// ── bytes ─────────────────────────────────────────────────────────────────────

export const hexToBytes = (h: string): Uint8Array => {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(h)) throw new Error('bad hex');
  return Uint8Array.from(Buffer.from(h, 'hex'));
};
export const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const b2n = (b: Uint8Array) => BigInt('0x' + (bytesToHex(b) || '0'));
const n2b = (n: bigint) => hexToBytes(n.toString(16).padStart(64, '0'));
const concat = (...a: Uint8Array[]) => Uint8Array.from(Buffer.concat(a.map(x => Buffer.from(x))));

export const sha256 = (b: Uint8Array | string): Uint8Array =>
  Uint8Array.from(createHash('sha256').update(typeof b === 'string' ? Buffer.from(b, 'utf8') : b).digest());

const tagCache = new Map<string, Uint8Array>();
function taggedHash(tag: string, ...msgs: Uint8Array[]): Uint8Array {
  let th = tagCache.get(tag);
  if (!th) { const h = sha256(tag); th = concat(h, h); tagCache.set(tag, th); }
  return sha256(concat(th, ...msgs));
}

function liftX(x: bigint): J | null {
  if (x <= 0n || x >= P) return null;
  const c = mod(x * x * x + 7n);
  let y = powMod(c, (P + 1n) / 4n);
  if ((y * y) % P !== c) return null;
  if (y & 1n) y = P - y;
  return [x, y, 1n];
}

// ── public API (hex in / hex out, matching Nostr's wire format) ───────────────

/** x-only public key (32-byte hex) for a 32-byte hex secret key. */
export function getPublicKey(secHex: string): string {
  const d = b2n(hexToBytes(secHex));
  if (d <= 0n || d >= N) throw new Error('invalid secret key');
  const a = toAffine(mulG(d))!;
  return bytesToHex(n2b(a[0]));
}

export function generateSecretKey(): string {
  for (;;) {
    const k = randomBytes(32);
    const n = b2n(k);
    if (n > 0n && n < N) return k.toString('hex');
  }
}

/** BIP-340 sign. `auxHex` is 32 bytes of randomness (tests pass fixed values). */
export function schnorrSign(msgHex: string, secHex: string, auxHex: string = randomBytes(32).toString('hex')): string {
  const m = hexToBytes(msgHex);
  const d0 = b2n(hexToBytes(secHex));
  if (d0 <= 0n || d0 >= N) throw new Error('invalid secret key');
  const Pa = toAffine(mulG(d0))!;
  const d = Pa[1] & 1n ? N - d0 : d0;
  const px = n2b(Pa[0]);
  const t = n2b(d ^ b2n(taggedHash('BIP0340/aux', hexToBytes(auxHex))));
  const k0 = mod(b2n(taggedHash('BIP0340/nonce', t, px, m)), N);
  if (k0 === 0n) throw new Error('nonce is zero');
  const Ra = toAffine(mulG(k0))!;
  const k = Ra[1] & 1n ? N - k0 : k0;
  const rx = n2b(Ra[0]);
  const e = mod(b2n(taggedHash('BIP0340/challenge', rx, px, m)), N);
  const sig = concat(rx, n2b(mod(k + e * d, N)));
  return bytesToHex(sig);
}

export function schnorrVerify(sigHex: string, msgHex: string, pubHex: string): boolean {
  try {
    if (!/^[0-9a-f]{128}$/i.test(sigHex) || !/^[0-9a-f]{64}$/i.test(pubHex)) return false;
    const sig = hexToBytes(sigHex), m = hexToBytes(msgHex), px = hexToBytes(pubHex);
    const Pp = liftX(b2n(px));
    if (!Pp) return false;
    const r = b2n(sig.subarray(0, 32)), s = b2n(sig.subarray(32, 64));
    if (r >= P || s >= N) return false;
    const e = mod(b2n(taggedHash('BIP0340/challenge', sig.subarray(0, 32), px, m)), N);
    const R = add(mulG(s), mulPoint([Pp[0], P - Pp[1], 1n], e));
    const Ra = toAffine(R);
    if (!Ra || Ra[1] & 1n) return false;
    return Ra[0] === r;
  } catch { return false; }
}
