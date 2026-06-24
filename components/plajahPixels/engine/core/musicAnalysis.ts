// musicAnalysis.ts — precomputed, stored music analysis (the deterministic-audio
// idea). Instead of FFT-ing the song every frame at render time (and instead of a
// live, varies-every-time AnalyserNode), we analyze the track ONCE — a per-frame
// spectrum + waveform on a fixed grid — cache it (OPFS, content-addressed), and read
// it back with analysisAt(t). That single replayable artifact drives the visualizer
// identically live and on export (determinism), feeds a fake analyser so milkdrop
// becomes frame-steppable, and removes per-frame FFT cost from the render.
//
// Cora already stores BEATS/tempo/onsets at upload (the auto-cut grid); this adds the
// spectral envelope that drives the visuals. Server-side persistence (cross-device)
// is the next step; this computes + caches client-side.

import { OfflineAudio } from './offlineAudio';

export interface MusicAnalysis {
  fps: number;        // analysis grid rate
  frames: number;
  bins: number;       // spectrum bins per frame
  waveLen: number;    // waveform samples per frame
  duration: number;
  freq: Uint8Array;   // frames * bins  (AnalyserNode byte-frequency format)
  wave: Uint8Array;   // frames * waveLen (byte-time-domain, 128 = silence)
}

/** Analyze a decoded buffer into a stored per-frame envelope (avg-pooled spectrum). */
export function computeAnalysis(buffer: AudioBuffer, fps = 60, bins = 128, waveLen = 128): MusicAnalysis {
  const off = new OfflineAudio(buffer);
  const frames = Math.max(1, Math.ceil(buffer.duration * fps));
  const freq = new Uint8Array(frames * bins);
  const wave = new Uint8Array(frames * waveLen);
  for (let i = 0; i < frames; i++) {
    const a = off.sample(i / fps);                // freq ~1024, wave ~2048
    const fStep = a.freq.length / bins, wStep = a.wave.length / waveLen;
    for (let b = 0; b < bins; b++) {
      const s = Math.floor(b * fStep), e = Math.max(s + 1, Math.floor((b + 1) * fStep));
      let sum = 0; for (let k = s; k < e; k++) sum += a.freq[k];
      freq[i * bins + b] = sum / (e - s);          // avg-pool keeps energy
    }
    for (let w = 0; w < waveLen; w++) wave[i * waveLen + w] = a.wave[Math.floor(w * wStep)];
  }
  return { fps, frames, bins, waveLen, duration: buffer.duration, freq, wave };
}

/** Frequency + waveform byte arrays at time t (nearest grid frame). */
export function analysisAt(a: MusicAnalysis, t: number): { freq: Uint8Array; wave: Uint8Array } {
  const i = Math.max(0, Math.min(a.frames - 1, Math.round(t * a.fps)));
  return { freq: a.freq.subarray(i * a.bins, (i + 1) * a.bins), wave: a.wave.subarray(i * a.waveLen, (i + 1) * a.waveLen) };
}

// ── serialization + OPFS cache (content-addressed) ──────────────────────────
const DIR = 'plajah-pixels-analysis';

function serialize(a: MusicAnalysis): Blob {
  const meta = new TextEncoder().encode(JSON.stringify({ fps: a.fps, frames: a.frames, bins: a.bins, waveLen: a.waveLen, duration: a.duration }));
  const head = new Uint8Array(4); new DataView(head.buffer).setUint32(0, meta.length, false);
  return new Blob([head, meta, a.freq, a.wave], { type: 'application/octet-stream' });
}
async function deserialize(blob: Blob): Promise<MusicAnalysis | null> {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const metaLen = new DataView(buf.buffer).getUint32(0, false);
    const meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + metaLen)));
    let o = 4 + metaLen;
    const fLen = meta.frames * meta.bins, wLen = meta.frames * meta.waveLen;
    const freq = buf.slice(o, o + fLen); o += fLen;
    const wave = buf.slice(o, o + wLen);
    if (freq.length !== fLen || wave.length !== wLen) return null;
    return { ...meta, freq, wave };
  } catch { return null; }
}

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try { const root = await (navigator.storage as any)?.getDirectory?.(); return root ? await root.getDirectoryHandle(DIR, { create: true }) : null; } catch { return null; }
}
async function hash(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const mem = new Map<string, MusicAnalysis>();

/** Get the analysis for an audio file — from memory, OPFS, or computed + cached. */
export async function getAnalysis(audioBytes: ArrayBuffer, buffer: AudioBuffer): Promise<MusicAnalysis> {
  const key = (await hash(audioBytes)) + '.an';
  if (mem.has(key)) return mem.get(key)!;
  const dir = await opfsDir();
  if (dir) {
    try { const fh = await dir.getFileHandle(key); const a = await deserialize(await fh.getFile()); if (a) { mem.set(key, a); return a; } } catch { /* miss */ }
  }
  const analysis = computeAnalysis(buffer);
  mem.set(key, analysis);
  if (dir) { try { const fh = await dir.getFileHandle(key, { create: true }); const ws = await (fh as any).createWritable(); await ws.write(serialize(analysis)); await ws.close(); } catch { /* */ } }
  return analysis;
}
