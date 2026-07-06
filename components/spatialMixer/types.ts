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
