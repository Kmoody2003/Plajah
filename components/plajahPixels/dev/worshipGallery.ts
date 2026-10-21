// components/plajahPixels/dev/worshipGallery.ts
// Interactive Gallery Controller for all 72 Church, Worship, Praise, Hymnal & Scripture Visualizers
// with integrated Live Lyrics & Auto-Transcription of Playing Audio (Whisper GPU/NPU + Web Speech).

import type { LyricLine } from '../../../services/ambo/lyricStyles';
import {
  startLiveTranscription,
  transcribeWindowWithChoraGemini,
  type TranscriberHandle,
  type TranscribeSource,
} from '../../../services/ambo/liveTranscriber';
import { createSongDetector, createSongAligner } from '../../../services/ambo/songFollowCore';
import { listSongs } from '../../../services/ambo/songLibrary';
import { ensureAsr, getAsr, subscribeAsr } from '../../../services/ambo/asrEngine';
import { separateVocals, MDX } from '../../../services/ambo/vocalSeparator';
import { amboAudio } from '../../../services/ambo/amboAudioEngine';
import { bus as audioBus, registerLocalFiles, type BusTrack } from '../../../services/ambo/audioBus';
import {
  extractLyricsForTrack,
  getExtractState,
  getExtractedLyrics,
  subscribeExtract,
} from '../../../services/ambo/vocalLyricExtractor';
import { readFeed, type LyricSourceId } from '../../../services/ambo/lyricFeed';
import {
  installSongFollower,
  startSongFollow,
  stopSongFollow,
  setSongFollowSource,
  setSongFollowPrefs,
  getSongFollowState,
  getSongFollowPrefs,
  subscribeSongFollow,
  startCapture,
  stopCapture,
  getCaptureState,
  type FollowListenSource,
} from '../../../services/ambo/songFollower';
import {
  startLiveLyrics,
  stopLiveLyrics,
  setLiveLyricsPrefs,
  getLiveLyricsState,
  subscribeLiveLyrics,
} from '../../../services/ambo/liveLyrics';
import { startTypoTextDriver, setTypoTextDemand } from '../../../services/ambo/typoTextDriver';

// ── Browser-Native Vocal Isolation & Online/Aligned Lyrics Helpers ───────────

function cleanTitle(raw: string): string {
  return (raw || '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/^\s*\d{1,3}\s*[-_.)]+\s*/, '')
    .replace(/\((?:[^)]*(?:official|video|audio|lyric|live|visuali[sz]er|hd|4k|remaster)[^)]*)\)/gi, ' ')
    .replace(/\[(?:[^\]]*)\]/g, ' ')
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function identifySong(meta: { title?: string; artist?: string; fileName?: string }): { title: string; artist: string } | null {
  let title = cleanTitle(meta.title || '');
  let artist = (meta.artist || '').trim();
  if (/^(?:local audio file|unknown(?: artist)?|various(?: artists)?|track|audio|n\/?a|-)?$/i.test(artist)) artist = '';
  if (!title && meta.fileName) title = cleanTitle(meta.fileName);
  if (!artist) {
    const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(title);
    if (m) {
      artist = m[1].trim();
      title = cleanTitle(m[2]);
    }
  }
  return title.length >= 2 ? { title, artist } : null;
}

const normStr = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseLrc(lrc: string): Array<{ time: number; text: string }> {
  const out: Array<{ time: number; text: string }> = [];
  for (const row of (lrc || '').split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    for (const t of tags) {
      const frac = t[3] ? Number(t[3]) / Math.pow(10, t[3].length) : 0;
      out.push({ time: Number(t[1]) * 60 + Number(t[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

async function fetchOnlineLyrics(
  id: { title: string; artist: string },
  durationSec?: number,
): Promise<{ synced: Array<{ time: number; text: string }> | null; plain: string[] | null; match: { title: string; artist: string } } | null> {
  const queries: string[] = [];
  if (id.artist) queries.push(`track_name=${encodeURIComponent(id.title)}&artist_name=${encodeURIComponent(id.artist)}`);
  queries.push(`q=${encodeURIComponent(`${id.artist} ${id.title}`.trim())}`);
  if (id.artist) queries.push(`q=${encodeURIComponent(id.title)}`);
  const wantT = normStr(id.title);
  const wantA = normStr(id.artist);
  for (const q of queries) {
    let rows: any[] = [];
    try {
      const res = await fetch(`https://lrclib.net/api/search?${q}`);
      if (!res.ok) continue;
      rows = await res.json();
    } catch {
      return null;
    }
    if (!Array.isArray(rows) || !rows.length) continue;
    const scored = rows
      .filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
      .map(r => {
        const t = normStr(r.trackName);
        const a = normStr(r.artistName);
        let s = 0;
        if (t === wantT) s += 5;
        else if (t.includes(wantT) || (wantT.includes(t) && t.length > 3)) s += 3;
        else return { r, s: -1 };
        if (wantA) {
          if (a === wantA) s += 3;
          else if (a.includes(wantA) || wantA.includes(a)) s += 2;
        }
        if (durationSec && r.duration) {
          const d = Math.abs(r.duration - durationSec);
          s += d <= 2 ? 3 : d <= 6 ? 1.5 : d > 25 ? -3 : 0;
        }
        if (r.syncedLyrics) s += 1.5;
        return { r, s };
      })
      .filter(x => x.s >= 5)
      .sort((a, b) => b.s - a.s);
    if (!scored.length) continue;
    const best = scored[0].r;
    const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
    const plain = best.plainLyrics
      ? String(best.plainLyrics)
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter(Boolean)
      : null;
    if (!synced?.length && !plain?.length) continue;
    return {
      synced: synced?.length ? synced : null,
      plain,
      match: { title: best.trackName, artist: best.artistName },
    };
  }
  return null;
}

function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function alignLyrics(
  lyrics: string[],
  heard: Array<{ time: number; text: string }>,
  heardUpTo: number,
  final = false,
): Array<{ time: number; text: string }> {
  const words: Array<{ w: string; t: number }> = [];
  heard.forEach((h, i) => {
    const ws = normStr(h.text).split(' ').filter(Boolean);
    const end = Math.min(heard[i + 1]?.time ?? h.time + ws.length * 0.45, h.time + ws.length * 0.6 + 0.5);
    ws.forEach((w, k) => words.push({ w, t: h.time + ((end - h.time) * k) / Math.max(1, ws.length) }));
  });
  const anchors: Array<number | null> = lyrics.map(() => null);
  let ptr = 0;
  for (let li = 0; li < lyrics.length; li++) {
    const lw = normStr(lyrics[li]).split(' ').filter(Boolean);
    if (!lw.length) continue;
    const probe = lw.slice(0, Math.min(5, lw.length));
    let best = -1;
    let bestScore = 0;
    const limit = Math.min(words.length, ptr + 80);
    for (let s = ptr; s < limit; s++) {
      let score = 0;
      for (let k = 0; k < probe.length && s + k < words.length; k++) {
        const a = wordSim(probe[k], words[s + k].w);
        const b = s + k + 1 < words.length ? wordSim(probe[k], words[s + k + 1].w) * 0.85 : 0;
        score += Math.max(a, b) >= 0.6 ? Math.max(a, b) : 0;
      }
      score /= probe.length;
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = s;
      }
    }
    if (best >= 0 && bestScore >= (probe.length >= 3 ? 0.5 : 0.75)) {
      anchors[li] = words[best].t;
      ptr = best + Math.max(1, Math.floor(lw.length * 0.7));
    }
  }
  const out: Array<{ time: number; text: string }> = [];
  let lastIdx = -1;
  for (let i = 0; i < lyrics.length; i++) if (anchors[i] != null) lastIdx = i;
  if (lastIdx < 0) return [];
  const firstIdx = anchors.findIndex(a => a != null);
  for (let i = 0; i < lyrics.length; i++) {
    let t = anchors[i];
    if (t == null) {
      if (i < firstIdx) continue;
      if (i > lastIdx) {
        if (!final) break;
        const prevT = out.length ? out[out.length - 1].time : 0;
        t = Math.min(heardUpTo, prevT + 3.5);
      } else {
        let a = i - 1;
        while (a >= 0 && anchors[a] == null) a--;
        let b = i + 1;
        while (b < lyrics.length && anchors[b] == null) b++;
        const ta = anchors[a]!;
        const tb = anchors[b]!;
        t = ta + ((tb - ta) * (i - a)) / (b - a);
      }
    }
    if (out.length && t <= out[out.length - 1].time) t = out[out.length - 1].time + 0.3;
    out.push({ time: t, text: lyrics[i] });
  }
  return out;
}

/** In-place Radix-2 Cooley-Tukey FFT for fast 16kHz STFT vocal extraction. */
function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean) {
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
    const half = len >> 1;
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1);
    const wlenR = Math.cos(ang);
    const wlenI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      for (let j = 0; j < half; j++) {
        const uR = re[i + j];
        const uI = im[i + j];
        const vR = re[i + j + half] * wR - im[i + j + half] * wI;
        const vI = re[i + j + half] * wI + im[i + j + half] * wR;
        re[i + j] = uR + vR;
        im[i + j] = uI + vI;
        re[i + j + half] = uR - vR;
        im[i + j + half] = uI - vI;
        const nextWR = wR * wlenR - wI * wlenI;
        wI = wR * wlenI + wI * wlenR;
        wR = nextWR;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * Studio-Grade 16 kHz STFT Phase-Coherent Center-Channel & Harmonic Vocal Extractor:
 *  1. Resamples stereo (L, R) to 16 kHz with 185 Hz highpass + 4500 Hz lowpass + 2.1 kHz vocal formant lift.
 *  2. Runs a 1024-bin STFT (hop 256, Hann window) using single-pass complex stereo packing z = L + i*R.
 *  3. Applies a frequency-domain Pan-Coherence Mask that strips panned guitars, keys, synth pads, and stereo reverb
 *     (|Side| / |Mid| suppression) while clamping broadband percussive drum transients and boosting harmonic vocal formants.
 *  4. Reconstructs clean 16 kHz mono vocal audio via Overlap-Add iSTFT + soft-knee RMS normalization.
 */
async function isolateVocals16k(buf: AudioBuffer): Promise<Float32Array> {
  const len16 = Math.max(1024, Math.ceil(buf.duration * 16000));
  const chCount = Math.min(2, Math.max(1, buf.numberOfChannels));
  const ctx = new OfflineAudioContext(chCount, len16, 16000);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 185;
  hp.Q.value = 0.75;

  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 175;
  hp2.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4500;
  lp.Q.value = 0.8;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2100;
  presence.gain.value = 3.6;
  presence.Q.value = 0.85;

  src.connect(hp);
  hp.connect(hp2);
  hp2.connect(lp);
  lp.connect(presence);
  presence.connect(ctx.destination);
  src.start();

  const rendered = await ctx.startRendering();
  const L = rendered.getChannelData(0);
  const R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
  const isStereo = rendered.numberOfChannels > 1;

  const N = 1024;
  const HOP = 256;
  const hann = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  }

  const out = new Float32Array(L.length);
  const norm = new Float32Array(L.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const magMid = new Float64Array(N >> 1);
  const magSide = new Float64Array(N >> 1);
  const smoothEnv = new Float64Array(N >> 1);

  // Vocal frequency bins at 16 kHz (N=1024 -> 15.625 Hz/bin): bin 11 (~172 Hz) to bin 292 (~4562 Hz)
  const MIN_BIN = 11;
  const MAX_BIN = 292;

  for (let start = 0; start + N <= L.length; start += HOP) {
    for (let i = 0; i < N; i++) {
      const w = hann[i];
      re[i] = L[start + i] * w;
      im[i] = R[start + i] * w;
    }
    fftRadix2(re, im, false);

    // Unpack L and R spectra from z = L + i*R and compute Mid/Side magnitudes
    let frameFlux = 0;
    let frameEnergy = 1e-9;
    for (let k = MIN_BIN; k <= MAX_BIN; k++) {
      const k2 = N - k;
      const xr = re[k], xi = im[k];
      const yr = re[k2], yi = -im[k2];
      const lr = 0.5 * (xr + yr), li = 0.5 * (xi + yi);
      const rr = 0.5 * (xi - yi), ri = -0.5 * (xr - yr);
      const mr = 0.5 * (lr + rr), mi = 0.5 * (li + ri);
      const sr = 0.5 * (lr - rr), si = 0.5 * (li - ri);
      const mMag = Math.hypot(mr, mi);
      const sMag = Math.hypot(sr, si);
      magMid[k] = mMag;
      magSide[k] = sMag;
      frameEnergy += mMag;
      const diff = mMag - smoothEnv[k];
      if (diff > 0) frameFlux += diff;
      smoothEnv[k] = smoothEnv[k] * 0.8 + mMag * 0.2;
      // Store complex Mid temporarily in (re[k], im[k]) for lower half
      re[k] = mr;
      im[k] = mi;
    }

    // Detect broadband percussive transient (drum hit) vs harmonic vocal sustain
    const transientRatio = frameFlux / frameEnergy;
    const drumClamp = transientRatio > 0.52 ? Math.max(0.32, 1 - (transientRatio - 0.52) * 1.1) : 1.0;

    // Zero DC, sub-bass, and high-frequency bins
    for (let k = 0; k < MIN_BIN; k++) {
      re[k] = 0; im[k] = 0;
      if (k > 0) { re[N - k] = 0; im[N - k] = 0; }
    }
    for (let k = MAX_BIN + 1; k <= (N >> 1); k++) {
      re[k] = 0; im[k] = 0;
      re[N - k] = 0; im[N - k] = 0;
    }

    // Apply stereo center pan-coherence mask + local harmonic formant emphasis
    for (let k = MIN_BIN; k <= MAX_BIN; k++) {
      const mMag = magMid[k];
      const sMag = magSide[k];
      // Pan coherence: 1.0 for dead-center vocals, drops towards 0.06 for panned instruments/reverb
      let panMask = 1.0;
      if (isStereo) {
        const cancel = Math.max(0.06, 1 - 1.55 * (sMag / (mMag + 1e-7)));
        panMask = cancel * cancel;
      }
      // Local harmonic peak check (formant harmonics stand out above surrounding 5-bin floor)
      const kLo = Math.max(MIN_BIN, k - 2);
      const kHi = Math.min(MAX_BIN, k + 2);
      const localAvg = (magMid[kLo] + magMid[k - 1] + mMag + magMid[k + 1] + magMid[kHi]) * 0.2;
      const harmonicBoost = mMag > localAvg * 1.18 ? 1.22 : 0.78 * drumClamp;

      const gain = Math.min(1.4, panMask * harmonicBoost);
      const mr = re[k] * gain;
      const mi = im[k] * gain;
      re[k] = mr;
      im[k] = mi;
      // Conjugate symmetry for real output signal
      re[N - k] = mr;
      im[N - k] = -mi;
    }

    fftRadix2(re, im, true);

    for (let i = 0; i < N; i++) {
      const w = hann[i];
      out[start + i] += re[i] * w;
      norm[start + i] += w * w;
    }
  }

  // Normalize overlap-add and apply clean soft-knee RMS leveling so vocals are loud & unclipped
  let sumSq = 0;
  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
    sumSq += out[i] * out[i];
  }
  const globalRms = Math.sqrt(sumSq / Math.max(1, out.length));
  const targetGain = globalRms > 1e-4 ? Math.min(6.0, Math.max(0.9, 0.15 / globalRms)) : 1.0;
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.tanh(out[i] * targetGain);
  }
  return out;
}

const BAD_HALLUCINATION = /^(?:thanks? for watching|thank you(?:\s+very\s+much)?|subtitles? by|subscribe|please like|translated by|amara\.org|copyright|closed captions?|the end|bye[- ]bye|you)[\s.!,]*$/i;
function cleanLine(raw: string): string {
  let t = (raw || '').replace(/\s+/g, ' ').trim();
  if (/^[\[({♪\s*]*(?:music|applause|laughter|singing|instrumental|silence|inaudible|blank_audio)?[\])}♪\s*]*$/i.test(t)) return '';
  t = t.replace(/\[[^\]]*\]|\([^)]*\)|♪/g, '').trim();
  if (t.length < 2 || BAD_HALLUCINATION.test(t)) return '';
  const w = t.toLowerCase().split(/\s+/);
  if (w.length >= 4 && new Set(w).size <= Math.max(1, Math.floor(w.length / 4))) return '';
  return t;
}

function createLineBuilder(maxWords: number, keep: number, pauseSec: number) {
  let out: Array<{ time: number; text: string }> = [];
  let curWords = 0;
  let lastAt = -1e9;
  return {
    push(text: string, nowSec: number) {
      const words = text.split(/\s+/).filter(Boolean);
      for (const w of words) {
        const startNew = !out.length || curWords >= maxWords || nowSec - lastAt > pauseSec;
        if (startNew) {
          out.push({ time: nowSec, text: w });
          curWords = 1;
        } else {
          out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + ' ' + w };
          curWords++;
        }
        lastAt = nowSec;
      }
      if (out.length > keep) out = out.slice(-keep);
    },
    lines: () => out,
    reset() {
      out = [];
      curWords = 0;
      lastAt = -1e9;
    },
  };
}
import {
  ALL_WORSHIP_VISUALIZERS,
  WorshipVisualizerDef,
  WorshipCategory,
  WorshipRenderParams,
  WorshipAudioState,
  CouncilDirector,
  COUNCIL_DIRECTOR_META,
  resolveDirector,
  resolveCouncilNote,
  CALM_WORSHIP_LYRICS,
  UPTEMPO_PRAISE_LYRICS,
  SAMPLE_SCRIPTURES,
  synthesizeWorshipAudioState,
  buildWorshipLyricFrame,
  clamp01,
} from '../../../services/ambo/worshipVisualizers';

// ── State ────────────────────────────────────────────────────────────────────

let activeVis: WorshipVisualizerDef = ALL_WORSHIP_VISUALIZERS[0];
let activeFilter: WorshipCategory | 'all' | 'gemini-twins' = 'all';
let activeDirectorFilter: CouncilDirector | 'all' = 'all';
let searchQuery = '';
let splitCompare = false;
let blendConceptPlate = false;
let manualStepOffset = 0;
let customTextOverride = '';
let autoTranscribeEnabled = true;

const params: WorshipRenderParams = {
  motion: 0.52,
  warmth: 0.52,
  reactivity: 0.78,
  textSafe: 0.44,
  showText: true,
  lightLeaks: 0.76,
  bokehFlare: 0.80,
  textureGrain: 0.58,
  colorPunch: 0.82,
  plateBlend: 0.0,
};

function resolvePlateUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return url.replace(/^\/sanctuary-plates\//, './public/sanctuary-plates/');
  }
  return url;
}

