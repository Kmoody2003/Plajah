// Desktop backend: ffmpeg on the user's own PC, through the WinUI media engine. Nothing is uploaded,
// so size and length are unlimited and the job can report real progress and a live picture.

import { onNativeMessage } from '../windowsBridgeService';
import { buildFfmpegArgs } from './engine';
import { extFor } from './formats';
import type { ConvertProgress, ConvertResult, MediaProbe, ProbeStream, Recipe, SourceFile } from './types';

export interface NativeStatus { available: boolean; path?: string; ffprobe?: boolean; version?: string; encoders: string[]; reason?: string; downloads?: string; raw?: { braw?: boolean } }

const invoke = <T = any>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => {
  const engine = (window as any).__plajahMediaEngine;
  return engine?.invoke ? engine.invoke(cmd, args) : Promise.reject(new Error('The desktop media engine is not available.'));
};

export const localMediaUrl = (path: string, bust?: number | string) => {
  const name = path.split(/[\\/]/).pop() || 'media';
  return `https://localmedia.plajah/${encodeURIComponent(name)}?path=${encodeURIComponent(path)}${bust !== undefined ? `&t=${bust}` : ''}`;
};

let statusCache: NativeStatus | null = null;
export async function nativeStatus(force = false): Promise<NativeStatus> {
  if (statusCache && statusCache.available && !force) return statusCache;
  const s = await invoke<any>('crossover_status');
  statusCache = { available: !!s?.available, path: s?.path, ffprobe: !!s?.ffprobe, version: s?.version, encoders: s?.encoders || [], reason: s?.reason || undefined, downloads: s?.downloads, raw: s?.raw };
  return statusCache;
}

export const pickNativeFiles = async (): Promise<{ name: string; path: string; size: number }[]> => (await invoke<any>('crossover_pick_files'))?.files || [];
export const pickNativeFolder = async (): Promise<string | null> => (await invoke<any>('crossover_pick_folder'))?.path || null;
export const revealNative = (path: string) => invoke('crossover_reveal', { path });
export const openBrawDownload = () => invoke('crossover_get_braw');
export const nativeWriteText = (path: string, text: string) => invoke<{ success: boolean; path?: string; error?: string }>('crossover_write_text', { path, text });
export const nativeReadText = async (path: string): Promise<string> => {
  const r = await invoke<any>('crossover_read_text', { path });
  if (!r?.success) throw new Error('Could not read that file.');
  return r.text;
};

const rateOf = (s?: string) => {
  const m = /^(\d+)\/(\d+)$/.exec(s || '');
  return m && +m[2] ? +m[1] / +m[2] : undefined;
};

/** Shape raw ffprobe JSON. Exported so it can be tested without an app around it. */
export function shapeFfprobe(json: any, errors: string, fallbackName: string): MediaProbe {
  const warnings: string[] = [];
  const format = json?.format || {};
  const streams: any[] = json?.streams || [];
  const v = streams.find((x) => x.codec_type === 'video' && !x.disposition?.attached_pic);
  const a = streams.find((x) => x.codec_type === 'audio');
  const shaped: ProbeStream[] = streams.map((x) => ({
    index: x.index,
    type: x.codec_type,
    codec: x.codec_long_name ? `${x.codec_name}` : x.codec_name,
    profile: x.profile,
    width: x.width,
    height: x.height,
    fps: rateOf(x.avg_frame_rate) || rateOf(x.r_frame_rate),
    pixFmt: x.pix_fmt,
    colorSpace: x.color_space,
    fieldOrder: x.field_order,
    sampleRate: x.sample_rate ? +x.sample_rate : undefined,
    channels: x.channels,
    channelLayout: x.channel_layout,
    bitrate: x.bit_rate ? +x.bit_rate : undefined,
    language: x.tags?.language,
    timecode: x.tags?.timecode,
  }));
  const moov = /moov atom not found/i.test(errors);
  if (errors && !moov) warnings.push(errors.split('\n')[0].slice(0, 200));
  if (v && /interlaced|tt|bb|tb|bt/.test(String(v.field_order)) && v.field_order !== 'progressive') warnings.push(`Interlaced video (${v.field_order}).`);
  const duration = format.duration ? +format.duration : undefined;
  return {
    container: String(format.format_name || fallbackName.split('.').pop() || '').split(',')[0],
    formatName: format.format_long_name,
    durationSec: duration,
    bitrate: format.bit_rate ? +format.bit_rate : undefined,
    width: v?.width,
    height: v?.height,
    fps: v ? rateOf(v.avg_frame_rate) || rateOf(v.r_frame_rate) : undefined,
    videoCodec: v?.codec_name,
    audioCodec: a?.codec_name,
    sampleRate: a?.sample_rate ? +a.sample_rate : undefined,
    channels: a?.channels,
    needsFinalize: moov || undefined,
    corrupt: moov || (!streams.length ? true : undefined),
    warnings,
    streams: shaped,
    tags: format.tags,
  };
}

export async function nativeProbe(source: SourceFile): Promise<MediaProbe> {
  if (!source.path) throw new Error('No local path.');
  const r = await invoke<any>('crossover_probe', { path: source.path });
  if (!r?.json && r?.error) throw new Error(r.error);
  let json: any = {};
  try { json = JSON.parse(r.json || '{}'); } catch { /* reported through errors below */ }
  return shapeFfprobe(json, r?.errors || '', source.name);
}

let jobSeq = 0;

export interface NativeConvertOptions { outputDir?: string; signal?: AbortSignal }

