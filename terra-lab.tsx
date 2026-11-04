import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { TerraExplorer } from './components/terra/TerraExplorer';
import { LawLibrary } from './components/terra/LawLibrary';

// The real Terra map and Law Library with live city layers, Firestore reads and the real
// /api/terra/law router (terra-lab.vite.config.mjs). ?view=law opens the Law Library.
type LawTarget = { query?: string; zoningDistrict?: string; parcelId?: string };

const Lab: React.FC = () => {
  const [law, setLaw] = useState<LawTarget | null>(new URLSearchParams(location.search).get('view') === 'law' ? {} : null);
  return (
    <div style={{ height: '100vh' }}>
      {law
        ? <LawLibrary initialQuery={law.query} zoningDistrict={law.zoningDistrict} onBack={() => setLaw(null)} onOpenStudio={() => console.log('[lab] studio', law.parcelId)} />
        : <TerraExplorer onOpenPassport={id => console.log('[lab] passport', id)} onOpenStudio={id => console.log('[lab] studio', id)} onOpenLaws={setLaw} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
