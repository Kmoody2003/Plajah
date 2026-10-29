// Standalone dev server for the Christian Ed hub, class clubs, review queue and Tela Classwork:
//   npx vite --config christian-ed-lab.vite.config.mjs  ->  http://127.0.0.1:3181/christian-ed-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';
import express from 'express';
import { createCurriculumFetchRouter } from './routes/curriculumFetch';

// The real Lesson Library link reader (routes/curriculumFetch.ts) with a stand-in sign-in, so the lab can
// import a course from its actual Google links without the API server.
const labCurriculumFetch = {
  name: 'lab-curriculum-fetch',
  configureServer(server) {
    const app = express();
    app.use('/api/curriculum/fetch', express.json({ limit: '8kb' }), createCurriculumFetchRouter({ verify: async () => ({ uid: 'lab-teacher', isAnonymous: false }), fetchImpl: fetch }));
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/curriculum/fetch')) return next();
      req.headers.authorization = 'Bearer lab';
      app(req, res, next);
    });
  },
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-christian-ed-lab',
  plugins: [react(), tailwindcss(), labCurriculumFetch],
  optimizeDeps: { entries: ['christian-ed-lab.html'] },
  server: { host: '127.0.0.1', port: 3181, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