const ALL_GEMINI_PLATES = [
  '/sanctuary-plates/optical-light-leak-prism-overlay.jpg',
  '/sanctuary-plates/calm-contemporary-bokeh-leaks.jpg',
  '/sanctuary-plates/praise-prism-anamorphic-gold.jpg',
  '/sanctuary-plates/scripture-kintsugi-mineral-gold.jpg',
  '/sanctuary-plates/calm-olive-gethsemane.jpg',
  '/sanctuary-plates/calm-galilee-dawn.jpg',
  '/sanctuary-plates/praise-gospel-sunburst.jpg',
  '/sanctuary-plates/praise-hymnal-organ-gold.jpg',
  '/sanctuary-plates/scripture-illuminated-vellum.jpg',
  '/sanctuary-plates/scripture-cloister-rain.jpg',
];

// Preload all 10 Gemini Concept & Optical Plates for 60fps compositing / comparison
const conceptImageCache = new Map<string, HTMLImageElement>();
for (const rawPath of ALL_GEMINI_PLATES) {
  const resolved = resolvePlateUrl(rawPath)!;
  if (!conceptImageCache.has(resolved)) {
    const img = new Image();
    img.src = resolved;
    conceptImageCache.set(resolved, img);
    conceptImageCache.set(rawPath, img);
  }
}
for (const v of ALL_WORSHIP_VISUALIZERS) {
  if (v.conceptImage) {
    v.conceptImage = resolvePlateUrl(v.conceptImage);
    if (v.conceptImage && !conceptImageCache.has(v.conceptImage)) {
      const img = new Image();
      img.src = v.conceptImage;
      conceptImageCache.set(v.conceptImage, img);
    }
  }
}

function getAtmosphericPlateForVis(vis: WorshipVisualizerDef): HTMLImageElement | undefined {
  if (vis.conceptImage) {
    return conceptImageCache.get(vis.conceptImage);
  }
  const fallbackPath =
    vis.category === 'calm-lyric'
      ? vis.number % 2 === 0
        ? '/sanctuary-plates/calm-contemporary-bokeh-leaks.jpg'
        : '/sanctuary-plates/calm-galilee-dawn.jpg'
      : vis.category === 'uptempo-lyric'
      ? vis.number % 2 === 0
        ? '/sanctuary-plates/praise-prism-anamorphic-gold.jpg'
        : '/sanctuary-plates/praise-gospel-sunburst.jpg'
      : vis.number % 2 === 0
      ? '/sanctuary-plates/scripture-kintsugi-mineral-gold.jpg'
      : '/sanctuary-plates/scripture-illuminated-vellum.jpg';
  return conceptImageCache.get(resolvePlateUrl(fallbackPath)!) ?? conceptImageCache.get(fallbackPath);
}

// ── Ambo Production Signal Chain + Live Auto-Transcription State ─────────────

const liveLineBuilder = createLineBuilder(8, 24, 1.4);
let liveTranscribeHandle: TranscriberHandle | null = null;
let liveTranscribeStartT = performance.now();
let liveTranscribedLines: LyricLine[] = [];
let fileTimedLyrics: LyricLine[] = [];
let fileExtractionToken = 0;
let lastHeardSnippet = '';
let detectedSongTitle = '';
let detectedSongArtist = '';
let matchedScriptureWordIdx: number | undefined = undefined;

// Ambo Signal Chain State
let activeAmboClock: LyricSourceId = 'follow';
let activeAmboTap: 'playlist' | 'program' | 'mic' | 'system' = 'playlist';
let currentAmboTrack: BusTrack | null = null;
let amboFreqData: Uint8Array | null = null;

// Boot Ambo SongFollower & TypoTextDriver clocks
installSongFollower();
startTypoTextDriver();

const songDetector = createSongDetector(listSongs());
let activeSongAligner: ReturnType<typeof createSongAligner> | null = null;

const asrStatusText = document.getElementById('asrStatusText');
const asrEngineBadge = document.getElementById('asrEngineBadge');
const asrProgressWrap = document.getElementById('asrProgressWrap');
const asrProgressBar = document.getElementById('asrProgressBar');
const liveTranscriptReadout = document.getElementById('liveTranscriptReadout');

