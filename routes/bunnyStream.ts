// routes/bunnyStream.ts — on-demand video hosting on Bunny Stream (Mux replacement for VOD, plan phase 2).
//
//   GET  /api/video-host/provider            → { provider: 'bunny' | 'mux', cdnHost? }   (public)
//   POST /api/video-host/bunny/uploads       { title, trace?, thumbnailTimeMs? } → { videoId, tus, playback }
//   POST /api/video-host/bunny/uploads/:id/resume                    → fresh TUS headers (owner, still uploading)
//   GET  /api/video-host/bunny/videos/:id    → state + playback URLs (owner or admin)
//   POST /api/bunny/webhook                  raw body, HMAC-checked (bunnyWebhookHandler)
//
// OFF unless BUNNY_STREAM_ENABLED=1 and every BUNNY_STREAM_* value is set: provider answers 'mux' and the
// Bunny routes answer 503 bunny_off, so production stays on Mux until the switch is flipped.
// Browser uploads go straight to Bunny over TUS with per-video signed headers; the library key never
// leaves the server. Server-only Firestore record: hostedVideos/{guid} { provider, ownerUid, title,
// trace, state, createdAt, updatedAt, durationSec?, maxResolution? } (no client rule matches it).

import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  bunnyHlsUrl, bunnyMp4Url, bunnyPreviewUrl, bunnyThumbnailUrl, isBunnyGuid, maxResolution, videoStatusState,
  webhookStatusState, type BunnyStreamConfig,
} from '../services/bunnyStream/core';
import type { BunnyVideo, TusUploadAuth } from '../services/bunnyStream/server';
import { bunnyDocFields } from '../services/video/playback';

export interface HostedVideoRecord {
  provider: 'bunny';
  ownerUid: string;
  title: string;
  trace?: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  durationSec?: number;
  maxResolution?: number;
}

export interface BunnyRouteDeps {
  config: () => BunnyStreamConfig | null;
  /** Runs before the upload handler: auth + capability checks (sets req.uid). */
  uploadGuards: RequestHandler[];
  /** Runs before the status handler: auth (sets req.uid). */
  readGuards: RequestHandler[];
  isAdmin: (req: Request) => Promise<boolean>;
  store: {
    get: (guid: string) => Promise<HostedVideoRecord | null>;
    set: (guid: string, rec: HostedVideoRecord) => Promise<boolean>;
    patch: (guid: string, fields: Partial<HostedVideoRecord>) => Promise<boolean>;
  };
  api: {
    createVideo: (cfg: BunnyStreamConfig, title: string, thumbnailTimeMs?: number) => Promise<BunnyVideo>;
    getVideo: (cfg: BunnyStreamConfig, guid: string) => Promise<BunnyVideo>;
    tusUploadAuth: (cfg: BunnyStreamConfig, guid: string) => TusUploadAuth;
  };
  now?: () => number;
}

export function playbackFor(cdnHost: string, guid: string, v?: Pick<BunnyVideo, 'hasMP4Fallback' | 'availableResolutions'>) {
  const top = maxResolution(v?.availableResolutions);
  const mp4Height = ([1080, 720, 480, 360, 240] as const).find(h => h <= top);
  return {
    hlsUrl: bunnyHlsUrl(cdnHost, guid),
    thumbnailUrl: bunnyThumbnailUrl(cdnHost, guid),
    previewUrl: bunnyPreviewUrl(cdnHost, guid),
    mp4Url: v?.hasMP4Fallback && mp4Height ? bunnyMp4Url(cdnHost, guid, mp4Height) : undefined,
  };
}

/** Patch that finishes a doc which was waiting on a Bunny upload (its muxUploadId is `bunny:<guid>`).
 *  Keeps the creator's own poster and any duration already measured from the local file. */
export function finishedDocPatch(cdnHost: string, guid: string, existing: Record<string, any>, v: Pick<BunnyVideo, 'width' | 'height' | 'length'>): Record<string, unknown> {
  const f = bunnyDocFields(guid, cdnHost);
  const shape = v.width > 0 && v.height > 0 ? (v.width / v.height < 0.9 ? 'VERTICAL' : v.width / v.height <= 1.1 ? 'SQUARE' : 'HORIZONTAL') : '';
  return {
    bunnyVideoId: f.bunnyVideoId, bunnyCdnHost: f.bunnyCdnHost, videoHost: f.videoHost,
    url: f.url, muxUploadId: null, status: 'ready',
    ...(existing.thumbnailUrl ? {} : { thumbnailUrl: f.thumbnailUrl }),
    ...(shape && !existing.aspectRatio ? { aspectRatio: shape } : {}),
    ...(!existing.duration && v.length > 0 ? { duration: Math.round(v.length) } : {}),
  };
}

