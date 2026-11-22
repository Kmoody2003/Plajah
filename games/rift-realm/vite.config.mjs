// Standalone Rift Realm dev server (Tron-meets-Fable 1st/3rd-person rhythm shooter).
import { defineConfig } from 'vite';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

export default defineConfig(({ command }) => ({
  root: here,
  base: command === 'build' ? '/games/rift-realm/play/' : '/',
  publicDir: command === 'build' ? false : path.resolve(here, '../../public'),
  cacheDir: path.resolve(here, '../../node_modules/.vite-rift-realm'),
  optimizeDeps: {
    entries: [path.resolve(here, 'index.html')],
    // every addon the game imports, so a late-found one never gets its own copy of three (TSL's If/Fn break across copies)
    include: ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh', 'three/addons/tsl/display/BloomNode.js', 'three/addons/tsl/display/GTAONode.js', 'three/addons/tsl/display/GodraysNode.js', 'three/addons/objects/SkyMesh.js', 'three/addons/loaders/GLTFLoader.js'],
  },
  server: {
    host: true,
    port: 4332,
    allowedHosts: true,
    fs: { allow: [path.resolve(here, '../..')] },
  },
  build: {
    outDir: path.resolve(here, '../../public/games/rift-realm/play'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // studio.html = the Game Studio's World view of this game (docs/game-studio-unified-plan.md)
    rollupOptions: { input: { main: path.resolve(here, 'index.html'), studio: path.resolve(here, 'studio.html') } },
  },
}));
