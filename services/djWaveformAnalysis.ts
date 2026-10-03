// djWaveformAnalysis — the data behind a Traktor/Rekordbox-style colour waveform.
//
// One pass over the track (mono, short-time FFT) produces, per ~11.6 ms frame:
//   · band energies  — low (20–150 Hz kick/bass), mid (150 Hz–2.5 kHz body,
//                      snare fundamental, voice), high (2.5–16 kHz air, hats)
//   · vocal presence — energy in the voice band (300–3400 Hz) that is TONAL
//                      (low spectral flatness) and SUSTAINED (smoothed), minus
//                      what the percussive onsets explain. Heuristic, not
//                      source separation — good enough to see where the
//                      vocal sits, which is what a DJ uses it for.
//   · onsets         — kick (low-band flux), snare (broadband 1–8 kHz flux
//                      with a noisy spectrum), hat (>8 kHz flux), peak-picked
//                      against an adaptive (local median) threshold.
//
// Everything is normalised per track to 0..255 so the renderer is cheap, and
// the pass yields to the event loop every few hundred frames so a five-minute
// track analyses in the background without freezing the UI.

export type OnsetKind = 'kick' | 'snare' | 'hat';

export interface Onset {
  time: number;
  kind: OnsetKind;
  /** 0..1 */
  strength: number;
}

export interface SpectralAnalysis {
  /** Seconds per frame. */
  hop: number;
  frames: number;
  duration: number;
  low: Uint8Array;
  mid: Uint8Array;
  high: Uint8Array;
  /** Overall level (RMS), for the outline. */
  level: Uint8Array;
  /** 0..255 vocal presence. */
  vocal: Uint8Array;
  onsets: Onset[];
}

const FFT_SIZE = 1024;

function fftInPlace(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Mono mixdown, decimated so the analysis rate is ~22 kHz (enough for 16 kHz bands is not needed — highs are relative). */
function mono(buffer: AudioBuffer): { data: Float32Array; sr: number } {
  const chs = buffer.numberOfChannels;
  const n = buffer.length;
  const factor = buffer.sampleRate > 32000 ? 2 : 1;
  const out = new Float32Array(Math.floor(n / factor));
  const c0 = buffer.getChannelData(0);
  const c1 = chs > 1 ? buffer.getChannelData(1) : null;
  for (let i = 0, o = 0; o < out.length; i += factor, o++) {
    let v = c0[i];
    if (c1) v = (v + c1[i]) * 0.5;
    if (factor === 2) {
      let w = c0[i + 1] ?? 0;
      if (c1) w = (w + (c1[i + 1] ?? 0)) * 0.5;
      v = (v + w) * 0.5;
    }
    out[o] = v;
  }
  return { data: out, sr: buffer.sampleRate / factor };
}

function percentile(arr: Float32Array, p: number): number {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(arr.length / 4000));
  for (let i = 0; i < arr.length; i += step) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * p))] || 1e-9;
}

function toU8(arr: Float32Array, ref: number): Uint8Array {
  const out = new Uint8Array(arr.length);
  const k = ref > 0 ? 255 / ref : 0;
  for (let i = 0; i < arr.length; i++) out[i] = Math.min(255, Math.round(arr[i] * k));
  return out;
}

/** Peak-pick a novelty curve against a local-median threshold. */
function pickPeaks(flux: Float32Array, hop: number, opts: { k: number; minGap: number; floor: number }): Array<{ i: number; v: number }> {
  const out: Array<{ i: number; v: number }> = [];
  const W = Math.max(4, Math.round(0.35 / hop)); // ±350 ms neighbourhood
  const minGapF = Math.max(1, Math.round(opts.minGap / hop));
  const win: number[] = [];
  let last = -1e9;
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i];
    if (v < opts.floor || v < flux[i - 1] || v < flux[i + 1]) continue;
    // local median
    win.length = 0;
    for (let j = Math.max(0, i - W); j < Math.min(flux.length, i + W); j += 2) win.push(flux[j]);
    win.sort((a, b) => a - b);
    const med = win[win.length >> 1] || 0;
    if (v > med * opts.k + opts.floor && i - last >= minGapF) {
      out.push({ i, v });
      last = i;
    }
  }
  return out;
}

const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0));