const off = (res: Response) => res.status(503).json({ error: 'bunny_off' });
const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export function createBunnyStreamRouter(deps: BunnyRouteDeps): Router {
  const r = Router();
  const now = deps.now ?? Date.now;

  r.get('/provider', (_req, res) => {
    const cfg = deps.config();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(cfg ? { provider: 'bunny', cdnHost: cfg.cdnHost } : { provider: 'mux' });
  });

  r.post('/bunny/uploads', ...deps.uploadGuards, async (req: Request, res: Response) => {
    const cfg = deps.config();
    if (!cfg) return off(res);
    const uid = (req as any).uid as string | undefined;
    if (!uid) return res.status(401).json({ error: 'Sign in to upload' });
    const title = String(req.body?.title || '').slice(0, 200);
    const trace = String(req.body?.trace || '').slice(0, 255);
    const thumb = Number(req.body?.thumbnailTimeMs);
    try {
      const video = await deps.api.createVideo(cfg, title, Number.isFinite(thumb) && thumb > 0 ? thumb : undefined);
      if (!isBunnyGuid(video?.guid)) throw new Error('Bunny returned no video id');
      const t = now();
      // Ownership is recorded BEFORE the browser gets upload rights, so no video is ever anonymous.
      const saved = await deps.store.set(video.guid, { provider: 'bunny', ownerUid: uid, title, trace, state: 'uploading', createdAt: t, updatedAt: t });
      if (!saved) throw new Error('could not record the upload');
      res.json({ videoId: video.guid, tus: deps.api.tusUploadAuth(cfg, video.guid), playback: playbackFor(cfg.cdnHost, video.guid) });
    } catch (e: any) {
      console.error('[bunny] create upload:', e?.message);
      res.status(502).json({ error: 'Could not start the upload' });
    }
  });

  // Resume an interrupted upload: fresh signed headers for the SAME video (owner only, still uploading).
  // tus-js-client then continues from the last byte Bunny has.
  r.post('/bunny/uploads/:id/resume', ...deps.uploadGuards, async (req: Request, res: Response) => {
    const cfg = deps.config();
    if (!cfg) return off(res);
    const guid = req.params.id;
    if (!isBunnyGuid(guid)) return res.status(400).json({ error: 'Bad video id' });
    const uid = (req as any).uid as string | undefined;
    if (!uid) return res.status(401).json({ error: 'Sign in to upload' });
    const rec = await deps.store.get(guid);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.ownerUid !== uid) return res.status(403).json({ error: 'Not your upload' });
    if (rec.state !== 'uploading') return res.status(409).json({ error: 'Upload already finished' });
    res.json({ videoId: guid, tus: deps.api.tusUploadAuth(cfg, guid), playback: playbackFor(cfg.cdnHost, guid) });
  });

  r.get('/bunny/videos/:id', ...deps.readGuards, async (req: Request, res: Response) => {
    const cfg = deps.config();
    if (!cfg) return off(res);
    const guid = req.params.id;
    if (!isBunnyGuid(guid)) return res.status(400).json({ error: 'Bad video id' });
    const uid = (req as any).uid as string | undefined;
    const rec = await deps.store.get(guid);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.ownerUid !== uid && !(await deps.isAdmin(req))) return res.status(403).json({ error: 'Not your video' });
    try {
      const v = await deps.api.getVideo(cfg, guid);
      const state = videoStatusState(v.status);
      const fields: Partial<HostedVideoRecord> = { state, updatedAt: now(), durationSec: v.length || undefined, maxResolution: maxResolution(v.availableResolutions) || undefined };
      if (state !== rec.state) await deps.store.patch(guid, defined(fields));
      res.json({
        videoId: guid, state, encodeProgress: v.encodeProgress, durationSec: v.length, width: v.width, height: v.height,
        maxResolution: fields.maxResolution, ...(state === 'ready' ? playbackFor(cfg.cdnHost, guid, v) : {}),
      });
    } catch (e: any) {
      console.error('[bunny] status:', e?.message);
      res.status(502).json({ error: 'Could not read video status' });
    }
  });

  return r;
}

/** POST /api/bunny/webhook — mount with express.raw({ type: '*\/*' }) so req.body is the exact bytes.
 *  The payload is only a hint: state is re-read from Bunny's API, never taken from the body. */
export function bunnyWebhookHandler(deps: Pick<BunnyRouteDeps, 'config' | 'store' | 'api' | 'now'> & {
  verify: (raw: Buffer, headers: Request['headers'], key: string) => boolean;
  /** Finish whatever docs were waiting on this upload (server side, so a closed tab doesn't matter). Must be idempotent. */
  onReady?: (cfg: BunnyStreamConfig, guid: string, v: BunnyVideo) => Promise<void>;
}): RequestHandler {
  const now = deps.now ?? Date.now;
  return async (req, res) => {
    const cfg = deps.config();
    if (!cfg) return off(res);
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!deps.verify(raw, req.headers, cfg.readOnlyKey)) return res.status(401).json({ error: 'Bad signature' });
    let body: any;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
    if (body?.IsLiveStreamWebhook) return res.json({ ok: true, ignored: 'live' });
    if (String(body?.VideoLibraryId) !== cfg.libraryId) return res.json({ ok: true, ignored: 'library' });
    const guid = body?.VideoGuid;
    if (!isBunnyGuid(guid)) return res.status(400).json({ error: 'Bad video id' });
    const hinted = webhookStatusState(Number(body?.Status));
    if (hinted === null) return res.json({ ok: true, ignored: 'status' });
    const rec = await deps.store.get(guid);
    if (!rec) return res.json({ ok: true, ignored: 'unknown video' }); // not created through Plajah
    try {
      if (hinted === 'deleted') { await deps.store.patch(guid, { state: 'deleted', updatedAt: now() }); return res.json({ ok: true }); }
      const v = await deps.api.getVideo(cfg, guid);
      const state = videoStatusState(v.status);
      await deps.store.patch(guid, defined({ state, updatedAt: now(), durationSec: v.length || undefined, maxResolution: maxResolution(v.availableResolutions) || undefined }));
      if (state === 'ready' && deps.onReady) await deps.onReady(cfg, guid, v);
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[bunny] webhook:', e?.message);
      res.status(500).json({ error: 'retry' }); // 5xx → Bunny retries (30 s … 2 h)
    }
  };
}
