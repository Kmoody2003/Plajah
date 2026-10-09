// Standalone dev server for the Reello Live emote lab (no Express/Firebase boot):
//   npx vite --config emotes.vite.config.mjs   →  http://127.0.0.1:3111/emotes.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite-emotes',
  plugins: [react()],
  optimizeDeps: { entries: ['emotes.html'] },
  server: { host: '127.0.0.1', port: 3111, strictPort: true },
});
