// Themed Shows — runtime. Owns the WebGL canvas, picks the theme renderer, runs live
// mode (pointer / touch / keys + music), and exposes deterministic frames for the video
// render and for Fabula's scene clips.

import * as THREE from 'three';
import type { ShowPlan, ShowSpec } from './types';
import { buildPlan, musicCues } from './planner';
import type { ShowRenderer } from './renderers/base';
import { LanternRenderer } from './renderers/lantern';
import { ClassicRenderer } from './renderers/classic';

export interface RuntimeOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  /** Keep the drawing buffer (needed when another canvas copies from this one). */
  preserve?: boolean;
}

export class ShowRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly plan: ShowPlan;
  private impl: ShowRenderer;
  private raf = 0;
  private lastTs = 0;
  private music: LiveMusic | null = null;
  private listeners: (() => void)[] = [];
  onStatus?: (s: ReturnType<ShowRenderer['liveStatus']> & { clock: number }) => void;

  constructor(readonly canvas: HTMLCanvasElement, readonly spec: ShowSpec, opts: RuntimeOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1));
    this.plan = buildPlan(spec);
    this.impl = spec.theme === 'classic'
      ? new ClassicRenderer(spec, this.plan, this.renderer)
      : new LanternRenderer(spec, this.plan, this.renderer);
    this.resize(opts.width, opts.height);
  }

  get duration() { return this.plan.duration; }

  load(onProgress?: (k: number, label: string) => void) { return this.impl.load(onProgress); }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.impl.resize(w, h);
  }

  /** Deterministic frame (awaits textures). Use for render + Fabula. */
  async frame(t: number) {
    await this.impl.ensure(t);
    this.impl.draw(t);
  }

  /** Synchronous frame with whatever is resident (scrubbing previews). */
  frameNow(t: number) { this.impl.draw(t); void this.impl.ensure(t); }

  // --- live ---------------------------------------------------------------------------

  startLive(withMusic = true) {
    this.stopLive();
    this.impl.liveStart();
    if (withMusic && this.spec.music.mode !== 'none' && this.spec.music.tracks.length) {
      this.music = new LiveMusic(this.spec);
      this.music.play();
    }
    const c = this.canvas;
    const ndc = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    };
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const swipe = Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5;
      down = null;
      if (swipe) { this.impl.liveKey(dx < 0 ? 'next' : 'prev'); return; }
      const p = ndc(e);
      this.impl.liveTap(p.x, p.y);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const p = ndc(e);
      c.style.cursor = this.impl.liveHover(p.x, p.y) ? 'pointer' : 'default';
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') this.impl.liveKey('next');
      else if (e.key === 'ArrowLeft') this.impl.liveKey('prev');
      else if (e.key === 'Escape' || e.key === 'Backspace') this.impl.liveKey('back');
      else if (e.key === ' ') { e.preventDefault(); this.impl.liveKey('pause'); this.music?.toggle(); }
      else return;
    };
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    this.listeners.push(() => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    });
    this.lastTs = performance.now();
    let statusAt = 0;
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.impl.liveTick(dt);
      this.impl.liveDraw();
      if (this.onStatus && ts - statusAt > 250) {
        statusAt = ts;
        this.onStatus({ ...this.impl.liveStatus(), clock: this.impl.liveClock() });
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  liveKey(k: 'next' | 'prev' | 'back' | 'pause') {
    this.impl.liveKey(k);
    if (k === 'pause') this.music?.toggle();
  }

  stopLive() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const off of this.listeners) off();
    this.listeners = [];
    this.music?.stop();
    this.music = null;
  }

  dispose() {
    this.stopLive();
    this.impl.dispose();
    this.renderer.dispose();
  }
}

/** Live-mode music: playlist in order (then again), or one track looping. Soft fades. */
class LiveMusic {
  private el = new Audio();
  private k = 0;
  private stopped = false;
  constructor(private spec: ShowSpec) {
    this.el.crossOrigin = 'anonymous';
    this.el.volume = 0;
    this.el.addEventListener('ended', () => this.next());
  }
  private src(k: number) {
    const tr = this.spec.music.tracks;
    return this.spec.music.mode === 'loop' ? tr[0] : tr[k % tr.length];
  }
  play() {
    const t = this.src(this.k);
    if (!t) return;
    this.el.src = t.src;
    this.el.loop = this.spec.music.mode === 'loop';
    void this.el.play().catch(() => { /* autoplay blocked until a gesture; tap resumes */ });
    this.fade(this.spec.music.volume ?? 0.8, 2.5);
  }
  private next() { if (this.stopped) return; this.k++; this.play(); }
  toggle() { if (this.el.paused) void this.el.play().catch(() => {}); else this.el.pause(); }
  private fade(to: number, secs: number) {
    const from = this.el.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      this.el.volume = from + (to - from) * k;
      if (k < 1 && !this.stopped) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  stop() { this.stopped = true; this.el.pause(); this.el.src = ''; }
}

export { musicCues };
