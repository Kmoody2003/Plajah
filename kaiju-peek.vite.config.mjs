// Standalone dev server for the Kaiju letter-peek preview (no Express/Firebase boot):
//   node node_modules/vite/bin/vite.js --config kaiju-peek.vite.config.mjs   →  http://127.0.0.1:3112/kaiju-peek.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite-kaiju-peek',
  plugins: [react(), tailwindcss(), {
    // the preview pane opens "/" first: send it to the peek page instead of booting (and crawling) the whole app
    name: 'kaiju-peek-root', configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html' || req.url?.startsWith('/?')) { res.statusCode = 302; res.setHeader('Location', '/kaiju-peek.html'); res.end(); return; }
        next();
      });
    },
  }],
  // explicit deps, no crawl: a stray request for / would otherwise make the scanner walk the whole app
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'three', '@react-three/fiber', '@react-three/drei', 'three/examples/jsm/utils/SkeletonUtils.js'],
  },
  server: { host: '127.0.0.1', port: 3112, strictPort: true, watch: { ignored: ['**/scripts/**', '**/docs/**', '**/.claude/**', '**/data/**'] } },
});
