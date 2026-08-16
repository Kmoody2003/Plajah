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

import type { LayerContent } from './showModel';
import { drawScriptureGraphic } from '../scriptureGraphic';

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

const off = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
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
    const align = s.align ?? 'center';
    const valign = s.valign ?? 'middle';
    const safe = 0.05;
    const boxW = this.w * (1 - safe * 2);
    const maxLines = s.maxLines ?? 8;

    let size = s.size ?? Math.round(this.h * 0.09);
    const minSize = Math.round(this.h * 0.028);
    const text = this.content.blocks.map(b => b.text).join('\n');

    // Auto-fit: shrink until it fits the safe box, rather than overflow.
    let lines: string[] = [];
    for (;;) {
      ctx.font = `${size}px ${family}`;
      lines = text.split('\n').flatMap(p => wrapToWidth(ctx, p, boxW));
      const fits = lines.length <= maxLines && lines.length * size * (s.lineHeight ?? 1.32) <= this.h * (1 - safe * 2);
      if (fits || size <= minSize || s.autoFit === false) break;
      size -= 2;
    }

    const lineH = size * (s.lineHeight ?? 1.32);
    const blockH = lines.length * lineH;
    const y0 = valign === 'top' ? this.h * safe
      : valign === 'bottom' ? this.h * (1 - safe) - blockH
      : (this.h - blockH) / 2;
    const x = align === 'left' ? this.w * safe
      : align === 'right' ? this.w * (1 - safe)
      : this.w / 2;

    ctx.textAlign = align as CanvasTextAlign;
    ctx.textBaseline = 'top';

    lines.forEach((ln, i) => {
      const y = y0 + i * lineH;
      if (s.shadow !== false) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = size * 0.16;
        ctx.shadowOffsetY = size * 0.045;
      }
      if (s.outline) {
        ctx.lineWidth = s.outline;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(ln, x, y);
      }
      ctx.fillStyle = s.color ?? '#ffffff';
      ctx.fillText(ln, x, y);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
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
  private dirty = true;

  constructor(private content: Extract<LayerContent, { kind: 'SCRIPTURE' }>, private w = 1920, private h = 1080) {
    this.canvas = off(w, h);
  }

  update(content: Extract<LayerContent, { kind: 'SCRIPTURE' }>) {
    this.content = content;
    this.dirty = true;
  }

  private render() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    drawScriptureGraphic(ctx, {
      lines: this.content.lines ?? [],
      reference: this.content.reference ?? '',
      variant: 'FULLSCREEN',
      width: this.w,
      height: this.h,
    });
    this.dirty = false;
  }

  frame() { if (this.dirty) this.render(); return this.canvas; }
  size() { return { w: this.w, h: this.h }; }
  ready() { return !!(this.content.lines?.length); }
  dispose() { /* */ }
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

  constructor(content: Extract<LayerContent, { kind: 'VIDEO' }>) {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.playsInline = true;
    v.loop = content.loop ?? true;
    // Backgrounds are silent unless the operator asks otherwise — a loop that
    // unmutes itself mid-service is the classic presentation embarrassment.
    v.muted = content.muted ?? true;
    v.volume = content.volume ?? 0;
    v.src = content.src;
    if (content.inSec) v.currentTime = content.inSec;
    void v.play().catch(() => { /* autoplay blocked until a gesture */ });
    this.el = v;
  }

  frame() { return this.el.readyState >= 2 ? this.el : null; }
  size() { return this.el.videoWidth ? { w: this.el.videoWidth, h: this.el.videoHeight } : null; }
  ready() { return this.el.readyState >= 2; }
  dispose() { try { this.el.pause(); this.el.src = ''; this.el.load(); } catch { /* */ } }
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

const PRESENT_VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

