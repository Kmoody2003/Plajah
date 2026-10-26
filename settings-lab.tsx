import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { SettingsSidebar, SettingsPhoneMenu, SettingsPageTabs, SettingsPageHeader } from './components/settings/SettingsNav';
import { groupOfPage } from './components/settings/settingsMap';

// Navigation-only lab: the real panels need a signed-in profile. ?caps=none hides the capability-gated groups.
const q = new URLSearchParams(location.search);
const caps = q.get('caps') === 'none' ? [] : ['LIVE_STREAM', 'RUN_RADIO', 'CREATE_VIDEO', 'CREATE_MUSIC', 'CREATE_BOOK', 'TEACH', 'SELL_MERCH', 'MONETIZE'];
const can = (cap?: string) => !cap || caps.includes(cap);
const who = { displayName: 'Kenne Moody', handle: 'kmoody' };

const Lab: React.FC = () => {
  const [tab, setTab] = useState(q.get('tab') || 'PROFILE');
  const [nav, setNav] = useState<'list' | 'detail'>('list');
  const [group, setGroup] = useState<string | null>(null);
  const phone = q.get('phone') === '1';
  const log = (t: string) => console.log('navigate', t);
  const shared = { who, can, badges: { AUDIO_HEALTH: 2 }, onNavigate: log };
  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-[#020202] relative">
      {phone && nav === 'list' && (
        <SettingsPhoneMenu {...shared} groupId={group} onGroupChange={setGroup} onSelect={(id) => { setTab(id); setNav('detail'); }} onExit={() => console.log('exit')} />
      )}
      <SettingsSidebar {...shared} activeTab={tab} onSelect={setTab} onExit={() => console.log('exit')} isStaff onAdmin={() => log('ADMIN')} />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-16">
        {phone && (
          <button data-testid="back" onClick={() => { const g = groupOfPage(tab); setNav('list'); setGroup(g && g.pages.length > 1 ? g.id : null); }} className="mb-4 text-white">‹ Back</button>
        )}
        <div className="max-w-4xl mx-auto">
          <SettingsPageTabs activeTab={tab} can={can} badges={{ AUDIO_HEALTH: 2 }} onSelect={setTab} onNavigate={log} />
          <SettingsPageHeader activeTab={tab} />
        </div>
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