function setAsrStatus(status: string, badge?: string, progress?: number) {
  if (asrStatusText) asrStatusText.textContent = status;
  if (badge !== undefined && asrEngineBadge) asrEngineBadge.textContent = badge;
  if (asrProgressWrap && asrProgressBar) {
    if (progress !== undefined && progress > 0 && progress < 1) {
      asrProgressWrap.style.display = 'block';
      asrProgressBar.style.width = `${Math.round(progress * 100)}%`;
    } else {
      asrProgressWrap.style.display = 'none';
    }
  }
}

// Subscribe to Ambo's vocalLyricExtractor, songFollower, and liveLyrics state
subscribeExtract(() => {
  const ext = getExtractState();
  if (ext.status === 'isolating' || ext.status === 'transcribing') {
    setAsrStatus(ext.message || 'Stage vocalLyricExtractor processing…', 'Stage Extractor', ext.progress);
  } else if (ext.status === 'done' && ext.lines > 0) {
    setAsrStatus(ext.message || `Stage lyrics ready (${ext.lines} lines)`, 'Stage Synced');
  }
  if (currentAmboTrack) {
    const extracted = getExtractedLyrics(currentAmboTrack);
    if (extracted.length > 0) {
      fileTimedLyrics = extracted;
    }
  }
});

subscribeSongFollow(() => {
  const sf = getSongFollowState();
  const cap = getCaptureState();
  const capBtn = document.getElementById('amboCaptureSongBtn') as HTMLButtonElement | null;
  if (capBtn) {
    capBtn.textContent = cap.active
      ? `⏹ Save Captured Song (${cap.lines.length} lines)`
      : '⏺ Capture & Save Song';
    capBtn.classList.toggle('active-toggle', cap.active);
  }
  if (sf.lastHeard) {
    matchScriptureWordFromText(sf.lastHeard);
  }
  if (sf.running && sf.status && audioMode !== 'file') {
    setAsrStatus(
      sf.songTitle ? `[SongFollow: ${sf.songTitle}] ${sf.status}` : sf.status,
      sf.engine === 'whisper' ? 'Stage Whisper/Chora' : 'Stage Speech',
      sf.loadProgress ?? undefined,
    );
  }
});

subscribeLiveLyrics(() => {
  const ll = getLiveLyricsState();
  if (ll.running && activeAmboClock === 'live') {
    setAsrStatus(
      ll.status || 'Stage Live Lyrics active',
      ll.engine === 'whisper' ? 'Stage Live ASR' : 'Stage Speech',
      ll.loadProgress ?? undefined,
    );
  }
});

function stopLiveTranscriber() {
  fileExtractionToken++;
  if (liveTranscribeHandle) {
    try {
      liveTranscribeHandle.stop();
    } catch {
      /* ignore */
    }
    liveTranscribeHandle = null;
  }
}

/** Browser-native ID3v2 TIT2/TPE1 frame reader so MP3 metadata works without Node fs dependencies. */
function readId3TagsFromBuffer(buf: ArrayBuffer): { title?: string; artist?: string } {
  try {
    const u8 = new Uint8Array(buf, 0, Math.min(buf.byteLength, 262144));
    if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return {};
    const ver = u8[3];
    const tagSize =
      ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    const limit = Math.min(u8.length, 10 + tagSize);
    let pos = 10;
    const out: { title?: string; artist?: string } = {};
    while (pos + 10 <= limit && (!out.title || !out.artist)) {
      const id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size =
        ver === 4
          ? ((u8[pos + 4] & 0x7f) << 21) |
            ((u8[pos + 5] & 0x7f) << 14) |
            ((u8[pos + 6] & 0x7f) << 7) |
            (u8[pos + 7] & 0x7f)
          : (u8[pos + 4] << 24) | (u8[pos + 5] << 16) | (u8[pos + 6] << 8) | u8[pos + 7];
      if (size <= 1 || pos + 10 + size > limit) break;
      if (id === 'TIT2' || id === 'TPE1') {
        const enc = u8[pos + 10];
        const slice = u8.subarray(pos + 11, pos + 10 + size);
        let text = '';
        if (enc === 1 || enc === 2) {
          text = new TextDecoder(enc === 1 ? 'utf-16' : 'utf-16be').decode(slice);
        } else {
          text = new TextDecoder(enc === 3 ? 'utf-8' : 'iso-8859-1').decode(slice);
        }
        text = text.replace(/\0+/g, '').trim();
        if (id === 'TIT2' && text) out.title = text;
        if (id === 'TPE1' && text) out.artist = text;
      }
      pos += 10 + size;
    }
    return out;
  } catch {
    return {};
  }
}

function matchScriptureWordFromText(cleaned: string) {
  const sampleIdx = Math.floor(manualStepOffset) % SAMPLE_SCRIPTURES.length;
  const currentScripture = SAMPLE_SCRIPTURES[sampleIdx];
  if (!currentScripture) return;
  const spokenWords = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const lastSpoken = spokenWords[spokenWords.length - 1];
  if (lastSpoken && lastSpoken.length >= 3) {
    const verseWords = currentScripture.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    const foundIdx = verseWords.findIndex(
      (vw, idx) => idx >= (matchedScriptureWordIdx ?? 0) - 2 && vw.startsWith(lastSpoken),
    );
    if (foundIdx >= 0) {
      matchedScriptureWordIdx = foundIdx;
    }
  }
}

function handleIncomingWords(text: string, isFinal: boolean) {
  const cleaned = text.trim();
  if (!cleaned) return;

  const nowSec = (performance.now() - liveTranscribeStartT) / 1000;
  liveLineBuilder.push(cleaned, nowSec);
  const built = liveLineBuilder.lines();

  // Rebase timestamps so the recent window works smoothly with buildWorshipLyricFrame
  const baseTime = built.length ? Math.max(0, built[0].time - 0.01) : 0;
  liveTranscribedLines = built.map(l => ({
    time: l.time - baseTime,
    text: l.text,
  }));

  lastHeardSnippet = built.slice(-2).map(l => l.text).join(' · ');

  // Check if it matches a song in the library via SongDetector
  try {
    const match = songDetector.feed(cleaned);
    if (match && match.score >= 0.55) {
      const matchedSong = listSongs().find(s => s.id === match.songId);
      if (matchedSong && matchedSong.title !== detectedSongTitle) {
        detectedSongTitle = matchedSong.title;
        activeSongAligner = createSongAligner(matchedSong.lines, { adlibAfter: 3 });
      }
    }
    if (activeSongAligner) {
      activeSongAligner.feed(cleaned);
    }
  } catch {
    /* optional song match */
  }

  matchScriptureWordFromText(cleaned);

  if (liveTranscriptReadout && (!fileTimedLyrics.length || audioMode !== 'file')) {
    const prefix = detectedSongTitle ? `[Matched: ${detectedSongTitle}] ` : isFinal ? '❝ ' : '… ';
    liveTranscriptReadout.textContent = `${prefix}${lastHeardSnippet} ❞`;
  }
}

async function attachAutoTranscriber(source: TranscribeSource, sourceLabel: string) {
  stopLiveTranscriber();
  if (!autoTranscribeEnabled) {
    setAsrStatus(`Playing ${sourceLabel} (Auto-Transcribe paused)`, '');
    return;
  }

  liveTranscribeStartT = performance.now();
  setAsrStatus(`Starting auto-transcription for ${sourceLabel}…`, 'Loading ASR', 0.2);

  try {
    const handle = await startLiveTranscription(source, {
      onWords: (text, final) => handleIncomingWords(text, final),
      onStatus: s => setAsrStatus(s, s.includes('Whisper') ? 'Whisper AI' : 'Live Speech'),
      onProgress: (p, label) => setAsrStatus(label, 'Loading Whisper', p),
      onError: err => setAsrStatus(`ASR Note: ${err}`, 'Fallback'),
    });
    liveTranscribeHandle = handle;
    setAsrStatus(
      `Listening & transcribing ${sourceLabel} live`,
      handle.engine === 'whisper' ? 'Whisper ONNX' : 'Web Speech',
    );
  } catch (err) {
    setAsrStatus(`Audio active (${String((err as Error)?.message || err)})`, '');
  }
}

/**
 * 3-Stage Music Lyric & Vocal Isolation Pipeline for Loaded Audio Files:
 *  Stage 1: Parse ID3v2 tags + filename -> check built-in SongLibrary & LRCLIB (`fetchOnlineLyrics`).
 *           If synced LRC timestamps exist, lock immediately to `fileAudioEl.currentTime`!
 *  Stage 2: Decode the audio file -> `isolateVocals16k(buffer)` (Mid/Side center-channel extraction +
 *           160Hz-5kHz vocal formant bandpass + 2.2kHz presence boost + 6:1 compressor in OfflineAudioContext).
 *  Stage 3: Playhead-First Progressive Windowed Whisper Transcription (`ensureAsr()` with `{ timestamps: true }`):
 *           Immediately transcribes a fast 7-second window starting at `fileAudioEl.currentTime`, then
 *           walks 12-second windows ahead of the playhead so every sung line is extracted & time-locked!
 */
