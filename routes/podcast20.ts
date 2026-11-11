/**
 * Podcasting 2.0 feeds for Plajah albums (podcast albums, sermons, On-air shows).
 *
 * Public (no auth, CORS *, cached 5 min):
 *   GET  /podcast/:albumId/feed.xml                      RSS 2.0 + iTunes + podcast:* (public, released, unpaid, cleared tracks only)
 *   GET  /podcast/:albumId/chapters/:trackId.json        JSON chapters (application/json+chapters)
 *   GET  /podcast/:albumId/transcript/:trackId.(vtt|srt|json)
 * Owner (Authorization: Bearer <Firebase ID token>, album.ownerId must match):
 *   GET  /api/podcast20/:albumId/settings                → { settings, feedUrl, guid, feedStatus, podcastIndexConfigured }
 *   PUT  /api/podcast20/:albumId/settings  { settings }  → validated + saved; pings Podcast Index if the feed is public
 *   POST /api/podcast20/:albumId/notify    { add? }      → hub/pubnotify (and add/byfeedurl when add=true)
 *
 * Settings live server-only at podcast20Feeds/{albumId}. Value-for-value splits pay each recipient's own
 * Lightning node/address straight from the listener's app; Plajah never holds funds or takes a share
 * unless the owner lists it as a recipient.
 */
import { Router, json, type Request, type Response } from 'express';
import type { Album } from '../types';
import { fsGet as realFsGet, fsSet as realFsSet, verifyIdToken as realVerify } from '../services/firebaseAdminRest';
import { albumFeedBlock, publicFeedAlbum } from '../services/podcast20/access';
import { buildChaptersDoc, CHAPTERS_MIME } from '../services/podcast20/chapters';
import { feedBase, guidForAlbum, podcastUrls, renderPublicFeed } from '../services/podcast20/feed';
import { credsFromEnv, notifyPodcastIndex, type NotifyResult } from '../services/podcast20/podcastIndex';
import { isSafeAlbumId, loadPodcast20Settings, savePodcast20Settings } from '../services/podcast20/store';
import { toJsonTranscript, toSrt, toVtt, trackCues, TRANSCRIPT_MIME } from '../services/podcast20/transcript';
import { validatePodcast20Settings } from '../services/podcast20/validate';
import type { Podcast20Settings } from '../services/podcast20/types';

export interface Podcast20RouterDeps {
  fsGet?: (path: string) => Promise<Record<string, any> | null>;
  fsSet?: (path: string, data: Record<string, unknown>) => Promise<boolean>;
  verifyIdToken?: (token: string) => Promise<string | null>;
  notify?: (feedUrl: string, opts?: { addIfMissing?: boolean }) => Promise<NotifyResult>;
  /** Public origin the feed is served from (default PODCAST_FEED_BASE / VITE_APP_URL / https://plajah.com). */
  base?: string;
  now?: () => number;
  podcastIndexConfigured?: () => boolean;
}

const SAFE_TRACK = /^[A-Za-z0-9_.:-]{1,128}$/;

