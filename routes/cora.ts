// Cora Music Analysis — REST API Routes
// Mount with: app.use('/api/cora', express.json(), coraRouter)
//
// Endpoints:
//   POST   /api/cora/analyze-album    — ingest-time trigger (called by backendService after publish)
//   POST   /api/cora/detect-beats     — stateless beat detection, no DB write
//   POST   /api/cora/backfill         — retroactive job: analyze all unprocessed platform tracks
//   GET    /api/cora/songs            — list analyzed songs (?limit=&offset=)
//   GET    /api/cora/songs/:id        — get one song by DB id
//   GET    /api/cora/songs/track/:tid — get one song by platform track id
//   PUT    /api/cora/songs/:id        — update fields
//   DELETE /api/cora/songs/:id        — delete record
//   GET    /api/cora/log              — system usage audit log

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  analyzeAndPersist,
  selectBestBeatDetection,
  getSong,
  getSongByTrackId,
  listSongs,
  updateSong,
  deleteSong,
  hasSongRecord,
  getSystemLog,
  type PlatformTrack,
  type PlatformAlbumContext,
  type AudioMetadata,
} from '../services/coraAnalysisService';

export const coraRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIRESTORE_PROJECT = 'gen-lang-client-0665118474';
const FIRESTORE_DB      = 'plajah-prod';
const FIRESTORE_BASE    = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/${FIRESTORE_DB}`;

function parseFirestoreValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue  !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue    !== undefined) return null;
  if (v.arrayValue)  return (v.arrayValue.values ?? []).map(parseFirestoreValue);
  if (v.mapValue)    return parseFirestoreFields(v.mapValue.fields ?? {});
  return null;
}

function parseFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = parseFirestoreValue(val);
  return out;
}

/** Fetch one page of MUSIC albums from Firestore using a structured query */
async function fetchMusicAlbums(pageToken?: string): Promise<{ albums: any[]; nextPageToken?: string }> {
  const url = `${FIRESTORE_BASE}/documents:runQuery`;
  const body: any = {
    structuredQuery: {
      from: [{ collectionId: 'albums' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'type' },
          op: 'EQUAL',
          value: { stringValue: 'MUSIC' },
        },
      },
      limit: 100,
    },
  };
  if (pageToken) body.structuredQuery.offset = pageToken;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return { albums: [] };

  const rows: any[] = await res.json();
  const albums: any[] = [];
  let nextPageToken: string | undefined;

  for (const row of rows) {
    if (!row.document?.fields) continue;
    const parsed = parseFirestoreFields(row.document.fields);
    const docId = row.document.name?.split('/').pop();
    albums.push({ ...parsed, _id: docId });
    if (row.readTime) nextPageToken = row.readTime;
  }

  return { albums, nextPageToken };
}

// ─── POST /api/cora/analyze-album ─────────────────────────────────────────────
// Called by backendService.publishToCloud after a MUSIC album is written to
// Firestore. Analyzes every track and upserts into the songs table.
//
// Body: { albumId, ownerId, genre?, tracks: PlatformTrack[] }
// Auth: Firebase Bearer token (authMiddleware applied at mount point)

coraRouter.post('/analyze-album', async (req: Request, res: Response) => {
  const { albumId, ownerId, genre, tracks } = req.body ?? {};

  if (!albumId || typeof albumId !== 'string') {
    return res.status(400).json({ error: 'albumId is required' });
  }
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'tracks array is required' });
  }

  const album: PlatformAlbumContext = { id: albumId, genre, ownerId };
  const results: { trackId: string; status: 'analyzed' | 'skipped' | 'error'; tempo?: number; error?: string }[] = [];

  for (const t of tracks) {
    if (!t?.id || !t?.title || !t?.artist) {
      results.push({ trackId: t?.id ?? 'unknown', status: 'error', error: 'missing id/title/artist' });
      continue;
    }

    try {
      const { analysis } = await analyzeAndPersist(t as PlatformTrack, album);
      results.push({ trackId: t.id, status: 'analyzed', tempo: analysis.detectedTempo });
    } catch (err: any) {
      results.push({ trackId: t.id, status: 'error', error: err.message });
    }
  }

  const analyzed = results.filter(r => r.status === 'analyzed').length;
  return res.status(201).json({ albumId, analyzed, total: tracks.length, results });
});

// ─── POST /api/cora/detect-beats ──────────────────────────────────────────────
// Stateless — runs both algorithms on provided metadata, returns the winner.

coraRouter.post('/detect-beats', (req: Request, res: Response) => {
  const { trackId, metadata } = req.body ?? {};
  const id = (trackId as string) || randomUUID();
  const meta: AudioMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  const beatData = selectBestBeatDetection(id, meta);
  return res.json({
    trackId:    id,
    bpm:        beatData.bpm,
    confidence: beatData.confidence,
    method:     beatData.method,
    onsetCount: beatData.onsets.length,
    intervals:  beatData.intervals.slice(0, 16),
  });
});

// ─── POST /api/cora/backfill ──────────────────────────────────────────────────
// Retroactive job — queries Firestore for all MUSIC albums, analyzes any tracks
// not yet in the songs table. Idempotent: skips already-analyzed tracks.
// Protected by CORA_ADMIN_KEY env var.

coraRouter.post('/backfill', async (req: Request, res: Response) => {
  const adminKey = process.env.CORA_ADMIN_KEY;
  if (adminKey && req.headers['x-cora-admin-key'] !== adminKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const stats = { albumsScanned: 0, tracksScanned: 0, analyzed: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  try {
    const { albums } = await fetchMusicAlbums();
    stats.albumsScanned = albums.length;

    for (const album of albums) {
      const tracks: any[] = Array.isArray(album.tracks) ? album.tracks : [];
      const albumCtx: PlatformAlbumContext = {
        id:      album._id,
        genre:   album.genre,
        ownerId: album.ownerId,
      };

      for (const track of tracks) {
        if (!track?.id || !track?.title || !track?.artist) continue;
        stats.tracksScanned++;

        try {
          if (await hasSongRecord(track.id)) {
            stats.skipped++;
            continue;
          }
          await analyzeAndPersist(track as PlatformTrack, albumCtx);
          stats.analyzed++;
        } catch (err: any) {
          stats.errors++;
          errors.push(`${track.id}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message, stats });
  }

  return res.json({ ...stats, errors: errors.slice(0, 20) });
});

