// Rendered-hit cache for synthesized drums. Building a drum synth hit live costs a dozen-plus
// Web Audio nodes (oscillators, filters, an oversampled shaper, audio-rate FM); a busy pattern of
// those overruns the audio thread and the output drops out. A synth drum is the same sound every
// time it's hit with the same settings — so it's rendered ONCE into a buffer (per sound, pitch
// and velocity level) and played back like a sample, the way a drum machine's voice is fixed.
//
// A miss plays the live graph (identical sound) and renders in the background; the next hit is a
// buffer. Turning a knob changes the key, so the first hit after a change is live again. Noise-
// based drums keep two takes and alternate, so hats and claps don't machine-gun.

import type { SynthHit } from './synthVoices';

const cache = new Map<string, AudioBuffer | 'pending'>();
const MAX_ENTRIES = 160;   // ~160 one-shots of a second or so — a few MB at 48 kHz mono
let variantTick = 0;

/** Velocity levels the cache keeps; a hit is scaled from the nearest level at or above it. */
export function velBucket(vel: number): number {
  return Math.max(1, Math.min(4, Math.ceil(Math.max(0.05, Math.min(1, vel)) * 4))) / 4;
}

/**
 * Play one synthesized hit: from the cache when it's there, else live (and fill the cache).
 * `render` builds the hit into any context at time 0, at velocity `vb`; `lengthSec` bounds it.
 */
export function cachedHit(
  ctx: BaseAudioContext, dest: AudioNode, key: string, t: number, vel: number,
  lengthSec: number, noisy: boolean,
  render: (c: BaseAudioContext, dest: AudioNode, at: number, vb: number) => SynthHit,
): SynthHit {
  const vb = velBucket(vel);
  const variant = noisy ? (variantTick++ & 1) : 0;
  const k = `${key}|${vb}|${variant}|${ctx.sampleRate}`;
  const hit = cache.get(k);
  if (hit && hit !== 'pending') {
    // LRU: touch the entry so it survives eviction while it's being played.
    cache.delete(k); cache.set(k, hit);
    const src = ctx.createBufferSource();
    src.buffer = hit;
    const g = ctx.createGain();
    g.gain.value = Math.max(0.05, Math.min(1, vel)) / vb;
    src.connect(g).connect(dest);
    src.start(t);
    return { stopAt: t + hit.duration };
  }
  // An offline bounce can't wait for a background render, and neither can this hit.
  if (!hit && typeof OfflineAudioContext !== 'undefined' && !(ctx instanceof OfflineAudioContext)) {
    cache.set(k, 'pending');
    const len = Math.max(0.02, Math.min(8, lengthSec + 0.08));
    void (async () => {
      try {
        const off = new OfflineAudioContext(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate);
        render(off, off.destination, 0, vb);
        const buf = await off.startRendering();
        cache.set(k, buf);
        while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      } catch { cache.delete(k); }
    })();
  }
  return render(ctx, dest, t, vel);
}

/** For tests and the diagnostics panel. */
export function hitCacheStats(): { entries: number; pending: number } {
  let pending = 0;
  for (const v of cache.values()) if (v === 'pending') pending++;
  return { entries: cache.size - pending, pending };
}
