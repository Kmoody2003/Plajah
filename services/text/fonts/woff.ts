// woff — unwrap WOFF 1.0 (zlib per table) into a plain sfnt the engine can parse.
//
// Uploads arrive as TTF, OTF, TTC or WOFF. WOFF1 is just sfnt tables, each optionally
// zlib-compressed, so rebuilding the table directory is all it takes (fflate is already a
// dependency). WOFF2 needs Brotli plus glyf/loca reconstruction; it is detected and refused with a
// clear error rather than mis-parsed (see docs/text/TEXT_ENGINE.md, known limits).

import { unzlibSync } from 'fflate';

export type FontFormat = 'ttf' | 'otf' | 'ttc' | 'woff' | 'woff2' | 'unknown';

export function sniffFontFormat(b: Uint8Array): FontFormat {
  if (b.length < 4) return 'unknown';
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'ttcf') return 'ttc';
  if (tag === 'OTTO') return 'otf';
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === 'true') return 'ttf';
  return 'unknown';
}

export function woffToSfnt(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0) !== 0x774F4646) throw new Error('not a WOFF file');
  const flavor = dv.getUint32(4);
  const numTables = dv.getUint16(12);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = dv.getUint32(o), offset = dv.getUint32(o + 4), compLength = dv.getUint32(o + 8), origLength = dv.getUint32(o + 12), checksum = dv.getUint32(o + 16);
    const raw = b.subarray(offset, offset + compLength);
    const data = compLength < origLength ? unzlibSync(raw) : raw;
    if (data.length !== origLength) throw new Error('WOFF table length mismatch');
    tables.push({ tag, checksum, data });
  }
  tables.sort((a, c) => a.tag - c.tag);
  const headerLen = 12 + numTables * 16;
  let total = headerLen;
  for (const t of tables) total += (t.data.length + 3) & ~3;
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  let pow = 1, log = 0;
  while (pow * 2 <= numTables) { pow *= 2; log++; }
  ov.setUint32(0, flavor);
  ov.setUint16(4, numTables);
  ov.setUint16(6, pow * 16);
  ov.setUint16(8, log);
  ov.setUint16(10, numTables * 16 - pow * 16);
  let off = headerLen;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    ov.setUint32(r, t.tag);
    ov.setUint32(r + 4, t.checksum);
    ov.setUint32(r + 8, off);
    ov.setUint32(r + 12, t.data.length);
    out.set(t.data, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}

/** Any supported upload → sfnt bytes the engine accepts. */
export function toSfnt(b: Uint8Array): Uint8Array {
  const f = sniffFontFormat(b);
  if (f === 'woff') return woffToSfnt(b);
  if (f === 'woff2') throw new Error('WOFF2 fonts are not supported yet — upload the TTF/OTF (or WOFF) file');
  if (f === 'unknown') throw new Error('Unrecognised font file');
  return b;
}
