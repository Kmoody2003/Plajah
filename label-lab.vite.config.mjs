// Standalone dev server for the Label Desk (components/chora/LabelDesk), with the real /api/labels router
// mounted over an in-memory store and "lab:<uid>" bearer tokens. Nothing touches Firestore:
//   npx vite --config label-lab.vite.config.mjs  ->  http://127.0.0.1:3221/label-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const labelApi = () => ({
  name: 'label-api',
  async configureServer(server) {
    const { createLabelRouter } = await server.ssrLoadModule('/routes/labels.ts');
    const { makeMemoryLabelBackend } = await server.ssrLoadModule('/labs/label/memoryBackend.ts');
    const backend = makeMemoryLabelBackend();
    const track = (id, title, isrc) => ({ id, title, ...(isrc ? { trackMeta: { isrc } } : {}) });
    backend.docs.set('users/boss', { displayName: 'Dana Reyes' });
    backend.docs.set('users/artist', { displayName: 'Sam Okafor' });
    backend.docs.set('users/kim', { displayName: 'Kim Tran' });
    backend.docs.set('albums/lab-moon', { ownerId: 'artist', title: 'Moon Water', artist: 'Sam Okafor', coverUrl: '', releaseDate: 1, tracks: [track('m1', 'Low Tide', 'USRC17607839'), track('m2', 'Salt')] });
    backend.docs.set('albums/lab-field', { ownerId: 'artist', title: 'Field Notes', artist: 'Sam Okafor', coverUrl: '/favicon.ico', releaseDate: 1, releaseMeta: { upc: '036000291452' }, tracks: [track('f1', 'Morning', 'GBAYE0601498')] });
    backend.docs.set('albums/lab-house', { ownerId: 'boss', title: 'Label Sampler', artist: 'Various', coverUrl: '/favicon.ico', tracks: [track('h1', 'Intro')] });
    backend.docs.set('creatorEarnings/lab_sale', { creatorUid: 'artist', workKind: 'album', workId: 'lab-field', creatorNetCents: 1800, timestamp: Date.UTC(2026, 8, 12), status: 'transferred' });
    const api = express();
    api.use('/api/labels', express.json({ limit: '10mb' }), createLabelRouter({
      cas: backend.cas, store: backend.store,
      verify: async t => (t.startsWith('lab:') ? { uid: t.slice(4) } : null),
    }));
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-label-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), labelApi(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['label-lab.html'] },
  server: { host: '127.0.0.1', port: 3221, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
