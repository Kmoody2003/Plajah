// Standalone dev server for the Elevate landing (no Express/Firebase boot):
//   npx vite --config elevate-landing-lab.vite.config.mjs  ->  http://127.0.0.1:3168/elevate-landing-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Something in the org-service graph pulls in index.tsx, which imports the PWA plugin's virtual module.
const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-elevate-landing-lab',
  plugins: [stubPwa, react(), tailwindcss()],
  optimizeDeps: { entries: ['elevate-landing-lab.html'] },
  // No watcher: parallel sessions edit files across the repo. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3168, strictPort: true, hmr: false, watch: null },
});
