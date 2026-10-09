// Standalone dev server for the Living Books audio lab (no Express/Firebase boot):
//   npx vite --config living-audio-lab.vite.config.mjs  ->  http://127.0.0.1:3141/living-audio-lab.html
// Audition every sfx, instrument, ambience bed and demo cue; try depth, ducking, tempo ramps, narration and voice recording.
// You must click "Unlock sound" first (browsers keep audio locked until a gesture). The render panel measures sounds offline.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: 'node_modules/.vite-living-audio-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['living-audio-lab.html'] },
  server: { host: '127.0.0.1', port: 3141, strictPort: true, watch: { ignored: ['**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
