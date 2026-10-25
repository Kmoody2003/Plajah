// Standalone lab for the listening-party room visuals (energy graph, polls, audience sentiment cards):
//   npx vite --config party-lab.vite.config.mjs  ->  http://127.0.0.1:3175/party-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-party-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['party-lab.html'] },
  server: { host: '127.0.0.1', port: 3175, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
