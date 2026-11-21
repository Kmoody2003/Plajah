// import/importClient — the browser side of design-file import: routes a file to its importer and
// supplies uploads, fonts and asset storage. Everything here runs on the page.
import { uploadTelaImage } from '../../telaAssets';
import { putTelaAsset, getTelaAssetBlob } from '../telaAssetStore';
import { resolveFontsInPage } from './fontResolve';
import type { ImportEnv, ImportedDocument, RgbaImage } from './types';

export const DESIGN_FILE_ACCEPT = '.psd,.psb,.psdt,.ai,.ait,.eps,.idml,.indd,.inx';
export const isDesignFile = (name: string) => /\.(psd|psb|psdt|ai|ait|eps|idml|indd|inx)$/i.test(name);
export const isPdfVectorCandidate = (name: string) => /\.pdf$/i.test(name);
/** The largest single ArrayBuffer a browser hands back from File.arrayBuffer(). */
const MAX_FILE_BYTES = 2_040_000_000;

export interface ImportProgress { stage: string; done: number; total: number }

const UPLOAD_TIMEOUT_MS = 3500;
const DEGRADED_COOLDOWN_MS = 60_000;
let cloudUploadDegradedUntil = 0;

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      v => { clearTimeout(id); resolve(v); },
      e => { clearTimeout(id); reject(e); },
    );
  });
}

function blobToObjectUrlResult(blob: Blob): { src: string; storagePath: string; sessionOnly: boolean } {
  // Store locally in OPFS/IDB in the background so reloads still find assets if available,
  // while immediately returning a zero-latency blob URL so large PSDs never freeze waiting on Firebase.
  void putTelaAsset(blob, 'png').catch(() => undefined);
  return { src: URL.createObjectURL(blob), storagePath: '', sessionOnly: true };
}

async function putPng(blob: Blob, name: string): Promise<{ src: string; storagePath?: string; sessionOnly?: boolean }> {
  const safe = `${name.replace(/[^\w.-]+/g, '_').slice(0, 48) || 'layer'}.png`;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (!online || Date.now() < cloudUploadDegradedUntil) {
    return blobToObjectUrlResult(blob);
  }
  try {
    return await withTimeout(
      uploadTelaImage(new File([blob], safe, { type: 'image/png' })),
      UPLOAD_TIMEOUT_MS,
      'Cloud upload timed out',
    );
  } catch {
    // Circuit breaker: skip waiting 3.5s on every remaining layer when Firebase/Storage is slow or unconfigured.
    cloudUploadDegradedUntil = Date.now() + DEGRADED_COOLDOWN_MS;
    return blobToObjectUrlResult(blob);
  }
}

async function rawRgbaToBlob(width: number, height: number, data: Uint8ClampedArray): Promise<Blob> {
  const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
  const expected = w * h * 4;
  const view = data.byteLength === expected && data.byteOffset === 0 && !(data.buffer instanceof SharedArrayBuffer)
    ? new Uint8ClampedArray(data.buffer)
    : (() => {
        const copy = new Uint8ClampedArray(expected);
        copy.set(data.subarray(0, expected));
        return copy;
      })();
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.putImageData(new ImageData(view, w, h), 0, 0);
      return c.convertToBlob({ type: 'image/png' });
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.putImageData(new ImageData(view, w, h), 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    c.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
  });
}

async function encodeOnPage(im: RgbaImage): Promise<Blob> {
  return rawRgbaToBlob(im.width, im.height, new Uint8ClampedArray(im.data.buffer as ArrayBuffer, im.data.byteOffset, im.data.byteLength));
}

const pageEnv = (onProgress?: (p: ImportProgress) => void): ImportEnv => ({
  putImage: async (im, name) => putPng(await encodeOnPage(im), name),
  putBlob: async (bytes, name) => (await putTelaAsset(new Blob([bytes as BlobPart]), name.split('.').pop() || 'bin')).assetId,
  resolveFonts: async names => resolveFontsInPage(names),
  progress: (stage, done, total) => onProgress?.({ stage, done, total }),
});

