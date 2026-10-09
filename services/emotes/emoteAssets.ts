// emoteAssets — turns emote definitions into pixels, once, and caches them.
//
//   emoteSrc(def)            sync. A URL an <img> can show right now (SVG data URL, the channel
//                            image, or a kaiju poster frame once baked). Null until a kaiju is baked.
//   getEmoteAsset(def, px)   async. Bitmap frames for canvas drawing (the broadcast composer, the
//                            viewer burst layer, animated kaiju in the picker). Cached by id+size.
//   peekEmoteAsset(def, px)  sync read of the cache — the composer calls this every frame.
//
// SVG emotes rasterise to a single frame. Kaiju emotes are baked from the real canvas puppet into a
// short looping strip (services/emotes/kaijuEmoteBaker.ts, lazy-loaded with the kaiju code).

import type { EmoteDef, KaijuArt } from './emoteTypes';

export interface EmoteAsset {
  frames: CanvasImageSource[];
  fps: number;
  /** Square edge in px. */
  size: number;
}

const svgUrl = new Map<string, string>();
const assets = new Map<string, EmoteAsset>();
const pending = new Map<string, Promise<EmoteAsset | null>>();
const posters = new Map<string, string>();
const listeners = new Set<() => void>();

/** Subscribe to "a new asset finished baking" (lets UIs swap a placeholder for the real thing). */
export function onEmoteAssetsChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const notify = () => listeners.forEach(f => { try { f(); } catch { /* */ } });

export function emoteSrc(def: EmoteDef): string | null {
  const a = def.art;
  if (a.kind === 'image') return a.url;
  if (a.kind === 'svg') {
    let u = svgUrl.get(def.id);
    if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg()); svgUrl.set(def.id, u); }
    return u;
  }
  return posters.get(def.id) ?? null;
}

const key = (id: string, px: number) => `${id}@${px}`;
/** Round requested sizes up to a few buckets so the cache stays small. */
export function sizeBucket(px: number): number {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const want = px * dpr;
  return want <= 48 ? 48 : want <= 96 ? 96 : want <= 160 ? 160 : want <= 256 ? 256 : 384;
}

export function peekEmoteAsset(def: EmoteDef, px: number): EmoteAsset | null {
  const b = sizeBucket(px);
  return assets.get(key(def.id, b)) ?? null;
}

export function getEmoteAsset(def: EmoteDef, px: number): Promise<EmoteAsset | null> {
  const b = sizeBucket(px);
  const k = key(def.id, b);
  const hit = assets.get(k);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(k);
  if (inflight) return inflight;
  const p = build(def, b).then(a => {
    pending.delete(k);
    if (a) {
      assets.set(k, a);
      if (def.art.kind === 'kaiju' && !posters.has(def.id)) posters.set(def.id, posterOf(a, def.art));
      notify();
    }
    return a;
  }).catch(err => { pending.delete(k); console.warn('[emotes] bake failed', def.id, err); return null; });
  pending.set(k, p);
  return p;
}

/** Fire-and-forget warm-up so the first burst of a popular emote is already baked. */
export function preloadEmotes(defs: EmoteDef[], px: number) {
  for (const d of defs) void getEmoteAsset(d, px);
}

async function build(def: EmoteDef, size: number): Promise<EmoteAsset | null> {
  const a = def.art;
  if (a.kind === 'kaiju') {
    const { bakeKaijuEmote } = await import('./kaijuEmoteBaker');
    return bakeKaijuEmote(a, size);
  }
  const src = emoteSrc(def);
  if (!src) return null;
  const img = new Image();
  img.decoding = 'async';
  if (a.kind === 'image') img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  if (a.kind === 'svg' && def.anim) {
    const base = document.createElement('canvas');
    base.width = base.height = size;
    const bg = base.getContext('2d')!;
    bg.imageSmoothingQuality = 'high';
    bg.drawImage(img, 0, 0, size, size);
    const { bakeSvgAnimation } = await import('./emoteAnimators');
    const { frames, fps } = bakeSvgAnimation(base, def.anim, size, def.id);
    return { frames, fps, size };
  }
  if (a.kind === 'image' && a.animated) {
    // Animated GIF/WebP: drawImage of an <img> shows its current frame in most browsers, so keep the element.
    return { frames: [img], fps: 0, size };
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  // contain-fit (uploads may not be square)
  const iw = img.naturalWidth || size, ih = img.naturalHeight || size, k = Math.min(size / iw, size / ih);
  g.drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
  return { frames: [c], fps: 0, size };
}

function posterOf(a: EmoteAsset, art: KaijuArt): string {
  // the frame a third of the way in tends to be the expressive one (after the anticipation)
  const f = a.frames[Math.floor(a.frames.length * (art.frame === 'bust' ? 0.35 : 0.4)) % a.frames.length] as HTMLCanvasElement;
  try { return f.toDataURL('image/png'); } catch { return ''; }
}

/** Which frame to show at time `t` seconds. */
export function frameAt(a: EmoteAsset, t: number): CanvasImageSource {
  if (a.frames.length <= 1 || !a.fps) return a.frames[0];
  return a.frames[Math.floor(t * a.fps) % a.frames.length];
}
