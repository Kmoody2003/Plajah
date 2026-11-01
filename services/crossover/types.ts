// ─────────────────────────────────────────────────────────────────────────
// Crossover — shared conversion domain types.
//
// This module is the single source of truth for the Crossover media converter
// that powers three consumers inside Plajah: the standalone Crossover app, the
// Fabula editor (import transcode + finalize), and the Content Asset Manager.
// It is UI-agnostic and backend-agnostic — see engine.ts for the router.
// ─────────────────────────────────────────────────────────────────────────

export type MediaKind = 'video' | 'audio' | 'image';

export type JobStatus =
  | 'queued'
  | 'probing'
  | 'running'
  | 'done'
  | 'error'
  | 'canceled';

/** Where a job actually executes. */
export type Backend = 'client' | 'server' | 'native';

export type HwAccel = 'auto' | 'none' | 'nvenc' | 'qsv' | 'amf' | 'vaapi' | 'videotoolbox';

/** A source file added to the queue (browser File or a resolved URL/path). */
export interface SourceFile {
  id: string;
  name: string;
  kind: MediaKind;
  sizeBytes: number;
  /** Present when the source is a live browser File (client conversions). */
  file?: File;
  /** Present when the source already lives at a URL (Storage / on-platform). */
  url?: string;
  /** Full path on this PC, in the desktop app. Native jobs read the file directly. */
  path?: string;
  probe?: MediaProbe;
}

/** What we learned about a file's real contents (from ffprobe or a client probe). */
export interface MediaProbe {
  container: string;
  durationSec?: number;
  bitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  /** Container looks unfinalized / truncated (e.g. crashed OBS): missing moov atom. */
  needsFinalize?: boolean;
  /** ffprobe reported structural / decode errors. */
  corrupt?: boolean;
  warnings: string[];
  /** Every stream in the file, for the inspector. Only ffprobe can fill this. */
  streams?: ProbeStream[];
  formatName?: string;
  tags?: Record<string, string>;
}

export interface ProbeStream {
  index: number;
  type: string;
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  fps?: number;
  pixFmt?: string;
  colorSpace?: string;
  fieldOrder?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitrate?: number;
  language?: string;
  timecode?: string;
}

export type QualityMode = 'crf' | 'bitrate' | 'lossless';

/** The chosen output settings. */
export interface Recipe {
  containerId: string;
  videoCodecId?: string;
  audioCodecId?: string;
  imageFormatId?: string;
  hwAccel: HwAccel;
  qualityMode: QualityMode;
  crf?: number;
  videoBitrate?: string; // "8M"
  audioBitrate?: string; // "320k"
  sampleRate?: number;
  channels?: number;
  binauralDownmix?: boolean;
  stripMetadata?: boolean;
  fixTimestamps?: boolean;
  /** Resize; leave one blank to keep the aspect ratio. */
  width?: number;
  height?: number;
  fps?: number;
  /** prores_ks profile: 0 Proxy, 1 LT, 2 422, 3 HQ, 4 4444. */
  proresProfile?: string;
  /** dnxhr_lb, dnxhr_sq, dnxhr_hq, dnxhr_hqx or dnxhr_444. */
  dnxProfile?: string;
  /** xdcam50 sets the fixed-rate XDCAM HD422 encode. */
  mpeg2Profile?: string;
}

export interface ConvertProgress {
  progress: number; // 0..1
  speed?: string; // "3.4x"
  etaSec?: number;
  line?: string; // raw ffmpeg log line
  /** A picture of what is converting right now: an image URL, or a canvas being drawn to. */
  previewUrl?: string;
  previewCanvas?: HTMLCanvasElement;
  /** Position in the source. */
  outSec?: number;
}

export interface ConvertResult {
  /** Object URL (client) or download URL (server) for the produced file. */
  outputUrl: string;
  outputName: string;
  backend: Backend;
  sizeBytes?: number;
  /** Present for client conversions so the app can offer a direct download. */
  blob?: Blob;
  /** Where a native job wrote its result. */
  outputPath?: string;
}

export interface Job {
  id: string;
  source: SourceFile;
  recipe: Recipe;
  status: JobStatus;
  backend: Backend;
  progress: number;
  speed?: string;
  etaSec?: number;
  result?: ConvertResult;
  error?: string;
}
