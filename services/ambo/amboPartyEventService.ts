// amboPartyEventService.ts — Party / Event Mode Mesh Engine for Ambo.
//
// Turns all signed-in devices on a user account into visual & audio output destinations
// governed by Ambo Central Command.
//
// Key features:
//   1. Automatic mesh discovery of all devices running Plajah under the user's account.
//   2. Independent Per-Device Duties:
//        · Ambo Program Out
//        · Stage Confidence / Foldback (Speaker notes, clock, next slide)
//        · Specific Presentations / Shows from project library
//        · Chora Music Playlists & DJ Tracks (with local audio & visualizer)
//        · Reello Video Channels & Loops
//        · Ambient Signage & Welcome Visualizers
//   3. Master Sync Control:
//        · ENGAGED: Slaved devices take and follow the Master Ambo device synchronously.
//        · MUTED / RELEASED: Slaved devices smoothly return to their assigned duties & playlists.
//   4. Project Playlist Architecture Integration:
//        · Plan items can specify default output devices and duties for each show in a project.

import { db, auth } from '../backendService';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, onSnapshot as rawOnSnapshot,
} from 'firebase/firestore';
import type { LiveStack, Slide, Show } from './showModel';
import type { PlanItem } from './servicePlanDemo';

export const PARTY_EVENT_CHANNEL = 'plajah-party-event-channel';
const HEARTBEAT_INTERVAL_MS = 4000;
const DEVICE_STALE_TIMEOUT_MS = 25000;

export type EventDeviceType = 'DESKTOP' | 'TV' | 'TABLET' | 'MOBILE' | 'PROJECTOR' | 'BROWSER';

export type EventDeviceDutyType =
  | 'AMBO_PROGRAM'
  | 'AMBO_STAGE'
  | 'AMBO_PRESENTATION'
  | 'CHORA_PLAYLIST'
  | 'REELLO_VIDEO'
  | 'AMBIENT_SIGNAGE'
  | 'STANDBY';

export interface EventDeviceDuty {
  dutyType: EventDeviceDutyType;
  title: string;
  subtitle?: string;
  sourceId?: string;
  sourceData?: {
    show?: Show;
    slideIndex?: number;
    playlistId?: string;
    tracks?: Array<{ id: string; title: string; artist: string; url?: string; coverImage?: string }>;
    currentTrackIndex?: number;
    videoId?: string;
    videoUrl?: string;
    videoTitle?: string;
    thumbnail?: string;
    loop?: boolean;
    theme?: string;
    headline?: string;
    subheadline?: string;
  };
  volume?: number;
  isMuted?: boolean;
}

export interface PartyEventDevice {
  deviceId: string;
  uid: string;
  deviceName: string;
  deviceType: EventDeviceType;
  screen?: {
    width: number;
    height: number;
    dpr: number;
    aspectRatio?: string;
  };
  isOnline: boolean;
  lastSeen: number;
  duty: EventDeviceDuty;
  isSlaved: boolean;
  volume: number;
  isMuted: boolean;
  pingTimestamp?: number;
  userAgent?: string;
  currentPlaybackStatus?: {
    state: 'PLAYING' | 'PAUSED' | 'IDLE' | 'BUFFERING';
    positionSec?: number;
    title?: string;
  };
}

export interface PartyEventMasterSource {
  type: 'AMBO_PROGRAM' | 'AMBO_STAGE' | 'CHORA_MASTER' | 'REELLO_MASTER' | 'PRESENTATION';
  title: string;
  liveStack?: LiveStack;
  slide?: Slide | null;
  nextSlide?: Slide | null;
  timers?: Record<string, number>;
  track?: {
    id: string;
    title: string;
    artist?: string;
    url?: string;
    coverImage?: string;
  };
  video?: {
    id: string;
    title: string;
    url?: string;
    muxPlaybackId?: string;
  };
  isPlaying?: boolean;
  positionSec?: number;
  audioMuted?: boolean;
  seq: number;
  updatedAt: number;
}

export interface PartyEventSession {
  id: string;
  hostUid: string;
  hostDeviceId: string;
  eventName: string;
  isActive: boolean;
  startedAt: number;
  masterSyncEngaged: boolean;
  masterSource: PartyEventMasterSource;
  deviceDuties: Record<string, EventDeviceDuty>;
  deviceSlaved: Record<string, boolean>;
  deviceMutes: Record<string, boolean>;
  projectDefaultDuties?: Record<string, Record<string, EventDeviceDuty>>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function removeUndefined<T extends Record<string, any>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  try {
    const key = 'plajah_party_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `dev_fallback_${Date.now().toString(36)}`;
  }
}

export function detectDeviceType(): EventDeviceType {
  if (typeof window === 'undefined') return 'DESKTOP';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('smart-tv') || ua.includes('tizen') || ua.includes('webos') || ua.includes('viera') || ua.includes('crkey') || ua.includes('appletv')) {
    return 'TV';
  }
  if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) {
    return 'TABLET';
  }
  if (ua.includes('iphone') || (ua.includes('android') && ua.includes('mobile'))) {
    return 'MOBILE';
  }
  return 'DESKTOP';
}

