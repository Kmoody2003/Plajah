/**
 * levelMeter.ts — live input level metering (peak + RMS + clip) for Go Live, Live Talk and the
 * broadcast panels.
 *
 * One shared AudioContext and ONE requestAnimationFrame loop serve every meter on the page. A meter
 * taps either a MediaStreamTrack (the exact track being published, so the meter shows what viewers
 * get) or an AnalyserNode someone already owns (the live mixer's per-source taps). The loop stops
 * when nothing is subscribed and while the tab is hidden.
 *
 * Readings are dBFS from the time-domain samples (getFloatTimeDomainData), not frequency bins:
 *   peak = max |x| over the analyser window, RMS = sqrt(mean x²), clip = any |x| ≥ CLIP_LEVEL.
 * The displayed peak falls back at PEAK_FALL_DB_S with a PEAK_HOLD_MS hold; clip latches CLIP_HOLD_MS.
 */

export const METER_FLOOR_DB = -60;
const CLIP_LEVEL = 0.989;         // ≈ -0.1 dBFS; float paths can exceed 1, mic paths pin at 1
const PEAK_HOLD_MS = 1200;
const PEAK_FALL_DB_S = 24;
const CLIP_HOLD_MS = 2500;

export interface LevelReading {
  /** Instant peak, dBFS (floored at METER_FLOOR_DB). */
  peakDb: number;
  /** Instant RMS, dBFS. */
  rmsDb: number;
  /** Peak-hold marker, dBFS — holds, then falls. */
  holdDb: number;
  /** True while a recent sample hit full scale. */
  clip: boolean;
  /** performance.now() of the last full-scale sample (0 = never). */
  clipAt: number;
}

type Listener = (r: LevelReading) => void;

interface Tap {
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  listener: Listener;
  holdDb: number;
  holdUntil: number;
  clipUntil: number;
  clipAt: number;
  release?: () => void;
}

const toDb = (v: number) => (v > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(v)) : METER_FLOOR_DB);

let ctx: AudioContext | null = null;
const taps = new Set<Tap>();
let raf = 0;
let lastT = 0;
let visHooked = false;

function sharedContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function frame(t: number) {
  raf = 0;
  const dt = lastT ? Math.min(0.25, (t - lastT) / 1000) : 0;
  lastT = t;
  const now = performance.now();
  for (const tap of taps) {
    tap.analyser.getFloatTimeDomainData(tap.buf);
    let peak = 0, sum = 0;
    const b = tap.buf;
    for (let i = 0; i < b.length; i++) {
      const x = b[i];
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      sum += x * x;
    }
    const peakDb = toDb(peak);
    const rmsDb = toDb(Math.sqrt(sum / b.length));
    if (peakDb >= tap.holdDb) { tap.holdDb = peakDb; tap.holdUntil = now + PEAK_HOLD_MS; }
    else if (now > tap.holdUntil) tap.holdDb = Math.max(peakDb, tap.holdDb - PEAK_FALL_DB_S * dt);
    if (peak >= CLIP_LEVEL) { tap.clipUntil = now + CLIP_HOLD_MS; tap.clipAt = now; }
    tap.listener({ peakDb, rmsDb, holdDb: tap.holdDb, clip: now < tap.clipUntil, clipAt: tap.clipAt });
  }
  schedule();
}

function schedule() {
  if (raf || !taps.size || document.hidden) return;
  raf = requestAnimationFrame(frame);
}

function hookVisibility() {
  if (visHooked) return;
  visHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastT = 0; }
    else schedule();
  });
}

function addTap(analyser: AnalyserNode, listener: Listener, release?: () => void): () => void {
  hookVisibility();
  const tap: Tap = {
    analyser, listener, release,
    buf: new Float32Array(analyser.fftSize),
    holdDb: METER_FLOOR_DB, holdUntil: 0, clipUntil: 0, clipAt: 0,
  };
  taps.add(tap);
  schedule();
  return () => {
    if (!taps.delete(tap)) return;
    tap.release?.();
    if (!taps.size && raf) { cancelAnimationFrame(raf); raf = 0; lastT = 0; }
  };
}

/** Meter a live track. Returns an unsubscribe that disconnects the tap. */
export function meterTrack(track: MediaStreamTrack, listener: Listener): () => void {
  const c = sharedContext();
  const src = c.createMediaStreamSource(new MediaStream([track]));
  const an = c.createAnalyser();
  an.fftSize = 1024;           // ~21 ms at 48 kHz — enough to catch a transient between frames
  an.smoothingTimeConstant = 0;
  src.connect(an);             // analysers process without reaching the destination
  return addTap(an, listener, () => { try { src.disconnect(); } catch { /* */ } });
}

/** Meter an analyser that already sits in someone else's graph (e.g. a mixer channel). */
export function meterAnalyser(analyser: AnalyserNode, listener: Listener): () => void {
  return addTap(analyser, listener);
}

/** Resume the shared context from a user gesture (Safari/iOS start it suspended). */
export function resumeMeters() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

/** 0..1 position on the meter scale for a dBFS value. */
export function dbToFraction(db: number): number {
  return Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}