const PRESENT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes;
out vec4 o; void main(){ o = texture(uTex, gl_FragCoord.xy/uRes); }`;

export class GeneratorSource implements LayerSource {
  readonly kind = 'GENERATOR';
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private renderer: any = null;
  private audio: any = null;
  private prog: WebGLProgram | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;
  private vao: any = null;
  private ok = false;

  constructor(private content: Extract<LayerContent, { kind: 'GENERATOR' }>, private w = 1280, private h = 720) {
    this.canvas = off(w, h);
    void this.init();
  }

  private async init() {
    try {
      const [{ createGL, createProgram, createFullscreenQuad }, { GeneratorRenderer, hasGenerator, hexToRgb }, { AudioTexture }] =
        await Promise.all([
          import('../../components/plajahPixels/engine/core/glUtil'),
          import('../../components/plajahPixels/engine/core/generators'),
          import('../../components/plajahPixels/engine/core/audioTexture'),
        ]);
      if (!hasGenerator(this.content.mode)) return;

      const gl = createGL(this.canvas);
      if (!gl) return;
      this.gl = gl;
      this.renderer = new GeneratorRenderer(gl);
      this.audio = new AudioTexture(gl);
      this.prog = createProgram(gl, PRESENT_VS, PRESENT_FS);
      this.uTex = gl.getUniformLocation(this.prog, 'uTex');
      this.uRes = gl.getUniformLocation(this.prog, 'uRes');
      this.vao = createFullscreenQuad(gl);
      void hexToRgb;
      this.ok = true;
    } catch { this.ok = false; }
  }

  frame(timeSec: number) {
    if (!this.ok || !this.gl || !this.renderer) return null;
    const gl = this.gl;
    const p = this.content.params ?? {};
    const num = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);

    const tex = this.renderer.render('bg', this.content.mode, this.w, this.h, {
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

  size() { return { w: this.w, h: this.h }; }
  ready() { return this.ok; }
  dispose() { try { this.renderer?.dispose?.(); } catch { /* */ } }
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
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private gone = false;

  constructor(content: Extract<LayerContent, { kind: 'AUDIO' }>) {
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.loop = content.loop ?? false;
    a.preload = 'auto';
    a.src = content.src;
    this.target = content.volume ?? 1;

    const fadeIn = content.fadeInSec ?? 0;
    a.volume = fadeIn > 0 ? 0 : this.target;
    this.el = a;

    // Autoplay needs a prior gesture. The operator has always clicked something
    // by the time a cue fires, but if it's blocked we retry on the next one
    // rather than failing silently for the rest of the service.
    void a.play().catch(() => {
      const retry = () => { void a.play().catch(() => {}); window.removeEventListener('pointerdown', retry); };
      window.addEventListener('pointerdown', retry, { once: true });
    });

    if (fadeIn > 0) this.ramp(this.target, fadeIn);
  }

  private ramp(to: number, seconds: number, then?: () => void) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const step = 50;
    const steps = Math.max(1, Math.round((seconds * 1000) / step));
    const from = this.el.volume;
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      const v = from + (to - from) * (i / steps);
      try { this.el.volume = Math.min(1, Math.max(0, v)); } catch { /* */ }
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
    if (!this.fadeTimer) { try { this.el.volume = this.target; } catch { /* */ } }
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
    case 'SCRIPTURE': return new ScriptureSource(content, frame.w, frame.h);
    case 'IMAGE': return new ImageSource(content.src);
    case 'VIDEO': return new VideoSource(content);
    case 'LOTTIE': return new LottieSource(content, frame.w, frame.h);
    case 'GENERATOR': return new GeneratorSource(content, Math.min(frame.w, 1280), Math.min(frame.h, 720));
    case 'CLOCK': return new ClockSource(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    case 'TIMER': return new ClockSource(() => {
      const s = Math.max(0, Math.floor(timers?.[content.timerId] ?? 0));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    });
    default: return null;   // AUDIO has no picture; LIVE/WEB handled by the host
  }
}

/** True when a content change can be pushed into an existing source rather than
 *  rebuilding it — the difference between a lyric change and a video restart. */
export function canUpdateInPlace(a: LayerContent, b: LayerContent): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'TEXT' || a.kind === 'SCRIPTURE') return true;
  if (a.kind === 'IMAGE' && b.kind === 'IMAGE') return a.src === b.src;
  if (a.kind === 'VIDEO' && b.kind === 'VIDEO') return a.src === b.src;
  if (a.kind === 'GENERATOR' && b.kind === 'GENERATOR') return a.mode === b.mode;
  if (a.kind === 'LOTTIE' && b.kind === 'LOTTIE') return a.src === b.src;
  // Same track = a volume/loop change, not a restart from the top.
  if (a.kind === 'AUDIO' && b.kind === 'AUDIO') return a.src === b.src;
  return a.kind === 'CLOCK' || a.kind === 'TIMER';
}
