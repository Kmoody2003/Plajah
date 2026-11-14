// On-device video conversion through WebCodecs, used by the Android app (and as the desktop app's
// fallback when ffmpeg is missing). Uses the phone's hardware codecs, so it covers the delivery
// formats (H.264, HEVC, VP9, AV1 in MP4, MOV, WebM, MKV); mastering codecs need the desktop app.

import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, MkvOutputFormat, MovOutputFormat, Mp3OutputFormat, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_VERY_HIGH, QUALITY_VERY_LOW, WavOutputFormat, WebMOutputFormat, canEncodeAudio, canEncodeVideo, type AudioCodec, type OutputFormat, type VideoCodec } from 'mediabunny';
import { extFor } from './formats';
import type { ConvertProgress, ConvertResult, MediaProbe, ProbeStream, Recipe, SourceFile } from './types';

const VIDEO: Record<string, VideoCodec | undefined> = { h264: 'avc', h265: 'hevc', vp9: 'vp9', av1: 'av1' };
const AUDIO: Record<string, AudioCodec | undefined> = { aac: 'aac', opus: 'opus', mp3: 'mp3', pcm_s16le: 'pcm-s16', pcm_s24le: 'pcm-s24', pcm_f32le: 'pcm-f32', flac: 'flac' };

const FORMAT: Record<string, (() => OutputFormat) | undefined> = {
  mp4: () => new Mp4OutputFormat({ fastStart: 'in-memory' }),
  m4a: () => new Mp4OutputFormat({ fastStart: 'in-memory' }),
  mov: () => new MovOutputFormat({ fastStart: 'in-memory' }),
  webm: () => new WebMOutputFormat(),
  mkv: () => new MkvOutputFormat(),
  wav: () => new WavOutputFormat(),
  mp3: () => new Mp3OutputFormat(),
};

/** Can this device do it? A reason when it can't, so the UI can say so before the user starts. */
export async function deviceCanConvert(source: SourceFile, recipe: Recipe): Promise<string | null> {
  if (typeof (globalThis as any).VideoEncoder === 'undefined') return 'This device has no WebCodecs video engine.';
  if (!source.file) return 'This file is not on the device.';
  if (source.kind === 'image') return null;
  if (!FORMAT[recipe.containerId]) return `${recipe.containerId.toUpperCase()} needs the desktop app.`;
  const audioOnly = recipe.containerId === 'wav' || recipe.containerId === 'mp3' || recipe.containerId === 'm4a';
  if (source.kind === 'video' && !audioOnly) {
    const v = VIDEO[recipe.videoCodecId || ''];
    if (!v) return 'That video codec needs the desktop app.';
    if (!(await canEncodeVideo(v))) return `This device can't encode ${recipe.videoCodecId}.`;
  }
  const a = AUDIO[recipe.audioCodecId || ''];
  if (!a) return 'That audio codec needs the desktop app.';
  if (!(await canEncodeAudio(a))) return `This device can't encode ${recipe.audioCodecId}.`;
  return null;
}

