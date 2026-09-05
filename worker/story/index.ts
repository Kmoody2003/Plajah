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
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import express from 'express';
import { secretsEqual, runFfmpeg } from './lib.ts';
import { runPipeline, type StoryJob } from './pipeline.ts';
import { transcribeChunkLocal, captionStillLocal } from './localModels.ts';

const app = express();
app.use(express.json({ limit: '64kb' }));

// ── In-process FIFO, concurrency 1 ───────────────────────────────────────────
// A module-level promise chain: each job starts only when the previous one settled. A worker
// restart loses queued jobs (the job doc's checkpoint shows the stall; re-POST to resume) —
// same known limitation as the demucs worker.
let queueDepth = 0;
let chain: Promise<void> = Promise.resolve();
// Same albumId submitted twice while the first run is still in flight (a client retry after a
// slow response, a double-click on the toggle, an overlapping enqueue + webhook poke) would
// otherwise race two writers against the SAME taleoAnalysis/{albumId} doc — the one that
// finishes LAST wins regardless of which result is better, silently clobbering a good analysis
// with a worse (or failed) one. The FIFO already serializes execution; this just refuses the
// duplicate outright instead of quietly queueing it behind the first.
const inFlight = new Set<string>();

function enqueue(job: StoryJob): void {
  queueDepth++;
  inFlight.add(job.albumId);
  chain = chain
    .then(() => runPipeline(job))
    .catch((e) => { console.error('[queue] pipeline rejected unexpectedly:', e?.message || e); })
    .finally(() => { queueDepth--; inFlight.delete(job.albumId); });
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
  if (inFlight.has(albumId)) {
    return res.status(409).json({ ok: false, albumId, status: 'ALREADY_RUNNING', message: 'an analysis for this album is already in progress' });
  }
  enqueue(job);
  res.status(202).json({ albumId, status: 'QUEUED' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, queue: queueDepth, inFlight: Array.from(inFlight) });
});

// ── Tier-3 smoke test ─────────────────────────────────────────────────────────
// Exercises Whisper + Florence-2 directly against a short slice of a real Mux asset, bypassing
// the full 5+2-attempt cloud ladder — proves the actual unknowns (native addon loads under
// glibc, model download succeeds, CPU inference is fast enough) in seconds instead of minutes,
// without needing both cloud tiers to fail first. Diagnostic only; same worker-key gate as
// /jobs. Kept (not removed after first use) as a standing smoke test for this tier.
app.post('/debug/local-tier', async (req: any, res) => {
  const expected = process.env.STORY_WORKER_KEY || '';
  if (!expected) return res.status(503).json({ ok: false, message: 'worker not configured' });
  if (!secretsEqual(String(req.headers['x-worker-key'] || ''), expected)) {
    return res.status(401).json({ ok: false, message: 'unauthorized' });
  }
  const muxPlaybackId = String((req.body || {}).muxPlaybackId || '').trim();
  if (!PLAYBACK_RE.test(muxPlaybackId)) return res.status(400).json({ ok: false, message: 'muxPlaybackId required' });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'story_debug_'));
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  try {
    const clip = path.join(tmp, 'clip.mp4');
    const pull = await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', `https://stream.mux.com/${muxPlaybackId}.m3u8`,
      '-t', '20', '-vf', 'scale=-2:360', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
      '-c:a', 'aac', '-b:a', '64k', clip,
    ], 60_000);
    timing.pullClipMs = Date.now() - t0;
    if (!pull.ok) return res.status(502).json({ ok: false, step: 'pull-clip', error: pull.err.slice(-500), timing });

    const jpg = path.join(tmp, 'still.jpg');
    const t1 = Date.now();
    const still = await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-ss', '5', '-i', clip, '-frames:v', '1', '-q:v', '3', jpg], 30_000);
    timing.extractStillMs = Date.now() - t1;
    if (!still.ok) return res.status(502).json({ ok: false, step: 'extract-still', error: still.err.slice(-500), timing });

    const t2 = Date.now();
    const [dialogue, caption] = await Promise.all([
      transcribeChunkLocal(clip, tmp, 'debug').catch(e => { throw new Error(`whisper: ${e?.message || e}`); }),
      captionStillLocal(jpg).catch(e => { throw new Error(`florence: ${e?.message || e}`); }),
    ]);
    timing.localModelsMs = Date.now() - t2;
    timing.totalMs = Date.now() - t0;

    res.json({ ok: true, dialogue, caption, timing });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e), timing: { ...timing, totalMs: Date.now() - t0 } });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`[story-worker] listening on :${port}`));
