// Cinematic lab: plays a Stage project (.amboprj) through the real Ambo LayerRenderer at any
// output size — built for the Cinematic slide family and the Story Verse look on LED walls.
//   npx vite --config cinematic-lab.vite.config.mjs  ->  http://127.0.0.1:3287/cinematic-lab.html
//   ?src=/@fs/<absolute path to .amboprj>&w=3712&h=1080   (or drop a project file on the page)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: path.join(root, 'node_modules/.vite-cinematic-lab'),
  plugins: [{
    name: 'stub-pwa-register',
    resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
    load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
  }],
  resolve: { alias: { jsmediatags: path.join(root, 'node_modules/jsmediatags/dist/jsmediatags.min.js') } },
  optimizeDeps: { entries: ['cinematic-lab.html'] },
  // Local lab only: lets ?src=/@fs/... read a project file saved outside the repo.
  server: { host: '127.0.0.1', port: 3287, strictPort: true, hmr: false, fs: { strict: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
