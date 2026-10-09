// Dep-free ZIP reader that works on a Uint8Array (browser AND node), so the EPUB / DOCX tooling can be
// unit-tested. Deflate goes through the platform DecompressionStream('deflate-raw') — the same trick
// services/documentImport.ts uses. We keep the local-header OFFSET of every entry because an EPUB must
// have `mimetype` as the physically-first, STORED entry, which only the offsets can prove.

export interface ZipEntry {
  name: string;
  method: number;          // 0 stored, 8 deflate
  flags: number;
  compSize: number;
  size: number;
  localOffset: number;
  localExtraLen: number;   // extra field length in the LOCAL header (mimetype must have none)
  dataStart: number;
}

export class ZipError extends Error {}

export function readZipEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Not a valid ZIP archive (end-of-directory record not found).');
  const count = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let e = 0; e < count; e++) {
    if (cd + 46 > buf.length || dv.getUint32(cd, true) !== 0x02014b50) break;
    const flags = dv.getUint16(cd + 8, true);
    const method = dv.getUint16(cd + 10, true);
    const compSize = dv.getUint32(cd + 20, true);
    const size = dv.getUint32(cd + 24, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const localOffset = dv.getUint32(cd + 42, true);
    const name = dec.decode(buf.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + commentLen;
    if (localOffset + 30 > buf.length || dv.getUint32(localOffset, true) !== 0x04034b50) continue;
    const lName = dv.getUint16(localOffset + 26, true);
    const lExtra = dv.getUint16(localOffset + 28, true);
    out.push({ name, method, flags, compSize, size, localOffset, localExtraLen: lExtra, dataStart: localOffset + 30 + lName + lExtra });
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new ZipError('This browser cannot decompress ZIP entries (DecompressionStream missing). Try Chrome, Edge, Firefox or Safari 16.4+.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipData(buf: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const comp = buf.subarray(entry.dataStart, entry.dataStart + entry.compSize);
  if (entry.method === 0) return comp;
  if (entry.method === 8) return inflateRaw(comp);
  throw new ZipError(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`);
}

export async function readZipText(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  return new TextDecoder('utf-8').decode(await readZipData(buf, entry));
}
