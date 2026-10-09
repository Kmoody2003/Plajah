// Standalone dev server for the two living editions (Below the Blue, The Golden Thread) on the real built Tela docs:
//   npx vite --config living-lab-bluethread.vite.config.mjs  ->  http://127.0.0.1:3155/living-lab-bluethread.html?book=below-the-blue&page=4
//   ?reduced=1  ?sound=1  ?w=520      (same port as the runtime lab: run one at a time; never 3150)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: 'node_modules/.vite-living-lab-bluethread',
  plugins: [react()],
  optimizeDeps: { entries: ['living-lab-bluethread.html'] },
  server: { host: '127.0.0.1', port: 3155, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
