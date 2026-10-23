// Standalone dev server for the Chora Mastering Desk (timeline, bays, deck, shared menu bar)
// without booting the app:  npx vite --config master-desk-lab.vite.config.mjs
//   -> http://127.0.0.1:3166/master-desk-lab.html   (?demo=1 drops three synthesized songs in)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-master-desk-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['master-desk-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3166, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
