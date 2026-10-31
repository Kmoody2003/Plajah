// Runs the Photoshop importer off the main thread. A 200 MB template decodes and PNG-encodes for
// a long time; the page has to keep painting. Uploads and font lookups go back to the main thread.
import { importPsdDocument } from './psdImport';
import type { ImportEnv, ResolvedFont, RgbaImage } from './types';

type Reply = { id: number; value?: unknown; error?: string };
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>(); let seq = 0;
const ask = <T,>(msg: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<T>((resolve, reject) => { const id = ++seq; pending.set(id, { resolve: resolve as (v: unknown) => void, reject }); (self as unknown as Worker).postMessage({ ...msg, id }, transfer); });

async function encodePng(im: RgbaImage): Promise<Blob> {
  const c = new OffscreenCanvas(Math.max(1, im.width), Math.max(1, im.height));
  const data = new Uint8ClampedArray(im.data.buffer as ArrayBuffer, im.data.byteOffset, im.data.byteLength);
  c.getContext('2d')!.putImageData(new ImageData(data, im.width, im.height), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.reply) { const r = m as Reply; const p = pending.get(r.id); if (p) { pending.delete(r.id); if (r.error) p.reject(new Error(r.error)); else p.resolve(r.value); } return; }
  if (m.type !== 'start') return;
  const env: ImportEnv = {
    putImage: async (im, name) => ask({ type: 'put', blob: await encodePng(im), name }),
    putBlob: (bytes, name, mime) => ask({ type: 'blob', bytes, name, mime }),
    resolveFonts: names => ask<Record<string, ResolvedFont>>({ type: 'fonts', names }),
    progress: (stage, done, total) => (self as unknown as Worker).postMessage({ type: 'progress', stage, done, total }),
  };
  try {
    const r = await importPsdDocument(new Uint8Array(m.buffer), { fileName: m.fileName, env, skipHidden: false });
    delete r.composite;
    (self as unknown as Worker).postMessage({ type: 'done', result: r });
  } catch (e) { (self as unknown as Worker).postMessage({ type: 'failed', message: e instanceof Error ? e.message : String(e) }); }
};