export function getFriendlyDeviceName(): string {
  if (typeof window === 'undefined') return 'Display Device';
  try {
    const saved = localStorage.getItem('plajah_party_device_name');
    if (saved) return saved;
  } catch {}

  const type = detectDeviceType();
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edge')) browser = 'Edge';

  let os = 'Device';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'Mac';
  else if (ua.includes('Windows')) os = 'Windows PC';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Android')) os = type === 'TV' ? 'Android TV' : 'Android';

  return `${os} (${browser})`;
}

export function setCustomDeviceName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('plajah_party_device_name', name.trim());
  } catch {}
}

export const DEFAULT_DUTY: EventDeviceDuty = {
  dutyType: 'AMBO_PROGRAM',
  title: 'Ambo Program Out',
  subtitle: 'Live Audience Mirror',
};

// ── Local Broadcast Channel for Tab-to-Tab Coordination ──────────────────────

let localChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined') {
    localChannel = new BroadcastChannel(PARTY_EVENT_CHANNEL);
  }
} catch {
  localChannel = null;
}

// ── Device Registration & Heartbeat ──────────────────────────────────────────

let heartbeatTimer: any = null;
let currentRegisteredUid: string | null = null;

export function registerEventDevice(customName?: string): () => void {
  if (typeof window === 'undefined') return () => {};

  const user = auth.currentUser;
  if (!user) return () => {};

  const uid = user.uid;
  const deviceId = getOrCreateDeviceId();
  const deviceName = customName || getFriendlyDeviceName();
  const deviceType = detectDeviceType();

  currentRegisteredUid = uid;

  const updatePresence = async () => {
    try {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round((window.screen?.width || window.innerWidth) * dpr);
      const h = Math.round((window.screen?.height || window.innerHeight) * dpr);
      const aspect = `${Math.round((w / (h || 1)) * 10) / 10}:1`;

      const deviceData: Partial<PartyEventDevice> = {
        deviceId,
        uid,
        deviceName,
        deviceType,
        screen: { width: w, height: h, dpr, aspectRatio: aspect },
        isOnline: true,
        lastSeen: Date.now(),
        userAgent: navigator.userAgent,
      };

      const ref = doc(db, 'users', uid, 'event_devices', deviceId);
      await setDoc(ref, removeUndefined(deviceData), { merge: true });

      // Notify local channel
      localChannel?.postMessage({
        type: 'DEVICE_HEARTBEAT',
        deviceId,
        uid,
        lastSeen: Date.now(),
      });
    } catch (e) {
      // safe fallback on transient offline
    }
  };

  updatePresence();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(updatePresence, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    try {
      const ref = doc(db, 'users', uid, 'event_devices', deviceId);
      updateDoc(ref, { isOnline: false, lastSeen: Date.now() }).catch(() => {});
    } catch {}
  };

  window.addEventListener('beforeunload', cleanup);
  return cleanup;
}

// ── Listen to Event Devices for a User ───────────────────────────────────────

export function listenToEventDevices(uid: string, cb: (devices: PartyEventDevice[]) => void): () => void {
  try {
    const colRef = collection(db, 'users', uid, 'event_devices');
    const unsub = rawOnSnapshot(colRef, (snap) => {
      const now = Date.now();
      const list: PartyEventDevice[] = [];

      snap.forEach((d) => {
        const data = d.data() as PartyEventDevice;
        const isOnline = data.isOnline !== false && (now - (data.lastSeen || 0) < DEVICE_STALE_TIMEOUT_MS);
        list.push({
          ...data,
          deviceId: d.id,
          isOnline,
          duty: data.duty || DEFAULT_DUTY,
          isSlaved: data.isSlaved !== false,
          volume: typeof data.volume === 'number' ? data.volume : 1,
          isMuted: !!data.isMuted,
        });
      });

      // Sort: Online devices first, then newest
      list.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return (b.lastSeen || 0) - (a.lastSeen || 0);
      });

      cb(list);
    }, (err) => {
      console.warn('[amboPartyEvent] Failed listening to event devices:', err.message);
      cb([]);
    });

    return () => unsub();
  } catch (e) {
    return () => {};
  }
}

// ── Session Management (Ambo Central Command) ────────────────────────────────

