// lyricSyncWorker — server-side driver that gives every Chora song time-coded lyrics.
//
// WHY THIS EXISTS. Auto-sync used to run in the CREATOR'S BROWSER after publish
// (AlbumCreator.syncCaptionsAfterPublish): a sequential loop of ~60s transcription requests
// against each track's raw master. Leave the page, lose the network, or hit a 40-60MB WAV and
// the rest of the album silently never synced — which is why some songs in a project had
// lyrics and their neighbours didn't, and why the older catalogue was never backfilled at all.
//
// Same fix as services/choraTranscodeWorker: the job runs on the server. Every music track
// without timeCodedLyrics is a candidate; a key-gated cron route drives this worker inside
// Cloud Run's request budget, and an on-demand route (Show Mode, the upload flow) syncs one
// track right away through the same claim/record path, so the two can never double-spend.
//
// State lives in `lyricSyncJobs/{albumId}__{trackId}` (server-only), NOT on the album: a failure
// or an instrumental never rewrites the creator's album doc. Only a successful sync writes the
// album, and only that one track's `timeCodedLyrics`.
//
// Everything is dependency-injected; see tests/lyricSyncWorker.test.ts.

export type LyricJobStatus = 'running' | 'done' | 'empty' | 'failed';

export interface LyricJobDoc {
  status?: LyricJobStatus;
  attempts?: number;
  updatedAt?: number;
  error?: string;
  lines?: number;
}

export interface LyricCandidate {
  albumId: string;
  collection: 'albums' | 'personal_albums';
  trackId: string;
  title?: string;
  artist?: string;
  /** Raw source URL from the album doc (the server prefers the compressed rendition). */
  srcUrl: string;
  /** Track already carries timeCodedLyrics. */
  hasTimedLyrics: boolean;
}

export interface LyricSyncDeps {
  listCandidates(limit: number): Promise<LyricCandidate[]>;
  readJob(id: string): Promise<LyricJobDoc | null>;
  writeJob(id: string, patch: LyricJobDoc): Promise<void>;
  /** Transcribe + write the album. Resolves with the number of lines written (0 = no vocals). */
  syncOne(c: LyricCandidate): Promise<number>;
  now?: () => number;
}

export interface LyricSyncOptions {
  budgetMs?: number;
  maxTracks?: number;
  scanLimit?: number;
  reason?: string;
}

export interface LyricSyncSummary {
  status: 'ok' | 'skipped';
  reason?: string;
  durationMs: number;
  synced: number;
  empty: number;
  failed: number;
  remaining: number;
  alreadySynced: number;
  errors: string[];
}

/** A 'running' job older than this is presumed dead (container killed mid-transcription). */
export const LYRIC_RUNNING_STALE_MS = 10 * 60 * 1000;
/** Failures retry with a growing back-off, then stop — a broken file must not burn Gemini forever. */
export const LYRIC_MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 3 * 60 * 60 * 1000;

const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_MAX_TRACKS = 12;
const DEFAULT_SCAN_LIMIT = 2000;

export const lyricJobId = (albumId: string, trackId: string) => `${albumId}__${trackId}`.replace(/\//g, '_').slice(0, 700);

/** Does this track still need a sync attempt right now? */
export function needsLyricSync(c: Pick<LyricCandidate, 'hasTimedLyrics'>, job: LyricJobDoc | null | undefined, nowMs: number): boolean {
  if (c.hasTimedLyrics) return false;
  if (!job || !job.status) return true;
  if (job.status === 'empty') return false;            // instrumental / no intelligible vocals
  if (job.status === 'done') return true;              // synced once, but the lyrics are gone again (re-upload / cleared) → redo
  if (job.status === 'running') return !job.updatedAt || nowMs - job.updatedAt > LYRIC_RUNNING_STALE_MS;
  // failed
  const attempts = job.attempts || 0;
  if (attempts >= LYRIC_MAX_ATTEMPTS) return false;
  return !job.updatedAt || nowMs - job.updatedAt > RETRY_BACKOFF_MS * attempts;
}

/** Claim → sync → record. Shared by the cron worker and the on-demand route. */
export async function syncAndRecord(deps: LyricSyncDeps, c: LyricCandidate, prev: LyricJobDoc | null): Promise<{ status: LyricJobStatus; lines: number; error?: string }> {
  const now = deps.now ?? (() => Date.now());
  const id = lyricJobId(c.albumId, c.trackId);
  const attempts = (prev?.status === 'failed' ? prev.attempts || 0 : 0) + 1;
  await deps.writeJob(id, { status: 'running', attempts, updatedAt: now() });
  try {
    const lines = await deps.syncOne(c);
    const status: LyricJobStatus = lines > 0 ? 'done' : 'empty';
    await deps.writeJob(id, { status, attempts, lines, updatedAt: now(), error: '' }).catch(() => {});
    return { status, lines };
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 200);
    await deps.writeJob(id, { status: 'failed', attempts, updatedAt: now(), error }).catch(() => {});
    return { status: 'failed', lines: 0, error };
  }
}

let activeRun: Promise<LyricSyncSummary> | null = null;

async function runOnce(deps: LyricSyncDeps, opts: LyricSyncOptions): Promise<LyricSyncSummary> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxTracks = opts.maxTracks ?? DEFAULT_MAX_TRACKS;
  const s: LyricSyncSummary = { status: 'ok', reason: opts.reason, durationMs: 0, synced: 0, empty: 0, failed: 0, remaining: 0, alreadySynced: 0, errors: [] };

  let candidates: LyricCandidate[] = [];
  try { candidates = await deps.listCandidates(opts.scanLimit ?? DEFAULT_SCAN_LIMIT); }
  catch (e: any) { s.errors.push(`listCandidates: ${String(e?.message || e).slice(0, 200)}`); }

  for (const c of candidates) {
    if (!c?.trackId || !c?.albumId || !c?.srcUrl) continue;
    if (c.hasTimedLyrics) { s.alreadySynced++; continue; }
    let job: LyricJobDoc | null = null;
    try { job = await deps.readJob(lyricJobId(c.albumId, c.trackId)); }
    catch (e: any) { s.errors.push(`${c.trackId}: read failed`); continue; }
    if (!needsLyricSync(c, job, now())) continue;
    // Out of time: count it, never start a track the request can't finish.
    if (now() - started >= budgetMs || s.synced + s.empty + s.failed >= maxTracks) { s.remaining++; continue; }
    const r = await syncAndRecord(deps, c, job);
    if (r.status === 'done') s.synced++;
    else if (r.status === 'empty') s.empty++;
    else { s.failed++; s.errors.push(`${c.trackId}: ${r.error}`); }
  }
  s.durationMs = now() - started;
  s.errors = s.errors.slice(0, 20);
  return s;
}

/** Single-flight: an overlapping caller gets `skipped` instead of a parallel run. */
export function runLyricSyncWorker(deps: LyricSyncDeps, opts: LyricSyncOptions = {}): Promise<LyricSyncSummary> {
  if (activeRun) {
    return Promise.resolve({ status: 'skipped', reason: 'already running', durationMs: 0, synced: 0, empty: 0, failed: 0, remaining: 0, alreadySynced: 0, errors: [] });
  }
  activeRun = runOnce(deps, opts).finally(() => { activeRun = null; });
  return activeRun;
}
