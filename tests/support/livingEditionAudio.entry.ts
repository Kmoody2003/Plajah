// Browser-side half of the Below the Blue / Golden Thread offline audio check (tests/livingEditionKit.ts -> describeEditionAudio). Bundled with
// esbuild and loaded into headless Chromium: renders a book's own cues through OfflineAudioContext (the real engine code path) and MEASURES them.
// Nothing is audible. A cue can pass every number here and still sound bad: see the report.
import { analyse, hashSamples } from '../../services/living/audio/analysis';
import { renderScore } from '../../services/living/audio/render';
import type { Score } from '../../services/living/contracts';

(window as unknown as { ES: unknown }).ES = {
  async score(score: Score, o: { seconds?: number; depth?: number; tempoScale?: number } = {}) {
    const r = await renderScore(score, { seconds: o.seconds ?? 20, depth: o.depth, tempoScale: o.tempoScale });
    const st = analyse(r.samples, r.sampleRate, { floor: 0.0005 });
    let peakLR = 0, nan = false;
    for (const ch of [r.left, r.right]) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (!Number.isFinite(v)) nan = true; else if (Math.abs(v) > peakLR) peakLR = Math.abs(v); }
    let energy = 0; for (let i = 0; i < r.samples.length; i++) energy += r.samples[i] * r.samples[i];
    return { stats: { ...st, peakLR, hasNaN: st.hasNaN || nan }, hash: hashSamples(r.samples), energy, events: r.events };
  },
};
