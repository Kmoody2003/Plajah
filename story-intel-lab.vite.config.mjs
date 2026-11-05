// Standalone dev server for Tela's Story Intelligence workspace (components/tela/storyIntel). Sign-in and
// the Worlds/video reads are shimmed (labs/story-intel/*); the REAL /api/reello router runs on an
// in-memory store seeded with two finished readings (one new, one from before people/places) and two
// Worlds, so filing, merging, skipping and re-filing run end to end:
//   npx vite --config story-intel-lab.vite.config.mjs  ->  http://127.0.0.1:3226/story-intel-lab.html
import { defineConfig } from 'vite';
import express from 'express';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const root = process.cwd();
const SHIMS = {
  [path.join(root, 'services', 'firebase')]: path.join(root, 'labs/reello-upload/firebaseShim.ts'),
  [path.join(root, 'services', 'backendService')]: path.join(root, 'labs/story-intel/backendShim.ts'),
};
const shims = () => ({
  name: 'story-intel-lab-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    const abs = path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.(ts|tsx)$/, '');
    return SHIMS[abs] || null;
  },
});

// Lab frames: a coloured card per moment instead of Mux stills (no real asset behind LABPID).
const frame = (t, hue) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,18%)"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="12" y="166" fill="white" font-family="monospace" font-size="16" opacity=".8">${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</text></svg>`)}`;
const swapStills = (obj, hue) => JSON.parse(JSON.stringify(obj).replace(/https:\/\/image\.mux\.com\/LABPID\/thumbnail\.jpg\?time=([\d.]+)&width=\d+/g, (_m, t) => frame(+t, hue)));

const EP4 = {
  summary: 'Aunt Dee cooks brisket with pitmaster Marcus Hill, whose granddad opened Hill Street Smokehouse in 1974.',
  topics: ['barbecue', 'family recipes'],
  chapters: [{ tSec: 0, title: 'Welcome to the table' }, { tSec: 310, title: 'Meet Marcus' }, { tSec: 840, title: 'The rub' }, { tSec: 1490, title: 'Sunday supper' }],
  stills: [{ tSec: 100, caption: 'Kitchen' }, { tSec: 760, caption: 'Brisket' }],
  offers: [{ name: 'Hill Street Rub', priceText: '3 jars for $36', evidence: 'both', tSec: 1300, confidence: 0.92 }],
  links: [], callsToAction: [],
  quotes: [
    { text: 'Low and slow or go home.', speaker: 'Marcus Hill', startSec: 1180, endSec: 1186, why: 'His whole philosophy' },
    { text: 'Everybody calls me Aunt Dee.', speaker: 'Denise Walker', startSec: 42, endSec: 45 },
  ],
  people: [
    { name: 'Denise Walker', role: 'host', description: 'Host of Kitchen Table Sessions, known as Aunt Dee.', onScreen: true, moments: [42, 760, 1500] },
    { name: 'Marcus Hill', role: 'guest', description: 'Pitmaster, owns Hill Street Smokehouse.', onScreen: true, moments: [310, 840, 1180], bestStillSec: 320 },
    { name: 'Granddad Hill', role: 'mentioned', description: 'Marcus\'s grandfather, who smoked everything over pecan.', onScreen: false, moments: [318, 1102] },
  ],
  lore: [
    { title: 'Hill Street Smokehouse', kind: 'place', description: 'The Hill family smokehouse on the Eastside, opened in 1974.', tSec: 310 },
    { title: 'Pecan-wood smoking', kind: 'idea', description: 'Marcus only smokes over pecan, like his granddad.', tSec: 1640 },
    { title: 'Sunday supper', kind: 'idea', tSec: 1700 },
  ],
  dates: [{ year: 1974, what: 'Hill Street Smokehouse opens', tSec: 318 }],
};
const MARKET = {
  summary: 'A morning at the Eastside Saturday Market with three vendors.',
  topics: ['farmers market', 'small business', 'Eastside'],
  chapters: [{ tSec: 0, title: 'Setting up at dawn' }, { tSec: 400, title: 'The honey stall' }],
  stills: [{ tSec: 30, caption: 'Stalls' }], offers: [], links: [], callsToAction: [],
  quotes: [{ text: 'Same spot every Saturday for nine years.', speaker: 'Marcus Hill', startSec: 224, endSec: 228 }],
};