async function runPsdMainThread(buffer: ArrayBuffer, fileName: string, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument> {
  const { importPsdDocument } = await import('./psdImport');
  const r = await importPsdDocument(new Uint8Array(buffer), { fileName, env: pageEnv(onProgress), skipHidden: false });
  delete r.composite;
  return r;
}

function runPsdWorker(buffer: ArrayBuffer, fileName: string, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument> {
  if (typeof Worker === 'undefined') return runPsdMainThread(buffer, fileName, onProgress);
  // Keep a backup slice for sub-96MB PSDs so if worker instantiation/GPU OffscreenCanvas crashes we seamlessly recover on main thread.
  const backup = buffer.byteLength < 96_000_000 ? buffer.slice(0) : null;
  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./psdImport.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      void runPsdMainThread(backup || buffer, fileName, onProgress).then(resolve, reject);
      return;
    }

    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (settled) return;
        settled = true;
        worker.terminate();
        if (backup) {
          void runPsdMainThread(backup, fileName, onProgress).then(resolve, reject);
        } else {
          reject(new Error(`Importing ${fileName} timed out while processing layers.`));
        }
      }, 45_000);
    };

    const cleanup = () => {
      if (watchdog) clearTimeout(watchdog);
      worker.terminate();
    };
    const finishResolve = (val: ImportedDocument) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };
    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    worker.onerror = e => {
      if (settled) return;
      if (backup) {
        settled = true;
        cleanup();
        void runPsdMainThread(backup, fileName, onProgress).then(resolve, reject);
      } else {
        finishReject(new Error(e.message || 'The Photoshop importer stopped unexpectedly.'));
      }
    };
    worker.onmessageerror = () => {
      finishReject(new Error('The Photoshop importer failed to decode a message from its worker thread.'));
    };
    worker.onmessage = async (ev: MessageEvent) => {
      const m = ev.data;
      armWatchdog();
      const reply = (value?: unknown, error?: string) => {
        try { worker.postMessage({ reply: true, id: m.id, value, error }); } catch { /* terminated */ }
      };
      try {
        if (m.type === 'progress') onProgress?.({ stage: m.stage, done: m.done, total: m.total });
        else if (m.type === 'put') {
          const r = await putPng(m.blob, m.name);
          reply({ src: r.src, storagePath: r.storagePath, sessionOnly: r.sessionOnly });
        } else if (m.type === 'put-raw') {
          const blob = await rawRgbaToBlob(m.width, m.height, new Uint8ClampedArray(m.buffer));
          const r = await putPng(blob, m.name);
          reply({ src: r.src, storagePath: r.storagePath, sessionOnly: r.sessionOnly });
        } else if (m.type === 'blob') {
          reply((await putTelaAsset(new Blob([m.bytes]), String(m.name).split('.').pop() || 'bin')).assetId);
        } else if (m.type === 'fonts') {
          reply(resolveFontsInPage(m.names));
        } else if (m.type === 'done') {
          finishResolve(m.result);
        } else if (m.type === 'failed') {
          finishReject(new Error(m.message));
        }
      } catch (e) {
        if (m.id) reply(undefined, e instanceof Error ? e.message : String(e));
        else finishReject(e as Error);
      }
    };
    armWatchdog();
    worker.postMessage({ type: 'start', buffer, fileName }, [buffer]);
  });
}

async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

/** Import any supported design file (.psd/.psb/.psdt, .ai/.ait/.eps, .idml/.indd/.inx, vector .pdf). */
export async function importDesignFile(file: File | { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }, onProgress?: (p: ImportProgress) => void): Promise<ImportedDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is ${(file.size / 1e9).toFixed(1)} GB. Browsers can read up to 2 GB in one piece; save a copy with fewer hidden layers, or flatten smart objects, and import that.`);
  const buffer = await file.arrayBuffer();
  const name = file.name;
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const isPsd = head[0] === 0x38 && head[1] === 0x42 && head[2] === 0x50 && head[3] === 0x53;
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const isIndesign = /\.(idml|indd|inx)$/i.test(name) || (head[0] === 0x06 && head[1] === 0x06 && head[2] === 0xed && head[3] === 0xf5);

  if (isPsd || /\.(psd|psb|psdt)$/i.test(name)) {
    return runPsdWorker(buffer, name, onProgress);
  }

  const env = pageEnv(onProgress);
  if (isIndesign) {
    const { importIndesignDocument } = await import('./indesignImport');
    return importIndesignDocument(new Uint8Array(buffer), { fileName: name, env });
  }

  const { importAiNative } = await import('./aiNative');
  if (isPdf) {
    const { importPdfDocument } = await import('./pdfVector');
    try {
      const r = await importPdfDocument(new Uint8Array(buffer.slice(0)), { fileName: name, format: /\.(ai|ait)$/i.test(name) ? 'ai' : 'pdf', env, pdfjs: await loadPdfjs() });
      if (!r.emptyPages || !/\.(ai|ait)$/i.test(name)) return r;
    } catch (pdfErr) {
      if (!/\.(ai|ait)$/i.test(name)) throw pdfErr;
    }
    const fallbackNative = await importAiNative(new Uint8Array(buffer), { fileName: name, format: 'ai', env });
    if (fallbackNative) return fallbackNative;
    throw new Error(`${name} was saved from Illustrator without "Create PDF Compatible File", and its art could not be decoded natively. Re-save with PDF compatibility on, or as SVG.`);
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
  const designFile = (bytes[0] === 0x38 && bytes[1] === 0x42) || (bytes[0] === 0x25 && bytes[1] === 0x50) || (bytes[0] === 0x06 && bytes[1] === 0x06) || isDesignFile(name);
  if (!designFile) return { imageBlob: blob, name };
  return importDesignFile({ name, size: blob.size, arrayBuffer: () => blob.arrayBuffer() }, onProgress);
}
