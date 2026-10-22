// Standalone dev server for the Conservatory music school (Ear Gym, Staff Sprint, Scope & Sequence)
// without booting the app:  npx vite --config music-school-lab.vite.config.mjs
//   -> http://127.0.0.1:3145/music-school-lab.html   (?tab=EAR_GYM | NOTATION | COMPASS | CURRICULUM)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-music-school-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['music-school-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3145, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/.lens-shots/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