// A film read by the film pipeline (report lives in Storage) and an album read by music intelligence.
const FILM_REPORT = {
  themes: ['Survival', 'Trust between strangers'],
  structure: { acts: [{ number: 1, title: 'The cemetery', startSec: 0, endSec: 900, summary: 'Barbra and Johnny visit a grave and are attacked.' }, { number: 2, title: 'The farmhouse', startSec: 900, endSec: 4200, summary: 'Strangers board up an isolated house.' }, { number: 3, title: 'Dawn', startSec: 4200, endSec: 5760 }] },
  characters: [
    { refId: 'ch1', name: 'Barbra', tier: 'MAIN', description: 'Flees the cemetery and finds the farmhouse.', confidence: 0.9, screenTimeSec: 2400, dialogueLines: 60, appearances: [{ sceneId: 's1', tSec: 30 }, { sceneId: 's2', tSec: 1000 }, { sceneId: 's3', tSec: 1500 }] },
    { refId: 'ch2', name: 'Ben', tier: 'MAIN', description: 'Takes charge of the house.', confidence: 0.95, screenTimeSec: 3600, dialogueLines: 140, appearances: [{ sceneId: 's2', tSec: 1010 }, { sceneId: 's3', tSec: 1510 }, { sceneId: 's4', tSec: 4300 }] },
    { refId: 'ch3', name: 'Harry Cooper', tier: 'SUPPORTING', description: 'Hides in the cellar with his family.', confidence: 0.85, appearances: [{ sceneId: 's3', tSec: 1600 }] },
  ],
  scenes: [
    { id: 's1', title: 'Cemetery', startSec: 20, characterRefIds: ['ch1'] },
    { id: 's2', title: 'Farmhouse arrival', startSec: 990, characterRefIds: ['ch1', 'ch2'] },
    { id: 's3', title: 'Boarding up', startSec: 1500, characterRefIds: ['ch1', 'ch2', 'ch3'] },
    { id: 's4', title: 'Dawn', startSec: 4250, characterRefIds: ['ch2'] },
  ],
  locations: [{ refId: 'loc1', name: 'The farmhouse', description: 'An isolated house in rural Pennsylvania.', sceneIds: ['s2', 's3'], confidence: 0.9 }],
  macguffins: [{ refId: 'mg1', name: 'The radio', narrativeRole: 'KEY_PROP', description: 'News reports explain what is happening.', sceneIds: ['s3'] }],
  stills: [],
};

