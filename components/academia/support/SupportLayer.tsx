import React, { useEffect, useRef, useState } from 'react';
import { Accessibility, BookOpen, Coffee, Headphones, Minus, Moon, Palette, Type, Wind, X } from 'lucide-react';
import { useActiveSupports } from '../../../hooks/useLearningSupport';
import { syncOwnSupports, updateMySupports, type Supports } from '../../../services/learningSupport';
import { canReadAloud, readPassages, stopReading } from '../../../services/readAloud';
import BreathingPace from './BreathingPace';

/**
 * The learning-support layer, mounted once by App. It makes a learner's supports real across Academia:
 *   - root classes: calm (motion off everywhere), and on learning screens easier-to-read type, larger text, muted colour
 *   - quieter media: anything that starts playing on a learning screen is capped at a gentle volume
 *   - reading ruler: dims everything but a band of lines that follows the pointer, touch or keyboard focus
 *   - break reminders with a heads-up a minute before, and a breathing pacer
 *   - the Supports dock: every quick toggle one tap away, for anyone, no plan or diagnosis needed
 */
const CSS = `
html.pj-sup-calm *,html.pj-sup-calm *::before,html.pj-sup-calm *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
html.pj-sup-easy body,html.pj-sup-easy body :where(p,li,span,a,button,label,h1,h2,h3,h4,h5,h6,input,textarea,select,td,th,blockquote,figcaption,div){font-family:"Atkinson Hyperlegible",Verdana,sans-serif!important}
html.pj-sup-easy body{letter-spacing:.02em;word-spacing:.08em}
html.pj-sup-easy body :where(p,li){line-height:1.75!important}
html.pj-sup-lg body{zoom:1.1}
html.pj-sup-muted{filter:saturate(.62) contrast(.94)}
.pj-ruler{position:fixed;left:0;right:0;pointer-events:none;z-index:2400;background:rgba(0,0,0,.55)}
@media print{.pj-sup-ui{display:none!important}}
`;

let fontAdded = false;
function ensureFont() {
  if (fontAdded || typeof document === 'undefined') return; fontAdded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
  document.head.appendChild(l);
}

/** The reading ruler: two dim panes leave a clear band about three lines tall. */
const Ruler: React.FC = () => {
  const [y, setY] = useState<number>(() => (typeof window !== 'undefined' ? window.innerHeight / 2 : 300));
  useEffect(() => {
    const mv = (e: PointerEvent) => setY(e.clientY);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t) setY(t.clientY); };
    const fi = (e: FocusEvent) => { const r = (e.target as HTMLElement)?.getBoundingClientRect?.(); if (r) setY(r.top + r.height / 2); };
    window.addEventListener('pointermove', mv, { passive: true });
    window.addEventListener('touchmove', tm, { passive: true });
    window.addEventListener('focusin', fi);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('touchmove', tm); window.removeEventListener('focusin', fi); };
  }, []);
  const band = 84;
  return (
    <div aria-hidden="true" className="pj-sup-ui">
      <div className="pj-ruler" style={{ top: 0, height: Math.max(0, y - band / 2) }} />
      <div className="pj-ruler" style={{ top: y + band / 2, bottom: 0, borderTop: '2px solid rgba(0,218,243,.55)' }} />
    </div>
  );
};

/** Counts minutes on learning screens while the tab is visible; offers a break when it is due. */
function useBreakTimer(enabled: boolean, everyMin: number, warn: boolean) {
  const [due, setDue] = useState(false);
  const [heads, setHeads] = useState(false);
  const secs = useRef(0);
  useEffect(() => {
    if (!enabled || !everyMin) { setHeads(false); return; }
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || due) return;
      secs.current += 5;
      const left = everyMin * 60 - secs.current;
      if (warn && left <= 60 && left > 0) setHeads(true);
      if (left <= 0) { setHeads(false); setDue(true); }
    }, 5000);
    return () => clearInterval(t);
  }, [enabled, everyMin, warn, due]);
  const reset = (snoozeMin = 0) => { secs.current = snoozeMin ? everyMin * 60 - snoozeMin * 60 : 0; setDue(false); setHeads(false); };
  return { due, heads, reset, now: () => { setHeads(false); setDue(true); } };
}

