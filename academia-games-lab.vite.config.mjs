// Standalone dev server for Plajah Academia & Elevate Handmade Games (no Express/Firebase boot):
//   npx vite --config academia-games-lab.vite.config.mjs  ->  http://127.0.0.1:3148/academia-games-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-academia-games-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['academia-games-lab.html'] },
  build: { copyPublicDir: false, rollupOptions: { input: 'academia-games-lab.html' } },
  server: {
    host: '127.0.0.1',
    port: 3148,
    strictPort: true,
    hmr: { overlay: false },
    watch: {
      ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'],
    },
  },
});
