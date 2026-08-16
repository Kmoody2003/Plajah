// kairosService — the live scripture cue bus.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: one cue, two clocks.
//
//   · A phone in the room fires the moment the cue lands (wall clock). There is
//     no video pipeline between the operator and someone's lap.
//   · A stream viewer is 6–30 s behind, so their pane fires against THEIR
//     playhead using the cue's program timecode. Fire them on wall clock and
//     they get the verse before they hear it — worse than not syncing at all.
//
// Host-broadcasts-state, deliberately modelled on partyService: one doc per
// service, the host writes, everyone reads and resolves locally. Media and
// text never relay through the host.
//
// The cue carries a refId, not just rendered lines. That is what makes
// per-viewer translation possible — the room sees KJV, a viewer sees NIV, a
// child sees a paraphrase, all from the same cue.

import { db, auth } from './backendService';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { parseRefId, type ScriptureRef } from './scriptureRef';

export const KAIROS_COL = 'scriptureSessions';

/** How many cues a session keeps, so a late joiner can still scrub the service. */
const CUE_HISTORY = 60;

export interface KairosCue {
  /** Stable passage id ("45.8.28") — clients re-resolve this in their own translation. */
  refId: string;
  /** Display label as the operator saw it ("Romans 8:28"). */
  label: string;
  /** Exactly what went on the screen, in the church's translation. */
  lines: string[];
  translation: string;
  variant: 'LOWER_THIRD' | 'FULLSCREEN';
  /** Epoch ms. In-room clients fire on this — i.e. immediately. */
  wallClock: number;
  /** Seconds into the program. Stream clients fire against their own playhead. */
  programTC: number;
  /** Monotonic, so out-of-order snapshots can be discarded. */
  seq: number;
}

export interface ScriptureSession {
  id: string;
  orgId: string;
  hostId: string;
  hostName?: string;
  title: string;
  /** Translation the auditorium screens are showing. */
  translation: string;
  isActive: boolean;
  /** Currently on screen. Null when the operator has cleared. */
  current: KairosCue | null;
  /** Everything fired this service, oldest first — the spine of the recap. */
  cues: KairosCue[];
  startedAt: number;
  endedAt?: number;
}

export const sessionIdFor = (orgId: string, day = new Date().toISOString().slice(0, 10)) =>
  `svc_${orgId}_${day}`;

function stripUndefined<T extends Record<string, any>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ── Host side ────────────────────────────────────────────────────────────────

export async function startSession(input: {
  orgId: string; title: string; translation: string; id?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to start a service');
  const id = input.id || sessionIdFor(input.orgId);
  await setDoc(doc(db, KAIROS_COL, id), stripUndefined({
    id,
    orgId: input.orgId,
    hostId: user.uid,
    hostName: user.displayName || 'Service',
    title: input.title,
    translation: input.translation,
    isActive: true,
    current: null,
    cues: [],
    startedAt: Date.now(),
    updatedAt: serverTimestamp(),
  }), { merge: true });
  return id;
}

/**
 * Push a cue. Appends to history and sets `current` in one write so a client
 * can never observe a cue in history that isn't yet on screen.
 */
export async function publishCue(sessionId: string, cue: KairosCue): Promise<void> {
  try {
    const snap = await getDoc(doc(db, KAIROS_COL, sessionId));
    const prev: KairosCue[] = (snap.data()?.cues as KairosCue[]) ?? [];
    const cues = [...prev, cue].slice(-CUE_HISTORY);
    await updateDoc(doc(db, KAIROS_COL, sessionId), {
      current: stripUndefined(cue as any),
      cues,
      updatedAt: serverTimestamp(),
    });
  } catch { /* a failed cue must never take the presentation down */ }
}

/** A history entry meaning "screen cleared here". */
export const CLEAR_REF = '';
export const isClear = (c: KairosCue | null | undefined) => !!c && c.refId === CLEAR_REF;

/**
 * Clear the screen. The clear is APPENDED TO HISTORY, not just applied to
 * `current` — otherwise a stream viewer, who resolves against history, would
 * hold the last verse on screen for the rest of the service.
 */
export async function clearCue(sessionId: string, programTC: number, seq: number): Promise<void> {
  try {
    const snap = await getDoc(doc(db, KAIROS_COL, sessionId));
    const prev: KairosCue[] = (snap.data()?.cues as KairosCue[]) ?? [];
    const marker: KairosCue = {
      refId: CLEAR_REF, label: '', lines: [], translation: '',
      variant: 'LOWER_THIRD', wallClock: Date.now(), programTC, seq,
    };
    await updateDoc(doc(db, KAIROS_COL, sessionId), {
      current: null,
      cues: [...prev, marker].slice(-CUE_HISTORY),
      updatedAt: serverTimestamp(),
    });
  } catch { /* */ }
}

export async function endSession(sessionId: string): Promise<void> {
  try {
    await updateDoc(doc(db, KAIROS_COL, sessionId), {
      isActive: false, current: null, endedAt: Date.now(),
    });
  } catch { /* */ }
}

// ── Client side ──────────────────────────────────────────────────────────────

export function listenToSession(
  sessionId: string,
  cb: (s: ScriptureSession | null) => void,
): () => void {
  return onSnapshot(
    doc(db, KAIROS_COL, sessionId),
    snap => cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as ScriptureSession : null),
    () => cb(null),
  );
}

export async function fetchSession(sessionId: string): Promise<ScriptureSession | null> {
  try {
    const snap = await getDoc(doc(db, KAIROS_COL, sessionId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as ScriptureSession : null;
  } catch { return null; }
}

export type FollowMode = 'IN_ROOM' | 'STREAM';

/**
 * The whole two-clock rule, in one pure function.
 *
 * IN_ROOM  → whatever the operator has on screen right now.
 * STREAM   → the last cue whose program timecode the viewer's playhead has
 *            actually reached. Cues fired ahead of the playhead stay pending.
 *
 * Returns null when nothing should be showing, which is a real state: the
 * operator cleared, or a stream viewer hasn't reached the first cue yet.
 */
export function resolveCue(
  session: ScriptureSession | null,
  mode: FollowMode,
  playheadSec?: number,
): KairosCue | null {
  if (!session) return null;

  if (mode === 'IN_ROOM') return session.current ?? null;

  const t = playheadSec ?? 0;
  let best: KairosCue | null = null;
  for (const c of session.cues ?? []) {
    // >= so a later entry at the same timecode wins; ordering within a second
    // follows the write order, which is the operator's order.
    if (c.programTC <= t && (!best || c.programTC >= best.programTC)) best = c;
  }
  // A clear the viewer has reached means their screen clears too.
  return isClear(best) ? null : best;
}

/** Parse a cue's passage. Clients use this to re-resolve in their translation. */
export function cueRef(cue: KairosCue | null): ScriptureRef | null {
  return cue ? parseRefId(cue.refId) : null;
}

/** Markers for the VOD scrub bar and the recap. */
export interface CueMarker { refId: string; label: string; programTC: number; }

export function markersFor(session: ScriptureSession | null): CueMarker[] {
  if (!session?.cues?.length) return [];
  const seen = new Set<string>();
  const out: CueMarker[] = [];
  for (const c of session.cues) {
    if (isClear(c)) continue;
    const k = `${c.refId}@${Math.round(c.programTC)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ refId: c.refId, label: c.label, programTC: c.programTC });
  }
  return out.sort((a, b) => a.programTC - b.programTC);
}
