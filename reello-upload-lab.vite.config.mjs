// Standalone dev server for the Reello Upload Studio (components/reello/upload). Sign-in, the byte upload
// and the org lookup are shimmed (labs/reello-upload/*); the REAL /api/reello router runs on an in-memory
// store with a canned "watch", so templates, drafts, posting and auto-post can be exercised end to end:
//   npx vite --config reello-upload-lab.vite.config.mjs  ->  http://127.0.0.1:3192/reello-upload-lab.html
import { defineConfig } from 'vite';
import express from 'express';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = process.cwd();
const SHIMS = {
  [path.join(root, 'services', 'firebase')]: path.join(root, 'labs/reello-upload/firebaseShim.ts'),
  [path.join(root, 'services', 'backendService')]: path.join(root, 'labs/reello-upload/backendShim.ts'),
  [path.join(root, 'services', 'organizationService')]: path.join(root, 'labs/reello-upload/orgShim.ts'),
};
const shims = () => ({
  name: 'reello-lab-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    const abs = path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.(ts|tsx)$/, '');
    return SHIMS[abs] || null;
  },
});

const CANNED = {
  summary: 'A ceramicist walks through glazing a batch of speckled mugs, from mixing to the kiln reveal.',
  topics: ['pottery', 'glazing'],
  chapters: [{ tSec: 0, title: 'Mixing the glaze' }, { tSec: 70, title: 'Dipping' }, { tSec: 160, title: 'The kiln' }],
  stills: [{ tSec: 40, caption: 'Glaze bucket' }, { tSec: 120, caption: 'Wet mugs on the rack' }],
  offers: [
    { name: 'Speckled Mug', priceText: '$32, or the 2-pack for $55', evidence: 'both', tSec: 75, confidence: 0.92, url: 'shop.lab-pottery.com/mug', category: 'other' },
    { name: 'Glaze starter kit', priceText: '', evidence: 'speech', tSec: 140, confidence: 0.45 },
  ],
  links: [{ url: 'lab-pottery.com', evidence: 'graphic', tSec: 5, label: 'Lower third' }],
  quotes: [
    { text: 'Every crack tells you where the heat went.', speaker: 'Ana', startSec: 95, endSec: 99, why: 'The thesis of the video in one line' },
    { text: 'You do not control the kiln. You make friends with it.', speaker: 'Ana', startSec: 170, endSec: 175 },
  ],
  callsToAction: ['Link in the description'],
};

const ARTICLE = {
  title: 'The crack that tells the whole story',
  subtitle: 'Ana glazes a batch of mugs, and lets the kiln have the last word.',
  dek: 'Glazing looks simple until the kiln opens.',
  sections: [
    { heading: 'Mixing is the quiet part', body: 'Ana starts with a bucket and a lot of patience.' },
    { heading: 'Then comes the heat', body: 'What happens in the kiln is the part she cannot script.' },
  ],
  tease: 'Whether the batch survives is something you will want to see for yourself.',
  tags: ['pottery'],
};

const reelloApi = () => ({
  name: 'reello-api',
  async configureServer(server) {
    const { createReelloIntelRouter } = await server.ssrLoadModule('/routes/reelloIntel.ts');
    const docs = new Map([
      ['users/lab-user', { displayName: 'Kenne Lab' }],
      ['organizations/org_lab', { name: 'Grace Chapel', creatorId: 'someone', admins: ['lab-user'], accountUid: 'grace-acct' }],
    ]);
    let n = 0;
    const store = {
      async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
      async set(p, d) { docs.set(p, structuredClone(d)); return true; },
      async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
      async create(c, d) { const id = `${c}_${++n}`; docs.set(`${c}/${id}`, structuredClone(d)); return id; },
      async query(c, f) {
        return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value))
          .map(([k, v]) => ({ id: k.split('/')[1], data: v }));
      },
    };
    const api = express();
    api.use(express.json({ limit: '1mb' }));
    api.post('/lab/videos', (req, res) => { docs.set(`videos/${req.body.id}`, req.body); res.json({ ok: true }); });
    api.patch('/lab/videos/:id', (req, res) => { docs.set(`videos/${req.params.id}`, { ...(docs.get(`videos/${req.params.id}`) || {}), ...req.body }); res.json({ ok: true }); });
    api.get('/lab/docs', (_req, res) => res.json(Object.fromEntries(docs)));
    api.use('/api/reello', createReelloIntelRouter({
      store,
      callerUid: async () => 'lab-user',
      watch: async (_m, onProgress) => { onProgress(40, 'Watching 0:00-4:00'); await new Promise(r => setTimeout(r, 1500)); return { raw: CANNED, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }; },
      write: async () => ({ raw: ARTICLE, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
      resolvePlayback: async v => v.muxPlaybackId || null,
    }));
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-reello-upload-lab',
  plugins: [shims(), react(), tailwindcss(), reelloApi()],
  optimizeDeps: { entries: ['reello-upload-lab.html'] },
  server: { host: '127.0.0.1', port: 3192, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