async function extractAndSyncAudioFileLyrics(
  file: File,
  rawBuffer: ArrayBuffer,
  fallbackStream?: MediaStream,
) {
  const token = ++fileExtractionToken;
  const alive = () => token === fileExtractionToken && audioMode === 'file';
  fileTimedLyrics = [];

  const tags = readId3TagsFromBuffer(rawBuffer);
  const songId = identifySong({
    title: tags.title,
    artist: tags.artist,
    fileName: file.name,
  });

  if (songId) {
    detectedSongTitle = songId.title;
    detectedSongArtist = songId.artist || 'Worship Track';
  } else {
    detectedSongTitle = cleanTitle(file.name) || file.name;
    detectedSongArtist = 'Playing Audio';
  }

  setAsrStatus(`Decoding & isolating vocals for "${detectedSongTitle}"…`, 'Vocal Isolation', 0.12);
  if (liveTranscriptReadout) {
    liveTranscriptReadout.textContent = `Isolating center-channel vocals from "${detectedSongTitle}"…`;
  }

  // Check if song matches local SongLibrary for reference lines
  let referenceLyrics: string[] | null = null;
  const normTitle = detectedSongTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const libMatch = listSongs().find(s => {
    const st = s.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return st && (st === normTitle || normTitle.includes(st) || st.includes(normTitle));
  });
  if (libMatch && libMatch.lines.length > 0) {
    detectedSongTitle = libMatch.title;
    if (libMatch.artist) detectedSongArtist = libMatch.artist;
    referenceLyrics = libMatch.lines;
  }

  // Decode audio buffer in parallel with online lyric lookup
  let decodedBuffer: AudioBuffer | null = null;
  try {
    ensureAudioContext();
    decodedBuffer = await audioCtx!.decodeAudioData(rawBuffer.slice(0));
  } catch (err) {
    console.warn('[SanctuaryGallery] decodeAudioData failed, falling back to stream ASR:', err);
  }
  if (!alive()) return;

  // Stage 1: Try LRCLIB online synced / plain lyrics
  if (songId) {
    try {
      setAsrStatus(`Checking synced lyrics for "${songId.title}"…`, 'LRCLIB + Whisper', 0.2);
      const online = await fetchOnlineLyrics(songId, decodedBuffer?.duration);
      if (!alive()) return;
      if (online?.synced?.length) {
        fileTimedLyrics = online.synced;
        detectedSongTitle = online.match.title || detectedSongTitle;
        detectedSongArtist = online.match.artist || detectedSongArtist;
        setAsrStatus(
          `Synced lyrics locked (${online.synced.length} lines · ${detectedSongTitle})`,
          'Synced LRC',
        );
        if (liveTranscriptReadout && online.synced[0]) {
          liveTranscriptReadout.textContent = `❝ ${online.synced[0].text} ❞`;
        }
        return;
      }
      if (online?.plain?.length) {
        referenceLyrics = online.plain;
      }
    } catch {
      /* offline or unavailable — proceed to on-device Whisper vocal isolation */
    }
  }

  if (!decodedBuffer) {
    if (fallbackStream) {
      await attachAutoTranscriber({ kind: 'stream', stream: fallbackStream }, file.name);
    }
    return;
  }

  const totalSec = decodedBuffer.duration;
  const extractedChunks: Array<{ time: number; text: string }> = [];

  const rmsSlice = (arr: Float32Array) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
    return Math.sqrt(sum / Math.max(1, arr.length));
  };

  const publishProgress = (upToSec: number, isDone: boolean) => {
    extractedChunks.sort((a, b) => a.time - b.time);
    // Deduplicate overlapping window boundaries
    const deduped: Array<{ time: number; text: string }> = [];
    for (const c of extractedChunks) {
      const prev = deduped[deduped.length - 1];
      if (
        prev &&
        prev.text.toLowerCase() === c.text.toLowerCase() &&
        Math.abs(c.time - prev.time) < 3.2
      ) {
        continue;
      }
      deduped.push(c);
    }

    if (referenceLyrics && referenceLyrics.length > 0) {
      const aligned = alignLyrics(referenceLyrics, deduped, upToSec, isDone);
      fileTimedLyrics = aligned.length > 0 ? aligned : deduped;
    } else {
      fileTimedLyrics = deduped;
    }

    // Also feed into liveTranscribedLines so switching modes preserves captured lyrics
    if (fileTimedLyrics.length > 0) {
      liveTranscribedLines = [...fileTimedLyrics];
      if (liveTranscriptReadout) {
        const curT = fileAudioEl ? fileAudioEl.currentTime : 0;
        const active =
          fileTimedLyrics.filter(l => l.time <= curT + 0.5).pop() || fileTimedLyrics[0];
        if (active) {
          liveTranscriptReadout.textContent = `❝ ${active.text} ❞`;
        }
      }
    }
  };

  // Helper to resample AudioBuffer to natural 16 kHz mono for Chora Gemini 3.6-Flash
  const resampleTo16kMono = async (buf: AudioBuffer): Promise<Float32Array> => {
    const len16 = Math.max(1, Math.ceil(buf.duration * 16000));
    const offCtx = new OfflineAudioContext(1, len16, 16000);
    const src = offCtx.createBufferSource();
    src.buffer = buf;
    src.connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    return rendered.getChannelData(0);
  };

  // Stage 2 (PRIMARY — Chora Engine): Windowed Gemini 3.6-Flash Multimodal Audio Transcription
  // Directly transcribes sung vocals inside the full music mix with 0.1s relative timestamps!
  try {
    setAsrStatus(
      `Transcribing vocals with Chora Gemini 3.6-Flash Audio Engine…`,
      'Chora Gemini ASR',
      0.26,
    );
    const rawMono16k = await resampleTo16kMono(decodedBuffer);
    if (!alive()) return;

    // 2A. Fast 12-second playhead window so the very first sung lines appear in ~1.5s
    const playheadNow = fileAudioEl ? fileAudioEl.currentTime : 0;
    const fastStart = Math.max(0, Math.floor(playheadNow));
    const fastEnd = Math.min(totalSec, fastStart + 12);
    const fastSlice = rawMono16k.subarray(
      Math.floor(fastStart * 16000),
      Math.floor(fastEnd * 16000),
    );

    const firstCaps = await transcribeWindowWithChoraGemini(fastSlice, {
      title: detectedSongTitle,
      artist: detectedSongArtist,
      kind: 'music',
    });
    if (!alive()) return;

    if (firstCaps !== null) {
      for (const c of firstCaps) {
        const cleaned = cleanLine(c.text);
        if (!cleaned) continue;
        extractedChunks.push({ time: Math.max(0, fastStart + c.time), text: cleaned });
        matchScriptureWordFromText(cleaned);
      }
      publishProgress(fastEnd, false);

      // 2B. Walk 25-second overlapping windows across the entire song (Chora's exact windowed tiling)
      const CHORA_WIN_SEC = 25;
      const CHORA_HOP_SEC = 21;
      const totalChoraWins = Math.max(1, Math.ceil(totalSec / CHORA_HOP_SEC));
      const completedChoraWins = new Set<number>();

      while (alive() && completedChoraWins.size < totalChoraWins) {
        const curPlayhead = fileAudioEl ? fileAudioEl.currentTime : 0;
        const curWinIdx = Math.min(
          totalChoraWins - 1,
          Math.max(0, Math.floor(curPlayhead / CHORA_HOP_SEC)),
        );
        let chosenIdx = -1;
        for (let offset = 0; offset < totalChoraWins; offset++) {
          const candidate = (curWinIdx + offset) % totalChoraWins;
          if (!completedChoraWins.has(candidate)) {
            chosenIdx = candidate;
            break;
          }
        }
        if (chosenIdx < 0) break;
        completedChoraWins.add(chosenIdx);

        const winStart = chosenIdx * CHORA_HOP_SEC;
        const winEnd = Math.min(totalSec, winStart + CHORA_WIN_SEC);
        const slice = rawMono16k.subarray(
          Math.floor(winStart * 16000),
          Math.floor(winEnd * 16000),
        );
        const prog = completedChoraWins.size / totalChoraWins;

        if (slice.length > 2400 && rmsSlice(slice) > 0.001) {
          setAsrStatus(
            `Chora Gemini 3.6-Flash transcribing (${fileTimedLyrics.length} lyric lines · ${Math.round(prog * 100)}%)`,
            'Chora Gemini ASR',
            0.3 + prog * 0.7,
          );
          const winCaps = await transcribeWindowWithChoraGemini(slice, {
            title: detectedSongTitle,
            artist: detectedSongArtist,
            kind: 'music',
          });
          if (!alive()) return;
          if (winCaps) {
            for (const c of winCaps) {
              const cleaned = cleanLine(c.text);
              if (!cleaned) continue;
              extractedChunks.push({ time: Math.max(0, winStart + c.time), text: cleaned });
              matchScriptureWordFromText(cleaned);
            }
            publishProgress(winEnd, completedChoraWins.size >= totalChoraWins);
          }
        }
      }

      if (alive() && fileTimedLyrics.length > 0) {
        publishProgress(totalSec, true);
        setAsrStatus(
          `Chora vocal transcription complete (${fileTimedLyrics.length} synced lines · "${detectedSongTitle}")`,
          'Chora Gemini ASR',
        );
        return;
      }
    }
  } catch (err) {
    console.warn('[SanctuaryGallery] Chora Gemini ASR fallback to on-device stem separator:', err);
  }
  if (!alive()) return;

  // Stage 3 (ON-DEVICE FALLBACK): Chora UVR Kim_Vocal_2.onnx Neural Stem Separator + STFT Filter + Whisper ONNX
  setAsrStatus(`Isolating vocals (UVR Kim_Vocal_2 ONNX / STFT Filter)…`, 'Vocal Isolation', 0.28);
  let vocalPcm16k: Float32Array;
  try {
    // Try Chora's UVR Kim_Vocal_2.onnx neural stem separator first, falling back to STFT vocal isolation
    const sr = MDX.sr;
    const vocal44 = new Float32Array(Math.ceil(totalSec * sr) + MDX.hop * MDX.dimT);
    let uvrGotSamples = 0;
    try {
      await separateVocals(
        decodedBuffer,
        async seg => {
          const o = Math.round(seg.startSec * sr);
          for (let i = 0; i < seg.left.length; i++) {
            vocal44[o + i] = (seg.left[i] + seg.right[i]) * 0.5;
          }
          uvrGotSamples = Math.max(uvrGotSamples, o + seg.left.length);
        },
        (msg, p) => {
          if (alive()) setAsrStatus(msg, 'UVR Kim_Vocal_2', 0.25 + p * 0.25);
        },
        alive,
      );
    } catch {
      uvrGotSamples = 0;
    }
    if (uvrGotSamples > sr) {
      const ab = new AudioBuffer({ length: uvrGotSamples, sampleRate: sr, numberOfChannels: 1 });
      ab.copyToChannel(vocal44.subarray(0, uvrGotSamples), 0);
      vocalPcm16k = await resampleTo16kMono(ab);
    } else {
      vocalPcm16k = await isolateVocals16k(decodedBuffer);
    }
  } catch (err) {
    console.warn('[SanctuaryGallery] isolateVocals16k error:', err);
    if (fallbackStream) {
      await attachAutoTranscriber({ kind: 'stream', stream: fallbackStream }, file.name);
    }
    return;
  }
  if (!alive()) return;

  // Load accelerated Whisper ONNX (WASM SIMD / WebGPU) and transcribe playhead-first windows
  const unsub = subscribeAsr(st => {
    if (alive() && st.loading) {
      setAsrStatus(
        st.label || 'Loading Whisper speech model…',
        'Loading Whisper',
        Math.max(0.3, (st.progress || 0.35) * 0.9),
      );
    }
  });
  let asrReady = false;
  try {
    await ensureAsr();
    asrReady = Boolean(getAsr());
  } catch (err) {
    console.warn('[SanctuaryGallery] Whisper ensureAsr failed:', err);
  } finally {
    unsub();
  }
  if (!alive() || !asrReady) return;

  const completedWindows = new Set<number>();
  const HOP_SEC = 5.5;
  const WIN_SEC = 6.5;
  const totalWindows = Math.max(1, Math.ceil(totalSec / HOP_SEC));

  // 3A. Immediate fast 5.5-second window right at current playhead so first words appear in ~1s!
  const playheadNow = fileAudioEl ? fileAudioEl.currentTime : 0;
  const fastStart = Math.max(0, Math.floor(playheadNow));
  const fastEnd = Math.min(totalSec, fastStart + 5.5);
  const fastSlice = vocalPcm16k.subarray(Math.floor(fastStart * 16000), Math.floor(fastEnd * 16000));
  if (fastSlice.length > 1600 && rmsSlice(fastSlice) > 0.0012) {
    setAsrStatus(`Transcribing vocals at playhead (${fastStart}s)…`, 'Whisper ONNX', 0.35);
    try {
      const res = await getAsr()!.transcribe(fastSlice, { timestamps: true });
      if (!alive()) return;
      for (const c of res.chunks) {
        const cleaned = cleanLine(c.text);
        if (!cleaned) continue;
        const tSec = fastStart + (Number.isFinite(c.start) ? c.start : 0);
        extractedChunks.push({ time: Math.max(0, tSec), text: cleaned });
        matchScriptureWordFromText(cleaned);
      }
      publishProgress(fastEnd, false);
    } catch (err) {
      console.warn('[SanctuaryGallery] Fast playhead window error:', err);
    }
  }

  // 3B. Walk all windows across the track, always prioritizing the window closest to and ahead of `fileAudioEl.currentTime`
  while (alive() && completedWindows.size < totalWindows) {
    const curPlayhead = fileAudioEl ? fileAudioEl.currentTime : 0;
    const curWinIdx = Math.min(totalWindows - 1, Math.max(0, Math.floor(curPlayhead / HOP_SEC)));

    // Pick first uncompleted window starting from curWinIdx forward, wrapping around to 0
    let chosenIdx = -1;
    for (let offset = 0; offset < totalWindows; offset++) {
      const candidate = (curWinIdx + offset) % totalWindows;
      if (!completedWindows.has(candidate)) {
        chosenIdx = candidate;
        break;
      }
    }
    if (chosenIdx < 0) break;
    completedWindows.add(chosenIdx);

    const winStart = chosenIdx * HOP_SEC;
    const winEnd = Math.min(totalSec, winStart + WIN_SEC);
    const slice = vocalPcm16k.subarray(Math.floor(winStart * 16000), Math.floor(winEnd * 16000));
    const prog = completedWindows.size / totalWindows;

    if (slice.length > 1600 && rmsSlice(slice) > 0.0012) {
      setAsrStatus(
        `Transcribing isolated vocals (${fileTimedLyrics.length} lyric lines · ${Math.round(prog * 100)}%)`,
        'Whisper ONNX',
        prog,
      );
      try {
        const res = await getAsr()!.transcribe(slice, { timestamps: true, background: true });
        if (!alive()) return;
        for (const c of res.chunks) {
          const cleaned = cleanLine(c.text);
          if (!cleaned) continue;
          const tSec = winStart + (Number.isFinite(c.start) ? c.start : 0);
          extractedChunks.push({ time: Math.max(0, tSec), text: cleaned });
          matchScriptureWordFromText(cleaned);
        }
        publishProgress(winEnd, completedWindows.size >= totalWindows);
      } catch (err) {
        console.warn('[SanctuaryGallery] Window transcribe error:', err);
      }
    }
    await new Promise<void>(r => setTimeout(r, 8));
  }

  if (alive()) {
    publishProgress(totalSec, true);
    setAsrStatus(
      fileTimedLyrics.length > 0
        ? `Vocal transcription complete (${fileTimedLyrics.length} synced lines · "${detectedSongTitle}")`
        : `Track analysed (instrumental or low vocal level in "${detectedSongTitle}")`,
      'Whisper ONNX',
    );
  }
}

