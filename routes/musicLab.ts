import express, { Router, type RequestHandler } from 'express';
import { MUSIC_ENGINES, musicEngineAccess, type MusicEngineId } from '../services/musicEnginePolicy';
import { ENGINE_KINDS } from '../services/melos/generation/types';
import { MusicGenerationJobs, GenerationError } from '../services/melos/generation/jobs';
import { generationConfigs } from '../services/melos/generation/adapters';

interface Dependencies {
  authenticate: RequestHandler;
  isAdmin: (uid: string) => Promise<boolean>;
  evaluationPermission?: (id: MusicEngineId) => string | undefined;
  jobs?: MusicGenerationJobs;
}

/** All operations, including media downloads, require server-verified admin access. */
export function createMusicLabRouter(deps: Dependencies) {
  const router = Router();
  const jobs = deps.jobs || new MusicGenerationJobs(generationConfigs(), id => deps.evaluationPermission?.(id));
  router.use(deps.authenticate);
  router.use(async (req: any, res, next) => {
    try {
      if (!req.uid || !await deps.isAdmin(req.uid)) return res.status(403).json({ error: 'Admin access required' });
      res.setHeader('Cache-Control', 'no-store');
      next();
    } catch {
      res.status(503).json({ error: 'Could not verify admin access' });
    }
  });
  router.use(express.json({ limit: '28mb' }));
  router.get('/engines', (_req, res) => {
    res.json({ engines: MUSIC_ENGINES.map(engine => ({
      ...engine,
      publicAvailable: false,
      kinds: ENGINE_KINDS[engine.id],
      runtimeConnected: jobs.configured(engine.id),
      permissionRecorded: !!deps.evaluationPermission?.(engine.id)?.trim(),
      access: musicEngineAccess(engine.id, {
        isAdmin: true,
        evaluationPermission: deps.evaluationPermission?.(engine.id),
        runtimeConnected: jobs.configured(engine.id),
      }),
    })) });
  });
  router.post('/engines/:id/generate', (req: any, res) => {
    const id = req.params.id as MusicEngineId;
    const access = musicEngineAccess(id, {
      isAdmin: true, evaluationPermission: deps.evaluationPermission?.(id), runtimeConnected: jobs.configured(id),
    });
    if (!access.allowed) return res.status(access.status).json({ error: access.reason });
    try { res.status(202).json(jobs.start(req.uid, { ...req.body, engine: id })); }
    catch (error) { res.status(error instanceof GenerationError ? error.status : 500).json({ error: (error as Error).message }); }
  });
  router.get('/jobs/:id', (req: any, res) => {
    try { res.json(jobs.get(req.uid, req.params.id)); }
    catch (error) { res.status(error instanceof GenerationError ? error.status : 500).json({ error: (error as Error).message }); }
  });
  router.get('/jobs/:id/audio', (req: any, res) => {
    try {
      const audio = jobs.audio(req.uid, req.params.id);
      res.setHeader('Content-Type', audio.mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(audio.bytes);
    } catch (error) { res.status(error instanceof GenerationError ? error.status : 500).json({ error: (error as Error).message }); }
  });
  router.delete('/jobs/:id', (req: any, res) => {
    try { res.json(jobs.cancel(req.uid, req.params.id)); }
    catch (error) { res.status(error instanceof GenerationError ? error.status : 500).json({ error: (error as Error).message }); }
  });
  return router;
}
