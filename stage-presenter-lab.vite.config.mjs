// Stage presenter lab: the real Ambo Pro Presenter (Plajah Stage) mounted on its own — no app shell,
// no sign-in — for testing the operator UI (slide deck drag-reorder, timeline, import, outputs).
//   npx vite --config stage-presenter-lab.vite.config.mjs  ->  http://127.0.0.1:3288/stage-presenter-lab.html
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: path.join(root, 'node_modules/.vite-stage-presenter-lab'),
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(),
  ],
  resolve: { alias: { jsmediatags: path.join(root, 'node_modules/jsmediatags/dist/jsmediatags.min.js') } },
  optimizeDeps: { entries: ['stage-presenter-lab.html'] },
  server: { host: '127.0.0.1', port: 3288, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/games/**'] } },
});
