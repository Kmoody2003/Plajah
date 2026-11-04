// Standalone dev server for the Terra map + search (real city layers, real Firestore reads):
// ?view=law opens the Law Library.
//   npx vite --config terra-lab.vite.config.mjs  ->  http://127.0.0.1:3224/terra-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { watchIgnored } from './vite.watch-ignore.mjs';

// The real /api/terra/law router (live legislature.mi.gov + ecfr.gov, same 1 req/s gate).
const lawApi = () => ({
  name: 'terra-law-api',
  async configureServer(server) {
    const { createTerraLawRouter } = await server.ssrLoadModule('/routes/terraLaw.ts');
    const app = express();
    app.use(createTerraLawRouter());
    server.middlewares.use(app);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-terra-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), lawApi(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['terra-lab.html'] },
  server: { host: '127.0.0.1', port: 3224, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
