// Dev lab for the Chora Mastering Desk — the desk (timeline, bays, deck) under the shared studio
// menu bar, without booting the app. Signed out it runs fully in memory, like the real desk.
// npx vite --config master-desk-lab.vite.config.mjs → http://127.0.0.1:3166/master-desk-lab.html
// ?demo=1 drops three synthesized songs on the proof sheet so the timeline has something on it.
import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../../index.css';
import { newGrooveDoc, type GrooveDoc } from '../../../../../services/melos/beats/grooveDoc';
import { encodeWav } from '../../../../../services/audio/wavEncode';
import { useEngineBridge } from '../../useEngineBridge';
import { ProjectView } from '../ProjectView';
import { StudioMenuProvider, StudioMenuBar } from '../../../StudioMenus';

/** A short chord-pad song, so the lab has real audio without fixtures. */
function demoSong(seconds: number, rootHz: number): File {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const buf = ctx.createBuffer(2, sr * seconds, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.4) * Math.min(1, (seconds - t) / 0.8);
      const pulse = 0.6 + 0.4 * Math.max(0, Math.sin(2 * Math.PI * t * 2));
      d[i] = env * pulse * 0.18 * (Math.sin(2 * Math.PI * rootHz * t) + 0.6 * Math.sin(2 * Math.PI * rootHz * 1.26 * t) + 0.5 * Math.sin(2 * Math.PI * rootHz * 1.5 * t));
    }
  }
  return new File([encodeWav(buf, 16)], `Demo ${Math.round(rootHz)} Hz.wav`, { type: 'audio/wav' });
}

const Lab: React.FC = () => {
  const docRef = useRef<GrooveDoc>(newGrooveDoc('lab', 'Lab Groove'));
  const [, setRev] = useState(0);
  const mutate = useCallback((fn: (d: GrooveDoc) => void) => { fn(docRef.current); setRev((r) => r + 1); }, []);
  const snap = useEngineBridge();
  return (
    <StudioMenuProvider>
      <div className="h-screen flex flex-col text-white" style={{ background: '#0A0A0D' }}>
        <header className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
          <span className="text-[12px] font-bold tracking-[0.16em] uppercase text-[#D0BCFF]">Chora Studio · Lab</span>
          <StudioMenuBar base={[{ label: 'File', items: [{ id: 'lab-new', label: 'New production (lab)', onSelect: () => console.info('[lab] new production') }] }]} />
        </header>
        <div className="flex-1 min-h-0 flex flex-col">
          <ProjectView doc={docRef.current} snap={snap} onMutate={mutate} />
        </div>
      </div>
    </StudioMenuProvider>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);

// ?demo=1 — drop three songs onto the proof sheet once it has mounted.
if (new URLSearchParams(location.search).get('demo')) {
  const tryDrop = (n = 0) => {
    const zone = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.startsWith('The sheet is empty'))?.parentElement;
    if (!zone) { if (n < 50) setTimeout(() => tryDrop(n + 1), 200); return; }
    const dt = new DataTransfer();
    [demoSong(14, 110), demoSong(11, 146.83), demoSong(16, 98)].forEach((f) => dt.items.add(f));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  };
  tryDrop();
}
