import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import OrgSidebarLayoutEditor from './components/elevate/OrgSidebarLayoutEditor';
import OrgSidebarLayoutBanner from './components/OrgSidebarLayoutBanner';
import { SIDEBAR_SECTIONS, resolveOrgHiddenSections, presetHidden, SIDEBAR_PRESETS, type OrgSidebarChoice } from './services/orgSidebarLayout';
import type { Organization } from './types';

// Org default sidebar lab: left = the app rail as a visitor sees it on the org page; right = Manage › Sidebar Layout.
// Saving needs a signed-in org admin, so the lab applies the editor's state via onOrgChange-less preview below.
const community = SIDEBAR_PRESETS.find(p => p.key === 'community')!;
const mockOrg = {
  id: 'lab-org', orgType: 'CHURCH', name: 'Grace Chapel', about: '', creatorId: 'me', admins: [],
  sidebarDefault: { enabled: true, hidden: presetHidden(community.visible) },
} as unknown as Organization;

const Lab: React.FC = () => {
  const [org, setOrg] = useState(mockOrg);
  const [choice, setChoice] = useState<OrgSidebarChoice>({ mode: 'org' });
  const hidden = resolveOrgHiddenSections(org.sidebarDefault, choice);
  const shown = SIDEBAR_SECTIONS.filter(s => !hidden?.has(s.id));
  return (
    <div className="flex h-screen overflow-hidden bg-[#020202]">
      <aside data-testid="rail" className="w-80 border-r border-white/[0.07] p-6 overflow-y-auto">
        {org.sidebarDefault?.enabled && (
          <OrgSidebarLayoutBanner orgName={org.name} layout={org.sidebarDefault} choice={choice} onChoice={setChoice} />
        )}
        <nav className="flex flex-col gap-1">
          {shown.map(s => <div key={s.id} className="h-10 px-6 flex items-center rounded-[1.2rem] text-[12px] uppercase tracking-widest font-black text-primary/60">{s.label}</div>)}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-10">
        <OrgSidebarLayoutEditor org={org} canEdit onOrgChange={setOrg} />
        <button data-testid="apply" className="mt-6 text-xs text-white/40 underline" onClick={() => setOrg({ ...org })}>(lab) re-render</button>
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
