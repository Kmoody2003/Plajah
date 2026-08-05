// ChoraQualityButton — lets a listener choose their Chora audio-quality tier
// (Data-saver / High / Lossless). Reads + writes the persisted preference via
// choraStreamService; setQuality fires a `chora:quality-changed` event that the
// GlobalPlayerContext uses to live-switch the currently-playing track.
//
// Self-contained (no player context needed) so it can drop into any surface —
// the expanded PlayerView header, a settings sheet, the mini player, etc.

import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Gauge, Sparkles, Check } from 'lucide-react';
import { getQuality, setQuality, type ChoraQuality } from '../services/choraStreamService';

const TIERS: { id: ChoraQuality; label: string; sub: string; icon: React.ReactNode; badge: string }[] = [
  { id: 'data',     label: 'Data Saver', sub: 'AAC ~96 kbps · lightest on mobile data', icon: <Gauge size={15} />,      badge: 'DATA' },
  { id: 'high',     label: 'High',       sub: 'AAC-LC 256 · adaptive HLS (recommended)', icon: <AudioLines size={15} />, badge: 'HIGH' },
  { id: 'lossless', label: 'Lossless',   sub: 'FLAC · bit-perfect, Wi-Fi recommended',   icon: <Sparkles size={15} />,  badge: 'HIFI' },
];

interface Props {
  /** Extra classes for the trigger button (position/spacing at the call site). */
  className?: string;
  /** 'icon' = compact icon-only trigger (default), 'full' = icon + current-tier label. */
  variant?: 'icon' | 'full';
}

export default function ChoraQualityButton({ className = '', variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  const [quality, setQualityState] = useState<ChoraQuality>('high');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Initialise from the persisted preference, and stay in sync if another surface changes it.
  useEffect(() => {
    setQualityState(getQuality());
    const sync = () => setQualityState(getQuality());
    window.addEventListener('chora:quality-changed', sync);
    return () => window.removeEventListener('chora:quality-changed', sync);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = TIERS.find(t => t.id === quality) ?? TIERS[1];

  const choose = (q: ChoraQuality) => {
    setQuality(q);          // persists + dispatches chora:quality-changed (player live-switches)
    setQualityState(q);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Audio quality: ${current.label}`}
        title={`Audio quality — ${current.label}`}
        className={`flex items-center gap-1.5 text-white/40 hover:text-white transition-all active:scale-95 ${className}`}
      >
        {current.icon}
        {variant === 'full' && (
          <span className="text-[10px] font-black uppercase tracking-widest">{current.badge}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-[#161616] border border-white/10 shadow-2xl overflow-hidden z-[60] animate-in fade-in duration-150">
          <div className="px-4 pt-3 pb-2 text-[8px] font-black uppercase tracking-[0.25em] text-white/30">Audio Quality</div>
          {TIERS.map(t => {
            const active = t.id === quality;
            return (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-small-orange/10' : 'hover:bg-white/5'}`}
              >
                <span className={active ? 'text-small-orange' : 'text-white/40'}>{t.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[11px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/70'}`}>{t.label}</span>
                  <span className="block text-[9px] text-white/35 truncate">{t.sub}</span>
                </span>
                {active && <Check size={14} className="text-small-orange shrink-0" />}
              </button>
            );
          })}
          <div className="px-4 py-2 border-t border-white/5 text-[8px] text-white/25 leading-relaxed">
            Applies instantly to the current track when a HiFi stream is ready; otherwise on the next track.
          </div>
        </div>
      )}
    </div>
  );
}
