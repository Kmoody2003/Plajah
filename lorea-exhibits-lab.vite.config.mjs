// Standalone dev server for the Lorea Exhibition Hall (no Express/Firebase boot):
//   npx vite --config lorea-exhibits-lab.vite.config.mjs  ->  http://127.0.0.1:3144/lorea-exhibits-lab.html
// ?ex=<id> opens an exhibit, ?view=nuggets shows the nugget variants, the feed card and the post embed.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-lorea-exhibits-lab',
  plugins: [react()],
  optimizeDeps: { entries: ['lorea-exhibits-lab.html'] },
  // The preview pane first opens "/", whose app entry can't resolve the PWA plugin here; keep that
  // unrelated error from overlaying the lab page.
  server: { host: '127.0.0.1', port: 3144, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
