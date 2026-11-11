// Standalone dev server for the Plajah FM on-air staff: the real /api/onair router (templates only, no
// model) plus the radio card, the side-pillar billboards and the break caption.
//   npx vite --config onair-lab.vite.config.mjs  ->  http://127.0.0.1:3238/onair-lab.html
// ?t=<ISO time> sets the station clock (e.g. ?t=2026-11-09T16:00:00Z is Monday 11am ET, Kit's show).
import path from 'node:path';
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

let labNow = null;
const api = () => ({
  name: 'onair-api',
  async configureServer(server) {
    const { createOnAirRouter } = await server.ssrLoadModule('/routes/onair.ts');
    const app = express();
    app.get('/lab/time', (req, res) => { const t = Date.parse(String(req.query.t || '')); labNow = Number.isFinite(t) ? t : null; res.json({ at: labNow }); });
    app.use('/api/onair', express.json(), createOnAirRouter({ now: () => labNow ?? Date.now(), mind: null }));
    server.middlewares.use(app);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-onair-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), api(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.') } },
  optimizeDeps: { entries: ['onair-lab.html'] },
  server: { host: '127.0.0.1', port: 3238, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
