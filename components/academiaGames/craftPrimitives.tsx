/**
 * Handmade Craft Design System Primitives for Plajah Academia & Elevate Games.
 *
 * Built straight from the approved 7-plate handmade lookbook:
 *  - Deckle-edge cotton-rag archival paper cards (real SVG turbulence edge displacement)
 *  - Carved twine-bound cedarwood letter tiles
 *  - Hand-stitched linen cloth tabs
 *  - Embossed terracotta / crimson / gold wax seals
 *  - Milled-brass Vernier scale sliders
 */

import React, { useState } from 'react';
import { useLivingAnim } from './useLivingAnim';

/** Mount once inside the shell so every DecklePaperCard shares the physical torn-paper filter. */
export const CraftSvgFilters: React.FC = () => (
  <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
    <defs>
      <filter id="plajahDeckleEdge" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="14" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.0" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
);

interface DecklePaperCardProps {
  children: React.ReactNode;
  className?: string;
  copperplate?: boolean;
  darkInk?: boolean;
  tone?: 'cream' | 'linen' | 'parchment';
  /** Keep text sharp by applying deckle edge only to the paper backing layer! */
  style?: React.CSSProperties;
}

export const DecklePaperCard: React.FC<DecklePaperCardProps> = ({
  children,
  className = '',
  copperplate = false,
  tone = 'cream',
  style,
}) => {
  const bgMap = {
    cream: '#F5ECDC',
    linen: '#EFE5D1',
    parchment: '#EBE0CA',
  };
  return (
    <div className={`relative ${className}`} style={style}>
      {/* Torn physical cotton-rag backing layer (deckle filter applied ONLY here so text stays razor sharp!) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[4px] pointer-events-none"
        style={{
          background: bgMap[tone],
          border: '1.5px solid #B59C78',
          boxShadow: '0 8px 24px rgba(24, 17, 11, 0.28), inset 0 1px 0 rgba(255,252,244,0.7)',
          filter: 'url(#plajahDeckleEdge)',
        }}
      />
      {copperplate && (
        <div
          aria-hidden="true"
          className="absolute inset-[7px] rounded-[2px] pointer-events-none"
          style={{ border: '1px solid rgba(92, 70, 48, 0.34)' }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

interface CarvedWoodTileProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  reducedMotion?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

export const CarvedWoodTile: React.FC<CarvedWoodTileProps> = ({
  label,
  selected = false,
  disabled = false,
  reducedMotion = false,
  onClick,
  ariaLabel,
}) => {
  const [tapCount, setTapCount] = useState(0);
  const animRef = useLivingAnim<HTMLButtonElement>(
    `wood-tile-${label}`,
    tapCount > 0 ? { preset: 'jelly', amount: 0.75, durationMs: 420 } : null,
    reducedMotion,
    tapCount,
  );

  return (
    <button
      ref={animRef}
      type="button"
      disabled={disabled}
      onClick={() => {
        setTapCount(c => c + 1);
        onClick();
      }}
      aria-pressed={selected}
      aria-label={ariaLabel ?? `Wooden tile ${label}`}
      className="relative group min-w-[54px] h-[56px] px-3 rounded-[8px] font-serif text-[22px] font-bold tracking-wide transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 disabled:opacity-45 cursor-pointer"
      style={{
        background: selected
          ? 'linear-gradient(155deg, #F6DDA2 0%, #DCA955 55%, #C48A34 100%)'
          : 'linear-gradient(155deg, #E2C59B 0%, #C69E6B 60%, #A97E4C 100%)',
        color: '#3A2618',
        border: selected ? '2px solid #7C4F1D' : '2px solid #6E4B2E',
        boxShadow: selected
          ? '0 0 18px rgba(247, 206, 114, 0.65), inset 0 1px 0 rgba(255,250,235,0.65), 0 4px 10px rgba(32,20,10,0.35)'
          : 'inset 0 1px 0 rgba(255,244,222,0.5), inset 0 -2px 0 rgba(72,44,22,0.3), 0 4px 10px rgba(32,20,10,0.32)',
        fontFamily: 'Georgia, "Palatino Linotype", serif',
      }}
    >
      {/* Hand-lashed twine corner accents straight from Plate 1 */}
      <span aria-hidden="true" className="absolute top-[3px] left-[3px] w-2 h-2 border-t-2 border-l-2 border-[#6B4E34]/60 rounded-tl-[2px]" />
      <span aria-hidden="true" className="absolute bottom-[3px] right-[3px] w-2 h-2 border-b-2 border-r-2 border-[#6B4E34]/60 rounded-br-[2px]" />
      <span className="relative z-10">{label}</span>
    </button>
  );
};

