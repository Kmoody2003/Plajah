// AmboScriptureDock — a docked Bible lookup inside the presenter (ProPresenter's
// Library-Bible / FreeShow scripture tab). Look up a verse and Send it to Program:
// it fires a SCRIPTURE layer that composites OVER the live slide (the sermon point
// stays under the reading), and Clear drops just that layer. KJV verses are bundled
// (public domain) so it works offline. Plajah language, gold = scripture.

import React, { useState } from 'react';
import { X, MonitorUp, Eraser } from 'lucide-react';

export interface ScriptureCue {
  refId: string;
  reference: string;
  translation: string;
  lines: string[];
}

interface AmboScriptureDockProps {
  scriptureLive: boolean;
  onFire: (cue: ScriptureCue) => void;
  onClear: () => void;
  onClose: () => void;
}

const GOLD = '#E3C57E';
const ORANGE = '#FF8C00';
const line = 'rgba(255,255,255,0.09)';
const glass = 'rgba(255,255,255,0.04)';

// Luke 15 (KJV, public domain) — the reading behind the demo sermon.
const VERSES: Array<{ n: number; text: string }> = [
  { n: 17, text: 'And when he came to himself, he said, How many hired servants of my father’s have bread enough and to spare, and I perish with hunger!' },
  { n: 18, text: 'I will arise and go to my father, and will say unto him, Father, I have sinned against heaven, and before thee,' },
  { n: 19, text: 'And am no more worthy to be called thy son: make me as one of thy hired servants.' },
  { n: 20, text: 'And he arose, and came to his father. But when he was yet a great way off, his father saw him, and had compassion, and ran, and fell on his neck, and kissed him.' },
  { n: 21, text: 'And the son said unto him, Father, I have sinned against heaven, and in thy sight, and am no more worthy to be called thy son.' },
  { n: 22, text: 'But the father said to his servants, Bring forth the best robe, and put it on him; and put a ring on his hand, and shoes on his feet:' },
  { n: 24, text: 'For this my son was dead, and is alive again; he was lost, and is found. And they began to be merry.' },
];

const AmboScriptureDock: React.FC<AmboScriptureDockProps> = ({ scriptureLive, onFire, onClear, onClose }) => {
  const [sel, setSel] = useState(20);
  const verse = VERSES.find(v => v.n === sel) ?? VERSES[3];

  const fire = () => onFire({
    refId: `luke.15.${verse.n}`,
    reference: `Luke 15:${verse.n}`,
    translation: 'KJV',
    lines: [verse.text],
  });

  return (
    <div className="fixed inset-0 z-[125] flex justify-end">
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <aside className="w-[340px] max-w-[86vw] h-full flex flex-col border-l backdrop-blur-xl" style={{ borderColor: line, background: 'rgba(10,7,17,0.92)' }}>
        <header className="flex items-center gap-2 px-4 py-3 border-b flex-none" style={{ borderColor: line }}>
          <span style={{ color: GOLD }}>✦</span>
          <span className="font-semibold tracking-tight">Scripture</span>
          <span className="font-mono text-[10px] text-white/40 ml-1">KJV</span>
          <div className="flex-1" />
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/5"><X size={16} /></button>
        </header>

        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: line }}>
          <div className="flex items-center gap-2 flex-1 px-3 h-10 rounded-lg" style={{ background: glass, border: `1px solid ${line}` }}>
            <span style={{ color: GOLD }}>✦</span>
            <span className="font-semibold" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}>Luke 15:{verse.n}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {VERSES.map(v => (
            <button key={v.n} onClick={() => setSel(v.n)}
              className="w-full text-left px-3 py-2.5 rounded-lg flex gap-2.5 transition-colors"
              style={{ background: v.n === sel ? 'rgba(227,197,126,0.12)' : 'transparent', boxShadow: v.n === sel ? `inset 3px 0 0 ${GOLD}` : undefined }}>
              <span className="font-mono text-[11px] flex-none pt-0.5" style={{ color: GOLD, opacity: 0.85 }}>{v.n}</span>
              <span className="text-[13px] leading-snug" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', color: v.n === sel ? '#fff' : 'rgba(255,255,255,0.7)' }}>{v.text}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t flex flex-col gap-2 flex-none" style={{ borderColor: line }}>
          {scriptureLive && (
            <div className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md" style={{ color: ORANGE, background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ORANGE }} /> Scripture is live over the slide
            </div>
          )}
          <button onClick={fire} className="h-10 rounded-lg text-white font-bold text-[13px] inline-flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)', boxShadow: '0 0 20px rgba(255,140,0,0.28)' }}>
            <MonitorUp size={15} /> Send to Program
          </button>
          <button onClick={onClear} disabled={!scriptureLive} className="h-9 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 border disabled:opacity-40" style={{ borderColor: line, background: glass, color: 'rgba(255,255,255,0.8)' }}>
            <Eraser size={14} /> Clear scripture
          </button>
          <p className="text-[10.5px] text-white/40 text-center leading-snug mt-0.5">Composites over the live slide — the sermon point stays visible under the verse, like ProPresenter / FreeShow.</p>
        </div>
      </aside>
    </div>
  );
};

export default AmboScriptureDock;
