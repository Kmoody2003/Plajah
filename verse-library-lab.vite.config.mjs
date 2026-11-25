// Verse Bible library lab: the real reader (lectio-lab.html) reading the hosted library from a local build.
//   python -I scripts/bibleLibrary/build_library.py --work D:/plajah-tmp/bible-library
//   npx vite --config verse-library-lab.vite.config.mjs  ->  http://127.0.0.1:3172/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.BIBLE_LIBRARY_OUT || 'D:/plajah-tmp/bible-library/out';

export default defineConfig({
  cacheDir: 'node_modules/.vite-verse-library-lab',
  define: { 'import.meta.env.VITE_BIBLE_LIBRARY_BASE': JSON.stringify('/bible-library') },
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      name: 'bible-library-files',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          const [p, query] = (req.url || '').split('?');
          if (p === '/' || p === '/index.html') { req.url = '/lectio-lab.html' + (query ? `?${query}` : ''); return next(); }
          if (!p.startsWith('/bible-library/')) return next();
          const file = path.join(OUT, decodeURIComponent(p.slice('/bible-library/'.length)));
          if (!file.startsWith(path.resolve(OUT)) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          fs.createReadStream(file).pipe(res);
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['lectio-lab.html'] },
  server: { host: '127.0.0.1', port: 3172, strictPort: true, hmr: false, watch: null },
});
