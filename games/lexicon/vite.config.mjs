// Lexicon: The Unwriting — standalone Three.js engine (Rift Realm pattern).
//   dev:   node node_modules/vite/bin/vite.js --config games/lexicon/vite.config.mjs  ->  http://127.0.0.1:4392
//   build: node node_modules/vite/bin/vite.js build --config games/lexicon/vite.config.mjs  -> public/games/lexicon/play
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// Dev-only: POST /__capture?name=foo.png (data-URL body) → games/lexicon/review/foo.png (review evidence).
const capturePlugin = {
  name: 'lexicon-capture',
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
  base: command === 'build' ? '/games/lexicon/play/' : '/',
  // dev serves the repo's public/ (vegetation leaves, Poly Haven textures, bark); the built game uses the app's /public
  publicDir: command === 'build' ? false : path.resolve(here, '../../public'),
  cacheDir: path.resolve(here, '../../node_modules/.vite-lexicon'),
  // one copy of three: plain 'three' (shared playkit modules) resolves to the WebGPU build, and every addon the
  // post pipeline uses is pre-bundled with it (TSL's Fn/If break across copies)
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  optimizeDeps: {
    entries: [path.resolve(here, 'index.html')],
    include: ['three/webgpu', 'three/tsl',
      'three/addons/tsl/display/BloomNode.js', 'three/addons/tsl/display/GTAONode.js', 'three/addons/tsl/display/GodraysNode.js',
      'three/addons/tsl/display/SSRNode.js', 'three/addons/tsl/display/TRAANode.js', 'three/addons/tsl/display/FXAANode.js',
      'three/addons/tsl/display/FSR1Node.js', 'three/addons/tsl/display/Lut3DNode.js', 'three/addons/tsl/display/GaussianBlurNode.js',
      'three/addons/objects/SkyMesh.js', 'three/addons/csm/CSMShadowNode.js', 'three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/FBXLoader.js'],
  },
  server: { host: '127.0.0.1', port: 4392, strictPort: true, fs: { allow: [path.resolve(here, '../..')] } },
  build: { outDir: path.resolve(here, '../../public/games/lexicon/play'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
}));
