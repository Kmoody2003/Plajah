// Go Live lab: real Go Live wizard / streamer / viewer / Live Talk with Firestore swapped for an
// in-memory store shared across frames (labs/golive/firestoreShim.ts) and a lab user per frame.
//   npx vite --config golive-lab.vite.config.mjs  ->  http://127.0.0.1:3194/golive-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const BACKEND = path.resolve('services/backendService.ts');
const BACKEND_SHIM = path.resolve('labs/golive/backendShim.ts');
const FS_SHIM = path.resolve('labs/golive/firestoreShim.ts');

export default defineConfig({
  cacheDir: 'node_modules/.vite-golive-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      name: 'golive-lab-shims',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!importer) return null;
        const from = path.resolve(importer.split('?')[0]);
        if (source === 'firebase/firestore') return from === FS_SHIM ? null : FS_SHIM;
        if (from === BACKEND_SHIM || !/backendService(\.ts)?$/.test(source)) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved && path.resolve(resolved.id) === BACKEND ? BACKEND_SHIM : null;
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['golive-lab.html'], exclude: [] },
  server: { host: '127.0.0.1', port: 3194, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