// ── WebAudio Engine (Live Worship Synth + Mic + File + System Audio) ─────────

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array | null = null;
let audioMode: 'procedural' | 'synth' | 'mic' | 'file' | 'system' = 'procedural';
let synthInterval: number | null = null;
let fileAudioEl: HTMLAudioElement | null = null;
let activeMediaStream: MediaStream | null = null;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
}

function stopActiveAudioSources() {
  if (synthInterval !== null) {
    window.clearInterval(synthInterval);
    synthInterval = null;
  }
  if (fileAudioEl) {
    fileAudioEl.pause();
  }
  try {
    audioBus.pause();
  } catch {
    /* ignore */
  }
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach(t => t.stop());
    activeMediaStream = null;
  }
  fileTimedLyrics = [];
  stopLiveTranscriber();
}

function startWorshipSynth() {
  ensureAudioContext();
  stopActiveAudioSources();
  if (!audioCtx || !analyser) return;

  audioMode = 'synth';
  const master = audioCtx.createGain();
  master.gain.value = 0.22;
  master.connect(analyser);
  analyser.connect(audioCtx.destination);

  const chords = [
    [130.81, 196.0, 246.94, 293.66, 329.63],
    [110.0, 164.81, 220.0, 261.63, 329.63],
    [87.31, 174.61, 220.0, 261.63, 349.23],
    [98.0, 196.0, 246.94, 293.66, 392.0],
  ];
  let step = 0;

  const triggerStep = () => {
    if (!audioCtx || audioMode !== 'synth') return;
    const now = audioCtx.currentTime;
    const isUptempo = activeVis.category === 'uptempo-lyric';

    if (step % 8 === 0) {
      const chord = chords[Math.floor(step / 8) % chords.length];
      chord.forEach(freq => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = isUptempo ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isUptempo ? 1400 : 800, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.08, now + 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 3.9);
      });
    }

    if (isUptempo) {
      if (step % 2 === 0) {
        const kickOsc = audioCtx.createOscillator();
        const kickG = audioCtx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(115, now);
        kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
        kickG.gain.setValueAtTime(0.45, now);
        kickG.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        kickOsc.connect(kickG);
        kickG.connect(master);
        kickOsc.start(now);
        kickOsc.stop(now + 0.24);
      }
      if (step % 4 === 2) {
        const clapOsc = audioCtx.createOscillator();
        const clapG = audioCtx.createGain();
        clapOsc.type = 'triangle';
        clapOsc.frequency.setValueAtTime(820, now);
        clapG.gain.setValueAtTime(0.18, now);
        clapG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        clapOsc.connect(clapG);
        clapG.connect(master);
        clapOsc.start(now);
        clapOsc.stop(now + 0.13);
      }
    }
    step++;
  };

  triggerStep();
  synthInterval = window.setInterval(triggerStep, 250);
  setAsrStatus('Playing built-in Worship Synth (load an MP3 or enable Mic to transcribe vocals)', 'Synth');
}

function readLiveAudioState(t: number, category: WorshipCategory): WorshipAudioState {
  const base = synthesizeWorshipAudioState(t, category, params.reactivity);

  // Prefer Ambo's Master Analyser (`getAmboMasterAnalyser` after SpectraEQ + MasteringChain + Limiter) when playing via AudioBus
  const amboAnalyser: AnalyserNode | null =
    audioMode === 'file' && typeof (window as any).getAmboMasterAnalyser === 'function'
      ? (window as any).getAmboMasterAnalyser()
      : null;

  const activeAnalyser = amboAnalyser || analyser;
  if (audioMode === 'procedural' || !activeAnalyser) {
    return base;
  }

  if (amboAnalyser) {
    if (!amboFreqData || amboFreqData.length !== amboAnalyser.frequencyBinCount) {
      amboFreqData = new Uint8Array(amboAnalyser.frequencyBinCount);
    }
    amboAnalyser.getByteFrequencyData(amboFreqData as any);
  } else if (freqData) {
    activeAnalyser.getByteFrequencyData(freqData as any);
  } else {
    return base;
  }

  const activeBins = amboAnalyser ? amboFreqData! : freqData!;
  const bins = activeBins.length;
  const bandSlice = (lo: number, hi: number) => {
    let sum = 0;
    const start = Math.floor(lo * bins);
    const end = Math.max(start + 1, Math.floor(hi * bins));
    for (let i = start; i < end; i++) sum += activeBins[i] / 255;
    return sum / (end - start);
  };

  const bass = clamp01(bandSlice(0.0, 0.08) * 1.4 * params.reactivity);
  const vocal = clamp01(bandSlice(0.08, 0.28) * 1.5 * params.reactivity);
  const harmonic = clamp01(bandSlice(0.12, 0.45) * 1.3 * params.reactivity);
  const shimmer = clamp01(bandSlice(0.45, 0.85) * 1.6 * params.reactivity);
  const swell = clamp01(bass * 0.35 + vocal * 0.4 + harmonic * 0.25);
  const pulse = clamp01(Math.max(bass * 0.9, base.pulse * 0.6));
  const clap = clamp01(shimmer * 0.9);
  const bands = Array.from({ length: 16 }, (_, i) =>
    clamp01(bandSlice(i / 20, (i + 1) / 20) * 1.5 * params.reactivity),
  );

  return {
    swell,
    bass,
    vocal,
    harmonic,
    shimmer,
    pulse,
    clap,
    beatPhase: base.beatPhase,
    beatCount: base.beatCount,
    bands,
  };
}

// ── DOM Elements ─────────────────────────────────────────────────────────────

const heroCanvas = document.getElementById('heroCanvas') as HTMLCanvasElement;
const heroCtx = heroCanvas.getContext('2d')!;
const stageTitle = document.getElementById('stageTitle')!;
const stageDirectorBadge = document.getElementById('stageDirectorBadge');
const stageSubtitle = document.getElementById('stageSubtitle')!;
const stageCouncilCritique = document.getElementById('stageCouncilCritique');
const stageMappings = document.getElementById('stageMappings')!;
const stageLightingNote = document.getElementById('stageLightingNote')!;
const compareConceptBtn = document.getElementById('compareConceptBtn') as HTMLButtonElement;
const blendConceptBtn = document.getElementById('blendConceptBtn') as HTMLButtonElement;
const conceptCompareOverlay = document.getElementById('conceptCompareOverlay') as HTMLDivElement;
const conceptCompareImg = document.getElementById('conceptCompareImg') as HTMLImageElement;
const cardsGrid = document.getElementById('cardsGrid')!;
const geminiStripGrid = document.getElementById('geminiStripGrid')!;
const gridStatusLabel = document.getElementById('gridStatusLabel')!;
const councilEthosReadout = document.getElementById('councilEthosReadout');

const mSwell = document.getElementById('mSwell') as HTMLDivElement;
const mVocal = document.getElementById('mVocal') as HTMLDivElement;
const mPulse = document.getElementById('mPulse') as HTMLDivElement;
const mHarmonic = document.getElementById('mHarmonic') as HTMLDivElement;
const mShimmer = document.getElementById('mShimmer') as HTMLDivElement;

// ── Stage Selection & UI Update ──────────────────────────────────────────────

function selectVisualizer(vis: WorshipVisualizerDef, scrollToStage = false) {
  activeVis = vis;
  const dir = resolveDirector(vis);
  const dirMeta = COUNCIL_DIRECTOR_META[dir];
  stageTitle.textContent = `#${String(vis.number).padStart(2, '0')} · ${vis.name}`;
  if (stageDirectorBadge) {
    stageDirectorBadge.textContent = `${dirMeta.icon} ${dirMeta.title}`;
    stageDirectorBadge.style.borderColor = dirMeta.color;
    stageDirectorBadge.style.color = dirMeta.color;
  }
  stageSubtitle.textContent = `${vis.subtitle} — ${vis.description}`;
  if (stageCouncilCritique) {
    stageCouncilCritique.textContent = `${dirMeta.icon} Art Council Critique: ${resolveCouncilNote(vis)}`;
  }
  stageLightingNote.textContent = `💡 ${vis.lightingNote}  ·  ⛪ Service Use: ${vis.serviceUse}`;

  stageMappings.innerHTML = vis.audioMappings
    .map(([k, v]) => `<div class="mapping-item"><strong>${k}</strong>${v}</div>`)
    .join('');

  if (vis.conceptImage) {
    compareConceptBtn.style.display = 'inline-block';
    blendConceptBtn.style.display = 'inline-block';
    conceptCompareImg.src = vis.conceptImage;
    conceptCompareOverlay.style.display = splitCompare ? 'block' : 'none';
    conceptCompareOverlay.style.width = '50%';
  } else {
    compareConceptBtn.style.display = 'none';
    blendConceptBtn.style.display = 'none';
    conceptCompareOverlay.style.display = 'none';
  }

  document.querySelectorAll('.vis-card').forEach(el => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.id === vis.id);
  });

  if (scrollToStage) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── Build Gemini Concept Twins Strip ─────────────────────────────────────────

