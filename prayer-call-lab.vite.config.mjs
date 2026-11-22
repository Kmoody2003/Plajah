// Prayer Call lab: the REAL route (routes/prayerCall.ts) runs inside this dev server with an
// in-memory store, a fake church, sign-in by ?as=<uid>, and a lab clock you can jump forward.
//   node node_modules/vite/bin/vite.js --config prayer-call-lab.vite.config.mjs  ->  http://127.0.0.1:3264/
// Cameras/audio go through LiveKit only with `--mode livekit` (or PRAYER_LAB_LIVEKIT=1) and keys in .env.livekit.local;
// otherwise the room runs with a local camera preview (same as a server without LiveKit).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const stub = (f) => path.resolve(root, 'labs/meetings-sfu', f);

let useLiveKit = process.env.PRAYER_LAB_LIVEKIT === '1';
function readLiveKit() {
  if (!useLiveKit) return null;
  try {
    const env = Object.fromEntries(fs.readFileSync(path.resolve(root, '.env.livekit.local'), 'utf8').split(/\r?\n/)
      .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
    return env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET } : null;
  } catch { return null; }
}

const church = {
  id: 'gf', name: 'Great Faith Church', orgType: 'CHURCH', creatorId: 'owner', admins: [],
  ministries: [
    { id: 'pray', name: 'Intercessory Prayer', headUids: ['deacon'], iconEmoji: '🙏' },
    { id: 'youth', name: 'Youth Ministry', iconEmoji: '🔥' },
  ],
};
const shop = { ...church, id: 'shop', name: 'Corner Bookshop', orgType: 'BRAND' };
const mem = (userId, extra = {}) => ({ userId, role: 'MEMBER', status: 'ACTIVE', ...extra });
const MEMBERS = {
  pastor: mem('pastor', { role: 'ADMIN', roleKey: 'PASTOR' }),
  deacon: mem('deacon', { ministryIds: ['pray'] }),
  staff: mem('staff', { role: 'STAFF', roleKey: 'STAFF', ministryIds: ['pray'] }),
  ruth: mem('ruth', { ministryIds: ['pray'] }),
  joe: mem('joe', { ministryRoles: [{ ministryId: 'pray', roleKey: 'PRAYER_WARRIOR' }] }),
  ana: mem('ana', { ministryIds: ['pray'] }),
  tim: mem('tim', { ministryIds: ['youth'] }),
};
const NAMES = { pastor: 'Pastor Grace Owens', deacon: 'Deacon Sam Reed', staff: 'Mia Carter', ruth: 'Ruth Allen', joe: 'Joe Banks', ana: 'Ana Diaz', tim: 'Tim Brooks' };

const labApi = {
  name: 'prayer-call-lab-api',
  async configureServer(server) {
    const express = (await import('express')).default;
    const { createPrayerCallRouter } = await server.ssrLoadModule('/routes/prayerCall.ts');
    const docs = new Map();
    let skew = 0;
    const lk = readLiveKit();
    const app = express();
    app.post('/__lab/clock', express.json(), (req, res) => {
      const call = docs.get('gf__pray');
      const now = Date.now() + skew;
      if (req.body?.leftMs != null && call?.status === 'LIVE') skew += (call.endsAt - Number(req.body.leftMs)) - now;
      else if (req.body?.addMs) skew += Number(req.body.addMs);
      else if (req.body?.reset) { skew = 0; docs.clear(); }
      res.json({ skew, now: Date.now() + skew });
    });
    app.get('/__lab/info', (_req, res) => res.json({ livekit: !!lk, skew }));
    app.use('/api/elevate/prayer-call', createPrayerCallRouter({
      authMiddleware: (req, res, next) => { const uid = String(req.headers['x-lab-uid'] || ''); if (!uid) return res.status(401).json({ error: 'Sign in.' }); req.uid = uid; next(); },
      getOrg: async id => (id === 'gf' ? church : id === 'shop' ? shop : null),
      getMembership: async (orgId, uid) => (orgId === 'gf' ? MEMBERS[uid] || null : null),
      displayName: async uid => NAMES[uid] || uid,
      store: {
        get: async k => (docs.has(k) ? structuredClone(docs.get(k)) : null),
        put: async (k, raw) => { docs.set(k, { ...(docs.get(k) || {}), ...structuredClone(raw) }); return true; },
      },
      livekit: () => lk,
      now: () => Date.now() + skew,
    }));
    server.middlewares.use((req, res, next) => {
      const [p, q] = (req.url || '').split('?');
      if (p === '/' || p === '/index.html') { req.url = '/prayer-call-lab.html' + (q ? `?${q}` : ''); return next(); }
      if (p.startsWith('/api/elevate/prayer-call') || p.startsWith('/__lab/')) return app(req, res, next);
      next();
    });
  },
};

// LiveKitSession → rtcCore → backendService/firestore: the lab uses the meetings-sfu stand-ins.
const labStubs = {
  name: 'prayer-call-lab-stubs',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id === 'virtual:pwa-register') return 'virtual-pwa-stub';
    if (id === 'firebase/firestore') return stub('firestoreStub.ts');
    if (importer && /[\\/]services[\\/]/.test(importer) && /(^|\/)(backendService|firebase)$/.test(id)) return stub('authStub.ts');
    return null;
  },
  load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
};

export default defineConfig(({ mode }) => { if (mode === 'livekit') useLiveKit = true; return {
  cacheDir: 'node_modules/.vite-prayer-call-lab',
  plugins: [labStubs, labApi, react(), tailwindcss()],
  optimizeDeps: { entries: ['prayer-call-lab.html'] },
  // No watcher: parallel sessions edit files across the repo. Restart to pick up changes.
  server: { host: '127.0.0.1', port: 3264, strictPort: true, hmr: false, watch: null },
}; });
