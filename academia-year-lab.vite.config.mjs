// Standalone dev server for the Year Curriculum + Education Council (no Express/Firebase boot):
//   npx vite --config academia-year-lab.vite.config.mjs  ->  http://127.0.0.1:3147/academia-year-lab.html
// ?view=year (default) the planner · ?view=council the Education Council
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-academia-year-lab',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['academia-year-lab.html'] },
  server: { host: '127.0.0.1', port: 3147, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
