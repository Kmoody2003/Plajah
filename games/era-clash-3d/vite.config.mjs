// Era Clash 3D campaign: standalone engine dev server (the Ravencrest pattern). Scoped root + explicit dep
// entries so Vite never crawls the whole Plajah repo.
//   dev:   node node_modules/vite/bin/vite.js --config games/era-clash-3d/vite.config.mjs  ->  http://127.0.0.1:4340
//   build: node node_modules/vite/bin/vite.js build --config games/era-clash-3d/vite.config.mjs
//          -> public/games/era-clash/3d/play (assets stay at /games/era-clash/3d/assets/…)
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// Dev-only: POST /__capture?name=foo.png (data-URL body) → games/era-clash-3d/review/foo.png (review evidence).
const capturePlugin = {
  name: 'eraclash3d-capture',
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
    // POST /__mapdoc?f=png|md → docs/era-clash-3d-map.{png,md} (eraclash3d.mapDoc(): the map written from the running game)
    server.middlewares.use('/__mapdoc', (req, res) => {
      const f = new URL(req.url, 'http://x').searchParams.get('f') === 'md' ? 'md' : 'png';
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const out = path.resolve(here, '../../docs', `era-clash-3d-map.${f}`);
        fs.writeFileSync(out, f === 'md' ? body : Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
        res.end('ok');
      });
    });
  },
};

export default defineConfig(({ command }) => ({
  plugins: [capturePlugin],
  root: here,
  base: command === 'build' ? '/games/era-clash/3d/play/' : '/',
  publicDir: command === 'build' ? false : path.resolve(here, '../../public'),
  cacheDir: path.resolve(here, '../../node_modules/.vite-eraclash-3d'),
  optimizeDeps: { entries: [path.resolve(here, 'index.html')], include: ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh'] },
  server: { host: '127.0.0.1', port: 4340, strictPort: true, fs: { allow: [path.resolve(here, '../..')] } },
  build: { outDir: path.resolve(here, '../../public/games/era-clash/3d/play'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
}));