function renderGeminiStrip() {
  const twins = ALL_WORSHIP_VISUALIZERS.filter(v => Boolean(v.conceptImage));
  geminiStripGrid.innerHTML = twins
    .map(
      v => `
      <div class="gemini-card" data-id="${v.id}">
        <img src="${v.conceptImage}" alt="${v.name}" loading="lazy" />
        <div class="gemini-card-caption">
          <span><strong>#${String(v.number).padStart(2, '0')}</strong> ${v.name}</span>
          <span style="color:var(--gold);">Load Twin ▶</span>
        </div>
      </div>
    `,
    )
    .join('');

  geminiStripGrid.querySelectorAll('.gemini-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.id;
      const found = ALL_WORSHIP_VISUALIZERS.find(v => v.id === id);
      if (found) {
        blendConceptPlate = true;
        blendConceptBtn.classList.add('active-toggle');
        selectVisualizer(found, true);
      }
    });
  });
}

// ── Build 72 Cards Grid with Live Animated Previews ──────────────────────────

interface CardPreviewEntry {
  vis: WorshipVisualizerDef;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  visible: boolean;
}

const cardPreviews: CardPreviewEntry[] = [];

const cardObserver = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.id;
      const item = cardPreviews.find(c => c.vis.id === id);
      if (item) item.visible = entry.isIntersecting;
    }
  },
  { rootMargin: '120px' },
);

