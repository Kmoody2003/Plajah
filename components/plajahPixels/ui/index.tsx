// components/plajahPixels/ui — the Pixels control layer.
//
// Pixels had adopted none of the platform design system: 0 files importing
// components/ui, 162 raw <button> tags, 396 hardcoded hex values across 99
// distinct colours, 391 arbitrary text-[…] sizes. The most-used hex in the whole
// module was #ff8c00, 137 times — which IS --pj-orange. The module was not
// fighting the design system; it predates the control layer and never migrated.
//
// This file does NOT fork a second system. It re-exports the platform primitives
// and adds only the handful of parts a VJ surface needs that a general app does
// not: a work card, a channel indicator, a parameter row, a shelf header.
//
// Everything below consumes tokens. If you are typing a hex here, a token is
// missing — add it to styles/plajah-ds.css instead.

import React, { useEffect, useState } from 'react';
import { getShaderThumb, peekShaderThumb } from './shaderThumbs';

export { Button, IconButton, Surface, Actions, Eyebrow, Input, Chip } from '../../ui';

/* ── The six reactive channels ───────────────────────────────────────────────
   One source of truth for the band colours, ordered by frequency, matching the
   audio kit in engine/presets/signatureShaders.ts. These are data colours: they
   mean a specific band and nothing else, so they never decorate. */
export const PIX_BANDS: Record<string, { label: string; hz: string; color: string }> = {
  sub:   { label: 'Sub',   hz: '50–190 Hz',   color: '#F2545B' },
  low:   { label: 'Low',   hz: '380–820 Hz',  color: '#F49D37' },
  pres:  { label: 'Pres',  hz: '1.1–3.8 kHz', color: '#3FD9A4' },
  sib:   { label: 'Sib',   hz: '5–8 kHz',     color: '#4EA8DE' },
  air:   { label: 'Air',   hz: '11–17 kHz',   color: '#B892FF' },
  voice: { label: 'Voice', hz: 'lead',        color: '#FFCE5C' },
  hit:   { label: 'Hit',   hz: 'transient',   color: '#E4E7F0' },
};

/* ── Shelf ─────────────────────────────────────────────────────────────────── */

export const Shelf: React.FC<{ title: string; sub?: string; count?: number }> = ({ title, sub, count }) => (
  <div className="flex items-baseline gap-2 px-1 pt-3 pb-1.5">
    <span className="type-label-sm uppercase tracking-[0.14em] text-white/70 font-medium">{title}</span>
    {sub && <span className="type-label-sm uppercase tracking-[0.12em] text-white/30">{sub}</span>}
    {count !== undefined && <span className="ml-auto type-label-sm text-white/25 tabular-nums">{count}</span>}
  </div>
);

/* ── BandDots — which channels drive this work ─────────────────────────────── */

export const BandDots: React.FC<{ bands: string[]; live?: Record<string, number> }> = ({ bands, live }) => (
  <div className="flex items-center gap-[3px]" aria-hidden="true">
    {bands.map(b => {
      const meta = PIX_BANDS[b];
      if (!meta) return null;
      const e = live?.[b];
      return (
        <i
          key={b}
          title={`${meta.label} · ${meta.hz}`}
          style={{
            background: meta.color,
            opacity: e === undefined ? 0.85 : 0.3 + e * 0.7,
            boxShadow: e ? `0 0 ${Math.round(e * 8)}px ${meta.color}` : undefined,
          }}
          className="w-2.5 h-[3px] rounded-full transition-opacity duration-100"
        />
      );
    })}
  </div>
);

/* ── ReactivityMap — the thing that makes these shaders different ──────────── */

