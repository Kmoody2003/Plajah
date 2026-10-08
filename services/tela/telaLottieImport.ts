// telaLottieImport — turn a picked/dropped/linked Lottie into a Tela LOTTIE object.
//
// Storage policy (doc JSON stays small):
//   • JSON ≤ LOTTIE_INLINE_MAX       → embedded (`inlineJson`) — travels with every copy/version
//   • everything                     → on-device asset store (OPFS → localStorage) by id
//   • signed-in users                → also uploaded to Storage for a durable cross-device URL
//   • guest + no local persistence   → session-only object URL (flagged, UI says so)
import type { TelaLottieSource, TelaVectorObject } from '../../types';
import {
  LOTTIE_INLINE_MAX, defaultLottieSpec, renderLottiePoster, validateLottieBytes, validateLottieFile,
  type LottieFileInfo,
} from './telaLottie';
import { putTelaAsset } from './telaAssetStore';

const newId = () => `obj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export interface LottieImportOptions {
  /** Artboard the object lands on — the animation is fitted into ~60% of it. */
  artboard: { width: number; height: number };
  /** Centre point in artboard px (defaults to the artboard centre). */
  at?: { x: number; y: number };
  /** Upload to Storage when signed in (default true). */
  upload?: boolean;
}

async function sourceFor(info: LottieFileInfo, blob: Blob, opts: LottieImportOptions, url?: string): Promise<TelaLottieSource> {
  const ext = info.format === 'json' ? 'json' : 'lottie';
  const source: TelaLottieSource = { format: info.format, name: info.name, bytes: info.bytes };
  if (info.format === 'json' && info.text && info.text.length <= LOTTIE_INLINE_MAX) source.inlineJson = info.text;
  const local = await putTelaAsset(blob, ext);
  if (local.persisted !== 'memory') source.assetId = local.assetId;
  if (url) { source.url = url; return source; }
  if (opts.upload !== false) {
    try {
      const { uploadTelaAsset } = await import('../telaAssets');
      const file = blob instanceof File ? blob : new File([blob], info.name, { type: info.format === 'json' ? 'application/json' : 'application/zip+dotlottie' });
      const up = await uploadTelaAsset(file);
      if (!up.sessionOnly) { source.url = up.src; source.storagePath = up.storagePath; }
      else if (!source.inlineJson && !source.assetId) { source.url = up.src; source.sessionOnly = true; }
    } catch (e) {
      console.warn('[Tela Lottie] cloud upload failed — keeping the on-device copy', e);
      if (!source.inlineJson && !source.assetId) throw new Error('This animation could not be stored on this device or uploaded. Free some storage and try again.');
    }
  } else if (!source.inlineJson && !source.assetId) {
    source.url = URL.createObjectURL(blob); source.sessionOnly = true;
  }
  return source;
}

/** Build the vector object for a validated animation (poster rendered best-effort). */
export async function buildLottieObject(info: LottieFileInfo, source: TelaLottieSource, opts: LottieImportOptions): Promise<TelaVectorObject> {
  const spec = defaultLottieSpec(source, info.meta);
  spec.posterSrc = (await renderLottiePoster(source, spec)) || undefined;
  const k = Math.min(1, (opts.artboard.width * 0.6) / spec.intrinsicWidth, (opts.artboard.height * 0.6) / spec.intrinsicHeight);
  const w = Math.max(24, Math.round(spec.intrinsicWidth * k)), h = Math.max(24, Math.round(spec.intrinsicHeight * k));
  const cx = opts.at?.x ?? opts.artboard.width / 2, cy = opts.at?.y ?? opts.artboard.height / 2;
  return {
    id: newId(), kind: 'LOTTIE', x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h,
    fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
    objectLabel: info.name.replace(/\.(lottie|json)$/i, '') || 'Lottie', semanticRole: 'ARTWORK',
    lottie: spec,
  };
}

/** Validate + store + build. Throws an Error with a user-facing message. */
export async function importLottieFile(file: File, opts: LottieImportOptions): Promise<TelaVectorObject> {
  const info = await validateLottieFile(file);
  const source = await sourceFor(info, file, opts);
  return buildLottieObject(info, source, opts);
}

/** Fetch, validate and place a Lottie from a URL (kept as the durable source). */
export async function importLottieUrl(rawUrl: string, opts: LottieImportOptions): Promise<TelaVectorObject> {
  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { throw new Error('That is not a valid URL.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) Lottie URLs can be inserted.');
  let res: Response;
  try { res = await fetch(url.href, { mode: 'cors' }); } catch { throw new Error('Could not download that animation — the server may block cross-origin requests. Download it and drop the file instead.'); }
  if (!res.ok) throw new Error(`The server answered ${res.status} for that animation URL.`);
  const buffer = await res.arrayBuffer();
  const tail = decodeURIComponent(url.pathname.split('/').pop() || '');
  const name = /\.(lottie|json)$/i.test(tail) ? tail : `${tail || 'animation'}${/zip|lottie/i.test(res.headers.get('content-type') || '') ? '.lottie' : '.json'}`;
  const info = await validateLottieBytes(buffer, name);
  const blob = new Blob([buffer], { type: info.format === 'json' ? 'application/json' : 'application/zip+dotlottie' });
  const source = await sourceFor(info, blob, { ...opts, upload: false }, url.href);
  return buildLottieObject(info, source, opts);
}
