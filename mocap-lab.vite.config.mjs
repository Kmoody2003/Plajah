// Motion Capture lab: the capture room with no app around it, the solver on window for scripted checks,
// and a dev-only hand-off into Era Clash 3D.
//   npx vite --config mocap-lab.vite.config.mjs  ->  http://127.0.0.1:3248/mocap-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CAPTURES = path.resolve(root, 'public/games/era-clash/3d/assets/mocap/captures');
const CMU = path.resolve('D:/Plajah Models/mocap/cmu-fbx');
const TRAIN = path.resolve('D:/Plajah Models/mocap/lifter-data');

export default defineConfig({
  cacheDir: 'node_modules/.vite-mocap-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      name: 'lab-at-root',
      configureServer: (server) => {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') req.url = '/mocap-lab.html';
          next();
        });
        // Dev-only: POST /__mocap?name=foo  {bvh, moves, fps}  →  …/mocap/captures/foo.bvh + foo.json, which the
        // Era Clash 3D dev server (it serves /public) loads with ?capture=foo.
        // Dev-only: CMU training clips live on D: (outside the repo and the website). GET /__cmu/<path>.
        server.middlewares.use('/__cmu', (req, res) => {
          const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
          const file = path.resolve(CMU, rel);
          if (!file.startsWith(CMU) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
          res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
        });
        // Dev-only: lifter training rows. POST /__train?set=v1&name=05_01 (body Float32 rows, x-meta header JSON);
        // GET /__train/done?set=v1 → names already written.
        server.middlewares.use('/__train', (req, res) => {
          const u = new URL(req.url, 'http://x');
          const set = u.searchParams.get('set')?.replace(/[^\w-]/g, '') || 'v1';
          const dir = path.join(TRAIN, set);
          if (req.method === 'GET' && u.pathname === '/done') {
            const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
            res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(names)); return;
          }
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const name = u.searchParams.get('name')?.replace(/[^\w-]/g, '');
          if (!name) { res.statusCode = 400; res.end('name'); return; }
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, `${name}.f32`), Buffer.concat(chunks));
              fs.writeFileSync(path.join(dir, `${name}.json`), decodeURIComponent(String(req.headers['x-meta'] ?? '{}')));
              res.end('{"ok":true}');
            } catch (e) { res.statusCode = 500; res.end(String(e)); }
          });
        });
        server.middlewares.use('/__mocap', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const name = new URL(req.url, 'http://x').searchParams.get('name')?.replace(/[^\w-]/g, '') || 'take';
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try {
              const { bvh, moves, fps } = JSON.parse(body);
              fs.mkdirSync(CAPTURES, { recursive: true });
              fs.writeFileSync(path.join(CAPTURES, `${name}.bvh`), bvh);
              fs.writeFileSync(path.join(CAPTURES, `${name}.json`), JSON.stringify({ name, fps, moves }, null, 1));
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: true, file: `captures/${name}.bvh` }));
            } catch (e) { res.statusCode = 400; res.end(String(e)); }
          });
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['mocap-lab.html'] },
  server: { host: '127.0.0.1', port: 3248, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
