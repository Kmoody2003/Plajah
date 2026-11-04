// Verse lab: npx vite --config verse-lab.vite.config.mjs -> http://127.0.0.1:3216/verse-lab.html
// The viewer's three network-backed modules are swapped for labs/verse/mocks.ts.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const mock = path.resolve('labs/verse/mocks.ts');
const stubPwa = {
  name: 'stub-pwa-register',
  resolveId: id => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
  load: id => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig({
  cacheDir: 'node_modules/.vite-verse-lab',
  plugins: [stubPwa, react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^(?:\.\.\/)+services\/orgMedia$/, replacement: mock },
      { find: /^(?:\.\.\/)+services\/kairosService$/, replacement: mock },
      { find: /^(?:\.\.\/)+services\/ambo\/liveTranscriber$/, replacement: mock },
    ],
  },
  optimizeDeps: { entries: ['verse-lab.html'] },
  server: { host: '127.0.0.1', port: 3216, strictPort: true, hmr: false, watch: null },
});
