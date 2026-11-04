// Lighting board lab: the real Simple and Pro boards and DMX engine.
//   npx vite --config lighting-lab.vite.config.mjs  ->  http://127.0.0.1:3213/lighting-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-lighting-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      // The preview opens at the origin, which would otherwise boot the whole app from index.html.
      name: 'lab-at-root',
      configureServer: (server) => {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') req.url = '/lighting-lab.html';
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['lighting-lab.html'] },
  server: { host: '127.0.0.1', port: 3213, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