export async function analyzeSpectrum(buffer: AudioBuffer, signal?: { cancelled: boolean }): Promise<SpectralAnalysis | null> {
  const { data, sr } = mono(buffer);
  const hopN = 256;                       // ~11.6 ms at 22.05 kHz
  const hop = hopN / sr;
  const frames = Math.max(0, Math.floor((data.length - FFT_SIZE) / hopN));
  if (frames < 8) return null;

  const binHz = sr / FFT_SIZE;
  const bin = (hz: number) => Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / binHz)));
  const B = {
    low0: bin(30), low1: bin(120), mid0: bin(150), mid1: bin(2500), high1: bin(Math.min(16000, sr / 2 - binHz)),
    voc0: bin(300), voc1: bin(3400), snr0: bin(1000), snr1: bin(Math.min(8000, sr / 2 - binHz)), hat0: bin(Math.min(6000, sr / 2 - 2 * binHz)),
    body0: bin(150), body1: bin(800), air0: bin(Math.min(5000, sr / 2 - 2 * binHz)),
  };

  const low = new Float32Array(frames), mid = new Float32Array(frames), high = new Float32Array(frames);
  const level = new Float32Array(frames), vocalRaw = new Float32Array(frames);
  const fluxLow = new Float32Array(frames), fluxSnare = new Float32Array(frames), fluxHat = new Float32Array(frames);
  const snareNoisy = new Float32Array(frames);
  /** Share of the ATTACK in the snare body (150–800 Hz) vs air (>5 kHz):
   *  snare ≫ hat. Measured on flux, so a sustained vocal under a hat doesn't
   *  lend it a body. */
  const bodyShare = new Float32Array(frames);
  /** Kick-band (30–120 Hz) energy — a kick must actually JUMP it. */
  const kickE = new Float32Array(frames);
  const bodyFlux = new Float32Array(frames), airFlux = new Float32Array(frames);

  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
  let mag = new Float32Array(FFT_SIZE / 2), prev = new Float32Array(FFT_SIZE / 2);

  for (let f = 0; f < frames; f++) {
    if (f % 600 === 0) {
      await yieldToUi();
      if (signal?.cancelled) return null;
    }
    const off = f * hopN;
    let sq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = data[off + i];
      re[i] = s * win[i];
      im[i] = 0;
      if (i >= FFT_SIZE / 2 - hopN / 2 && i < FFT_SIZE / 2 + hopN / 2) sq += s * s;
    }
    level[f] = Math.sqrt(sq / hopN);
    fftInPlace(re, im);

    let eL = 0, eM = 0, eH = 0, fL = 0, fS = 0, fHt = 0, vSum = 0, vLog = 0, vN = 0, sSum = 0, sLog = 0, sN = 0, eBody = 0, eAir = 0, eKick = 0;
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = m;
      const d = m - prev[k];
      if (k < B.mid0) { eL += m * m; if (k >= B.low0 && k < B.low1 && d > 0) fL += d; }
      else if (k < B.mid1) eM += m * m;
      else if (k < B.high1) eH += m * m;
      if (d > 0) {
        if (k >= B.body0 && k < B.body1) eBody += d;
        else if (k >= B.air0) eAir += d;
      }
      if (k >= B.low0 && k < B.low1) eKick += m * m;
      if (k >= B.snr0 && k < B.snr1 && d > 0) fS += d;
      if (k >= B.hat0 && d > 0) fHt += d;
      if (k >= B.voc0 && k < B.voc1) { vSum += m; vLog += Math.log(m + 1e-9); vN++; }
      if (k >= B.snr0 && k < B.snr1) { sSum += m; sLog += Math.log(m + 1e-9); sN++; }
    }
    low[f] = Math.sqrt(eL); mid[f] = Math.sqrt(eM); high[f] = Math.sqrt(eH);
    fluxLow[f] = fL; fluxSnare[f] = fS; fluxHat[f] = fHt;
    // Spectral flatness (geometric / arithmetic mean): ~1 noise, ~0 tonal.
    const vFlat = vN ? Math.exp(vLog / vN) / (vSum / vN + 1e-9) : 1;
    vocalRaw[f] = (vSum / Math.max(1, vN)) * Math.max(0, 1 - vFlat * 1.6);
    snareNoisy[f] = sN ? Math.exp(sLog / sN) / (sSum / sN + 1e-9) : 0;
    bodyShare[f] = eBody / (eBody + eAir + 1e-12);
    bodyFlux[f] = eBody; airFlux[f] = eAir;
    kickE[f] = eKick;
    const t = prev; prev = mag; mag = t;
  }

  // ── onsets ──
  // Frame f's window is centred half an FFT later than its start.
  const tOf = (i: number) => i * hop + (FFT_SIZE / 2) / sr;
  const nLow = percentile(fluxLow, 0.98), nSn = percentile(fluxSnare, 0.98), nHat = percentile(fluxHat, 0.98);
  const kicks = pickPeaks(fluxLow, hop, { k: 1.8, minGap: 0.12, floor: nLow * 0.55 });
  const noisyHits = pickPeaks(fluxSnare, hop, { k: 1.7, minGap: 0.06, floor: nSn * 0.2 });
  const hats = pickPeaks(fluxHat, hop, { k: 1.5, minGap: 0.06, floor: nHat * 0.2 });

  const onsets: Onset[] = [];
  const near = (arr: Array<{ i: number }>, i: number, r = 2) => arr.find(p => Math.abs(p.i - i) <= r);
  // Body share over the attack (a couple of frames) — the deciding feature
  // between a snare (fat 150–800 Hz body) and a hat (all air).
  // ...measured as EXCESS over each band's own recent baseline, so a sustained
  // vocal's steady body-band flux doesn't make every hat under it look fat.
  const W = Math.max(4, Math.round(0.3 / hop));
  const baseline = (arr: Float32Array, i: number) => {
    const w: number[] = [];
    for (let j = Math.max(0, i - W); j < Math.min(arr.length, i + W); j += 2) w.push(arr[j]);
    w.sort((a, b) => a - b);
    return w[w.length >> 1] || 0;
  };
  const share = (i: number) => {
    let best = 0;
    for (let j = i; j <= i + 2 && j < frames; j++) {
      const b = Math.max(0, bodyFlux[j] - baseline(bodyFlux, j));
      const a = Math.max(0, airFlux[j] - baseline(airFlux, j));
      best = Math.max(best, b / (a + b + 1e-12));
    }
    return best;
  };
  const kickFloor = percentile(kickE, 0.9) * 0.2;

  const snareIdx: number[] = [];
  // Snare vs hat: in real mixes the snare's broadband attack is far stronger
  // than a hat's in 1–8 kHz (measured ~2× on test material), and a snare has
  // SOME body; weaker noisy hits with no body are hats.
  const hatFromNoisy: number[] = [];
  for (const p of noisyHits) {
    const noisy = Math.max(snareNoisy[p.i] || 0, snareNoisy[p.i + 1] || 0) > 0.18;
    if (!noisy) continue;
    if (p.v / nSn >= 0.95 && share(p.i) >= 0.08) snareIdx.push(p.i);
    else hatFromNoisy.push(p.i);
  }
  for (const p of kicks) {
    // Real kicks at least double the kick band within ~45 ms; vibrato and
    // bass wobble only nudge it.
    const before = kickE[Math.max(0, p.i - 2)], after = Math.max(kickE[p.i + 1] || 0, kickE[p.i + 2] || 0, kickE[p.i + 3] || 0);
    if (after < before * 2 + 1e-9 || after < kickFloor) continue;
    // A "kick" that is really a snare's low thump: the snare flux dominates.
    const sn = snareIdx.find(i => Math.abs(i - p.i) <= 2);
    if (sn != null && fluxSnare[sn] / nSn > 1.5 * (fluxLow[p.i] / nLow)) continue;
    onsets.push({ time: tOf(p.i), kind: 'kick', strength: Math.min(1, p.v / nLow) });
  }
  const kickIdx = kicks.map(p => p.i);
  for (const i of snareIdx) {
    // A snare on top of a strong kick is usually the kick's click.
    const k = kickIdx.find(j => Math.abs(j - i) <= 2);
    if (k != null && fluxLow[k] / nLow > fluxSnare[i] / nSn) continue;
    onsets.push({ time: tOf(i), kind: 'snare', strength: Math.min(1, fluxSnare[i] / nSn) });
  }
  const taken = onsets.map(o => Math.round((o.time - (FFT_SIZE / 2) / sr) / hop));
  const hatCandidates = [...hats.map(p => p.i), ...hatFromNoisy].sort((a, b) => a - b);
  for (const i of hatCandidates) {
    if (taken.some(j => Math.abs(j - i) <= 2)) continue;
    taken.push(i);
    onsets.push({ time: tOf(i), kind: 'hat', strength: Math.min(1, Math.max(fluxHat[i] / nHat, fluxSnare[i] / nSn)) });
  }
  onsets.sort((a, b) => a.time - b.time);
  void near;

  // ── vocal lane: sustained tonal voice-band energy, percussive frames damped ──
  const vocal = new Float32Array(frames);
  const smooth = Math.max(1, Math.round(0.18 / hop));
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += vocalRaw[f];
    if (f >= smooth) acc -= vocalRaw[f - smooth];
    vocal[f] = acc / Math.min(f + 1, smooth);
  }
  for (const o of onsets) {
    const i = Math.round((o.time - (FFT_SIZE / 2) / sr) / hop);
    for (let j = i; j < Math.min(frames, i + 3); j++) vocal[j] *= 0.6;
  }
  // Normalise against a high percentile and gate the floor, so silence or a
  // purely instrumental passage reads as "no vocal".
  const vRef = percentile(vocal, 0.97);
  const vGate = percentile(vocal, 0.35);
  for (let f = 0; f < frames; f++) vocal[f] = Math.max(0, vocal[f] - vGate);

  return {
    hop, frames, duration: frames * hop,
    low: toU8(low, percentile(low, 0.995)),
    mid: toU8(mid, percentile(mid, 0.995)),
    high: toU8(high, percentile(high, 0.995)),
    level: toU8(level, percentile(level, 0.995)),
    vocal: toU8(vocal, Math.max(1e-9, vRef - vGate)),
    onsets,
  };
}
