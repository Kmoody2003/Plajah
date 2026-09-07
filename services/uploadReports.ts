// uploadReports.ts — the upload-attempt ledger. Every large-media upload (Taleo films,
// Chora masters, Reello video, book/photo assets) opens a row here BEFORE the first byte
// moves and settles it on success or failure.
//
// Why a ledger instead of relying on errorReporting: a killed upload usually fires NO
// error handler at all. The user closes the tab, the network dies, or a deploy reloads the
// app mid-transfer — the promise never rejects, `reportError` never runs, and the failure
// is invisible. That is exactly how "Pumpkin Patch" reached the catalog as a published film
// with no video attached and nobody knew until a viewer pressed play.
//
// The fix is to make the ABSENCE of an ending detectable: a row left in UPLOADING with a
// stale heartbeat IS the failure report. Nothing needs to run at the moment of death.
//
// Rules of the house: this must never throw and never block an upload. Every write is
// best-effort and swallowed — a broken reporter must not cost a creator their film.

import { db, auth } from './backendService';
import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, limit as fsLimit } from 'firebase/firestore';
import { trace } from './sessionTrace';

/** UPLOADING rows whose heartbeat is older than this are treated as dead, not in-flight. */
export const STALE_AFTER_MS = 3 * 60 * 1000;

/** Throttle heartbeat writes — a 2-hour film upload must not cost thousands of writes. */
const BEAT_EVERY_MS = 15_000;

export type UploadAttemptStatus = 'UPLOADING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Which product the upload came from — so Taleo and Chora failures can be read apart. */
export type UploadSurface = 'TALEO' | 'CHORA' | 'REELLO' | 'LOREA' | 'PHOTOS' | 'FABULA' | 'OTHER';

export interface BeginUploadInput {
  surface: UploadSurface;
  /** 'FILM' | 'TRACK' | 'COVER' … — what this particular file is, for triage. */
  role: string;
  fileName: string;
  sizeBytes?: number;
  contentType?: string;
  /** Mux upload id, Storage path, or whatever identifies the transfer downstream. */
  transport?: string;
  /** The album/video/book doc this upload is meant to end up attached to. */
  targetId?: string;
  targetTitle?: string;
}

/** Handle returned by beginUploadAttempt. All methods are no-ops if the row failed to open. */
export interface UploadAttemptHandle {
  id: string | null;
  /** Report progress. Throttled internally — call it as often as you like. */
  beat: (percent: number, bytesTransferred?: number) => void;
  /** Add fields learned after the row opened (e.g. the Mux upload id). Best-effort. */
  attach: (fields: Record<string, unknown>) => void;
  /** Settle the row. Safe to call more than once; only the first call wins. */
  settle: (status: Exclude<UploadAttemptStatus, 'UPLOADING'>, err?: unknown) => void;
}

const NOOP: UploadAttemptHandle = { id: null, beat: () => {}, attach: () => {}, settle: () => {} };

/** Network conditions at the start — the single most useful field when triaging a stall. */
function connectionInfo(): Record<string, unknown> {
  try {
    const c = (navigator as any)?.connection;
    if (!c) return {};
    return {
      effectiveType: String(c.effectiveType || ''),
      downlinkMbps: typeof c.downlink === 'number' ? c.downlink : null,
      saveData: !!c.saveData,
    };
  } catch { return {}; }
}

/**
 * Open an upload-attempt row. Call this immediately before starting the transfer.
 * Returns a handle whose methods are all safe no-ops if anything went wrong.
 */
