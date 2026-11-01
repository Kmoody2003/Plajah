// Put a finished file where the user can get to it: beside the source on desktop, in
// Downloads/Crossover on Android, or a normal download anywhere else.

import { registerPlugin } from '@capacitor/core';
import { crossoverHost } from './host';
import { nativeWriteText } from './nativeEngine';

interface FilesPlugin {
  begin(o: { name: string; mime: string }): Promise<{ id: string }>;
  chunk(o: { id: string; data: string }): Promise<void>;
  end(o: { id: string }): Promise<{ path: string }>;
}
const PlajahFiles = registerPlugin<FilesPlugin>('PlajahFiles');

const CHUNK = 1024 * 1024 * 3; // divisible by 3, so each chunk's base64 stands alone

export const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export interface Saved { path?: string; message: string }

export async function saveBlob(name: string, blob: Blob, mime = blob.type || 'application/octet-stream', onProgress?: (p: number) => void): Promise<Saved> {
  if (crossoverHost() === 'android') {
    const { id } = await PlajahFiles.begin({ name, mime });
    for (let at = 0; at < blob.size; at += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
      await PlajahFiles.chunk({ id, data: toBase64(bytes) });
      onProgress?.(Math.min(1, (at + CHUNK) / blob.size));
    }
    const { path } = await PlajahFiles.end({ id });
    return { path, message: `Saved to ${path}` };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { message: `Downloaded ${name}` };
}

/** `besidePath` is the video's own path, when known; desktop writes the sidecar next to it. */
export async function saveText(name: string, text: string, mime: string, besidePath?: string): Promise<Saved> {
  if (crossoverHost() === 'desktop' && besidePath) {
    const sep = besidePath.includes('\\') ? '\\' : '/';
    const r = await nativeWriteText(`${besidePath.slice(0, besidePath.lastIndexOf(sep))}${sep}${name}`, text);
    if (!r.success) throw new Error(r.error || 'Could not write the file.');
    return { path: r.path, message: `Saved to ${r.path}` };
  }
  return saveBlob(name, new Blob([text], { type: mime }), mime);
}
