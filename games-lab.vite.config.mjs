// Games lab: Plajah Originals + the gamer network with no app around it. The REAL /api/gamer router runs
// on an in-memory store; sign-in is stubbed by ?as=<name>, so two tabs (?as=alice, ?as=bob) can play online.
//   npx vite --config games-lab.vite.config.mjs  ->  http://127.0.0.1:3234/?as=alice
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-games-lab',
  plugins: [
    {
      name: 'stub-firebase-auth',
      enforce: 'pre',
      resolveId: (id, importer) => (id === '../firebase' && importer && /gamerNet[\/]client\.ts/.test(importer) ? '\0virtual-lab-auth' : null),
      load: (id) => (id === '\0virtual-lab-auth'
        ? "const uid = new URLSearchParams(location.search).get('as'); export const auth = { currentUser: uid ? { uid, getIdToken: async () => 'tok-' + uid } : null };"
        : null),
    },
    {
      name: 'gamer-api',
      configureServer: async (server) => {
        server.middlewares.use((req, _res, next) => {
          const [path, query] = (req.url || '').split('?');
          if (path === '/' || path === '/index.html') req.url = '/games-lab.html' + (query ? `?${query}` : '');
          next();
        });
        const { createGamerRouter } = await server.ssrLoadModule('/routes/gamerNet.ts');
        const { memoryGamerStore } = await server.ssrLoadModule('/services/gamerNet/store.ts');
        const app = express();
        app.use('/api/gamer', express.json(), createGamerRouter({
          store: memoryGamerStore(),
          verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
          userCard: async (uid) => ({ name: uid[0].toUpperCase() + uid.slice(1) }),
        }));
        server.middlewares.use(app);
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['games-lab.html'] },
  server: { host: '127.0.0.1', port: 3234, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**'] } },
});
