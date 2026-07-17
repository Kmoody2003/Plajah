// ─── Real audio beat / tempo detection ───────────────────────────────────────
// Replaces the synthetic, genre-table + hash "BPM" (coraAnalysisService) and the
// hardcoded tempo=120 fallback (TrackBreakdownModal) with an actual measurement
// of the waveform. This is what makes the breakdown tempo- and sample-accurate.
//
// Algorithm (the well-proven offline approach):
//   1. Decode the audio to a mono PCM buffer (OfflineAudioContext).
//   2. Low-pass filter (~150 Hz) to isolate kick/bass transients.
//   3. Adaptive peak-pick the envelope to get onset sample positions.
//   4. Histogram the inter-onset intervals across plausible BPM (60–200) and
//      pick the tempo whose grid best explains the onsets (autocorrelation).
//   5. Phase-align a beat grid to the onsets → sample-accurate downbeats.
//
// Tempo + beat grid are reliable for rhythmic music. (Polyphonic *pitch*
// transcription is a separate, much harder problem — see TrackBreakdownModal.)

export interface BeatAnalysis {
  bpm: number;
  confidence: number;        // 0–1, how cleanly the grid fits the onsets
  /** Beat timestamps in seconds, phase-aligned to the audio. */
  beats: number[];
  /** First detected onset (seconds) — the grid's phase anchor. */
  firstBeatSec: number;
  durationSec: number;
  sampleRate: number;
  /** Detected meter (beats per measure) — 4, 3, etc. Falls back to 4 when unsure. */
  beatsPerMeasure?: number;
  /** Time (seconds) of the first detected DOWNBEAT (beat 1 of a bar) — bar-line anchor. */
  downbeatSec?: number;
  /** Which beat index in `beats` is the first downbeat. */
  downbeatIndex?: number;
  /** 0–1 confidence in the meter/downbeat estimate. */
  meterConfidence?: number;
}

const MIN_BPM = 60;
const MAX_BPM = 200;

/** Fetch + decode an audio URL to a mono Float32 PCM buffer. Cross-origin URLs
 *  go through Plajah's /api/proxy so decodeAudioData isn't blocked by CORS. */
export async function decodeMono(url: string, signal?: AbortSignal): Promise<{ data: Float32Array; sampleRate: number; duration: number }> {
  const sameOrigin = url.startsWith('/') || url.startsWith(location.origin);
  // Audius stream URLs (and other CORS-open audio) must be fetched DIRECTLY: the
  // /api/proxy chokes on Audius's 302→streaming redirect (500), while a direct fetch
  // decodes fine (Audius sends CORS). Proxy stays the default for CORS-restricted sources.
  const corsOpen = /\/v1\/tracks\/[^/]+\/stream/i.test(url) || /(^|[./])audius\b/i.test(url);
  const proxied = !sameOrigin && /^https?:\/\//i.test(url) && !corsOpen;
  let res = await fetch(proxied ? `/api/proxy?url=${encodeURIComponent(url)}` : url, { signal }).catch(() => null as Response | null);
  // If the proxy failed, the source may actually be CORS-open — try it directly.
  if ((!res || !res.ok) && proxied) res = await fetch(url, { signal }).catch(() => res);
  if (!res || !res.ok) throw new Error(`audio fetch ${res?.status ?? 'failed'}`);
  const arrayBuf = await res.arrayBuffer();
  const Ctx: typeof OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  // Temp context just to decode (length/rate are placeholders).
  const tmp = new Ctx(1, 1, 44100);
  const audioBuf = await tmp.decodeAudioData(arrayBuf.slice(0));
  // Downmix to mono.
  const ch = audioBuf.numberOfChannels;
  const len = audioBuf.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = audioBuf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }
  return { data: mono, sampleRate: audioBuf.sampleRate, duration: audioBuf.duration };
}

/** Single-pole low-pass to isolate low-frequency transients (kick/bass). */
function lowPass(data: Float32Array, sampleRate: number, cutoffHz = 150): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const out = new Float32Array(data.length);
  let prev = 0;
  for (let i = 0; i < data.length; i++) { prev = prev + alpha * (data[i] - prev); out[i] = prev; }
  return out;
}

/** Adaptive peak-pick of the rectified envelope → onset sample indices. */
function pickOnsets(env: Float32Array, sampleRate: number): number[] {
  // Envelope = |signal| smoothed; pick local maxima above a moving threshold.
  const win = Math.floor(sampleRate * 0.02);           // 20 ms smoothing
  const smooth = new Float32Array(env.length);
  let acc = 0;
  for (let i = 0; i < env.length; i++) {
    acc += Math.abs(env[i]) - (i >= win ? Math.abs(env[i - win]) : 0);
    smooth[i] = acc / win;
  }
  const onsets: number[] = [];
  const refractory = Math.floor(sampleRate * 0.12);     // ≥120 ms apart (≤500 BPM ceiling)
  const threshWin = Math.floor(sampleRate * 0.4);
  let last = -refractory;
  for (let i = 1; i < smooth.length - 1; i++) {
    if (i - last < refractory) continue;
    // local threshold = 1.4× the recent average
    let avg = 0; const a = Math.max(0, i - threshWin);
    for (let j = a; j < i; j += 64) avg += smooth[j];
    avg /= Math.max(1, (i - a) / 64);
    if (smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1] && smooth[i] > avg * 1.4 && smooth[i] > 1e-4) {
      onsets.push(i); last = i;
    }
  }
  return onsets;
}

