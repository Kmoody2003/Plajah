// Standalone dev server for the video lens lab (no Express/Firebase boot):
//   npx vite --config lens-lab.vite.config.mjs  ->  http://127.0.0.1:3143/dev/lens-lab.html
// Every lens in services/lenses over a sample clip (?src=…) or your webcam (?cam=1); ms/frame in the status line.
// POST /__lens-shot?name=x (body = PNG/JPEG data URL) saves a frame to .lens-shots/ for offline review.
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const shots = () => ({
  name: 'lens-shots',
  configureServer(server) {
    server.middlewares.use('/__lens-shot', (req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
        const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(body);
        if (!m) { res.statusCode = 400; res.end('bad'); return; }
        const dir = path.resolve('.lens-shots'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}.${m[1] === 'png' ? 'png' : 'jpg'}`), Buffer.from(m[2], 'base64'));
        res.end('ok');
      });
    });
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-lens-lab',
  plugins: [shots()],
  // the lens chain's only bare import is transformers.js (depth / Segment Anything): pre-bundle it, discover nothing else
  optimizeDeps: { entries: ['dev/lens-lab.html'], noDiscovery: true, include: ['@huggingface/transformers'] },
  server: { host: '127.0.0.1', port: 3143, strictPort: true, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/.lens-shots/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
