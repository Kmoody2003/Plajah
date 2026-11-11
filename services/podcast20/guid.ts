// podcast:guid — UUIDv5 of the feed URL (scheme and trailing slashes stripped) in the Podcast Index
// namespace ead4c236-bf58-58c6-a2c6-a6b28d128cb6. Pure SHA-1 so it runs in the browser too.

export const PODCAST_GUID_NAMESPACE = 'ead4c236-bf58-58c6-a2c6-a6b28d128cb6';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** SHA-1 over bytes. Returns the 20-byte digest. */
export function sha1Bytes(msg: Uint8Array): Uint8Array {
  const ml = msg.length;
  const withPad = ((ml + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(withPad);
  buf.set(msg);
  buf[ml] = 0x80;
  const bits = ml * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(withPad - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(withPad - 4, bits >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => odv.setUint32(i * 4, h));
  return out;
}

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export const sha1Hex = (s: string): string => hex(sha1Bytes(utf8(s)));

function uuidBytes(uuid: string): Uint8Array {
  const h = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(h)) throw new Error('bad uuid');
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}

export function uuidv5(name: string, namespace: string): string {
  const ns = uuidBytes(namespace);
  const n = utf8(name);
  const all = new Uint8Array(ns.length + n.length);
  all.set(ns); all.set(n, ns.length);
  const d = sha1Bytes(all).slice(0, 16);
  d[6] = (d[6] & 0x0f) | 0x50;
  d[8] = (d[8] & 0x3f) | 0x80;
  const h = hex(d);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The spec's normalisation: drop the scheme ("https://") and any trailing slashes. */
export function normalizeFeedUrlForGuid(feedUrl: string): string {
  return feedUrl.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
}

export const podcastGuidFor = (feedUrl: string): string => uuidv5(normalizeFeedUrlForGuid(feedUrl), PODCAST_GUID_NAMESPACE);

export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
