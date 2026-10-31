// Attack tests for Tela's document scanner (tela-security-lab.ts):
//   npx vite --config tela-security-lab.vite.config.mjs  ->  http://127.0.0.1:3199/tela-security-lab.html
import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tela-security-lab',
  optimizeDeps: { entries: ['tela-security-lab.html'] },
  server: { host: '127.0.0.1', port: 3199, strictPort: true, hmr: false, watch: null },
});
