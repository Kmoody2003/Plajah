// choraTranscodeWorker — server-side driver for the Chora streaming-ladder transcode.
//
// WHY THIS EXISTS. Transcoding used to be driven by the BROWSER. On publish,
// components/AlbumCreator.tsx ran a `for` loop calling enqueueTranscode() per track with no
// await — fire-and-forget, each one a synchronous ~150s ffmpeg request. Publishing a 39-track
// album fired 39 concurrent 150-second jobs from a single page load, then navigated away and
// abandoned them.
//
// That failed in two directions at once. Cloud Run was stampeded by the concurrency, and because
// the server wrote status:'processing' BEFORE starting work and only overwrote it on completion,
// every killed request pinned its doc to 'processing' forever. 68 tracks sat that way for 25-38
// days, clustered into exactly 5 album publishes. About 30% of the catalogue had no HLS
// rendition and streamed as a raw master, which is what listeners experienced as dropouts.
//
// THE FIX IS WHERE THE JOB RUNS, not how it retries. Publishing now only marks tracks 'pending';
// this worker claims them server-side, one at a time, and is driven by an external scheduler.
//
// Shape is copied deliberately from services/terraIngestionWorker — same single-flight guard,
// same in-process scheduler for warm containers, same key-gated cron route as the durable
// driver. server.ts:2774 explains why the external scheduler is the real one: Cloud Run scales
// to zero, so an in-process setInterval almost never fires.
//
// Everything here is dependency-injected. The actual ffmpeg + GCS work lives in server.ts
// (choraTranscodeToGcs), which cannot be imported into a test — so the SCHEDULING logic, which
// is what was broken, is testable on its own with fakes. See tests/choraTranscodeWorker.test.ts.

export type ChoraStreamStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface ChoraStreamDoc {
  status?: ChoraStreamStatus;
  updatedAt?: number;
  error?: string;
}

/** One unit of work: a music track with a fetchable source URL. */
export interface TrackCandidate {
  trackId: string;
  srcUrl: string;
  albumId?: string;
}

export interface ChoraTranscodeDeps {
  /** Every music track on the platform that could need a rendition, newest-first is fine. */
  listCandidates(limit: number): Promise<TrackCandidate[]>;
  /** Current stream doc for a track, or null when none exists yet. */
  readStream(trackId: string): Promise<ChoraStreamDoc | null>;
  /** Merge-write the stream doc. */
  writeStream(trackId: string, patch: Record<string, unknown>): Promise<void>;
  /** Do the real work. Throws on failure. */
  transcodeOne(job: TrackCandidate): Promise<void>;
  /** Injectable clock, so tests don't depend on wall time. */
  now?: () => number;
}

export interface ChoraTranscodeOptions {
  /**
   * Stop claiming new tracks once this much wall time has elapsed.
   *
   * The cron route awaits this run, and Cloud Run kills a request at 300s — so a run MUST
   * finish inside that or the driver is killed exactly like the browser was, recreating the
   * bug this replaces. 240s leaves room for the in-flight track to finish and the summary to
   * be written. Deadline rather than a track count on purpose: a run adapts to how long the
   * tracks actually take instead of guessing.
   */
  budgetMs?: number;
  /** Hard cap on tracks per run, as a backstop if transcodes turn out to be very fast. */
  maxTracks?: number;
  /** How many candidates to scan for work. */
  scanLimit?: number;
  reason?: string;
}

export interface ChoraTranscodeSummary {
  status: 'ok' | 'skipped';
  reason?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Tracks that finished successfully this run. */
  transcoded: number;
  /** Tracks attempted but which threw. */
  failed: number;
  /** Tracks that still need work after this run — what's left in the backlog. */
  remaining: number;
  /** Tracks scanned and found already 'ready'. */
  alreadyReady: number;
  errors: string[];
}

/**
 * How long a 'processing' doc may sit before its job is presumed dead.
 *
 * Mirrors PROCESSING_STALE_MS in services/choraStreamService, deliberately duplicated rather
 * than imported: that module pulls in the Firebase CLIENT SDK, which must not be loaded into
 * the server process. If you change one, change both.
 */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;

const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_MAX_TRACKS = 25;
const DEFAULT_SCAN_LIMIT = 400;
/** Interval for the in-process scheduler. The external cron is the durable driver; this only
 *  helps a container that happens to stay warm. */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Does this track still need a rendition?
 *
 * A missing doc, an explicit 'pending', and a 'failed' all mean yes. 'processing' means yes ONLY
 * when it is stale — skipping live jobs is what stops a second worker from racing a first, and
 * NOT skipping dead ones is what un-pins the 68 abandoned tracks. Treating every 'processing'
 * as live was the bug that made the old backfill silently skip exactly the tracks that needed it.
 */
export function needsTranscode(s: ChoraStreamDoc | null | undefined, nowMs: number): boolean {
  if (!s || !s.status) return true;
  if (s.status === 'ready') return false;
  if (s.status === 'pending' || s.status === 'failed') return true;
  if (s.status === 'processing') {
    if (!s.updatedAt) return true;                     // predates updatedAt — old by definition
    return nowMs - s.updatedAt > PROCESSING_STALE_MS;
  }
  return true;
}

