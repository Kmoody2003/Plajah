// AmboStageDisplay — the confidence monitor for the person on stage. Chrome-free,
// high-contrast, large type: the current slide big, the next slide small, a wall
// clock + service timer, and the speaker's private stage notes (Slide.stageNotes,
// which never air). Rendered as a sub-view of AmboProPresenter so it mirrors the
// real live/next slides rather than a copy. Plajah design language.

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Slide } from '../../services/ambo/showModel';
import { slideText } from '../../services/ambo/servicePlanDemo';

interface AmboStageDisplayProps {
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  /** Service elapsed seconds, for the timer readout. */
  elapsedSec: number;
  live: boolean;
  onClose: () => void;
}

const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const GOLD = '#E3C57E';
const MAGENTA = '#D40055';

const two = (n: number) => String(n).padStart(2, '0');

const AmboStageDisplay: React.FC<AmboStageDisplayProps> = ({ currentSlide, nextSlide, elapsedSec, live, onClose }) => {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const timer = `${two(Math.floor(elapsedSec / 60))}:${two(elapsedSec % 60)}`;

  return (
    <div className="fixed inset-0 z-[130] p-5 sm:p-6" style={{ background: '#050409' }}>
      <div className="h-full grid gap-4 sm:gap-5" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,0.9fr)', gridTemplateRows: 'auto 1fr auto' }}>
        {/* clock row */}
        <div className="flex items-center gap-5 flex-wrap" style={{ gridColumn: '1 / -1' }}>
          <span className="font-mono tabular-nums font-semibold text-white leading-none" style={{ fontSize: 'clamp(34px,7vw,74px)' }}>{clock}</span>
          <div className="flex flex-col leading-none">
            <span className="font-mono font-bold leading-none" style={{ fontSize: 'clamp(22px,4vw,42px)', color: ORANGE }}>{timer}</span>
            <span className="text-[11px] tracking-[0.16em] uppercase text-white/40 mt-1.5">Service · elapsed</span>
          </div>
          <div className="flex-1" />
          {live && (
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] text-white border" style={{ background: 'rgba(255,140,0,0.16)', borderColor: 'rgba(255,140,0,0.5)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: ORANGE }} /> On Air
            </span>
          )}
          <button onClick={onClose} className="w-10 h-10 grid place-items-center rounded-full border text-white/60 hover:text-white hover:bg-white/5" style={{ borderColor: 'rgba(255,255,255,0.12)' }} title="Close stage display">
            <X size={18} />
          </button>
        </div>

        {/* current (big) */}
        <div className="relative rounded-2xl overflow-hidden border flex flex-col" style={{ gridRow: 2, borderColor: 'rgba(255,255,255,0.14)', background: '#000' }}>
          <span className="absolute top-3 left-3.5 z-10 text-[11px] font-extrabold tracking-[0.14em] text-white/40">CURRENT</span>
          <div className="flex-1 grid place-items-center text-center px-[5%]" style={{ background: 'linear-gradient(135deg,#1a0b2e,#06121f)' }}>
            <div>
              <div className="font-bold text-white leading-tight" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', fontSize: 'clamp(24px,3.6vw,44px)', textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
                {currentSlide ? slideText(currentSlide) : 'Cleared'}
              </div>
              {currentSlide?.group && (
                <div className="mt-3 font-mono text-[12px] tracking-[0.16em] uppercase" style={{ color: GOLD }}>{currentSlide.group}</div>
              )}
            </div>
          </div>
        </div>

        {/* side: next + notes */}
        <div className="flex flex-col gap-4 min-h-0" style={{ gridRow: 2 }}>
          <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,218,243,0.4)' }}>
            <span className="absolute top-2 left-2.5 z-10 text-[10px] font-extrabold tracking-[0.14em]" style={{ color: CYAN }}>NEXT</span>
            <div className="aspect-video grid place-items-center text-center px-4" style={{ background: 'linear-gradient(135deg,#160a26,#06121f)' }}>
              <span className="font-semibold text-white leading-tight" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', fontSize: 'clamp(15px,2.2vw,22px)' }}>
                {nextSlide ? slideText(nextSlide) : '—'}
              </span>
            </div>
          </div>
          <div className="flex-1 rounded-xl border p-4 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-white/40 mb-2.5">Speaker notes</div>
            {currentSlide?.stageNotes ? (
              <p className="leading-relaxed" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', fontSize: 'clamp(15px,1.7vw,19px)', color: '#E6E1F0' }}>{currentSlide.stageNotes}</p>
            ) : (
              <p className="text-white/40 text-[14px]">No notes on this slide.</p>
            )}
          </div>
        </div>

        {/* booth message */}
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ gridColumn: '1 / -1', background: 'rgba(212,0,85,0.12)', borderColor: 'rgba(212,0,85,0.4)' }}>
          <span className="inline-flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase flex-none" style={{ color: MAGENTA }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: MAGENTA }} /> From booth
          </span>
          <span className="font-semibold text-white" style={{ fontSize: 'clamp(15px,1.8vw,20px)' }}>Five minutes — begin wrapping toward the response.</span>
        </div>
      </div>
    </div>
  );
};

export default AmboStageDisplay;
