// Standalone dev server for Chora's Public Domain Library (era + world shelves, rights engine)
// without booting the app:  npx vite --config pd-library-lab.vite.config.mjs
//   -> http://127.0.0.1:3190/pd-library-lab.html   (?shelf=MEXICO etc. is not wired; click the chips)
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const PLAYER = path.resolve('contexts/GlobalPlayerContext.tsx');
const PLAYER_SHIM = path.resolve('labs/pd-library/playerShim.tsx');

export default defineConfig({
  cacheDir: 'node_modules/.vite-pd-library-lab',
  plugins: [
    {
      name: 'pd-library-player-shim',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!importer || path.resolve(importer) === PLAYER_SHIM || !/GlobalPlayerContext(\.tsx)?$/.test(source)) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved && path.resolve(resolved.id) === PLAYER ? PLAYER_SHIM : null;
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['pd-library-lab.html'] },
  build: { rollupOptions: { input: 'pd-library-lab.html' } },
  server: { host: '127.0.0.1', port: 3190, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
