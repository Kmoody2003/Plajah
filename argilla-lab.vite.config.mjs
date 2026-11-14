// Argilla lab: the real sculpting room and GPU clay engine.
//   npx vite --config argilla-lab.vite.config.mjs  ->  http://127.0.0.1:3214/argilla-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-argilla-lab',
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
          if (req.url === '/' || req.url === '/index.html') req.url = '/argilla-lab.html';
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['argilla-lab.html'] },
  server: { host: '127.0.0.1', port: 3214, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
