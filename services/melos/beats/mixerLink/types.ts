// Chora mixer link — how a hardware console (PreSonus StudioLive first) becomes Chora tracks.
//
// Two planes, kept apart on purpose:
//   AUDIO   — how samples reach Chora: USB (ASIO/WASAPI in the native engine), AVB, Dante, or a
//             multitrack folder the console recorded to its SD card. Recording depends only on this.
//   CONTROL — how Chora learns about / drives the console: UCNET (PreSonus's private TCP protocol,
//             community-reverse-engineered), AVDECC (IEEE 1722.1, the AVB control protocol), MIDI.
//             Control is optional: if the console stops answering, recording never stops.
//
// Every fact about hardware records where it came from (`FactSource`) so the UI never shows a
// channel name, clock lock or stream that wasn't actually observed.

/** How audio samples arrive. 'browser' = getUserMedia (stereo-ish; web fallback only). */
export type AudioTransport = 'usb-asio' | 'usb-wasapi' | 'avb' | 'dante' | 'sd-import' | 'browser';

/** How Chora talks to the console about everything except audio. */
export type ControlLink = 'ucnet' | 'avdecc' | 'midi';

/** Where a fact came from. 'user' facts are never overwritten by a re-sync. */
export type FactSource = 'ucnet' | 'avdecc' | 'asio' | 'wasapi' | 'sd-session' | 'model-table' | 'user';

export type MixerFamily = 'studiolive-iii' | 'studiolive-ai' | 'generic';

/** What the host can actually do right now for one transport/link — drives honest UI states. */
export interface LinkReadiness {
  kind: AudioTransport | ControlLink;
  status: 'ready' | 'no-device' | 'needs-driver' | 'needs-packet-driver' | 'needs-desktop-app' | 'unsupported-os';
  /** Human sentence: "Install the PreSonus Universal Control ASIO driver", "Npcap not installed". */
  detail?: string;
}

/** One way audio reaches Chora from a device. */
export interface AudioEndpoint {
  transport: AudioTransport;
  /** asio driver key | avb stream id (EUI-64 + index) | dante device name | SD folder path. */
  endpointId: string;
  inputs: number;          // channels INTO Chora (console → computer)
  outputs: number;         // channels OUT of Chora (playback returns / virtual soundcheck)
  sampleRates: number[];
  /** Device-side input names exactly as the driver/stream reports them (may be "In 1"). */
  inputNames?: string[];
  source: FactSource;
}

/** One way Chora can talk to a device. */
export interface ControlEndpoint {
  link: ControlLink;
  /** 'ip:port' for UCNET, EUI-64 entity id for AVDECC, MIDI port id for MIDI. */
  address: string;
  /** What this link proved it can do on this device (filled by probing, not assumed). */
  can: Array<'names' | 'colors' | 'meters' | 'mutes' | 'faders' | 'scenes' | 'input-source' | 'stream-connect'>;
}

/** A console / interface Chora has seen. Stable across sessions by `id`. */
export interface MixerDevice {
  /** 'presonus:<serial>' when known, else 'avb:<entityId>' / 'asio:<driverKey>'. */
  id: string;
  vendor: 'presonus' | 'generic';
  family: MixerFamily;
  model: string;           // "StudioLive 32SX"
  serial?: string;
  firmware?: string;
  audio: AudioEndpoint[];
  control: ControlEndpoint[];
  lastSeenAt: number;
}

/** Where a console channel's signal comes from (Series III: per-channel input source select). */
export type ChannelInputSource = 'analog' | 'network' | 'usb' | 'sd';

/** One channel strip on the console. `index` is 1-based, as printed on the desk. */
export interface MixerChannel {
  index: number;
  name: string;
  nameSource: FactSource;
  color?: string;          // '#rrggbb'
  /** Partner channel when the strip is stereo-linked (left strip holds the link). */
  linkedWith?: number;
  inputSource?: ChannelInputSource;
  /** 0-based input on the AudioEndpoint that carries this channel to Chora (USB send routing). */
  endpointInput?: number;
}

/** Console state at a moment — saved with each take so a mix can start from the board. */
export interface MixerSnapshot {
  id: string;
  deviceId: string;
  capturedAt: number;
  sceneName?: string;
  channels: Array<{ index: number; faderDb: number; mute: boolean; pan: number }>;
  /** Opaque protocol payload for exact recall on the same console model. Never interpreted by UI. */
  raw?: { link: ControlLink; family: MixerFamily; data: string /* base64 */ };
}

/** Per-track input binding — lives on ArrangeTrack.input. Mono unless `inputR` is set. */
export interface TrackInput {
  deviceId: string;
  transport: AudioTransport;
  endpointId: string;
  input: number;           // 0-based endpoint input
  inputR?: number;         // stereo partner
  /** The console channel this came from, for re-sync of names/colors and soundcheck routing. */
  mixerChannel?: number;
  monitor?: 'off' | 'auto' | 'on';
}

/** Session-level link — lives on GrooveDoc.mixerLink. */
export interface MixerLinkSession {
  deviceId: string;
  model: string;
  family: MixerFamily;
  sampleRate: number;
  /** Channel list as of the last sync (names/colors seen at record time). */
  channels: MixerChannel[];
  snapshots?: MixerSnapshot[];
  /** Recent record passes (newest last, capped) — where the files are and how healthy each was. */
  takes?: MultitrackTake[];
  /** Console channels currently switched to USB playback by Chora (virtual soundcheck). Restored on stop. */
  soundcheck?: { active: boolean; channels: number[]; previous: Array<{ index: number; source: ChannelInputSource }> };
}

/** One record pass across many tracks. Clips reference `sampleKey`s written by the capture engine. */
export interface MultitrackTake {
  id: string;
  deviceId: string;
  transport: AudioTransport;
  sampleRate: number;
  startedAt: number;
  startBeats: number;
  durationSec: number;
  tracks: Array<{ trackId: string; input: number; inputR?: number; sampleKey: string }>;
  /** The original per-input files on this computer (desktop app), kept after import. */
  folder?: string;
  snapshotId?: string;
  /** Honest health counters from the engine — shown on the take, never hidden. `xruns` is absent
   *  when the driver API doesn't report them (ASIO doesn't), rather than claiming zero. */
  health: { xruns?: number; droppedFrames: number; clippedTracks: string[] };
}
