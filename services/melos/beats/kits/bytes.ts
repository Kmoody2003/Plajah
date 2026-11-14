// Byte-level helpers for kit import: gzip/deflate (DecompressionStream — browsers and Node 18+),
// a zip reader that works on a Blob (central directory only, so a 2 GB Studio One .soundset
// never loads whole), a tar reader (.h2drumkit), embedded sample-path scanning for the
// proprietary binary formats, and AIFF → WAV (Chromium's decodeAudioData can't read AIFF).

import { AUDIO_EXT } from './types';

type Fmt = 'gzip' | 'deflate' | 'deflate-raw';

export async function inflate(bytes: Uint8Array, format: Fmt): Promise<Uint8Array> {
  const ds = new DecompressionStream(format as CompressionFormat);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

export const utf8 = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);

// ── Zip ──────────────────────────────────────────────────────────────────────

export interface ZipEntry { name: string; method: number; compSize: number; size: number; localOffset: number }
/** Anything sliceable — a File/Blob from the picker, or a Blob wrapped around test bytes. */
export type Sliceable = { size: number; slice: (a: number, b: number) => Blob };

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const bytesOf = async (f: Sliceable, a: number, b: number) => new Uint8Array(await f.slice(a, b).arrayBuffer());

export async function zipEntries(file: Sliceable): Promise<ZipEntry[]> {
  // End-of-central-directory sits in the last 64 KB + 22 bytes.
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = await bytesOf(file, tailStart, file.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tv, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = u16(tv, eocd + 10);
  const cdSize = u32(tv, eocd + 12);
  const cdOff = u32(tv, eocd + 16);
  const cd = await bytesOf(file, cdOff, cdOff + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out: ZipEntry[] = [];
  let o = 0;
  for (let n = 0; n < count && o + 46 <= cd.length; n++) {
    if (u32(v, o) !== 0x02014b50) break;
    const method = u16(v, o + 10);
    const compSize = u32(v, o + 20);
    const size = u32(v, o + 24);
    const nl = u16(v, o + 28), el = u16(v, o + 30), cl = u16(v, o + 32);
    const localOffset = u32(v, o + 42);
    const name = utf8(cd.subarray(o + 46, o + 46 + nl));
    out.push({ name, method, compSize, size, localOffset });
    o += 46 + nl + el + cl;
  }
  return out;
}

export async function zipRead(file: Sliceable, e: ZipEntry): Promise<Uint8Array> {
  const head = await bytesOf(file, e.localOffset, e.localOffset + 30);
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const start = e.localOffset + 30 + u16(hv, 26) + u16(hv, 28);
  const raw = await bytesOf(file, start, start + e.compSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflate(raw, 'deflate-raw');
  throw new Error(`zip method ${e.method} unsupported`);
}

// ── Tar ──────────────────────────────────────────────────────────────────────

export function tarEntries(b: Uint8Array): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  let o = 0;
  while (o + 512 <= b.length) {
    const name0 = utf8(b.subarray(o, o + 100)).replace(/\0.*$/s, '');
    if (!name0) break;
    const prefix = utf8(b.subarray(o + 345, o + 500)).replace(/\0.*$/s, '');
    const size = parseInt(utf8(b.subarray(o + 124, o + 136)).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(b[o + 156]);
    const name = prefix ? `${prefix}/${name0}` : name0;
    if (type === '0' || type === '\0') out.push({ name, data: b.subarray(o + 512, o + 512 + size) });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// ── Embedded sample paths (Maschine, Battery, Bitwig) ────────────────────────
//
// Maschine groups/sounds, Battery kits and Bitwig presets are proprietary binaries, but each
// stores its sample references as plain strings (UTF-16LE in NI files; length-prefixed UTF-8 in
// Bitwig). Pulling every string that ends in an audio extension, in file order, recovers the
// kit's sample list in its pad order. Zlib-packed sections are inflated and scanned too.

const PATHISH = /[\\/:]/;

/** Audio-file strings in order of appearance (deduped, first occurrence wins). */
export function scanAudioStrings(b: Uint8Array): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim().replace(/^file:\/\/\/?/i, '');
    if (!AUDIO_EXT.test(t) || t.length < 5) return;
    // Trim leading junk a scan can pick up before a path (a length byte that is printable).
    const m = /([A-Za-z]:[\\/]|[\\/]|\.\.?[\\/]|~[\\/])?[^\0<>"|?*\r\n]*$/.exec(t);
    const v = (m ? m[0] : t).trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) return;
    seen.add(key);
    found.push(v);
  };
  // UTF-16LE runs: printable code units, even or odd alignment.
  for (const start of [0, 1]) {
    let run = '';
    for (let i = start; i + 1 < b.length; i += 2) {
      const c = b[i] | (b[i + 1] << 8);
      if (c >= 0x20 && c !== 0x7f && c < 0xd800) run += String.fromCharCode(c);
      else { if (run.length >= 5) push(run); run = ''; }
    }
    if (run.length >= 5) push(run);
  }
  // Single-byte runs (UTF-8 / ASCII).
  let run: number[] = [];
  const flush = () => { if (run.length >= 5) push(utf8(Uint8Array.from(run))); run = []; };
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if ((c >= 0x20 && c < 0x7f) || c >= 0x80) run.push(c); else flush();
  }
  flush();
  // Bare file names are only trusted when nothing path-like turned up.
  const withPaths = found.filter((s) => PATHISH.test(s));
  return withPaths.length ? withPaths.concat(found.filter((s) => !PATHISH.test(s) && !withPaths.some((p) => p.toLowerCase().endsWith(s.toLowerCase())))) : found;
}

/** Scan, and if a binary held nothing readable, try its zlib-packed sections. */
export async function scanAudioStringsDeep(b: Uint8Array): Promise<string[]> {
  const direct = scanAudioStrings(b);
  if (direct.length) return direct;
  const out: string[] = [];
  for (const inner of await zlibSections(b)) for (const s of scanAudioStrings(inner)) if (!out.includes(s)) out.push(s);
  return out;
}

/** Every zlib-packed section of a binary, inflated (Kontakt 2–4 keep their instrument XML there). */
export async function zlibSections(b: Uint8Array, maxTries = 48): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  let tries = 0;
  for (let i = 0; i + 2 < b.length && tries < maxTries; i++) {
    if (b[i] !== 0x78 || !(b[i + 1] === 0x9c || b[i + 1] === 0xda || b[i + 1] === 0x01 || b[i + 1] === 0x5e)) continue;
    tries++;
    try {
      const inner = await inflateLenient(b.subarray(i));
      if (inner.length) out.push(inner);
    } catch { /* not a stream */ }
  }
  return out;
}

/** Inflate a zlib stream that may be followed by unrelated bytes (keeps what decoded). */
async function inflateLenient(b: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  void writer.write(b as BufferSource).catch(() => {});
  void writer.close().catch(() => {});
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value); total += value.length;
      if (total > 8_000_000) break;
    }
  } catch { /* trailing garbage — keep what decoded */ }
  const out = new Uint8Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── AIFF → WAV ───────────────────────────────────────────────────────────────

