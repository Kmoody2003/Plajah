// ─────────────────────────────────────────────────────────────────────────────
// instrumentAudio.ts — the single entry point for "Hear it" in the instrument
// primers.
//
// Order of preference:
//   1. A REAL recording from data/instrumentSamples.ts, if we have one for this
//      instrument AND the browser admits it can decode the format.
//   2. The family synthesiser in services/instrumentSynth.ts.
//
// Step 2 is not a formality. Most Wikimedia Commons audio is Ogg Vorbis, which
// Safari and iOS WebViews cannot play — and this app ships inside a Capacitor
// WebView. So the format check is a real branch that fires on real devices, and
// `play()` can still reject afterwards (autoplay policy, decode failure, network),
// which is also caught and routed to the synth.
//
// Only one demo is audible at a time, across BOTH paths: starting a sample stops a
// running synth phrase and vice versa.
// ─────────────────────────────────────────────────────────────────────────────

import type { Instrument } from '../data/instrumentPrimers';
import { getInstrumentSamples, type InstrumentSample } from '../data/instrumentSamples';
import { playInstrumentDemo as playSynthDemo, stopInstrumentDemo as stopSynthDemo } from './instrumentSynth';

/** Which engine ended up making the sound. */
export type DemoSource = 'sample' | 'synth';

export interface InstrumentDemo {
  source: DemoSource;
  /** Present only when `source === 'sample'` — the UI must render its attribution. */
  sample?: InstrumentSample;
  /** For the synth path only: how long the phrase lasts. Samples report via onEnded. */
  durationMs?: number;
  stop: () => void;
}

export interface PlayOptions {
  /** Fires when playback finishes on its own (not when stopped). */
  onEnded?: () => void;
  /** Fires once a sample has buffered enough to start — use it to clear a spinner. */
  onPlaying?: () => void;
  /** Fires if we fall back to the synth after trying a sample, so the UI can re-render. */
  onFallback?: (reason: string) => void;
}

// ── One-at-a-time playback ────────────────────────────────────────────────────
let activeAudio: HTMLAudioElement | null = null;
let activeStop: (() => void) | null = null;

/** Tear down whatever is currently making noise, from either engine. */
export function stopInstrumentDemo(): void {
  const stop = activeStop;
  activeStop = null;
  stop?.();
  stopSynthDemo();
}

// ── Format support ────────────────────────────────────────────────────────────
/**
 * canPlayType returns '', 'maybe' or 'probably'. Empty means a definite no, which
 * is exactly the Ogg-on-Safari case we care about; 'maybe' is optimistic but the
 * play() rejection below is the real safety net.
 *
 * Commons reports Ogg audio as `application/ogg`, which browsers are vaguer about
 * than `audio/ogg`, so we ask about both spellings before giving up on a file.
 */
function canPlay(mime: string): boolean {
  if (typeof document === 'undefined') return false;
  let probe: HTMLAudioElement;
  try { probe = document.createElement('audio'); } catch { return false; }
  if (typeof probe.canPlayType !== 'function') return false;

  const candidates = [mime];
  if (mime === 'application/ogg') candidates.push('audio/ogg; codecs="vorbis"', 'audio/ogg');
  if (mime === 'audio/wav') candidates.push('audio/wave', 'audio/x-wav');
  if (mime === 'audio/mpeg') candidates.push('audio/mp3');

  return candidates.some(c => probe.canPlayType(c) !== '');
}

/** The first recording this browser claims it can decode, or null. */
export function pickPlayableSample(instrumentId: string): InstrumentSample | null {
  return getInstrumentSamples(instrumentId).find(s => canPlay(s.mime)) ?? null;
}

/** True when this instrument has a real recording AND this browser can play one. */
export const hasPlayableSample = (instrumentId: string): boolean =>
  pickPlayableSample(instrumentId) !== null;

// ── Synth path ────────────────────────────────────────────────────────────────
function playSynth(
  instrument: Pick<Instrument, 'family' | 'range' | 'name'>,
  opts: PlayOptions,
): InstrumentDemo | null {
  const handle = playSynthDemo(instrument);
  if (!handle) return null;

  let done = false;
  const timer = setTimeout(() => { done = true; activeStop = null; opts.onEnded?.(); }, handle.durationMs);
  const stop = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    handle.stop();
  };

  activeStop = stop;
  opts.onPlaying?.();
  return { source: 'synth', durationMs: handle.durationMs, stop };
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Play a demonstration of this instrument. Call it from a click handler — the
 * synth fallback needs a user gesture to unlock its AudioContext, and so does
 * <audio> playback under mobile autoplay policy.
 */
export function playInstrumentDemo(
  instrument: Pick<Instrument, 'id' | 'family' | 'range' | 'name'>,
  opts: PlayOptions = {},
): InstrumentDemo | null {
  stopInstrumentDemo();

  const sample = pickPlayableSample(instrument.id);
  if (!sample) return playSynth(instrument, opts);

  let audio: HTMLAudioElement;
  try {
    audio = new Audio();
  } catch {
    return playSynth(instrument, opts);
  }

  let settled = false;   // true once playback started or we handed off to the synth
  let stopped = false;
  // If the sample dies mid-flight we start the synth instead. The handle we already
  // returned to the caller must be able to stop THAT too, so we keep a reference.
  let synthDemo: InstrumentDemo | null = null;

  const teardown = () => {
    audio.onplaying = null;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); } catch { /* already gone */ }
    // Detach the source so the browser abandons any in-flight download.
    try { audio.removeAttribute('src'); audio.load(); } catch { /* non-fatal */ }
    if (activeAudio === audio) activeAudio = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    teardown();
    synthDemo?.stop();          // covers the case where we already fell back
    synthDemo = null;
    if (activeStop === stop) activeStop = null;
  };

  /** The sample failed after we committed to it — hand the gesture to the synth. */
  const fallback = (reason: string): void => {
    if (settled || stopped) return;
    settled = true;
    teardown();
    opts.onFallback?.(reason);
    // playSynth reassigns activeStop to its own stop; our handle's stop() reaches
    // the synth through `synthDemo`, so both routes still cancel cleanly.
    synthDemo = playSynth(instrument, opts);
    if (!synthDemo) opts.onEnded?.();   // nothing could play at all — release the UI
  };

  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';   // Commons and archive.org both send permissive CORS
  audio.src = sample.url;

  audio.onplaying = () => { settled = true; opts.onPlaying?.(); };
  audio.onended = () => {
    if (stopped) return;
    stopped = true;
    teardown();
    if (activeStop === stop) activeStop = null;
    opts.onEnded?.();
  };
  audio.onerror = () => fallback('The recording could not be loaded.');

  activeAudio = audio;
  activeStop = stop;

  // play() rejects on autoplay refusal and on decode failures that canPlayType
  // was too optimistic about ('maybe' is not a promise).
  void audio.play().catch(() => fallback('This browser refused to play the recording.'));

  return { source: 'sample', sample, stop };
}

export { getInstrumentSamples, type InstrumentSample } from '../data/instrumentSamples';
export { hasInstrumentSample, attributionRequired } from '../data/instrumentSamples';
