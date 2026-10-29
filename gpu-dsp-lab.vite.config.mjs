// Browser WebGPU harness for Chora's GPU DSP kernels (same WGSL as rust/plajah-gpu-dsp):
//   npx vite --config gpu-dsp-lab.vite.config.mjs
//   -> http://127.0.0.1:3188/gpu-dsp-lab.html   (?power=low-power picks the integrated GPU)
import { defineConfig } from 'vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-gpu-dsp-lab',
  optimizeDeps: { entries: ['gpu-dsp-lab.html'] },
  // hmr off: other sessions edit sources constantly, and every edit would reload the lab.
  server: { host: '127.0.0.1', port: 3188, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**'] } },
});
