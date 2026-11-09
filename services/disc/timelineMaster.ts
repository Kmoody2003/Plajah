// Timeline → disc master. A title that points at a Fabula cut (not a file) is rendered on the
// desktop before the disc encode: video streams out of Fabula's renderer as a high-bitrate
// fragmented MP4 straight to disk (no in-memory file), and the timeline's mix is written as a
// lossless 24-bit / 48 kHz WAV — so the only lossy step is the disc encode itself.
import type { ClipIO } from './clipMux';

export interface AudioLike { numberOfChannels: number; sampleRate: number; length: number; getChannelData(ch: number): Float32Array }

/** RIFF/WAVE header for 24-bit PCM. */
export function wavHeader(channels: number, sampleRate: number, frames: number): Uint8Array {
  const bps = 3, data = frames * channels * bps;
  const b = new DataView(new ArrayBuffer(44));
  const s = (o: number, t: string) => { for (let i = 0; i < 4; i++) b.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); b.setUint32(4, 36 + data, true); s(8, 'WAVE');
  s(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, channels, true);
  b.setUint32(24, sampleRate, true); b.setUint32(28, sampleRate * channels * bps, true); b.setUint16(32, channels * bps, true); b.setUint16(34, 24, true);
  s(36, 'data'); b.setUint32(40, data, true);
  return new Uint8Array(b.buffer);
}

/** Interleave + quantise frames [from, to) to 24-bit little-endian PCM (TPDF dither ±1 LSB). */
export function pcm24(buf: AudioLike, from: number, to: number): Uint8Array {
  const ch = buf.numberOfChannels, n = Math.max(0, Math.min(to, buf.length) - from);
  const out = new Uint8Array(n * ch * 3);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = Math.max(-1, Math.min(1, data[c][from + i]));
    let v = Math.round(x * 8388607 + (Math.random() - Math.random()));
    v = Math.max(-8388608, Math.min(8388607, v));
    out[o++] = v & 0xff; out[o++] = (v >> 8) & 0xff; out[o++] = (v >> 16) & 0xff;
  }
  return out;
}

/** Stream a mixed AudioBuffer to a 24-bit WAV through the clip IO, 10 s at a time. */
export async function writeWav(buf: AudioLike, path: string, io: ClipIO): Promise<void> {
  const append = await io.create(path);
  await append(wavHeader(buf.numberOfChannels, buf.sampleRate, buf.length));
  const step = buf.sampleRate * 10;
  for (let f = 0; f < buf.length; f += step) await append(pcm24(buf, f, f + step));
}

/** What a renderer needs to render one cut (Fabula fills this; opaque to services/disc). */
export type RenderJob = Record<string, unknown> & { title?: string };
/** Fabula's renderFabulaToBlob, injected (keeps the heavy renderer out of services/disc). */
export type Renderer = (opts: any) => Promise<Blob | null>;

export interface MasterOut { video: string; audio?: string }

/** Master bitrates to try, best first (hardware encoders cap differently). */
export const masterBitrates = (w: number, h: number) => (w * h > 2073600 * 1.5 ? [120e6, 80e6, 50e6, 30e6] : [50e6, 35e6, 24e6]);

export async function renderTimelineMaster(o: {
  job: RenderJob; render: Renderer; io: ClipIO; dir: string; name: string;
  video: { w: number; h: number }; onProgress?: (p: number, stage: string) => void; signal?: AbortSignal;
}): Promise<MasterOut> {
  const sep = o.dir.includes('\\') ? '\\' : '/';
  const safe = o.name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'cut';
  const audioPath = `${o.dir}${sep}${safe}_mix.wav`;
  let audio: string | undefined;
  let lastErr = '';
  for (const bitrate of masterBitrates(o.video.w, o.video.h)) {
    const videoPath = `${o.dir}${sep}${safe}_master_${Math.round(bitrate / 1e6)}M.mp4`;
    const append = await o.io.create(videoPath);
    const format = { ...((o.job.format as any) || {}), w: o.video.w, h: o.video.h };
    const blob = await o.render({
      ...o.job, format, bitrate, quality: true, signal: o.signal,
      sink: append,
      onAudio: async (mix: AudioLike | null) => { if (mix && !audio) { o.onProgress?.(0, 'Writing the audio mix'); await writeWav(mix, audioPath, o.io); audio = audioPath; } },
      onProgress: o.onProgress,
    });
    if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (blob) return { video: videoPath, audio };
    lastErr = `the encoder refused ${Math.round(bitrate / 1e6)} Mbit/s`;
  }
  throw new Error(`Could not render "${o.name}" from the timeline (${lastErr}).`);
}
