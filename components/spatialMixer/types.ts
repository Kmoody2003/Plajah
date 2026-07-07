// Spatial audio (Eclipsa / IAMF) mixer types — ported from SonicSphere.
// See docs/ECLIPSA_SPATIAL_AUDIO_PLAN.md.
export interface AudioPlugin {
  id: string;
  name: string;
  type: 'wam' | 'internal';
  node: AudioNode | null;
  bypassed: boolean;
}

export interface AutomationKeyframe { time: number; value: number; }
export interface AutomationLane { parameter: string; keyframes: AutomationKeyframe[]; }

export interface IAMFMetadata {
  id: string;
  groupType: 'scene' | 'object';
  description?: string;
  priority?: number;
}

export interface AudioClip {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  startTime: number;
  duration: number;
  offset: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  file?: File | null;      // original source (kept for locker upload on Save)
  sourceUrl?: string;      // remote locker URL once a saved project has uploaded the stem
  buffer: AudioBuffer | null;
  clips: AudioClip[];
  position: [number, number, number]; // x, y, z
  volume: number;
  muted: boolean;
  panner: PannerNode | null;
  gainNode: GainNode | null;
  sourceNodes: AudioBufferSourceNode[];
  plugins: AudioPlugin[];
  analyser: AnalyserNode | null;
  eq?: { low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode };
  dynamics?: { compressor: DynamicsCompressorNode };
  automation: AutomationLane[];
  iamf?: IAMFMetadata;
}

export interface SpatialMix {
  id: string;
  name: string;
  tracks: AudioTrack[];
  masterPlugins: AudioPlugin[];
}

// Serialized, Firestore-safe form of one track (no AudioNodes / AudioBuffer).
export interface SerializedTrack {
  id: string;
  name: string;
  sourceUrl: string;                 // locker URL to re-fetch the stem
  position: [number, number, number];
  volume: number;
  muted: boolean;
  eq: { low: number; mid: number; high: number };
  iamf?: IAMFMetadata;
}

// A saved spatial-mix project (owner-only, collection `spatial_mixes`).
export interface SpatialMixProject {
  id: string;
  ownerId: string;
  name: string;
  masterVolume: number;
  tracks: SerializedTrack[];
  iamf: any;                         // full IAMF authoring descriptor
  createdAt: number;
  updatedAt: number;
}
