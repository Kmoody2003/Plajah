// telaLottie — the shared Lottie / dotLottie runtime for Tela (and anything that
// composites Tela motion: Fabula, presentations, Ambo, the broadcast titler).
//
// Pure browser module (no React, no Firebase). Rendering uses
// @lottiefiles/dotlottie-web, which draws into an HTMLCanvasElement or
// OffscreenCanvas through a WASM (ThorVG) core. `setFrame` is synchronous —
// seek → render → putImageData — so frame-accurate offline rendering works
// without requestAnimationFrame.
//
// ── API ─────────────────────────────────────────────────────────────────────
//
//   validateLottieFile(file)            → Promise<LottieFileInfo>   (throws a readable Error)
//   validateLottieBytes(bytes, name)    → Promise<LottieFileInfo>
//   parseLottieJson(text)               → { data, meta }            (throws a readable Error)
//   isLottieFileName(name)              → boolean (.lottie / .json)
//
//   createLottiePlayer(source, width, height, opts?, canvas?) → Promise<TelaLottiePlayer>
//     source: TelaLottieSource | URL string | Lottie JSON object | ArrayBuffer (.lottie)
//     The player owns `canvas` (created when not passed; pass an OffscreenCanvas for workers/export).
//     player.canvas                      the drawing surface (drawImage it into any compositor)
//     player.totalFrames / frameRate / duration (seconds) / width / height (composition size)
//     player.markers / themes            names exposed by the file
//     player.setFrame(frame)             draw an exact frame (sync)
//     player.seek(timeSec)               deterministic TIMELINE seek honouring startOffset,
//                                        segment/marker, speed, loop and direction → frame drawn
//     player.renderFrameAt(timeSec)      seek + return the canvas (sync) — offline/export path
//     player.play() / pause() / isPlaying   realtime playback (dotLottie's own rAF loop)
//     player.configure(partialOpts)      live-update loop/speed/direction/segment/fit/theme/slots
//     player.resize(w?, h?)              resize the backing store (in-DOM canvases follow their CSS box)
//     player.dispose()
//
//   lottieFrameAtTime(timing, timeSec)  pure time→frame mapping (same maths as player.seek)
//   resolveSegmentFrames(timing)        → [startFrame, endFrame]
//   renderLottiePoster(source, spec, maxSide?) → Promise<string | null>   data URL of the poster frame
//   renderLottieFrameAt(source, spec, timeSec, w, h) → Promise<HTMLCanvasElement | OffscreenCanvas>
//     one-shot convenience (creates + keeps a cached player per source/size; call
//     disposeLottieFrameCache() when an export finishes)
//   defaultLottieSpec(source, info)     → TelaLottieSpec with sensible playback defaults
//   prefersReducedMotion()              → boolean

import type { TelaLottieDirection, TelaLottieSource, TelaLottieSpec } from '../../types';
import { getTelaAssetBlob } from './telaAssetStore';

export const LOTTIE_MAX_BYTES = 25 * 1024 * 1024;
/** JSON animations up to this size are embedded in the doc so every copy carries them. */
export const LOTTIE_INLINE_MAX = 200 * 1024;

// ── Metadata + validation ───────────────────────────────────────────────────

export type LottieSlotKind = 'color' | 'text' | 'scalar' | 'vector' | 'image' | 'unknown';

export interface LottieMeta {
  width: number;
  height: number;
  frameRate: number;
  totalFrames: number;
  markers: string[];
  themes: string[];
  slotInfo: Array<{ id: string; kind: LottieSlotKind; default?: unknown }>;
}

export interface LottieFileInfo {
  format: 'json' | 'dotlottie';
  name: string;
  bytes: number;
  meta: LottieMeta;
  /** JSON source text (format 'json' only). */
  text?: string;
  /** Raw bytes (format 'dotlottie' only). */
  buffer?: ArrayBuffer;
}

export const isLottieFileName = (name: string) => /\.(lottie|json)$/i.test(name);

