// CellAtlasView — the Cell Atlas inside the Human Body module.
// Two interactive pages (served from /human-body/): the red blood cell (gas transport, three
// zoom levels, guided tour, lessons) and the brain + neuron (3D explodable brain, multi-compartment
// Hodgkin-Huxley axon, synapse, cell registry, source library). Each page carries its own claim
// ledger; everything here is UNDER REVIEW until a subject expert signs off (see docs/CONTENT_STATUS.md).

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Chip } from '../ui';
import ContentStatusBadge from '../ContentStatusBadge';

const PAGES = [
  { id: 'rbc', label: 'Red blood cell', src: '/human-body/rbc-atlas.html', blurb: 'How oxygen and carbon dioxide travel, from cell to molecule.' },
  { id: 'brain', label: 'Brain and neurons', src: '/human-body/brain-atlas.html', blurb: 'A 3D brain, a firing neuron, a synapse, and 54 cell types.' },
] as const;

const CellAtlasView: React.FC<{ onBack: () => void; initial?: 'rbc' | 'brain' }> = ({ onBack, initial = 'rbc' }) => {
  const [page, setPage] = useState<'rbc' | 'brain'>(initial);
  const cur = PAGES.find(p => p.id === page)!;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#07050c] text-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <Button variant="secondary" size="sm" icon={<ArrowLeft />} onClick={onBack}>Back</Button>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Human Body · Cell Atlas</p>
          <p className="text-sm text-white/70 truncate">{cur.blurb}</p>
        </div>
        <ContentStatusBadge status="UNDER_REVIEW" />
        <div className="ml-auto flex gap-1.5">
          {PAGES.map(p => <Chip key={p.id} interactive selected={page === p.id} onClick={() => setPage(p.id)}>{p.label}</Chip>)}
        </div>
      </div>
      <iframe key={cur.id} title={cur.label} src={cur.src} className="flex-1 w-full border-0 bg-[#07050c]"
        allow="autoplay; fullscreen" referrerPolicy="no-referrer" />
    </div>
  );
};

export default CellAtlasView;
