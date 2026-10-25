// Standalone dev server for the Data Commons UI (GrantMatcher + Terra FederalContext), with the real
// /api/data/* router mounted into Vite so the lab hits the live federal APIs:
//   npx vite --config data-commons-lab.vite.config.mjs  ->  http://127.0.0.1:3174/data-commons-lab.html
import { defineConfig } from 'vite';
import express from 'express';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const dataCommonsApi = () => ({
  name: 'data-commons-api',
  async configureServer(server) {
    const { createDataCommonsRouter } = await server.ssrLoadModule('/routes/dataCommons.ts');
    // Vite's connect req/res lack express helpers (req.query, res.set); an express app supplies them.
    const api = express();
    api.use(createDataCommonsRouter());
    // The grants workspace runs against an in-memory store with a stub model, so the lab needs no keys
    // or sign-in. Grants.gov, Census and USAspending are still the real services.
    const { createGrantsRouter } = await server.ssrLoadModule('/routes/grants.ts');
    const db = new Map([['organizations/lab', {
      name: 'Grace Chapel', legalName: 'Grace Chapel of Detroit Inc.', ein: '38-1234567', orgType: 'CHURCH', creatorId: 'lab-user', admins: [],
      tagline: 'A neighborhood church feeding and mentoring families.',
      location: { address: '1600 W Lafayette Blvd, Detroit, MI 48216', phone: '313-555-0100', email: 'office@grace.example', website: 'https://grace.example' },
    }]]);
    api.use(createGrantsRouter({
      verify: async () => 'lab-user',
      get: async p => db.get(p) ?? null,
      set: async (p, d) => { db.set(p, d); return true; },
      model: async (system, user) => {
        if (/chairing the Grant Council/.test(system)) return JSON.stringify({ readiness: 'revise', headline: '[lab stub] A few changes before you submit.', topFixes: [{ fix: 'Add a source for the need statement', seat: 'PEER_REVIEWER' }], limits: 'Lab stub model.' });
        if (/Reply with ONLY JSON/.test(system)) return JSON.stringify({ score: 3, verdict: '[lab stub] Reasonable start.', strengths: ['Clear mission'], concerns: ['Need is not sourced'], fixes: ['Cite your source'] });
        return 'Our pantry fed 450 families in 2025 and reduced waste by 62%. The funding we need is [NEEDS YOUR FACT: total request].';
      },
    }));
    server.middlewares.use(api);
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-data-commons-lab',
  plugins: [react(), tailwindcss(), dataCommonsApi()],
  optimizeDeps: { entries: ['data-commons-lab.html'] },
  server: { host: '127.0.0.1', port: 3174, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**', '**/*.jpg', '**/*.png', '**/*.webm', '**/*.mp4'] } },
});