export const ReactivityMap: React.FC<{ rows: [string, string][]; live?: Record<string, number> }> = ({ rows, live }) => (
  <ul className="grid gap-1 m-0 p-0 list-none">
    {rows.map(([band, what]) => {
      const meta = PIX_BANDS[band];
      if (!meta) return null;
      const e = live?.[band];
      return (
        <li key={band} className="grid grid-cols-[8px_44px_1fr] gap-2 items-baseline">
          <i
            style={{ background: meta.color, opacity: e === undefined ? 0.8 : 0.3 + e * 0.7 }}
            className="w-2 h-2 rounded-full translate-y-[1px]"
          />
          <span className="type-label-sm uppercase tracking-[0.1em] text-white/35">{meta.label}</span>
          <span className="type-body-sm text-white/60 leading-snug">{what}</span>
        </li>
      );
    })}
  </ul>
);

/* ── ParamRow — replaces the ad-hoc range inputs scattered through the studio ─ */

export const ParamRow: React.FC<{
  label: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <label className={`flex items-center gap-3 h-8 ${disabled ? 'opacity-40' : ''}`}>
    <span className="type-label-sm uppercase tracking-[0.1em] text-white/40 flex-1 truncate">{label}</span>
    <input
      type="range" min={0} max={100} value={Math.round(value * 100)} disabled={disabled}
      onChange={e => onChange(Number(e.target.value) / 100)}
      className="pj-range w-24"
      aria-label={label}
    />
    <span className="type-label-sm text-white/30 w-7 text-right tabular-nums">{Math.round(value * 100)}</span>
  </label>
);

/* ── WorkCard — a shader you can actually see ──────────────────────────────── */

export interface WorkCardProps {
  name: string;
  /** Stable key for the still cache. */
  cacheKey: string;
  /** Full GLSL, used once to render the still. */
  src: string;
  meta?: string;
  bands?: string[];
  selected?: boolean;
  /** Picked but not yet committed to program — a softer ring than `selected`. */
  picked?: boolean;
  live?: Record<string, number>;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export const WorkCard: React.FC<WorkCardProps> = ({
  name, cacheKey, src, meta, bands, selected, picked, live, onClick, onDoubleClick,
}) => {
  const [thumb, setThumb] = useState<string | null>(() => peekShaderThumb(cacheKey));

  // Queue the still on mount. The renderer does one per animation frame, which
  // is what stops ninety-five compiles becoming a stall — so visibility is not
  // what has to gate this, and gating on it was actively wrong: a draggable
  // panel can sit outside the viewport, and then IntersectionObserver never
  // fires and no card ever paints.
  useEffect(() => {
    if (thumb) return;
    let cancelled = false;
    getShaderThumb(cacheKey, src).then(url => { if (!cancelled && url) setThumb(url); });
    return () => { cancelled = true; };
  }, [cacheKey, src, thumb]);

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${meta ? `${name} — ${meta}` : name} · double-click to send to program`}
      className={[
        'group text-left rounded-card overflow-hidden transition-colors',
        'bg-white/[0.03] border',
        selected ? 'border-[var(--pj-orange)] shadow-[0_0_0_1px_var(--pj-orange)]'
          : picked ? 'border-[var(--pj-lilac)] shadow-[0_0_0_1px_var(--pj-lilac)]'
          : 'border-white/10 hover:border-white/25',
      ].join(' ')}
    >
      <span
        className="block aspect-video bg-black/60 bg-cover bg-center"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        {!thumb && (
          <span className="w-full h-full grid place-content-center">
            <span className="type-label-sm uppercase tracking-[0.14em] text-white/20">rendering</span>
          </span>
        )}
      </span>
      <span className="block px-2 pt-1.5 pb-2">
        <span className="block type-body-sm font-semibold text-white/90 truncate leading-tight">{name}</span>
        {meta && (
          <span className="block type-label-sm uppercase tracking-[0.1em] text-white/30 mt-0.5 truncate">{meta}</span>
        )}
        {bands && bands.length > 0 && (
          <span className="block mt-1.5"><BandDots bands={bands} live={live} /></span>
        )}
      </span>
    </button>
  );
};
