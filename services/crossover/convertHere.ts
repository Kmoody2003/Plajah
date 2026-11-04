// Convert a file that lives somewhere else (Content HQ, a published release) with the best engine on
// this device. The desktop app uses ffmpeg and Android uses its hardware or the codec pack, both
// without uploading. On the website, which has no engine, heavy formats go to the Plajah cloud.

import { crossover } from '.';
import { deviceCanConvert, deviceConvert } from './deviceEngine';
import { crossoverHost } from './host';
import { nativeConvert, nativeProbe, nativeStatus } from './nativeEngine';
import { packCanMake, proPackConvert } from './proPack';
import { toBase64 } from './save';
import type { ConvertProgress, ConvertResult, MediaKind, Recipe, SourceFile } from './types';

const invoke = (cmd: string, args: Record<string, unknown>) => (window as any).__plajahMediaEngine.invoke(cmd, args);
const CHUNK = 1024 * 1024 * 3; // divisible by 3, so each chunk's base64 stands alone

/** ffmpeg reads from disk, so the bytes go to a temp file a few MB at a time. */
async function fileToTemp(file: File): Promise<string> {
  const { path } = await invoke('crossover_temp_path', { name: file.name });
  for (let at = 0; at < file.size; at += CHUNK) {
    const bytes = new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer());
    const r = await invoke('crossover_append_base64', { path, data: toBase64(bytes) });
    if (!r?.success) throw new Error(r?.error || 'Could not prepare the file.');
  }
  return path;
}

export type EngineKind = 'desktop' | 'device' | 'cloud';
export const engineHere = (): EngineKind => {
  const host = crossoverHost();
  return host === 'desktop' ? 'desktop' : host === 'android' ? 'device' : 'cloud';
};

export async function convertHere(
  file: File,
  kind: MediaKind,
  recipe: Recipe,
  onProgress: (p: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<ConvertResult> {
  const source: SourceFile = { id: file.name, name: file.name, kind, sizeBytes: file.size, file };
  const host = crossoverHost();

  const native = host === 'desktop' ? await nativeStatus().catch(() => null) : null;
  if (native?.available) {
    onProgress({ progress: 0, line: 'Preparing the file' });
    const path = await fileToTemp(file);
    const local: SourceFile = { ...source, file: undefined, path };
    local.probe = await nativeProbe(local).catch(() => undefined);
    // The source is a temp copy, so the result goes somewhere the user can keep it.
    return nativeConvert(local, recipe, onProgress, { signal, outputDir: native.downloads });
  }
  if (host === 'web') return crossover.convert(source, recipe, onProgress, signal);

  if (kind === 'image') return crossover.convert(source, recipe, onProgress, signal);
  const why = await deviceCanConvert(source, recipe);
  if (!why) return deviceConvert(source, recipe, onProgress, signal);
  if (packCanMake(recipe)) return proPackConvert(source, recipe, onProgress, signal);
  throw new Error(`${recipe.videoCodecId?.toUpperCase() || 'That format'} on this device needs the Plajah desktop app.`);
}
