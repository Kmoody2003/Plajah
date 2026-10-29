// Dev lab for Chora's Public Domain Library (recordings) and Sheet Music catalogue.
// npx vite --config pd-library-lab.vite.config.mjs → http://127.0.0.1:3190/pd-library-lab.html  (?tab=SCORES)
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PublicDomainLibrary from '../../components/chora/PublicDomainLibrary';
import SheetMusicLibrary from '../../components/chora/SheetMusicLibrary';
import { GlobalPlayerProvider } from './playerShim';

type Tab = 'RECORDINGS' | 'SCORES';

const Lab: React.FC = () => {
  const [tab, setTab] = useState<Tab>((new URLSearchParams(location.search).get('tab') as Tab) || 'RECORDINGS');
  return (
    <div className="min-h-screen text-white max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
      <div className="flex gap-2 mb-6">
        {(['RECORDINGS', 'SCORES'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={tab === t ? { background: '#E0A458', color: '#000', borderColor: 'transparent' } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
            {t === 'RECORDINGS' ? 'Recordings' : 'Sheet music'}
          </button>
        ))}
      </div>
      {tab === 'RECORDINGS' ? <PublicDomainLibrary /> : <SheetMusicLibrary />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <GlobalPlayerProvider>
    <Lab />
  </GlobalPlayerProvider>,
);
