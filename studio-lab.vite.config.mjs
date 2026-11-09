// Studio lab: Build Studio with no app around it.
//   npx vite --config studio-lab.vite.config.mjs  ->  http://127.0.0.1:3234/studio-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-studio-lab',
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
          if (path === '/' || path === '/index.html') req.url = '/studio-lab.html' + (query ? `?${query}` : '');
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['studio-lab.html'] },
  server: { host: '127.0.0.1', port: 3234, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**'] } },
});