function slotKind(slot: any): LottieSlotKind {
  const p = slot?.p;
  if (!p) return 'unknown';
  if (typeof p === 'object' && (p.u !== undefined || p.p !== undefined) && p.w !== undefined) return 'image';
  const k = p.k;
  if (Array.isArray(k)) {
    if (k.length && typeof k[0] === 'object' && k[0]?.s && typeof k[0].s === 'object' && 't' in k[0].s) return 'text';
    if ((k.length === 3 || k.length === 4) && k.every((n: unknown) => typeof n === 'number' && n >= 0 && n <= 1)) return 'color';
    if (k.length >= 2 && k.every((n: unknown) => typeof n === 'number')) return 'vector';
  }
  if (typeof k === 'number') return 'scalar';
  return 'unknown';
}

/** Metadata from a parsed Lottie animation object. */
export function lottieMetaFromJson(json: any): LottieMeta {
  const ip = Number(json.ip) || 0, op = Number(json.op) || 0;
  const slots = json.slots && typeof json.slots === 'object' ? json.slots : {};
  return {
    width: Math.max(1, Math.round(Number(json.w) || 512)),
    height: Math.max(1, Math.round(Number(json.h) || 512)),
    frameRate: Number(json.fr) || 30,
    totalFrames: Math.max(1, Math.round(op - ip)),
    markers: Array.isArray(json.markers) ? json.markers.map((m: any) => String(m?.cm ?? m?.name ?? '')).filter(Boolean) : [],
    themes: [],
    slotInfo: Object.keys(slots).map(id => {
      const kind = slotKind(slots[id]);
      const raw = JSON.stringify(slots[id]);
      return { id, kind, default: raw.length <= 4096 ? slots[id] : undefined };
    }),
  };
}

/** Parse + shape-check Lottie JSON text. Throws an Error with a user-facing message. */
export function parseLottieJson(text: string): { data: any; meta: LottieMeta } {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('This .json file is not valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This JSON is not a Lottie animation (expected an object).');
  const missing = ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'].filter(k => !(k in data));
  if (missing.length) throw new Error(`This JSON is not a Lottie animation — missing ${missing.map(k => `"${k}"`).join(', ')}. Export it with Bodymovin / LottieFiles.`);
  if (!(Number(data.fr) > 0)) throw new Error('Lottie frame rate ("fr") must be a positive number.');
  if (!(Number(data.op) > Number(data.ip))) throw new Error('Lottie out-point ("op") must be after the in-point ("ip").');
  if (!(Number(data.w) > 0 && Number(data.h) > 0)) throw new Error('Lottie width/height ("w"/"h") must be positive.');
  if (!Array.isArray(data.layers)) throw new Error('Lottie "layers" must be an array.');
  return { data, meta: lottieMetaFromJson(data) };
}

/** Read a dotLottie (.lottie zip): manifest themes + the first animation's metadata. */
export async function inspectDotLottie(buffer: ArrayBuffer): Promise<LottieMeta> {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) throw new Error('This .lottie file is not a dotLottie archive (it is not a zip). It may be corrupted or renamed.');
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(buffer)); } catch { throw new Error('This .lottie archive could not be opened — the zip is damaged.'); }
  let manifest: any = null;
  if (files['manifest.json']) { try { manifest = JSON.parse(strFromU8(files['manifest.json'])); } catch { /* optional */ } }
  const animName = Object.keys(files).filter(n => /^(animations|a)\/[^/]+\.json$/i.test(n)).sort()[0];
  if (!animName) throw new Error('This .lottie archive contains no animation (animations/*.json is missing).');
  let meta: LottieMeta;
  try { meta = lottieMetaFromJson(JSON.parse(strFromU8(files[animName]))); } catch { throw new Error('The animation inside this .lottie archive is not valid Lottie JSON.'); }
  const themes = Array.isArray(manifest?.themes) ? manifest.themes.map((t: any) => String(t?.id ?? t)).filter(Boolean) : [];
  return { ...meta, themes };
}

export async function validateLottieBytes(buffer: ArrayBuffer, name: string): Promise<LottieFileInfo> {
  if (buffer.byteLength === 0) throw new Error(`${name} is empty.`);
  if (buffer.byteLength > LOTTIE_MAX_BYTES) throw new Error(`${name} is ${(buffer.byteLength / 1048576).toFixed(1)} MB — the Lottie limit is ${LOTTIE_MAX_BYTES / 1048576} MB.`);
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (/\.lottie$/i.test(name) || isZip) {
    const meta = await inspectDotLottie(buffer);
    return { format: 'dotlottie', name, bytes: buffer.byteLength, meta, buffer };
  }
  const text = new TextDecoder().decode(buffer);
  const { meta } = parseLottieJson(text);
  return { format: 'json', name, bytes: buffer.byteLength, meta, text };
}

