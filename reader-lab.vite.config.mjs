// Standalone dev server for the reader lab (real BookReader + a real published album, no Express boot).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  cacheDir: 'node_modules/.vite-reader-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['reader-lab.html'] },
  server: { host: '127.0.0.1', port: 3150, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
