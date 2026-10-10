// Standalone dev server for the Shuffle UI lab (mocked /api/shuffle, no Express boot):
//   npx vite --config shuffle-lab.vite.config.mjs   →  http://127.0.0.1:3113/shuffle-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite-shuffle-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['shuffle-lab.html'] },
  server: { host: '127.0.0.1', port: 3113, strictPort: true },
});
