// Standalone dev server for the Reello Live shared-sound lab (no Express/Firebase boot):
//   npx vite --config live-sound.vite.config.mjs   →  http://127.0.0.1:3112/live-sound.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { watchIgnored } from './vite.watch-ignore.mjs';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite-live-sound',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['live-sound.html'] },
  server: { watch: { ignored: [watchIgnored] },  host: '127.0.0.1', port: 3112, strictPort: true },
});
