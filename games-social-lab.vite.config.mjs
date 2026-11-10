// Games in Social lab: a mock Social timeline whose posts carry `gameEmbed`, rendered by the real GameEmbedCard,
// with the REAL /api/gamer and /api/gamer/social routers on an in-memory store. Sign-in is stubbed by ?as=<name>,
// so two tabs (?as=alice, ?as=bob) can find each other on the timeline, challenge and play.
//   npx vite --config games-social-lab.vite.config.mjs  ->  http://127.0.0.1:3241/?as=alice
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { watchIgnored } from './vite.watch-ignore.mjs';

const STUBBED = /(services[\\/]gamerNet[\\/]|services[\\/]fediverse[\\/]crosspostClient|components[\\/]games[\\/]social[\\/]|labs[\\/]games-social[\\/])/;
const AUTH_STUB = [
  "const uid = new URLSearchParams(location.search).get('as');",
  "const name = uid ? uid[0].toUpperCase() + uid.slice(1) : '';",
  "export const auth = { currentUser: uid ? { uid, displayName: name, photoURL: '', getIdToken: async () => 'tok-' + uid } : null };",
  'export const db = {};',
].join('\n');
const POST_STUB = "export const createPost = async (p) => { const r = await fetch('/lab/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); return (await r.json()).id; };";

export default defineConfig({
  cacheDir: 'node_modules/.vite-games-social-lab',
  plugins: [
    {
      name: 'stub-firebase-auth',
      enforce: 'pre',
      resolveId: (id, importer) => (/[\\/]firebase$/.test(id) && importer && STUBBED.test(importer) ? '\0virtual-lab-auth' : null),
      load: (id) => (id === '\0virtual-lab-auth' ? AUTH_STUB : null),
    },
    {
      // The lab posts games into its own memory timeline instead of Firestore.
      name: 'stub-create-post',
      enforce: 'pre',
      resolveId: (id, importer) => (id === '../backendService' && importer && /gamerNet[\\/]socialClient\.ts/.test(importer) ? '\0virtual-lab-backend' : null),
      load: (id) => (id === '\0virtual-lab-backend' ? POST_STUB : null),
    },
    {
      name: 'gamer-api',
      configureServer: async (server) => {
        server.middlewares.use((req, _res, next) => {
          const [path, query] = (req.url || '').split('?');
          if (path === '/' || path === '/index.html') req.url = '/games-social-lab.html' + (query ? `?${query}` : '');
          next();
        });
        const { createGamerRouter } = await server.ssrLoadModule('/routes/gamerNet.ts');
        const { createGamerSocialRouter } = await server.ssrLoadModule('/routes/gamerSocial.ts');
        const { memoryGamerStore } = await server.ssrLoadModule('/services/gamerNet/store.ts');
        const store = memoryGamerStore();
        const verify = async (t) => (t.startsWith('tok-') ? t.slice(4) : null);
        const userCard = async (uid) => ({ name: uid[0].toUpperCase() + uid.slice(1) });
        const notices = [];
        const posts = [
          { id: 'p1', authorId: 'kenne', authorName: 'Kenne', text: 'Who wants a game? Tap the board.', timestamp: Date.now() - 60_000, gameEmbed: { v: 1, game: 'ttt', kind: 'play' } },
        ];
        const app = express();
        app.use(express.json());
        app.use('/api/gamer/social', createGamerSocialRouter({ store, verify, userCard, notify: async (n) => { notices.push({ ...n, at: Date.now() }); } }));
        app.use('/api/gamer', createGamerRouter({ store, verify, userCard }));
        // A pretend Bluesky account so the share sheet's connected path can be exercised (nothing leaves the lab).
        const crossposts = [];
        app.get('/api/fediverse/accounts', (_req, res) => res.json({ accounts: [{ id: 'bsky-lab', protocol: 'bluesky', handle: '@lab-player.bsky.social' }] }));
        app.post('/api/fediverse/crosspost-native', (req, res) => { crossposts.push(req.body); res.json({ results: [{ accountId: 'bsky-lab', protocol: 'bluesky', handle: '@lab-player.bsky.social', ok: true }] }); });
        app.get('/lab/crossposts', (_req, res) => res.json({ crossposts }));
        app.get('/lab/posts', (_req, res) => res.json({ posts: [...posts].sort((a, b) => b.timestamp - a.timestamp) }));
        app.post('/lab/posts', (req, res) => { const id = `p${posts.length + 1}`; posts.push({ ...req.body, id, timestamp: Date.now() }); res.json({ id }); });
        app.get('/lab/notices', (req, res) => res.json({ notices: notices.filter(n => n.userId === req.query.uid) }));
        server.middlewares.use(app);
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['games-social-lab.html'] },
  server: { host: '127.0.0.1', port: 3241, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/scripts/**'] } },
});
