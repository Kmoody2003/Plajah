// layerSources — one adapter per layer content kind.
//
// Every source answers the same question: "give me your current frame as
// something drawImage can take". That single contract is what lets Ambo
// composite Pixels generators, Fabula video, dotLottie graphics, scripture and
// plain text in one stack without any of them knowing about each other.
//
// Sources are STATEFUL and long-lived. A background loop that keeps playing
// while slides change is only possible because the source outlives the slide
// that introduced it — see layerRenderer's reconcile().

import { otherAudioFactor, subscribeAudioPriority } from './audioPriority';
import { amboAudio } from './amboAudioEngine';
import type { LayerContent } from './showModel';
import { lyricClockPos } from './showModel';
import { lyricStyleById, renderLyricFrame } from './lyricStyles';
import { createTelaTemplateSource } from './telaTemplateSource';
import { renderScripture, scriptureLayoutById, transitionById } from './scriptureLayouts';
import { decoAlpha, type ScriptureState } from './scriptureKit';
import { getScriptureLook, subscribeScriptureLook } from './scriptureLook';
import { TypoScriptureBackground } from './typoScriptureBackground';
import { chapterContextFor } from './scriptureContext';
// (scripture is drawn by scriptureLayouts via ScriptureSource)
import {
  createSlideBox, createScriptureBox, createScriptureWithReferenceBoxes,
  renderAutoFitText, autoFitFontSize, autoFlowText,
  SCRIPTURE_AUTO_FIT, DEFAULT_AUTO_FIT,
  type TextBoundingBox, type AutoFitConfig,
} from '../tela/textAutoFit';

export interface LayerSource {
  readonly kind: string;
  /** Current frame, or null when not ready yet. */
  frame(timeSec: number): CanvasImageSource | null;
  /** Natural size, when known — lets the compositor letterbox correctly. */
  size(): { w: number; h: number } | null;
  /** True once there is something worth showing. */
  ready(): boolean;
  dispose(): void;
}

const off = (w: number, h: number): HTMLCanvasElement => {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return { width: w, height: h, getContext: () => null } as any;
};

// ── Text ─────────────────────────────────────────────────────────────────────

/** Greedy wrap at a pixel budget — the renderer's own, independent of slide splitting. */
function wrapToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width <= maxW || !line) line = probe;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

export class TextSource implements LayerSource {
  readonly kind = 'TEXT';
  private canvas: HTMLCanvasElement;
  private dirty = true;
  private last = '';

  constructor(private content: Extract<LayerContent, { kind: 'TEXT' }>, private w = 1920, private h = 1080) {
    this.canvas = off(w, h);
  }

  update(content: Extract<LayerContent, { kind: 'TEXT' }>) {
    this.content = content;
    this.dirty = true;
  }

  private render() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);

    const s = this.content.style ?? {};
    const family = s.font ?? '"Palatino Linotype", Palatino, Georgia, serif';
    const text = this.content.blocks.map(b => b.text).join('\n');

    // Use bounding box auto-fit for precise text containment
    const box: TextBoundingBox = s.boundingBox ?? createSlideBox(this.w, this.h, 0.05);
    const config: AutoFitConfig = {
      ...DEFAULT_AUTO_FIT,
      preferredFontSize: s.size ?? Math.round(this.h * 0.09),
      minFontSize: Math.round(this.h * 0.028),
      maxFontSize: s.size ?? Math.round(this.h * 0.12),
      lineHeight: s.lineHeight ?? 1.32,
      maxLines: s.maxLines ?? 0,
      enabled: s.autoFit !== false,
    };

    renderAutoFitText(ctx, text, box, config, {
      fontFamily: family,
      color: s.color ?? '#ffffff',
      align: (s.align ?? 'center') as CanvasTextAlign,
      shadow: s.shadow !== false,
      outline: s.outline,
    });

    this.last = text;
    this.dirty = false;
  }

  frame() {
    if (this.dirty) this.render();
    return this.canvas;
  }
  size() { return { w: this.w, h: this.h }; }
  ready() { return true; }
  dispose() { /* canvas is GC'd */ }
}

// ── Scripture — reuses the ONE renderer the switcher already uses ────────────

export class ScriptureSource implements LayerSource {
  readonly kind = 'SCRIPTURE';
  private canvas: HTMLCanvasElement;
  private prev: HTMLCanvasElement | null = null;   // outgoing frame during a LOOK change crossfade
  /** Text-only verse change: the outgoing verse, animated out over a held background. */
  private swapFrom: { text: string; reference: string; translation?: string } | null = null;
  private swapAt = 0;
  private swapMs = 0;
  /** Blend mode output: background art and text rendered as separate parts. */
  private bgCanvas: HTMLCanvasElement | null = null;
  private textCanvas: HTMLCanvasElement | null = null;
  private lastParts: Array<{ img: CanvasImageSource; blend?: GlobalCompositeOperation; alpha?: number }> | null = null;
  private born = typeof performance !== 'undefined' ? performance.now() : 0;
  private changeAt = 0;
  private exitAt = 0;
  private exitMs = 0;
  private dirty = true;
  private typo: TypoScriptureBackground | null = null;
  /** Live Pixels generator for looks that declare `generator`. */
  private gen: LayerSource | null = null;
  private genMode = '';
  private offLook: () => void;
  private static readonly VERSE_XFADE_MS = 350;
  /** The chapter's other verses from Lectio, for typographic backgrounds. */
  private context: string[] | null = null;
  private contextKey = '';
  /** Background motion clock + smoothed rate (eases between hold and transition speeds). */
  private mt = 0;
  private rate = 1;
  private lastNow = 0;

  constructor(private content: Extract<LayerContent, { kind: 'SCRIPTURE' }>, private w = 1920, private h = 1080) {
    this.canvas = off(w, h);
    // A look change (layout/transition/accent) repaints every screen showing it.
    this.offLook = subscribeScriptureLook(() => { this.dirty = true; this.syncTypo(); });
    this.syncTypo();
    this.loadContext();
  }

  /** Ask Lectio for the rest of the chapter (cached there; async). */
  private loadContext() {
    const key = `${this.content.reference}|${this.content.translation ?? ''}`;
    if (key === this.contextKey) return;
    this.contextKey = key;
    void chapterContextFor(this.content.reference, this.content.translation).then(ctx => {
      if (this.contextKey !== key || !ctx) return;
      this.context = ctx.others.map(v => `${v.verse} ${v.text}`);
      this.dirty = true;
      if (this.typo && this.context.length) this.typo.setText(ctx.others.slice(0, 6).map(v => v.text).join(' '));
    });
  }

  private text() { return (this.content.lines ?? []).join(' ').replace(/\s+/g, ' ').trim(); }
  private layoutId() { return this.content.layoutId ?? getScriptureLook().layoutId; }
  private transition() { return this.content.transition ?? getScriptureLook().transition; }
  private accent() { return this.content.accent ?? getScriptureLook().accent; }

