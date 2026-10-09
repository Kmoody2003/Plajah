// Standalone dev server for the living-plate evite stage (no Express/Firebase boot):
//   npx vite --config evite-stage.vite.config.mjs   →  http://127.0.0.1:3120/evite-stage.html?c=kids_boy&s=dino
// Plates + depth maps are served from EVITE_ASSETS (default: the production scratch folder), never from the repo.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: path.join(root, 'node_modules/.vite-evite-stage'),
  plugins: [react()],
  publicDir: process.env.EVITE_ASSETS || 'public',
  optimizeDeps: { entries: ['evite-stage.html', 'evite-guest.html', 'evite-host.html', 'evite-play.html', 'evite-eras.html'] },
  // The host preview runs without Firebase: the host client, backendService and the public gallery are dev mocks here.
  resolve: { alias: [
    { find: /^.*services\/evite\/eviteHostClient$/, replacement: path.join(root, 'src/mocks/eviteHostClientMock.ts') },
    { find: /^.*services\/backendService$/, replacement: path.join(root, 'src/mocks/backendServiceMock.ts') },
    { find: /^\.\.\/LiveEventsGallery$/, replacement: path.join(root, 'src/mocks/LiveEventsGalleryStub.tsx') },
  ] },
  server: { host: '127.0.0.1', port: 3120, strictPort: true, hmr: { overlay: false }, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/scratchpad/**'] } },
});
