// Standalone dev server for the Christian Ed hub, class clubs, review queue and Tela Classwork:
//   npx vite --config christian-ed-lab.vite.config.mjs  ->  http://127.0.0.1:3181/christian-ed-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-christian-ed-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['christian-ed-lab.html'] },
  server: { host: '127.0.0.1', port: 3181, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
