// Sketch Rush lab: the REAL /api/live-game and /api/gamer routers on one in-memory store. Sign-in is stubbed by
// ?as=<name> (?as=guest-… acts as an anonymous guest), realtime is swapped for the polling transport.
//   npx vite --config live-game-lab.vite.config.mjs  ->  http://127.0.0.1:3247/?as=hana&view=studio
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import path from 'node:path';
import { watchIgnored } from './vite.watch-ignore.mjs';

const AUTH = "const q = new URLSearchParams(location.search); const uid = q.get('as'); "
  + "export const auth = { currentUser: uid ? { uid, isAnonymous: uid.startsWith('guest'), displayName: uid, photoURL: '', getIdToken: async () => 'tok-' + uid } : null };";

export default defineConfig({
  cacheDir: 'node_modules/.vite-live-game-lab',
  plugins: [
    {
      name: 'lab-stubs',
      enforce: 'pre',
      resolveId(id, importer) {
        if (!importer) return null;
        const inLive = /liveGames[\/]/.test(importer);
        if (id === '../firebase' && inLive) return '\0lab-auth';
        if (id === '../backendService' && inLive) return '\0lab-backend';
        if (id === '../../services/liveGames/realtime' && /liveGames[\/]/.test(importer)) return path.resolve('services/liveGames/realtimePoll.ts');
        return null;
      },
      load(id) {
        if (id === '\0lab-auth') return AUTH;
        if (id === '\0lab-backend') return "export const ensureGuestAuth = async () => null; export const createPost = async () => 'lab-post';";
        return null;
      },
    },
    {
      name: 'live-game-api',
      configureServer: async (server) => {
        server.middlewares.use((req, _res, next) => {
          const [p, q] = (req.url || '').split('?');
          if (p === '/' || p === '/index.html') req.url = '/live-game-lab.html' + (q ? `?${q}` : '');
          next();
        });
        const { createGamerRouter } = await server.ssrLoadModule('/routes/gamerNet.ts');
        const { createLiveGameRouter } = await server.ssrLoadModule('/routes/liveGames.ts');
        const { createLivePartyRouter } = await server.ssrLoadModule('/routes/liveParty.ts');
        const { memoryGamerStore } = await server.ssrLoadModule('/services/gamerNet/store.ts');
        const store = memoryGamerStore();
        const card = async (uid) => ({ name: uid.startsWith('guest') ? '' : uid[0].toUpperCase() + uid.slice(1) });
        const gamer = createGamerRouter({ store, verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null), userCard: card });
        const app = express();
        app.use('/api/gamer', express.json(), gamer);
        const liveDeps = {
          store, userCard: card, appendEvent: gamer.appendEvent,
          verify: async (t) => (t.startsWith('tok-') ? { uid: t.slice(4), guest: t.startsWith('tok-guest') } : null),
        };
        app.use('/api/live-game', express.json({ limit: '32kb' }), createLiveGameRouter(liveDeps));
        app.use('/api/live-party', express.json({ limit: '8kb' }), createLivePartyRouter(liveDeps));
        server.middlewares.use(app);
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['live-game-lab.html'] },
  server: { host: '127.0.0.1', port: 3247, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**'] } },
});
