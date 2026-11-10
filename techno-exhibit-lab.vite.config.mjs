// Machine Soul (Detroit techno exhibition) with no app around it:
//   npx vite --config techno-exhibit-lab.vite.config.mjs  ->  http://127.0.0.1:3237/?room=tx-atkins
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-techno-exhibit-lab',
  plugins: [
    { name: 'lab-index', configureServer: (server) => { server.middlewares.use((req, _res, next) => { const [p, q] = (req.url || '').split('?'); if (p === '/' || p === '/index.html') req.url = '/techno-exhibit-lab.html' + (q ? `?${q}` : ''); next(); }); } },
    react(),
  ],
  optimizeDeps: { entries: ['techno-exhibit-lab.html'] },
  build: { rollupOptions: { input: 'techno-exhibit-lab.html' } },
  server: { host: '127.0.0.1', port: 3237, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**', '**/tests/**'] } },
});
