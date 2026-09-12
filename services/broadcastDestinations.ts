/**
 * Broadcast-out destinations — Restream + per-platform RTMP (the "both models" the owner chose).
 *
 * Stored in `broadcast_destinations/{uid}` (owner-only read — secret stream keys; see firestore.rules)
 * as a single doc holding the destinations array. Configured in any host; the actual RTMP push runs
 * where the host can do it:
 *   • the desktop/Capacitor app today (services/mediaEngine/capabilities.ts → sources.rtmp),
 *   • a server relay LATER — gated OFF by RELAY_ENABLED until it's built and affordable.
 * Nothing here pushes; it manages the config + reports honestly where a push can happen.
 */
import { db, auth } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { BroadcastDestination, BroadcastDestinationKind } from '../types';
import { detectCapabilities } from './mediaEngine/capabilities';

const COLLECTION = 'broadcast_destinations';

/**
 * Server-relay fan-out. OFF until the Cloud Run/Mux relay is built AND turned on — it is the only
 * part of Broadcast Out that costs money, so it stays dark (config saves, push doesn't run in-browser)
 * until affordable. Flip to true only when the relay is live. See [[plajah-radio-broadcast-mcr]].
 */
export const RELAY_ENABLED = false;

// ── Platform presets ──────────────────────────────────────────────────────────
// Default RTMP ingest endpoints. The owner supplies the stream key; some platforms hand out a
// per-account ingest URL, so those default blank and are marked custom-url.

export interface DestinationPreset {
  kind: BroadcastDestinationKind;
  label: string;
  rtmpUrl: string;
  /** True when the platform gives each account its own ingest URL — the owner must paste it. */
  customUrl?: boolean;
  hint?: string;
}

export const DESTINATION_PRESETS: DestinationPreset[] = [
  { kind: 'restream', label: 'Restream', rtmpUrl: 'rtmp://live.restream.io/live', hint: 'Restream fans out to everywhere else for you.' },
  { kind: 'youtube', label: 'YouTube Live', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', hint: 'Stream key from YouTube Studio → Go Live.' },
  { kind: 'twitch', label: 'Twitch', rtmpUrl: 'rtmp://live.twitch.tv/app', hint: 'Stream key from Twitch → Creator Dashboard → Stream.' },
  { kind: 'facebook', label: 'Facebook Live', rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/', hint: 'Server URL + key from Facebook Live Producer.' },
  { kind: 'kick', label: 'Kick', rtmpUrl: '', customUrl: true, hint: 'Kick gives each channel its own ingest URL — paste it from Kick → Settings → Stream.' },
  { kind: 'custom', label: 'Custom RTMP', rtmpUrl: '', customUrl: true, hint: 'Any RTMP endpoint — paste the server URL and key.' },
];

export const presetFor = (kind: BroadcastDestinationKind): DestinationPreset =>
  DESTINATION_PRESETS.find(p => p.kind === kind) || DESTINATION_PRESETS[DESTINATION_PRESETS.length - 1];

// ── Persistence ────────────────────────────────────────────────────────────────

/** Strip to known fields — Firestore rejects undefined, and we never persist stray keys. */
function cleanDestinations(destinations: BroadcastDestination[]) {
  return destinations.map(d => ({
    id: d.id,
    kind: d.kind,
    label: d.label || '',
    rtmpUrl: d.rtmpUrl || '',
    streamKey: d.streamKey || '',
    enabled: !!d.enabled,
    createdAt: d.createdAt || Date.now(),
  }));
}

export interface BroadcastConfig {
  destinations: BroadcastDestination[];
  /** Routing matrix: output id (from broadcastOutputs) → destination id[] it simulcasts to. */
  routes: Record<string, string[]>;
}

/** The owner's destinations + routing matrix. Resolves to empty on any failure — never throws. */
export async function fetchMyBroadcastConfig(): Promise<BroadcastConfig> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { destinations: [], routes: {} };
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return { destinations: [], routes: {} };
    const data = snap.data() as any;
    return {
      destinations: Array.isArray(data.destinations) ? data.destinations : [],
      routes: data.routes && typeof data.routes === 'object' ? data.routes : {},
    };
  } catch {
    return { destinations: [], routes: {} };
  }
}

/** Replace the owner's destinations + routes. Throws on failure so the UI can surface it. */
export async function saveMyBroadcastConfig(config: BroadcastConfig): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You need to be signed in.');
  const routes: Record<string, string[]> = {};
  for (const k of Object.keys(config.routes || {})) {
    const v = (config.routes as any)[k];
    if (Array.isArray(v) && v.length) routes[k] = v.filter((x: any) => typeof x === 'string');
  }
  await setDoc(doc(db, COLLECTION, uid), {
    destinations: cleanDestinations(config.destinations),
    routes,
    updatedAt: Date.now(),
  });
}

/** @deprecated Prefer fetchMyBroadcastConfig — kept for callers that only need destinations. */
export async function fetchMyDestinations(): Promise<BroadcastDestination[]> {
  return (await fetchMyBroadcastConfig()).destinations;
}

/** @deprecated Prefer saveMyBroadcastConfig — preserves existing routes when saving destinations. */
export async function saveMyDestinations(destinations: BroadcastDestination[]): Promise<void> {
  const cfg = await fetchMyBroadcastConfig();
  await saveMyBroadcastConfig({ destinations, routes: cfg.routes });
}

export function newDestination(kind: BroadcastDestinationKind): BroadcastDestination {
  const preset = presetFor(kind);
  return {
    id: `dest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    label: preset.label,
    rtmpUrl: preset.rtmpUrl,
    streamKey: '',
    enabled: false,
    createdAt: Date.now(),
  };
}

// ── Push status (honest gating) ─────────────────────────────────────────────────

export type PushMode = 'native' | 'relay' | 'unavailable';

export interface PushStatus {
  mode: PushMode;
  /** One-line explanation shown in the rack so it never lies about where a push runs. */
  note: string;
}

/**
 * Where can this host actually push RTMP right now? A browser tab cannot (capabilities.ts) — so
 * unless the relay is enabled, web falls back to "runs in the app". Native hosts push directly.
 */
export function resolvePushStatus(): PushStatus {
  const caps = detectCapabilities();
  if (caps.sources.rtmp) {
    return { mode: 'native', note: 'Broadcasts push straight from this app to every enabled destination.' };
  }
  if (RELAY_ENABLED) {
    return { mode: 'relay', note: 'Broadcasts push through Plajah’s relay to every enabled destination.' };
  }
  return {
    mode: 'unavailable',
    note: 'Destinations are saved here. Simulcast runs in the Plajah desktop app today — web relay is coming.',
  };
}