function getFilteredVisualizers(): WorshipVisualizerDef[] {
  return ALL_WORSHIP_VISUALIZERS.filter(v => {
    if (activeFilter === 'gemini-twins' && !v.conceptImage) return false;
    if (activeFilter !== 'all' && activeFilter !== 'gemini-twins' && v.category !== activeFilter) return false;
    if (activeDirectorFilter !== 'all' && resolveDirector(v) !== activeDirectorFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const dir = resolveDirector(v);
      const hay = `${v.name} ${v.subtitle} ${v.description} ${v.subgenre} ${v.serviceUse} ${dir} ${resolveCouncilNote(v)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function rebuildGrid() {
  cardObserver.disconnect();
  cardPreviews.length = 0;
  cardsGrid.innerHTML = '';

  const list = getFilteredVisualizers();
  const dirSuffix = activeDirectorFilter === 'all' ? '' : ` · Directed by ${activeDirectorFilter}`;
  gridStatusLabel.textContent = `Showing ${list.length} of 72 Church, Praise, Hymnal & Scripture Visualizers${dirSuffix}`;

  for (const vis of list) {
    const card = document.createElement('div');
    card.className = `vis-card${vis.id === activeVis.id ? ' selected' : ''}`;
    card.dataset.id = vis.id;

    const dir = resolveDirector(vis);
    const dirMeta = COUNCIL_DIRECTOR_META[dir];
    const catLabel =
      vis.category === 'calm-lyric'
        ? 'Calm Worship Lyric'
        : vis.category === 'uptempo-lyric'
        ? 'Uptempo Praise & Hymnal'
        : 'Scripture Reading';

    const swatchesHtml = vis.palette
      .map(hex => `<span class="swatch" style="background:${hex}"></span>`)
      .join('');

    card.innerHTML = `
      <div class="card-canvas-wrap">
        <canvas width="384" height="216"></canvas>
        <div class="card-top-badges">
          <span class="badge ${vis.category}">#${String(vis.number).padStart(2, '0')} · ${catLabel}</span>
          <span class="badge" style="color:${dirMeta.color}; border-color:${dirMeta.color}44;">${dirMeta.icon} ${dirMeta.title}${vis.conceptImage ? ' ✦' : ''}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title">${vis.name}</div>
          <div class="swatches">${swatchesHtml}</div>
        </div>
        <div class="card-sub">${vis.subtitle}</div>
        <div class="card-use">⛪ ${vis.serviceUse}</div>
      </div>
    `;

    const canvas = card.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    cardPreviews.push({ vis, canvas, ctx, visible: false });
    cardObserver.observe(card);

    card.addEventListener('click', () => selectVisualizer(vis, true));
    cardsGrid.appendChild(card);
  }
}

// ── Build Lyric / Scripture Frame With Live Auto-Transcription & Override ────

function buildStageRenderContext(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vis: WorshipVisualizerDef,
  t: number,
  audio: WorshipAudioState,
) {
  const effectiveT = t + manualStepOffset * 4.2;

  if (vis.category === 'scripture-reading') {
    const sampleIdx = Math.floor(manualStepOffset) % SAMPLE_SCRIPTURES.length;
    const baseSample = SAMPLE_SCRIPTURES[sampleIdx];
    const scripture = customTextOverride.trim()
      ? { ...baseSample, text: customTextOverride.trim() }
      : baseSample;
    return {
      ctx,
      w,
      h,
      t: effectiveT,
      audio,
      params,
      visualizer: vis,
      scripture,
      scriptureWordIndex: matchedScriptureWordIdx,
    };
  }

  // Priority 1: Manual custom text override
  if (customTextOverride.trim()) {
    const customLines: LyricLine[] = [{ time: 0, text: customTextOverride.trim() }];
    return {
      ctx,
      w,
      h,
      t: effectiveT,
      audio,
      params,
      visualizer: vis,
      lyricFrame: buildWorshipLyricFrame(customLines, effectiveT % 5, w, h, {
        title: vis.name,
        artist: vis.subgenre,
        bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
      }),
    };
  }

  // Priority 1.5: Ambo Production Signal Chain (`readFeed('follow' | 'bus' | 'live')`)
  if (autoTranscribeEnabled && (audioMode === 'file' || audioMode === 'mic' || audioMode === 'system')) {
    const primaryFeed = readFeed(activeAmboClock);
    const fallbackBus = activeAmboClock !== 'bus' ? readFeed('bus') : null;
    const fallbackFollow = activeAmboClock !== 'follow' ? readFeed('follow') : null;
    const fallbackLive = activeAmboClock !== 'live' ? readFeed('live') : null;

    const chosenFeed =
      primaryFeed?.lines?.length
        ? primaryFeed
        : fallbackBus?.lines?.length
        ? fallbackBus
        : fallbackFollow?.lines?.length
        ? fallbackFollow
        : fallbackLive?.lines?.length
        ? fallbackLive
        : null;

    if (chosenFeed && chosenFeed.lines.length > 0) {
      const feedPos = chosenFeed.currentTime + manualStepOffset * 3.5;
      const frame = buildWorshipLyricFrame(chosenFeed.lines, feedPos, w, h, {
        title: chosenFeed.title || detectedSongTitle || 'Stage Signal Chain',
        artist: chosenFeed.artist || detectedSongArtist || `Stage ${activeAmboClock.toUpperCase()} Clock`,
        bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
      });
      if (typeof chosenFeed.activeIdx === 'number' && chosenFeed.activeIdx >= 0 && chosenFeed.activeIdx < frame.lines.length) {
        frame.idx = chosenFeed.activeIdx;
      }
      if (liveTranscriptReadout && w > 600) {
        const activeText = frame.lines[frame.idx]?.text || '';
        const nextText = frame.lines[frame.idx + 1]?.text || '';
        const adlibSuffix = chosenFeed.adlib ? `  ✦ [Adlib: ${chosenFeed.adlib}]` : '';
        if (activeText) {
          liveTranscriptReadout.textContent = `[Stage ${activeAmboClock.toUpperCase()}] ❝ ${activeText} ❞${nextText ? `  →  ${nextText}` : ''}${adlibSuffix}`;
        }
      }
      return {
        ctx,
        w,
        h,
        t: effectiveT,
        audio,
        params,
        visualizer: vis,
        lyricFrame: frame,
      };
    }
  }

  // Priority 2: Time-Synced Lyrics from Playing Audio File (Vocal Isolation + Chora Gemini / Whisper / LRCLIB)
  if (autoTranscribeEnabled && audioMode === 'file' && fileTimedLyrics.length > 0) {
    const busTime = audioBus.state().currentTime;
    const baseClock = fileAudioEl ? fileAudioEl.currentTime : busTime;
    const filePos = baseClock + manualStepOffset * 3.5;
    const frame = buildWorshipLyricFrame(fileTimedLyrics, filePos, w, h, {
      title: detectedSongTitle || 'Playing Worship Track',
      artist: detectedSongArtist || 'Stage Bus + Chora Gemini Sync',
      bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
    });
    if (liveTranscriptReadout && w > 600) {
      const activeText = frame.lines[frame.idx]?.text || '';
      const nextText = frame.lines[frame.idx + 1]?.text || '';
      if (activeText) {
        liveTranscriptReadout.textContent = `[Stage BUS] ❝ ${activeText} ❞${nextText ? `  →  ${nextText}` : ''}`;
      }
    }
    return {
      ctx,
      w,
      h,
      t: effectiveT,
      audio,
      params,
      visualizer: vis,
      lyricFrame: frame,
    };
  }

  // Priority 3: Live Auto-Transcribed Lyrics from Mic / System Audio / Stream
  if (autoTranscribeEnabled && liveTranscribedLines.length > 0) {
    const latestLine = liveTranscribedLines[liveTranscribedLines.length - 1];
    const livePos = latestLine.time + 0.8;
    return {
      ctx,
      w,
      h,
      t: effectiveT,
      audio,
      params,
      visualizer: vis,
      lyricFrame: buildWorshipLyricFrame(liveTranscribedLines, livePos, w, h, {
        title: detectedSongTitle || 'Live Auto-Transcription',
        artist: 'Stage Live Lyrics',
        bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
      }),
    };
  }

  // Priority 3.5: When live/file audio is playing and waiting for the first vocal words,
  // show a live listening status instead of unrelated demo lyrics!
  if (
    autoTranscribeEnabled &&
    (audioMode === 'file' || audioMode === 'mic' || audioMode === 'system')
  ) {
    const sf = getSongFollowState();
    const ext = getExtractState();
    const waitingText =
      sf.adlib ||
      sf.lastHeard ||
      (audioMode === 'file'
        ? ext.message || `Stage Signal Chain extracting vocals · ${detectedSongTitle || 'Audio Track'}…`
        : sf.status || `Stage ${activeAmboClock.toUpperCase()} listening for sung or spoken vocals…`);
    const waitingLines: LyricLine[] = [{ time: 0, text: waitingText }];
    return {
      ctx,
      w,
      h,
      t: effectiveT,
      audio,
      params,
      visualizer: vis,
      lyricFrame: buildWorshipLyricFrame(waitingLines, 0.5, w, h, {
        title: detectedSongTitle || 'Stage Vocal Signal Chain',
        artist: detectedSongArtist || `Stage ${activeAmboClock.toUpperCase()} · ${activeAmboTap.toUpperCase()} Tap`,
        bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
      }),
    };
  }

  // Priority 4: Default built-in worship / praise lyric progression (Procedural / Synth mode)
  const baseLyrics: LyricLine[] =
    vis.category === 'uptempo-lyric' ? UPTEMPO_PRAISE_LYRICS : CALM_WORSHIP_LYRICS;
  const loopDuration = vis.category === 'uptempo-lyric' ? 19.2 : 26.0;

  return {
    ctx,
    w,
    h,
    t: effectiveT,
    audio,
    params,
    visualizer: vis,
    lyricFrame: buildWorshipLyricFrame(baseLyrics, effectiveT % loopDuration, w, h, {
      title: vis.name,
      artist: vis.subgenre,
      bpm: vis.category === 'uptempo-lyric' ? 122 : 68,
    }),
  };
}

function safeRenderVisualizer(vis: WorshipVisualizerDef, rc: Parameters<WorshipVisualizerDef['render']>[0]) {
  const { ctx, w, h } = rc;
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    vis.render(rc);

    // Optional Concept Twin Plate Blend (only when explicitly toggled on for a Concept Twin)
    if (blendConceptPlate && vis.conceptImage) {
      const atmPlate = conceptImageCache.get(vis.conceptImage);
      if (atmPlate && atmPlate.complete && atmPlate.naturalWidth > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.28;
        ctx.drawImage(atmPlate, 0, 0, w, h);
        ctx.restore();
      }
    }
  } catch (err) {
    console.error(`[SanctuaryGallery] Render error in ${vis.id}:`, err);
  } finally {
    ctx.restore();
  }
}

// ── Main Animation Loop (100% Fault-Tolerant) ────────────────────────────────

let lastCardFrameTime = 0;

function animate(nowMs: number) {
  // Always schedule next frame first so an error can never halt the render loop
  requestAnimationFrame(animate);

  const t = nowMs * 0.001;
  const heroAudio = readLiveAudioState(t, activeVis.category);

  // Update Audio Meters
  if (mSwell) mSwell.style.width = `${Math.round(heroAudio.swell * 100)}%`;
  if (mVocal) mVocal.style.width = `${Math.round(heroAudio.vocal * 100)}%`;
  if (mPulse) mPulse.style.width = `${Math.round(heroAudio.pulse * 100)}%`;
  if (mHarmonic) mHarmonic.style.width = `${Math.round(heroAudio.harmonic * 100)}%`;
  if (mShimmer) mShimmer.style.width = `${Math.round(heroAudio.shimmer * 100)}%`;

  // Render Hero Stage
  const rc = buildStageRenderContext(
    heroCtx,
    heroCanvas.width,
    heroCanvas.height,
    activeVis,
    t,
    heroAudio,
  );
  safeRenderVisualizer(activeVis, rc);

  // Render visible Grid Cards at ~24fps
  if (nowMs - lastCardFrameTime > 42) {
    lastCardFrameTime = nowMs;
    for (const item of cardPreviews) {
      if (!item.visible) continue;
      const cardAudio = synthesizeWorshipAudioState(
        t + item.vis.number * 0.37,
        item.vis.category,
        params.reactivity,
      );
      const cardRc = buildStageRenderContext(
        item.ctx,
        item.canvas.width,
        item.canvas.height,
        item.vis,
        t + item.vis.number * 0.37,
        cardAudio,
      );
      safeRenderVisualizer(item.vis, cardRc);
    }
  }
}

// ── Event Listeners ──────────────────────────────────────────────────────────

document.querySelectorAll('#categoryTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#categoryTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = ((btn as HTMLElement).dataset.cat as any) || 'all';
    rebuildGrid();
    const list = getFilteredVisualizers();
    if (list.length && !list.some(v => v.id === activeVis.id)) {
      selectVisualizer(list[0], false);
    }
  });
});

// Populate counts & click listeners for the 6-Voice Art Director Council tabs (null-safe)
document.querySelectorAll('#directorTabs .tab-btn').forEach(btn => {
  const dirAttr = ((btn as HTMLElement).dataset.dir as CouncilDirector | 'all') || 'all';
  if (dirAttr !== 'all') {
    const meta = COUNCIL_DIRECTOR_META[dirAttr];
    if (meta) {
      const count = ALL_WORSHIP_VISUALIZERS.filter(v => resolveDirector(v) === dirAttr).length;
      btn.innerHTML = `${meta.icon} ${meta.title} <span class="count-pill">${count}</span>`;
    }
  }
  btn.addEventListener('click', () => {
    document.querySelectorAll('#directorTabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeDirectorFilter = dirAttr;
    if (councilEthosReadout) {
      if (dirAttr === 'all') {
        councilEthosReadout.textContent =
          'Filter the 72 works by the Art Director Council voice that directed their geometry, optical FX, palette, and typography.';
      } else {
        const meta = COUNCIL_DIRECTOR_META[dirAttr];
        if (meta) {
          councilEthosReadout.textContent = `${meta.icon} ${meta.title}: ${meta.ethos}`;
        }
      }
    }
    rebuildGrid();
    const list = getFilteredVisualizers();
    if (list.length && !list.some(v => v.id === activeVis.id)) {
      selectVisualizer(list[0], false);
    }
  });
});

document.getElementById('searchInput')?.addEventListener('input', e => {
  searchQuery = (e.target as HTMLInputElement).value;
  rebuildGrid();
});

document.getElementById('prevBtn')?.addEventListener('click', () => {
  const list = getFilteredVisualizers();
  const idx = list.findIndex(v => v.id === activeVis.id);
  const prev = list[(idx - 1 + list.length) % list.length] || ALL_WORSHIP_VISUALIZERS[0];
  selectVisualizer(prev, false);
});

document.getElementById('nextBtn')?.addEventListener('click', () => {
  const list = getFilteredVisualizers();
  const idx = list.findIndex(v => v.id === activeVis.id);
  const next = list[(idx + 1) % list.length] || ALL_WORSHIP_VISUALIZERS[0];
  selectVisualizer(next, false);
});

compareConceptBtn?.addEventListener('click', () => {
  splitCompare = !splitCompare;
  compareConceptBtn.classList.toggle('active-toggle', splitCompare);
  conceptCompareOverlay.style.display = splitCompare && activeVis.conceptImage ? 'block' : 'none';
});

blendConceptBtn?.addEventListener('click', () => {
  blendConceptPlate = !blendConceptPlate;
  blendConceptBtn.classList.toggle('active-toggle', blendConceptPlate);
});

document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
  const wrap = document.getElementById('stageContainer');
  if (!document.fullscreenElement) wrap?.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// ── Audio Sources + Automatic Live Transcription Wiring ──────────────────────

const synthBtn = document.getElementById('synthAudioBtn') as HTMLButtonElement;
const micBtn = document.getElementById('micAudioBtn') as HTMLButtonElement;
const sysAudioBtn = document.getElementById('sysAudioBtn') as HTMLButtonElement;
const filePlayerWrap = document.getElementById('filePlayerWrap') as HTMLDivElement;
const fileTrackName = document.getElementById('fileTrackName') as HTMLSpanElement;
const filePlayPauseBtn = document.getElementById('filePlayPauseBtn') as HTMLButtonElement;
const fileSeekInput = document.getElementById('fileSeekInput') as HTMLInputElement;

synthBtn?.addEventListener('click', () => {
  if (audioMode === 'synth') {
    stopActiveAudioSources();
    audioMode = 'procedural';
    synthBtn.textContent = '▶ Play Worship Synth';
    setAsrStatus('Ready — play an audio file, share tab audio, or enable mic', '');
  } else {
    micBtn.classList.remove('active-toggle');
    sysAudioBtn?.classList.remove('active-toggle');
    startWorshipSynth();
    synthBtn.textContent = '⏹ Stop Worship Synth';
  }
});

function syncTapButtonUI(tap: 'playlist' | 'program' | 'mic' | 'system') {
  activeAmboTap = tap;
  document.querySelectorAll('#amboTapBtns .btn').forEach(b => {
    b.classList.toggle('active-toggle', (b as HTMLElement).dataset.tap === tap);
  });
}

function syncClockButtonUI(clock: LyricSourceId) {
  activeAmboClock = clock;
  document.querySelectorAll('#amboClockBtns .btn').forEach(b => {
    b.classList.toggle('active-toggle', (b as HTMLElement).dataset.clock === clock);
  });
}

micBtn?.addEventListener('click', async () => {
  try {
    ensureAudioContext();
    amboAudio.ensure();
    stopActiveAudioSources();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 2,
      },
    });
    activeMediaStream = stream;
    const src = audioCtx!.createMediaStreamSource(stream);
    src.connect(analyser!);
    audioMode = 'mic';
    micBtn.classList.add('active-toggle');
    sysAudioBtn?.classList.remove('active-toggle');
    synthBtn.textContent = '▶ Play Worship Synth';
    syncTapButtonUI('mic');

    // Pipe microphone directly into Ambo's SongFollower + LiveLyrics + LiveTranscriber signal chain
    setTypoTextDemand(true);
    setSongFollowSource({ kind: 'mic' });
    setLiveLyricsPrefs({ source: 'mic' });
    if (autoTranscribeEnabled) {
      void startSongFollow();
      if (activeAmboClock === 'live') void startLiveLyrics();
      await attachAutoTranscriber({ kind: 'mic' }, 'Microphone (Stage Signal Chain)');
    }
  } catch {
    setAsrStatus('Microphone permission was not granted', 'Error');
  }
});

sysAudioBtn?.addEventListener('click', async () => {
  try {
    ensureAudioContext();
    amboAudio.ensure();
    stopActiveAudioSources();
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as any,
      video: true,
    });
    displayStream.getVideoTracks().forEach(t => t.stop());
    if (!displayStream.getAudioTracks().length) {
      setAsrStatus('Be sure to check "Share tab/system audio" in the dialog', 'No Audio');
      return;
    }
    activeMediaStream = displayStream;
    const src = audioCtx!.createMediaStreamSource(displayStream);
    src.connect(analyser!);
    audioMode = 'system';
    sysAudioBtn.classList.add('active-toggle');
    micBtn.classList.remove('active-toggle');
    synthBtn.textContent = '▶ Play Worship Synth';
    syncTapButtonUI('system');

    setTypoTextDemand(true);
    await attachAutoTranscriber({ kind: 'stream', stream: displayStream }, 'System / Tab Audio (Stage Chain)');
  } catch {
    setAsrStatus('System/tab audio capture cancelled', '');
  }
});

// Keep Ambo AudioBus transport bar synced with audioBus.state()
audioBus.subscribe(() => {
  if (audioMode !== 'file') return;
  const st = audioBus.state();
  if (filePlayPauseBtn) {
    filePlayPauseBtn.textContent = st.playing ? '⏸ Pause' : '▶ Play';
  }
  if (fileSeekInput && st.duration > 0) {
    fileSeekInput.value = String((st.currentTime / st.duration) * 100);
  }
});

document.getElementById('audioFileInput')?.addEventListener('change', async e => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  ensureAudioContext();
  amboAudio.ensure();
  stopActiveAudioSources();

  const rawBuffer = await file.arrayBuffer();
  const tags = readId3TagsFromBuffer(rawBuffer);

  // 1. Register track into Ambo's exact `audioBus` (`playlist` channel strip -> SpectraEQ -> MasteringChain -> Limiter -> viz)
  const tracks = registerLocalFiles([file]);
  if (tracks[0]) {
    if (tags.title) tracks[0].title = tags.title;
    if (tags.artist) tracks[0].artist = tags.artist;
    currentAmboTrack = tracks[0];
  }
  audioBus.setRepeat('one');
  audioBus.playQueue(tracks, 0);

  audioMode = 'file';
  micBtn.classList.remove('active-toggle');
  sysAudioBtn?.classList.remove('active-toggle');
  synthBtn.textContent = '▶ Play Worship Synth';
  if (activeAmboTap === 'mic' || activeAmboTap === 'system') {
    syncTapButtonUI('playlist');
  }

  if (filePlayerWrap && fileTrackName) {
    filePlayerWrap.style.display = 'block';
    fileTrackName.textContent = currentAmboTrack?.title || file.name;
    filePlayPauseBtn.textContent = '⏸ Pause';
  }

  // 2. Activate Ambo's TypoTextDriver, SongFollower (`'follow'` clock) & LiveLyrics (`'live'` clock) on the `'playlist'` / `'program'` tap
  setTypoTextDemand(true);
  const listenTap: FollowListenSource =
    activeAmboTap === 'program' ? { kind: 'program' } : { kind: 'playlist' };
  setSongFollowSource(listenTap);
  setLiveLyricsPrefs({ source: activeAmboTap === 'program' ? 'program' : 'playlist' });
  if (autoTranscribeEnabled) {
    void startSongFollow();
    if (activeAmboClock === 'live') void startLiveLyrics();
  }

  // 3. Decode AudioBuffer and feed Ambo's `extractLyricsForTrack(track, buffer)` (`vocalLyricExtractor.ts`)
  //    which populates `getExtractedLyrics(track)` consumed by `lyricFeed.ts` (`'bus'` and `'follow'` clocks)!
  try {
    const decodeCtx = amboAudio.ctx || audioCtx!;
    const decoded = await decodeCtx.decodeAudioData(rawBuffer.slice(0));
    if (currentAmboTrack) {
      void extractLyricsForTrack(currentAmboTrack, decoded);
    }
  } catch (err) {
    console.warn('[SanctuaryGallery] Stage extractLyricsForTrack decode error:', err);
  }

  // 4. Also run parallel playhead-first Chora Gemini / UVR / Whisper sync into `fileTimedLyrics`
  const playlistStream = amboAudio.channelStream('playlist') || undefined;
  void extractAndSyncAudioFileLyrics(file, rawBuffer, playlistStream);
});

filePlayPauseBtn?.addEventListener('click', () => {
  if (audioMode === 'file') {
    audioBus.toggle();
    const st = audioBus.state();
    filePlayPauseBtn.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    return;
  }
  if (!fileAudioEl) return;
  if (fileAudioEl.paused) {
    void fileAudioEl.play();
    filePlayPauseBtn.textContent = '⏸ Pause';
  } else {
    fileAudioEl.pause();
    filePlayPauseBtn.textContent = '▶ Play';
  }
});

fileSeekInput?.addEventListener('input', () => {
  if (audioMode === 'file') {
    const st = audioBus.state();
    if (st.duration > 0) {
      audioBus.seek((parseFloat(fileSeekInput.value) / 100) * st.duration);
    }
    return;
  }
  if (!fileAudioEl || !fileAudioEl.duration) return;
  fileAudioEl.currentTime = (parseFloat(fileSeekInput.value) / 100) * fileAudioEl.duration;
});

// Ambo Lyric Clock Buttons (`follow` | `bus` | `live`)
document.querySelectorAll('#amboClockBtns .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const clock = ((btn as HTMLElement).dataset.clock as LyricSourceId) || 'follow';
    syncClockButtonUI(clock);
    if (clock === 'live' && autoTranscribeEnabled) {
      void startLiveLyrics();
    } else if (clock === 'follow' && autoTranscribeEnabled) {
      void startSongFollow();
    }
    setAsrStatus(
      `Switched to Stage '${clock.toUpperCase()}' Lyric Clock`,
      `Stage ${clock.toUpperCase()}`,
    );
  });
});

// Ambo Listen Tap Buttons (`playlist` | `program` | `mic` | `system`)
document.querySelectorAll('#amboTapBtns .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tap = ((btn as HTMLElement).dataset.tap as 'playlist' | 'program' | 'mic' | 'system') || 'playlist';
    syncTapButtonUI(tap);
    if (tap === 'mic') {
      micBtn?.click();
      return;
    }
    if (tap === 'system') {
      sysAudioBtn?.click();
      return;
    }
    amboAudio.ensure();
    setSongFollowSource({ kind: tap });
    setLiveLyricsPrefs({ source: tap });
    if (autoTranscribeEnabled) {
      void startSongFollow();
      if (activeAmboClock === 'live') void startLiveLyrics();
    }
    setAsrStatus(
      `Listening on Stage '${tap}' tap (${tap === 'program' ? 'amboAudio.programStream()' : "amboAudio.channelStream('playlist')"})`,
      `Stage ${tap.toUpperCase()}`,
    );
  });
});

// Ambo SongFollower Capture & Save New Song Button
document.getElementById('amboCaptureSongBtn')?.addEventListener('click', async () => {
  const cap = getCaptureState();
  if (cap.active) {
    const saved = stopCapture(true);
    setAsrStatus(
      saved
        ? `Saved "${saved.title}" (${saved.lines.length} lines) to Stage SongLibrary & locked SongFollower!`
        : 'Capture stopped (no vocal lines heard yet)',
      saved ? 'Saved Song' : 'Stage Chain',
    );
  } else {
    amboAudio.ensure();
    const tapSource: FollowListenSource =
      activeAmboTap === 'mic'
        ? { kind: 'mic' }
        : activeAmboTap === 'system'
        ? { kind: 'system' }
        : activeAmboTap === 'program'
        ? { kind: 'program' }
        : { kind: 'playlist' };
    await startCapture(detectedSongTitle || 'Captured Worship Song', tapSource);
    setAsrStatus(
      `Capturing live vocals on '${activeAmboTap}' tap into new Stage SongLibrary entry…`,
      'Stage Capture',
    );
  }
});

// Ambo Adlib Overlay Toggle Button
const amboAdlibBtn = document.getElementById('amboAdlibBtn') as HTMLButtonElement | null;
amboAdlibBtn?.addEventListener('click', () => {
  const cur = getSongFollowPrefs().showAdlibs;
  const next = !cur;
  setSongFollowPrefs({ showAdlibs: next });
  amboAdlibBtn.textContent = `Adlibs: ${next ? 'ON' : 'OFF'}`;
  amboAdlibBtn.classList.toggle('active-toggle', next);
});

const autoTranscribeBtn = document.getElementById('autoTranscribeBtn') as HTMLButtonElement;
autoTranscribeBtn?.addEventListener('click', () => {
  autoTranscribeEnabled = !autoTranscribeEnabled;
  autoTranscribeBtn.textContent = `Stage Chain: ${autoTranscribeEnabled ? 'ON' : 'OFF'}`;
  autoTranscribeBtn.classList.toggle('active-toggle', autoTranscribeEnabled);
  if (!autoTranscribeEnabled) {
    stopLiveTranscriber();
    stopSongFollow();
    stopLiveLyrics();
    setTypoTextDemand(false);
    setAsrStatus('Stage Chain paused (using built-in lyric progression)', '');
  } else {
    setTypoTextDemand(true);
    void startSongFollow();
    if (activeAmboClock === 'live') void startLiveLyrics();
    setAsrStatus(`Stage Chain active (${activeAmboClock.toUpperCase()} clock · ${activeAmboTap} tap)`, 'Stage Chain');
  }
});

document.getElementById('clearTranscriptBtn')?.addEventListener('click', () => {
  liveLineBuilder.reset();
  liveTranscribedLines = [];
  fileTimedLyrics = [];
  detectedSongTitle = '';
  matchedScriptureWordIdx = undefined;
  if (liveTranscriptReadout) {
    liveTranscriptReadout.textContent = 'Transcript cleared — listening for new words…';
  }
});

const toggleTextBtn = document.getElementById('toggleTextBtn') as HTMLButtonElement;
toggleTextBtn?.addEventListener('click', () => {
  params.showText = !params.showText;
  toggleTextBtn.textContent = `Aa Text: ${params.showText ? 'ON' : 'OFF'}`;
  toggleTextBtn.classList.toggle('active-toggle', params.showText);
});

// Sliders (Lighting + Optical FX)
const bindSlider = (id: string, key: keyof WorshipRenderParams) => {
  const el = document.getElementById(id) as HTMLInputElement | null;
  el?.addEventListener('input', () => {
    (params[key] as number) = parseFloat(el.value);
  });
};
bindSlider('paramReactivity', 'reactivity');
bindSlider('paramWarmth', 'warmth');
bindSlider('paramMotion', 'motion');
bindSlider('paramTextSafe', 'textSafe');
bindSlider('paramLightLeaks', 'lightLeaks');
bindSlider('paramBokehFlare', 'bokehFlare');
bindSlider('paramTextureGrain', 'textureGrain');
bindSlider('paramColorPunch', 'colorPunch');

function syncSlidersToParams() {
  const pairs: Array<[string, keyof WorshipRenderParams]> = [
    ['paramReactivity', 'reactivity'],
    ['paramWarmth', 'warmth'],
    ['paramMotion', 'motion'],
    ['paramTextSafe', 'textSafe'],
    ['paramLightLeaks', 'lightLeaks'],
    ['paramBokehFlare', 'bokehFlare'],
    ['paramTextureGrain', 'textureGrain'],
    ['paramColorPunch', 'colorPunch'],
  ];
  for (const [id, key] of pairs) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && typeof params[key] === 'number') {
      el.value = String(params[key]);
    }
  }
}

// Cinema Optical Look Presets
const OPTICAL_PRESETS: Record<string, Partial<WorshipRenderParams>> = {
  anamorphic: {
    lightLeaks: 0.76,
    bokehFlare: 0.85,
    textureGrain: 0.56,
    colorPunch: 0.84,
    warmth: 0.52,
    reactivity: 0.78,
  },
  kodak35: {
    lightLeaks: 0.96,
    bokehFlare: 0.72,
    textureGrain: 0.82,
    colorPunch: 0.78,
    warmth: 0.74,
    reactivity: 0.72,
  },
  prism: {
    lightLeaks: 0.84,
    bokehFlare: 0.95,
    textureGrain: 0.42,
    colorPunch: 0.94,
    warmth: 0.42,
    reactivity: 0.85,
  },
  cathedral: {
    lightLeaks: 0.62,
    bokehFlare: 0.78,
    textureGrain: 0.68,
    colorPunch: 0.74,
    warmth: 0.82,
    reactivity: 0.68,
  },
  concert: {
    lightLeaks: 0.88,
    bokehFlare: 0.92,
    textureGrain: 0.50,
    colorPunch: 0.98,
    warmth: 0.58,
    reactivity: 0.94,
  },
};

document.querySelectorAll('#opticalPresets .preset-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#opticalPresets .preset-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const key = (btn as HTMLElement).dataset.preset || 'anamorphic';
    const preset = OPTICAL_PRESETS[key];
    if (preset) {
      Object.assign(params, preset);
      syncSlidersToParams();
    }
  });
});

// Text Override & Stepper
const customTextInput = document.getElementById('customTextInput') as HTMLInputElement;
customTextInput?.addEventListener('input', () => {
  customTextOverride = customTextInput.value;
});

document.getElementById('stepLyricBtn')?.addEventListener('click', () => {
  manualStepOffset += 1;
});

document.getElementById('resetTextBtn')?.addEventListener('click', () => {
  customTextOverride = '';
  if (customTextInput) customTextInput.value = '';
  manualStepOffset = 0;
});

window.addEventListener('keydown', e => {
  if (document.activeElement === customTextInput || document.activeElement?.id === 'searchInput') return;
  if (e.key === 'ArrowRight') document.getElementById('nextBtn')?.click();
  if (e.key === 'ArrowLeft') document.getElementById('prevBtn')?.click();
  if (e.key === ' ') {
    e.preventDefault();
    manualStepOffset += 1;
  }
});

// Initialize Gallery
renderGeminiStrip();
rebuildGrid();
selectVisualizer(ALL_WORSHIP_VISUALIZERS[0], false);
requestAnimationFrame(animate);
