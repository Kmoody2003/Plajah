// Standalone dev server for the living-books lab:
//   npx vite --config living-books-lab.vite.config.mjs  ->  http://127.0.0.1:3155/living-books-lab.html?book=<id>&page=<n>
//   ?reduced=1  ?sound=1  ?w=520      (same port as the runtime lab: run one at a time; never 3150)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: 'node_modules/.vite-living-books-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['living-books-lab.html'] },
  server: { host: '127.0.0.1', port: 3155, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
