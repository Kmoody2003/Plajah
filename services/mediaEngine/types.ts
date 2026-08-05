// mediaEngine/types.ts — the shared data model for the Plajah Media Engine.
//
// One UI, capability-gated, over a native engine (Tauri/Rust+GStreamer) or the
// browser's WebRTC-only subset. Every input implements VideoSource; the router,
// switcher and sync engine operate on these regardless of how frames are acquired.
// See the handoff spec (Router · Switcher · TBC · Codec stack).

export type SourceKind = 'decklink' | 'ndi' | 'srt' | 'rtmp' | 'webrtc' | 'uvc' | 'file' | 'braw';

export type Tally = 'off' | 'preview' | 'program';

export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
  interlaced?: boolean;
  colorspace?: string; // 'bt709' | 'bt2020' | ...
}

/** A live frame handle. In the browser this wraps a MediaStream; native wraps a
 *  GPU texture / shared-memory handle from GStreamer. */
export interface FrameRef {
  stream?: MediaStream;   // browser sources
  textureId?: string;     // native GPU handle (opaque to the UI)
}

export interface VideoSource {
  id: string;
  label: string;
  kind: SourceKind;
  formats: VideoFormat[];
  clockDomain?: string;          // 'ptp' | 'soft-master' | 'hw-genlock'
  latencyMs: number;             // measured transport latency (feeds the TBC)
  tally: Tally;
  /** Live preview stream once connected (browser sources). */
  stream?: MediaStream | null;
  connected: boolean;
  connect(): Promise<void>;
  onFrame(cb: (frame: FrameRef) => void): void;
  dispose(): void;
}

export type DestinationKind = 'switcherInput' | 'aux' | 'multiview' | 'record' | 'stream' | 'monitor';

export interface Destination {
  id: string;
  label: string;
  kind: DestinationKind;
  locked?: boolean;
}

export interface Salvo {
  id: string;
  name: string;
  routes: Record<string, string>; // destId -> srcId
}

export interface RouterState {
  sources: VideoSource[];
  destinations: Destination[];
  routes: Record<string, string>;        // destId -> srcId (video, audio-follows by default)
  audioRoutes?: Record<string, string>;  // optional audio breakaway
  salvos: Salvo[];
  locks: Record<string, boolean>;        // destId -> locked
}

export type TransitionType = 'cut' | 'mix' | 'dip' | 'wipe' | 'dve';

export interface Keyer {
  id: string;
  type: 'chroma' | 'luma' | 'linear' | 'dve';
  on: boolean;
  source?: string;
}

export interface SwitcherState {
  inputs: string[];                       // router destinations feeding the switcher
  program: string;                        // destId currently on PGM
  preview: string;                        // destId on PVW
  transition: { type: TransitionType; rateFrames: number; position: number };
  usk: Keyer[];
  dsk: Keyer[];
  aux: Record<string, string>;
}

export type MasterClock = 'ptp' | 'soft' | 'hw-ref';
export type SourceHealth = 'ok' | 'jitter' | 'starved';

export interface SyncEngine {
  masterClock: MasterClock;
  syncTargetMs: number;                   // global alignment window (250–2000)
  houseFormat: VideoFormat;
  perSource: Record<string, { measuredLatencyMs: number; offsetMs: number; health: SourceHealth }>;
}

/** Host-reported feature flags — which source kinds this build can actually acquire. */
export interface Capabilities {
  host: 'browser' | 'tauri' | 'capacitor';
  platform: 'windows' | 'macos' | 'android' | 'ios' | 'linux' | 'unknown';
  sources: Record<SourceKind, boolean>;
  hardwareGenlock: boolean;   // DeckLink SDI ref / PTP available
  ndi: boolean;
  brawDecode: boolean;
  webgpu: boolean;
}

export const DEFAULT_HOUSE_FORMAT: VideoFormat = { width: 1920, height: 1080, fps: 59.94, colorspace: 'bt709' };

export const KIND_LABEL: Record<SourceKind, string> = {
  decklink: 'DeckLink', ndi: 'NDI', srt: 'SRT', rtmp: 'RTMP',
  webrtc: 'WebRTC', uvc: 'Webcam', file: 'File', braw: 'BRAW',
};

/** Which kinds need native code (unavailable in a browser tab). */
export const NATIVE_ONLY: SourceKind[] = ['decklink', 'ndi', 'srt', 'rtmp', 'braw'];
