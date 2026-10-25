// Standalone dev server for the Data Commons UI (GrantMatcher + Terra FederalContext), with the real
// /api/data/* router mounted into Vite so the lab hits the live federal APIs:
//   npx vite --config data-commons-lab.vite.config.mjs  ->  http://127.0.0.1:3174/data-commons-lab.html
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const dataCommonsApi = () => ({
  name: 'data-commons-api',
  async configureServer(server) {
    const { createDataCommonsRouter } = await server.ssrLoadModule('/routes/dataCommons.ts');
    // Vite's connect req/res lack express helpers (req.query, res.set); an express app supplies them.
    const api = express();
    api.use(createDataCommonsRouter());
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-data-commons-lab',
  plugins: [react(), tailwindcss(), dataCommonsApi()],
  optimizeDeps: { entries: ['data-commons-lab.html'] },
  server: { host: '127.0.0.1', port: 3174, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
