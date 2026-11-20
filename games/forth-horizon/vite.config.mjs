// Standalone Apex Elohim engine dev server. Scoped root + explicit dep entries
// so Vite never crawls the whole Plajah repo.
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const IRONPORT_DIR = 'D:\\plajah game assets deign from promtps\\racer\\ironport-complete';
const RACER_REFS_DIR = 'D:\\plajah game assets deign from promtps\\racer\\Nov 15 - 14_22';
const VEHICLE_LIB_DIR = 'D:\\plajah game assets deign from promtps\\racer\\3D Vehicle Asset Library';
const CARS_DIR = path.resolve(here, 'assets-src/cars');
const PROPS_DIR = path.resolve(here, 'assets-src/props');

const MIME = {
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
};

function mountStaticDir(prefix, rootDir) {
  return {
    name: `mount-${prefix}`,
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
        const full = path.resolve(rootDir, rel);
        if (!full.startsWith(path.resolve(rootDir)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
          next();
          return;
        }
        const ext = path.extname(full).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', prefix === '/cars' || prefix === '/props' ? 'no-store' : 'public, max-age=3600');
        fs.createReadStream(full).pipe(res);
      });
    },
  };
}

// dev only: the map editor (src/mapEditor.ts) saves the roads and zones the developer draws to region/user_map.json
function userMapSave() {
  return {
    name: 'user-map-save',
    configureServer(server) {
      server.middlewares.use('/__dev/user-map', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
        req.on('end', () => {
          try {
            const j = JSON.parse(body);
            if (!j || !Array.isArray(j.features)) throw new Error('features missing');
            fs.writeFileSync(path.resolve(here, '../../public/games/forth-horizon/region/user_map.json'), JSON.stringify(j));
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, features: j.features.length }));
          } catch (e) { res.statusCode = 400; res.end(String(e)); }
        });
      });
    },
  };
}

// dev only: the page at the server's root used to be the old engine test scene (index.html). Opening the server now always opens the current game, and the old scene cannot be reached.
function currentVersionOnly() {
  return {
    name: 'current-version-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '/').split('?')[0];
        if (path === '/' || path === '/index.html') { res.statusCode = 302; res.setHeader('Location', '/region.html'); res.end(); return; }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    currentVersionOnly(),
    userMapSave(),
    mountStaticDir('/ironport-assets', IRONPORT_DIR),
    mountStaticDir('/racer-refs', RACER_REFS_DIR),
    mountStaticDir('/vehicle-lib', VEHICLE_LIB_DIR),
    mountStaticDir('/cars', CARS_DIR),
    mountStaticDir('/props', PROPS_DIR),
  ],
  root: here,
  base: command === 'build' ? '/games/forth-horizon/play/' : '/',
  publicDir: command === 'build' ? false : path.resolve(here, '../../public'),
  cacheDir: path.resolve(here, '../../node_modules/.vite-forth-horizon'),
  optimizeDeps: {
    entries: [path.resolve(here, 'index.html')],
    include: ['three', 'three/webgpu', 'three/tsl'],
  },
  server: {
    host: '127.0.0.1',
    port: 4332,
    fs: { allow: [path.resolve(here, '../..'), IRONPORT_DIR, RACER_REFS_DIR, VEHICLE_LIB_DIR] },
  },
  build: {
    outDir: path.resolve(here, '../../public/games/forth-horizon/play'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // the racing game page (region.html) is what the Plajah Games catalog launches. The engine test scene (index.html, main.ts) is left out of the build:
    // it imports ./replay, which does not exist yet.
    rollupOptions: { input: { region: path.resolve(here, 'region.html'), garage: path.resolve(here, 'showroom.html') } },
  },
}));
