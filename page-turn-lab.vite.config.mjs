// Standalone dev server for the Lorea page-turn lab (no Express/Firebase boot):
//   npx vite --config page-turn-lab.vite.config.mjs  ->  http://127.0.0.1:3140/page-turn-lab.html
//   ?style=curl&dir=1&rtl=0&spread=0&scrub=0.4   freezes one frame (used for the frame captures)
//   ?perf=1                                       turns through a 240-page book and reports frame times
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: 'node_modules/.vite-page-turn-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['page-turn-lab.html'] },
  server: { host: '127.0.0.1', port: 3140, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
