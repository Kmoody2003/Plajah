// Runs the MPEG-2 conform / delivery jobs from services/fabula/mpeg2.ts on the best engine here:
//   desktop app → its local ffmpeg (input staged to a temp file; deliverables land in Downloads),
//   web / Android → the FFmpeg WebAssembly codec pack (reads the input in place; nothing uploaded).

import { crossoverHost } from '../crossover/host';
import { localMediaUrl, nativeStatus, runNativeFfmpeg } from '../crossover/nativeEngine';
import { loadProPack } from '../crossover/proPack';
import { toBase64 } from '../crossover/save';
import { buildConformArgs, buildMpeg2Args, deliverName, parseVideoStreamLine, type DeliverOptions, type Mpeg2PresetId } from './mpeg2';

export interface JobProgress { progress: number; line?: string }
type OnProgress = (p: JobProgress) => void;

const invoke = <T = any>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => (window as any).__plajahMediaEngine.invoke(cmd, args);
const CHUNK = 3 * 1024 * 1024; // divisible by 3: each chunk's base64 stands alone

export async function mpeg2Engine(): Promise<'native' | 'wasm'> {
  if (crossoverHost() === 'desktop') {
    const s = await nativeStatus().catch(() => null);
    if (s?.available) return 'native';
  }
  return 'wasm';
}

async function stageNative(file: Blob, name: string, onProgress: OnProgress): Promise<string> {
  const { path } = await invoke<{ path: string }>('crossover_temp_path', { name });
  for (let at = 0; at < file.size; at += CHUNK) {
    const bytes = new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer());
    const r = await invoke<any>('crossover_append_base64', { path, data: toBase64(bytes) });
    if (!r?.success) throw new Error(r?.error || 'Could not stage the file for ffmpeg.');
    onProgress({ progress: 0, line: `Reading ${Math.round(((at + bytes.length) / file.size) * 100)}%` });
  }
  return path;
}

async function runWasm(input: Blob, inName: string, outName: string, makeArgs: (i: string, o: string) => string[], onProgress: OnProgress, signal?: AbortSignal) {
  onProgress({ progress: 0, line: 'Loading the codec pack' });
  const ff = await loadProPack((f) => onProgress({ progress: 0, line: `Getting the codec pack ${Math.round(f * 100)}%` }));
  const dir = '/m2in' + Math.random().toString(36).slice(2, 7);
  const file = input instanceof File ? new File([input], inName) : new File([input], inName);
  const out = '/' + outName;
  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => { log.push(message); if (log.length > 600) log.splice(0, 100); };
  const onProg = ({ progress }: { progress: number }) => onProgress({ progress: Math.max(0, Math.min(0.999, progress)) });
  const onAbort = () => ff.terminate();
  await ff.createDir(dir);
  await ff.mount('WORKERFS' as any, { files: [file] }, dir);
  ff.on('log', onLog); ff.on('progress', onProg);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const code = await ff.exec(makeArgs(`${dir}/${inName}`, out));
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (code !== 0) throw new Error(log.filter((l) => /error|invalid|unknown|not found|unsupported|could not|incompatible/i.test(l)).pop() || 'ffmpeg failed on this file.');
    const data = await ff.readFile(out) as Uint8Array;
    return { blob: new Blob([data as BlobPart]), log };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    ff.off('log', onLog); ff.off('progress', onProg);
    await ff.deleteFile(out).catch(() => {});
    await ff.unmount(dir).catch(() => {});
    await ff.deleteDir(dir).catch(() => {});
  }
}

export interface ConformResult { blob: Blob; engine: 'native' | 'wasm'; source: ReturnType<typeof parseVideoStreamLine> }

/** MPEG-2 original → H.264 working copy (Blob). */
export async function conformMpeg2(file: File, onProgress: OnProgress, signal?: AbortSignal, durationSec?: number): Promise<ConformResult> {
  const engine = await mpeg2Engine();
  const inName = 'source.' + ((file.name.split('.').pop() || 'mpg').toLowerCase());
  if (engine === 'native') {
    const status = await nativeStatus();
    const inPath = await stageNative(file, inName, onProgress);
    const { path: outPath } = await invoke<{ path: string }>('crossover_temp_path', { name: file.name.replace(/\.[^.]+$/, '') + '.conform.mp4' });
    const enc = status.encoders.includes('h264_nvenc') ? 'h264_nvenc' : status.encoders.includes('h264_qsv') ? 'h264_qsv' : status.encoders.includes('h264_amf') ? 'h264_amf' : undefined;
    await runNativeFfmpeg(() => buildConformArgs(inPath, outPath, { encoder: enc }), outPath, durationSec, false,
      (p) => onProgress({ progress: p.progress, line: p.speed ? `Conforming · ${p.speed}` : 'Conforming' }), signal);
    const blob = await (await fetch(localMediaUrl(outPath, Date.now()))).blob();
    return { blob, engine, source: {} };
  }
  const { blob, log } = await runWasm(file, inName, 'conform.mp4', (i, o) => buildConformArgs(i, o, { preset: 'veryfast' }), (p) => onProgress({ progress: p.progress, line: p.line || 'Conforming' }), signal);
  return { blob, engine, source: parseVideoStreamLine(log) };
}

export interface DeliverResult { engine: 'native' | 'wasm'; name: string; blob?: Blob; outputPath?: string; sizeBytes: number }

/** Rendered H.264 master → MPEG-2 deliverable. Desktop writes to Downloads; the web returns a Blob. */
export async function deliverMpeg2(master: Blob, base: string, presetId: Mpeg2PresetId, opts: DeliverOptions, onProgress: OnProgress, signal?: AbortSignal, durationSec?: number): Promise<DeliverResult> {
  const engine = await mpeg2Engine();
  const name = deliverName(base, presetId);
  if (engine === 'native') {
    const status = await nativeStatus();
    const inPath = await stageNative(master, 'master.mp4', onProgress);
    const dir = status.downloads || inPath.replace(/[\\/][^\\/]+$/, '');
    const sep = dir.includes('\\') ? '\\' : '/';
    const { path: outPath } = await invoke<{ path: string }>('crossover_unique_path', { path: `${dir}${sep}${name}` });
    const r = await runNativeFfmpeg(() => buildMpeg2Args(inPath, outPath, presetId, opts), outPath, durationSec, false,
      (p) => onProgress({ progress: p.progress, line: p.speed ? `Encoding MPEG-2 · ${p.speed}` : 'Encoding MPEG-2' }), signal);
    return { engine, name, outputPath: r.outputPath, sizeBytes: r.sizeBytes };
  }
  const { blob } = await runWasm(master, 'master.mp4', name, (i, o) => buildMpeg2Args(i, o, presetId, opts), (p) => onProgress({ progress: p.progress, line: p.line || 'Encoding MPEG-2' }), signal);
  return { engine, name, blob, sizeBytes: blob.size };
}
