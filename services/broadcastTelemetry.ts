/**
 * Broadcast telemetry — the REAL live signals behind the Master Control multiview.
 *
 * The platform genuinely exposes only a few live truths, and this gathers exactly those — no invented
 * numbers:
 *   • live_feeds: docs with status 'LIVE' mean the account is actually broadcasting that stream now
 *     (published when it goes live), not merely configured. This is the real on-air signal for video.
 *   • liveTalks: a hosted talk carries a real `listeners[]` presence array — a genuine concurrent
 *     audience count.
 * FAST channels and satellite radio have no per-viewer telemetry in this codebase, so this returns
 * none for them; the multiview treats an enabled 24/7 channel/station as on air (true) but shows no
 * fake audience. Nothing here throws — a telemetry gap must never take the panel down.
 */
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { LiveFeed, LiveTalk } from '../types';

export interface LiveTalkTelemetry {
  id: string;
  title: string;
  listeners: number;
}

export interface BroadcastTelemetry {
  /** Streams actually LIVE right now (real status), owned by this account. */
  liveFeeds: LiveFeed[];
  /** Active talk this account is hosting, with its real listener count — or null. */
  liveTalk: LiveTalkTelemetry | null;
}

const EMPTY: BroadcastTelemetry = { liveFeeds: [], liveTalk: null };

/**
 * Gather the account's real live signals. Single-field `where` queries only (ownerId / hostId), then
 * filter status/active client-side, so no composite index is needed (see [[plajah-firestore-gotchas]]).
 */
export async function fetchBroadcastTelemetry(uid: string): Promise<BroadcastTelemetry> {
  if (!uid) return EMPTY;
  try {
    const [feedsSnap, talksSnap] = await Promise.all([
      getDocs(query(collection(db, 'live_feeds'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'liveTalks'), where('hostId', '==', uid))),
    ]);

    const liveFeeds = feedsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) } as LiveFeed))
      .filter(f => f.status === 'LIVE');

    const talk = talksSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) } as LiveTalk))
      .find(t => (t as any).isActive);

    const liveTalk: LiveTalkTelemetry | null = talk
      ? { id: talk.id, title: talk.title || 'Live Talk', listeners: Array.isArray((talk as any).listeners) ? (talk as any).listeners.length : 0 }
      : null;

    return { liveFeeds, liveTalk };
  } catch {
    return EMPTY;
  }
}
