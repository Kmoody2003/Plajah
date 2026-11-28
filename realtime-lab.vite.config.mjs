// Realtime lab: Plajah Motorsport Apex (its own dev config) + the REAL /api/gamer router on an in-memory store with
// realtime switched on + the realtime WebSocket server, all in one process. Sign-in is stubbed by ?as=<name>.
//   npm run realtime:lab   (or: npx vite --config realtime-lab.vite.config.mjs)
//   tab 1: http://127.0.0.1:4341/region.html?as=alice   tab 2: http://127.0.0.1:4341/region.html?as=bob
//   Menu → Online Circuit Race → Create room in one tab, Join with the code in the other, Ready in both.
// RT_LAB_FAST=1 makes the server race 1 lap with a loose progress cap (for scripted checks).
import { defineConfig } from 'vite';
import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import apexConfig from './games/apex/vite.config.mjs';

const repo = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const API_PORT = 4341, RT_PORT = 4342;

function realtimeLab() {
  return {
    name: 'realtime-lab',
    configureServer: async (server) => {
      const load = (rel) => server.ssrLoadModule(path.resolve(repo, rel));
      const { createGamerRouter } = await load('routes/gamerNet.ts');
      const { memoryGamerStore } = await load('services/gamerNet/store.ts');
      const { startRealtimeServer } = await load('services/realtime/server.ts');
      const { resultPoster } = await load('services/realtime/resultPoster.ts');
      const { REALTIME_GAMES, APEX_RACE, realtimeGame } = await load('services/realtime/games.ts');
      const { RaceReferee } = await load('services/realtime/referee.ts');
      const ticketSecret = randomBytes(24).toString('hex'), resultSecret = randomBytes(24).toString('hex');
      const fast = process.env.RT_LAB_FAST === '1';
      const fastRace = { ...REALTIME_GAMES[APEX_RACE], referee: () => new RaceReferee({ laps: 1, maxProgressPerSec: 2, maxSpeedMps: 140, finishGraceMs: 20_000, maxRaceMs: 10 * 60_000 }) };
      const store = memoryGamerStore();
      const rt = await startRealtimeServer({
        port: RT_PORT, host: '127.0.0.1', ticketSecret,
        games: (id) => (id === APEX_RACE && fast ? fastRace : realtimeGame(id)),
        postResult: resultPoster({ apiUrl: `http://127.0.0.1:${API_PORT}`, secret: resultSecret, log: (m) => console.log('[realtime]', m) }),
        log: (m) => console.log('[realtime]', m),
      });
      server.httpServer?.once('close', () => { void rt.close(); });
      const app = express();
      // Race chat + proximity voice (routes/gamerTogether.ts) on the same store, so rt_<matchId> sees the rooms.
      // Voice needs LiveKit: set MEETINGS_SFU=1 + LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET to try it here; without them it reports "off".
      const { createGamerTogether } = await load('routes/gamerTogether.ts');
      const { livekitConfigFromEnv } = await load('services/meetings/livekitServer.ts');
      const together = createGamerTogether({
        store, verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
        userCard: async (uid) => ({ name: uid[0].toUpperCase() + uid.slice(1) }),
        livekit: () => livekitConfigFromEnv(),
        rtUrls: () => [`ws://127.0.0.1:${RT_PORT}`],
      });
      app.use('/api/gamer/party', express.json({ limit: '8kb' }), together.party);
      app.use('/api/gamer/chat', express.json({ limit: '8kb' }), together.chat);
      app.use('/api/gamer', express.json({ limit: '8kb' }), createGamerRouter({
        store,
        verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
        userCard: async (uid) => ({ name: uid[0].toUpperCase() + uid.slice(1) }),
        realtime: { ticketSecret, resultSecret, urls: [`ws://127.0.0.1:${RT_PORT}`] },
      }));
      server.middlewares.use(app);
      console.log(`[realtime-lab] API on :${API_PORT}/api/gamer, realtime on ws://127.0.0.1:${RT_PORT}${fast ? ' (fast 1-lap races)' : ''}`);
    },
  };
}

export default defineConfig((env) => {
  const base = apexConfig(env);
  return {
    ...base,
    plugins: [...base.plugins, realtimeLab()],
    cacheDir: path.resolve(repo, 'node_modules/.vite-realtime-lab'),
    server: { ...base.server, port: API_PORT, strictPort: true, hmr: false },
  };
});
