// eviteThemeClient — browser side of the Evites theme marketplace: API calls (authedFetch) and the art pipeline.
//
// uploadThemeAssets(file) does everything in the browser, nothing is sent anywhere but the creator's own
// Firebase Storage folder (users/{uid}/evite-themes/<key>/, already allowed by storage.rules):
//   1. cover-crop to 2:3 at 812×1224 JPEG (the plate), plus a 240×362 thumb
//   2. `light`: mean luminance of the bottom 45% > 150 (dark ink on a paper wash, like light catalogue plates)
//   3. depth map with Depth Anything V2 (small) via transformers.js — the same model scripts/evite/depthMaps.mjs uses.
//      First run downloads the model (up to ~100 MB) once; the browser caches it. If it can't run, the theme still
//      works without depth (no parallax).
//   4. upload all three and return getDownloadURL URLs (they work for guests without auth)
// The steps are exported separately so the theme maker can show the live card while the depth map computes.
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebase';
import { authedFetch } from '../registerService';
import {
  PLATE_W, PLATE_H, THUMB_W, THUMB_H, coverCrop, isLightBottom, dhashFromGray,
  type PublicTheme, type ThemeArt, type ThemeInput, type MarketQuery, type ThemeAccess,
} from './eviteThemes';

export type { PublicTheme, ThemeArt, ThemeInput, MarketQuery, ThemeAccess };

// ── API ─────────────────────────────────────────────────────────────────────
async function publicCall<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { status: r.status, code: data?.code });
  return data as T;
}

export interface MarketResult { items: PublicTheme[]; total: number; tags: string[] }
export interface MyLicense { license: { id: string; themeId: string; source: string; createdAt: number; transferable: boolean; fromUid?: string }; theme: PublicTheme }
export interface UsableTheme { theme: PublicTheme; why: 'mine' | 'licensed' | 'free' | 'member'; art: ThemeArt; templateId: string }
export interface ThemeStats {
  items: Array<{ id: string; title: string; uses: number; holders: number; sales: number; grossCents: number; platformFeeCents: number; creatorCents: number }>;
  totals: { uses: number; holders: number; sales: number; grossCents: number; platformFeeCents: number; creatorCents: number };
  feeRate: number;
}

