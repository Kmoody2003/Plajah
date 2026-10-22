// Standalone dev server for Learning Support (no Express/Firebase boot):
//   npx vite --config learning-support-lab.vite.config.mjs  ->  http://127.0.0.1:3146/learning-support-lab.html
// ?view=editors (default) the plan editors on a local plan · ?view=lesson a lesson page under supports · ?view=resources
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-learning-support-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['learning-support-lab.html'] },
  server: { host: '127.0.0.1', port: 3146, strictPort: true, hmr: { overlay: false }, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
