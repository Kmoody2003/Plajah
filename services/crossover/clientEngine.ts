import type {
  ConvertProgress,
  ConvertResult,
  MediaProbe,
  Recipe,
  SourceFile,
} from './types';
import { AUDIO_CODECS, IMAGE_FORMATS } from './formats';
import type { BackendEngine } from './engine';
import { probeVideoFrameRate } from '../videoFrameRate';

// ─────────────────────────────────────────────────────────────────────────
// Client backend — instant, private, zero-cost conversions that run entirely
// in the browser. Covers images (canvas) and audio → WAV PCM (Web Audio).
// Heavier work (video, full codec set, finalize) routes to serverEngine.
// ─────────────────────────────────────────────────────────────────────────

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** codecId → WAV sample layout the browser encoder can produce. */
const WAV_LAYOUT: Record<string, { bits: number; float: boolean; unsigned: boolean }> = {
  pcm_s16le: { bits: 16, float: false, unsigned: false },
  pcm_s24le: { bits: 24, float: false, unsigned: false },
  pcm_s32le: { bits: 32, float: false, unsigned: false },
  pcm_f32le: { bits: 32, float: true, unsigned: false },
  pcm_u8: { bits: 8, float: false, unsigned: true },
};

export class ClientEngine implements BackendEngine {
  readonly backend = 'client' as const;

  available(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  async probe(source: SourceFile): Promise<MediaProbe> {
    const warnings: string[] = [];
    const container = (source.name.split('.').pop() || '').toLowerCase();
    if (!source.file && source.url == null) return { container, warnings };

    try {
      if (source.kind === 'image') {
        const bmp = await createImageBitmap(source.file as Blob);
        const probe: MediaProbe = { container, width: bmp.width, height: bmp.height, warnings };
        bmp.close();
        return probe;
      }
      if (source.kind === 'audio') {
        const buf = await decodeAudio(source.file as File);
        return {
          container,
          durationSec: buf.duration,
          sampleRate: buf.sampleRate,
          channels: buf.numberOfChannels,
          warnings,
        };
      }
      // video: read what the <video> element exposes
      const meta = await probeVideoElement(source.file as File);
      return { container, ...meta, warnings };
    } catch (e: any) {
      warnings.push(`Client probe failed: ${e?.message || e}`);
      return { container, corrupt: true, warnings };
    }
  }

  async convert(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    if (!source.file) throw new Error('Client conversion needs a local file.');
    onProgress({ progress: 0.05 });

    if (source.kind === 'image') return this.convertImage(source, recipe, onProgress, signal);
    if (source.kind === 'audio') return this.convertAudio(source, recipe, onProgress, signal);
    throw new Error('Video conversions run on Plajah cloud, not in the browser.');
  }

  private async convertImage(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    const fmt = IMAGE_FORMATS.find((f) => f.id === recipe.imageFormatId);
    const mime = IMAGE_MIME[fmt?.id || 'png'];
    if (!mime) throw new Error(`${fmt?.label || 'This image format'} is produced on the cloud, not in-browser.`);

    const bmp = await createImageBitmap(source.file as Blob);
    throwIfAborted(signal);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    onProgress({ progress: 0.6 });

    const quality = mime === 'image/png' ? undefined : 0.92;
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed.'))), mime, quality),
    );
    throwIfAborted(signal);
    onProgress({ progress: 1 });
    return this.result(source, fmt?.ext || 'png', blob);
  }

  private async convertAudio(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    const codec = AUDIO_CODECS.find((c) => c.id === recipe.audioCodecId);
    const layout = codec ? WAV_LAYOUT[codec.encoder] : undefined;
    if (!layout) throw new Error(`${codec?.label || 'That format'} is produced on the cloud, not in-browser.`);

    const buf = await decodeAudio(source.file as File);
    throwIfAborted(signal);
    onProgress({ progress: 0.5 });
    const targetRate = recipe.sampleRate || buf.sampleRate;
    const rendered = targetRate !== buf.sampleRate ? await resample(buf, targetRate) : buf;
    throwIfAborted(signal);
    onProgress({ progress: 0.8 });
    const blob = encodeWav(rendered, layout);
    onProgress({ progress: 1 });
    return this.result(source, 'wav', blob);
  }

  private result(source: SourceFile, ext: string, blob: Blob): ConvertResult {
    const outputName = source.name.replace(/\.[^.]+$/, '') + '.' + ext;
    return {
      outputUrl: URL.createObjectURL(blob),
      outputName,
      backend: 'client',
      sizeBytes: blob.size,
      blob,
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
}

async function decodeAudio(file: File): Promise<AudioBuffer> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try {
    const bytes = await file.arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } finally {
    ctx.close().catch(() => {});
  }
}

async function resample(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const frames = Math.ceil(buf.duration * rate);
  const off = new OfflineAudioContext(buf.numberOfChannels, frames, rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

function probeVideoElement(file: File): Promise<Partial<MediaProbe>> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const done = (p: Partial<MediaProbe>) => {
      URL.revokeObjectURL(url);
      resolve(p);
    };
    v.onloadedmetadata = async () => {
      const fps = await probeVideoFrameRate(url);
      done({ durationSec: v.duration, width: v.videoWidth, height: v.videoHeight, ...(fps ? { fps } : {}) });
    };
    v.onerror = () => done({ corrupt: true });
    v.src = url;
  });
}

/** Encode an AudioBuffer into a WAV blob at the requested PCM layout. */
function encodeWav(buf: AudioBuffer, layout: { bits: number; float: boolean; unsigned: boolean }): Blob {
  const ch = buf.numberOfChannels;
  const frames = buf.length;
  const bytesPerSample = layout.bits / 8;
  const blockAlign = ch * bytesPerSample;
  const dataLen = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);

  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  const fmtCode = layout.float ? 3 : 1; // 3 = IEEE float, 1 = PCM int
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, fmtCode, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, layout.bits, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  // Gather channel data.
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));

  let offset = 44;
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = clamp(chans[c][i]);
      if (layout.float) {
        view.setFloat32(offset, s, true);
      } else if (layout.bits === 8) {
        view.setUint8(offset, (s * 0.5 + 0.5) * 255); // unsigned 8-bit
      } else if (layout.bits === 16) {
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      } else if (layout.bits === 24) {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
      } else {
        view.setInt32(offset, s < 0 ? s * 0x80000000 : s * 0x7fffffff, true);
      }
      offset += bytesPerSample;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
