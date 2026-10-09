// Browser-only cover helpers: read pixel size, crop to ratio with a canvas, upload to Storage.
// (Pure validation/crop maths is in cover.ts and is unit-tested.)

import type { CoverInfo } from './types';
import { cropRectForRatio, COVER_IDEAL } from './cover';

export interface LoadedImage { width: number; height: number; url: string }

export function readImage(file: Blob): Promise<LoadedImage> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file could not be read as an image. Use a JPG or PNG.')); };
    img.src = url;
  });
}

/** Crop (centred) to the ideal 1.6 ratio and re-encode as JPEG (or PNG when the source was PNG). */
export async function cropToRatio(file: Blob, ratio = COVER_IDEAL.ratio): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await readImage(file);
  try {
    const r = cropRectForRatio(img.width, img.height, ratio);
    const el = new Image(); el.src = img.url; await el.decode();
    const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
    c.getContext('2d')!.drawImage(el, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob: Blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Crop failed.')), type, 0.92));
    return { blob, width: r.width, height: r.height };
  } finally { URL.revokeObjectURL(img.url); }
}

/** Upload to users/{uid}/bookDrafts/{draftId}/cover.<ext> and return the CoverInfo with a download URL. */
export async function uploadCover(file: Blob, fileName: string, uid: string, draftId: string, dims: { width: number; height: number }): Promise<CoverInfo> {
  const [{ ref, uploadBytes, getDownloadURL }, { storage }] = await Promise.all([import('firebase/storage'), import('../firebase')]);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const r = ref(storage, `users/${uid}/bookDrafts/${draftId}/cover-${Date.now().toString(36)}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  return { url: await getDownloadURL(r), storagePath: r.fullPath, width: dims.width, height: dims.height, bytes: file.size, mime: file.type || 'image/jpeg', fileName };
}

/** Mime sniff from magic bytes, so a renamed file does not slip through. */
export async function sniffImageMime(file: Blob): Promise<string> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return file.type || 'application/octet-stream';
}
