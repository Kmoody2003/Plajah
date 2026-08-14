import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Rest. A calming ambient channel, rendered once and scheduled by the
// viewer's own clock.
//
// THE ARCHITECTURE, and why it is cheap:
//
//   1. The loops are rendered ONCE, platform-wide, through the Pixels offline
//      renderer (see renderRestLoops in oraRestRender). Silent, generator-only,
//      deterministic. They live in `oraRestLoops` and every account shares them.
//
//   2. A user's channel is not a stored schedule. `scheduleAt(date, loops)` is a
//      PURE FUNCTION of the wall clock, so the running order is computed on the
//      device from the viewer's own local time. That means:
//        · zero per-user storage and zero backend playout cost
//        · a viewer in Lagos gets dusk visuals at their dusk, not at UTC dusk
//        · the same function can later emit an XMLTV/MRSS EPG for carriage
//
//   3. Loops are played in SEQUENCE with a crossfade, never looped back on
//      themselves. A single generator loop is not guaranteed to be seamless at
//      its own boundary, and a visible jump every few minutes would be fatal on
//      a sleep channel — crossfading between different loops sidesteps the seam
//      entirely and gives the channel variety for free.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
// ─────────────────────────────────────────────────────────────────────────

/** The four moods of a day. Chosen by the viewer's local hour, not by UTC. */
export type Daypart = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

/**
 * Review state for a submitted background. Anything a stranger will see on a
 * sleep channel gets looked at first — this is a calm surface, and an unvetted
 * upload is the one thing that could make it the opposite.
 */
export type RestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface RestLoop {
  id: string;
  daypart: Daypart;
  /** Pixels generator mode used to render it — kept for reproducibility. */
  mode: string;
  title: string;
  url: string;
  durationSec: number;
  width: number;
  height: number;
  createdAt: number;

  // ── authorship ────────────────────────────────────────────────────────
  /** Absent on the platform's own default loops; set on every submission. */
  authorUid?: string;
  authorName?: string;
  status: RestStatus;
  /** Set by a reviewer when status is REJECTED, and shown to the author. */
  reviewNote?: string;

  /**
   * Measured seam quality: mean per-pixel difference between the first and last
   * frame, 0 (identical) to 1. NOT a claim by the author — it is computed from
   * the rendered file by checkSeam(). A Rest program must be at or under
   * SEAM_THRESHOLD; anything above may still run as an ordinary FAST program,
   * where a cut between clips is normal and nobody is trying to fall asleep.
   */
  seam?: number;
}

/**
 * How different the last frame may be from the first before a loop is refused
 * for Rest. Tuned to allow imperceptible drift while catching a real jump.
 */
export const SEAM_THRESHOLD = 0.02;

/** Whether a loop is allowed on the Rest channel specifically. */
export const isRestEligible = (l: RestLoop): boolean =>
  l.status === 'APPROVED' && typeof l.seam === 'number' && l.seam <= SEAM_THRESHOLD;

const LOOPS_COL = 'oraRestLoops';

/** Local hour → daypart. Deliberately generous at the edges; nothing snaps. */
export function daypartFor(d: Date = new Date()): Daypart {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'DAWN';
  if (h >= 8 && h < 17) return 'DAY';
  if (h >= 17 && h < 21) return 'DUSK';
  return 'NIGHT';
}

export const DAYPART_LABEL: Record<Daypart, string> = {
  DAWN: 'First light', DAY: 'Daylight', DUSK: 'Golden hour', NIGHT: 'Small hours',
};

/** The shared, platform-wide loop library. Readable by everyone. */
export async function listLoops(): Promise<RestLoop[]> {
  try {
    const snap = await getDocs(collection(db, LOOPS_COL));
    // Only approved, provably-seamless loops reach the channel. A submission that
    // is merely approved can still be used as an ordinary FAST program elsewhere.
    return snap.docs.map((d) => d.data() as RestLoop).filter((l) => !!l.url && isRestEligible(l));
  } catch {
    return [];
  }
}

/**
 * What should be on screen right now, and how far into it we are.
 *
 * Pure: same clock + same library always gives the same answer, on every device.
 * The running order is derived from the day number so the channel does not play
 * the identical sequence every single day, but is still fully reproducible.
 */
export function scheduleAt(
  date: Date,
  loops: RestLoop[],
): { loop: RestLoop; offsetSec: number; next: RestLoop } | null {
  const part = daypartFor(date);
  const pool = loops.filter((l) => l.daypart === part);
  const usable = pool.length > 0 ? pool : loops;
  if (usable.length === 0) return null;

  const ordered = [...usable].sort((a, b) => a.id.localeCompare(b.id));
  const total = ordered.reduce((n, l) => n + Math.max(1, l.durationSec), 0);

  // Seconds since local midnight — the schedule restarts each day, per timezone.
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  const sinceMidnight = Math.floor((date.getTime() - midnight.getTime()) / 1000);

  // Day-of-year rotates the starting point so consecutive days differ.
  const dayIndex = Math.floor(midnight.getTime() / 86400000);
  let cursor = (sinceMidnight + dayIndex * 137) % total; // 137: coprime-ish, avoids short cycles

  for (let i = 0; i < ordered.length; i++) {
    const l = ordered[i];
    const len = Math.max(1, l.durationSec);
    if (cursor < len) {
      return { loop: l, offsetSec: cursor, next: ordered[(i + 1) % ordered.length] };
    }
    cursor -= len;
  }
  return { loop: ordered[0], offsetSec: 0, next: ordered[1 % ordered.length] };
}

// ── per-user channel ─────────────────────────────────────────────────────

export interface RestChannelSettings {
  enabled: boolean;
  /** Show it alongside the account's FAST channels. */
  listedWithChannels: boolean;
  updatedAt: number;
}

const settingsRef = (uid: string) => doc(db, 'users', uid, 'ora_profile', 'restChannel');

export async function getRestSettings(): Promise<RestChannelSettings | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(settingsRef(uid));
    return snap.exists() ? (snap.data() as RestChannelSettings) : null;
  } catch {
    return null;
  }
}

/**
 * Turn the channel on or off for this account.
 *
 * Nothing is rendered or copied per user — this only records that the account
 * wants the shared library surfaced as one of its channels.
 */
export async function setRestEnabled(enabled: boolean, listedWithChannels = true): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    settingsRef(uid),
    { enabled, listedWithChannels, updatedAt: Date.now() } satisfies RestChannelSettings,
    { merge: true },
  );
}
