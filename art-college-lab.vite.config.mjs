// Standalone dev server for the Art College
// without booting the app:  npx vite --config art-college-lab.vite.config.mjs
//   -> http://127.0.0.1:3173/art-college-lab.html   (?tab=PROGRAMS | CATALOG | LESSONS | STUDIO | CRITIQUE | PORTFOLIO | COLLECTIONS ; &adult=1)
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
  cacheDir: 'node_modules/.vite-art-college-lab',
  plugins: [react(), tailwindcss(), stubPwa],
  optimizeDeps: { entries: ['art-college-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  // /api/museum goes to `npx tsx museum-dev-server.mts` when it is running; otherwise the museum services fall back to direct calls.
  server: { host: '127.0.0.1', port: 3173, strictPort: true, hmr: false, proxy: { '/api/museum': 'http://127.0.0.1:3199' }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
