// Disc format law — what a Blu-ray (HDMV) and an Ultra HD Blu-ray may carry, and what each
// destination (burn for print-on-demand, burn short run, press for retail) needs.
// Figures are from the public format overviews (BDA white papers) and replicator spec sheets.

export type DiscFormat = 'BD' | 'UHD';
export type VideoCodec = 'h264' | 'hevc' | 'mpeg2';
export type AudioCodec = 'lpcm' | 'ac3' | 'eac3' | 'dts' | 'truehd' | 'dtshd';
export type Dynamic = 'SDR709' | 'SDR2020' | 'HDR10' | 'HDR10PLUS' | 'DOLBY_VISION';

export interface VideoMode { w: number; h: number; fps: number; scan: 'p' | 'i'; label: string }

const p = (w: number, h: number, fps: number, scan: 'p' | 'i' = 'p'): VideoMode =>
  ({ w, h, fps, scan, label: `${h}${scan}${fps % 1 ? fps.toFixed(3) : fps}` });

/** Allowed primary-video modes. 1080p50/60 is NOT legal on HDMV Blu-ray (only 1080i). */
export const VIDEO_MODES: Record<DiscFormat, VideoMode[]> = {
  BD: [
    p(1920, 1080, 23.976), p(1920, 1080, 24), p(1920, 1080, 25, 'i'), p(1920, 1080, 29.97, 'i'),
    p(1280, 720, 23.976), p(1280, 720, 24), p(1280, 720, 50), p(1280, 720, 59.94),
    p(720, 480, 29.97, 'i'), p(720, 576, 25, 'i'),
  ],
  UHD: [
    p(3840, 2160, 23.976), p(3840, 2160, 24), p(3840, 2160, 25), p(3840, 2160, 29.97), p(3840, 2160, 50), p(3840, 2160, 59.94),
    p(1920, 1080, 23.976), p(1920, 1080, 24), p(1920, 1080, 25), p(1920, 1080, 29.97), p(1920, 1080, 50), p(1920, 1080, 59.94),
  ],
};

export const VIDEO_CODECS: Record<DiscFormat, VideoCodec[]> = { BD: ['h264', 'mpeg2'], UHD: ['hevc'] };
export const DYNAMICS: Record<DiscFormat, Dynamic[]> = { BD: ['SDR709'], UHD: ['SDR709', 'SDR2020', 'HDR10', 'HDR10PLUS', 'DOLBY_VISION'] };

export interface AudioSpec { codec: AudioCodec; label: string; maxKbps: number; maxCh: number; lossless: boolean; licensedEncoder: boolean; note?: string }
export const AUDIO: Record<AudioCodec, AudioSpec> = {
  lpcm:   { codec: 'lpcm',   label: 'LPCM (uncompressed)', maxKbps: 27648, maxCh: 8, lossless: true,  licensedEncoder: false, note: 'Free lossless path — our default for masters.' },
  ac3:    { codec: 'ac3',    label: 'Dolby Digital (AC-3)', maxKbps: 640,  maxCh: 6, lossless: false, licensedEncoder: false, note: 'Patents expired; encoded with our own ffmpeg.' },
  eac3:   { codec: 'eac3',   label: 'Dolby Digital Plus',   maxKbps: 1536, maxCh: 8, lossless: false, licensedEncoder: true,  note: 'Secondary audio only on BD.' },
  dts:    { codec: 'dts',    label: 'DTS core',             maxKbps: 1509, maxCh: 6, lossless: false, licensedEncoder: true },
  truehd: { codec: 'truehd', label: 'Dolby TrueHD / Atmos', maxKbps: 18000, maxCh: 8, lossless: true, licensedEncoder: true, note: 'Needs a Dolby encoder licence.' },
  dtshd:  { codec: 'dtshd',  label: 'DTS-HD Master Audio',  maxKbps: 24500, maxCh: 8, lossless: true, licensedEncoder: true, note: 'Needs a DTS encoder licence.' },
};

export interface Medium {
  id: string; label: string; format: DiscFormat[]; layers: number;
  /** User-data capacity in bytes (before file system). */
  bytes: number;
  /** Max system (mux) rate the player reads this medium at, Mbit/s. */
  systemMbps: number;
  /** Max primary video rate, Mbit/s. */
  videoMbps: number;
  kind: 'BD-R' | 'BD-ROM';
  blankCostUsd?: number;
}

