/**
 * Melos Audio Import & Analysis Helper
 *
 * Handles drag-and-drop and file-picker audio ingestion across Pad, Tracklist,
 * Arrange, and Board rooms:
 * - Creates an instant playable object URL so audio works immediately (online, offline, or demo)
 * - Decodes via Web Audio + caches in content-addressed OPFS (so Chora Mastering Desk & Chora Studio have it ready)
 * - Extracts real durationSec and SongFeel metrics (energy, brightness, density, estimated BPM)
 *   so ArrangeRoom's EnergyCurve and PadRoom's Feel Breakdown populate automatically
 * - Optionally backs up to Firebase Storage in the background when signed in
 */

import { decodeCtx } from '../../services/melos/beats/masterProject';
import { ingestSample, backupToLocker } from '../../services/melos/beats/sampleStore';
import type { SampleRef } from '../../services/melos/beats/grooveDoc';
import type { SongFeel } from '../../services/melosService';

export interface IngestedMelosAudio {
  title: string;
  url: string;
  durationSec: number;
  feel: SongFeel;
  sampleRef?: SampleRef;
  fileName: string;
  mimeType: string;
}

const AUDIO_EXT_RE = /\.(mp3|wav|flac|ogg|m4a|aac|webm|aiff|aif|opus|wma)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true;
  return AUDIO_EXT_RE.test(file.name || '');
}

export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return VIDEO_EXT_RE.test(file.name || '');
}

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXT_RE.test(file.name || '');
}

export function cleanMediaTitle(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/^\d+[\s._-]+/, '') // strip leading track numbers like "01 - "
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled Track'
  );
}

/**
 * Compute lightweight SongFeel metrics (energy, brightness, density, approximate BPM)
 * directly from a decoded AudioBuffer so Arrange's EnergyCurve and Pad's Feel card light up.
 */
export function analyzeBufferFeel(buffer: AudioBuffer): SongFeel {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate || 44100;
  const len = ch.length;
  if (len === 0) {
    return { energy: 0.5, brightness: 0.5, density: 0.5, analyzedAt: Date.now() };
  }

  const stride = Math.max(1, Math.floor(len / 48000));
  let sumSq = 0;
  let count = 0;
  let zeroCrossings = 0;
  let prev = ch[0] || 0;

  for (let i = 0; i < len; i += stride) {
    const s = ch[i];
    sumSq += s * s;
    if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zeroCrossings++;
    prev = s;
    count++;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, count));
  // Map typical musical RMS (0.03 .. 0.35) into a perceptual 0.12 .. 0.96 energy curve
  const energy = Math.max(0.12, Math.min(0.96, Number((Math.pow(Math.min(1, rms * 3.2), 0.65)).toFixed(2))));

  const zcrPerSec = (zeroCrossings * stride) / Math.max(1, buffer.duration);
  const brightness = Math.max(0.1, Math.min(0.95, Number(Math.min(1, zcrPerSec / 3500).toFixed(2))));

  // Frame-level activity density + onset-based tempo estimate
  const hop = Math.max(256, Math.floor(sr * 0.05)); // 50ms frames (20 Hz envelope)
  const env: number[] = [];
  let activeFrames = 0;
  for (let start = 0; start + hop <= len; start += hop) {
    let fSq = 0;
    const step = Math.max(1, Math.floor(hop / 64));
    let n = 0;
    for (let j = start; j < start + hop; j += step) {
      fSq += ch[j] * ch[j];
      n++;
    }
    const fRms = Math.sqrt(fSq / Math.max(1, n));
    env.push(fRms);
    if (fRms > rms * 0.35) activeFrames++;
  }

  const density = env.length
    ? Math.max(0.15, Math.min(0.95, Number((activeFrames / env.length).toFixed(2))))
    : 0.5;

  // Simple autocorrelation on positive envelope flux for BPM between 68 and 165
  let bpm = 110;
  if (env.length > 60) {
    const flux = env.map((v, i) => (i > 0 ? Math.max(0, v - env[i - 1]) : 0));
    const fps = sr / hop; // ~20 frames/sec
    let bestLag = Math.round((fps * 60) / 110);
    let bestScore = -1;
    const minLag = Math.max(4, Math.round((fps * 60) / 165));
    const maxLag = Math.min(Math.floor(flux.length / 2), Math.round((fps * 60) / 68));
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = 0; i + lag < flux.length; i++) {
        score += flux[i] * flux[i + lag];
      }
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    bpm = Math.round((fps * 60) / Math.max(1, bestLag));
    if (bpm < 68) bpm *= 2;
    if (bpm > 168) bpm = Math.round(bpm / 2);
  }

  return {
    bpm,
    energy,
    brightness,
    density,
    analyzedAt: Date.now(),
  };
}

/**
 * Fallback duration probe via HTMLAudioElement when Web Audio decode fails on an exotic codec.
 */
function probeAudioElementDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (dur: number) => {
      audio.removeAttribute('src');
      resolve(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
    };
    const timer = setTimeout(() => done(0), 4000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    audio.src = url;
  });
}

/**
 * Ingest an audio File into Melos:
 * 1. Creates an instant blob URL for immediate playback & cross-room use
 * 2. Decodes & stores in OPFS via ingestSample (so Mastering Desk & Chora Studio have the SampleRef)
 * 3. Computes SongFeel metrics (energy, brightness, density, bpm)
 */
export async function ingestMelosAudioFile(
  file: File,
  onLockerBackup?: (lockerUrl: string) => void
): Promise<IngestedMelosAudio> {
  const title = cleanMediaTitle(file.name);
  const blobUrl = URL.createObjectURL(file);

  try {
    const ctx = decodeCtx();
    const ingested = await ingestSample(file, title, ctx);
    if (ingested) {
      const durationSec = Math.max(1, Math.round(ingested.buffer.duration));
      const feel = analyzeBufferFeel(ingested.buffer);
      void backupToLocker(ingested.ref).then((lockerUrl) => {
        if (lockerUrl) {
          ingested.ref.lockerUrl = lockerUrl;
          onLockerBackup?.(lockerUrl);
        }
      });
      return {
        title,
        url: blobUrl,
        durationSec,
        feel,
        sampleRef: ingested.ref,
        fileName: file.name,
        mimeType: file.type || 'audio/wav',
      };
    }
  } catch (e) {
    console.warn('[melos] Web Audio ingest fallback for', file.name, e);
  }

  const durationSec = await probeAudioElementDuration(blobUrl);
  return {
    title,
    url: blobUrl,
    durationSec,
    feel: { energy: 0.5, brightness: 0.5, density: 0.5, bpm: 110, analyzedAt: Date.now() },
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
  };
}
