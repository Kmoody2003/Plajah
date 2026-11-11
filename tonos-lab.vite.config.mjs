// TONOS world strings lab:  npx vite --config tonos-lab.vite.config.mjs
//   -> http://127.0.0.1:3246/tonos-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tonos-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: {
    alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') },
    dedupe: ['firebase', '@firebase/app', '@firebase/app-check'],
  },
  optimizeDeps: { entries: ['tonos-lab.html'] },
  server: { host: '127.0.0.1', port: 3246, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
