import type { MediaKind } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Crossover format & codec catalog.
//
// Every entry maps to a concrete, FREE ffmpeg path (no paid encoders). The
// `backend` hint tells the router whether the browser can produce it
// ('client'), whether it needs the Cloud Run ffmpeg ('server'), or 'either'.
// Notes flag real-world ceilings so the UI stays honest.
// ─────────────────────────────────────────────────────────────────────────

export type BackendCap = 'client' | 'server' | 'either';

export interface Container {
  id: string;
  label: string;
  ext: string;
  kinds: MediaKind[];
  note?: string;
}

export interface Codec {
  id: string;
  label: string;
  encoder: string; // ffmpeg encoder name
  kind: 'video' | 'audio';
  backend: BackendCap;
  lossless?: boolean;
  note?: string;
}

export interface ImageFormat {
  id: string;
  label: string;
  ext: string;
  backend: BackendCap;
  note?: string;
}

export interface HwOption {
  id: string;
  label: string;
}

export const CONTAINERS: Container[] = [
  { id: 'mp4', label: 'MP4', ext: 'mp4', kinds: ['video', 'audio'] },
  { id: 'mkv', label: 'Matroska (MKV)', ext: 'mkv', kinds: ['video', 'audio'], note: 'Most permissive — holds almost any codec.' },
  { id: 'mov', label: 'QuickTime (MOV)', ext: 'mov', kinds: ['video', 'audio'], note: 'Best for ProRes / DNxHR mastering.' },
  { id: 'webm', label: 'WebM', ext: 'webm', kinds: ['video', 'audio'], note: 'VP9 / AV1 + Opus/Vorbis only.' },
  { id: 'mpegts', label: 'MPEG-TS', ext: 'ts', kinds: ['video'], note: 'Broadcast / stream-safe.' },
  { id: 'mpeg', label: 'MPEG Program Stream', ext: 'mpg', kinds: ['video'], note: 'Classic MPEG-2 .mpg target.' },
  { id: 'avi', label: 'AVI', ext: 'avi', kinds: ['video'] },
  { id: 'gif', label: 'Animated GIF', ext: 'gif', kinds: ['video'] },
  { id: 'flac', label: 'FLAC', ext: 'flac', kinds: ['audio'] },
  { id: 'wav', label: 'WAV', ext: 'wav', kinds: ['audio'], note: 'All PCM variants supported below.' },
  { id: 'mp3', label: 'MP3', ext: 'mp3', kinds: ['audio'] },
  { id: 'm4a', label: 'M4A (AAC/ALAC)', ext: 'm4a', kinds: ['audio'] },
  { id: 'ogg', label: 'Ogg', ext: 'ogg', kinds: ['audio'] },
  { id: 'opus', label: 'Opus', ext: 'opus', kinds: ['audio'] },
  { id: 'aiff', label: 'AIFF', ext: 'aiff', kinds: ['audio'] },
  { id: 'caf', label: 'CAF', ext: 'caf', kinds: ['audio'], note: 'Apple Core Audio — large-file safe.' },
];

export const VIDEO_CODECS: Codec[] = [
  { id: 'h264', label: 'H.264 / AVC', encoder: 'libx264', kind: 'video', backend: 'either', note: 'Browser (WebCodecs) for short clips; cloud for heavy jobs.' },
  { id: 'h265', label: 'H.265 / HEVC', encoder: 'libx265', kind: 'video', backend: 'server' },
  { id: 'av1', label: 'AV1', encoder: 'libsvtav1', kind: 'video', backend: 'server', note: 'SVT-AV1 — fast, royalty-free.' },
  { id: 'vp9', label: 'VP9', encoder: 'libvpx-vp9', kind: 'video', backend: 'server' },
  { id: 'mpeg2', label: 'MPEG-2', encoder: 'mpeg2video', kind: 'video', backend: 'server', note: 'High-quality MPEG-2 target (DVD / broadcast).' },
  { id: 'prores', label: 'Apple ProRes', encoder: 'prores_ks', kind: 'video', backend: 'server', note: '422 / 4444 mastering. Free encoder.' },
  { id: 'dnxhr', label: 'Avid DNxHR / DNxHD', encoder: 'dnxhd', kind: 'video', backend: 'server', note: 'Editing-friendly intermediate.' },
  { id: 'ffv1', label: 'FFV1 (lossless)', encoder: 'ffv1', kind: 'video', backend: 'server', lossless: true, note: 'Archival lossless.' },
  { id: 'braw', label: 'Blackmagic RAW', encoder: '(sdk)', kind: 'video', backend: 'server', note: 'Decode-only via free BRAW SDK — no tool can freely ENCODE BRAW.' },
];

