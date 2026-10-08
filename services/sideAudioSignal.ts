/**
 * sideAudioSignal — lets the Chora kaiju nod to audio that is NOT the main player.
 *
 * Hover previews (services/hoverPreview.ts) and the ad-billboard pillar audio play from plain
 * `new Audio()` elements, which never reach an analyser. attachSideAudio(el) registers the one
 * currently-active side element, taps it through the shared AudioContext (same 'chora' bus as the
 * GlobalPlayer, so element volume / device sink / muting keep working) and publishes
 * { analyser, active, fallback }. useKaijuSignal() prefers it over the main player while it is
 * audibly playing (pickKaijuSignal).
 *
 * Safety rules baked in:
 *  - createMediaElementSource on a cross-origin element WITHOUT CORS outputs silence, so we only tap
 *    when the URL is same-origin/blob/data or the element is crossOrigin='anonymous' AND it has
 *    already started playing (a CORS-less server fails the load instead, and createSideAudio then
 *    retries without crossOrigin and without a tap).
 *  - If the analyser reads all zeros for ~0.5s while playing and has never shown signal (tainted /
 *    silent graph / suspended context), or the element could not be tapped at all, `fallback` is
 *    set and the kaiju get a steady pseudo-beat (FALLBACK_BPM) so they still visibly nod.
 */
import { platformAudio } from './mediaEngine/audioRuntime';
import type { KaijuSignal } from '../components/kaiju/kaijuSignal';

export const FALLBACK_BPM = 112;
const SILENCE_HOLD_S = 0.5;

export interface SideAudioState {
  id: number;
  analyser: AnalyserNode | null;
  /** Playing AND audible (volume > 0, not muted) — hover previews ramp up from volume 0. */
  active: boolean;
  /** No usable analyser data: drive the kaiju from a synthetic beat instead. */
  fallback: boolean;
}

// ── pure parts (unit-tested) ─────────────────────────────────────────────────────────────────────

export const isAudible = (e: { paused: boolean; ended: boolean; muted: boolean; volume: number }) =>
  !e.paused && !e.ended && !e.muted && e.volume > 0.02;

/** Tapping is only safe when the element's bytes are readable by Web Audio (else it plays silence). */
export function urlTapSafe(url: string, crossOrigin: string | null, origin: string): boolean {
  if (!url) return false;
  if (/^(blob:|data:)/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) return true; // relative = same-origin
  if (crossOrigin === 'anonymous' || crossOrigin === 'use-credentials') return true;
  try { return new URL(url, origin).origin === origin; } catch { return false; }
}

/** Flags an analyser that stays at zero while audio plays; once it has shown signal, silence is real. */
export class SilenceWatch {
  private zeroFor = 0; private seen = false; fallback = false;
  constructor(private hold = SILENCE_HOLD_S) {}
  step(peak: number, dt: number, playing: boolean): boolean {
    if (!playing) { this.zeroFor = 0; return this.fallback; }
    if (peak > 1) { this.seen = true; this.zeroFor = 0; this.fallback = false; }
    else if (!this.seen) { this.zeroFor += dt; if (this.zeroFor >= this.hold) this.fallback = true; }
    return this.fallback;
  }
}

/** Steady metronome for the fallback nod. Mutates `s`; `beat` is true on the frame the phase wraps. */
export function stepSynthBeat(s: { phase: number; count: number }, dt: number, bpm: number): { phase: number; count: number; beat: boolean } {
  s.phase += dt * bpm / 60;
  let beat = false;
  while (s.phase >= 1) { s.phase -= 1; s.count++; beat = true; }
  return { phase: s.phase, count: s.count, beat };
}
export const synthKick = (phase: number) => Math.exp(-phase * 7);

/** Side audio wins while audibly playing; otherwise the main player's signal passes through. */
export function pickKaijuSignal(main: KaijuSignal, side: SideAudioState | null): KaijuSignal {
  if (side?.active) {
    const key = `side:${side.id}`;
    return side.fallback || !side.analyser
      ? { analyser: null, isPlaying: true, fallbackBpm: FALLBACK_BPM, key }
      : { analyser: side.analyser, isPlaying: true, key };
  }
  return { ...main, key: 'main' };
}

const sameState = (a: SideAudioState | null, b: SideAudioState | null) =>
  a === b || (!!a && !!b && a.id === b.id && a.analyser === b.analyser && a.active === b.active && a.fallback === b.fallback);

// ── store ────────────────────────────────────────────────────────────────────────────────────────

let state: SideAudioState | null = null;
const listeners = new Set<() => void>();
export const getSideAudio = () => state;
export const subscribeSideAudio = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function publish(next: SideAudioState | null) {
  if (sameState(state, next)) return;
  state = next;
  listeners.forEach(l => l());
}

// ── tap + lifecycle ──────────────────────────────────────────────────────────────────────────────

