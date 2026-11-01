// Standalone dev server for the Elevate phone player:
//   npx vite --config leaf-lab.vite.config.mjs  ->  http://127.0.0.1:3211/leaf-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-leaf-lab',
  plugins: [stubPwa, react(), tailwindcss()],
  optimizeDeps: { entries: ['leaf-lab.html'] },
  server: { host: '127.0.0.1', port: 3211, strictPort: true, hmr: false, watch: null },
});
