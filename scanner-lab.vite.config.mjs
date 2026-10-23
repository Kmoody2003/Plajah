// Standalone dev server for the worksheet scanner (no Express/Firebase boot):
//   npx vite --config scanner-lab.vite.config.mjs  ->  http://127.0.0.1:3148/scanner-lab.html
// ?view=teacher | student | scan
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-scanner-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['scanner-lab.html'] },
  // No watcher: parallel sessions edit files across the repo and every save reloaded the lab mid-run. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3148, strictPort: true, hmr: false, watch: null },
});