export function beginUploadAttempt(input: BeginUploadInput): UploadAttemptHandle {
  try {
    const u = auth.currentUser;
    if (!u) return NOOP;  // rules require auth; an anonymous upload can't be ledgered

    const id = `ua_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ref = doc(db, 'uploadAttempts', id);
    const startedAt = Date.now();

    // Fire-and-forget: awaiting this would delay the upload for no benefit.
    setDoc(ref, {
      id,
      status: 'UPLOADING' as UploadAttemptStatus,
      surface: input.surface,
      role: input.role,
      fileName: String(input.fileName || '').slice(0, 300),
      sizeBytes: input.sizeBytes ?? null,
      contentType: String(input.contentType || '').slice(0, 120),
      transport: String(input.transport || '').slice(0, 200),
      targetId: input.targetId || null,
      targetTitle: String(input.targetTitle || '').slice(0, 300),
      percent: 0,
      bytesTransferred: 0,
      ownerId: u.uid,
      userEmail: u.email || null,
      userName: u.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      url: typeof location !== 'undefined' ? location.href.slice(0, 400) : '',
      connection: connectionInfo(),
      startedAt,
      lastBeatAt: startedAt,
      endedAt: null,
    }).catch(() => { /* best-effort */ });

    trace('upload', `start ${input.surface}/${input.role} ${input.fileName}`);

    let lastBeat = startedAt;
    let settled = false;

    return {
      id,
      beat(percent, bytesTransferred) {
        try {
          if (settled) return;
          const now = Date.now();
          // Always let 100% through so a finished-but-not-yet-settled row reads correctly.
          if (now - lastBeat < BEAT_EVERY_MS && percent < 100) return;
          lastBeat = now;
          updateDoc(ref, {
            percent: Math.max(0, Math.min(100, Math.round(percent))),
            ...(typeof bytesTransferred === 'number' ? { bytesTransferred } : {}),
            lastBeatAt: now,
          }).catch(() => {});
        } catch { /* never throw */ }
      },
      attach(fields) {
        try {
          if (settled) return;
          updateDoc(ref, { ...fields, lastBeatAt: Date.now() }).catch(() => {});
        } catch { /* never throw */ }
      },
      settle(status, err) {
        try {
          if (settled) return;
          settled = true;
          const e = err as any;
          const now = Date.now();
          updateDoc(ref, {
            status,
            endedAt: now,
            durationMs: now - startedAt,
            lastBeatAt: now,
            ...(err ? {
              errorCode: String(e?.code || '').slice(0, 120),
              errorMessage: String(e?.message ?? e ?? '').slice(0, 1000),
              // uploadVideoFileMux marks mid-transfer drops resumable — that distinction
              // decides whether the creator should be offered Resume or a fresh start.
              resumable: !!e?.resumable,
            } : {}),
          }).catch(() => {});
          trace('upload', `${status.toLowerCase()} ${input.surface}/${input.role} ${input.fileName}`);
        } catch { /* never throw */ }
      },
    };
  } catch {
    return NOOP;
  }
}

/**
 * Record a publish that completed with nothing playable attached. This is not an upload
 * failure in the transport sense — the transfer never happened — but it is the outcome the
 * creator actually cares about, and the one that used to leave no trace at all.
 */
export async function reportEmptyPublish(info: {
  surface: UploadSurface;
  targetId: string;
  targetTitle?: string;
  kind: string;       // 'MOVIE' | 'TV_SERIES' | 'ALBUM' …
  reason: string;
}): Promise<void> {
  try {
    const u = auth.currentUser;
    const id = `ua_empty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'uploadAttempts', id), {
      id,
      status: 'FAILED' as UploadAttemptStatus,
      surface: info.surface,
      role: 'PUBLISH',
      fileName: '(no media attached)',
      targetId: info.targetId,
      targetTitle: String(info.targetTitle || '').slice(0, 300),
      errorCode: 'empty-publish',
      errorMessage: info.reason.slice(0, 1000),
      kind: info.kind,
      percent: 0,
      ownerId: u?.uid || null,
      userEmail: u?.email || null,
      userName: u?.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      url: typeof location !== 'undefined' ? location.href.slice(0, 400) : '',
      startedAt: Date.now(),
      lastBeatAt: Date.now(),
      endedAt: Date.now(),
    });
  } catch { /* never throw — must not block a publish */ }
}

/** True when a row is UPLOADING but its heartbeat stopped — i.e. it died without reporting. */
export function isStalled(a: { status: string; lastBeatAt?: number }): boolean {
  return a.status === 'UPLOADING' && Date.now() - (a.lastBeatAt || 0) > STALE_AFTER_MS;
}

/** Human-readable outcome including the derived STALLED state the raw status can't express. */
export function outcomeOf(a: { status: string; lastBeatAt?: number }): 'UPLOADING' | 'STALLED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
  if (isStalled(a)) return 'STALLED';
  return a.status as any;
}

/**
 * The signed-in user's own recent attempts — powers the "something went wrong with my
 * upload?" view so a creator can see and report a failure without contacting support.
 */
export async function fetchMyUploadAttempts(max = 25): Promise<any[]> {
  try {
    const u = auth.currentUser;
    if (!u) return [];
    const snap = await getDocs(query(
      collection(db, 'uploadAttempts'),
      where('ownerId', '==', u.uid),
      orderBy('startedAt', 'desc'),
      fsLimit(max),
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // A missing composite index fails silently in Firestore — return empty rather than
    // breaking the caller's view. See the console for the index-creation link.
    return [];
  }
}
