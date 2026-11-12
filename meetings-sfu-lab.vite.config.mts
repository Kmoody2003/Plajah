// Meetings SFU lab: the real meeting client + the real token route/webhook ledger against a local LiveKit.
//   1) labs/meetings-sfu: livekit-server --config labs/meetings-sfu/livekit.yaml   (ws://127.0.0.1:7880)
//   2) npx vite --config meetings-sfu-lab.vite.config.mts  ->  http://127.0.0.1:3247/?as=alice  (one tab per person)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labApp } from './labs/meetings-sfu/labServer';

// Paths from this file, so the lab runs from any cwd (the preview pane starts it from the main checkout).
const root = path.dirname(fileURLToPath(import.meta.url));
const stub = (f: string) => path.resolve(root, 'labs/meetings-sfu', f);

export default defineConfig({
  root,
  cacheDir: path.resolve(root, 'node_modules/.vite-meetings-sfu-lab'),
  plugins: [
    {
      // Firebase stays out of the lab: who you are comes from ?as=, presence writes are no-ops.
      name: 'lab-stubs',
      enforce: 'pre',
      async resolveId(id, importer) {
        if (id === 'firebase/firestore') return stub('firestoreStub.ts');
        if (importer && /services[\/]/.test(importer) && /^\.\.?\/(backendService|firebase)$/.test(id)) return stub('authStub.ts');
        if (importer && /services[\/]meetings[\/]/.test(importer) && /^\.\.\/backendService$/.test(id)) return stub('authStub.ts');
        return null;
      },
    },
    {
      name: 'lab-server',
      configureServer: (server) => {
        const app = labApp();
        server.middlewares.use((req, res, next) => {
          const [p, query] = (req.url || '').split('?');
          if (p === '/' || p === '/index.html') { req.url = '/meetings-sfu-lab.html' + (query ? `?${query}` : ''); return next(); }
          if (p.startsWith('/api/meetings/sfu') || p.startsWith('/lab/')) return (app as any)(req, res, next);
          next();
        });
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['meetings-sfu-lab.html'], include: ['livekit-client'] },
  build: { rollupOptions: { input: path.resolve(root, 'meetings-sfu-lab.html') } },
  server: { host: '127.0.0.1', port: 3247, strictPort: true, hmr: false, watch: { ignored: ['**/node_modules/**', '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**'] } },
});
