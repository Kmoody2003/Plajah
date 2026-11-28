// Browser I/O for Smart Sync: WebAudio decoding, the local Whisper engine (Ambo ASR — on-device, no upload),
// video-element frame grabs, and the AI lanes Fabula already uses for vision and text.

import { decodePcm } from './audioAlign';
import { chunksToWords } from './transcriptAlign';
import type { FrameImage, SmartSyncIO } from './pipeline';
import type { SyncAngle, TimedWord } from './types';

const pcmCache = new Map<string, Float32Array | null>();

function videoFor(url: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url; v.playsInline = true;
    const t = setTimeout(() => rej(new Error('video load timeout')), 15000);
    v.onloadedmetadata = () => { clearTimeout(t); res(v); };
    v.onerror = () => { clearTimeout(t); rej(new Error('video load failed')); };
  });
}
const vids = new Map<string, Promise<HTMLVideoElement>>();
const getVideo = (url: string) => { let p = vids.get(url); if (!p) { p = videoFor(url); vids.set(url, p); p.catch(() => vids.delete(url)); } return p; };

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const target = Math.max(0, Math.min((v.duration || t) - 0.05, t));
    if (Math.abs(v.currentTime - target) < 0.004) { res(); return; }
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
    const to = setTimeout(done, 4000);
    v.addEventListener('seeked', done);
    v.currentTime = target;
  });
}

export interface BrowserIOOptions {
  vision?: (images: FrameImage[], prompt: string) => Promise<unknown>;
  llm?: (system: string, user: string) => Promise<unknown>;
  onProgress?: SmartSyncIO['progress'];
  isCancelled?: () => boolean;
}

export function browserIO(o: BrowserIOOptions = {}): SmartSyncIO {
  let asr: Promise<any> | null = null;
  const engine = () => (asr ||= import('../../ambo/asrEngine').then((m) => m.ensureBestAsr()));
  return {
    async pcm(a: SyncAngle, rate: number) {
      if (!a.url) return null;
      const key = `${a.url}@${rate}`;
      if (pcmCache.has(key)) return pcmCache.get(key)!;
      const p = await decodePcm(a.url, rate);
      // Keep at most a few decoded tracks around — long programs are big.
      if (pcmCache.size > 6) pcmCache.delete(pcmCache.keys().next().value as string);
      pcmCache.set(key, p);
      return p;
    },
    async transcribe(pcm16k: Float32Array): Promise<TimedWord[]> {
      if (pcm16k.length < 16000 * 0.5) return [];
      // Skip near-silent windows (a held chord, a pause) — saves a pass and avoids hallucinated words.
      let e = 0; for (let i = 0; i < pcm16k.length; i += 8) e += pcm16k[i] * pcm16k[i];
      if (e / (pcm16k.length / 8) < 1e-6) return [];
      const eng = await engine();
      const r = await eng.transcribe(pcm16k, { timestamps: true, background: true });
      const chunks = (r?.chunks || []).map((c: any) => ({ text: c.text, start: Array.isArray(c.timestamp) ? c.timestamp[0] : c.start, end: Array.isArray(c.timestamp) ? c.timestamp[1] : c.end }));
      if (!chunks.length && r?.text) return chunksToWords([{ text: r.text, start: 0, end: pcm16k.length / 16000 }]);
      return chunksToWords(chunks);
    },
    async frame(a: SyncAngle, t: number) {
      if (!a.url || a.kind !== 'video') return null;
      try {
        const v = await getVideo(a.url); await seek(v, t);
        const c = document.createElement('canvas');
        const w = Math.min(640, v.videoWidth || 640); c.width = w; c.height = Math.round(w * ((v.videoHeight || 360) / (v.videoWidth || 640)));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        return { data: c.toDataURL('image/jpeg', 0.8).split(',')[1], media: 'image/jpeg' };
      } catch { return null; }
    },
    async thumbs(a: SyncAngle, t0: number, t1: number, fps: number) {
      if (!a.url || a.kind !== 'video') return [];
      try {
        const v = await getVideo(a.url);
        const c = document.createElement('canvas'); c.width = 48; c.height = 27;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        const out: Uint8ClampedArray[] = [];
        for (let t = Math.max(0, t0); t <= t1 && t < (v.duration || Infinity); t += 1 / fps) {
          if (o.isCancelled?.()) break;
          await seek(v, t);
          g.drawImage(v, 0, 0, 48, 27);
          const d = g.getImageData(0, 0, 48, 27).data, grey = new Uint8ClampedArray(48 * 27);
          for (let i = 0; i < grey.length; i++) grey[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
          out.push(grey);
        }
        return out;
      } catch { return []; }
    },
    vision: o.vision,
    llm: o.llm,
    progress: o.onProgress,
    cancelled: o.isCancelled,
  };
}

export function releaseSmartSyncMedia() { pcmCache.clear(); vids.clear(); }