interface Props { uid?: string | null; learning: boolean; onOpenCenter: () => void }

const SupportLayer: React.FC<Props> = ({ uid, learning, onOpenCenter }) => {
  const s = useActiveSupports();
  const [open, setOpen] = useState(false);
  const [breathe, setBreathe] = useState(false);
  const [note, setNote] = useState('');
  const brk = useBreakTimer(learning, s.breakEveryMin, s.transitionWarning);

  useEffect(() => { void syncOwnSupports(uid); }, [uid]);

  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle('pj-sup-calm', s.calm);
    c.toggle('pj-sup-easy', learning && s.easyRead);
    c.toggle('pj-sup-lg', learning && s.textSize === 2);
    c.toggle('pj-sup-muted', learning && s.mutedColor);
    if (s.easyRead) ensureFont();
  }, [s.calm, s.easyRead, s.textSize, s.mutedColor, learning]);

  useEffect(() => {
    if (!learning || !s.lowSound) return;
    const cap = (e: Event) => { const el = e.target as HTMLMediaElement; if (el && typeof el.volume === 'number' && el.volume > 0.4) el.volume = 0.4; };
    document.addEventListener('play', cap, true);
    return () => document.removeEventListener('play', cap, true);
  }, [learning, s.lowSound]);

  useEffect(() => () => stopReading(), []);

  const set = (patch: Partial<Supports>) => { void updateMySupports(patch); };
  const listenSelection = () => {
    const text = window.getSelection?.()?.toString().trim();
    if (!text) { setNote('Select some text first, or use Listen on any lesson.'); setTimeout(() => setNote(''), 3500); return; }
    void readPassages('selection', text.split(/\n{2,}/), { rate: s.readRate });
  };

  const showDock = learning;
  const Tog: React.FC<{ on: boolean; label: string; icon: React.ComponentType<{ size?: number }>; onClick: () => void }> = ({ on, label, icon: I, onClick }) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`min-h-[52px] rounded-2xl border px-3 py-2 text-left flex items-center gap-2.5 text-[13px] font-bold ${on ? 'bg-[#00DAF3]/15 border-[#00DAF3] text-white' : 'bg-white/[0.04] border-white/12 text-white/80 hover:border-white/30'}`}>
      <I size={17} /> <span className="leading-tight">{label}</span>
    </button>
  );

  return (
    <>
      <style>{CSS}</style>
      {learning && s.lineFocus && <Ruler />}

      {showDock && (
        <div className="pj-sup-ui fixed z-[2300] left-3 sm:left-5" style={{ bottom: 'max(84px, calc(env(safe-area-inset-bottom) + 84px))' }}>
          {open && (
            <div role="dialog" aria-label="Learning supports" className="mb-3 w-[min(92vw,340px)] rounded-3xl border border-white/15 bg-[#101018]/95 backdrop-blur p-4 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00DAF3]">Supports</p>
                  <p className="text-[12px] text-white/60">For anyone. Change them any time.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close supports" className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Tog on={s.easyRead} label="Easier to read" icon={Type} onClick={() => set({ easyRead: !s.easyRead })} />
                <Tog on={s.textSize === 2} label="Larger text" icon={BookOpen} onClick={() => set({ textSize: s.textSize === 2 ? 1 : 2 })} />
                <Tog on={s.lineFocus} label="Reading ruler" icon={Minus} onClick={() => set({ lineFocus: !s.lineFocus })} />
                <Tog on={s.calm} label="Calm visuals" icon={Moon} onClick={() => set({ calm: !s.calm })} />
                <Tog on={s.mutedColor} label="Softer colour" icon={Palette} onClick={() => set({ mutedColor: !s.mutedColor })} />
                <Tog on={s.readAloud} label="Listen buttons" icon={Headphones} onClick={() => set({ readAloud: !s.readAloud })} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {canReadAloud() && <button type="button" onClick={listenSelection} className="min-h-[44px] rounded-full border border-white/15 text-[12px] font-bold hover:bg-white/10 inline-flex items-center justify-center gap-1.5"><Headphones size={14} /> Read selection</button>}
                <button type="button" onClick={() => { setOpen(false); setBreathe(true); }} className="min-h-[44px] rounded-full border border-white/15 text-[12px] font-bold hover:bg-white/10 inline-flex items-center justify-center gap-1.5"><Wind size={14} /> Breathe</button>
                <button type="button" onClick={() => { setOpen(false); brk.now(); }} className="min-h-[44px] rounded-full border border-white/15 text-[12px] font-bold hover:bg-white/10 inline-flex items-center justify-center gap-1.5"><Coffee size={14} /> Take a break</button>
                <button type="button" onClick={() => { setOpen(false); onOpenCenter(); }} className="min-h-[44px] rounded-full bg-[#00DAF3] text-black text-[12px] font-black inline-flex items-center justify-center">All supports →</button>
              </div>
              {note && <p role="status" className="text-[12px] text-white/70 mt-2">{note}</p>}
            </div>
          )}
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Learning supports"
            className="w-12 h-12 rounded-full grid place-items-center bg-[#101018] border border-[#00DAF3]/60 text-[#00DAF3] shadow-[0_10px_30px_-8px_rgba(0,218,243,.5)] hover:bg-[#00DAF3]/15">
            <Accessibility size={22} />
          </button>
        </div>
      )}

      {brk.heads && !brk.due && (
        <div role="status" className="pj-sup-ui fixed z-[2300] left-1/2 -translate-x-1/2 top-4 rounded-full bg-[#101018] border border-[#FFB266]/60 text-white text-[13px] font-bold px-4 py-2.5 shadow-lg">
          About a minute until your break.
        </div>
      )}

      {(brk.due || breathe) && (
        <div className="pj-sup-ui fixed inset-0 z-[2500] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={breathe ? 'Breathing' : 'Break time'}>
          <div className="w-[min(94vw,420px)] rounded-[28px] border border-white/15 bg-[#0f0f17] p-6 text-white text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#00DAF3]">{breathe ? 'Breathe with me' : 'Brain break'}</p>
            <h2 className="text-[24px] font-black mt-1 mb-4" style={{ fontFamily: 'Outfit, system-ui' }}>{breathe ? 'Follow the circle' : 'Time to move and reset'}</h2>
            {breathe ? <BreathingPace calm={s.calm} /> : (
              <ul className="grid gap-2 text-left mb-1">
                {['Stand up and stretch tall, then reach for your toes', 'Get a drink of water', 'Squeeze and relax your hands five times', 'Look at something far away for 20 seconds'].map(t => (
                  <li key={t} className="rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 text-[14px]">{t}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {!breathe && <button type="button" onClick={() => { brk.reset(); setBreathe(true); }} className="min-h-[48px] px-4 rounded-full border border-white/20 text-[13px] font-bold hover:bg-white/10 inline-flex items-center gap-1.5"><Wind size={15} /> Breathe instead</button>}
              {!breathe && <button type="button" onClick={() => brk.reset(2)} className="min-h-[48px] px-4 rounded-full border border-white/20 text-[13px] font-bold hover:bg-white/10">2 more minutes</button>}
              <button type="button" onClick={() => { brk.reset(); setBreathe(false); }} className="min-h-[48px] px-5 rounded-full bg-[#00DAF3] text-black text-[13px] font-black">I&apos;m ready</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default SupportLayer;
