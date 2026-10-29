// SOMA deep-skin lab: CPU cloud vs GPU modes through the real engine, plus a warm-up bench:
//   npx vite --config soma-deep-lab.vite.config.mjs
//   -> http://127.0.0.1:3189/soma-deep-lab.html   (?presets=id,id  ?bench=0)
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-soma-deep-lab',
  optimizeDeps: { entries: ['soma-deep-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3189, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**'] } },
});
