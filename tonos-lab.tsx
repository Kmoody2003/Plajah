// TONOS world strings lab: the TonosPanel on a one-track groove (no sign-in), so the panel can be
// driven in a browser and every instrument auditioned.
//   npx vite --config tonos-lab.vite.config.mjs  ->  http://127.0.0.1:3246/tonos-lab.html
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { newGrooveDoc, type GrooveDoc } from './services/melos/beats/grooveDoc';
import { makeInstrumentTrack } from './services/melos/beats/instrumentFactory';
import { BeatsEngine } from './services/melos/beats/engine/BeatsEngine';
import { TonosPanel } from './components/melos/beats/instrument/TonosPanel';

function Lab() {
  const [doc, setDoc] = useState<GrooveDoc>(() => {
    const d = newGrooveDoc('lab', 'TONOS lab');
    d.arrangement.push(makeInstrumentTrack('tonos', 0));
    return d;
  });
  useEffect(() => { BeatsEngine.get().loadDoc(doc); (window as unknown as { tonosLab: unknown }).tonosLab = { doc, engine: BeatsEngine.get() }; }, [doc]);
  const mutate = useCallback((fn: (d: GrooveDoc) => void) => {
    setDoc((prev) => { const next = structuredClone(prev); fn(next); return next; });
  }, []);
  const track = doc.arrangement.find((t) => t.instrument?.type === 'tonos')!;
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <TonosPanel doc={doc} track={track} onMutate={mutate} onClose={() => {}} embedded />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
