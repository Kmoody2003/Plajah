// Standalone dev server for the Art College
// without booting the app:  npx vite --config art-college-lab.vite.config.mjs
//   -> http://127.0.0.1:3173/art-college-lab.html   (?tab=PROGRAMS | CATALOG | LESSONS | STUDIO | CRITIQUE | PORTFOLIO | COLLECTIONS ; &adult=1)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-art-college-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['art-college-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3173, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
