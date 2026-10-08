// Production-bundle benchmark of the Kaiju disco pages (immune to dev-server HMR reloads while files are being edited):
//   npx vite build --config kaiju-disco.build.config.mjs && npx vite preview --config kaiju-disco.build.config.mjs   →  http://127.0.0.1:3111/kaiju-disco.html
// public/ is not copied (760 MB): the preview server serves /models, /draco etc. straight from ./public.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
const MIME = { '.glb': 'model/gltf-binary', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.js': 'text/javascript', '.webp': 'image/webp' };
const servePublic = () => ({
  name: 'serve-public', configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const f = path.join('public', decodeURIComponent((req.url || '').split('?')[0]));
      if (f.includes('..') || !fs.existsSync(f) || !fs.statSync(f).isFile()) return next();
      res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
    });
  },
});
export default defineConfig({
  cacheDir: 'node_modules/.vite-kaiju-disco-build',
  plugins: [react(), servePublic()],
  publicDir: false,
  build: { outDir: process.env.KAIJU_OUT || 'dist-kaiju-disco', emptyOutDir: true, rollupOptions: { input: { disco: path.resolve('kaiju-disco.html'), flat: path.resolve('kaiju-2d.html') } }, chunkSizeWarningLimit: 4000 },
  preview: { host: '127.0.0.1', port: 3111, strictPort: true },
});