/** Score how well a given BPM's grid explains the onset times (autocorrelation). */
function scoreBpm(onsetSec: number[], bpm: number): number {
  const period = 60 / bpm;
  let score = 0;
  for (const t of onsetSec) {
    const phase = (t % period) / period;            // 0..1 distance into the beat
    const d = Math.min(phase, 1 - phase);            // closeness to a beat line
    score += 1 - d * 2;                              // 1 on-beat, 0 off-beat
  }
  return score / Math.max(1, onsetSec.length);
}

/**
 * Estimate meter (beats/measure) + the downbeat phase from the low-frequency (kick) energy
 * at each beat. Downbeats carry more kick/energy, so we find the (period, phase) whose
 * "beat-1" positions stand out most from the rest. Handles 4/4 and 3/4 (the common cases).
 */
function detectMeter(filtered: Float32Array, sampleRate: number, beats: number[]): {
  beatsPerMeasure: number; downbeatIndex: number; downbeatSec: number; meterConfidence: number;
} {
  const fallback = { beatsPerMeasure: 4, downbeatIndex: 0, downbeatSec: beats[0] ?? 0, meterConfidence: 0 };
  if (beats.length < 8) return fallback;

  // Kick energy in the first part of each beat (where the downbeat hit lands).
  const beatPeriod = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  const win = Math.max(1, Math.floor(sampleRate * Math.min(0.12, beatPeriod * 0.5)));
  const energy = beats.map(t => {
    const start = Math.floor(t * sampleRate);
    let e = 0;
    for (let j = start; j < Math.min(start + win, filtered.length); j++) e += Math.abs(filtered[j]);
    return e / win;
  });

  let best = { M: 4, p: 0, score: -Infinity };
  for (const M of [4, 3]) {                 // common meters; 4/4 first
    for (let p = 0; p < M; p++) {
      let dSum = 0, dN = 0, oSum = 0, oN = 0;
      for (let i = 0; i < energy.length; i++) {
        if ((((i - p) % M) + M) % M === 0) { dSum += energy[i]; dN++; }
        else { oSum += energy[i]; oN++; }
      }
      const dAvg = dSum / Math.max(1, dN), oAvg = oSum / Math.max(1, oN);
      const contrast = (dAvg - oAvg) / (dAvg + oAvg + 1e-9);   // -1..1: how much downbeats stand out
      const score = contrast + (M === 4 ? 0.03 : 0);           // slight prior toward 4/4
      if (score > best.score) best = { M, p, score };
    }
  }
  return {
    beatsPerMeasure: best.M,
    downbeatIndex: best.p,
    downbeatSec: beats[best.p] ?? beats[0] ?? 0,
    meterConfidence: Math.max(0, Math.min(1, best.score)),
  };
}

export async function detectBeats(url: string, signal?: AbortSignal): Promise<BeatAnalysis> {
  const { data, sampleRate, duration } = await decodeMono(url, signal);
  return detectBeatsFromBuffer(data, sampleRate, duration);
}

/** Same as detectBeats but on already-decoded PCM — lets a caller (e.g. the
 *  transcription engine) decode the audio once and share it across analyses. */
export function detectBeatsFromBuffer(data: Float32Array, sampleRate: number, duration: number): BeatAnalysis {
  const filtered = lowPass(data, sampleRate);
  const onsets = pickOnsets(filtered, sampleRate);
  const onsetSec = onsets.map(i => i / sampleRate);

  if (onsetSec.length < 4) {
    return { bpm: 120, confidence: 0, beats: [], firstBeatSec: 0, durationSec: duration, sampleRate };
  }

  // Search integer BPMs; refine around the winner. Fold octaves toward 70–140.
  let best = { bpm: 120, score: -1 };
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
    const s = scoreBpm(onsetSec, bpm);
    if (s > best.score) best = { bpm, score: s };
  }
  let bpm = best.bpm;
  // Octave correction toward the musical comfort range.
  while (bpm < 70) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  bpm = Math.round(bpm);

  // Phase-align a grid to the onsets.
  const period = 60 / bpm;
  const firstBeatSec = onsetSec[0] % period;
  const beats: number[] = [];
  for (let t = firstBeatSec; t < duration; t += period) beats.push(+t.toFixed(4));

  const meter = detectMeter(filtered, sampleRate, beats);

  return {
    bpm, confidence: Math.max(0, Math.min(1, best.score)), beats, firstBeatSec,
    durationSec: duration, sampleRate,
    beatsPerMeasure: meter.beatsPerMeasure, downbeatSec: meter.downbeatSec,
    downbeatIndex: meter.downbeatIndex, meterConfidence: meter.meterConfidence,
  };
}

/** Which beat index (and fractional phase) the audio is at right now — for
 *  sample-accurate sync of notation/lyrics to playback. */
export function beatAtTime(analysis: BeatAnalysis, currentSec: number): { index: number; phase: number } {
  if (!analysis.beats.length) {
    const period = 60 / (analysis.bpm || 120);
    const rel = Math.max(0, currentSec - analysis.firstBeatSec);
    return { index: Math.floor(rel / period), phase: (rel % period) / period };
  }
  const period = 60 / analysis.bpm;
  const rel = currentSec - analysis.firstBeatSec;
  const idx = Math.floor(rel / period);
  return { index: Math.max(0, idx), phase: ((rel % period) + period) % period / period };
}