export async function deviceConvert(
  source: SourceFile,
  recipe: Recipe,
  onProgress: (p: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<ConvertResult> {
  if (!source.file) throw new Error('This file is not on the device.');
  const format = FORMAT[recipe.containerId]?.();
  if (!format) throw new Error(`${recipe.containerId.toUpperCase()} needs the desktop app.`);
  const target = new BufferTarget();
  const output = new Output({ format, target });
  const input = new Input({ source: new BlobSource(source.file), formats: ALL_FORMATS });

  // One live picture a second, drawn from the very frames being encoded.
  const preview = document.createElement('canvas');
  const ctx = preview.getContext('2d');
  let lastDrawn = -Infinity;
  const audioOnly = recipe.containerId === 'wav' || recipe.containerId === 'mp3' || recipe.containerId === 'm4a';
  const bitrate = recipe.qualityMode === 'bitrate' && recipe.videoBitrate ? parseRate(recipe.videoBitrate) : undefined;

  const conversion = await Conversion.init({
    input, output,
    video: audioOnly ? { discard: true } : {
      codec: VIDEO[recipe.videoCodecId || ''],
      width: recipe.width,
      height: recipe.height,
      frameRate: recipe.fps,
      bitrate: bitrate ?? qualityFromCrf(recipe.crf),
      forceTranscode: true,
      process: (sample) => {
        if (ctx && sample.timestamp - lastDrawn >= 1) {
          lastDrawn = sample.timestamp;
          const w = 480;
          const h = Math.round((sample.displayHeight / sample.displayWidth) * w) || 270;
          if (preview.width !== w || preview.height !== h) { preview.width = w; preview.height = h; }
          sample.draw(ctx, 0, 0, w, h);
        }
        return sample;
      },
    },
    audio: {
      codec: AUDIO[recipe.audioCodecId || ''],
      bitrate: recipe.audioBitrate ? parseRate(recipe.audioBitrate) : undefined,
      sampleRate: recipe.sampleRate,
      numberOfChannels: recipe.binauralDownmix ? 2 : recipe.channels,
    },
  });
  if (!conversion.isValid) {
    const why = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(', ');
    throw new Error(`This conversion isn't possible on this device (${why || 'no usable tracks'}).`);
  }
  const started = performance.now();
  conversion.onProgress = (progress, processedTime) => {
    const elapsed = (performance.now() - started) / 1000;
    onProgress({
      progress,
      outSec: processedTime,
      speed: elapsed > 0.5 ? `${(processedTime / elapsed).toFixed(1)}x` : undefined,
      etaSec: progress > 0.01 ? (elapsed * (1 - progress)) / progress : undefined,
      previewCanvas: audioOnly ? undefined : preview,
    });
  };
  signal?.addEventListener('abort', () => { void conversion.cancel(); }, { once: true });
  try {
    await conversion.execute();
  } catch (e: any) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    throw e;
  }
  const blob = new Blob([target.buffer!], { type: format.mimeType });
  const outputName = `${source.name.replace(/\.[^.]+$/, '')}.${extFor(recipe, source.kind)}`;
  onProgress({ progress: 1 });
  return { outputUrl: URL.createObjectURL(blob), outputName, backend: 'client', sizeBytes: blob.size, blob };
}

const parseRate = (s: string) => {
  const m = /^([\d.]+)\s*([kKmM]?)/.exec(s);
  if (!m) return undefined;
  return Math.round(+m[1] * (m[2].toLowerCase() === 'm' ? 1e6 : m[2].toLowerCase() === 'k' ? 1e3 : 1));
};

/** Hardware encoders take a bitrate, not a CRF. These presets scale with resolution and codec. */
const qualityFromCrf = (crf = 20) => (crf <= 16 ? QUALITY_VERY_HIGH : crf <= 21 ? QUALITY_HIGH : crf <= 27 ? QUALITY_MEDIUM : crf <= 34 ? QUALITY_LOW : QUALITY_VERY_LOW);

/**
 * Read a file's real contents from its container, without decoding. The frame rate comes from the
 * packet timing: it decides the frame grid every broadcast caption file is written on.
 */
export async function deviceProbe(source: SourceFile): Promise<MediaProbe> {
  if (!source.file) throw new Error('This file is not on the device.');
  const input = new Input({ source: new BlobSource(source.file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const format = await input.getFormat();
    const durationSec = await input.computeDuration();
    const stats = video ? await video.computePacketStats(200) : null;
    const streams: ProbeStream[] = [];
    if (video) streams.push({ index: streams.length, type: 'video', codec: video.codec ?? 'unknown', width: video.displayWidth, height: video.displayHeight, fps: stats?.averagePacketRate, bitrate: stats?.averageBitrate, language: known(video.languageCode) });
    if (audio) streams.push({ index: streams.length, type: 'audio', codec: audio.codec ?? 'unknown', sampleRate: audio.sampleRate, channels: audio.numberOfChannels, language: known(audio.languageCode) });
    return {
      container: (source.name.split('.').pop() || '').toLowerCase(),
      formatName: format.name,
      durationSec,
      width: video?.displayWidth,
      height: video?.displayHeight,
      fps: stats?.averagePacketRate,
      videoCodec: video?.codec ?? undefined,
      audioCodec: audio?.codec ?? undefined,
      sampleRate: audio?.sampleRate,
      channels: audio?.numberOfChannels,
      warnings: [],
      streams,
    };
  } finally {
    input.dispose?.();
  }
}
const known = (lang?: string) => (lang && lang !== 'und' ? lang : undefined);

// ── The audio track for speech recognition ──────────────────────────────────

export async function devicePcm16k(file: Blob, onProgress?: (p: number) => void): Promise<Float32Array> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  onProgress?.(0.1);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
  onProgress?.(0.6);
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  onProgress?.(1);
  return rendered.getChannelData(0);
}