export const AUDIO_CODECS: Codec[] = [
  { id: 'pcm_s16le', label: 'WAV PCM 16-bit', encoder: 'pcm_s16le', kind: 'audio', backend: 'either', lossless: true },
  { id: 'pcm_s24le', label: 'WAV PCM 24-bit', encoder: 'pcm_s24le', kind: 'audio', backend: 'either', lossless: true },
  { id: 'pcm_s32le', label: 'WAV PCM 32-bit', encoder: 'pcm_s32le', kind: 'audio', backend: 'either', lossless: true },
  { id: 'pcm_f32le', label: 'WAV Float 32-bit', encoder: 'pcm_f32le', kind: 'audio', backend: 'either', lossless: true },
  { id: 'pcm_f64le', label: 'WAV Float 64-bit', encoder: 'pcm_f64le', kind: 'audio', backend: 'server', lossless: true },
  { id: 'pcm_u8', label: 'WAV PCM 8-bit', encoder: 'pcm_u8', kind: 'audio', backend: 'either', lossless: true },
  { id: 'pcm_s24be', label: 'WAV PCM 24-bit BE', encoder: 'pcm_s24be', kind: 'audio', backend: 'server', lossless: true },
  { id: 'pcm_mulaw', label: 'WAV mu-law', encoder: 'pcm_mulaw', kind: 'audio', backend: 'server' },
  { id: 'pcm_alaw', label: 'WAV A-law', encoder: 'pcm_alaw', kind: 'audio', backend: 'server' },
  { id: 'adpcm_ms', label: 'WAV ADPCM (MS)', encoder: 'adpcm_ms', kind: 'audio', backend: 'server' },
  { id: 'flac', label: 'FLAC (lossless)', encoder: 'flac', kind: 'audio', backend: 'server', lossless: true },
  { id: 'alac', label: 'ALAC (lossless)', encoder: 'alac', kind: 'audio', backend: 'server', lossless: true },
  { id: 'aac', label: 'AAC', encoder: 'aac', kind: 'audio', backend: 'either' },
  { id: 'mp3', label: 'MP3', encoder: 'libmp3lame', kind: 'audio', backend: 'server' },
  { id: 'opus', label: 'Opus', encoder: 'libopus', kind: 'audio', backend: 'either' },
  { id: 'vorbis', label: 'Vorbis', encoder: 'libvorbis', kind: 'audio', backend: 'server' },
  { id: 'iamf', label: 'IAMF / Eclipsa Audio', encoder: 'iamf', kind: 'audio', backend: 'server', note: 'Immersive spatial audio (AOM). Support is emerging in ffmpeg.' },
];

export const IMAGE_FORMATS: ImageFormat[] = [
  { id: 'png', label: 'PNG', ext: 'png', backend: 'either' },
  { id: 'jpg', label: 'JPEG', ext: 'jpg', backend: 'either' },
  { id: 'webp', label: 'WebP', ext: 'webp', backend: 'either' },
  { id: 'avif', label: 'AVIF', ext: 'avif', backend: 'server', note: 'AV1-based, excellent compression.' },
  { id: 'heic', label: 'HEIC / HEIF', ext: 'heic', backend: 'server', note: 'Decode broad; encode where libheif present.' },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', backend: 'server' },
  { id: 'bmp', label: 'BMP', ext: 'bmp', backend: 'server' },
  { id: 'tga', label: 'TGA', ext: 'tga', backend: 'server' },
  { id: 'exr', label: 'OpenEXR (HDR)', ext: 'exr', backend: 'server', note: '32-bit float HDR.' },
  { id: 'dpx', label: 'DPX', ext: 'dpx', backend: 'server', note: 'Film / DI pipeline.' },
  { id: 'jxl', label: 'JPEG XL', ext: 'jxl', backend: 'server', note: 'Next-gen, where libjxl present.' },
];

export const HW_OPTIONS: HwOption[] = [
  { id: 'auto', label: 'Auto (detect best)' },
  { id: 'nvenc', label: 'NVIDIA NVENC' },
  { id: 'qsv', label: 'Intel QuickSync' },
  { id: 'amf', label: 'AMD AMF' },
  { id: 'none', label: 'CPU (software)' },
];

export function containersFor(kind: MediaKind): Container[] {
  return CONTAINERS.filter((c) => c.kinds.includes(kind));
}

export function kindFromName(name: string): MediaKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const audio = ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'aiff', 'aif', 'caf', 'wma', 'ape', 'wv'];
  const image = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'tga', 'exr', 'dpx', 'jxl', 'gif'];
  if (audio.includes(ext)) return 'audio';
  if (image.includes(ext)) return 'image';
  return 'video';
}

export function extFor(recipe: { containerId: string; imageFormatId?: string }, kind: MediaKind): string {
  if (kind === 'image') return IMAGE_FORMATS.find((f) => f.id === recipe.imageFormatId)?.ext || 'png';
  return CONTAINERS.find((c) => c.id === recipe.containerId)?.ext || 'mp4';
}