interface StitchedClothButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: 'linen' | 'sage' | 'terracotta' | 'indigo';
  className?: string;
  ariaLabel?: string;
}

export const StitchedClothButton: React.FC<StitchedClothButtonProps> = ({
  children,
  onClick,
  active = false,
  tone = 'linen',
  className = '',
  ariaLabel,
}) => {
  const styles: Record<string, { bg: string; ink: string; stitch: string; border: string }> = {
    linen: { bg: '#EFE4CE', ink: '#3B2B1E', stitch: 'rgba(104, 78, 52, 0.52)', border: '#B49B76' },
    sage: { bg: '#4E6E56', ink: '#FBF5E8', stitch: 'rgba(246, 239, 226, 0.45)', border: '#38523F' },
    terracotta: { bg: '#B95E42', ink: '#FBF5E8', stitch: 'rgba(246, 239, 226, 0.48)', border: '#8E432C' },
    indigo: { bg: '#2B3A55', ink: '#F5ECDC', stitch: 'rgba(236, 224, 200, 0.45)', border: '#1B2639' },
  };
  const s = styles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-[6px] text-[13px] font-semibold transition-transform duration-150 active:scale-[0.97] cursor-pointer ${className}`}
      style={{
        background: s.bg,
        color: s.ink,
        border: `1.5px solid ${active ? '#C6923A' : s.border}`,
        boxShadow: active ? '0 0 0 2px rgba(198,146,58,0.45), 0 4px 12px rgba(24,16,10,0.22)' : '0 3px 10px rgba(24,16,10,0.2)',
        fontFamily: 'Georgia, "Palatino Linotype", serif',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-[3px] rounded-[3px] pointer-events-none"
        style={{ border: `1px dashed ${s.stitch}` }}
      />
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
};

interface WaxSealBadgeProps {
  label: string;
  color?: 'crimson' | 'terracotta' | 'gold' | 'emerald';
}

export const WaxSealBadge: React.FC<WaxSealBadgeProps> = ({ label, color = 'crimson' }) => {
  const palette = {
    crimson: { bg: 'radial-gradient(circle at 35% 30%, #C64E3E, #8B2B20 75%)', rim: '#691D15', ink: '#FCEFD8' },
    terracotta: { bg: 'radial-gradient(circle at 35% 30%, #D97A50, #A44B2A 75%)', rim: '#78341B', ink: '#FEF4E4' },
    gold: { bg: 'radial-gradient(circle at 35% 30%, #E7BF68, #AF812D 75%)', rim: '#825C1B', ink: '#3B2810' },
    emerald: { bg: 'radial-gradient(circle at 35% 30%, #4E9D7D, #28624B 75%)', rim: '#1B4635', ink: '#F4F1E6' },
  }[color];

  return (
    <span
      className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[11px] font-bold tracking-wider uppercase shrink-0"
      style={{
        background: palette.bg,
        color: palette.ink,
        border: `2px solid ${palette.rim}`,
        boxShadow: 'inset 0 1px 2px rgba(255,248,228,0.4), 0 3px 8px rgba(20,12,8,0.35)',
        fontFamily: 'Georgia, serif',
      }}
    >
      {label}
    </span>
  );
};

interface BrassVernierSliderProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  ok?: boolean;
  dark?: boolean;
}

export const BrassVernierSlider: React.FC<BrassVernierSliderProps> = ({
  label,
  valueLabel,
  min,
  max,
  step = 1,
  value,
  onChange,
  ok,
  dark = false,
}) => (
  <label
    className="block px-3 py-2 rounded-[6px]"
    style={{
      background: dark ? 'rgba(30, 22, 17, 0.85)' : 'rgba(235, 222, 198, 0.82)',
      border: `1.5px solid ${ok ? '#4E8A7E' : '#A9874E'}`,
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)',
    }}
  >
    <div className="flex items-center justify-between text-[12px] mb-1">
      <span
        className="font-semibold"
        style={{ color: dark ? '#EFE5D1' : '#35261A', fontFamily: 'Georgia, serif' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[12px] px-1.5 py-0.5 rounded"
        style={{
          background: ok ? 'rgba(78,138,126,0.22)' : 'rgba(198,146,58,0.18)',
          color: dark ? '#F5DFAA' : ok ? '#245B4F' : '#5F431B',
        }}
      >
        {valueLabel}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full cursor-pointer accent-[#B98632]"
    />
  </label>
);