const isAiff = (b: Uint8Array) => b.length > 12 && utf8(b.subarray(0, 4)) === 'FORM' && /^AIF[FC]$/.test(utf8(b.subarray(8, 12)));

/** 80-bit IEEE extended → number (AIFF sample rate). */
function ext80(v: DataView, o: number): number {
  const exp = v.getUint16(o) & 0x7fff;
  const hi = v.getUint32(o + 2), lo = v.getUint32(o + 6);
  if (!exp && !hi && !lo) return 0;
  return (hi * 2 ** -31 + lo * 2 ** -63) * 2 ** (exp - 16383);
}

/** Uncompressed AIFF (and AIFC 'NONE'/'sowt') → 16/24-bit PCM WAV bytes. Other input unchanged. */
export function aiffToWav(b: Uint8Array): Uint8Array {
  if (!isAiff(b)) return b;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let ch = 0, bits = 0, rate = 0, little = false;
  let data: Uint8Array | null = null;
  let o = 12;
  while (o + 8 <= b.length) {
    const id = utf8(b.subarray(o, o + 4));
    const size = v.getUint32(o + 4);
    const body = o + 8;
    if (id === 'COMM') {
      ch = v.getUint16(body); bits = v.getUint16(body + 6); rate = ext80(v, body + 8);
      if (size >= 22) { const ct = utf8(b.subarray(body + 18, body + 22)); if (ct === 'sowt') little = true; else if (ct !== 'NONE' && ct !== 'twos') return b; }
    } else if (id === 'SSND') {
      const offset = v.getUint32(body);
      data = b.subarray(body + 8 + offset, Math.min(b.length, body + size));
    }
    o = body + size + (size % 2);
  }
  if (!data || !ch || !bits || !rate) return b;
  const bps = Math.ceil(bits / 8);
  const pcm = new Uint8Array(data.length);
  // WAV is little-endian; AIFF big-endian (8-bit AIFF is signed, WAV 8-bit unsigned).
  for (let i = 0; i + bps <= data.length; i += bps) {
    for (let k = 0; k < bps; k++) pcm[i + k] = little ? data[i + k] : data[i + bps - 1 - k];
    if (bps === 1) pcm[i] = (pcm[i] + 128) & 0xff;
  }
  const out = new Uint8Array(44 + pcm.length);
  const w = new DataView(out.buffer);
  const tag = (o2: number, s: string) => { for (let i = 0; i < 4; i++) out[o2 + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); w.setUint32(4, 36 + pcm.length, true); tag(8, 'WAVE');
  tag(12, 'fmt '); w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, ch, true);
  w.setUint32(24, Math.round(rate), true); w.setUint32(28, Math.round(rate) * ch * bps, true);
  w.setUint16(32, ch * bps, true); w.setUint16(34, bps * 8, true);
  tag(36, 'data'); w.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

// ── WAV facts (rate + the sampler `smpl` chunk) ──────────────────────────────

export interface WavFacts {
  sampleRate: number;
  /** From `smpl`: the MIDI note the sample was recorded at, and its loop (frames), when present. */
  rootNote?: number;
  fineCents?: number;
  loopStart?: number;
  loopEnd?: number;
}

/** Read a WAV's rate and its `smpl` chunk. Loop points in the file are in the FILE's frames —
 *  decodeAudioData resamples, so callers rescale by decodedRate / sampleRate. */
export function wavFacts(b: Uint8Array): WavFacts | null {
  if (b.length < 12 || utf8(b.subarray(0, 4)) !== 'RIFF' || utf8(b.subarray(8, 12)) !== 'WAVE') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: WavFacts = { sampleRate: 0 };
  let o = 12;
  while (o + 8 <= b.length) {
    const id = utf8(b.subarray(o, o + 4));
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ' && body + 8 <= b.length) out.sampleRate = v.getUint32(body + 4, true);
    else if (id === 'smpl' && body + 36 <= b.length) {
      const unity = v.getUint32(body + 12, true);
      const frac = v.getUint32(body + 16, true);
      const loops = v.getUint32(body + 28, true);
      if (unity <= 127 && unity > 0) { out.rootNote = unity; out.fineCents = Math.round((frac / 0x100000000) * 100); }
      if (loops > 0 && body + 36 + 24 <= b.length) {
        const ls = v.getUint32(body + 36 + 8, true), le = v.getUint32(body + 36 + 12, true);
        if (le > ls) { out.loopStart = ls; out.loopEnd = le + 1; } // smpl's end is inclusive
      }
    }
    o = body + size + (size % 2);
  }
  return out.sampleRate ? out : null;
}
