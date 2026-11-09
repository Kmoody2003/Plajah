// services/livewire/types.ts — shared shapes for Project Livewire (Plajah's own live streaming).
// See docs/LIVEWIRE_PLAN.md. Pure types, safe in browser, server and desktop bridge.

/** What is on screen decides how many bits a picture needs. */
export type ContentKind = 'slides' | 'talk' | 'worship' | 'music' | 'sports' | 'game';

/** GPU (or CPU) encoder families the bundled ffmpeg can drive. */
export type EncoderFamily = 'nvenc' | 'qsv' | 'amf' | 'x264';

export type VideoCodec = 'h264' | 'av1';

export type RungName = '1080p' | '720p' | '480p' | '360p' | 'av1_1080p' | 'av1_720p' | 'audio';

export interface Rung {
  name: RungName;
  codec: VideoCodec | 'none';
  width: number;
  height: number;
  fps: number;
  /** Target video bitrate (kbps). 0 for the audio-only rung. */
  videoKbps: number;
  /** Peak video bitrate the encoder may hit (kbps). */
  maxKbps: number;
  audioKbps: number;
}

export interface LadderInput {
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
  /** Measured upload speed of the broadcaster (kbps). */
  uplinkKbps: number;
  encoder: EncoderFamily;
  content: ContentKind;
  /** The GPU can encode AV1 (RTX 40+, Arc, RX 7000). Adds AV1 rungs when the uplink allows. */
  av1?: boolean;
  /** Most rungs this tier may publish (quality is the tier lever, never minutes). */
  maxHeight?: 1080 | 720 | 480;
}

export interface LadderPlan {
  rungs: Rung[];
  /** Sum of everything the broadcaster uploads (kbps). */
  uploadKbps: number;
  /** Encoder sessions the GPU must run at once. */
  encoderSessions: number;
  /**
   * 'desktop' = the broadcaster's machine encodes the whole ladder.
   * 'relay'   = uplink/GPU too weak: send one rung, the Livewire relay builds the ladder.
   */
  mode: 'desktop' | 'relay';
  notes: string[];
}

/** Where encoded rungs go. */
export type EncodeOutput =
  | { kind: 'srt'; host: string; port?: number; streamId: string; token: string }
  | { kind: 'rtmp'; host: string; port?: number; streamId: string; token: string }
  /** Local HLS ladder with a master playlist — end-to-end test with no server. */
  | { kind: 'hls-local'; dir: string; segmentSeconds?: number };

export type LiveTarget = 'mux' | 'livewire';
