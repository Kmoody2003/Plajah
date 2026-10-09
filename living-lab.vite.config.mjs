// Standalone dev server for the Living Runtime lab (no Express/Firebase boot):
//   npx vite --config living-lab.vite.config.mjs  ->  http://127.0.0.1:3155/living-lab.html
//   ?page=triggers (default) | presets | tela       ?reduced=1  ?sound=1  ?inactive=1
//   scripts/living/driveLab.mjs drives it with real pointer / touch / keyboard events and captures frames.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-living-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['living-lab.html'] },
  server: { host: '127.0.0.1', port: 3155, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