// ─── GET /api/cora/songs ──────────────────────────────────────────────────────

coraRouter.get('/songs', async (req: Request, res: Response) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? 50),  10) || 50,  200);
  const offset = parseInt(String(req.query.offset ?? 0), 10) || 0;
  try {
    const songs = await listSongs(limit, offset);
    return res.json({ songs, count: songs.length, limit, offset });
  } catch (err: any) {
    return res.status(503).json({ error: err.message });
  }
});

// ─── GET /api/cora/songs/track/:tid ───────────────────────────────────────────

coraRouter.get('/songs/track/:tid', async (req: Request, res: Response) => {
  try {
    const song = await getSongByTrackId(req.params.tid);
    if (!song) return res.status(404).json({ error: 'Not found' });
    return res.json({ song });
  } catch (err: any) {
    return res.status(503).json({ error: err.message });
  }
});

// ─── GET /api/cora/songs/:id ──────────────────────────────────────────────────

coraRouter.get('/songs/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid song id' });
  try {
    const song = await getSong(id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    return res.json({ song });
  } catch (err: any) {
    return res.status(503).json({ error: err.message });
  }
});

// ─── PUT /api/cora/songs/:id ──────────────────────────────────────────────────

coraRouter.put('/songs/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid song id' });

  const allowed = ['title', 'artist', 'lyrics', 'genreRules', 'tempo', 'beatDetectionVersion'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    const song = await updateSong(id, updates as any);
    return res.json({ song });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Song not found' });
    return res.status(503).json({ error: err.message });
  }
});

// ─── DELETE /api/cora/songs/:id ───────────────────────────────────────────────

coraRouter.delete('/songs/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid song id' });
  try {
    await deleteSong(id);
    return res.status(204).send();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Song not found' });
    return res.status(503).json({ error: err.message });
  }
});

// ─── GET /api/cora/log ────────────────────────────────────────────────────────

coraRouter.get('/log', (_req: Request, res: Response) => {
  const log = getSystemLog();
  return res.json({ entries: log, count: log.length });
});