export const MEDIA: Medium[] = [
  { id: 'bdr25',   label: 'BD-R 25 GB (single layer)',    format: ['BD'],        layers: 1, bytes: 25_025_314_816,  systemMbps: 48,  videoMbps: 40,  kind: 'BD-R',  blankCostUsd: 0.6 },
  { id: 'bdr50',   label: 'BD-R DL 50 GB',                 format: ['BD', 'UHD'], layers: 2, bytes: 50_050_629_632,  systemMbps: 82,  videoMbps: 72,  kind: 'BD-R',  blankCostUsd: 2.5 },
  { id: 'bdrxl100', label: 'BD-R XL 100 GB (triple layer)', format: ['BD', 'UHD'], layers: 3, bytes: 100_103_356_416, systemMbps: 128, videoMbps: 100, kind: 'BD-R',  blankCostUsd: 9 },
  { id: 'bd25',    label: 'BD-25 pressed',                 format: ['BD'],        layers: 1, bytes: 25_025_314_816,  systemMbps: 48,  videoMbps: 40,  kind: 'BD-ROM' },
  { id: 'bd50',    label: 'BD-50 pressed',                 format: ['BD'],        layers: 2, bytes: 50_050_629_632,  systemMbps: 48,  videoMbps: 40,  kind: 'BD-ROM' },
  { id: 'uhd50',   label: 'UHD-50 pressed',                format: ['UHD'],       layers: 2, bytes: 50_050_629_632,  systemMbps: 82,  videoMbps: 72,  kind: 'BD-ROM' },
  { id: 'uhd66',   label: 'UHD-66 pressed',                format: ['UHD'],       layers: 2, bytes: 66_571_993_088,  systemMbps: 108, videoMbps: 92,  kind: 'BD-ROM' },
  { id: 'uhd100',  label: 'UHD-100 pressed',               format: ['UHD'],       layers: 3, bytes: 100_103_356_416, systemMbps: 128, videoMbps: 100, kind: 'BD-ROM' },
];
export const mediumById = (id: string) => MEDIA.find(m => m.id === id);

/** HDMV caps BD at 48 Mbit/s system / 40 video regardless of medium. */
export const effectiveRates = (format: DiscFormat, m: Medium) =>
  format === 'BD' ? { systemMbps: Math.min(48, m.systemMbps), videoMbps: Math.min(40, m.videoMbps) } : { systemMbps: m.systemMbps, videoMbps: m.videoMbps };

export type DestinationId = 'burn-pod' | 'burn-run' | 'press-retail';
export interface Destination {
  id: DestinationId; label: string; blurb: string; media: string[];
  needsAacs: boolean; minUnits: number; output: string[];
}
export const DESTINATIONS: Destination[] = [
  { id: 'burn-pod', label: 'Burn · print on demand', blurb: 'One disc per order, burned and printed when a fan buys it.', media: ['bdr25', 'bdr50', 'bdrxl100'], needsAacs: false, minUnits: 1, output: ['BDMV folder', 'ISO (UDF 2.50)', 'Disc label art', 'Burn job sheet'] },
  { id: 'burn-run', label: 'Burn · short run', blurb: 'Festival screeners, crew copies, merch-table stock — 1 to a few hundred.', media: ['bdr25', 'bdr50', 'bdrxl100'], needsAacs: false, minUnits: 1, output: ['ISO (UDF 2.50)', 'Disc label art', 'Duplicator job sheet'] },
  { id: 'press-retail', label: 'Press · retail release', blurb: 'Replicated discs for stores and collectors. The plant premasters and applies AACS.', media: ['bd25', 'bd50', 'uhd50', 'uhd66', 'uhd100'], needsAacs: true, minUnits: 500, output: ['BDMV folder', 'ISO for premastering', 'Press package (manifest, AACS order, artwork)'] },
];
export const destinationById = (id: DestinationId) => DESTINATIONS.find(d => d.id === id)!;

/** Stream count limits per clip (HDMV). */
export const LIMITS = { audio: 32, pgs: 32, ig: 32, angles: 9, chaptersPerPlaylist: 999, titles: 999, playlists: 2000 };

/** Graphics (menus + subtitles) are always a 1920×1080 plane, even on UHD. */
export const GRAPHICS_PLANE = { w: 1920, h: 1080 };

/** File-system + navigation overhead we hold back from capacity. */
export const FS_OVERHEAD = 0.015;
/** Transport-stream overhead on top of the elementary streams (TS packets, PES, ATS). */
export const MUX_OVERHEAD = 0.06;

/** HDMV frame-rate codes used in stream attributes. */
export const FRAME_RATE_CODE = (fps: number) =>
  fps === 23.976 ? 1 : fps === 24 ? 2 : fps === 25 ? 3 : fps === 29.97 ? 4 : fps === 50 ? 6 : fps === 59.94 ? 7 : 2;
