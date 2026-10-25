// Standalone dev server for the Reello home top (no Express/Firebase boot):
//   npx vite --config reello-home-lab.vite.config.mjs  ->  http://127.0.0.1:3172/reello-home-lab.html
// ?live=0 nobody live · ?shorts=0 no vertical masters
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-reello-home-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['reello-home-lab.html'] },
  server: { host: '127.0.0.1', port: 3172, strictPort: true, hmr: false, watch: null },
});
