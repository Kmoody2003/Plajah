// Standalone dev server for Aria's Crew: the real /api/crew router over an in-memory store and "lab:<uid>"
// tokens. No Firestore and no model is touched (Front Desk answers from facts alone, as it does without a key):
//   npx vite --config crew-lab.vite.config.mjs  ->  http://127.0.0.1:3225/crew-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const api = () => ({
  name: 'crew-api',
  async configureServer(server) {
    const { createCrewRouter } = await server.ssrLoadModule('/routes/crew.ts');
    const now = Date.now();
    const docs = new Map([
      ['organizations/gf', {
        name: 'Great Faith Fellowship', orgType: 'CHURCH', creatorId: 'owner', admins: ['admin'], staffUids: ['staff'],
        tagline: 'A family church on the east side', about: 'We gather to worship, serve the neighborhood and raise the next generation.',
        orgKindLabel: 'Non-denominational church', location: { address: '1200 Elm Street', city: 'Dayton, OH', phone: '(937) 555-0142', website: 'greatfaith.example.org' },
        serviceTimes: [{ id: 's1', label: 'Sunday Worship', day: 'Sunday', time: '10:00 AM', isOnline: true }, { id: 's2', label: 'Bible Study', day: 'Wednesday', time: '7:00 PM' }],
        ministries: [
          { id: 'y', name: 'Youth', description: 'Teens in grades 6-12.', meetingTime: 'Fridays 6:30 PM' },
          { id: 'f', name: 'Finance', kind: 'DEPARTMENT', description: 'Annual budget 480,000' },
        ],
      }],
      ['organizations/shop', { name: 'Corner Bakery', orgType: 'RESTAURANT', creatorId: 'owner', admins: [], isBusinessPage: true, about: 'Fresh bread daily.', hours: { monday: { open: '7:00 AM', close: '3:00 PM' }, sunday: { closed: true } } }],
      ['security_findings/a', { status: 'open', severity: 'high' }],
      ['security_findings/b', { status: 'ack', severity: 'medium' }],
      ['security_briefs/' + new Date(now).toISOString().slice(0, 10), { summary: 'Login failures from one network spiked overnight; a reversible slow-down is active.', topRisks: ['Credential stuffing against sign-in'], recommendedActions: ['Review the Sentinel finding and confirm the mitigation'], activeMitigations: 1, councilRunsLast24h: 96 }],
      ...Array.from({ length: 23 }, (_, i) => [`users/u${i}`, { createdAt: now - i * 6 * 3600_000 }]),
    ]);
    const store = {
      get: async p => docs.get(p) || null,
      patch: async (p, d) => { docs.set(p, { ...(docs.get(p) || {}), ...d }); return true; },
      query: async (c, filters, limit = 50) => [...docs.entries()]
        .filter(([k, v]) => k.startsWith(c + '/') && filters.every(f => (f.op ? true : v[f.field] === f.value)))
        .map(([k, v]) => ({ id: k.split('/')[1], data: v }))
        .sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0)).slice(0, limit),
    };
    const uidOf = req => { const h = req.headers.authorization || ''; return h.startsWith('Bearer lab:') ? h.slice(11) : null; };
    const app = express();
    app.use('/api/crew', express.json(), createCrewRouter({ store, callerUid: async req => uidOf(req), isAdmin: async req => uidOf(req) === 'kenne', model: null }));
    server.middlewares.use(app);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-crew-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    react(), tailwindcss(), api(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['crew-lab.html'] },
  server: { host: '127.0.0.1', port: 3225, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
