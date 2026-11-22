// Caption embedding runners. Desktop: the sidecar goes to a temp file and buildEmbedArgs runs on the
// app's local ffmpeg (any size). Web / Android: the same arguments run in the FFmpeg WebAssembly pro
// pack, reading the video in place (WORKERFS). Nothing is uploaded either way.

import { nativeStatus, nativeWriteText, runNativeFfmpeg } from '../nativeEngine';
import { crossoverHost } from '../host';
import { toBase64 } from '../save';
import { buildEmbedArgs, embedOutputName, embedTarget, type EmbedTarget } from './embed';
import { writeCaptions, type WriteOptions } from './index';
import type { CaptionCue } from './model';

/** The sidecar a target muxes in, written the way that container needs it. */
export function sidecarFor(cues: CaptionCue[], target: EmbedTarget, opts: WriteOptions = {}) {
  const t = embedTarget(target);
  const w = writeCaptions(cues, t.sidecar, { ...opts, ...(t.sidecar === 'scc' ? { tailPadSec: 1 } : {}) });
  return { text: w.text, bytes: w.bytes, ext: w.ext, late: w.late, unsupported: w.unsupported };
}
import type { ConvertProgress } from '../types';
import { loadProPack } from '../proPack';

const invoke = <T = any>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => (window as any).__plajahMediaEngine.invoke(cmd, args);

/** 'native' = the desktop app's ffmpeg; 'wasm' = the in-browser pro pack (downloads ~32 MB once). */
export async function embedEngine(): Promise<'native' | 'wasm'> {
  if (crossoverHost() === 'desktop') {
    const s = await nativeStatus().catch(() => null);
    if (s?.available) return 'native';
  }
  return 'wasm';
}

/** Why native embedding can't run here, or null when it can. */
export async function embedUnavailableReason(): Promise<string | null> {
  if (crossoverHost() !== 'desktop') return 'Not in the desktop app.';
  const s = await nativeStatus().catch(() => null);
  if (!s?.available) return s?.reason || 'ffmpeg is not installed on this computer.';
  return null;
}

export interface WasmEmbedJob {
  video: File;
  target: EmbedTarget;
  caption: { text: string; bytes?: Uint8Array; ext: string };
  lang?: string;
  defaultOn?: boolean;
  onProgress: (p: ConvertProgress) => void;
  signal?: AbortSignal;
}

/** Embed in the browser. Returns the new file; stream copy, so even long programmes are quick. */
export async function embedCaptionsWasm(job: WasmEmbedJob): Promise<{ blob: Blob; name: string; log: string[] }> {
  job.onProgress({ progress: 0, line: 'Getting the codec pack' });
  const ffmpeg = await loadProPack((f) => job.onProgress({ progress: 0, line: `Getting the codec pack: ${Math.round(f * 100)}%` }));
  const dir = '/embedin';
  const inExt = job.video.name.split('.').pop() || 'mp4';
  const named = new File([job.video], `input.${inExt}`);
  const cap = `/captions.${job.caption.ext}`;
  const out = `/output.${embedTarget(job.target).ext}`;
  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => { log.push(message); if (log.length > 400) log.shift(); };
  const onProg = ({ progress }: { progress: number }) => job.onProgress({ progress: Math.max(0, Math.min(0.999, progress)) });
  await ffmpeg.createDir(dir).catch(() => {});
  await ffmpeg.mount('WORKERFS' as any, { files: [named] }, dir);
  await ffmpeg.writeFile(cap, job.caption.bytes ?? new TextEncoder().encode(job.caption.text));
  ffmpeg.on('log', onLog); ffmpeg.on('progress', onProg);
  const onAbort = () => ffmpeg.terminate();
  job.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const code = await ffmpeg.exec(buildEmbedArgs({ videoPath: `${dir}/${named.name}`, captionPath: cap, outputPath: out, target: job.target, lang: job.lang, defaultOn: job.defaultOn }));
    if (job.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (code !== 0) throw new Error(log.filter((l) => /error|invalid|not found|unsupported|could not|no such/i.test(l)).pop() || 'ffmpeg could not embed into this file.');
    const data = await ffmpeg.readFile(out) as Uint8Array;
    const stem = job.video.name.replace(/\.[^.]+$/, '');
    job.onProgress({ progress: 1 });
    return { blob: new Blob([data as BlobPart]), name: `${stem}.${job.target === 'burn-in' ? 'opencaptions' : 'captioned'}.${embedTarget(job.target).ext}`, log };
  } finally {
    job.signal?.removeEventListener('abort', onAbort);
    ffmpeg.off('log', onLog); ffmpeg.off('progress', onProg);
    await ffmpeg.deleteFile(cap).catch(() => {});
    await ffmpeg.deleteFile(out).catch(() => {});
    await ffmpeg.unmount(dir).catch(() => {});
  }
}

export interface EmbedJob {
  videoPath: string;
  target: EmbedTarget;
  /** The sidecar the target needs (embedTarget(target).sidecar), already written. */
  caption: { text: string; bytes?: Uint8Array; ext: string };
  lang?: string;
  defaultOn?: boolean;
  durationSec?: number;
  onProgress: (p: ConvertProgress) => void;
  signal?: AbortSignal;
}

export async function embedCaptionsNative(job: EmbedJob): Promise<{ outputPath: string; sizeBytes: number }> {
  const why = await embedUnavailableReason();
  if (why) throw new Error(why);
  const { path: capPath } = await invoke<{ path: string }>('crossover_temp_path', { name: `captions.${job.caption.ext}` });
  if (job.caption.bytes) {
    const r = await invoke<any>('crossover_append_base64', { path: capPath, data: toBase64(job.caption.bytes) });
    if (!r?.success) throw new Error(r?.error || 'Could not write the caption file.');
  } else {
    const w = await nativeWriteText(capPath, job.caption.text);
    if (!w?.success) throw new Error(w?.error || 'Could not write the caption file.');
  }
  const { path: outputPath } = await invoke<{ path: string }>('crossover_unique_path', { path: embedOutputName(job.videoPath, job.target) });
  const t = embedTarget(job.target);
  return runNativeFfmpeg(
    (encoders) => buildEmbedArgs({
      videoPath: job.videoPath, captionPath: capPath, outputPath, target: job.target, lang: job.lang, defaultOn: job.defaultOn,
      videoEncoder: t.reencode && encoders.includes('h264_nvenc') ? 'h264_nvenc' : undefined,
    }),
    outputPath, job.durationSec, false, job.onProgress, job.signal,
  );
}
