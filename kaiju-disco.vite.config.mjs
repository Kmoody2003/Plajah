// Standalone dev server for the 3D Kaiju Disco preview (no Express/Firebase boot):
//   npx vite --config kaiju-disco.vite.config.mjs   →  http://127.0.0.1:3110/kaiju-disco.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  cacheDir: 'node_modules/.vite-kaiju-disco',
  plugins: [react()],
  optimizeDeps: { entries: ['kaiju-disco.html', 'kaiju-2d.html'] },
  server: { host: '127.0.0.1', port: 3110, strictPort: true },
});
