/**
 * Taleo Story Intelligence — API-side enqueue (Phase 1).
 *
 * Same shape as the other routers here (see routes/kithSightings.ts): Express Router on Cloud
 * Run behind /api/**, Firestore over REST via the service account (which BYPASSES
 * firestore.rules — every route does its own authorization).
 *
 * The heavy work runs in the plajah-story-worker Cloud Run service (worker/story/), never
 * here: this route authenticates the creator, verifies album ownership, finds the film's Mux
 * playback id, creates/merges the job doc `taleoAnalysis/{albumId}`, and pokes the worker
 * over service-to-service auth — identity token (the demucs pattern in server.ts) plus the
 * shared STORY_WORKER_KEY header as belt-and-braces.
 *
 * Mount (server.ts):   app.use('/api/taleo', express.json({ limit: '16kb' }), taleoRouter);
 * Mux webhook hookup:  await enqueueIfReady(albumId)  — flips WAITING_MEDIA → QUEUED once the
 *                      playback id lands on the album/mirror doc.
 */
import { Router, Request, Response } from 'express';
import { fsGet, fsPatch, verifyIdToken, adminConfig } from '../services/firebaseAdminRest';

export const taleoRouter = Router();

const JOBS = 'taleoAnalysis';
const ID_RE = /^[\w-]{1,128}$/;

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

/** Mint an identity token for the worker URL (Cloud Run IAM), like server.ts does for demucs.
 *  Null off-platform — locally the shared key alone gets through an --allow-unauthenticated
 *  worker, and a private worker correctly refuses. */
async function workerIdToken(audience: string): Promise<string | null> {
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    return res.ok ? (await res.text()).trim() : null;
  } catch { return null; }
}

/** The film's playback id: first movie track on the album, else the Reello mirror doc
 *  `videos/sys_{albumId}_{trackId}` (backendService patches Mux ids onto both as the asset
 *  becomes ready — either may land first). */
async function findFilm(albumId: string, album: Record<string, any>): Promise<{
  muxPlaybackId: string | null; title: string; durationSec?: number; cast?: string[];
}> {
  const tracks: any[] = Array.isArray(album.tracks) ? album.tracks : [];
  const track = tracks[0];
  const title = String(track?.title || album.title || albumId);
  const durationSec = Number(track?.duration) > 0 ? Math.round(Number(track.duration)) : undefined;
  const castRaw = Array.isArray(album.cast) ? album.cast : Array.isArray(album.castNames) ? album.castNames : null;
  const cast = castRaw
    ? castRaw.map((c: any) => String(typeof c === 'object' ? c?.name ?? '' : c)).filter(Boolean).slice(0, 100)
    : undefined;

  let muxPlaybackId: string | null = typeof track?.muxPlaybackId === 'string' && track.muxPlaybackId ? track.muxPlaybackId : null;
  if (!muxPlaybackId && track?.id) {
    const mirror = await fsGet(`videos/sys_${albumId}_${track.id}`);
    if (typeof mirror?.muxPlaybackId === 'string' && mirror.muxPlaybackId) muxPlaybackId = mirror.muxPlaybackId;
  }
  return { muxPlaybackId, title, durationSec, cast: cast && cast.length ? cast : undefined };
}

/** Fire-and-forget poke. 5s ceiling, never fatal — the worker doc's status is the truth and
 *  enqueueIfReady / a re-POST can always poke again. */
async function pokeWorker(job: {
  albumId: string; ownerId: string; muxPlaybackId: string; title: string; durationSec?: number; cast?: string[];
}): Promise<void> {
  const worker = (process.env.STORY_WORKER_URL || '').replace(/\/+$/, '');
  if (!worker) return;
  try {
    const token = await workerIdToken(worker);
    const r = await fetch(`${worker}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': process.env.STORY_WORKER_KEY || '',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`[taleo] worker rejected job ${job.albumId}: HTTP ${r.status}`);
  } catch (e: any) {
    console.error(`[taleo] worker poke failed for ${job.albumId}:`, e?.message || e);
  }
}

// ── POST /api/taleo/analyze ───────────────────────────────────────────────────
/** Creator asks for a story analysis of their movie. Idempotent on the job doc (merge). */
taleoRouter.post('/analyze', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const albumId = String((req.body ?? {}).albumId || '').trim();
  if (!ID_RE.test(albumId)) return res.status(400).json({ error: 'albumId is required.' });

  const album = await fsGet(`albums/${albumId}`);
  if (!album) return res.status(404).json({ error: 'No such album.' });
  if (album.ownerId !== uid) return res.status(403).json({ error: 'Not your album.' });

  const film = await findFilm(albumId, album);
  const now = Date.now();
  const existing = await fsGet(`${JOBS}/${albumId}`);
  const status = film.muxPlaybackId ? 'QUEUED' : 'WAITING_MEDIA';

  const saved = await fsPatch(`${JOBS}/${albumId}`, {
    albumId,
    ownerId: uid,
    scope: 'MOVIE',
    status,
    progress: { stage: 'enqueue', pct: 0 },
    pipelineVersion: 1,
    createdAt: Number(existing?.createdAt) || now,
    updatedAt: now,
  });
  if (!saved) return res.status(500).json({ error: 'Could not create the analysis job.' });

  if (film.muxPlaybackId) {
    // Deliberately not awaited past its own 5s ceiling — the worker outlives this request by
    // minutes; the client polls the job doc.
    void pokeWorker({
      albumId, ownerId: uid, muxPlaybackId: film.muxPlaybackId,
      title: film.title, durationSec: film.durationSec, cast: film.cast,
    });
  }

  return res.status(202).json({ ok: true, albumId, status });
});

// ── enqueueIfReady — called from the Mux webhook in server.ts ─────────────────
/**
 * A movie published before its Mux transcode finished sits at WAITING_MEDIA. When the webhook
 * reports the asset ready (and backendService has patched muxPlaybackId onto the album/mirror
 * doc), this re-checks the job, flips it to QUEUED, and pokes the worker. A no-op for any
 * other status, so it is safe to call on every ready event.
 */
export async function enqueueIfReady(albumId: string): Promise<void> {
  if (!ID_RE.test(albumId)) return;
  const doc = await fsGet(`${JOBS}/${albumId}`);
  if (!doc || doc.status !== 'WAITING_MEDIA') return;

  const album = await fsGet(`albums/${albumId}`);
  if (!album) return;
  const ownerId = String(doc.ownerId || album.ownerId || '');
  if (!ownerId) return;

  const film = await findFilm(albumId, album);
  if (!film.muxPlaybackId) return; // still not ready — a later webhook will try again

  await fsPatch(`${JOBS}/${albumId}`, {
    status: 'QUEUED',
    progress: { stage: 'enqueue', pct: 0 },
    updatedAt: Date.now(),
  });
  await pokeWorker({
    albumId, ownerId, muxPlaybackId: film.muxPlaybackId,
    title: film.title, durationSec: film.durationSec, cast: film.cast,
  });
}
