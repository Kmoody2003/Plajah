// Standalone dev server for the Lectio reader (no Express/Firebase boot):
//   npx vite --config lectio-lab.vite.config.mjs  ->  http://127.0.0.1:3171/lectio-lab.html
// ?view=teacher | student | scan
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

import path from 'node:path';

// Only the reader gets the in-memory live service; every other importer keeps the real kairosService.
const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

const kairosMockForReader = {
  name: 'kairos-mock-for-reader',
  enforce: 'pre',
  resolveId(id, importer) {
    if (/services\/kairosService$/.test(id) && importer && /LectioReader\.tsx/.test(importer)) return path.resolve('lectio-lab-kairos.ts');
    if (/services\/backendService$/.test(id) && importer && /OrgThread\.tsx/.test(importer)) return path.resolve('orgfeed-lab-backend.ts');
    return null;
  },
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-lectio-lab',
  plugins: [kairosMockForReader, stubPwa, react(), tailwindcss()],
  optimizeDeps: { entries: ["lectio-lab.html", "sermonprep-lab.html", "elevate-audit-lab.html", "orgfeed-lab.html"] },
  // No watcher: parallel sessions edit files across the repo and every save reloaded the lab mid-run. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3171, strictPort: true, hmr: false, watch: null },
});
