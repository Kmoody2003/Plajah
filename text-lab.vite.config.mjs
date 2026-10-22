// Standalone dev server for the text engine lab (no Express/Firebase boot):
//   npx vite --config text-lab.vite.config.mjs  ->  http://127.0.0.1:3150/text-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-text-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['text-lab.html'] },
  server: { host: '127.0.0.1', port: 3150, strictPort: true, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/rust/**', '**/.cache/**'] } },
});
