// Native audio lab — the real Instrument + nativeStream path, run inside the Windows app:
//   npx vite --config native-audio-lab.vite.config.mjs  ->  http://localhost:3196/native-audio-lab.html
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-native-audio-lab',
  build: { assetsInlineLimit: (filePath) => (filePath.endsWith('.worklet.js') ? false : undefined) },
  optimizeDeps: { entries: ['native-audio-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: 'localhost', port: 3196, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
