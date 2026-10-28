// Standalone dev server for the co-editing lab (merge engine + collaboration dock):
//   npx vite --config coedit-lab.vite.config.mjs  ->  http://127.0.0.1:3182/coedit-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

// The chat stack reaches the app entry, which imports the PWA plugin's virtual module.
const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-coedit-lab',
  plugins: [react(), tailwindcss(), stubPwa],
  optimizeDeps: { entries: ['coedit-lab.html'] },
  server: { host: '127.0.0.1', port: 3182, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
