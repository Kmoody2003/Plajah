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
  { id: 'm2t', label: 'Sony HDV (.m2t)', ext: 'm2t', kinds: ['video'], note: 'Sony HDV MPEG-2 Transport Stream.' },
  { id: 'crm', label: 'Canon RAW (.crm)', ext: 'crm', kinds: ['video'], note: 'Canon Cinema RAW Light.' },
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
  { id: 'mxf', label: 'MXF', ext: 'mxf', kinds: ['video'], note: 'The broadcast and playout wrapper. Audio is 48 kHz PCM.' },
  { id: 'gxf', label: 'GXF', ext: 'gxf', kinds: ['video'], note: 'Grass Valley servers.' },
];

export const VIDEO_CODECS: Codec[] = [
  { id: 'h264', label: 'H.264 / AVC', encoder: 'libx264', kind: 'video', backend: 'either', note: 'Browser (WebCodecs) for short clips; cloud for heavy jobs.' },
  { id: 'h265', label: 'H.265 / HEVC', encoder: 'libx265', kind: 'video', backend: 'server' },
  { id: 'av1', label: 'AV1', encoder: 'libsvtav1', kind: 'video', backend: 'server', note: 'SVT-AV1 — fast, royalty-free.' },
  { id: 'vp9', label: 'VP9', encoder: 'libvpx-vp9', kind: 'video', backend: 'server' },
  { id: 'mpeg2', label: 'MPEG-2', encoder: 'mpeg2video', kind: 'video', backend: 'server', note: 'High-quality MPEG-2 target (DVD / broadcast).' },
  { id: 'mainconcept_mpeg2', label: 'MainConcept MPEG-2 (Broadcast/XDCAM/HDV)', encoder: 'mpeg2video', kind: 'video', backend: 'server', note: 'Hardware-accelerated MPEG-2 via MainConcept / Windows MFT.' },
  { id: 'xavc', label: 'Sony XAVC (Intra/Long GOP)', encoder: 'libx264', kind: 'video', backend: 'server', note: 'Broadcast-grade Sony XAVC Intra Class 100/300.' },
  { id: 'prores', label: 'Apple ProRes', encoder: 'prores_ks', kind: 'video', backend: 'server', note: '422 / 4444 mastering. Free encoder.' },
  { id: 'dnxhr', label: 'Avid DNxHR / DNxHD', encoder: 'dnxhd', kind: 'video', backend: 'server', note: 'Editing-friendly intermediate.' },
  { id: 'ffv1', label: 'FFV1 (lossless)', encoder: 'ffv1', kind: 'video', backend: 'server', lossless: true, note: 'Archival lossless.' },
  { id: 'cfhd', label: 'GoPro CineForm', encoder: 'cfhd', kind: 'video', backend: 'server', note: 'Fast 10-bit editing intermediate.' },
  { id: 'hap', label: 'HAP', encoder: 'hap', kind: 'video', backend: 'server', note: 'GPU-decoded playback for media servers. Width and height must divide by 4.' },
  { id: 'jpeg2000', label: 'JPEG 2000', encoder: 'libopenjpeg', kind: 'video', backend: 'server', note: 'Archive and cinema mezzanine. Slow.' },
  { id: 'vvc', label: 'H.266 / VVC', encoder: 'libvvenc', kind: 'video', backend: 'server', note: 'Newest compression. Very slow, few players.' },
  { id: 'xvid', label: 'MPEG-4 Part 2 (Xvid)', encoder: 'libxvid', kind: 'video', backend: 'server', note: 'For older hardware.' },
  { id: 'mjpeg', label: 'Motion JPEG', encoder: 'mjpeg', kind: 'video', backend: 'server' },
  { id: 'utvideo', label: 'Ut Video (lossless)', encoder: 'utvideo', kind: 'video', backend: 'server', lossless: true },
  { id: 'v210', label: 'Uncompressed 10-bit (v210)', encoder: 'v210', kind: 'video', backend: 'server', lossless: true, note: 'Very large files.' },
  { id: 'qtrle', label: 'QuickTime Animation', encoder: 'qtrle', kind: 'video', backend: 'server', lossless: true, note: 'Keeps alpha.' },
  { id: 'dv', label: 'DV (NTSC)', encoder: 'dvvideo', kind: 'video', backend: 'server', note: 'Always 720x480 at 29.97.' },
  { id: 'braw', label: 'Blackmagic RAW', encoder: '(sdk)', kind: 'video', backend: 'server', note: 'Decode-only via free BRAW SDK — no tool can freely ENCODE BRAW.' },
  { id: 'arriraw', label: 'ARRIRAW', encoder: '(sdk)', kind: 'video', backend: 'server', note: 'Decode-only via ARRI RAW SDK.' },
  { id: 'r3d', label: 'RED R3D', encoder: '(sdk)', kind: 'video', backend: 'server', note: 'Decode-only via RED R3D SDK.' },
  { id: 'canon_crm', label: 'Canon Cinema RAW Light', encoder: '(sdk)', kind: 'video', backend: 'server', note: 'Decode-only via Canon CRM SDK.' },
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
  { id: 'mp2', label: 'MPEG Audio Layer II', encoder: 'mp2', kind: 'audio', backend: 'server', note: 'The usual audio for MPEG-2 transport streams.' },
  { id: 'opus', label: 'Opus', encoder: 'libopus', kind: 'audio', backend: 'either' },
  { id: 'vorbis', label: 'Vorbis', encoder: 'libvorbis', kind: 'audio', backend: 'server' },
  { id: 'ac3', label: 'Dolby Digital (AC-3)', encoder: 'ac3', kind: 'audio', backend: 'server' },
  { id: 'eac3', label: 'Dolby Digital Plus (E-AC-3)', encoder: 'eac3', kind: 'audio', backend: 'server' },
  { id: 'dts', label: 'DTS', encoder: 'dca', kind: 'audio', backend: 'server', note: 'ffmpeg marks this encoder experimental.' },
  { id: 'truehd', label: 'Dolby TrueHD', encoder: 'truehd', kind: 'audio', backend: 'server', lossless: true, note: 'ffmpeg marks this encoder experimental.' },
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

// What may actually be written. RAW codecs decode only, and .crm has no free muxer.
export const OUTPUT_VIDEO_CODECS = VIDEO_CODECS.filter((c) => c.encoder !== '(sdk)' && c.id !== 'mainconcept_mpeg2' && c.id !== 'xavc');
const OUTPUT_AUDIO_CODECS = AUDIO_CODECS.filter((c) => c.id !== 'iamf');
const NOT_OUTPUT_CONTAINERS = new Set(['crm']);

const CONTAINER_VIDEO: Record<string, string[] | undefined> = {
  webm: ['vp9', 'av1'],
  mp4: ['h264', 'h265', 'av1', 'vp9', 'vvc', 'mpeg2', 'xvid', 'mjpeg'],
  mxf: ['mpeg2', 'dnxhr', 'h264', 'prores', 'jpeg2000', 'dv'],
  gxf: ['mpeg2'],
  mpegts: ['h264', 'h265', 'mpeg2'],
  mpeg: ['mpeg2'],
  m2t: ['mpeg2', 'h264'],
  mov: ['h264', 'h265', 'prores', 'dnxhr', 'cfhd', 'hap', 'jpeg2000', 'mpeg2', 'mjpeg', 'qtrle', 'v210', 'utvideo', 'dv'],
  avi: ['h264', 'mpeg2', 'ffv1', 'xvid', 'mjpeg', 'utvideo', 'cfhd', 'dv'],
  gif: [],
};
const CONTAINER_AUDIO: Record<string, string[] | undefined> = {
  webm: ['opus', 'vorbis'],
  mp4: ['aac', 'mp3', 'opus', 'alac', 'flac', 'ac3', 'eac3'],
  mxf: ['pcm_s24le', 'pcm_s16le'],
  gxf: ['pcm_s16le'],
  m4a: ['aac', 'alac'],
  mov: ['aac', 'alac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3', 'ac3'],
  mpegts: ['mp2', 'aac', 'mp3', 'opus', 'ac3', 'eac3'],
  mpeg: ['mp2', 'mp3'],
  m2t: ['mp2', 'aac', 'mp3'],
  avi: ['mp3', 'pcm_s16le', 'pcm_s24le'],
  flac: ['flac'],
  mp3: ['mp3'],
  ogg: ['opus', 'vorbis', 'flac'],
  opus: ['opus'],
  wav: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le', 'pcm_u8', 'pcm_mulaw', 'pcm_alaw', 'adpcm_ms'],
  aiff: ['pcm_s16le', 'pcm_s24be'],
  caf: ['pcm_s16le', 'pcm_s24le', 'alac', 'aac'],
  gif: [],
};
export const videoCodecsFor = (containerId: string) => {
  const allowed = CONTAINER_VIDEO[containerId];
  if (allowed) return OUTPUT_VIDEO_CODECS.filter((c) => allowed.includes(c.id));
  // Matroska takes nearly anything, but QuickTime Animation comes out unreadable.
  return OUTPUT_VIDEO_CODECS.filter((c) => c.id !== 'qtrle');
};
export const audioCodecsFor = (containerId: string) => {
  const allowed = CONTAINER_AUDIO[containerId];
  return allowed ? OUTPUT_AUDIO_CODECS.filter((c) => allowed.includes(c.id)) : OUTPUT_AUDIO_CODECS;
};

export function containersFor(kind: MediaKind): Container[] {
  return CONTAINERS.filter((c) => c.kinds.includes(kind) && !NOT_OUTPUT_CONTAINERS.has(c.id));
}

export interface RecipePreset { id: string; label: string; note: string; kinds: MediaKind[]; recipe: Partial<import('./types').Recipe> }

const SAME_SIZE = { width: undefined, height: undefined, fps: undefined };
export const RECIPE_PRESETS: RecipePreset[] = [
  { id: 'web-h264', label: 'Web H.264', note: 'MP4 that plays anywhere.', kinds: ['video'], recipe: { containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', qualityMode: 'crf', crf: 20, audioBitrate: '192k', ...SAME_SIZE } },
  { id: '1080p', label: '1080p H.264', note: 'Downscale to full HD.', kinds: ['video'], recipe: { containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', qualityMode: 'crf', crf: 20, audioBitrate: '192k', ...SAME_SIZE, height: 1080 } },
  { id: 'hevc', label: 'HEVC small', note: 'Half the size, newer players.', kinds: ['video'], recipe: { containerId: 'mp4', videoCodecId: 'h265', audioCodecId: 'aac', qualityMode: 'crf', crf: 24, audioBitrate: '192k', ...SAME_SIZE } },
  { id: 'prores-hq', label: 'ProRes 422 HQ', note: 'Mastering and editing.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'prores', audioCodecId: 'pcm_s24le', proresProfile: '3', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'dnxhr', label: 'DNxHR HQ', note: 'Avid-friendly intermediate.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'dnxhr', audioCodecId: 'pcm_s24le', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'playout-mpeg2', label: 'MPEG-2 playout', note: 'Transport stream for air.', kinds: ['video'], recipe: { containerId: 'mpegts', videoCodecId: 'mpeg2', audioCodecId: 'mp2', qualityMode: 'bitrate', videoBitrate: '25M', audioBitrate: '384k', ...SAME_SIZE } },
  { id: 'xdcam-hd422', label: 'XDCAM HD422 MXF', note: '50 Mb/s MPEG-2 4:2:2 in MXF, for playout.', kinds: ['video'], recipe: { containerId: 'mxf', videoCodecId: 'mpeg2', audioCodecId: 'pcm_s24le', mpeg2Profile: 'xdcam50', qualityMode: 'bitrate', ...SAME_SIZE, width: 1920, height: 1080 } },
  { id: 'dnxhr-mxf', label: 'DNxHR HQX MXF', note: '10-bit DNxHR for Avid and servers.', kinds: ['video'], recipe: { containerId: 'mxf', videoCodecId: 'dnxhr', audioCodecId: 'pcm_s24le', dnxProfile: 'dnxhr_hqx', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'prores-4444', label: 'ProRes 4444', note: 'Mastering with alpha.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'prores', audioCodecId: 'pcm_s24le', proresProfile: '4', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'prores-proxy', label: 'ProRes Proxy', note: 'Small offline editing copies.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'prores', audioCodecId: 'pcm_s16le', proresProfile: '0', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'cineform', label: 'CineForm', note: '10-bit editing intermediate.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'cfhd', audioCodecId: 'pcm_s24le', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'hap', label: 'HAP', note: 'For media servers.', kinds: ['video'], recipe: { containerId: 'mov', videoCodecId: 'hap', audioCodecId: 'pcm_s16le', qualityMode: 'crf', ...SAME_SIZE } },
  { id: 'archive-ffv1', label: 'FFV1 archive', note: 'Lossless preservation in Matroska.', kinds: ['video'], recipe: { containerId: 'mkv', videoCodecId: 'ffv1', audioCodecId: 'flac', qualityMode: 'lossless', ...SAME_SIZE } },
  { id: 'wav-48-24', label: 'WAV 24-bit', note: 'Broadcast audio.', kinds: ['audio', 'video'], recipe: { containerId: 'wav', audioCodecId: 'pcm_s24le', sampleRate: 48000 } },
  { id: 'mp3-320', label: 'MP3 320', note: 'Everyday audio.', kinds: ['audio', 'video'], recipe: { containerId: 'mp3', audioCodecId: 'mp3', audioBitrate: '320k', qualityMode: 'crf' } },
];

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