  /** Start/stop the TYPO-engine background when the layout wants one. */
  private syncTypo() {
    if (typeof document === 'undefined') return;
    const vol = scriptureLayoutById(this.layoutId()).typoVolume;
    if (vol && !this.typo) this.typo = new TypoScriptureBackground(this.w, this.h, vol, this.context?.length ? this.context.slice(0, 6).join(' ') : this.text());
    else if (!vol && this.typo) { this.typo.dispose(); this.typo = null; }
    // Pixels generator background (half-res: it's atmosphere behind type).
    const mode = scriptureLayoutById(this.layoutId()).generator || '';
    if (mode !== this.genMode) {
      this.gen?.dispose(); this.gen = null; this.genMode = mode;
      if (mode) this.gen = new GeneratorSource({ kind: 'GENERATOR', mode } as any, Math.min(960, Math.round(this.w / 2)), Math.min(540, Math.round(this.h / 2)));
    }
  }

  update(content: Extract<LayerContent, { kind: 'SCRIPTURE' }>) {
    const textChanged = (content.lines ?? []).join('|') !== (this.content.lines ?? []).join('|') || content.reference !== this.content.reference;
    const lookChanged = content.layoutId !== this.content.layoutId;
    if (typeof document !== 'undefined') {
      if (lookChanged) {
        // A different look: crossfade the whole frame.
        if (!this.prev) this.prev = off(this.w, this.h);
        const pc = this.prev.getContext('2d');
        if (pc) { pc.clearRect(0, 0, this.w, this.h); pc.drawImage(this.canvas, 0, 0); }
        this.changeAt = performance.now();
      } else if (textChanged) {
        // Verse → verse: ONLY the text transitions; the background stays up.
        this.swapFrom = { text: this.text(), reference: this.content.reference ?? '', translation: this.content.translation };
        this.swapAt = performance.now();
        const vt = transitionById(content.verseTransition ?? getScriptureLook().verseTransition);
        this.swapMs = Math.max(350, vt.inSec * 800);
      }
    }
    this.content = content;
    this.dirty = true;
    if (textChanged || lookChanged) { this.syncTypo(); this.loadContext(); }
  }

  private blend(): { mode: GlobalCompositeOperation; alpha: number } {
    const mode = (this.content.bgBlend ?? getScriptureLook().bgBlend ?? 'normal') as string;
    const alpha = this.content.bgOpacity ?? getScriptureLook().bgOpacity ?? 1;
    return { mode: (mode === 'normal' ? 'source-over' : mode) as GlobalCompositeOperation, alpha };
  }

  /** Blend mode active → background art and text as separate parts for the compositor. */
  parts(): Array<{ img: CanvasImageSource; blend?: GlobalCompositeOperation; alpha?: number }> | null {
    const b = this.blend();
    if (b.mode === 'source-over' && b.alpha >= 1) return null;
    this.frame();
    return this.lastParts;
  }

  /** Called by LayerRenderer when the slot is cleared: play the exit, return its length. */
  beginExit(): number {
    this.exitAt = performance.now();
    this.exitMs = transitionById(this.transition()).outSec * 1000;
    return this.exitMs;
  }

  frame() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return null;
    const now = performance.now();
    const layout = scriptureLayoutById(this.layoutId());
    const tr = transitionById(this.transition());
    const t = (now - this.born) / 1000;
    const enterP = Math.min(1, t / tr.inSec);
    const exitP = this.exitAt ? Math.min(1, (now - this.exitAt) / Math.max(1, this.exitMs)) : 0;
    const xfading = this.prev && now - this.changeAt < ScriptureSource.VERSE_XFADE_MS;
    // Motion clock: subtle–moderate while the verse holds, dynamic through
    // entrances, exits and verse changes; eased so speed never jumps.
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    const target = 1 + 3 * (1 - enterP) + 3 * exitP + (xfading ? 1.6 : 0);
    this.rate += (target - this.rate) * Math.min(1, dt * 6);
    this.mt += dt * this.rate;
    const settled = enterP >= 1 && !exitP && !xfading && !layout.animated && !this.typo && !this.gen && !this.swapFrom;
    if (settled && !this.dirty) return this.canvas;

    const base: ScriptureState = {
      w: this.w, h: this.h, t,
      text: this.text(),
      reference: this.content.reference ?? '',
      translation: this.content.translation,
      copyright: this.content.copyright,
      accent: this.accent(),
      enterP, exitP,
      transition: tr.id,
      typoFrame: this.typo?.frame(now) ?? null,
      context: this.context ?? undefined,
      mt: this.mt,
      genFrame: this.gen ? (this.gen.frame(t) as CanvasImageSource | null) : null,
    };
    // Text-only verse swap in progress?
    const swapP = this.swapFrom ? Math.min(1, (now - this.swapAt) / Math.max(1, this.swapMs)) : 1;
    if (this.swapFrom && swapP >= 1) this.swapFrom = null;
    const vt = transitionById(this.content.verseTransition ?? getScriptureLook().verseTransition).id;
    const heldDeco = decoAlpha(base);
    /** Draw the verse text (incoming, and outgoing during a swap) — decoration per `deco`. */
    const drawText = (c: CanvasRenderingContext2D, deco: number | undefined) => {
      if (this.swapFrom) {
        renderScripture(c, layout.id, { ...base, decoP: deco ?? heldDeco, enterP: swapP, exitP: 0, transition: vt });
        renderScripture(c, layout.id, { ...base, text: this.swapFrom.text, reference: this.swapFrom.reference, translation: this.swapFrom.translation, decoP: 0, enterP: 1, exitP: swapP, transition: vt });
      } else {
        renderScripture(c, layout.id, deco === undefined ? base : { ...base, decoP: deco });
      }
    };

    const b = this.blend();
    ctx.clearRect(0, 0, this.w, this.h);
    if (b.mode === 'source-over' && b.alpha >= 1) {
      drawText(ctx, undefined);
      this.lastParts = null;
    } else {
      // Two parts: background art (blended onto the layers beneath by the
      // compositor) and the verse (normal), so the words stay crisp.
      if (!this.bgCanvas) this.bgCanvas = off(this.w, this.h);
      if (!this.textCanvas) this.textCanvas = off(this.w, this.h);
      const bc = this.bgCanvas.getContext('2d')!, tc = this.textCanvas.getContext('2d')!;
      bc.clearRect(0, 0, this.w, this.h); tc.clearRect(0, 0, this.w, this.h);
      renderScripture(bc, layout.id, { ...base, noText: true });
      drawText(tc, 0);
      this.lastParts = [{ img: this.bgCanvas, blend: b.mode, alpha: b.alpha }, { img: this.textCanvas }];
      // Combined frame for consumers that don't composite parts (thumbnails, legacy views).
      ctx.save(); ctx.globalAlpha = b.alpha; ctx.drawImage(this.bgCanvas, 0, 0); ctx.restore();
      ctx.drawImage(this.textCanvas, 0, 0);
    }
    // Look change: fade the previous look's frame out over the new one.
    if (xfading && this.prev) {
      ctx.globalAlpha = 1 - (now - this.changeAt) / ScriptureSource.VERSE_XFADE_MS;
      ctx.drawImage(this.prev, 0, 0);
      ctx.globalAlpha = 1;
    } else if (this.prev && !xfading) {
      this.prev = null;
    }
    this.dirty = false;
    return this.canvas;
  }
  size() { return { w: this.w, h: this.h }; }
  ready() { return !!(this.content.lines?.length); }
  dispose() { this.offLook(); this.typo?.dispose(); this.typo = null; this.gen?.dispose(); this.gen = null; }
}

