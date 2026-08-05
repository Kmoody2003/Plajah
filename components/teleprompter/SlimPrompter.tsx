// SlimPrompter — a compact teleprompter for ad reads (Podcast Studio).
//
// The full Operator/Talent teleprompter is overkill for a host reading ad copy, so
// this is a slim, embeddable panel: paste the read, hit play, it auto-scrolls with
// a speed + size control. Shares the teleprompter's model/feel; no second window.

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Pencil, X, Minus, Plus, RotateCcw } from 'lucide-react';

const SlimPrompter: React.FC<{ initialText?: string; onClose?: () => void; title?: string }> = ({ initialText = '', onClose, title = 'Ad Read' }) => {
  const [text, setText] = useState(initialText || 'Paste your ad copy here…\n\nThis message is brought to you by our sponsor.');
  const [editing, setEditing] = useState(!initialText);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40);     // px/sec
  const [fontSize, setFontSize] = useState(26);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastRef.current = performance.now();
    const step = (t: number) => {
      const el = scrollRef.current;
      if (el) {
        const dt = (t - lastRef.current) / 1000;
        lastRef.current = t;
        el.scrollTop += speed * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setPlaying(false); return; }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  const reset = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setPlaying(false); };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0b0e] flex flex-col" style={{ fontFamily: 'system-ui' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.03]">
        <span className="text-[10px] font-black uppercase tracking-widest text-small-orange flex-1">📣 {title}</span>
        <button onClick={() => setEditing(e => !e)} title="Edit copy" className={`p-1.5 rounded-lg ${editing ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white'}`}><Pencil size={13} /></button>
        {onClose && <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white"><X size={14} /></button>}
      </div>

      {editing ? (
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
          className="w-full bg-transparent text-white text-sm p-3 outline-none resize-none placeholder:text-white/25"
          placeholder="Paste ad copy…" />
      ) : (
        <div ref={scrollRef} className="overflow-y-auto no-scrollbar px-5 py-6" style={{ height: 180 }}>
          <div className="whitespace-pre-wrap leading-relaxed text-white text-center" style={{ fontSize }}>
            {text}
          </div>
          <div style={{ height: 120 }} />
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
        <button onClick={() => { if (editing) setEditing(false); setPlaying(p => !p); }}
          className="w-9 h-9 rounded-full bg-small-orange text-black grid place-items-center hover:brightness-110 shrink-0">
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button onClick={reset} title="Reset" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/50 grid place-items-center hover:text-white shrink-0"><RotateCcw size={13} /></button>
        <div className="flex items-center gap-1 text-white/40">
          <span className="text-[8px] font-black uppercase tracking-widest">Speed</span>
          <button onClick={() => setSpeed(s => Math.max(10, s - 10))} className="p-1 hover:text-white"><Minus size={12} /></button>
          <span className="text-[10px] font-black text-white/70 w-6 text-center tabular-nums">{speed}</span>
          <button onClick={() => setSpeed(s => Math.min(160, s + 10))} className="p-1 hover:text-white"><Plus size={12} /></button>
        </div>
        <div className="flex items-center gap-1 text-white/40 ml-auto">
          <span className="text-[8px] font-black uppercase tracking-widest">Size</span>
          <button onClick={() => setFontSize(s => Math.max(16, s - 2))} className="p-1 hover:text-white"><Minus size={12} /></button>
          <button onClick={() => setFontSize(s => Math.min(56, s + 2))} className="p-1 hover:text-white"><Plus size={12} /></button>
        </div>
      </div>
    </div>
  );
};

export default SlimPrompter;
