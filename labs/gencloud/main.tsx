// Plajah Cloud lab: the REAL GenCloudDock/GenCloudStudio against the REAL /api/gen-cloud router
// (in-memory ledger + fake providers, see gencloud-lab.vite.config.mjs). Sign-in is shimmed.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import GenCloudDock, { openGenCloud } from '../../components/genCloud/GenCloudDock';

function Lab() {
  const [added, setAdded] = useState<string[]>([]);
  const btn = 'px-4 py-2 rounded-full border border-white/20 text-sm hover:bg-white/10';
  const onUse = (o: { url: string }[]) => setAdded(a => [...a, ...o.map(x => x.url)]);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Plajah Cloud lab</h1>
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => openGenCloud({ source: 'tela', useLabel: 'Add to page', onUse })}>Open as Tela</button>
        <button className={btn} onClick={() => openGenCloud({ source: 'reello', kinds: ['video'], useLabel: 'Add to uploads', onUse })}>Open as Reello</button>
        <button className={btn} onClick={() => openGenCloud({ source: 'fabula', kinds: ['video', 'image', 'voice'], useLabel: 'Add to bin', onUse })}>Open as Fabula</button>
        <button className={btn} onClick={() => openGenCloud({ tab: 'credits' })}>Credits</button>
      </div>
      <div id="added" className="text-sm text-white/60">Added to the room: {added.length}</div>
      <GenCloudDock />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
