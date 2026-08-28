/**
 * Taleo Story Intelligence worker — HTTP surface.
 *
 * A deliberately tiny Express app: POST /jobs enqueues a film analysis, GET /health reports
 * queue depth. The real work happens in pipeline.ts on an in-process FIFO (concurrency 1 —
 * the deploy pairs this with Cloud Run --concurrency 1 and --no-cpu-throttling, exactly like
 * the demucs worker; see DEPLOY.md).
 *
 * Auth is two layers: Cloud Run IAM (the caller mints an identity token, like server.ts does
 * for plajah-demucs) plus the shared STORY_WORKER_KEY header checked here as belt-and-braces.
 */
import express from 'express';
import { secretsEqual } from './lib.ts';
import { runPipeline, type StoryJob } from './pipeline.ts';

const app = express();
app.use(express.json({ limit: '64kb' }));

// ── In-process FIFO, concurrency 1 ───────────────────────────────────────────
// A module-level promise chain: each job starts only when the previous one settled. A worker
// restart loses queued jobs (the job doc's checkpoint shows the stall; re-POST to resume) —
// same known limitation as the demucs worker.
let queueDepth = 0;
let chain: Promise<void> = Promise.resolve();

function enqueue(job: StoryJob): void {
  queueDepth++;
  chain = chain
    .then(() => runPipeline(job))
    .catch((e) => { console.error('[queue] pipeline rejected unexpectedly:', e?.message || e); })
    .finally(() => { queueDepth--; });
}

// ── Routes ────────────────────────────────────────────────────────────────────

const ID_RE = /^[\w-]{1,128}$/;
const PLAYBACK_RE = /^[\w-]{1,256}$/;

app.post('/jobs', (req, res) => {
  const expected = process.env.STORY_WORKER_KEY || '';
  if (!expected) return res.status(503).json({ ok: false, message: 'worker not configured (STORY_WORKER_KEY unset)' });
  if (!secretsEqual(String(req.headers['x-worker-key'] || ''), expected)) {
    return res.status(401).json({ ok: false, message: 'unauthorized' });
  }

  const b = req.body || {};
  const albumId = String(b.albumId || '').trim();
  const ownerId = String(b.ownerId || '').trim();
  const muxPlaybackId = String(b.muxPlaybackId || '').trim();
  const title = String(b.title || '').trim().slice(0, 300);
  if (!ID_RE.test(albumId) || !ID_RE.test(ownerId)) {
    return res.status(400).json({ ok: false, message: 'albumId and ownerId required (word chars / dashes)' });
  }
  if (!PLAYBACK_RE.test(muxPlaybackId)) {
    return res.status(400).json({ ok: false, message: 'muxPlaybackId required' });
  }

  const job: StoryJob = {
    albumId, ownerId, muxPlaybackId,
    title: title || albumId,
    durationSec: Number.isFinite(Number(b.durationSec)) && Number(b.durationSec) > 0 ? Number(b.durationSec) : undefined,
    cast: Array.isArray(b.cast) ? b.cast.map((c: unknown) => String(c).slice(0, 120)).slice(0, 100) : undefined,
  };
  enqueue(job);
  res.status(202).json({ albumId, status: 'QUEUED' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, queue: queueDepth });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`[story-worker] listening on :${port}`));
