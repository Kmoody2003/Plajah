// Standalone dev server for the 3D Kaiju Disco preview (no Express/Firebase boot):
//   npx vite --config kaiju-disco.vite.config.mjs   →  http://127.0.0.1:3110/kaiju-disco.html
//                                                       http://127.0.0.1:3110/face-lab.html?who=chora   (face-decal anchor lab)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only: the face lab POSTs tuned anchors here → public/models/mascots/v2/face/{who}_anchors.json
const saveAnchors = {
  name: 'kaiju-save-anchors',
  configureServer(server) {
    server.middlewares.use('/__save_anchors', (req, res) => {
      const who = new URL(req.url, 'http://x').searchParams.get('who');
      if (req.method !== 'POST' || !/^(chora|reello)$/.test(who || '')) { res.statusCode = 400; res.end('bad request'); return; }
      let body = ''; req.on('data', d => { body += d; });
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          fs.writeFileSync(path.resolve('public/models/mascots/v2/face', `${who}_anchors.json`), JSON.stringify(json, null, 1));
          res.end('ok');
        } catch (e) { res.statusCode = 500; res.end(String(e)); }
      });
    });
  },
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-kaiju-disco',
  plugins: [react(), saveAnchors],
  optimizeDeps: { entries: ['kaiju-disco.html', 'kaiju-2d.html', 'face-lab.html'] },
  server: { host: '127.0.0.1', port: 3110, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**'] } },
});