// ── Image ────────────────────────────────────────────────────────────────────

export class ImageSource implements LayerSource {
  readonly kind = 'IMAGE';
  private el = new Image();
  private ok = false;

  constructor(src: string) {
    this.el.crossOrigin = 'anonymous';
    this.el.onload = () => { this.ok = true; };
    this.el.onerror = () => { this.ok = false; };
    this.el.src = src;
  }

  frame() { return this.ok ? this.el : null; }
  size() { return this.ok ? { w: this.el.naturalWidth, h: this.el.naturalHeight } : null; }
  ready() { return this.ok; }
  dispose() { this.el.src = ''; }
}

// ── Video ────────────────────────────────────────────────────────────────────

export class VideoSource implements LayerSource {
  readonly kind = 'VIDEO';
  readonly el: HTMLVideoElement;
  private routed = false;

  constructor(content: Extract<LayerContent, { kind: 'VIDEO' }>, audioEnabled = false) {
    const v: HTMLVideoElement = typeof document !== 'undefined'
      ? document.createElement('video')
      : ({ crossOrigin: '', playsInline: true, loop: true, muted: true, volume: 0, src: '', currentTime: 0, readyState: 0, videoWidth: 1920, videoHeight: 1080, play: () => Promise.resolve(), pause: () => {}, load: () => {} } as any);
    v.crossOrigin = 'anonymous';
    v.playsInline = true;
    v.loop = content.loop ?? true;
    // When audioEnabled is true (Studio Program Monitor), video plays audio unless explicitly muted.
    // When audioEnabled is false (Preview, secondary screens), keep video muted to prevent audio doubling.
    v.muted = audioEnabled ? (content.muted ?? false) : true;
    v.volume = audioEnabled ? (content.volume ?? 1.0) : 0;
    // The one window that makes sound routes the video's audio through the
    // Ambo mixer (Video channel) — metered, limited, and feeding visualizers.
    if (audioEnabled && typeof document !== 'undefined') this.routed = amboAudio.attachElement(v, 'video');
    v.src = content.src;
    if (content.inSec) v.currentTime = content.inSec;
    void v.play().catch(() => { /* autoplay blocked until a gesture */ });

    // LoopDeck auto-advance support: dispatch ambo:video-loop when video completes a full loop iteration
    if (typeof window !== 'undefined' && typeof v.addEventListener === 'function') {
      let lastTime = 0;
      v.addEventListener('timeupdate', () => {
        if (!v.seeking && v.currentTime < lastTime - 0.4 && lastTime > 0.5) {
          window.dispatchEvent(new CustomEvent('ambo:video-loop', { detail: { src: content.src, duration: v.duration } }));
        }
        lastTime = v.currentTime;
      });
      v.addEventListener('ended', () => {
        window.dispatchEvent(new CustomEvent('ambo:video-loop', { detail: { src: content.src, duration: v.duration, ended: true } }));
      });
    }

    this.el = v;
  }

  frame() { return this.el.readyState >= 2 ? this.el : null; }
  size() { return this.el.videoWidth ? { w: this.el.videoWidth, h: this.el.videoHeight } : null; }
  ready() { return this.el.readyState >= 2; }
  dispose() { try { this.el.pause(); this.el.src = ''; this.el.load(); } catch { /* */ } if (this.routed) amboAudio.detachElement(this.el); }
}

// ── Lottie — dotLottie renders straight to a canvas ─────────────────────────

export class LottieSource implements LayerSource {
  readonly kind = 'LOTTIE';
  private canvas: HTMLCanvasElement;
  private player: any = null;
  private ok = false;

  constructor(content: Extract<LayerContent, { kind: 'LOTTIE' }>, w = 1920, h = 1080) {
    this.canvas = off(w, h);
    void (async () => {
      try {
        const mod: any = await import('@lottiefiles/dotlottie-web');
        const Ctor = mod.DotLottie ?? mod.default?.DotLottie;
        if (!Ctor) return;
        this.player = new Ctor({
          canvas: this.canvas,
          src: content.src,
          loop: content.loop ?? true,
          autoplay: true,
          speed: content.speed ?? 1,
        });
        this.ok = true;
      } catch { this.ok = false; }
    })();
  }

  frame() { return this.ok ? this.canvas : null; }
  size() { return { w: this.canvas.width, h: this.canvas.height }; }
  ready() { return this.ok; }
  dispose() { try { this.player?.destroy?.(); } catch { /* */ } }
}

// ── Generator — Pixels' GLSL backgrounds, on their own GL canvas ────────────
//
// GeneratorRenderer draws into a pooled FBO texture, so a tiny present pass
// blits that texture onto the canvas the 2D compositor can drawImage.
//
// A GENERATOR `mode` can be any visualizer the library lists, so the source
// picks a render path per mode:
//   · gen      — a Pixels GEN_GLSL mode (GeneratorRenderer)
//   · flux     — a Flux three.js scene (FLUX_*; shared renderFluxLatest env)
//   · gl       — a Studio GL preset (STUDIO_PLASMA / STUDIO_RAYMARCH; GLRenderer)
//   · milkdrop — `MILKDROP:<preset name>` (butterchurn via milkdropDriver)
//   · fallback — anything else: an honest labelled card, never a black box.

const PRESENT_VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

