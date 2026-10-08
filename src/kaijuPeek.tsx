// Dev-only: Chora & Reello peeking from behind the real <PageHeader> "Plajah Chora" title (no sign-in, no Firebase).
//   /kaiju-peek.html          ?next=1 → the Chora Next masthead-sized title instead   ?play=1 → start the demo synth
// A tiny synth feeds a real AnalyserNode through the same KaijuSignal context the app uses. Delete freely.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './kaijuPeek.css';
import PageHeader from '../components/PageHeader';
import KaijuLetterPeek from '../components/kaiju/KaijuLetterPeek';
import { KaijuLogoDuo } from '../components/kaiju/KaijuMascots';
import { KaijuSignalContext } from '../components/kaiju/kaijuSignal';
import { Synth } from './kaijuDemoSynth';

function App() {
  const q = new URLSearchParams(location.search);
  // ?show=1 holds both kaiju up (lift 2), ?noclip=1 removes the letter clip, ?lift=1 / ?yaw=0.4 — layout debugging
  if (q.get('show')) (window as any).__kaijuPeekShow = { lift: q.get('lift') ? +q.get('lift')! : 2, noclip: !!q.get('noclip'), yaw: q.get('yaw') ? +q.get('yaw')! : 0 };
  const synth = useMemo(() => new Synth(), []);
  const [playing, setPlaying] = useState(false);
  const sig = useMemo(() => ({ analyser: synth.an, isPlaying: playing }), [synth, playing]);
  const toggle = () => { if (playing) { synth.stop(); setPlaying(false); } else { synth.start(); setPlaying(true); } };
  return (
    <KaijuSignalContext.Provider value={sig}>
      <div className="px-4 sm:px-6 lg:px-12 pt-8 mb-2 relative z-10">
        {q.get('next') ? (
          <div className="chora-next"><div className="cn-mast"><div className="flex items-end gap-3">
            <div className="relative"><KaijuLetterPeek /><h1 className="relative z-[1]" style={{ paddingTop: '0.42em' }}>Plajah <span className="cn-grad">Chora</span></h1></div>
          </div></div></div>
        ) : (
          <PageHeader mark={<KaijuLogoDuo />} behind={<KaijuLetterPeek />}>Plajah Chora</PageHeader>
        )}
        <div className="mt-6 flex gap-2 items-center text-xs">
          <button onClick={toggle} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #4a3a66', background: playing ? '#6B0099' : '#150d22', color: '#fff', fontWeight: 700 }}>{playing ? 'Stop' : 'Play'} demo music</button>
          <span style={{ opacity: .6 }}>hover a kaiju to make it wave</span>
        </div>
      </div>
    </KaijuSignalContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