export async function startPartyEventSession(eventName = 'Ambo Event Central Command'): Promise<PartyEventSession> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to start Party/Event Mode');

  const uid = user.uid;
  const hostDeviceId = getOrCreateDeviceId();
  const sessionId = 'session';
  const now = Date.now();

  const initialSession: PartyEventSession = {
    id: sessionId,
    hostUid: uid,
    hostDeviceId,
    eventName,
    isActive: true,
    startedAt: now,
    masterSyncEngaged: true, // Master sync starts engaged
    masterSource: {
      type: 'AMBO_PROGRAM',
      title: 'Program Out Live',
      isPlaying: true,
      seq: 1,
      updatedAt: now,
    },
    deviceDuties: {},
    deviceSlaved: {},
    deviceMutes: {},
  };

  const sessionRef = doc(db, 'users', uid, 'ambo_party_event', sessionId);
  await setDoc(sessionRef, removeUndefined(initialSession), { merge: true });

  localChannel?.postMessage({
    type: 'SESSION_START',
    session: initialSession,
  });

  return initialSession;
}

export async function endPartyEventSession(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  try {
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, { isActive: false, endedAt: Date.now() });
    localChannel?.postMessage({ type: 'SESSION_END' });
  } catch {}
}

export function listenToPartyEventSession(uid: string, cb: (session: PartyEventSession | null) => void): () => void {
  try {
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    const unsub = rawOnSnapshot(sessionRef, (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data() as PartyEventSession;
      cb(data);
    }, (err) => {
      console.warn('[amboPartyEvent] Error listening to session:', err.message);
      cb(null);
    });

    return () => unsub();
  } catch {
    return () => {};
  }
}

// ── Master Controls: Sync, Source, Mute ──────────────────────────────────────

export async function setMasterSync(engaged: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, {
      masterSyncEngaged: engaged,
      'masterSource.updatedAt': Date.now(),
    });

    localChannel?.postMessage({
      type: 'MASTER_SYNC_CHANGE',
      engaged,
    });
  } catch (e) {
    console.warn('[amboPartyEvent] Failed updating master sync:', e);
  }
}

let masterSeq = 1;
export async function broadcastMasterSource(patch: Partial<PartyEventMasterSource>): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  masterSeq++;
  const updated: Partial<PartyEventMasterSource> = {
    ...patch,
    seq: masterSeq,
    updatedAt: Date.now(),
  };

  try {
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(updated)) {
      if (v !== undefined) {
        updates[`masterSource.${k}`] = v;
      }
    }
    await updateDoc(sessionRef, updates);

    localChannel?.postMessage({
      type: 'MASTER_SOURCE_UPDATE',
      masterSource: updated,
    });
  } catch {}
}

// ── Per-Device Duty & Routing ────────────────────────────────────────────────

export async function assignDeviceDuty(deviceId: string, duty: EventDeviceDuty): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    // 1. Update on the specific device doc
    const devRef = doc(db, 'users', uid, 'event_devices', deviceId);
    await updateDoc(devRef, { duty: removeUndefined(duty) });

    // 2. Update on the session doc
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, {
      [`deviceDuties.${deviceId}`]: removeUndefined(duty),
    });

    localChannel?.postMessage({
      type: 'DEVICE_DUTY_ASSIGNED',
      deviceId,
      duty,
    });
  } catch (e) {
    console.warn('[amboPartyEvent] Failed assigning duty:', e);
  }
}

export async function setDeviceSlaved(deviceId: string, isSlaved: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const devRef = doc(db, 'users', uid, 'event_devices', deviceId);
    await updateDoc(devRef, { isSlaved });

    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, {
      [`deviceSlaved.${deviceId}`]: isSlaved,
    });

    localChannel?.postMessage({
      type: 'DEVICE_SLAVED_CHANGE',
      deviceId,
      isSlaved,
    });
  } catch {}
}

export async function setDeviceAudioMute(deviceId: string, isMuted: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const devRef = doc(db, 'users', uid, 'event_devices', deviceId);
    await updateDoc(devRef, { isMuted });

    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, {
      [`deviceMutes.${deviceId}`]: isMuted,
    });
  } catch {}
}

export async function pingDevice(deviceId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const devRef = doc(db, 'users', uid, 'event_devices', deviceId);
    await updateDoc(devRef, { pingTimestamp: Date.now() });

    localChannel?.postMessage({
      type: 'DEVICE_PING',
      deviceId,
      timestamp: Date.now(),
    });
  } catch {}
}

// ── Playlist Architecture & Default Output Integration ────────────────────────

export async function saveProjectDefaultDuties(
  planItemId: string,
  duties: Record<string, EventDeviceDuty>,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const sessionRef = doc(db, 'users', uid, 'ambo_party_event', 'session');
    await updateDoc(sessionRef, {
      [`projectDefaultDuties.${planItemId}`]: removeUndefined(duties),
    });
  } catch {}
}

export async function applyPlaylistItemDuties(item: PlanItem): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  const defaultDuties = (item as any)?.defaultDuties as Record<string, EventDeviceDuty> | undefined;
  if (!defaultDuties || Object.keys(defaultDuties).length === 0) return;

  for (const [deviceId, duty] of Object.entries(defaultDuties)) {
    if (duty) {
      await assignDeviceDuty(deviceId, duty);
    }
  }
}
