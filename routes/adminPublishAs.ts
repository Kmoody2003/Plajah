// Admin "publish for a user": an admin uploads an artist's album and it lands on THE ARTIST's account.
//
//   GET  /api/admin/publish-as/user/:uid   the target's public identity, so the admin can confirm who they are publishing for
//   POST /api/admin/publish-as/album       { targetUid, albumId, title, artist, genre, description?, tags?, cover, tracks[] }
//
// The browser uploads the files straight to Storage under albums/{albumId}/ (Cloud Run caps request bodies, and a WAV album is
// gigabytes). Storage rules force those objects to carry the ADMIN's ownerUid stamp, so this route re-stamps every object to the
// target, then writes the album + side records from services/publishAsUser (the same builders scripts/publishAlbumForUser.ts uses).
// Nothing on the content names the admin; who did it is recorded server-side only, in adminPublishLog.
import express, { Router, type RequestHandler } from 'express';
import { fsGet, fsSet, fsPatch, fsCreate, getAccessToken } from '../services/firebaseAdminRest';
import {
  buildPublishAsAlbum, buildPublishAsMediaAsset, buildPublishAsFeedItem, buildPublishAsStreamJob, type PublishAsTrackInput,
} from '../services/publishAsUser';

const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const ID_RE = /^[\w-]{1,128}$/;
const MAX_TRACKS = 100;

/** The Storage object path inside a download URL for OUR bucket, or null for anything else. */
function objectPathOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'firebasestorage.googleapis.com') return null;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m || m[1] !== BUCKET) return null;
    return decodeURIComponent(m[2]);
  } catch { return null; }
}

/** Hand an uploaded object to the artist: ownerUid is what storage.rules use for overwrite/delete rights. */
async function restampOwner(objectPath: string, ownerUid: string): Promise<boolean> {
  const token = await getAccessToken();
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ metadata: { ownerUid } }),
  });
  return r.ok;
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export function createAdminPublishAsRouter(deps: { authenticate: RequestHandler; isAdmin: (req: any) => Promise<boolean> }): Router {
  const router = Router();
  router.use(express.json({ limit: '256kb' }));
  router.use(deps.authenticate);
  router.use(async (req: any, res, next) => {
    if (!(await deps.isAdmin(req))) return res.status(403).json({ error: 'Platform admin access required' });
    next();
  });

  router.get('/user/:uid', async (req, res) => {
    const uid = String(req.params.uid || '');
    if (!ID_RE.test(uid)) return res.status(400).json({ error: 'bad uid' });
    const u = await fsGet(`users/${uid}`);
    if (!u) return res.status(404).json({ error: 'user not found' });
    res.json({ uid, displayName: u.displayName || '', username: u.username || '', photoURL: u.photoURL || '', isArtist: !!u.isArtist });
  });

  router.post('/album', async (req: any, res) => {
    const b = req.body || {};
    const targetUid = str(b.targetUid, 128);
    const albumId = str(b.albumId, 128);
    if (!ID_RE.test(targetUid) || !ID_RE.test(albumId)) return res.status(400).json({ error: 'targetUid and albumId required' });
    const title = str(b.title, 200), artist = str(b.artist, 200), genre = str(b.genre, 80) || 'Other';
    if (!title || !artist) return res.status(400).json({ error: 'title and artist required' });

    const owner = await fsGet(`users/${targetUid}`);
    if (!owner) return res.status(404).json({ error: 'target user not found' });
    const existing = await fsGet(`albums/${albumId}`);
    if (existing && existing.ownerId !== targetUid) return res.status(409).json({ error: 'album id belongs to another account' });

    // Every file must be one the admin just uploaded into THIS album's folder in OUR bucket.
    const prefix = `albums/${albumId}/`;
    const inAlbum = (url: unknown) => { const p = typeof url === 'string' ? objectPathOf(url) : null; return p && p.startsWith(prefix) ? p : null; };
    const cover = b.cover || {};
    const coverPaths = [cover.display, cover.thumb, cover.original].filter(Boolean).map(inAlbum);
    if (!cover.display || !cover.original || coverPaths.some(p => !p)) return res.status(400).json({ error: 'cover must be uploaded into the album folder' });

    const rawTracks: any[] = Array.isArray(b.tracks) ? b.tracks.slice(0, MAX_TRACKS) : [];
    if (!rawTracks.length) return res.status(400).json({ error: 'at least one track required' });
    const tracks: PublishAsTrackInput[] = [];
    for (let i = 0; i < rawTracks.length; i++) {
      const t = rawTracks[i];
      const storagePath = inAlbum(t?.url);
      const id = str(t?.id, 128);
      if (!storagePath || !ID_RE.test(id)) return res.status(400).json({ error: `track ${i + 1} is not an upload in the album folder` });
      const dur = Number(t?.durationSec);
      tracks.push({ id, title: str(t?.title, 200) || `Track ${i + 1}`, url: t.url, storagePath, trackNo: i + 1, ...(dur > 0 && dur < 86400 ? { durationSec: dur } : {}) });
    }

    const restamped = await Promise.all([...coverPaths as string[], ...tracks.map(t => t.storagePath)].map(p => restampOwner(p, targetUid)));
    if (restamped.some(ok => !ok)) return res.status(502).json({ error: 'could not hand the uploaded files to the artist; nothing was published' });

    const album = buildPublishAsAlbum({
      albumId, ownerUid: targetUid, title, artist, genre,
      description: str(b.description, 4000),
      tags: Array.isArray(b.tags) ? b.tags.map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 20) : undefined,
      cover: { display: cover.display, thumb: cover.thumb, original: cover.original },
      tracks, createdAt: (existing?.createdAt as number) || Date.now(),
    }) as Record<string, any>;

    if (!(await fsSet(`albums/${albumId}`, album))) return res.status(502).json({ error: 'album write failed' });
    await Promise.all([
      fsSet(`mediaAssets/${albumId}`, buildPublishAsMediaAsset(album)),
      fsPatch(`users/${targetUid}`, { isArtist: true }),
      existing ? Promise.resolve(true) : fsSet(`feed/release_${albumId}`, buildPublishAsFeedItem(album, { displayName: owner.displayName, photoURL: owner.photoURL })),
      ...tracks.map(t => fsSet(`choraStreams/${t.id}`, buildPublishAsStreamJob(album, t))),
      fsCreate('adminPublishLog', { adminUid: req.uid, targetUid, albumId, title, trackCount: tracks.length, action: existing ? 'update' : 'create', at: Date.now() }),
    ]);
    res.json({ ok: true, albumId, ownerId: targetUid, tracks: tracks.length, updated: !!existing });
  });

  return router;
}
