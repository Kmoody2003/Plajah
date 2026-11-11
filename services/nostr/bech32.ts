// ─── NIP-19 bech32 entities ───────────────────────────────────────────────────
// npub / nsec / note: bech32 of 32 raw bytes. nprofile / nevent / naddr: bech32 of a TLV list
//   0 special (pubkey | event id | naddr identifier string), 1 relay (ascii), 2 author (32 bytes), 3 kind (u32 BE).
// Pure, no dependency, usable from the browser too (no node: imports here).

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const LIMIT = 5000; // NIP-19 entities can exceed BIP-173's 90 chars

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
const hrpExpand = (hrp: string) => [...[...hrp].map(c => c.charCodeAt(0) >> 5), 0, ...[...hrp].map(c => c.charCodeAt(0) & 31)];

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [], maxv = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < 0 || v >> from) throw new Error('bad bech32 data');
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) throw new Error('bad bech32 padding');
  return out;
}

export function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const data = convertBits(bytes, 8, 5, true);
  const chk = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (chk >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...checksum].map(d => CHARSET[d]).join('');
}

export function bech32Decode(str: string): { hrp: string; bytes: Uint8Array } {
  if (str.length > LIMIT) throw new Error('bech32 too long');
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) throw new Error('mixed case');
  const s = str.toLowerCase();
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) throw new Error('bad bech32');
  const hrp = s.slice(0, pos);
  const data = [...s.slice(pos + 1)].map(c => { const i = CHARSET.indexOf(c); if (i < 0) throw new Error('bad bech32 char'); return i; });
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('bad bech32 checksum');
  return { hrp, bytes: Uint8Array.from(convertBits(data.slice(0, -6), 5, 8, false)) };
}

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
function unhex(h: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(h)) throw new Error('bad hex');
  return Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16));
}
const is32 = (h: string) => /^[0-9a-f]{64}$/i.test(h);
const enc = new TextEncoder(), dec = new TextDecoder();

function tlv(entries: [number, Uint8Array][]): Uint8Array {
  const parts: number[] = [];
  for (const [t, v] of entries) { if (v.length > 255) throw new Error('TLV value too long'); parts.push(t, v.length, ...v); }
  return Uint8Array.from(parts);
}
function parseTlv(b: Uint8Array): Map<number, Uint8Array[]> {
  const m = new Map<number, Uint8Array[]>();
  for (let i = 0; i < b.length;) {
    const t = b[i], l = b[i + 1], v = b.subarray(i + 2, i + 2 + l);
    if (v.length < l) throw new Error('truncated TLV');
    m.set(t, [...(m.get(t) ?? []), v]);
    i += 2 + l;
  }
  return m;
}
const u32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export const npubEncode = (pubHex: string) => { if (!is32(pubHex)) throw new Error('bad pubkey'); return bech32Encode('npub', unhex(pubHex)); };
export const nsecEncode = (secHex: string) => { if (!is32(secHex)) throw new Error('bad secret'); return bech32Encode('nsec', unhex(secHex)); };
export const noteEncode = (idHex: string) => { if (!is32(idHex)) throw new Error('bad id'); return bech32Encode('note', unhex(idHex)); };

export function neventEncode(p: { id: string; relays?: string[]; author?: string; kind?: number }): string {
  const e: [number, Uint8Array][] = [[0, unhex(p.id)]];
  for (const r of p.relays ?? []) e.push([1, enc.encode(r)]);
  if (p.author) e.push([2, unhex(p.author)]);
  if (p.kind != null) e.push([3, u32(p.kind)]);
  return bech32Encode('nevent', tlv(e));
}
export function nprofileEncode(p: { pubkey: string; relays?: string[] }): string {
  return bech32Encode('nprofile', tlv([[0, unhex(p.pubkey)], ...(p.relays ?? []).map(r => [1, enc.encode(r)] as [number, Uint8Array])]));
}
export function naddrEncode(p: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
  return bech32Encode('naddr', tlv([
    [0, enc.encode(p.identifier)], ...(p.relays ?? []).map(r => [1, enc.encode(r)] as [number, Uint8Array]),
    [2, unhex(p.pubkey)], [3, u32(p.kind)],
  ]));
}

export type Nip19 =
  | { type: 'npub'; data: string } | { type: 'nsec'; data: string } | { type: 'note'; data: string }
  | { type: 'nprofile'; data: { pubkey: string; relays: string[] } }
  | { type: 'nevent'; data: { id: string; relays: string[]; author?: string; kind?: number } }
  | { type: 'naddr'; data: { identifier: string; pubkey: string; kind: number; relays: string[] } };

export function nip19Decode(s: string): Nip19 {
  const { hrp, bytes } = bech32Decode(s.replace(/^nostr:/, ''));
  const k32 = (b?: Uint8Array) => { if (!b || b.length !== 32) throw new Error(`bad ${hrp}`); return hex(b); };
  const kind = (b?: Uint8Array) => (b && b.length === 4 ? ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0 : undefined);
  switch (hrp) {
    case 'npub': case 'nsec': case 'note': return { type: hrp, data: k32(bytes) } as Nip19;
    case 'nprofile': { const t = parseTlv(bytes); return { type: 'nprofile', data: { pubkey: k32(t.get(0)?.[0]), relays: (t.get(1) ?? []).map(r => dec.decode(r)) } }; }
    case 'nevent': {
      const t = parseTlv(bytes);
      const author = t.get(2)?.[0];
      return { type: 'nevent', data: { id: k32(t.get(0)?.[0]), relays: (t.get(1) ?? []).map(r => dec.decode(r)), author: author ? k32(author) : undefined, kind: kind(t.get(3)?.[0]) } };
    }
    case 'naddr': {
      const t = parseTlv(bytes);
      const k = kind(t.get(3)?.[0]);
      if (k == null) throw new Error('naddr missing kind');
      return { type: 'naddr', data: { identifier: dec.decode(t.get(0)?.[0] ?? new Uint8Array()), pubkey: k32(t.get(2)?.[0]), kind: k, relays: (t.get(1) ?? []).map(r => dec.decode(r)) } };
    }
    default: throw new Error(`unknown NIP-19 prefix ${hrp}`);
  }
}

/** Accept a hex pubkey, npub, or nprofile; return lowercase hex or null. */
export function normalizePubkey(input: string): string | null {
  const s = String(input || '').trim();
  if (is32(s)) return s.toLowerCase();
  try {
    const d = nip19Decode(s);
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch { /* not bech32 */ }
  return null;
}
