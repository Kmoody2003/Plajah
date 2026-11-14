// Crossover lab: the real view on the on-device engine, with no sign-in.
//   npx vite --config crossover-lab.vite.config.mjs  ->  http://127.0.0.1:3212/crossover-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-crossover-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(),
  ],
  resolve: { alias: { jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') } },
  optimizeDeps: { entries: ['crossover-lab.html'], exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  server: { host: '127.0.0.1', port: 3212, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