const PRESENT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes;
out vec4 o; void main(){ o = texture(uTex, gl_FragCoord.xy/uRes); }`;

export const MILKDROP_PREFIX = 'MILKDROP:';

/** Legacy / placeholder mode names that older shows and the DJ injector use. */
const GEN_MODE_ALIASES: Record<string, string> = {
  AUDIO_WAVE_SPECTRUM: 'SPECTRUM',
  FLUX: 'FLUX_FIELD',
  SHADER: 'KALEIDOSCOPE',
  MILKDROP: MILKDROP_PREFIX,
  BUTTERCHURN_COSMIC: MILKDROP_PREFIX,
  BUTTERCHURN_ACID: MILKDROP_PREFIX,
  BUTTERCHURN_NEON: MILKDROP_PREFIX,
  BUTTERCHURN_LORENZ: MILKDROP_PREFIX,
};

export function normalizeGeneratorMode(mode: string | undefined | null): string {
  const m = (mode || '').trim();
  return GEN_MODE_ALIASES[m] ?? m;
}

/** "STUDIO_AURORA" → "Studio Aurora"; "MILKDROP:Geiss - X" → "Geiss - X". */
function humanizeMode(mode: string): string {
  if (mode.startsWith(MILKDROP_PREFIX)) return mode.slice(MILKDROP_PREFIX.length) || 'Milkdrop';
  if (mode.length > 48 || /[\n{;]/.test(mode)) return 'Custom visual';
  return mode.toLowerCase().split(/[_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Visualizer';
}

// Visualizers with no analyser connected still get gentle synthetic "idle"
// audio, so a reactive mode on an empty stage moves instead of sitting dead.
const synthFreq = new Uint8Array(256);
const synthWave = new Uint8Array(256);
function synthAudio(t: number) {
  for (let i = 0; i < 256; i++) {
    synthFreq[i] = Math.max(0, Math.min(255, 120 * Math.exp(-i / 42) * (0.6 + 0.4 * Math.sin(t * 2.2 - i * 0.05)) + 20));
    synthWave[i] = Math.max(0, Math.min(255, 128 + 48 * Math.sin(t * 6 + i * 0.19) * (0.6 + 0.4 * Math.sin(t * 0.7))));
  }
  return { freq: synthFreq, wave: synthWave };
}

// Real mix → visuals, with an idle floor: as the Ambo master goes silent the
// synthetic motion fades in, so a visual reacts to music when there is music
// and still breathes (rather than freezing) when there isn't.
const liveFreq = new Uint8Array(256), liveWave = new Uint8Array(256);
const rawFreq = new Uint8Array(1024), rawWave = new Uint8Array(2048);
let liveStamp = -1;
function readLive(analyser: AnalyserNode, t: number): { freq: Uint8Array; wave: Uint8Array; level: number } {
  if (liveStamp === t) return { freq: liveFreq, wave: liveWave, level: liveLevel };
  const nb = Math.min(1024, analyser.frequencyBinCount), nw = Math.min(2048, analyser.fftSize);
  const f = rawFreq.subarray(0, nb), w = rawWave.subarray(0, nw);
  analyser.getByteFrequencyData(f);
  analyser.getByteTimeDomainData(w);
  let sum = 0;
  for (let i = 0; i < 256; i++) { liveFreq[i] = f[Math.min(nb - 1, i)]; sum += liveFreq[i]; }
  for (let i = 0; i < 256; i++) liveWave[i] = w[Math.floor((i / 256) * nw)];
  const level = sum / 256 / 255;
  // 0 → fully idle, 1 → fully live (crossover around a quiet room's floor)
  const live = Math.min(1, level / 0.06);
  if (live < 1) {
    const s = synthAudio(t);
    const k = (1 - live) * 0.65;
    for (let i = 0; i < 256; i++) {
      liveFreq[i] = Math.min(255, liveFreq[i] + s.freq[i] * k);
      liveWave[i] = Math.round(liveWave[i] * live + (128 + (s.wave[i] - 128) * k) * (1 - live));
    }
  }
  liveLevel = level;
  liveStamp = t;
  return { freq: liveFreq, wave: liveWave, level };
}
let liveLevel = 0;

function feedAudioTexture(audio: any, analyser: AnalyserNode | null, t: number) {
  if (!audio) return;
  try {
    if (analyser) {
      const l = readLive(analyser, t);
      audio.updateFromArrays(l.freq, l.wave, 48000);
      return;
    }
    const s = synthAudio(t);
    audio.updateFromArrays(s.freq, s.wave, 48000);
  } catch { /* audio is optional */ }
}

function bandsFrom(analyser: AnalyserNode | null, t: number) {
  if (analyser) {
    try {
      const f = readLive(analyser, t).freq;
      const avg = (a: number, b: number) => { let s = 0; const e = Math.min(f.length, b); for (let i = a; i < e; i++) s += f[i]; return e > a ? s / (e - a) / 255 : 0; };
      const bass = avg(0, 8), mid = avg(8, 64), treble = avg(64, 256);
      return { bass, mid, treble, level: (bass + mid + treble) / 3, beat: bass > 0.6 ? 1 : 0 };
    } catch { /* fall through */ }
  }
  const bass = 0.35 + 0.2 * Math.sin(t * 2.1), mid = 0.3 + 0.15 * Math.sin(t * 1.3 + 1), treble = 0.22 + 0.1 * Math.sin(t * 3.1 + 2);
  return { bass, mid, treble, level: (bass + mid + treble) / 3, beat: 0 };
}

/** Free a WebGL context NOW rather than at GC — browsers cap live contexts at ~16. */
function loseGL(gl: WebGLRenderingContext | WebGL2RenderingContext | null | undefined) {
  try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* */ }
}

/** Honest "can't render this here" card — labelled, gently animated, never black. */
function drawFallbackCard(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, title: string, note: string) {
  const a = t * 0.35;
  const grad = ctx.createLinearGradient(w * (0.5 + 0.4 * Math.sin(a)), 0, w * (0.5 + 0.4 * Math.cos(a * 0.7)), h);
  grad.addColorStop(0, '#100720');
  grad.addColorStop(0.45, '#2a1040');
  grad.addColorStop(1, '#061727');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0, 218, 243, 0.07)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.55);
  for (let x = 0; x <= w; x += 24) ctx.lineTo(x, h * 0.55 + Math.sin(x * 0.006 + a * 2) * h * 0.06);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  const s = Math.max(10, Math.round(h * 0.055));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `600 ${s}px system-ui, sans-serif`;
  ctx.fillText(title.length > 40 ? title.slice(0, 38) + '…' : title, w / 2, h * 0.44);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `500 ${Math.round(s * 0.6)}px system-ui, sans-serif`;
  ctx.fillText(note, w / 2, h * 0.44 + s * 1.3);
}

/** While a visualizer is still loading (lazy modules, three.js, butterchurn), show
 *  a labelled card after a short grace period instead of a black hole. */
function pendingFrame(holder: { pendingCanvas?: HTMLCanvasElement | null; w: number; h: number; bornAt: number }, t: number, title: string): HTMLCanvasElement | null {
  if (Date.now() - holder.bornAt < 400) return null;
  if (!holder.pendingCanvas) holder.pendingCanvas = off(holder.w, holder.h);
  const ctx = holder.pendingCanvas.getContext('2d');
  if (!ctx) return null;
  drawFallbackCard(ctx, holder.w, holder.h, t, title, 'Loading visual…');
  return holder.pendingCanvas;
}

// One wall clock for every Flux consumer: the three.js env (and its camera
// director) is shared, so feeding it several unrelated clocks makes it jitter.
const fluxT0 = typeof performance !== 'undefined' ? performance.now() : 0;
const fluxClock = () => ((typeof performance !== 'undefined' ? performance.now() : 0) - fluxT0) / 1000;

// Milkdrop needs an AudioContext to construct even when we inject waveforms;
// one suspended context is shared instead of one per source.
let sharedMilkdropCtx: AudioContext | null = null;
function milkdropAudioCtx(): AudioContext | null {
  if (sharedMilkdropCtx) return sharedMilkdropCtx;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    sharedMilkdropCtx = AC ? new AC() : null;
  } catch { sharedMilkdropCtx = null; }
  return sharedMilkdropCtx;
}

type GenPath = 'pending' | 'gen' | 'flux' | 'gl' | 'milkdrop' | 'fallback';

export class GeneratorSource implements LayerSource {
  readonly kind = 'GENERATOR';
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private renderer: any = null;
  private audio: any = null;
  private prog: WebGLProgram | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private vao: any = null;
  private path: GenPath = 'pending';
  private mode: string;
  private fluxScene = '';
  private glKey = '';
  private flux: { render: (spec: any, w: number, h: number, t: number, a?: any) => HTMLCanvasElement | null; status: () => string } | null = null;
  private milk: any = null;
  private fluxDrawn = false;
  private fallbackNote = 'Not available on this output';
  private disposed = false;
  private analyserNode: AnalyserNode | null = null;
  bornAt = Date.now();
  pendingCanvas: HTMLCanvasElement | null = null;

  constructor(private content: Extract<LayerContent, { kind: 'GENERATOR' }>, public w = 1280, public h = 720) {
    this.canvas = off(w, h);
    this.mode = normalizeGeneratorMode(content.mode);
    void this.init();
    const src = (content as any).audioSource;
    this.setAudioSource(src ?? 'ambo-playback');
  }

  /** Which render path this source resolved to (for diagnostics / tests). */
  get renderPath(): GenPath { return this.path; }

  setAudioSource(source: 'ambo-playback' | 'live-input' | 'none'): void {
    if (source === 'ambo-playback') {
      this.analyserNode = (typeof window !== 'undefined' ? (window as any).getAmboMasterAnalyser?.() : null) ?? null;
    } else if (source === 'live-input') {
      navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(stream);
        this.analyserNode = audioCtx.createAnalyser();
        this.analyserNode.fftSize = 256;
        src.connect(this.analyserNode);
      }).catch(() => {});
    } else {
      this.analyserNode = null;
    }
  }

  private toFallback(note?: string) {
    loseGL(this.gl);
    this.gl = null; this.renderer = null; this.prog = null;
    if (note) this.fallbackNote = note;
    // A canvas that already holds a WebGL context cannot hand out a 2D one.
    this.canvas = off(this.w, this.h);
    this.ctx2d = this.canvas.getContext('2d');
    this.path = 'fallback';
  }

  private async init() {
    const mode = this.mode;
    try {
      const [glUtil, gens, { AudioTexture }, types] = await Promise.all([
        import('../../components/plajahPixels/engine/core/glUtil'),
        import('../../components/plajahPixels/engine/core/generators'),
        import('../../components/plajahPixels/engine/core/audioTexture'),
        import('../../components/plajahPixels/types'),
      ]);
      if (this.disposed) return;

      // 1) Pixels GEN_GLSL generator.
      if (gens.hasGenerator(mode)) {
        const gl = glUtil.createGL(this.canvas);
        if (!gl) { this.toFallback('WebGL2 unavailable'); return; }
        this.gl = gl;
        this.renderer = new gens.GeneratorRenderer(gl);
        this.audio = new AudioTexture(gl);
        this.prog = glUtil.createProgram(gl, PRESENT_VS, PRESENT_FS);
        this.uTex = gl.getUniformLocation(this.prog, 'uTex');
        this.uRes = gl.getUniformLocation(this.prog, 'uRes');
        this.vao = glUtil.createFullscreenQuad(gl);
        this.path = 'gen';
        return;
      }

      // 2) Flux three.js scene — rendered by the shared env, copied into our canvas.
      const fluxScene = (types as any).MODE_TO_FLUX_SCENE?.[mode] as string | undefined;
      if (fluxScene) {
        const flux = await import('../../components/plajahPixels/engine/core/flux');
        if (this.disposed) return;
        this.fluxScene = fluxScene;
        this.flux = { render: flux.renderFluxLatest as any, status: flux.fluxStatus };
        this.ctx2d = this.canvas.getContext('2d');
        // Kick the async three.js load now so the first frames are not wasted.
        void flux.renderFlux({ scene: fluxScene as any }, 64, 36, 0).catch(() => null);
        this.path = 'flux';
        return;
      }

      // 3) Studio GL preset (Plasma / Raymarch).
      const studioKey = (types as any).MODE_TO_STUDIO_SCENE?.[mode] as string | undefined;
      if (studioKey === 'plasma' || studioKey === 'raymarch') {
        const { GLRenderer } = await import('../../components/plajahPixels/engine/webgl/glRenderer');
        if (this.disposed) return;
        const r = new GLRenderer(this.canvas);
        if (!r.ok) { loseGL(r.gl); this.toFallback('WebGL2 unavailable'); return; }
        this.renderer = r;
        this.gl = r.gl;
        this.glKey = studioKey;
        this.path = 'gl';
        return;
      }

      // 4) Milkdrop preset.
      if (mode.startsWith(MILKDROP_PREFIX)) {
        const actx = milkdropAudioCtx();
        if (!actx) { this.toFallback('Audio engine unavailable'); return; }
        const { createMilkdropDriver } = await import('../../components/plajahPixels/engine/core/milkdropDriver');
        const drv = await createMilkdropDriver({ width: this.w, height: this.h, audioCtx: actx, fps: 60 });
        if (this.disposed) { try { drv?.dispose(); loseGL(drv?.canvas.getContext('webgl2') as any); } catch { /* */ } return; }
        if (!drv) { this.toFallback('Milkdrop unavailable'); return; }
        const name = mode.slice(MILKDROP_PREFIX.length);
        drv.setPreset(name ? name : 0, 0);
        this.milk = drv;
        this.path = 'milkdrop';
        return;
      }
    } catch (err) {
      console.warn('[ambo] generator init failed for', mode, err);
      this.toFallback('Failed to start');
      return;
    }

    this.toFallback('Not available on this output');
  }

  frame(timeSec: number) {
    if (this.disposed) return null;
    if (!this.analyserNode && typeof window !== 'undefined') {
      this.analyserNode = (window as any).getAmboMasterAnalyser?.() ?? null;
    }

    try {
      if (this.path === 'gen' && this.gl && this.renderer && this.prog) {
        const gl = this.gl;
        if (gl.isContextLost()) { this.toFallback('Graphics context lost'); return this.frame(timeSec); }
        feedAudioTexture(this.audio, this.analyserNode, timeSec);
        const p = this.content.params ?? {};
        const num = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);

        const tex = this.renderer.render('bg', this.mode, this.w, this.h, {
          time: timeSec,
          audio: this.audio,
          colors: [[0.55, 0.36, 0.95], [0.83, 0, 0.33], [1, 0.55, 0]],
          params: [num('p0', 0.5), num('p1', 0.5), num('p2', 0.5), num('p3', 0.5)],
        });

        // Present the generator texture onto the visible canvas.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.w, this.h);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.uTex, 0);
        gl.uniform2f(this.uRes, this.w, this.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        return this.canvas;
      }

      if (this.path === 'gl' && this.renderer) {
        if (this.gl?.isContextLost()) { this.toFallback('Graphics context lost'); return this.frame(timeSec); }
        const b = bandsFrom(this.analyserNode, timeSec);
        this.renderer.resize();
        this.renderer.draw(this.glKey, timeSec * 1000, b, { speed: 1, glow: 1 } as any, ['#8b5cf6', '#d40055', '#ff8c00', '#0a0612']);
        return this.canvas;
      }

      if (this.path === 'flux' && this.flux && this.ctx2d) {
        const t = fluxClock();
        const src = this.flux.render({ scene: this.fluxScene }, this.w, this.h, t, bandsFrom(this.analyserNode, t));
        if (src) {
          this.ctx2d.drawImage(src, 0, 0, this.w, this.h);
          this.fluxDrawn = true;
          return this.canvas;
        }
        if (this.flux.status() === 'failed') { this.toFallback('3D engine unavailable'); return this.frame(timeSec); }
        if (!this.fluxDrawn) drawFallbackCard(this.ctx2d, this.w, this.h, timeSec, humanizeMode(this.mode), 'Loading 3D scene…');
        return this.canvas;
      }

      if (this.path === 'milkdrop' && this.milk) {
        let wave: Uint8Array | null = null;
        if (this.analyserNode) {
          try { wave = readLive(this.analyserNode, timeSec).wave; } catch { wave = null; }
        }
        if (!wave) wave = synthAudio(timeSec).wave;
        this.milk.renderFrame(wave);
        return this.milk.canvas as HTMLCanvasElement;
      }

      if (this.path === 'fallback' && this.ctx2d) {
        drawFallbackCard(this.ctx2d, this.w, this.h, timeSec, humanizeMode(this.mode), this.fallbackNote);
        return this.canvas;
      }
      if (this.path === 'pending') return pendingFrame(this, timeSec, humanizeMode(this.mode));
    } catch (err) {
      console.warn('[ambo] generator frame failed for', this.mode, err);
      this.toFallback('Render error');
    }
    return null;
  }

  size() { return { w: this.w, h: this.h }; }
  ready() { return this.path !== 'pending'; }
  dispose() {
    this.disposed = true;
    try { if (this.path === 'gen') { this.renderer?.dispose?.(); this.audio?.dispose?.(); } } catch { /* */ }
    try { if (this.milk) { this.milk.dispose(); loseGL(this.milk.canvas.getContext('webgl2')); } } catch { /* */ }
    loseGL(this.gl);
    this.gl = null; this.renderer = null; this.milk = null;
  }
}

// ── Shader — Custom GLSL / Shaders from Plajah Pixels Library ─────────────────
//
// Library shaders are Shadertoy-style (`void mainImage(out vec4, in vec2)`) and
// render through Pixels' ShaderRenderer — the same surface the Pixels gallery,
// its thumbnails and the offline renderer use. A raw `void main()` fragment is
// still accepted for hand-written sources. A shader that will not compile shows
// a labelled card, not transparency.

export class ShaderSource implements LayerSource {
  readonly kind = 'SHADER';
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private renderer: any = null;
  private audio: any = null;
  private prog: WebGLProgram | null = null;
  private vao: any = null;
  private uTime: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uPRes: WebGLUniformLocation | null = null;
  private path: 'pending' | 'shadertoy' | 'raw' | 'fallback' = 'pending';
  private checked = false;
  private disposed = false;
  private note = 'Shader unavailable';
  bornAt = Date.now();
  pendingCanvas: HTMLCanvasElement | null = null;

  constructor(private content: Extract<LayerContent, { kind: 'SHADER' }>, public w = 1280, public h = 720) {
    this.canvas = off(w, h);
    void this.init();
  }

  get renderPath() { return this.path; }

  private toFallback(note: string) {
    loseGL(this.gl);
    this.gl = null; this.renderer = null; this.prog = null;
    this.note = note;
    this.canvas = off(this.w, this.h);
    this.ctx2d = this.canvas.getContext('2d');
    this.path = 'fallback';
  }

  private async init() {
    const src = this.content.src || '';
    try {
      const glUtil = await import('../../components/plajahPixels/engine/core/glUtil');
      if (this.disposed) return;
      if (/\bmainImage\s*\(/.test(src)) {
        const [{ ShaderRenderer }, { AudioTexture }] = await Promise.all([
          import('../../components/plajahPixels/engine/core/shaderRenderer'),
          import('../../components/plajahPixels/engine/core/audioTexture'),
        ]);
        if (this.disposed) return;
        const gl = glUtil.createGL(this.canvas);
        if (!gl) { this.toFallback('WebGL2 unavailable'); return; }
        this.gl = gl;
        this.renderer = new ShaderRenderer(gl);
        this.audio = new AudioTexture(gl);
        this.prog = glUtil.createProgram(gl, PRESENT_VS, PRESENT_FS);
        this.uTex = gl.getUniformLocation(this.prog, 'uTex');
        this.uPRes = gl.getUniformLocation(this.prog, 'uRes');
        this.vao = glUtil.createFullscreenQuad(gl);
        this.path = 'shadertoy';
        return;
      }
      if (src.includes('void main')) {
        const gl = glUtil.createGL(this.canvas);
        if (!gl) { this.toFallback('WebGL2 unavailable'); return; }
        let fsSrc = src;
        if (!fsSrc.startsWith('#version')) {
          fsSrc = `#version 300 es\nprecision highp float;\nuniform float uTime;\nuniform vec2 uRes;\nout vec4 fragColor;\n` + fsSrc;
        }
        this.gl = gl;
        this.prog = glUtil.createProgram(gl, PRESENT_VS, fsSrc);
        this.uTime = gl.getUniformLocation(this.prog, 'uTime') || gl.getUniformLocation(this.prog, 'time') || gl.getUniformLocation(this.prog, 'iTime');
        this.uRes = gl.getUniformLocation(this.prog, 'uRes') || gl.getUniformLocation(this.prog, 'resolution') || gl.getUniformLocation(this.prog, 'iResolution');
        this.vao = glUtil.createFullscreenQuad(gl);
        this.path = 'raw';
        return;
      }
    } catch (err) {
      console.warn('[ambo] shader failed to compile', err);
      this.toFallback('Shader failed to compile');
      return;
    }
    this.toFallback(src.trim() ? 'Unrecognised shader format' : 'No shader source');
  }

  frame(timeSec: number) {
    if (this.disposed) return null;
    try {
      if (this.path === 'shadertoy' && this.gl && this.renderer && this.prog) {
        const gl = this.gl;
        if (gl.isContextLost()) { this.toFallback('Graphics context lost'); return this.frame(timeSec); }
        const analyser: AnalyserNode | null = (typeof window !== 'undefined' ? (window as any).getAmboMasterAnalyser?.() : null) ?? null;
        feedAudioTexture(this.audio, analyser, timeSec);
        const p = this.content.params ?? {};
        const num = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
        const tex = this.renderer.render('bg', this.content.src, this.w, this.h, {
          time: timeSec, audio: this.audio,
          params: [num('p0', 0.5), num('p1', 0.5), num('p2', 0.5), num('p3', 0.5)],
        });
        if (!this.checked) {
          this.checked = true;
          // ShaderRenderer caches a null program for a source that failed to compile.
          const entry = this.renderer.progs?.get?.(this.content.src);
          if (entry && !entry.p) { this.toFallback('Shader failed to compile'); return this.frame(timeSec); }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.w, this.h);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.uTex, 0);
        gl.uniform2f(this.uPRes, this.w, this.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        return this.canvas;
      }
      if (this.path === 'raw' && this.gl && this.prog) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.w, this.h);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        if (this.uTime) gl.uniform1f(this.uTime, timeSec);
        if (this.uRes) gl.uniform2f(this.uRes, this.w, this.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        return this.canvas;
      }
      if (this.path === 'fallback' && this.ctx2d) {
        drawFallbackCard(this.ctx2d, this.w, this.h, timeSec, 'Shader', this.note);
        return this.canvas;
      }
      if (this.path === 'pending') return pendingFrame(this, timeSec, 'Shader');
    } catch (err) {
      console.warn('[ambo] shader frame failed', err);
      this.toFallback('Render error');
    }
    return null;
  }

  size() { return { w: this.w, h: this.h }; }
  ready() { return this.path !== 'pending'; }
  dispose() {
    this.disposed = true;
    try { this.renderer?.dispose?.(); this.audio?.dispose?.(); } catch { /* */ }
    loseGL(this.gl);
    this.gl = null; this.renderer = null;
  }
}

