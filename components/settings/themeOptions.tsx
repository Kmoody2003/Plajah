import React from 'react';
import { Check } from 'lucide-react';
import type { ThemeType } from '../../types';

/** The pickable interface themes (Settings → Appearance and the own-profile swatch row). */
export const THEME_OPTIONS: { id: ThemeType; label: string; bg: string; text: string }[] = [
  { id: 'DARK',     label: 'Dark',    bg: '#020202',             text: '#ffffff' },
  { id: 'LIGHT',    label: 'Light',   bg: '#f8fafc',             text: '#0f172a' },
  { id: 'PLAJAH',   label: 'Plajah',  bg: 'linear-gradient(135deg,#6B0099,#FF8C00)', text: '#ffffff' },
  { id: 'ETHEREAL', label: 'Ethereal',bg: '#131314',             text: '#e5e2e3' },
  { id: 'NEBULA',   label: 'Nebula',  bg: 'linear-gradient(135deg,#050510,#1a1a3e)', text: '#ffffff' },
  { id: 'CITRUS',   label: 'Citrus',  bg: 'linear-gradient(135deg,#0f0500,#FF3B00)', text: '#ffffff' },
  { id: 'PASTEL',   label: 'Pastel',  bg: '#fdf6e3',             text: '#2aa198' },
];

/** Compact row of round theme swatches — one tap switches the interface theme. */
export const ThemeSwatchRow: React.FC<{ current?: ThemeType; onPick: (t: ThemeType) => void }> = ({ current, onPick }) => (
  <div className="w-full flex flex-col items-center gap-1.5 py-1">
    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Theme</span>
    <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Interface theme">
      {THEME_OPTIONS.map(t => {
        const on = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={t.label}
            aria-label={t.label}
            onClick={() => onPick(t.id)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${on ? 'border-small-orange scale-110' : 'border-white/20 hover:border-white/50'}`}
            style={{ background: t.bg }}
          >
            {on && <Check size={10} style={{ color: t.text }} />}
          </button>
        );
      })}
    </div>
  </div>
);
