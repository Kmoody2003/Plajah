// Standalone dev server for the Halloween fan room (no Express/Firebase boot):
//   npx vite --config fanroom-lab.vite.config.mjs  ->  http://127.0.0.1:3167/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// "/" would otherwise serve the repo's index.html, which boots the whole app and fails here
// (no PWA plugin) — and its error overlay then covers the fan room.
const serveLabAtRoot = {
  name: 'fanroom-lab-root',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url === '/index.html') req.url = '/fanroom-lab.html';
      next();
    });
  },
};

// Lab-only: the VTuber rig builder runs in the page; this saves its output (VRM + preview images)
// into public/games/ravencrest/assets/vtuber. Dev server only, fixed folder, plain file names.
const vtuberSink = {
  name: 'fanroom-lab-vtuber-sink',
  configureServer(server) {
    server.middlewares.use('/__vtuber', async (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
      if (req.method !== 'POST' || !/^[a-z_0-9]+\.(vrm|jpg|png|json)$/.test(name)) { res.statusCode = 400; res.end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const fs = await import('node:fs');
      fs.mkdirSync('public/games/ravencrest/assets/vtuber', { recursive: true });
      fs.writeFileSync(`public/games/ravencrest/assets/vtuber/${name}`, Buffer.concat(chunks));
      res.end('ok');
    });
  },
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-fanroom-lab',
  plugins: [serveLabAtRoot, vtuberSink, react(), tailwindcss()],
  optimizeDeps: { entries: ['fanroom-lab.html'] },
  // No watcher: parallel sessions edit files across the repo. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3167, strictPort: true, hmr: false, watch: null },
});
