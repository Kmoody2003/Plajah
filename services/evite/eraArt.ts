// eraArt — browser rasteriser for the "Design eras" evites. Turns the procedural SVG plate + depth map
// (services/evite/eraEvites.ts) into same-origin blob: URLs that EviteStage can upload to WebGL (CORS-clean), and
// caches them per era / law / size. Plates are text-free, so no web font has to be inside the SVG; the era's live
// headline face is requested here (ensureFontsLoaded) so the DOM text over the card is ready when the card resolves.
import { ensureFontsLoaded } from '../tela/telaFonts';
import type { MotionRecipe } from './motionRecipes';
import { eraEvite, eraPlateSvg, eraDepthSvg, eraMotion, eraVoice, PLATE_W, PLATE_H, ERA_EVITES, type EraEvite } from './eraEvites';

export { ERA_EVITES, eraEvite, eraVoice };
export type { EraEvite };

/** Load the era's headline face before drawing it onto a canvas (print): a canvas silently falls back otherwise. */
export async function eraFontReady(id: string, timeoutMs = 5000): Promise<void> {
  const ev = eraEvite(id);
  if (!ev || typeof document === 'undefined' || !(document as any).fonts) return;
  ensureFontsLoaded([ev.font]);
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-tela-fonts]'));
  const sheets = Promise.all(links.map(l => l.sheet ? null : new Promise(r => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); })));
  const ready = sheets.then(() => document.fonts.load(`${ev.displayStyle} 48px ${ev.display}`)).then(() => undefined).catch(() => undefined);
  await Promise.race([ready, new Promise(r => setTimeout(r, timeoutMs))]);
}

export interface EraArt {
  eraId: string;
  /** blob: URLs (JPEG) — same-origin, so WebGL can sample them */
  plate: string; depth: string;
  /** motion/voice preset collection ("era"); `recipe` is the full per-era recipe */
  preset: string; foil: string; light: boolean;
  recipe: MotionRecipe;
  voice: ReturnType<typeof eraVoice>;
  cta: string; paper: string; ink: string;
  relief: boolean;
}

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => res(img); img.onerror = () => rej(new Error('era plate did not rasterise'));
    // a data: URL (not a blob:) keeps the canvas untainted in every engine, Safari included
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Rasterise an SVG string to a JPEG Blob at w × h. */
export async function rasteriseSvg(svg: string, w: number, h: number, quality = .9): Promise<Blob> {
  const img = await svgImage(svg);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('canvas export failed')), 'image/jpeg', quality));
}

const cache = new Map<string, Promise<EraArt>>();
const thumbs = new Map<string, Promise<string>>();

/** The living-card art for one era (816 × 1224 plate + depth), cached. Rejects for ids that are not era evites. */
export function eraArt(id: string, opts: { showLaw?: boolean } = {}): Promise<EraArt> {
  const ev = eraEvite(id);
  if (!ev) return Promise.reject(new Error(`Not an era design: ${id}`));
  const key = `${ev.eraId}|${opts.showLaw ? 1 : 0}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      ensureFontsLoaded([ev.font, 'inter']);
      const [plate, depth] = await Promise.all([
        rasteriseSvg(eraPlateSvg(ev.id, { showLaw: opts.showLaw }), PLATE_W, PLATE_H, .92),
        rasteriseSvg(eraDepthSvg(ev.id), PLATE_W / 2, PLATE_H / 2, .9),
      ]);
      return {
        eraId: ev.eraId, plate: URL.createObjectURL(plate), depth: URL.createObjectURL(depth),
        preset: ev.preset, foil: ev.foil, light: ev.light, recipe: eraMotion(ev.id), voice: eraVoice(ev.id),
        cta: ev.cta, paper: ev.palette[0], ink: ev.palette[1], relief: ev.relief,
      };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** A small gallery thumbnail (blob: URL), rendered lazily and cached. */
export function eraThumb(id: string, w = 240): Promise<string> {
  const ev = eraEvite(id);
  if (!ev) return Promise.reject(new Error(`Not an era design: ${id}`));
  const key = `${ev.eraId}|${w}`;
  let p = thumbs.get(key);
  if (!p) {
    const h = Math.round(w * PLATE_H / PLATE_W);
    p = rasteriseSvg(eraPlateSvg(ev.id), w, h, .86).then(b => URL.createObjectURL(b));
    p.catch(() => thumbs.delete(key));
    thumbs.set(key, p);
  }
  return p;
}

/** The plate at any size as a JPEG data: URL (print, posters). Not cached: print sizes vary. */
export async function eraPlateDataUrl(id: string, w: number, h: number, opts: { showLaw?: boolean } = {}): Promise<string> {
  const ev = eraEvite(id); if (!ev) throw new Error(`Not an era design: ${id}`);
  const blob = await rasteriseSvg(eraPlateSvg(ev.id, { W: w, H: h, showLaw: opts.showLaw }), w, h, .95);
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
