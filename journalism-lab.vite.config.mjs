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
    // Stand-in for the app's /api/proxy, Google Fonts only: a server fetch gets TrueType files, which
    // the press PDF embeds as vector text (services/print/fontSource.ts).
    { name: 'lab-font-proxy', configureServer(server) { server.middlewares.use('/api/proxy', async (req, res) => {
      try {
        const target = new URL(new URL(req.url || '', 'http://lab').searchParams.get('url') || '');
        if (!['fonts.googleapis.com', 'fonts.gstatic.com'].includes(target.hostname)) { res.statusCode = 403; res.end('fonts only'); return; }
        const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)' } });
        res.statusCode = r.status; res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) { res.statusCode = 502; res.end(String(e)); }
    }); } },
  ],
  optimizeDeps: { entries: ['journalism-lab.html', 'print-lab.html'] },
  server: { host: '127.0.0.1', port: 3145, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
