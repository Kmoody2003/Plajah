// comicImport — bring existing digital comics into Lorea.
//   • CBZ / ZIP  → unzipped in-browser (no dependency; uses DecompressionStream) into
//                  image pages, uploaded to storage, returned as a graphic-novel Album.
//   • PDF        → uploaded as-is; the reader's existing PDF path renders it.
//   • CBR / RAR  → not supported in-browser (no RAR decoder) — asks the user to re-save as CBZ.
import { auth } from './firebase';
import { uploadFile } from './backendService';
import type { Album, BookPage } from '../types';

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const mimeFromName = (n: string) => {
  const e = n.toLowerCase().split('.').pop();
  return e === 'png' ? 'image/png' : e === 'gif' ? 'image/gif' : e === 'webp' ? 'image/webp' : e === 'avif' ? 'image/avif' : e === 'bmp' ? 'image/bmp' : 'image/jpeg';
};

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('This browser can’t unzip CBZ — try Chrome/Edge/Firefox, or import a PDF.');
  const stream = new Blob([data]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Minimal ZIP reader: walk the central directory, inflate each image entry.
async function unzipImages(file: File): Promise<{ name: string; blob: Blob }[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid CBZ/ZIP archive.');
  const count = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const out: { name: string; blob: Blob }[] = [];
  for (let e = 0; e < count; e++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) break;
    const method = dv.getUint16(cd + 10, true);
    const compSize = dv.getUint32(cd + 20, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const localOff = dv.getUint32(cd + 42, true);
    const name = new TextDecoder().decode(buf.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + commentLen;
    if (!IMG_RE.test(name) || name.includes('__MACOSX')) continue;
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let bytes: Uint8Array;
    if (method === 0) bytes = comp;
    else if (method === 8) bytes = await inflateRaw(comp);
    else continue;
    out.push({ name, blob: new Blob([bytes], { type: mimeFromName(name) }) });
  }
  // Page order: natural sort by filename (01, 02, … 10).
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return out;
}

export interface ComicImportProgress { phase: 'reading' | 'uploading' | 'done'; done: number; total: number; }

/**
 * Import a digital comic file and return a ready-to-read graphic-novel Album (images
 * uploaded to the user's storage). Throws with a friendly message on unsupported input.
 */
export async function importComic(file: File, onProgress?: (p: ComicImportProgress) => void): Promise<Album> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to import a comic.');
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const title = file.name.replace(/\.[^.]+$/, '');
  const id = `import_${Math.random().toString(36).slice(2, 10)}`;

  const base: any = {
    id, title, artist: auth.currentUser?.displayName || 'Imported',
    type: 'BOOK', subType: 'GRAPHIC_NOVEL', ownerId: uid,
    coverImage: '', createdAt: Date.now(), isImported: true,
  };

  if (ext === 'pdf') {
    onProgress?.({ phase: 'uploading', done: 0, total: 1 });
    const url = await uploadFile(`books/${uid}/import/${id}.pdf`, file);
    onProgress?.({ phase: 'done', done: 1, total: 1 });
    return { ...base, bookChapters: [{ id, title, url, format: 'PDF' }] } as Album;
  }
  if (ext === 'cbr' || ext === 'rar') {
    throw new Error('CBR/RAR isn’t supported in-browser yet — re-save it as a CBZ (a .zip of the page images) and import that.');
  }

  // CBZ / ZIP
  onProgress?.({ phase: 'reading', done: 0, total: 1 });
  const imgs = await unzipImages(file);
  if (!imgs.length) throw new Error('No page images found in this archive.');
  const pages: BookPage[] = [];
  for (let i = 0; i < imgs.length; i++) {
    onProgress?.({ phase: 'uploading', done: i, total: imgs.length });
    const safe = (imgs[i].name.split('/').pop() || `p${i}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const url = await uploadFile(`books/${uid}/import/${id}/${String(i).padStart(4, '0')}_${safe}`, imgs[i].blob);
    pages.push({ id: `p${i}`, url, pageNumber: i + 1 });
  }
  onProgress?.({ phase: 'done', done: imgs.length, total: imgs.length });
  return {
    ...base,
    coverImage: pages[0].url,
    bookChapters: [{ id, title, pages, format: 'COMIC' }],
  } as Album;
}
