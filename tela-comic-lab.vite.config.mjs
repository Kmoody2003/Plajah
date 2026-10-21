// Standalone dev server for Tela comic mode (the real components, without booting server.ts):
//   npx vite --config tela-comic-lab.vite.config.mjs  ->  http://127.0.0.1:3163/tela-comic-lab.html?open=<showcaseId>
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tela-comic-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['tela-comic-lab.html'] },
  // Only watch what the lab renders, so other sessions' edits elsewhere don't reload it.
  server: {
    host: '127.0.0.1',
    port: 3163,
    strictPort: true,
    watch: {
      ignored: (p) => {
        const f = p.replace(/\\/g, '/');
        if (/\/node_modules\//.test(f)) return true;
        if (!/\/plajah\/(components|services|data|src|styles)(\/|$)/.test(f) && !/\/plajah\/?$/.test(f)) return true;
        return /\/(melos|ambo|elevate|academia)\//.test(f);
      },
    },
  },
});
