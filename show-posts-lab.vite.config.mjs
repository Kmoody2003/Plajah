// Show Posts lab: a Themed Show posted to Plajah social with no render.
// The real studio (Share → Post to Plajah), the real UniversalPostComposer prefilled with the show,
// a timeline of real PostCards (the show plays in the card), and the ?show=<owner>/<id> viewer.
// Publishing goes to this server's memory (labs/show-posts/cloudShowsStub.ts) instead of Storage.
//   node node_modules/vite/bin/vite.js --config show-posts-lab.vite.config.mjs  ->  http://127.0.0.1:3302/
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { watchIgnored } from './vite.watch-ignore.mjs';

const STUB = path.resolve('labs/show-posts/cloudShowsStub.ts');

export default defineConfig({
  cacheDir: 'node_modules/.vite-show-posts-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      name: 'stub-cloud-shows',
      enforce: 'pre',
      resolveId: (id) => (/(^|[\\/])cloudShows(\.ts)?$/.test(id) && /slideshow|^\.\/cloudShows/.test(id) ? STUB : null),
    },
    {
      name: 'lab-server',
      configureServer: (server) => {
        server.middlewares.use((req, _res, next) => {
          const [p, query] = (req.url || '').split('?');
          if (p === '/' || p === '/index.html') req.url = '/show-posts-lab.html' + (query ? `?${query}` : '');
          next();
        });
        const shows = new Map();
        const app = express();
        app.use('/lab', express.json({ limit: '200mb' }));
        app.put('/lab/shows/:owner/:id', (req, res) => { shows.set(`${req.params.owner}/${req.params.id}`, req.body); res.json({ ok: true }); });
        app.get('/lab/shows/:owner/:id', (req, res) => { const s = shows.get(`${req.params.owner}/${req.params.id}`); if (!s) return res.status(404).json({}); res.json(s); });
        server.middlewares.use(app);
      },
    },
    react(), tailwindcss(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['show-posts-lab.html'] },
  server: { host: '127.0.0.1', port: 3302, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**', '**/tests/**'] } },
});
