// Smart Sync lab: the Fabula Smart Sync panel on synthetic angles (no sign-in, no Whisper download).
//   npx vite --config smartsync-lab.vite.config.mjs  ->  http://127.0.0.1:3241/smartsync-lab.html
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-smartsync-lab',
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'stub-pwa-register',
    resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
    load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
  }],
  optimizeDeps: { entries: ['smartsync-lab.html'] },
  server: { host: '127.0.0.1', port: 3241, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
