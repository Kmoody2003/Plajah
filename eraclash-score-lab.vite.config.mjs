// Era Clash score lab: bounces the Era Clash Chora projects with Chora's renderGroove.
//   npx vite --config eraclash-score-lab.vite.config.mjs  ->  http://127.0.0.1:3243/eraclash-score-lab.html?auto=1
// POST /__eraclash/save?name=<cue>-<stem>&sr=48000 (raw float32 interleaved stereo) writes
// <os tmp>/era-clash-audio/bounce/<name>.f32 + .json, read by scripts/games/buildEraClashAudio.ts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const BOUNCE = path.join(os.tmpdir(), 'era-clash-audio', 'bounce');

const saver = () => ({
  name: 'eraclash-save',
  configureServer(server) {
    server.middlewares.use('/__eraclash/save', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      const u = new URL(req.url || '', 'http://x');
      const name = String(u.searchParams.get('name') || '').replace(/[^a-z0-9-]/gi, '');
      const sr = Number(u.searchParams.get('sr')) || 48000;
      if (!name) { res.statusCode = 400; res.end('name'); return; }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(BOUNCE, { recursive: true });
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(path.join(BOUNCE, `${name}.f32`), buf);
        fs.writeFileSync(path.join(BOUNCE, `${name}.json`), JSON.stringify({ name, sampleRate: sr, channels: 2, frames: buf.length / 8, at: new Date().toISOString() }));
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, bytes: buf.length }));
      });
    });
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-eraclash-score-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), saver(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: {
    alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') },
    dedupe: ['firebase', '@firebase/app', '@firebase/app-check'],
  },
  optimizeDeps: { entries: ['eraclash-score-lab.html'] },
  server: { host: '127.0.0.1', port: 3243, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
