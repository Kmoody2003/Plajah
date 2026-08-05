// contentMetrics.ts — creator analytics telemetry (client half).
//
// Buffers playback/read events and flushes them in batches to /api/metrics/events, which is the
// ONLY thing that writes counters. The client never touches a counter doc directly: the previous
// client-side increments were silently denied by Firestore rules (see the endpoint comment), and
// a client-writable counter is a forgeable counter.
//
// WHAT THIS DOES NOT COLLECT: nothing identifying a viewer leaves here beyond the auth token the
// request already carries. No viewer id is sent in the payload, no per-person history is built.
// The server aggregates on arrival into per-content rollups, so a creator sees "how many" and
// "how far", never "who".
//
// Cost shape: buffered and flushed every ~30s (or on pause/exit), so a typical play costs 1-3
// writes rather than one per heartbeat. That is the whole reason for the buffer.

import { auth } from './backendService';

export type MetricContentType = 'track' | 'album' | 'video' | 'film' | 'book' | 'article' | 'post' | 'podcast';

interface MetricEvent {
  type: 'start' | 'progress' | 'complete';
  contentId: string;
  contentType: MetricContentType;
  ownerId?: string;
  secondsPlayed?: number;
  durationSec?: number;
  /** Furthest tenth reached (1-10) and the tenth already reported. The server credits only the
   *  span between them, so one session counts ONCE per decile — otherwise every progress event
   *  re-credits all the deciles below it and a single listener inflates r10 tenfold. */
  reachedDecile?: number;
  fromDecile?: number;
}

const FLUSH_MS = 30_000;
const MAX_BUFFER = 40;

let buffer: MetricEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/** Sessions already counted as a play, so a pause/resume or a re-render can't inflate the count. */
const startedThisSession = new Set<string>();
/** Furthest decile reported per content, so progress events only ever add NEW reach. */
const reportedDecile = new Map<string, number>();

function bindLifecycleListeners(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  // A closing tab is the most common way a session ends, and an ordinary fetch dies with the
  // document — so the last and most complete numbers would be exactly the ones lost. The
  // keepalive flush below is what survives it.
  const flushNow = () => { void flush(true); };
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void flush(); }, FLUSH_MS);
}

/** Send everything buffered. Uses a keepalive fetch, so it survives page teardown. */
export async function flush(_final = false): Promise<void> {
  if (!buffer.length) return;
  const events = buffer;
  buffer = [];
  if (timer) { clearTimeout(timer); timer = null; }

  try {
    const user = auth.currentUser;
    if (!user) return;   // anonymous plays aren't attributed; nothing to send
    const token = await user.getIdToken().catch(() => null);
    if (!token) return;
    const body = JSON.stringify({ events });

    // `keepalive` is the reason this works on a closing tab: the request outlives the document,
    // and unlike sendBeacon it can still carry an Authorization header — so the token never has
    // to travel in a URL, where it would end up in access logs.
    await fetch('/api/metrics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
      keepalive: true,
    });
  } catch {
    // Telemetry must never break playback or reading. A dropped batch is an acceptable loss;
    // re-queueing risks an unbounded buffer on a persistent outage.
  }
}

function push(ev: MetricEvent): void {
  bindLifecycleListeners();
  buffer.push(ev);
  if (buffer.length >= MAX_BUFFER) void flush();
  else schedule();
}

/** Count one play/view/open. Idempotent per session — call it as often as you like. */
export function trackStart(contentId: string, contentType: MetricContentType, ownerId?: string): void {
  if (!contentId) return;
  const key = `${contentType}:${contentId}`;
  if (startedThisSession.has(key)) return;
  startedThisSession.add(key);
  reportedDecile.set(key, 0);
  push({ type: 'start', contentId, contentType, ownerId });
}

/**
 * Report progress. Safe to call on every timeupdate — only NEW reach is ever sent, so a listener
 * scrubbing back and forth cannot inflate the retention curve.
 */
export function trackProgress(
  contentId: string,
  contentType: MetricContentType,
  positionSec: number,
  durationSec: number,
  ownerId?: string,
): void {
  if (!contentId || !(durationSec > 0) || !(positionSec >= 0)) return;
  const key = `${contentType}:${contentId}`;
  const decile = Math.min(10, Math.floor((positionSec / durationSec) * 10) + 1);
  const prev = reportedDecile.get(key) ?? 0;
  if (decile <= prev) return;              // no new ground covered
  reportedDecile.set(key, decile);
  push({
    type: 'progress', contentId, contentType, ownerId,
    // Only the newly-covered span counts as time consumed, so a re-listen of the same section
    // doesn't get double-billed into total watch time.
    secondsPlayed: ((decile - prev) / 10) * durationSec,
    durationSec,
    reachedDecile: decile,
    fromDecile: prev,
  });
}

/** Mark the piece finished. Called once; the server counts one completion. */
export function trackComplete(contentId: string, contentType: MetricContentType, durationSec?: number, ownerId?: string): void {
  if (!contentId) return;
  const key = `${contentType}:${contentId}`;
  if ((reportedDecile.get(key) ?? 0) >= 11) return;   // already completed this session
  reportedDecile.set(key, 11);
  push({ type: 'complete', contentId, contentType, ownerId, durationSec, reachedDecile: 10, fromDecile: Math.min(10, reportedDecile.get(key) ?? 0) });
  void flush();   // completions are the highest-value signal; don't risk losing them in a buffer
}

/** Forget session state — call on sign-out so counts don't leak across accounts. */
export function resetMetricsSession(): void {
  startedThisSession.clear();
  reportedDecile.clear();
}
