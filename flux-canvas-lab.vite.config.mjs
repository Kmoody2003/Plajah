// Flux Canvas lab: still images as Flux visualizers (directed / 2.5D / 3D), live audio and the offline song harness.
//   npx vite --config flux-canvas-lab.vite.config.mjs  ->  http://127.0.0.1:3227/flux-canvas-lab.html
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-flux-canvas-lab',
  plugins: [{
    name: 'stub-pwa-register',
    resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
    load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
  }],
  optimizeDeps: { entries: ['flux-canvas-lab.html'] },
  server: { host: '127.0.0.1', port: 3227, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