/**
 * Render one still of a visualizer through the exact source the monitors use —
 * for library thumbnails of modes the shared preview engine cannot draw (Flux
 * 3D, Studio GL presets, Milkdrop). Builds, renders a few frames, snapshots,
 * and frees its GL context. Returns a data URL, or null if nothing rendered.
 */
export async function snapshotVisualizer(
  content: Extract<LayerContent, { kind: 'GENERATOR' | 'SHADER' }>,
  w = 320, h = 180, atSec = 6, timeoutMs = 15000,
): Promise<string | null> {
  const src: GeneratorSource | ShaderSource = content.kind === 'GENERATOR'
    ? new GeneratorSource(content, w, h)
    : new ShaderSource(content, w, h);
  try {
    const t0 = Date.now();
    while (!src.ready() && Date.now() - t0 < timeoutMs) await new Promise(r => setTimeout(r, 40));
    if (!src.ready()) return null;
    const out = off(w, h);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    // Flux loads three.js lazily and Milkdrop needs a few frames to build up.
    let drew = false;
    for (let i = 0; i < 90 && Date.now() - t0 < timeoutMs; i++) {
      const f = src.frame(atSec + i / 30);
      const path = (src as any).renderPath;
      if (path === 'flux' && !(src as any).fluxDrawn) { await new Promise(r => setTimeout(r, 60)); continue; }
      if (f) { ctx.drawImage(f, 0, 0, w, h); drew = true; }
      if (path === 'milkdrop' && i < 40) continue;
      if (drew) break;
    }
    return drew ? out.toDataURL('image/jpeg', 0.75) : null;
  } catch {
    return null;
  } finally {
    src.dispose();
  }
}

