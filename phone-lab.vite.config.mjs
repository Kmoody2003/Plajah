// Phone lab: the real PhoneHub (components/phone) with the Android bridge, backend and call context
// swapped for in-memory mocks (labs/phone/*). No device, no sign-in.
//   node node_modules/vite/bin/vite.js --config phone-lab.vite.config.mjs  ->  http://127.0.0.1:3331/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const root = process.cwd();
const mock = (f) => path.resolve(root, 'labs/phone', f);

const phoneMocks = {
  name: 'phone-lab-mocks',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!importer || /[\\/]labs[\\/]phone[\\/]mock/.test(importer)) return null;
    if (/(^|\/)services\/phone\/telecom(\.ts)?$/.test(id)) return mock('mockTelecom.ts');
    if (/(^|\/)services\/backendService(\.ts)?$/.test(id)) return mock('mockBackend.ts');
    if (/(^|\/)contexts\/CallContext(\.tsx)?$/.test(id)) return mock('mockCallContext.tsx');
    return null;
  },
};

const serveLab = {
  name: 'phone-lab-index',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [p, q] = (req.url || '').split('?');
      if (p === '/' || p === '/index.html') req.url = '/phone-lab.html' + (q ? `?${q}` : '');
      next();
    });
  },
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-phone-lab',
  plugins: [phoneMocks, serveLab, react(), tailwindcss()],
  optimizeDeps: { entries: ['phone-lab.html'] },
  // No watcher: parallel sessions edit files across the repo. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3331, strictPort: true, hmr: false, watch: null },
});
