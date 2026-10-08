// mediaEngine/blackmagic/protocol.ts — wire contract between the Plajah app and the Plajah Bridge
// (packages/blackmagic-bridge), the LAN agent that talks to Blackmagic hardware.
//
// Why a bridge: ATEM control is UDP and camera/HyperDeck control is plain HTTP/TCP on the LAN. A browser tab
// (or a phone shell served over https) can open neither, so a small local agent does the network work and the
// app speaks one JSON-over-WebSocket protocol to it. Both sides import this file so they cannot drift.

export const BRIDGE_PROTOCOL_VERSION = 1;
export const DEFAULT_BRIDGE_PORT = 8787;

export type BmDeviceKind = 'atem' | 'camera' | 'hyperdeck' | 'videohub' | 'phone' | 'unknown';
export type BmLinkState = 'discovered' | 'connecting' | 'connected' | 'lost' | 'error';

/** How a device came to be known — shown in the UI so nobody mistakes a typed address for an announcement. */
export type BmOrigin = 'mdns' | 'manual' | 'ingest';

export interface BmDevice {
  id: string;                 // stable: `${kind}:${host}` (mDNS names can change; the address is what we control)
  kind: BmDeviceKind;
  name: string;
  host: string;
  port?: number;
  model?: string;
  origin: BmOrigin;
  link: BmLinkState;
  detail?: string;
  lastSeen: number;
}

// ── ATEM ─────────────────────────────────────────────────────────────────────
export type AtemTransitionStyle = 'mix' | 'dip' | 'wipe' | 'dve' | 'sting';

export interface AtemInputInfo { index: number; shortName: string; longName: string; port: string }

export interface AtemMeState {
  program: number;
  preview: number;
  inTransition: boolean;
  /** 0..1 T-bar / auto-transition progress. */
  position: number;
  style: AtemTransitionStyle;
  ftbBlack: boolean;
}

export interface AtemSnapshot {
  deviceId: string;
  model: string;
  inputs: AtemInputInfo[];
  me: AtemMeState[];
  macros: Array<{ index: number; name: string }>;
}

// ── Camera ───────────────────────────────────────────────────────────────────
export interface CameraSnapshot {
  deviceId: string;
  recording?: boolean;
  /** Last value seen for each REST property path (e.g. '/video/iso'). Opaque JSON from the camera. */
  props: Record<string, unknown>;
  /** Property paths the camera itself says it supports (from its listProperties reply). */
  available: string[];
}

// ── Ingest (cameras / phones that PUSH a stream to us) ───────────────────────
export interface IngestInfo {
  /** Where an encoder should send. Shown to the user for cameras that need a URL typed in. */
  rtmpUrl?: string;
  srtUrl?: string;
  mediaMtxApi?: string;
  available: boolean;
  reason?: string;
}

export interface IngestStream {
  id: string;                 // `ingest:${path}`
  path: string;               // MediaMTX path name
  whepUrl: string;            // WHEP endpoint the engine's WhepSource can subscribe to
  sourceType?: string;        // 'rtmpConn' | 'srtConn' | ...
  remoteHost?: string;        // publisher address, used to match a discovered camera/phone
  deviceId?: string;          // matched BmDevice id, when we could tell
  label: string;
}

// ── Messages ─────────────────────────────────────────────────────────────────
export type BridgeRequest =
  | { op: 'hello'; proof: string; client: string }
  | { op: 'devices.list' }
  | { op: 'device.add'; host: string; kind?: BmDeviceKind }
  | { op: 'device.remove'; id: string }
  | { op: 'atem.cut'; id: string; me?: number }
  | { op: 'atem.auto'; id: string; me?: number }
  | { op: 'atem.program'; id: string; input: number; me?: number }
  | { op: 'atem.preview'; id: string; input: number; me?: number }
  | { op: 'atem.ftb'; id: string; me?: number }
  | { op: 'atem.style'; id: string; style: AtemTransitionStyle; me?: number }
  | { op: 'atem.macro'; id: string; index: number }
  | { op: 'atem.aux'; id: string; bus: number; input: number }
  | { op: 'camera.get'; id: string; path: string }
  | { op: 'camera.put'; id: string; path: string; body?: unknown }
  | { op: 'camera.record'; id: string; on: boolean }
  | { op: 'ingest.info' };

export type WithReqId<T> = T & { rid: number };

export type BridgeReply = { rid: number; ok: true; result?: unknown } | { rid: number; ok: false; error: string };

export type BridgeEvent =
  | { evt: 'hello'; version: number; bridge: string; nonce: string; via: 'direct' | 'relay' }
  | { evt: 'devices'; devices: BmDevice[] }
  | { evt: 'atem'; snapshot: AtemSnapshot }
  | { evt: 'camera'; snapshot: CameraSnapshot }
  | { evt: 'ingest'; streams: IngestStream[]; info: IngestInfo };

/** Frames the relay puts around traffic (see services/bmRelayServer.ts). */
export type RelayNotice = { relay: 'bridge-up' | 'bridge-down' };

export type BridgeMessage = BridgeReply | BridgeEvent;

export const isReply = (m: BridgeMessage): m is BridgeReply => typeof (m as any).rid === 'number';

// ── Shared helpers ───────────────────────────────────────────────────────────
export const deviceId = (kind: BmDeviceKind, host: string) => `${kind}:${host.toLowerCase()}`;

/** Classify an mDNS record. Blackmagic products announce `_blackmagic._tcp`; the name/TXT carry the product. */
export function classifyBlackmagic(name: string, txt: Record<string, unknown> = {}): { kind: BmDeviceKind; model?: string } {
  const hay = `${name} ${Object.values(txt).join(' ')}`.toLowerCase();
  const model = String(txt.model ?? txt.product ?? txt.name ?? '').trim() || undefined;
  if (/atem/.test(hay)) return { kind: 'atem', model };
  if (/hyperdeck/.test(hay)) return { kind: 'hyperdeck', model };
  if (/videohub|smart ?videohub/.test(hay)) return { kind: 'videohub', model };
  if (/ursa|pocket|cinema|pyxis|studio camera|broadcast camera|camera|micro studio|cine/.test(hay)) return { kind: 'camera', model };
  return { kind: 'unknown', model };
}