export const marketThemes = (q: MarketQuery & { offset?: number; limit?: number } = {}) =>
  publicCall<MarketResult>('/api/evite-themes/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
export const getTheme = async (id: string): Promise<PublicTheme> => (await publicCall<{ theme: PublicTheme }>(`/api/evite-themes/${encodeURIComponent(id)}`)).theme;

export const saveTheme = async (body: ThemeInput & { id?: string }): Promise<PublicTheme> => (await authedFetch('/api/evite-themes/save', body)).theme;
export const publishTheme = async (id: string, attest: boolean): Promise<{ theme: PublicTheme; link: string }> => authedFetch('/api/evite-themes/publish', { id, attest });
export const setThemeListed = async (id: string, listed: boolean): Promise<PublicTheme> => (await authedFetch('/api/evite-themes/listing', { id, listed })).theme;
export const removeTheme = (id: string, confirm = false) => authedFetch('/api/evite-themes/remove', { id, confirm });
export const myThemes = (): Promise<{ themes: PublicTheme[]; licenses: MyLicense[] }> => authedFetch('/api/evite-themes/mine', {});
export const usableThemes = async (): Promise<UsableTheme[]> => (await authedFetch('/api/evite-themes/usable', {})).items || [];
export const claimTheme = (id: string): Promise<{ ok: true; templateId: string; art: ThemeArt }> => authedFetch('/api/evite-themes/claim', { id });
export const checkoutTheme = async (id: string): Promise<string> => (await authedFetch('/api/evite-themes/checkout', { id })).url;
export const confirmThemePurchase = (sessionId: string): Promise<{ licensed: boolean; pending?: boolean; templateId?: string; art?: ThemeArt }> => authedFetch('/api/evite-themes/confirm', { sessionId });
export const giftTheme = (id: string, to: string): Promise<{ ok: true; granted?: boolean; transferred?: boolean }> => authedFetch('/api/evite-themes/gift', { id, to });
export const themeStats = (): Promise<ThemeStats> => authedFetch('/api/evite-themes/stats', {});
export const reportTheme = (id: string, reason: string) => authedFetch(`/api/evite-themes/${encodeURIComponent(id)}/report`, { reason });
export const listThemeInShop = (id: string): Promise<{ ok: true; productId: string; existed: boolean }> => authedFetch('/api/evite-themes/list-in-shop', { id });

/** Back from Stripe Checkout: `?evite_theme=<id>&theme_session=cs_…`. */
export function checkoutReturn(): { themeId: string | null; sessionId: string | null } {
  try { const p = new URLSearchParams(location.search); return { themeId: p.get('evite_theme'), sessionId: p.get('theme_session') }; } catch { return { themeId: null, sessionId: null }; }
}

// ── art pipeline ────────────────────────────────────────────────────────────
export type ThemeUploadStage = 'prepare' | 'model' | 'depth' | 'upload' | 'done';
export interface ThemeUploadProgress { stage: ThemeUploadStage; /** 0..1 within the stage, when known */ progress?: number; message: string }
export interface PreparedArt { plate: Blob; thumb: Blob; plateCanvas: HTMLCanvasElement; light: boolean; dhash: string; previewUrl: string }
export interface ThemeAssetsResult { plate: string; depth?: string; thumb: string; light: boolean; dhash: string; depthError?: string }

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const toBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.88) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not encode the image.')), type, q));

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as any); } catch { /* fall back to <img> (HEIC on Safari etc.) */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Steps 1–2: crop/scale, thumb, light, look-alike hash. Fast; gives the maker an immediate preview. */
export async function prepareThemeArt(file: Blob): Promise<PreparedArt> {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Choose an image file (JPEG, PNG, WebP or HEIC).');
  if (file.size > MAX_FILE_BYTES) throw new Error('That image is over 30 MB. Export a smaller copy and try again.');
  const src = await decode(file);
  if (src.width < 400 || src.height < 600) throw new Error('That image is small. Use art at least 812 × 1224 pixels so invitations stay sharp.');
  const crop = coverCrop(src.width, src.height);
  const plateCanvas = canvas(PLATE_W, PLATE_H);
  const pc = plateCanvas.getContext('2d')!;
  pc.imageSmoothingQuality = 'high';
  pc.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, PLATE_W, PLATE_H);
  (src as any).close?.();
  const light = isLightBottom(pc.getImageData(0, 0, PLATE_W, PLATE_H).data, PLATE_W, PLATE_H);
  const thumbCanvas = canvas(THUMB_W, THUMB_H);
  const tc = thumbCanvas.getContext('2d')!; tc.imageSmoothingQuality = 'high'; tc.drawImage(plateCanvas, 0, 0, THUMB_W, THUMB_H);
  // 9×8 grayscale for the difference hash
  const hc = canvas(9, 8).getContext('2d', { willReadFrequently: true })!; hc.drawImage(plateCanvas, 0, 0, 9, 8);
  const hd = hc.getImageData(0, 0, 9, 8).data; const gray: number[] = [];
  for (let i = 0; i < 72; i++) gray.push(0.299 * hd[i * 4] + 0.587 * hd[i * 4 + 1] + 0.114 * hd[i * 4 + 2]);
  const [plate, thumb] = await Promise.all([toBlob(plateCanvas, 'image/jpeg', 0.88), toBlob(thumbCanvas, 'image/jpeg', 0.82)]);
  return { plate, thumb, plateCanvas, light, dhash: dhashFromGray(gray), previewUrl: URL.createObjectURL(plate) };
}

