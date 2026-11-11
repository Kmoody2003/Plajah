// Standalone dev server for Lorea Lexicon (no Express/Firebase boot):
//   npx vite --config lexicon-lab.vite.config.mjs  ->  http://127.0.0.1:3245/lexicon-lab.html
// ?w=<word> opens an entry, &tab=origins|thesaurus|languages|slang|life picks a chapter, &kids=1 previews Kids Mode.
// /api/lexicon is served by the real handler (services/lexicon/handler.ts) with in-memory slang + journal
// stores; the lab signs everyone in as "Lab reader" so community slang and the journal can be exercised.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { watchIgnored } from './vite.watch-ignore.mjs';

function lexiconApi() {
  let ctx = null;
  return {
    name: 'lexicon-api',
    configureServer(server) {
      server.middlewares.use('/api/lexicon', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/services/lexicon/handler.ts');
          if (!ctx) ctx = { ...mod.memoryStores(), auth: async h => (h === 'Bearer lab' ? { uid: 'lab', name: 'Lab reader' } : null) };
          const url = new URL(req.url || '/', 'http://lab');
          let body;
          if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; } }
          const out = await mod.handleLexicon({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, authorization: req.headers.authorization }, ctx);
          res.statusCode = out.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out.body));
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e?.message || e) })); }
      });
    },
  };
}

export default defineConfig({
  cacheDir: 'node_modules/.vite-lexicon-lab',
  plugins: [react(), lexiconApi()],
  optimizeDeps: { entries: ['lexicon-lab.html'] },
  server: { host: '127.0.0.1', port: 3245, strictPort: true, hmr: { overlay: false }, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/.tela-proofs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