/** Run ffmpeg with arguments built here, and resolve when it finishes. */
export async function runNativeFfmpeg(
  makeArgs: (encoders: string[]) => string[],
  outputPath: string,
  durationSec: number | undefined,
  preview: boolean,
  onProgress: (p: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<{ outputPath: string; sizeBytes: number }> {
  const status = await nativeStatus();
  if (!status.available) throw new Error(status.reason || 'ffmpeg is not installed.');
  const jobId = `cx${Date.now().toString(36)}${++jobSeq}`;
  return new Promise((resolve, reject) => {
    let finished = false;
    const off = onNativeMessage((m: any) => {
      if (m?.type !== 'CROSSOVER_JOB' || m.jobId !== jobId) return;
      if (m.state === 'running') {
        onProgress({
          progress: typeof m.progress === 'number' ? m.progress : 0,
          speed: m.speed || undefined,
          outSec: m.outSec,
          previewUrl: m.preview ? localMediaUrl(m.preview, Math.floor(Date.now() / 1000)) : undefined,
          etaSec: etaFrom(m, durationSec),
        });
        return;
      }
      finished = true;
      off();
      if (m.state === 'done') { onProgress({ progress: 1 }); resolve({ outputPath: m.outputPath, sizeBytes: m.sizeBytes }); }
      else if (m.state === 'canceled') reject(new DOMException('Canceled', 'AbortError'));
      else reject(new Error(friendlyFfmpegError(m.error)));
    });
    signal?.addEventListener('abort', () => { if (!finished) void invoke('crossover_cancel', { jobId }); }, { once: true });
    invoke<any>('crossover_convert', { jobId, args: makeArgs(status.encoders), outputPath, durationSec: durationSec || 0, preview })
      .then((r) => { if (!r?.success) { finished = true; off(); reject(new Error(r?.error || 'The job did not start.')); } })
      .catch((e) => { finished = true; off(); reject(e); });
  });
}

const etaFrom = (m: any, durationSec?: number) => {
  const speed = parseFloat(m.speed);
  if (!durationSec || !speed || speed <= 0) return undefined;
  return Math.max(0, (durationSec - (m.outSec || 0)) / speed);
};

/** ffmpeg's last lines hold the reason among noise; show the line that names it. */
export function friendlyFfmpegError(log: string | undefined): string {
  if (!log) return 'ffmpeg stopped without saying why.';
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  const real = lines.filter((l) => /error|invalid|unknown|not found|no such|unsupported|does not|cannot|could not|failed/i.test(l) && !/^conversion failed/i.test(l));
  return (real[real.length - 1] || lines[lines.length - 1] || 'ffmpeg failed.').slice(0, 300);
}

export async function nativeConvert(
  source: SourceFile,
  recipe: Recipe,
  onProgress: (p: ConvertProgress) => void,
  opts: NativeConvertOptions = {},
): Promise<ConvertResult> {
  if (!source.path) throw new Error('This file has no local path.');
  const ext = extFor(recipe, source.kind);
  const sep = source.path.includes('\\') ? '\\' : '/';
  const dir = opts.outputDir || source.path.slice(0, source.path.lastIndexOf(sep));
  const stem = source.name.replace(/\.[^.]+$/, '');
  const { path: outputPath } = await invoke<{ path: string }>('crossover_unique_path', { path: `${dir}${sep}${stem}.${ext}` });
  const wantsPreview = source.kind === 'video' && !!source.probe?.videoCodec;
  const done = await runNativeFfmpeg(
    (encoders) => buildFfmpegArgs(source.path!, recipe, outputPath, source.kind, encoders),
    outputPath, source.probe?.durationSec, wantsPreview, onProgress, opts.signal,
  );
  return {
    outputUrl: localMediaUrl(done.outputPath),
    outputName: done.outputPath.split(/[\\/]/).pop() || outputPath,
    outputPath: done.outputPath,
    backend: 'native',
    sizeBytes: done.sizeBytes,
  };
}

/** A small H.264 copy for reviewing formats the app's player can't decode (ProRes, MXF, MPEG-2...). */
export async function nativeProxy(source: SourceFile, onProgress: (p: ConvertProgress) => void, signal?: AbortSignal): Promise<string> {
  if (!source.path) throw new Error('This file has no local path.');
  const { path: out } = await invoke<{ path: string }>('crossover_temp_path', { name: `${source.name.replace(/\.[^.]+$/, '')}_proxy.mp4` });
  const encoder = (encoders: string[]) => (encoders.includes('h264_nvenc') ? 'h264_nvenc' : encoders.includes('h264_qsv') ? 'h264_qsv' : 'libx264');
  await runNativeFfmpeg(
    (encoders) => ['-y', '-i', source.path!, '-map', '0:v:0?', '-map', '0:a:0?', '-vf', 'scale=-2:540,format=yuv420p', '-c:v', encoder(encoders), '-b:v', '2500k', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', out],
    out, source.probe?.durationSec, false, onProgress, signal,
  );
  return localMediaUrl(out);
}

/** The audio track as mono 16 kHz floats, the shape speech recognition wants. */
export async function nativeSpeechPcm(source: SourceFile, onProgress: (p: ConvertProgress) => void, signal?: AbortSignal): Promise<Float32Array> {
  if (!source.path) throw new Error('This file has no local path.');
  const { path: out } = await invoke<{ path: string }>('crossover_temp_path', { name: 'speech.f32' });
  await runNativeFfmpeg(
    () => ['-y', '-i', source.path!, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', out],
    out, source.probe?.durationSec, false, onProgress, signal,
  );
  const res = await fetch(localMediaUrl(out));
  if (!res.ok) throw new Error(`Couldn't read the extracted audio (${res.status}).`);
  return new Float32Array(await res.arrayBuffer());
}
