// Standalone dev server for an org page + its Reello player (no Express boot):
//   npx vite --config org-player-lab.vite.config.mjs  ->  http://127.0.0.1:3297/org-player-lab.html?org=<id>
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-org-player-lab',
  plugins: [stubPwa, react(), tailwindcss()],
  optimizeDeps: { entries: ['org-player-lab.html'] },
  server: { host: '127.0.0.1', port: 3297, strictPort: true, hmr: false, watch: null },
});