// ── Audio ────────────────────────────────────────────────────────────────────
//
// Has no picture — frame() returns null and the compositor skips it — but the
// source is still created and kept alive by the renderer, which is what gives
// it a lifecycle: it starts when its layer appears, fades and stops when the
// layer is cleared or replaced.
//
// ONLY ONE WINDOW MAY PLAY. If every output window built its own AudioSource,
// a service with five outputs would play five slightly-out-of-phase copies.
// The renderer's `audioEnabled` option gates construction; it is true in the
// studio and false in output windows.

export class AudioSource implements LayerSource {
  readonly kind = 'AUDIO';
  private el: HTMLAudioElement;
  private target: number;
  /** The bed's own fade level, before the video-priority factor is applied. */
  private level: number;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private gone = false;
  private offPriority: () => void;
  private routed = false;

  constructor(content: Extract<LayerContent, { kind: 'AUDIO' }>) {
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.loop = content.loop ?? false;
    a.preload = 'auto';
    a.src = content.src;
    this.target = content.volume ?? 1;

    const fadeIn = content.fadeInSec ?? 0;
    this.level = fadeIn > 0 ? 0 : this.target;
    this.el = a;
    this.apply();
    // Through the Ambo mixer (Slide Audio channel): metered, limited, visible
    // to the visualizers. AudioSource only exists in the window that plays.
    this.routed = amboAudio.attachElement(a, 'slides');

    // With scope 'all', a video with sound on Program ducks/silences this bed
    // too (audioPriority.ts). The default policy leaves it alone.
    this.offPriority = subscribeAudioPriority(() => this.apply());

    // Autoplay needs a prior gesture. The operator has always clicked something
    // by the time a cue fires, but if it's blocked we retry on the next one
    // rather than failing silently for the rest of the service.
    void a.play().catch(() => {
      const retry = () => { void a.play().catch(() => {}); window.removeEventListener('pointerdown', retry); };
      window.addEventListener('pointerdown', retry, { once: true });
    });

    if (fadeIn > 0) this.ramp(this.target, fadeIn);
  }

