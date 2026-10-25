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
    const db = new Map([['organizations/lab-biz', {
      name: 'Riverside Catering', legalName: 'Riverside Catering LLC', ein: '38-7654321', orgType: 'RESTAURANT', creatorId: 'lab-user', admins: [],
      tagline: 'Event catering and meal prep for Detroit offices and schools.',
      location: { address: '4200 Cass Ave, Detroit, MI 48201', phone: '313-555-0142', email: 'hello@riverside.example', website: 'https://riverside.example' },
    }], ['organizations/lab', {
      name: 'Grace Chapel', legalName: 'Grace Chapel of Detroit Inc.', ein: '38-1234567', orgType: 'CHURCH', creatorId: 'lab-user', admins: [],
      tagline: 'A neighborhood church feeding and mentoring families.',
      location: { address: '1600 W Lafayette Blvd, Detroit, MI 48216', phone: '313-555-0100', email: 'office@grace.example', website: 'https://grace.example' },
    }]]);
    // Contracts: use the real SAM.gov API when SAM_GOV_API_KEY is set, otherwise a small labelled fixture so the UI can be exercised.
    const sam = await server.ssrLoadModule('/services/dataCommons/contracts.ts');
    const soon = d => new Date(Date.now() + d * 86_400_000).toISOString();
    const fixture = [
      { noticeId: 'f1', title: 'Catering services for regional training events', fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY', type: 'Solicitation', typeOfSetAside: 'SBA', typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)', responseDeadLine: soon(12), naicsCode: '722320', placeOfPerformance: { city: { name: 'Detroit' }, state: { code: 'MI' } } },
      { noticeId: 'f2', title: 'Janitorial services, federal building', fullParentPathName: 'GENERAL SERVICES ADMINISTRATION.PBS', type: 'Combined Synopsis/Solicitation', typeOfSetAside: 'WOSB', typeOfSetAsideDescription: 'Women-Owned Small Business', responseDeadLine: soon(20), naicsCode: '561720', placeOfPerformance: { city: { name: 'Detroit' }, state: { code: 'MI' } } },
      { noticeId: 'f3', title: 'Meal preparation and food service sources sought', fullParentPathName: 'VETERANS AFFAIRS.VA MEDICAL CENTER', type: 'Sources Sought', typeOfSetAside: '', responseDeadLine: soon(30), naicsCode: '722310', placeOfPerformance: { city: { name: 'Ann Arbor' }, state: { code: 'MI' } } },
      { noticeId: 'f4', title: 'Grounds maintenance (HUBZone)', fullParentPathName: 'DEPT OF THE AIR FORCE.', type: 'Solicitation', typeOfSetAside: 'HZC', typeOfSetAsideDescription: 'HUBZone Set-Aside', responseDeadLine: soon(9), naicsCode: '561730', placeOfPerformance: { state: { code: 'MI' } } },
      { noticeId: 'f5', title: 'Award notice: vending services', fullParentPathName: 'DEPT OF THE NAVY.', type: 'Award Notice', naicsCode: '722330' },
    ];
    const contracts = async (state, filter) => {
      if (process.env.SAM_GOV_API_KEY) return sam.searchContracts(state, filter);
      const { opps, hiddenIneligible } = sam.filterAndScore(fixture.map(sam.normalizeOpp).filter(Boolean), filter);
      return { status: 'ok', opportunities: opps, hiddenIneligible, pulled: fixture.length, state, source: { agency: 'LAB FIXTURE (not SAM.gov)', dataset: 'fixture', url: 'https://sam.gov', retrievedAt: Date.now(), license: 'fixture' } };
    };
    api.use(createGrantsRouter({
      contracts,
      verify: async () => 'lab-user',
      // Contracts need a SAM.gov key; the lab uses SAM_GOV_API_KEY from the environment if set, else shows the unconfigured state.
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
