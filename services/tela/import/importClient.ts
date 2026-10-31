// import/importClient — the browser side of design-file import: routes a file to its importer and
// supplies uploads, fonts and asset storage. Everything here runs on the page.
import { uploadTelaImage } from '../../telaAssets';
import { putTelaAsset, getTelaAssetBlob } from '../telaAssetStore';
import { resolveFontsInPage } from './fontResolve';
import type { ImportEnv, ImportedDocument, RgbaImage } from './types';

export const DESIGN_FILE_ACCEPT = '.psd,.psb,.ai,.eps,.ait,.psdt';
export const isDesignFile = (name: string) => /\.(psd|psb|psdt|ai|ait|eps)$/i.test(name);
export const isPdfVectorCandidate = (name: string) => /\.pdf$/i.test(name);
/** The largest single ArrayBuffer a browser hands back from File.arrayBuffer(). */
const MAX_FILE_BYTES = 2_040_000_000;

export interface ImportProgress { stage: string; done: number; total: number }

async function putPng(blob: Blob, name: string) {
  const safe = `${name.replace(/[^\w.-]+/g, '_').slice(0, 48) || 'layer'}.png`;
  return uploadTelaImage(new File([blob], safe, { type: 'image/png' }));
}
async function encodeOnPage(im: RgbaImage): Promise<Blob> {
  const c = new OffscreenCanvas(Math.max(1, im.width), Math.max(1, im.height));
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data.buffer as ArrayBuffer, im.data.byteOffset, im.data.byteLength), im.width, im.height), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
const pageEnv = (onProgress?: (p: ImportProgress) => void): ImportEnv => ({
  putImage: async (im, name) => putPng(await encodeOnPage(im), name),
  putBlob: async (bytes, name) => (await putTelaAsset(new Blob([bytes as BlobPart]), name.split('.').pop() || 'bin')).assetId,
  resolveFonts: async names => resolveFontsInPage(names),
  progress: (stage, done, total) => onProgress?.({ stage, done, total }),
});

function runPsdWorker(buffer: ArrayBuffer, fileName: string, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./psdImport.worker.ts', import.meta.url), { type: 'module' });
    const finish = (fn: () => void) => { worker.terminate(); fn(); };
    worker.onerror = e => finish(() => reject(new Error(e.message || 'The Photoshop importer stopped unexpectedly.')));
    worker.onmessage = async (ev: MessageEvent) => {
      const m = ev.data;
      const reply = (value?: unknown, error?: string) => worker.postMessage({ reply: true, id: m.id, value, error });
      try {
        if (m.type === 'progress') onProgress?.({ stage: m.stage, done: m.done, total: m.total });
        else if (m.type === 'put') { const r = await putPng(m.blob, m.name); reply({ src: r.src, storagePath: r.storagePath, sessionOnly: r.sessionOnly }); }
        else if (m.type === 'blob') reply((await putTelaAsset(new Blob([m.bytes]), String(m.name).split('.').pop() || 'bin')).assetId);
        else if (m.type === 'fonts') reply(resolveFontsInPage(m.names));
        else if (m.type === 'done') finish(() => resolve(m.result));
        else if (m.type === 'failed') finish(() => reject(new Error(m.message)));
      } catch (e) { if (m.id) reply(undefined, e instanceof Error ? e.message : String(e)); else finish(() => reject(e as Error)); }
    };
    worker.postMessage({ type: 'start', buffer, fileName }, [buffer]);
  });
}

async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

/** Import any supported design file. PDF-compatible .ai goes through the PDF path, the rest native. */
export async function importDesignFile(file: File | { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is ${(file.size / 1e9).toFixed(1)} GB. Browsers can read up to 2 GB in one piece; save a copy with fewer hidden layers, or flatten smart objects, and import that.`);
  const buffer = await file.arrayBuffer(); const name = file.name;
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const isPsd = head[0] === 0x38 && head[1] === 0x42 && head[2] === 0x50 && head[3] === 0x53;
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (isPsd) return runPsdWorker(buffer, name, onProgress);
  const env = pageEnv(onProgress);
  const { importAiNative } = await import('./aiNative');
  if (isPdf) {
    const { importPdfDocument } = await import('./pdfVector');
    const r = await importPdfDocument(new Uint8Array(buffer.slice(0)), { fileName: name, format: /\.(ai|ait)$/i.test(name) ? 'ai' : 'pdf', env, pdfjs: await loadPdfjs() });
    if (r.emptyPages && /\.(ai|ait)$/i.test(name)) throw new Error(`${name} was saved from Illustrator without "Create PDF Compatible File", and its art is stored in a form Tela cannot read yet. Re-save it with that option on, or as SVG.`);
    return r;
  }
  const native = await importAiNative(new Uint8Array(buffer), { fileName: name, format: /\.eps$/i.test(name) ? 'eps' : 'ai', env });
  if (!native) throw new Error(`Tela could not find vector art in ${name}. Re-save it from Illustrator as a PDF-compatible .ai or SVG.`);
  return native;
}

/** Open an embedded smart object as a document of its own. */
export async function openSmartObject(assetId: string, name: string, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument | { imageBlob: Blob; name: string }> {
  const blob = await getTelaAssetBlob(assetId);
  if (!blob) throw new Error('The embedded file is no longer on this device. Import the original Photoshop file again to get it back.');
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const designFile = (bytes[0] === 0x38 && bytes[1] === 0x42) || (bytes[0] === 0x25 && bytes[1] === 0x50) || isDesignFile(name);
  if (!designFile) return { imageBlob: blob, name };
  return importDesignFile({ name, size: blob.size, arrayBuffer: () => blob.arrayBuffer() }, onProgress);
}
