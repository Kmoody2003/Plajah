// Standalone dev server for Tela's Merch Designer (the real studio, without booting server.ts):
//   npx vite --config merch-studio-lab.vite.config.mjs  ->  http://127.0.0.1:3164/merch-studio-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-merch-studio-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['merch-studio-lab.html'] },
  // Only watch what the lab renders, so other sessions' edits elsewhere don't reload it.
  server: {
    host: '127.0.0.1',
    port: 3164,
    strictPort: true,
    hmr: { overlay: false },
    watch: {
      ignored: (p) => {
        const f = p.replace(/\\/g, '/');
        if (/\/node_modules\//.test(f)) return true;
        if (!/\/plajah\/(components\/tela|services\/merchStudio|services\/tela|src)(\/|$)/.test(f) && !/\/plajah\/?$/.test(f)) return true;
        return false;
      },
    },
  },
});
