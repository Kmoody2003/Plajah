// Standalone dev server for Sponsor This Show, with the real /api/back-show router over an in-memory store, a fake
// Stripe, a fake timestamp calendar and "lab:<uid>" tokens. No real card, Firestore or calendar is touched:
//   npx vite --config back-show-lab.vite.config.mjs  ->  http://127.0.0.1:3222/back-show-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const api = () => ({
  name: 'back-show-api',
  async configureServer(server) {
    const { createBackShowRouter } = await server.ssrLoadModule('/routes/backShow.ts');
    const { makeMemoryLabelBackend } = await server.ssrLoadModule('/labs/label/memoryBackend.ts');
    const { makeFakeStripe } = await server.ssrLoadModule('/labs/back-show/fakeStripe.ts');
    const backend = makeMemoryLabelBackend();
    const stripe = makeFakeStripe();
    backend.docs.set('users/artist', { displayName: 'Sam Okafor' });
    backend.docs.set('users/fan', { displayName: 'Jordan Fan' });
    backend.docs.set('users/biz', { displayName: 'Corner Bakery' });
    const labFiles = new Map();
    let clockOffset = 0;
    const app = express();
    // Lab only: finish the fake Stripe page and move the clock, so a whole show plays out in one sitting.
    app.post('/lab/complete/:session', (req, res) => { stripe.completeSession(req.params.session); res.json({ ok: true }); });
    app.post('/lab/advance/:days', (req, res) => { clockOffset += Number(req.params.days) * 86400000; res.json({ ok: true }); });
    app.post('/lab/onboard', async (_req, res) => { for (const a of stripe.createdAccounts) stripe.finishOnboarding(a.id); res.json({ ok: true }); });
    app.get('/lab/stripe', (_req, res) => res.json({ charges: stripe.charges, refunds: stripe.refunds, accounts: stripe.createdAccounts }));
    app.use('/api/back-show', express.json(), createBackShowRouter({
      cas: backend.cas, store: backend.store, getStripe: () => stripe,
      trustedRequestOrigin: () => 'http://127.0.0.1:3222',
      cronKeyOk: () => true, now: () => Date.now() + clockOffset,
      files: { put: async (p, d) => { labFiles.set(p, d); return true; }, get: async p => labFiles.get(p) || null },
      verify: async t => (t.startsWith('lab:') ? { uid: t.slice(4) } : null),
      timestamp: async () => [{ calendar: 'lab', response: new Uint8Array([0]) }],
    }));
    server.middlewares.use(app);
    // Opens a venue's verify link on the lab page, as /back/verify/<token> does in the real app.
    server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/back/verify/')) req.url = '/back-show-lab.html'; next(); });
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-back-show-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), api(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.'), jsmediatags: path.resolve('node_modules/jsmediatags/dist/jsmediatags.min.js') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['back-show-lab.html'] },
  server: { host: '127.0.0.1', port: 3222, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