const sources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>(); // createMediaElementSource only once
let nextId = 1;
let cur: { el: HTMLAudioElement; id: number; analyser: AnalyserNode | null; watch: SilenceWatch; timer: number; off: () => void } | null = null;

/** Routes the element through the shared context (el → analyser → 'chora' bus). Null if it can't be done safely. */
export function tapAudioElement(el: HTMLAudioElement): AnalyserNode | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!urlTapSafe(el.currentSrc || el.src, el.crossOrigin, window.location.origin)) return null;
    const ctx = platformAudio.getContext();
    if (ctx.state !== 'running') { ctx.resume?.().catch(() => {}); return null; } // a tap on a suspended context is silent
    if (sources.has(el)) return null; // already tapped for a previous registration; its analyser was torn down
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0.62; // same shape as the main player's, so KaijuAudio's bin math holds
    an.minDecibels = -85; an.maxDecibels = -15;
    src.connect(an); an.connect(platformAudio.output('chora'));
    sources.set(el, src);
    return an;
  } catch { return null; }
}

/**
 * `new Audio()` for the side-audio paths. crossOrigin is set BEFORE src so the tap is possible; if a
 * server rejects CORS the load errors, so we retry once without it (plays, untapped, fallback nod).
 */
export function createSideAudio(url: string): HTMLAudioElement {
  const a = new Audio();
  const cross = typeof window !== 'undefined' && !urlTapSafe(url, null, window.location.origin);
  if (cross) a.crossOrigin = 'anonymous';
  let retried = false;
  a.addEventListener('error', () => {
    if (retried || !cross || !a.getAttribute('src')) return;
    retried = true;
    a.removeAttribute('crossorigin');
    const wasLoop = a.loop, vol = a.volume;
    a.src = url; a.loop = wasLoop; a.volume = vol;
    a.play().catch(() => {});
  });
  a.src = url;
  return a;
}

export function detachSideAudio(el?: HTMLAudioElement | null) {
  const c = cur;
  if (!c || (el && c.el !== el)) return;
  cur = null;
  window.clearInterval(c.timer); c.off();
  try {
    // keep the element audible if it's ever replayed: bypass the analyser, straight to the bus
    c.analyser?.disconnect();
    const src = sources.get(c.el);
    if (src) { src.disconnect(); src.connect(platformAudio.output('chora')); }
  } catch { /* */ }
  publish(null);
}

/** Make `el` the active side audio (replacing any previous one). Call right before/after play(). */
export function attachSideAudio(el: HTMLAudioElement) {
  if (typeof window === 'undefined') return;
  if (cur?.el === el) return;
  detachSideAudio();
  const c = { el, id: nextId++, analyser: null as AnalyserNode | null, watch: new SilenceWatch(), timer: 0, off: () => {} };
  cur = c;
  let buf: Uint8Array<ArrayBuffer> | null = null;
  let last = performance.now(), tapTries = 0;
  const tick = () => {
    if (cur !== c) return;
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    const active = isAudible(el) && el.readyState >= 2;
    if (!c.analyser && active && tapTries < 25) { tapTries++; c.analyser = tapAudioElement(el); } // context may have just resumed
    let peak = 0;
    if (c.analyser && active) {
      if (!buf || buf.length !== c.analyser.frequencyBinCount) buf = new Uint8Array(new ArrayBuffer(c.analyser.frequencyBinCount));
      c.analyser.getByteFrequencyData(buf);
      for (let i = 0; i < buf.length; i++) if (buf[i] > peak) peak = buf[i];
    }
    const fallback = active && (!c.analyser || c.watch.step(peak, dt, true));
    publish({ id: c.id, analyser: c.analyser, active, fallback });
  };
  const start = () => { if (!c.timer && cur === c) { last = performance.now(); c.timer = window.setInterval(tick, 80); } };
  const stop = () => { window.clearInterval(c.timer); c.timer = 0; };
  const onPlaying = () => {
    if (!c.analyser) c.analyser = tapAudioElement(el);
    start(); tick();
  };
  const onPause = () => { stop(); tick(); };
  const onGone = () => detachSideAudio(el);
  const onEmptied = () => { if (!el.getAttribute('src')) onGone(); }; // a CORS retry re-sets src: not gone
  el.addEventListener('playing', onPlaying);
  el.addEventListener('play', start);
  el.addEventListener('pause', onPause);
  el.addEventListener('ended', onGone);
  el.addEventListener('emptied', onEmptied);
  c.off = () => {
    el.removeEventListener('playing', onPlaying); el.removeEventListener('play', start); el.removeEventListener('pause', onPause);
    el.removeEventListener('ended', onGone); el.removeEventListener('emptied', onEmptied);
  };
  if (!el.paused && el.readyState >= 2) onPlaying(); else start();
}
