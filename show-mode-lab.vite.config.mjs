// Standalone dev server for the Share-in-Show-Mode preview (no Express boot):
//   node node_modules/vite/bin/vite.js --config show-mode-lab.vite.config.mjs  →  http://127.0.0.1:3114/show-mode-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  cacheDir: 'node_modules/.vite-show-mode-lab',
  plugins: [react(), tailwindcss()],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: {
    alias: { '@': root, jsmediatags: path.resolve(root, 'node_modules/jsmediatags/dist/jsmediatags.min.js') },
    dedupe: ['firebase', '@firebase/app', '@firebase/app-check'],
  },
  optimizeDeps: { entries: ['show-mode-lab.html'] },
  // `vite build --config show-mode-lab.vite.config.mjs --outDir <dir>` builds ONLY the lab page
  // (the dev server's dep pre-scan of this graph can wedge on Windows; a static build is reliable).
  build: { rollupOptions: { input: path.resolve(root, 'show-mode-lab.html') }, sourcemap: false, reportCompressedSize: false },
  server: { host: '127.0.0.1', port: 3114, strictPort: true },
});
