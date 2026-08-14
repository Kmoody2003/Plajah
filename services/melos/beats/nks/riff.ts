// Minimal RIFF walker for NKS preset files (.nksf / .nksn / .nkm).
// Layout (community-documented; jhorology/nks-json, gulp-nks-rewrite-meta):
//   'RIFF' <u32 size> 'NIKS'
//     'NISI' <u32 size> <u32 version> <MessagePack>   summary metadata (name, author, tags…)
//     'NICA' <u32 size> <u32 version> <MessagePack>   controller assignments (knob pages)
//     'PLID' <u32 size> <u32 version> <MessagePack>   plugin identity
//     'PCHK' <u32 size> <u32 version> <opaque>        plugin state — NOT readable in a browser
// Chunks are word-aligned (odd sizes are padded by one byte).

export interface RiffChunks { form: string; chunks: Record<string, Uint8Array> }

const fourCC = (v: DataView, off: number): string =>
  String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));

export function parseRiff(bytes: Uint8Array): RiffChunks | null {
  if (bytes.length < 12) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fourCC(v, 0) !== 'RIFF') return null;
  const form = fourCC(v, 8);
  const chunks: Record<string, Uint8Array> = {};
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = fourCC(v, off);
    const size = v.getUint32(off + 4, true);
    const start = off + 8;
    if (size < 0 || start + size > bytes.length) break;
    chunks[id] = bytes.subarray(start, start + size);
    off = start + size + (size % 2); // word alignment
  }
  return { form, chunks };
}

/** Strip the leading u32 version word that precedes the MessagePack payload in NI chunks. */
export const msgpackPayload = (chunk: Uint8Array): Uint8Array =>
  chunk.length > 4 ? chunk.subarray(4) : chunk;
