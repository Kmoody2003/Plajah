// Stage bus lab: real master bus, real multiview, real Fit panel and real AmboOutputWindow pages in
// iframes sized like displays of different shapes (no window.opener, so the WebRTC tier runs too).
//   npx vite --config stage-bus-lab.vite.config.mjs  ->  http://127.0.0.1:3209/stage-bus-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-stage-bus-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(),
  ],
  resolve: { alias: { jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') } },
  optimizeDeps: { entries: ['stage-bus-lab.html'] },
  server: { host: '127.0.0.1', port: 3209, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
