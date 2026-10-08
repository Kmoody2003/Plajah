/**
 * Plajah Home hub — embeddable server (one implementation for the PC and the Android TV app).
 *
 *  · Android: services/home/hubEntry.ts (bundled by scripts/buildHubBundle.mjs, nodejs-mobile 18 in
 *    the `:hub` process) calls startHub(ctx) and routes every non-/health request to `handler`.
 *  · PC: server.ts mounts the same routers (routes/homeHubRoutes.ts + routes/matterRoutes.ts)
 *    directly; this file is not needed there.
 *
 * `handler` is an Express app serving /api/home/* and /api/matter/* with the hub CORS policy.
 * Matter runs in-process on Android (matterControllerService picks that from PLAJAH_HUB_PLATFORM).
 */
import express from 'express';
import cors from 'cors';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homeHubRouter, HOME_HUB_ORIGINS, startHomeHub, stopHomeHub } from '../../routes/homeHubRoutes';
import { matterRouter } from '../../routes/matterRoutes';

export interface HubContext {
  host: string;
  port: number;
  dataDir: string;
  platform: string;
  log: (...a: unknown[]) => void;
}

export interface HubInstance {
  handler: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;
  stop?: () => Promise<void>;
}

export async function startHub(ctx: HubContext): Promise<HubInstance> {
  // hubStorage / matterCore resolve PLAJAH_HOME_DIR on use; hubEntry already sets it to ctx.dataDir.
  if (ctx.dataDir && !process.env.PLAJAH_HOME_DIR) process.env.PLAJAH_HOME_DIR = ctx.dataDir;
  if (ctx.platform && !process.env.PLAJAH_HUB_PLATFORM && ctx.platform === 'android') process.env.PLAJAH_HUB_PLATFORM = 'android';

  const app = express();
  app.disable('x-powered-by');
  const isLocalOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || HOME_HUB_ORIGINS.includes(origin) || isLocalOrigin(origin)),
    credentials: false,
    allowedHeaders: ['Content-Type', 'X-Plajah-Hub-Token'],
  }));
  app.use(homeHubRouter);
  app.use(matterRouter);

  await startHomeHub(ctx.port, ctx.host);
  ctx.log(`Plajah Home hub ready on ${ctx.host}:${ctx.port} (${ctx.platform}), data ${process.env.PLAJAH_HOME_DIR || ctx.dataDir}`);

  return {
    handler: app as unknown as HubInstance['handler'],
    stop: async () => { await stopHomeHub(); },
  };
}

export default startHub;
