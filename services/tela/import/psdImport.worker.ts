// Runs the Photoshop importer off the main thread. A 200 MB template decodes and PNG-encodes for
// a long time; the page has to keep painting. Uploads and font lookups go back to the main thread.
import { importPsdDocument } from './psdImport';
import type { ImportEnv, ResolvedFont, RgbaImage } from './types';

type Reply = { id: number; value?: unknown; error?: string };
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>(); let seq = 0;
const ask = <T,>(msg: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<T>((resolve, reject) => { const id = ++seq; pending.set(id, { resolve: resolve as (v: unknown) => void, reject }); (self as unknown as Worker).postMessage({ ...msg, id }, transfer); });

async function encodePng(im: RgbaImage): Promise<Blob | { rawRgba: true; width: number; height: number; data: Uint8ClampedArray }> {
  const w = Math.max(1, im.width | 0), h = Math.max(1, im.height | 0);
  const expected = w * h * 4;
  const view = im.data.byteLength === expected && im.data.byteOffset === 0 && !(im.data.buffer instanceof SharedArrayBuffer)
    ? new Uint8ClampedArray(im.data.buffer)
    : (() => {
        const copy = new Uint8ClampedArray(expected);
        copy.set(im.data.subarray(0, expected));
        return copy;
      })();
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.putImageData(new ImageData(view, w, h), 0, 0);
        return await c.convertToBlob({ type: 'image/png' });
      }
    } catch {
      // Fall through to raw RGBA transfer so main thread encodes safely via HTMLCanvasElement.
    }
  }
  return { rawRgba: true, width: w, height: h, data: view };
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.reply) { const r = m as Reply; const p = pending.get(r.id); if (p) { pending.delete(r.id); if (r.error) p.reject(new Error(r.error)); else p.resolve(r.value); } return; }
  if (m.type !== 'start') return;
  const env: ImportEnv = {
    putImage: async (im, name) => {
      const encoded = await encodePng(im);
      if (encoded instanceof Blob) return ask({ type: 'put', blob: encoded, name });
      return ask({ type: 'put-raw', width: encoded.width, height: encoded.height, buffer: encoded.data.buffer, name }, [encoded.data.buffer]);
    },
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
