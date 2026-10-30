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
const FIREBASE = path.resolve('services/firebase.ts');
const FIREBASE_SHIM = path.resolve('labs/golive/firebaseShim.ts');
const CLASS_MEDIA_SHIM = path.resolve('labs/golive/classMediaShim.ts');

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
        if (source === 'firebase/storage' && /sharedClassroomService/.test(from)) return CLASS_MEDIA_SHIM;
        if (/backendService(\.ts)?$/.test(source) && from !== BACKEND_SHIM) {
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          return resolved && path.resolve(resolved.id) === BACKEND ? BACKEND_SHIM : null;
        }
        if (/\/firebase(\.ts)?$/.test(source) && from !== FIREBASE_SHIM) {
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          return resolved && path.resolve(resolved.id) === FIREBASE ? FIREBASE_SHIM : null;
        }
        return null;
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['golive-lab.html'], exclude: [] },
  server: { host: '127.0.0.1', port: 3194, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