  private apply() {
    try { this.el.volume = Math.min(1, Math.max(0, this.level * otherAudioFactor())); } catch { /* */ }
  }

  private ramp(to: number, seconds: number, then?: () => void) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const step = 50;
    const steps = Math.max(1, Math.round((seconds * 1000) / step));
    const from = this.level;
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      this.level = from + (to - from) * (i / steps);
      this.apply();
      if (i >= steps) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        then?.();
      }
    }, step);
  }

  update(content: Extract<LayerContent, { kind: 'AUDIO' }>) {
    this.target = content.volume ?? 1;
    this.el.loop = content.loop ?? false;
    if (!this.fadeTimer) { this.level = this.target; this.apply(); }
  }

  /** Fade out, then stop — so clearing a bed doesn't chop it off. */
  fadeOutAndStop(seconds: number) {
    this.ramp(0, seconds, () => { try { this.el.pause(); } catch { /* */ } });
  }

  frame() { return null; }
  size() { return null; }
  ready() { return !this.gone; }

  dispose() {
    this.gone = true;
    this.offPriority();
    if (this.routed) amboAudio.detachElement(this.el);
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    try { this.el.pause(); this.el.src = ''; } catch { /* */ }
  }
}

// ── Clock / timer ────────────────────────────────────────────────────────────

