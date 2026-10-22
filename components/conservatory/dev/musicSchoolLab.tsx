// Dev lab for the Conservatory music school — Ear Gym, Staff Sprint and Scope & Sequence without
// booting the app (or the rest of the Conservatory, whose archive services are heavy to load raw).
// npx vite --config music-school-lab.vite.config.mjs → http://127.0.0.1:3145/music-school-lab.html?tab=EAR_GYM
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import EarGym from '../EarGym';
import StaffSprint from '../StaffSprint';
import MusicSchoolCompass from '../MusicSchoolCompass';

type Tab = 'EAR_GYM' | 'NOTATION' | 'COMPASS';

const Lab: React.FC = () => {
  const [tab, setTab] = useState<Tab>((new URLSearchParams(location.search).get('tab') as Tab) || 'EAR_GYM');
  return (
    <div className="min-h-screen text-white max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex gap-2 mb-6">
        {(['EAR_GYM', 'NOTATION', 'COMPASS'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={tab === t ? { background: '#E0A458', color: '#000' } : { borderColor: 'rgba(255,255,255,0.15)' }}>{t}</button>
        ))}
      </div>
      {tab === 'EAR_GYM' ? <EarGym /> : tab === 'NOTATION' ? <StaffSprint /> : <MusicSchoolCompass onLink={l => console.info('[lab] link', l)} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
