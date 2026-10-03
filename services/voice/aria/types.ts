/** Shared types for the Aria voice service. Vendor-neutral: surfaces talk to ariaVoice, never to a TTS API. */

export type VoiceProviderId = string;

export interface VoiceProfile {
  id: string;
  name: string;
  persona: 'aria' | 'narrator' | 'buddy';
  rate: number;
  pitch: number;
  /** Optional reference clips (URLs) for providers that support voice cloning. */
  referenceClips?: string[];
  /** Per-provider settings, e.g. { kokoro: { voice: 'af_heart' } }. */
  providerPrefs: Record<VoiceProviderId, { voice?: string; [k: string]: unknown }>;
  /** Provider ids tried in order; unavailable or failing ones are skipped. */
  fallbackOrder: VoiceProviderId[];
  /** Never leave the device (kids / COPPA). Cascade skips providers whose kind is not 'device'. */
  onDeviceOnly?: boolean;
}

export interface WordMark { i: number; startMs: number; endMs: number; text: string }
/** Boundary-style word event from a streaming device voice (`i` = word index when known). */
export interface WordEvent { charIndex: number; i?: number }

export interface SpeakResult {
  audio?: Blob | string;
  marks: WordMark[];
  durationMs: number;
  provider: string;
  cached: boolean;
}

export interface SpeakOptions {
  onWord?: (m: WordMark | WordEvent) => void;
  onStart?: () => void;
  onEnd?: () => void;
  signal?: AbortSignal;
  speed?: number;
  lang?: string;
}

export interface VoiceProvider {
  id: VoiceProviderId;
  label: string;
  kind: 'device' | 'server' | 'cloud';
  available(): Promise<boolean>;
  /** Returns audio + timings. ariaVoice plays it. */
  synth?(text: string, profile: VoiceProfile, opts: SpeakOptions): Promise<SpeakResult>;
  /** Streams straight to the device speaker. Should always resolve. */
  speak?(text: string, profile: VoiceProfile, opts: SpeakOptions): Promise<void>;
  cancel(): void;
}

export interface VoiceState { speaking: boolean; provider: string | null; profileId: string }
