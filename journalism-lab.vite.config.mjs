// Standalone dev server for the School of Journalism (no Express boot):
//   npx vite --config journalism-lab.vite.config.mjs  ->  http://127.0.0.1:3145/journalism-lab.html
// ?child=1 renders as a child account, ?tab=NEWSROOM|PRESS|STRANDS|TOOLS opens a tab.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

export default defineConfig({
  cacheDir: 'node_modules/.vite-journalism-lab',
  plugins: [
    react(), tailwindcss(),
    // The preview pane opens "/" first, whose index.html pulls the app's index.css — a whole-repo
    // Tailwind scan that can stall this server for minutes. Send it straight to the lab.
    { name: 'lab-root', configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url === '/' || req.url === '/index.html') { res.statusCode = 302; res.setHeader('Location', '/journalism-lab.html'); res.end(); return; } next(); }); } },
  ],
  optimizeDeps: { entries: ['journalism-lab.html', 'print-lab.html'] },
  server: { host: '127.0.0.1', port: 3145, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
