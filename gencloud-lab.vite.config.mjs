// Standalone dev server for the Plajah Cloud panel (components/genCloud). Sign-in is shimmed; the REAL
// /api/gen-cloud router runs on an in-memory ledger with fake providers: images come back as SVG
// cards, every video route fails (to show "not charged"), packs "check out" instantly through the real
// webhook handler. The lab account is Glow with a 500-credit launch bonus.
//   npx vite --config gencloud-lab.vite.config.mjs  ->  http://127.0.0.1:3249/gencloud-lab.html
import { defineConfig } from 'vite';
import express from 'express';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = process.cwd();
const SHIMS = { [path.join(root, 'services', 'firebase')]: path.join(root, 'labs/gencloud/firebaseShim.ts') };
const shims = () => ({
  name: 'gencloud-lab-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    const abs = path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.(ts|tsx)$/, '');
    return SHIMS[abs] || null;
  },
});

const esc = s => String(s).replace(/[<&>"]/g, '').slice(0, 40);

const api = () => ({
  name: 'gencloud-lab-api',
  async configureServer(server) {
    const { createGenCloudRouter, onPackCheckoutCompleted } = await server.ssrLoadModule('/routes/genCloud.ts');
    const { memoryCasStore } = await server.ssrLoadModule('/services/casCore.ts');
    const { ledgerStore, jobStore } = await server.ssrLoadModule('/services/genCloud/store.ts');
    const { grantBonus } = await server.ssrLoadModule('/services/genCloud/ledger.ts');
    const ledger = ledgerStore(memoryCasStore());
    await ledger.update('lab-user', l => grantBonus(l, 'lab-launch', 500, Date.now()));
    const docs = new Map(); const files = new Map(); const purchases = new Map();
    let n = 0;
    const card = (prompt, i) => new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${(i * 67 + n * 41) % 360},70%,45%)"/><stop offset="1" stop-color="#07060a"/></linearGradient></defs>` +
      `<rect width="768" height="768" fill="url(#g)"/><text x="40" y="700" font-family="sans-serif" font-size="28" fill="white">${esc(prompt)}</text></svg>`);
    const img = id => ({
      id, configured: () => true,
      async submit(_r, req) { n++; return { providerJobId: 'sync:lab', outputs: Array.from({ length: req.count || 1 }, (_, i) => ({ bytes: card(req.prompt, i), mime: 'image/svg+xml' })) }; },
      async poll() { return { status: 'failed' }; },
      async download() { return new Uint8Array(); },
    });
    const down = id => ({ id, configured: () => true, async submit() { throw new Error('lab: off'); }, async poll() { return { status: 'failed' }; }, async download() { return new Uint8Array(); } });
    const purchaseStore = { get: async k => purchases.get(k) ?? null, set: async (k, d) => { purchases.set(k, d); return true; } };
    const deps = {
      enabled: () => true,
      callerUid: async req => (req.headers.authorization === 'Bearer lab-token' ? 'lab-user' : null),
      isAdmin: async () => false,
      account: async uid => ({ plan: 'glow', verifiedAdult: false, restricted: false, owner: uid }),
      ledger,
      jobs: jobStore({ get: async p => docs.get(p) ?? null, set: async (p, d) => { docs.set(p, d); return true; } }),
      adapters: { runware: img('runware'), google: down('google'), fal: down('fal'), minimax: down('minimax'), elevenlabs: down('elevenlabs') },
      moderate: async () => ({ ok: true }),
      persist: async (bytes, out, { job, index }) => { const k = `${job.id}-${index}`; files.set(k, { bytes, mime: out.mime }); return `/lab-files/${k}`; },
      now: () => Date.now(),
      newId: () => `labjob${Math.random().toString(36).slice(2, 12)}`,
      origin: () => 'http://127.0.0.1:3249',
      createCheckout: async ({ pack, metadata }) => {
        const id = `lab_${Date.now()}`;
        await onPackCheckoutCompleted({ id, mode: 'payment', payment_status: 'paid', amount_total: pack.priceCents, payment_intent: `pi_${id}`, metadata }, { ledger, purchases: purchaseStore, now: () => Date.now() });
        return '/gencloud-lab.html?credits=success';
      },
    };
    const app = express();
    app.use('/api/gen-cloud', express.json(), createGenCloudRouter(deps));
    app.get('/lab-files/:k', (req, res) => { const f = files.get(req.params.k); if (!f) return res.sendStatus(404); res.type(f.mime).send(Buffer.from(f.bytes)); });
    server.middlewares.use(app);
  },
});

export default defineConfig({
  root,
  plugins: [shims(), react(), tailwindcss(), api()],
  build: { rollupOptions: { input: 'gencloud-lab.html' } },
  server: { host: '127.0.0.1', port: 3249, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
