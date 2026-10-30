// Airwindows lab — the real AirwindowsNode / FxChainHost / FxRack, offline-checked against the
// bare wasm and playable live:
//   npx vite --config airwindows-lab.vite.config.mjs  ->  http://127.0.0.1:3195/airwindows-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-airwindows-lab',
  plugins: [react(), tailwindcss()],
  build: { assetsInlineLimit: (filePath) => (filePath.endsWith('.worklet.js') ? false : undefined) },
  optimizeDeps: { entries: ['airwindows-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3195, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
