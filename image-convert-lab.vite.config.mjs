// Standalone dev server for the Image Converter (components/photo/ImageConverter.tsx).
//   npx vite --config image-convert-lab.vite.config.mjs  ->  http://127.0.0.1:3228/image-convert-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-image-convert-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      // The root index.html is the whole Plajah app, which this lab can't run. Send / to the lab page.
      name: 'lab-root-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '/';
          if (url === '/' || url === '/index.html' || url.startsWith('/?')) {
            res.statusCode = 302;
            res.setHeader('Location', `/image-convert-lab.html${url.includes('?') ? url.slice(url.indexOf('?')) : ''}`);
            res.end();
            return;
          }
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.') }, dedupe: ['react', 'react-dom'] },
  optimizeDeps: { entries: ['image-convert-lab.html'] },
  server: { host: '127.0.0.1', port: 3228, strictPort: true, hmr: false, fs: { strict: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
