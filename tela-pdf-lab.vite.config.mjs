// Tela PDF reader lab: the reader with a sample form, no app around it.
//   npx vite --config tela-pdf-lab.vite.config.mjs  ->  http://127.0.0.1:3246/tela-pdf-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tela-pdf-lab',
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
          const [path, query] = (req.url || '').split('?');
          if (path === '/' || path === '/index.html') req.url = '/tela-pdf-lab.html' + (query ? `?${query}` : '');
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  // Same alias as the main app: jsmediatags' browser entry points at a file it doesn't ship.
  resolve: { alias: { jsmediatags: path.resolve(process.cwd(), 'node_modules/jsmediatags/dist/jsmediatags.min.js') } },
  worker: { format: 'es' },
  optimizeDeps: { entries: ['tela-pdf-lab.html'], include: ['pdfjs-dist', 'pdf-lib'] },
  server: { host: '127.0.0.1', port: 3246, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**'] } },
});
