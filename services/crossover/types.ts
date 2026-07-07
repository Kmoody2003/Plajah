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
export type Backend = 'client' | 'server';

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
}

export interface ConvertProgress {
  progress: number; // 0..1
  speed?: string; // "3.4x"
  etaSec?: number;
  line?: string; // raw ffmpeg log line
}

export interface ConvertResult {
  /** Object URL (client) or download URL (server) for the produced file. */
  outputUrl: string;
  outputName: string;
  backend: Backend;
  sizeBytes?: number;
  /** Present for client conversions so the app can offer a direct download. */
  blob?: Blob;
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
