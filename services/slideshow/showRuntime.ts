// Themed Shows — runtime. Owns the WebGL canvas, picks the theme renderer, runs live
// mode (pointer / touch / keys + music), and exposes deterministic frames for the video
// render and for Fabula's scene clips.

import * as THREE from 'three';
import type { ShowPlan, ShowSpec } from './types';
import { buildPlan, musicCues } from './planner';
import type { ShowRenderer } from './renderers/base';
import { LanternRenderer } from './renderers/lantern';
import { ClassicRenderer } from './renderers/classic';
import { BackyardRenderer } from './renderers/backyard';

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
      : spec.theme === 'backyard'
        ? new BackyardRenderer(spec, this.plan, this.renderer)
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

  // --- planned-show playback (the transport) ----------------------------------------
  //
  // Plays the deterministic plan in real time from any point, with the music bed following
  // the same cues the render uses. Seek while playing; pause keeps the frame.

  private planT = 0;
  private planRaf = 0;
  private planMusic: PlanMusic | null = null;
  onPlanTime?: (t: number, playing: boolean) => void;

  get planPlaying() { return this.planRaf !== 0; }
  get planTime() { return this.planT; }

  playPlan(from = this.planT, withMusic = true) {
    this.stopLive();
    this.pausePlan(false);
    this.planT = Math.max(0, Math.min(this.duration - 0.01, from));
    if (this.planT >= this.duration - 0.05) this.planT = 0;
    if (withMusic && this.spec.music.mode !== 'none' && this.spec.music.tracks.length) {
      this.planMusic = new PlanMusic(this.spec, this.duration);
      this.planMusic.sync(this.planT, true);
    }
    let last = performance.now();
    let told = 0;
    const loop = (ts: number) => {
      this.planRaf = requestAnimationFrame(loop);
      this.planT += Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (this.planT >= this.duration) { this.planT = this.duration; this.frameNow(this.planT - 0.001); this.pausePlan(); return; }
      this.frameNow(this.planT);
      this.planMusic?.sync(this.planT, false);
      if (ts - told > 100) { told = ts; this.onPlanTime?.(this.planT, true); }
    };
    this.planRaf = requestAnimationFrame(loop);
    this.onPlanTime?.(this.planT, true);
  }

  pausePlan(notify = true) {
    if (this.planRaf) cancelAnimationFrame(this.planRaf);
    this.planRaf = 0;
    this.planMusic?.stop();
    this.planMusic = null;
    if (notify) this.onPlanTime?.(this.planT, false);
  }

  /** Jump the playhead (keeps playing if it was). Draws the exact frame when paused. */
  async seekPlan(t: number) {
    this.planT = Math.max(0, Math.min(this.duration, t));
    if (this.planRaf) { this.planMusic?.sync(this.planT, true); this.onPlanTime?.(this.planT, true); return; }
    await this.frame(Math.min(this.planT, this.duration - 0.001));
    this.onPlanTime?.(this.planT, false);
  }

  /** Previous / next shot boundary (segment start). */
  stepPlan(dir: 1 | -1) {
    const segs = this.plan.segments;
    const t = this.planT;
    let target = dir > 0 ? segs.find((s) => s.start > t + 0.05)?.start : [...segs].reverse().find((s) => s.start < t - 0.6)?.start;
    if (target == null) target = dir > 0 ? this.duration - 0.01 : 0;
    void this.seekPlan(target + 0.001);
  }

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
    if (this.planRaf) this.pausePlan(false);
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

/** Planned-show music: follows musicCues exactly like the render, re-syncing on seek/drift. */
class PlanMusic {
  private el = new Audio();
  private cue = -1;
  private stopped = false;
  private cues: ReturnType<typeof musicCues>;
  constructor(private spec: ShowSpec, private total: number) {
    this.el.crossOrigin = 'anonymous';
    this.cues = musicCues(spec, total);
  }
  sync(t: number, hard: boolean) {
    if (this.stopped) return;
    const k = this.cues.findIndex((c) => t >= c.at && t < c.at + c.length);
    const vol = (this.spec.music.volume ?? 0.8) * Math.min(1, t / 3, Math.max(0, (this.total - t) / 5));
    this.el.volume = Math.max(0, Math.min(1, vol));
    if (k < 0) { if (!this.el.paused) this.el.pause(); this.cue = -1; return; }
    const c = this.cues[k];
    const want = c.offset + (t - c.at);
    if (k !== this.cue) {
      this.cue = k;
      this.el.src = this.spec.music.tracks[c.trackIndex].src;
      this.el.currentTime = want;
      void this.el.play().catch(() => {});
      return;
    }
    if (hard || Math.abs(this.el.currentTime - want) > 0.35) this.el.currentTime = want;
    if (this.el.paused) void this.el.play().catch(() => {});
  }
  stop() { this.stopped = true; this.el.pause(); this.el.src = ''; }
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