const reelloApi = () => ({
  name: 'story-intel-api',
  async configureServer(server) {
    const { createReelloIntelRouter } = await server.ssrLoadModule('/routes/reelloIntel.ts');
    const { buildReport } = await server.ssrLoadModule('/services/reello/intel/core.ts');
    const day = 86400000;
    const ep4 = swapStills(buildReport(EP4, { durationSec: 1868, playbackId: 'LABPID' }), 18);
    const market = buildReport(MARKET, { durationSec: 1120, playbackId: 'LABPID' });
    delete market.people; delete market.lore; delete market.dates; // read before people and places existed
    const marketR = swapStills(market, 205);
    const job = (videoId, videoTitle, report, t) => ({ videoId, ownerId: 'lab-user', status: 'READY', videoTitle, accountName: 'Kenne Lab', report, drafts: {}, progress: { stage: 'Ready', pct: 100 }, options: { article: true, clips: true, merch: true, publishMode: 'APPROVE', merchTarget: { kind: 'USER' }, clipVisibility: 'PUBLIC' }, createdAt: t, updatedAt: t });
    const docs = new Map([
      ['users/lab-user', { displayName: 'Kenne Lab' }],
      ['videos/v_ep4', { id: 'v_ep4', ownerId: 'lab-user', title: 'Kitchen Table Sessions, Ep. 4', duration: 1868 }],
      ['videos/v_market', { id: 'v_market', ownerId: 'lab-user', title: 'Market Day at Eastside', duration: 1120 }],
      ['videos/v_sun', { id: 'v_sun', ownerId: 'lab-user', title: 'Sunday Service, Nov 2', duration: 2650 }],
      ['reelloIntel/v_ep4', job('v_ep4', 'Kitchen Table Sessions, Ep. 4', ep4, Date.now() - day)],
      ['reelloIntel/v_market', job('v_market', 'Market Day at Eastside', marketR, Date.now() - 3 * day)],
      ['reelloIntel/v_sun', { ...job('v_sun', 'Sunday Service, Nov 2', undefined, Date.now()), status: 'WATCHING', progress: { stage: 'Watching 20:00-40:00', pct: 62 } }],
      ['worlds/w_kitchen', { id: 'w_kitchen', creatorId: 'lab-user', name: 'The Kitchen Table', assetIds: [], createdAt: Date.now() - 30 * day }],
      ['worlds/w_kitchen/characters/c_dee', { id: 'c_dee', worldId: 'w_kitchen', name: 'Denise Walker', bio: 'Aunt Dee. Written by the creator in Worlds.', role: 'Host', sourceApp: 'WORLD' }],
      ['worlds/w_east', { id: 'w_east', creatorId: 'lab-user', name: 'Eastside Stories', assetIds: [], createdAt: Date.now() - 60 * day }],
      ['taleoAnalysis/film_notld', { albumId: 'film_notld', ownerId: 'lab-user', status: 'READY', reportPath: 'taleoAnalysis/lab-user/film_notld/report.json', progress: { stage: 'Ready', pct: 100 }, createdAt: Date.now() - 5 * day, updatedAt: Date.now() - 5 * day }],
      ['albums/film_notld', { id: 'film_notld', ownerId: 'lab-user', title: 'Night of the Living Dead (1968)', releaseYear: 1968, type: 'VIDEO', subType: 'MOVIE', tracks: [{ id: 't1', muxPlaybackId: 'LABFILMPID', duration: 5760 }] }],
      ['musicIntel/al_porch', { albumId: 'al_porch', ownerId: 'lab-user', status: 'READY', album: { overview: 'Songs about the people who keep a neighborhood going.', sonicSignature: 'Warm porch soul.', throughlines: ['Leaving home and coming back', 'Food as memory'] }, progress: { done: 10, total: 10 }, createdAt: Date.now() - 2 * day, updatedAt: Date.now() - 2 * day }],
      ['albums/al_porch', { id: 'al_porch', ownerId: 'lab-user', title: 'Porchlight (EP)', artist: 'Denise Walker', releaseDate: '2025-06-01', tracks: [] }],
    ]);
    const store = {
      async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
      async set(p, d) { docs.set(p, structuredClone(d)); return true; },
      async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
      async create() { return null; },
      async query(c, f) {
        return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value))
          .map(([k, v]) => ({ id: k.split('/')[1], data: v }));
      },
      async list(c, max) {
        const depth = c.split('/').length + 1;
        return [...docs.entries()].filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === depth).slice(0, max).map(([k, v]) => ({ id: k.split('/').pop(), data: v }));
      },
    };
    const api = express();
    api.use(express.json({ limit: '1mb' }));
    api.get('/', (_req, res) => res.redirect('/story-intel-lab.html'));
    api.get('/lab/worlds', (_req, res) => res.json([...docs.entries()].filter(([k, v]) => k.split('/').length === 2 && k.startsWith('worlds/') && v.creatorId === 'lab-user').map(([, v]) => v)));
    api.get('/lab/videos/:id', (req, res) => { const v = docs.get(`videos/${req.params.id}`); v ? res.json(v) : res.status(404).json(null); });
    api.get('/lab/docs', (_req, res) => res.json(Object.fromEntries([...docs.entries()].filter(([k]) => /^(worlds|videos|reelloIntel|taleoAnalysis|musicIntel|albums|storyIntelRules)\//.test(k)).map(([k, v]) => [k, /^(reelloIntel|taleoAnalysis|musicIntel)\//.test(k) ? { status: v.status, worldFiling: v.worldFiling, rulesCheckedAt: v.rulesCheckedAt } : v]))));
    const { createStoryIntelRouter } = await server.ssrLoadModule('/routes/storyIntelSources.ts');
    const files = { 'taleoAnalysis/lab-user/film_notld/report.json': FILM_REPORT };
    api.use('/api/story-intel', createStoryIntelRouter({ store: { ...store, storageJson: async p => (files[p] ? structuredClone(files[p]) : null) }, callerUid: async () => 'lab-user' }));
    api.use('/api/reello', createReelloIntelRouter({
      store, callerUid: async () => 'lab-user',
      watch: async () => ({ raw: EP4, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
      write: async () => ({ raw: { title: 'Low and slow', sections: [] }, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
      resolvePlayback: async () => 'LABPID',
    }));
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-story-intel-lab',
  plugins: [shims(), react(), tailwindcss(), reelloApi()],
  optimizeDeps: { entries: ['story-intel-lab.html'] },
  server: { host: '127.0.0.1', port: 3226, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
