// Standalone dev server for Chora Music Intelligence (album hero share, On-air rail, Liner notes panel)
// without booting the app:  npx vite --config music-intel-lab.vite.config.mjs
//   -> http://127.0.0.1:3148/music-intel-lab.html   (?state=ready|running|none)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-music-intel-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['music-intel-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3148, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
