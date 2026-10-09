// Standalone dev server for the Router & Switcher console (no Express/Firebase/auth boot):
//   npx vite --config cr-preview.vite.config.mjs   →  http://127.0.0.1:3128/cr-preview.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite-cr-preview',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['cr-preview.html'] },
  // Watch only what the console imports — watching the whole repo (thousands of files other
  // sessions are editing) pegs a core on Windows.
  server: {
    host: '127.0.0.1', port: 3128, strictPort: true,
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/android/**', '**/ios/**', '**/windows-native/**',
        '**/tizen/**', '**/rust/**', '**/cap-shell/**', '**/public/**', '**/docs/**', '**/data/**', '**/.tela-proofs/**'],
    },
  },
});