export class ClockSource implements LayerSource {
  readonly kind = 'CLOCK';
  private canvas = off(960, 240);

  constructor(private label: () => string) {}

  frame() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 960, 240);
    ctx.font = 'bold 150px ui-monospace, "Cascadia Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.label(), 480, 120);
    return this.canvas;
  }
  size() { return { w: 960, h: 240 }; }
  ready() { return true; }
  dispose() { /* */ }
}

// ── Live Video Source (DeckLink, Switcher PGM/AUX, NDI, Camera) ─────────────

import { getAppOutputStream, onAppOutputStream } from '../mediaEngine/bridge';

export class LiveSource implements LayerSource {
  readonly kind = 'live';
  private video: HTMLVideoElement;
  private unsubscribe?: () => void;
  private isReady = false;

  constructor(private content: Extract<LayerContent, { kind: 'LIVE' }>) {
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;

    if (content.stream) {
      this.video.srcObject = content.stream;
      this.video.play().catch(() => {});
      this.isReady = true;
    } else if (content.inputId) {
      const existing = getAppOutputStream(content.inputId);
      if (existing) {
        this.video.srcObject = existing;
        this.video.play().catch(() => {});
        this.isReady = true;
      }
      this.unsubscribe = onAppOutputStream(content.inputId, (stream) => {
        this.video.srcObject = stream;
        this.video.play().catch(() => {});
        this.isReady = true;
      });
    }
  }

  frame(): CanvasImageSource | null {
    return (this.isReady && this.video.readyState >= 2) ? this.video : null;
  }

  size(): { w: number; h: number } | null {
    return {
      w: this.video.videoWidth || 1920,
      h: this.video.videoHeight || 1080,
    };
  }

  ready(): boolean {
    return this.isReady && this.video.readyState >= 2;
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.video.pause();
    this.video.srcObject = null;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSource(
  content: LayerContent,
  frame: { w: number; h: number },
  timers?: Record<string, number>,
  audioEnabled = false,
): LayerSource | null {
  switch (content.kind) {
    // Gated so only one window in the building actually makes noise.
    case 'AUDIO': return audioEnabled ? new AudioSource(content) : null;
    case 'TEXT': return new TextSource(content, frame.w, frame.h);
    case 'LYRICS': return new LyricSource(content, frame.w, frame.h);
    case 'TELA_TEMPLATE': return createTelaTemplateSource(content, frame.w, frame.h, audioEnabled);
    case 'SCRIPTURE': return new ScriptureSource(content, frame.w, frame.h);
    case 'IMAGE': return new ImageSource(content.src);
    case 'VIDEO': return new VideoSource(content, audioEnabled);
    case 'LIVE': return new LiveSource(content);
    case 'LOTTIE': return new LottieSource(content, frame.w, frame.h);
    case 'GENERATOR': return new GeneratorSource(content, Math.min(frame.w, 1280), Math.min(frame.h, 720));
    case 'SHADER': return new ShaderSource(content, Math.min(frame.w, 1280), Math.min(frame.h, 720));
    case 'CLOCK': return new ClockSource(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    case 'TIMER': return new ClockSource(() => {
      const s = Math.max(0, Math.floor(timers?.[content.timerId] ?? 0));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    });
    default: return null;   // AUDIO has no picture; WEB handled by host
  }
}

/** True when a content change can be pushed into an existing source rather than
 *  rebuilding it — the difference between a lyric change and a video restart. */
export function canUpdateInPlace(a: LayerContent, b: LayerContent): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'TEXT' || a.kind === 'SCRIPTURE') return true;
  // A re-anchored clock, a new style or the next song: repaint, never rebuild.
  if (a.kind === 'LYRICS') return true;
  if (a.kind === 'TELA_TEMPLATE') return true; // field edits repaint
  if (a.kind === 'IMAGE' && b.kind === 'IMAGE') return a.src === b.src;
  if (a.kind === 'VIDEO' && b.kind === 'VIDEO') return a.src === b.src;
  if (a.kind === 'LIVE' && b.kind === 'LIVE') return a.inputId === b.inputId;
  if (a.kind === 'GENERATOR' && b.kind === 'GENERATOR') return a.mode === b.mode;
  if (a.kind === 'SHADER' && b.kind === 'SHADER') return a.src === b.src;
  if (a.kind === 'LOTTIE' && b.kind === 'LOTTIE') return a.src === b.src;
  // Same track = a volume/loop change, not a restart from the top.
  if (a.kind === 'AUDIO' && b.kind === 'AUDIO') return a.src === b.src;
  return a.kind === 'CLOCK' || a.kind === 'TIMER';
}

// ── Lyrics ───────────────────────────────────────────────────────────────────
// Chora lyric sync, drawn by one of the council-credited looks in
// lyricStyles.ts. The song position comes from the content's clock anchor, so
// every output window animates the type itself in step with the music.

export class LyricSource implements LayerSource {
  readonly kind = 'LYRICS';
  private canvas: HTMLCanvasElement;
  private lines: Array<{ time: number; text: string }>;

  constructor(private content: Extract<LayerContent, { kind: 'LYRICS' }>, private w: number, private h: number) {
    this.canvas = off(w, h);
    this.lines = [...(content.lines || [])].sort((a, b) => a.time - b.time);
  }

  update(content: Extract<LayerContent, { kind: 'LYRICS' }>) {
    if (content.lines !== this.content.lines) this.lines = [...(content.lines || [])].sort((a, b) => a.time - b.time);
    this.content = content;
  }

  frame() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return null;
    const c = this.content;
    renderLyricFrame(ctx, lyricStyleById(c.styleId), this.lines, lyricClockPos(c.clock), this.w, this.h,
      { title: c.title, artist: c.artist, bpm: c.bpm, firstBeat: c.firstBeat });
    return this.canvas;
  }
  size() { return { w: this.w, h: this.h }; }
  ready() { return true; }
  dispose() { /* canvas is GC'd */ }
}