// transformers.js loads lazily (it is large) and once per page.
let depthPipe: Promise<any> | null = null;
const MODEL = 'onnx-community/depth-anything-v2-small';
function loadDepth(onProgress?: (p: ThemeUploadProgress) => void): Promise<any> {
  if (depthPipe) return depthPipe;
  depthPipe = (async () => {
    const tf: any = await import('@huggingface/transformers');
    const files: Record<string, { loaded: number; total: number }> = {};
    const progress_callback = (info: any) => {
      if (info?.status === 'progress_total' && info.total) onProgress?.({ stage: 'model', progress: info.loaded / info.total, message: `Downloading the depth model (once): ${Math.round(info.loaded / 1048576)} of ${Math.round(info.total / 1048576)} MB` });
      else if (info?.status === 'progress' && info.file) {
        files[info.file] = { loaded: info.loaded || 0, total: info.total || 0 };
        const all = Object.values(files); const loaded = all.reduce((s, f) => s + f.loaded, 0), total = all.reduce((s, f) => s + f.total, 0);
        if (total) onProgress?.({ stage: 'model', progress: loaded / total, message: `Downloading the depth model (once): ${Math.round(loaded / 1048576)} of ${Math.round(total / 1048576)} MB` });
      }
    };
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    let lastErr: unknown = null;
    for (const device of hasGpu ? ['webgpu', 'wasm'] : ['wasm']) {
      try { return await tf.pipeline('depth-estimation', MODEL, { device, dtype: device === 'webgpu' ? 'fp16' : 'q8', progress_callback }); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('The depth model could not start on this device.');
  })();
  depthPipe.catch(() => { depthPipe = null; });          // allow a retry after a failed download
  return depthPipe;
}

/** Step 3: depth map (grayscale, near = white) as a 406×612 JPEG. */
export async function computeDepthMap(plateCanvas: HTMLCanvasElement, onProgress?: (p: ThemeUploadProgress) => void): Promise<Blob> {
  onProgress?.({ stage: 'model', progress: 0, message: 'Getting the depth model ready. The first time, it downloads (up to about 100 MB) and your browser keeps it.' });
  const pipe = await loadDepth(onProgress);
  onProgress?.({ stage: 'depth', message: 'Working out what’s near and far…' });
  const tf: any = await import('@huggingface/transformers');
  const result = await pipe(tf.RawImage.fromCanvas(plateCanvas));
  const depth = result?.depth;
  if (!depth) throw new Error('No depth came back.');
  const out = canvas(PLATE_W / 2, PLATE_H / 2);
  const ctx = out.getContext('2d')!; ctx.imageSmoothingEnabled = true;
  const small: HTMLCanvasElement | null = depth.toCanvas ? depth.toCanvas() : null;
  if (small) ctx.drawImage(small, 0, 0, out.width, out.height);
  else {
    const tmp = canvas(depth.width, depth.height); const t = tmp.getContext('2d')!; const img = t.createImageData(depth.width, depth.height);
    for (let i = 0; i < depth.width * depth.height; i++) { const v = depth.data[i * (depth.channels || 1)]; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    t.putImageData(img, 0, 0); ctx.drawImage(tmp, 0, 0, out.width, out.height);
  }
  return toBlob(out, 'image/jpeg', 0.9);
}

/** Step 4: upload to users/{uid}/evite-themes/<key>/ and return download URLs. */
export async function uploadThemeBlobs(parts: { plate: Blob; thumb: Blob; depth?: Blob | null }, onProgress?: (p: ThemeUploadProgress) => void): Promise<{ plate: string; thumb: string; depth?: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid || auth.currentUser?.isAnonymous) throw new Error('Sign in to upload your theme.');
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const entries = (Object.entries(parts) as Array<[string, Blob | null | undefined]>).filter((e): e is [string, Blob] => !!e[1]);
  const total = entries.reduce((s, [, b]) => s + b.size, 0) || 1;
  const sent: Record<string, number> = {};
  const urls: Record<string, string> = {};
  await Promise.all(entries.map(async ([name, blob]) => {
    const r = storageRef(storage, `users/${uid}/evite-themes/${key}/${name}.jpg`);
    const task = uploadBytesResumable(r, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' });
    task.on('state_changed', s => { sent[name] = s.bytesTransferred; const done = Object.values(sent).reduce((a, b) => a + b, 0); onProgress?.({ stage: 'upload', progress: done / total, message: `Uploading… ${Math.round((done / total) * 100)}%` }); });
    await task;
    urls[name] = await getDownloadURL(r);
  }));
  return { plate: urls.plate, thumb: urls.thumb, ...(urls.depth ? { depth: urls.depth } : {}) };
}

/** The whole pipeline in one call. Depth failure is not fatal: the theme simply has no parallax. */
export async function uploadThemeAssets(file: Blob, onProgress?: (p: ThemeUploadProgress) => void): Promise<ThemeAssetsResult> {
  onProgress?.({ stage: 'prepare', message: 'Sizing your art…' });
  const prep = await prepareThemeArt(file);
  let depth: Blob | null = null, depthError: string | undefined;
  try { depth = await computeDepthMap(prep.plateCanvas, onProgress); } catch (e: any) { depthError = e?.message || 'Depth map unavailable on this device.'; }
  const urls = await uploadThemeBlobs({ plate: prep.plate, thumb: prep.thumb, depth }, onProgress);
  URL.revokeObjectURL(prep.previewUrl);
  onProgress?.({ stage: 'done', progress: 1, message: 'Uploaded.' });
  return { ...urls, light: prep.light, dhash: prep.dhash, ...(depthError ? { depthError } : {}) };
}
