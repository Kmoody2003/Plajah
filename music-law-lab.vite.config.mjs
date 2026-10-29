// Standalone dev server for the Music Law Library (components/academia/MusicLawLibrary), with the real
// /api/music-law/* router mounted into Vite so the Latest tab hits CourtListener and the Federal Register:
//   npx vite --config music-law-lab.vite.config.mjs  ->  http://127.0.0.1:3191/music-law-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const musicLawApi = () => ({
  name: 'music-law-api',
  async configureServer(server) {
    const { createMusicLawRouter } = await server.ssrLoadModule('/routes/musicLaw.ts');
    // Vite's connect req/res lack express helpers (req.query, res.set); an express app supplies them.
    const api = express();
    api.use(createMusicLawRouter());
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-music-law-lab',
  plugins: [
    // ?chora=1 mounts MelosWorkspace, which reaches index.tsx's PWA import.
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), musicLawApi(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: {
    alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') },
    dedupe: ['firebase', '@firebase/app', '@firebase/app-check'],
  },
  optimizeDeps: { entries: ['music-law-lab.html'] },
  server: { host: '127.0.0.1', port: 3191, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
