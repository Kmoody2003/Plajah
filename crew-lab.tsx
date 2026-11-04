import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { configureCrewClient } from './services/crew/crewClient';
import OrgCrewPanel from './components/crew/OrgCrewPanel';
import FrontDeskAsk from './components/crew/FrontDeskAsk';
import AriaHqBriefing from './components/admin/AriaHqBriefing';
import { EvScope } from './components/elevate/vellum';

// The real crew screens and routes/crew.ts over an in-memory store (crew-lab.vite.config.mjs).
// ?as= picks who is signed in; ?view=crew|visitor|hq; ?org=gf|shop.
const q = new URLSearchParams(location.search);
const uid = q.get('as') ?? 'owner';
const view = q.get('view') ?? 'crew';
const orgId = q.get('org') ?? 'gf';
const orgName = orgId === 'shop' ? 'Corner Bakery' : 'Great Faith Fellowship';
configureCrewClient({ token: async () => (uid === 'none' ? null : `lab:${uid}`) });
const link = (v: string, as: string, o = orgId) => `?view=${v}&as=${as}&org=${o}`;
const TABS: [string, string, string][] = [
  ['crew', 'owner', 'Org owner · Crew'], ['crew', 'staff', 'Org staff · Crew'], ['visitor', 'none', 'Visitor · page'],
  ['hq', 'kenne', 'Kenne · Aria HQ'], ['hq', 'owner', 'Non-admin · HQ'],
];

createRoot(document.getElementById('root')!).render(
  <EvScope className="min-h-screen">
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <nav aria-label="Lab" className="mb-6 flex flex-wrap gap-2 text-xs">
        {TABS.map(([v, as, text]) => (
          <a key={text} href={link(v, as)} className={`rounded-full border px-3 py-1 ${v === view && as === uid ? 'border-[#D40055] text-white' : 'border-white/15 text-white/50'}`}>{text}</a>
        ))}
        <a href={link(view, uid, orgId === 'gf' ? 'shop' : 'gf')} className="rounded-full border border-white/15 px-3 py-1 text-white/50">Switch to {orgId === 'gf' ? 'Corner Bakery' : 'Great Faith'}</a>
      </nav>
      {view === 'crew' && <OrgCrewPanel org={{ id: orgId, name: orgName }} onOpenSection={k => alert(`Would open the ${k} section`)} />}
      {view === 'visitor' && (
        <div className="ev-panel p-6 space-y-4">
          <h1 className="text-2xl font-bold">{orgName}</h1>
          <p className="text-sm text-white/60">Public page stand-in. The Ask us button appears only when the org has hired Front Desk.</p>
          <div className="flex gap-2"><FrontDeskAsk orgId={orgId} orgName={orgName} /></div>
        </div>
      )}
      {view === 'hq' && <div className="bg-[#0a0a0a] rounded-3xl p-6"><AriaHqBriefing /></div>}
    </div>
  </EvScope>,
);