let activeRun: Promise<ChoraTranscodeSummary> | null = null;
let schedulerStarted = false;

async function runOnce(
  deps: ChoraTranscodeDeps,
  opts: ChoraTranscodeOptions,
): Promise<ChoraTranscodeSummary> {
  const now = deps.now ?? (() => Date.now());
  const startedMs = now();
  const startedAt = new Date(startedMs).toISOString();
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxTracks = opts.maxTracks ?? DEFAULT_MAX_TRACKS;
  const scanLimit = opts.scanLimit ?? DEFAULT_SCAN_LIMIT;

  let transcoded = 0;
  let failed = 0;
  let alreadyReady = 0;
  let remaining = 0;
  const errors: string[] = [];

  let candidates: TrackCandidate[] = [];
  try {
    candidates = await deps.listCandidates(scanLimit);
  } catch (e: any) {
    errors.push(`listCandidates: ${String(e?.message || e).slice(0, 200)}`);
  }

  for (const job of candidates) {
    if (!job?.trackId || !job?.srcUrl) continue;

    let stream: ChoraStreamDoc | null = null;
    try {
      stream = await deps.readStream(job.trackId);
    } catch (e: any) {
      errors.push(`${job.trackId}: read failed: ${String(e?.message || e).slice(0, 120)}`);
      continue;
    }

    if (!needsTranscode(stream, now())) {
      if (stream?.status === 'ready') alreadyReady++;
      continue;
    }

    // Out of time: count what's left rather than starting a track we cannot finish. Starting one
    // here is precisely how the old path stranded docs — the request dies mid-transcode and the
    // doc keeps a 'processing' that no longer has a job behind it.
    if (now() - startedMs >= budgetMs || transcoded + failed >= maxTracks) {
      remaining++;
      continue;
    }

    // Claim it. 'processing' is written HERE, when work actually begins — not at enqueue time,
    // which is what let an abandoned request pin a doc forever. updatedAt is what makes the
    // staleness check above able to reclaim it if this run dies too.
    try {
      await deps.writeStream(job.trackId, { status: 'processing', updatedAt: now() });
    } catch (e: any) {
      errors.push(`${job.trackId}: claim failed: ${String(e?.message || e).slice(0, 120)}`);
      remaining++;
      continue;
    }

    try {
      await deps.transcodeOne(job);
      transcoded++;
    } catch (e: any) {
      failed++;
      const msg = String(e?.message || e).slice(0, 200);
      errors.push(`${job.trackId}: ${msg}`);
      // Record the failure so the doc doesn't sit at 'processing' waiting to go stale. 'failed'
      // is retried by needsTranscode on the next pass, so this costs nothing but visibility.
      await deps.writeStream(job.trackId, { status: 'failed', error: msg, updatedAt: now() })
        .catch(() => { /* the staleness check reclaims it either way */ });
    }
  }

  const finishedMs = now();
  return {
    status: 'ok',
    reason: opts.reason,
    startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - startedMs,
    transcoded,
    failed,
    remaining,
    alreadyReady,
    errors: errors.slice(0, 20),
  };
}

/**
 * Single-flight entry point. A second caller gets a `skipped` summary rather than a parallel run.
 *
 * This matters more here than it does for Terra: two overlapping runs would both claim the same
 * stale 'processing' docs and transcode the same track twice, which is exactly the stampede that
 * broke Cloud Run in the first place.
 */
export function runChoraTranscodeWorker(
  deps: ChoraTranscodeDeps,
  options: ChoraTranscodeOptions = {},
): Promise<ChoraTranscodeSummary> {
  if (activeRun) {
    const now = new Date().toISOString();
    return Promise.resolve({
      status: 'skipped',
      reason: 'already_running',
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      transcoded: 0,
      failed: 0,
      remaining: 0,
      alreadyReady: 0,
      errors: [],
    });
  }
  activeRun = runOnce(deps, options).finally(() => { activeRun = null; });
  return activeRun;
}

/** Test seam: clear the single-flight latch between cases. */
export function _resetChoraWorkerState(): void {
  activeRun = null;
  schedulerStarted = false;
}

/**
 * In-process scheduler, for a container that happens to stay warm.
 *
 * NOT the durable driver — Cloud Run scales to zero and this timer usually never fires. The real
 * one is an external scheduler hitting the cron route. This exists so a long-lived instance makes
 * progress between cron ticks, and so local development drains the queue without any scheduler.
 */
export function startChoraTranscodeScheduler(
  deps: ChoraTranscodeDeps,
  { intervalMs = DEFAULT_INTERVAL_MS } = {},
): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(() => {
    runChoraTranscodeWorker(deps, { reason: 'scheduled_interval' }).catch(err => {
      console.warn('[Chora transcode] Scheduled run failed:', err?.message || err);
    });
  }, intervalMs);

  // A pass shortly after boot, so a fresh deploy starts chewing the backlog without waiting a
  // full interval. Delayed so it doesn't compete with startup work for the CPU boost window.
  setTimeout(() => {
    runChoraTranscodeWorker(deps, { reason: 'startup' }).catch(err => {
      console.warn('[Chora transcode] Startup run failed:', err?.message || err);
    });
  }, 60_000);
}