/** Validate a picked/dropped file. Throws an Error with a clear, user-facing message. */
export async function validateLottieFile(file: File): Promise<LottieFileInfo> {
  if (!isLottieFileName(file.name) && !/lottie|json/i.test(file.type)) throw new Error(`${file.name} is not a Lottie file — use a .lottie or Lottie .json export.`);
  if (file.size > LOTTIE_MAX_BYTES) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB — the Lottie limit is ${LOTTIE_MAX_BYTES / 1048576} MB.`);
  return validateLottieBytes(await file.arrayBuffer(), file.name);
}

export function defaultLottieSpec(source: TelaLottieSource, meta: LottieMeta): TelaLottieSpec {
  return {
    source,
    intrinsicWidth: meta.width, intrinsicHeight: meta.height,
    frameRate: meta.frameRate, totalFrames: meta.totalFrames,
    markers: meta.markers.length ? meta.markers : undefined,
    themes: meta.themes.length ? meta.themes : undefined,
    slotInfo: meta.slotInfo.length ? meta.slotInfo : undefined,
    autoplay: true, loop: true, speed: 1, direction: 'forward',
    posterFrame: 0, fit: 'contain',
  };
}

// ── Timing (pure) ───────────────────────────────────────────────────────────

export interface LottieTiming {
  frameRate: number;
  totalFrames: number;
  speed?: number;
  loop?: boolean;
  direction?: TelaLottieDirection;
  segment?: TelaLottieSpec['segment'];
  startOffset?: number;
}

/** Segment as frame numbers [start, end], clamped to the composition. */
export function resolveSegmentFrames(t: Pick<LottieTiming, 'frameRate' | 'totalFrames' | 'segment'>): [number, number] {
  const last = Math.max(0, t.totalFrames - 1);
  if (!t.segment) return [0, last];
  const k = t.segment.unit === 'second' ? t.frameRate : 1;
  let s = Math.max(0, Math.min(last, t.segment.start * k));
  let e = Math.max(0, Math.min(last, t.segment.end * k));
  if (e < s) [s, e] = [e, s];
  if (e - s < 1) e = Math.min(last, s + 1);
  return [s, e];
}

/**
 * Which frame is on screen at `timeSec` of the host timeline. Deterministic:
 * the same inputs always give the same frame (Fabula/titler export rely on it).
 * Before `startOffset` the first frame of the play direction holds.
 */
export function lottieFrameAtTime(t: LottieTiming, timeSec: number): number {
  const [s, e] = resolveSegmentFrames(t);
  const len = Math.max(1e-6, e - s);
  const local = Math.max(0, timeSec - (t.startOffset || 0)) * t.frameRate * Math.max(0, t.speed ?? 1);
  const dir = t.direction || 'forward';
  const loop = t.loop !== false;
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  let u: number; // 0..len progress in the forward sense
  if (dir === 'bounce' || dir === 'reverse-bounce') {
    const cyc = loop ? mod(local, 2 * len) : Math.min(local, 2 * len);
    u = cyc <= len ? cyc : 2 * len - cyc;
    if (dir === 'reverse-bounce') u = len - u;
  } else {
    // A loop's period includes the end frame's own duration (frames s..e inclusive), so a
    // 60-frame/30fps loop wraps to frame 0 exactly at 2s.
    u = loop ? Math.min(len, mod(local, len + 1)) : Math.min(local, len);
    if (dir === 'reverse') u = len - u;
  }
  return Math.max(0, Math.min(t.totalFrames - 1, s + u));
}

// ── Runtime ─────────────────────────────────────────────────────────────────

let ctorPromise: Promise<any> | null = null;
/** Lazy-load dotlottie-web and point its WASM at the bundled copy (works offline). */
export function loadDotLottie(): Promise<any> {
  if (!ctorPromise) {
    ctorPromise = (async () => {
      const mod: any = await import('@lottiefiles/dotlottie-web');
      const Ctor = mod.DotLottie ?? mod.default?.DotLottie;
      if (!Ctor) throw new Error('dotlottie-web did not expose DotLottie.');
      try {
        const wasm: any = await import('@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url');
        if (typeof wasm?.default === 'string') Ctor.setWasmUrl(wasm.default);
      } catch { /* keep the library's CDN default */ }
      return Ctor;
    })();
    ctorPromise.catch(() => { ctorPromise = null; });
  }
  return ctorPromise;
}

export type LottieInput = TelaLottieSource | string | ArrayBuffer | Record<string, unknown>;

/** Turn any accepted input into dotLottie `data` (preferred) or `src`. */
export async function resolveLottieInput(input: LottieInput): Promise<{ data?: string | ArrayBuffer; src?: string }> {
  if (typeof input === 'string') return { src: input };
  if (input instanceof ArrayBuffer) return { data: input };
  const s = input as TelaLottieSource;
  if (typeof s.format === 'string' && ('url' in s || 'assetId' in s || 'inlineJson' in s)) {
    if (s.inlineJson) return { data: s.inlineJson };
    if (s.assetId) {
      const blob = await getTelaAssetBlob(s.assetId);
      if (blob) return { data: s.format === 'json' ? await blob.text() : await blob.arrayBuffer() };
    }
    if (s.url) return { src: s.url };
    throw new Error(s.sessionOnly ? 'This animation was added in an earlier guest session and is no longer available — re-import it.' : 'This animation\'s file is not available on this device.');
  }
  return { data: JSON.stringify(input) };
}

export interface TelaLottiePlayOptions {
  autoplay?: boolean;
  loop?: boolean;
  speed?: number;
  direction?: TelaLottieDirection;
  segment?: TelaLottieSpec['segment'];
  marker?: string;
  startOffset?: number;
  fit?: TelaLottieSpec['fit'];
  themeId?: string;
  slots?: Record<string, unknown>;
  /** Backing-store pixel ratio for in-DOM canvases (default: min(devicePixelRatio, 2)). */
  pixelRatio?: number;
  backgroundColor?: string;
}

export interface TelaLottiePlayer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Escape hatch — the underlying dotlottie-web instance. */
  readonly dotLottie: any;
  readonly totalFrames: number;
  readonly frameRate: number;
  /** Seconds, at speed 1, for the whole composition. */
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly markers: string[];
  readonly themes: string[];
  readonly isPlaying: boolean;
  readonly currentFrame: number;
  setFrame(frame: number): void;
  seek(timeSec: number): number;
  renderFrameAt(timeSec: number): HTMLCanvasElement | OffscreenCanvas;
  play(): void;
  pause(): void;
  configure(opts: TelaLottiePlayOptions): void;
  resize(width?: number, height?: number): void;
  dispose(): void;
}

const MAX_SIDE = 4096;
const toMode = (d?: TelaLottieDirection) => d || 'forward';

/**
 * Create a player that renders `input` into a canvas of `width`×`height`
 * backing pixels. Resolves once the animation has loaded and its first frame
 * is drawn; rejects with a readable Error when the file can't be played.
 */
export async function createLottiePlayer(
  input: LottieInput,
  width: number,
  height: number,
  opts: TelaLottiePlayOptions = {},
  canvas?: HTMLCanvasElement | OffscreenCanvas,
): Promise<TelaLottiePlayer> {
  const Ctor = await loadDotLottie();
  const resolved = await resolveLottieInput(input);
  const surface: HTMLCanvasElement | OffscreenCanvas = canvas
    ?? (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));
  surface.width = Math.max(1, Math.min(MAX_SIDE, Math.round(width)));
  surface.height = Math.max(1, Math.min(MAX_SIDE, Math.round(height)));
  let o: TelaLottiePlayOptions = { ...opts };
  const pixelRatio = () => o.pixelRatio ?? Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

  const dl = new Ctor({
    canvas: surface,
    ...(resolved.data !== undefined ? { data: resolved.data } : { src: resolved.src }),
    autoplay: false,
    loop: o.loop !== false,
    speed: o.speed ?? 1,
    mode: toMode(o.direction),
    layout: { fit: o.fit || 'contain', align: [0.5, 0.5] },
    themeId: o.themeId || undefined,
    marker: o.marker || undefined,
    backgroundColor: o.backgroundColor,
    useFrameInterpolation: true,
    renderConfig: { autoResize: false, freezeOnOffscreen: false, devicePixelRatio: pixelRatio() },
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The Lottie animation took too long to load.')), 20000);
    dl.addEventListener('load', () => { clearTimeout(timer); resolve(); });
    dl.addEventListener('loadError', (ev: any) => { clearTimeout(timer); reject(new Error(`This animation could not be played: ${ev?.error?.message || 'unsupported or corrupted Lottie data'}.`)); });
  }).catch(err => { try { dl.destroy(); } catch { /* */ } throw err; });

  const size = (() => { try { return dl.animationSize?.() || null; } catch { return null; } })();
  const totalFrames = Math.max(1, Math.round(Number(dl.totalFrames) || 1));
  const duration = Number(dl.duration) || totalFrames / 30;
  const frameRate = duration > 0 ? totalFrames / duration : 30;
  const markers: string[] = (() => { try { return (dl.markers?.() || []).map((m: any) => String(m?.name ?? '')).filter(Boolean); } catch { return []; } })();
  const themes: string[] = (dl.manifest?.themes || []).map((t: any) => String(t?.id ?? '')).filter(Boolean);
  let disposed = false;

  const applySlotsAndSegment = () => {
    if (o.slots && Object.keys(o.slots).length) { try { dl.setSlots(JSON.stringify(o.slots)); } catch (e) { console.warn('[telaLottie] slots rejected', e); } }
    if (o.themeId) { try { dl.setTheme(o.themeId); } catch { /* */ } }
    if (o.segment) { const [s, e] = resolveSegmentFrames({ frameRate, totalFrames, segment: o.segment }); try { dl.setSegment(s, e); } catch { /* */ } }
  };
  applySlotsAndSegment();

  const timing = (): LottieTiming => ({ frameRate, totalFrames, speed: o.speed, loop: o.loop, direction: o.direction, segment: o.segment, startOffset: o.startOffset });

  const player: TelaLottiePlayer = {
    canvas: surface,
    dotLottie: dl,
    totalFrames, frameRate, duration,
    width: size?.width || surface.width,
    height: size?.height || surface.height,
    markers, themes,
    get isPlaying() { return !!dl.isPlaying; },
    get currentFrame() { return Number(dl.currentFrame) || 0; },
    setFrame(frame: number) { if (!disposed) dl.setFrame(Math.max(0, Math.min(totalFrames - 1, frame))); },
    seek(timeSec: number) {
      const f = lottieFrameAtTime(timing(), timeSec);
      player.setFrame(f);
      return f;
    },
    renderFrameAt(timeSec: number) { player.seek(timeSec); return surface; },
    play() { if (!disposed) dl.play(); },
    pause() { if (!disposed) dl.pause(); },
    configure(next: TelaLottiePlayOptions) {
      if (disposed) return;
      const prev = o; o = { ...o, ...next };
      if (next.loop !== undefined && next.loop !== prev.loop) dl.setLoop(next.loop !== false);
      if (next.speed !== undefined && next.speed !== prev.speed) dl.setSpeed(Math.max(0.01, next.speed));
      if (next.direction !== undefined && next.direction !== prev.direction) dl.setMode(toMode(next.direction));
      if (next.fit !== undefined && next.fit !== prev.fit) dl.setLayout({ fit: next.fit, align: [0.5, 0.5] });
      if ('segment' in next && JSON.stringify(next.segment) !== JSON.stringify(prev.segment)) {
        if (next.segment) { const [s, e] = resolveSegmentFrames({ frameRate, totalFrames, segment: next.segment }); dl.setSegment(s, e); }
        else dl.setSegment(0, totalFrames - 1);
      }
      if ('marker' in next && next.marker !== prev.marker && next.marker) { try { dl.setMarker(next.marker); } catch { /* */ } }
      if ('themeId' in next && next.themeId !== prev.themeId) { try { if (next.themeId) dl.setTheme(next.themeId); else dl.resetTheme(); } catch { /* */ } }
      if ('slots' in next && JSON.stringify(next.slots) !== JSON.stringify(prev.slots)) { try { dl.setSlots(JSON.stringify(next.slots || {})); } catch (e) { console.warn('[telaLottie] slots rejected', e); } }
      if (next.pixelRatio !== undefined) dl.setRenderConfig({ ...dl.renderConfig, devicePixelRatio: pixelRatio() });
      if (!dl.isPlaying) { try { dl.setFrame(dl.currentFrame); } catch { /* */ } }
    },
    resize(w?: number, h?: number) {
      if (disposed) return;
      if (w && h) { surface.width = Math.max(1, Math.min(MAX_SIDE, Math.round(w))); surface.height = Math.max(1, Math.min(MAX_SIDE, Math.round(h))); }
      // In-DOM canvases are re-measured by dotLottie (CSS box × pixel ratio); off-DOM keep w/h.
      dl.resize();
    },
    dispose() { if (disposed) return; disposed = true; try { dl.destroy(); } catch { /* */ } },
  };
  return player;
}

export const prefersReducedMotion = () => {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Spec → player options (shared by every surface so they agree). */
export function playOptionsFromSpec(spec: TelaLottieSpec): TelaLottiePlayOptions {
  return {
    autoplay: spec.autoplay, loop: spec.loop, speed: spec.speed, direction: spec.direction,
    segment: spec.segment, marker: spec.marker, startOffset: spec.startOffset,
    fit: spec.fit, themeId: spec.themeId, slots: spec.slots,
  };
}

/** Fit an intrinsic size into a long side, keeping aspect. */
export function fitLongSide(w: number, h: number, side: number) { const k = side / Math.max(w, h, 1); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; }

/** Render the poster frame to a small data URL (WebP, PNG fallback). Null on failure. */
export async function renderLottiePoster(input: LottieInput, spec: Pick<TelaLottieSpec, 'intrinsicWidth' | 'intrinsicHeight' | 'posterFrame' | 'themeId' | 'slots'>, maxSide = 360): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const { w, h } = fitLongSide(spec.intrinsicWidth || 512, spec.intrinsicHeight || 512, maxSide);
  let player: TelaLottiePlayer | null = null;
  try {
    player = await createLottiePlayer(input, w, h, { fit: 'contain', themeId: spec.themeId, slots: spec.slots, pixelRatio: 1 });
    player.setFrame(spec.posterFrame || 0);
    const canvas = player.canvas as HTMLCanvasElement;
    const webp = canvas.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[telaLottie] poster render failed', e);
    return null;
  } finally { player?.dispose(); }
}

// ── One-shot frame rendering for exporters ─────────────────────────────────

const frameCache = new Map<string, Promise<TelaLottiePlayer>>();
const cacheKey = (input: LottieInput, w: number, h: number, spec: TelaLottieSpec) => {
  const s = typeof input === 'string' ? input : input instanceof ArrayBuffer ? `buf${input.byteLength}` : (input as TelaLottieSource).assetId || (input as TelaLottieSource).url || `inline${((input as TelaLottieSource).inlineJson || JSON.stringify(input)).length}`;
  return `${s}|${w}x${h}|${spec.fit}|${spec.themeId || ''}|${JSON.stringify(spec.slots || {})}`;
};

/**
 * Deterministically render the frame on screen at `timeSec` (host timeline,
 * honouring the spec's startOffset/segment/speed/loop/direction). Players are
 * cached per source+size so an export loop is just a seek per frame.
 */
export async function renderLottieFrameAt(input: LottieInput, spec: TelaLottieSpec, timeSec: number, width: number, height: number): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const key = cacheKey(input, width, height, spec);
  let p = frameCache.get(key);
  if (!p) { p = createLottiePlayer(input, width, height, { ...playOptionsFromSpec(spec), pixelRatio: 1 }); frameCache.set(key, p); p.catch(() => frameCache.delete(key)); }
  const player = await p;
  player.configure(playOptionsFromSpec(spec));
  return player.renderFrameAt(timeSec);
}

export async function disposeLottieFrameCache(): Promise<void> {
  const all = [...frameCache.values()]; frameCache.clear();
  for (const p of all) { try { (await p).dispose(); } catch { /* */ } }
}
