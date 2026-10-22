// Standalone Ravencrest engine dev server. Scoped root + explicit dep entries so
// Vite never crawls the whole Plajah repo (the old preview hung doing that).
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// Dev-only: POST /__capture?name=foo.png (data-URL body) → games/ravencrest/review/foo.png.
// Review captures (runtime vs. concept art) are the evidence for each art gate.
const capturePlugin = {
  name: 'ravencrest-capture',
  configureServer(server) {
    server.middlewares.use('/__capture', (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name')?.replace(/[^\w.-]/g, '') || 'capture.png';
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const dir = path.resolve(here, 'review');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
        res.end('ok');
      });
    });
  },
};

export default defineConfig(({ command }) => ({
  plugins: [capturePlugin],
  root: here,
  // Production: served by the main Plajah host at /games/ravencrest/play/ (assets stay at
  // their absolute /games/ravencrest/assets/... and /models/... paths), so don't copy public/.
  base: command === 'build' ? '/games/ravencrest/play/' : '/',
  publicDir: command === 'build' ? false : path.resolve(here, '../../public'),
  cacheDir: path.resolve(here, '../../node_modules/.vite-ravencrest-engine'),
  optimizeDeps: { entries: [path.resolve(here, 'index.html')], include: ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh'] },
  server: { host: '127.0.0.1', port: 4330, fs: { allow: [path.resolve(here, '../..')] } },
  build: { outDir: path.resolve(here, '../../public/games/ravencrest/play'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
}));