export function createPodcast20Router(deps: Podcast20RouterDeps = {}): Router {
  const fsGet = deps.fsGet ?? realFsGet;
  const fsSet = deps.fsSet ?? realFsSet;
  const verify = deps.verifyIdToken ?? realVerify;
  const notify = deps.notify ?? ((url: string, o?: { addIfMissing?: boolean }) => notifyPodcastIndex(url, { addIfMissing: o?.addIfMissing }));
  const base = () => (deps.base ?? feedBase()).replace(/\/+$/, '');
  const now = deps.now ?? Date.now;
  const piConfigured = deps.podcastIndexConfigured ?? (() => !!credsFromEnv());
  const fs = { fsGet, fsSet };

  const router = Router();

  const publicHeaders = (res: Response) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
  };

  const loadAlbum = async (albumId: string): Promise<Album | null> =>
    isSafeAlbumId(albumId) ? ((await fsGet(`albums/${albumId}`)) as Album | null) : null;

  /** The album + track a public sub-resource may expose, or null (404). Same rules as the feed. */
  async function publicTrack(albumId: string, trackId: string) {
    if (!isSafeAlbumId(albumId) || !SAFE_TRACK.test(trackId)) return null;
    const [album, settings] = await Promise.all([loadAlbum(albumId), loadPodcast20Settings(fs, albumId)]);
    if (!album || albumFeedBlock(album, settings, now())) return null;
    const pub = publicFeedAlbum(album, now()) as Album;
    const track = pub.tracks.find(t => t.id === trackId);
    return track ? { album: pub, track, settings } : null;
  }

  // ── Public feed ───────────────────────────────────────────────────────────
  router.get('/podcast/:albumId/feed.xml', async (req: Request, res: Response) => {
    const albumId = String(req.params.albumId);
    if (!isSafeAlbumId(albumId)) { res.status(404).type('text/plain').send('Not found'); return; }
    const [album, settings] = await Promise.all([loadAlbum(albumId), loadPodcast20Settings(fs, albumId)]);
    const r = renderPublicFeed(albumId, album, settings, base(), now());
    if (!r.ok) { res.status(404).type('text/plain').send('Not found'); return; }
    publicHeaders(res);
    res.type('application/rss+xml; charset=utf-8').send(r.xml);
  });

  router.get('/podcast/:albumId/chapters/:file', async (req: Request, res: Response) => {
    const m = /^(.+)\.json$/.exec(String(req.params.file));
    const hit = m ? await publicTrack(String(req.params.albumId), m[1]) : null;
    const doc = hit ? buildChaptersDoc(hit.album, hit.track, hit.settings ?? undefined) : null;
    if (!doc) { res.status(404).type('text/plain').send('Not found'); return; }
    publicHeaders(res);
    res.type(`${CHAPTERS_MIME}; charset=utf-8`).send(JSON.stringify(doc));
  });

  router.get('/podcast/:albumId/transcript/:file', async (req: Request, res: Response) => {
    const m = /^(.+)\.(vtt|srt|json)$/.exec(String(req.params.file));
    const hit = m ? await publicTrack(String(req.params.albumId), m[1]) : null;
    const cues = hit ? trackCues(hit.track) : [];
    if (!m || !cues.length) { res.status(404).type('text/plain').send('Not found'); return; }
    const fmt = m[2] as keyof typeof TRANSCRIPT_MIME;
    publicHeaders(res);
    const body = fmt === 'vtt' ? toVtt(cues) : fmt === 'srt' ? toSrt(cues) : JSON.stringify(toJsonTranscript(cues));
    res.type(`${TRANSCRIPT_MIME[fmt]}; charset=utf-8`).send(body);
  });

  // ── Owner settings ────────────────────────────────────────────────────────
  async function ownerGate(req: Request, res: Response): Promise<{ uid: string; album: Album; albumId: string } | null> {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const uid = token ? await verify(token).catch(() => null) : null;
    if (!uid) { res.status(401).json({ error: 'Sign in required' }); return null; }
    const albumId = String(req.params.albumId);
    const album = await loadAlbum(albumId);
    if (!album) { res.status(404).json({ error: 'Album not found' }); return null; }
    if (album.ownerId !== uid) { res.status(403).json({ error: 'Only the album owner can change its podcast feed' }); return null; }
    return { uid, album, albumId };
  }

  const view = (albumId: string, album: Album, settings: Podcast20Settings | null) => {
    const b = base();
    const block = albumFeedBlock(album, settings, now());
    const pub = block ? [] : publicFeedAlbum(album, now()).tracks;
    return {
      settings: settings ?? {},
      feedUrl: podcastUrls(b, albumId).feed,
      guid: guidForAlbum(b, albumId, settings),
      feedStatus: block ?? 'public',
      publicTrackIds: pub.map(t => t.id),
      podcastIndexConfigured: piConfigured(),
    };
  };

  router.get('/api/podcast20/:albumId/settings', async (req: Request, res: Response) => {
    const g = await ownerGate(req, res); if (!g) return;
    const settings = await loadPodcast20Settings(fs, g.albumId);
    res.json(view(g.albumId, g.album, settings));
  });

  router.put('/api/podcast20/:albumId/settings', json({ limit: '256kb' }), async (req: Request, res: Response) => {
    const g = await ownerGate(req, res); if (!g) return;
    const trackIds = (g.album.tracks ?? []).map(t => t.id).filter(Boolean);
    const v = validatePodcast20Settings(req.body?.settings ?? req.body, { trackIds });
    if (!v.ok) { res.status(400).json({ error: 'Some podcast settings need fixing', errors: v.errors }); return; }
    const prev = await loadPodcast20Settings(fs, g.albumId);
    const b = base();
    const next: Podcast20Settings = {
      ...v.value,
      // Pin the show's identity the first time it is saved; moving hosts later must not change it.
      guid: prev?.guid || guidForAlbum(b, g.albumId, null),
      ownerId: g.uid,
      updatedAt: now(),
      ...(prev?.podcastIndexNotifiedAt ? { podcastIndexNotifiedAt: prev.podcastIndexNotifiedAt } : {}),
    };
    if (!(await savePodcast20Settings(fs, g.albumId, next))) { res.status(502).json({ error: 'Could not save, try again' }); return; }
    const out = view(g.albumId, g.album, next);
    let podcastIndex: NotifyResult | undefined;
    if (out.feedStatus === 'public' && piConfigured()) {
      podcastIndex = await notify(out.feedUrl).catch(() => ({ ok: false } as NotifyResult));
      if (podcastIndex.ok) await savePodcast20Settings(fs, g.albumId, { ...next, podcastIndexNotifiedAt: now() });
    }
    res.json({ ...out, ...(podcastIndex ? { podcastIndex } : {}) });
  });

  router.post('/api/podcast20/:albumId/notify', json({ limit: '4kb' }), async (req: Request, res: Response) => {
    const g = await ownerGate(req, res); if (!g) return;
    const settings = await loadPodcast20Settings(fs, g.albumId);
    const out = view(g.albumId, g.album, settings);
    if (out.feedStatus !== 'public') { res.status(409).json({ error: `This feed is not public (${out.feedStatus})`, feedStatus: out.feedStatus }); return; }
    if (!piConfigured()) { res.json({ ok: false, skipped: 'not_configured' }); return; }
    const r = await notify(out.feedUrl, { addIfMissing: req.body?.add === true });
    if (r.ok && settings) await savePodcast20Settings(fs, g.albumId, { ...settings, podcastIndexNotifiedAt: now() });
    res.json(r);
  });

  return router;
}
