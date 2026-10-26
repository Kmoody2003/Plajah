// Standalone dev server for the settings navigation
// without booting the app:  npx vite --config settings-lab.vite.config.mjs
//   ->  http://127.0.0.1:3180/settings-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

// The lab never registers a service worker; stub the PWA virtual module so index.tsx can be scanned without the PWA plugin.
const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-settings-lab',
  plugins: [react(), tailwindcss(), stubPwa],
  optimizeDeps: { entries: ['settings-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3180, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
