/**
 * ChipRail — the "Chip Rail" tab treatment from the Global Archive redesign:
 * one continuous machined glass rail (pj-surface--3 language, full radius)
 * holding chip tabs. Doors carry an always-visible service-color dot and ↗;
 * hover fills the chip with glass and edges it in the service color; the
 * active tab is the brand-gradient chip riding inside the rail.
 *
 * Platform primitive: the Global Archive row/dock and Chora's primary tabs
 * both render this — adopt opportunistically elsewhere (never fork the look).
 * Grounds and text ride DS variables so light/pastel themes flip correctly.
 */
import React from 'react';

export interface ChipRailItem {
  id: string;
  label: string;
  /** Service accent — renders the always-on dot + hover edge. Omit for neutral chips (e.g. sub-tabs within one service). */
  color?: string;
  /** Marks a tab that navigates away ("honest door") — renders the small ↗. */
  door?: boolean;
  /** Live-ish count rendered after the label (e.g. Live · 214). */
  count?: number;
  /** Optional leading icon (lucide element, size ~13). Rendered before the dot/label. */
  icon?: React.ReactNode;
}

interface ChipRailProps {
  items: ChipRailItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** sm = primary row (30px chips) · xs = condensed dock (26px chips). */
  size?: 'sm' | 'xs';
  className?: string;
}

const ChipRail: React.FC<ChipRailProps> = ({ items, activeId, onSelect, size = 'sm', className = '' }) => {
  const chipH = size === 'xs' ? 'h-[26px] px-2.5 text-[10px]' : 'h-[30px] px-3.5 text-[11px]';
  return (
    <div
      className={`inline-flex max-w-full items-center gap-[3px] p-[5px] rounded-full border overflow-x-auto no-scrollbar backdrop-blur-xl ${className}`}
      style={{ backgroundColor: 'var(--pj-glass-2, rgba(255,255,255,0.07))', borderColor: 'var(--pj-border-strong, rgba(255,255,255,0.15))' }}
      role="tablist"
    >
      {items.map(item => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.id)}
            style={{
              ['--tab-accent' as any]: item.color || 'var(--pj-orange, #FF8C00)',
              ...(active
                ? { backgroundImage: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff' }
                : { color: 'var(--text-primary, #fff)' }),
            }}
            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border font-bold tracking-[0.05em] transition-all ${chipH} ${
              active
                ? 'border-transparent font-black opacity-100'
                : 'border-transparent opacity-60 hover:opacity-100 hover:border-[var(--tab-accent)] hover:bg-[var(--pj-glass-3,rgba(255,255,255,0.10))]'
            }`}
          >
            {item.icon && <span className="shrink-0 inline-flex" aria-hidden="true">{item.icon}</span>}
            {item.color && (
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: active ? '#fff' : item.color }}
                aria-hidden="true"
              />
            )}
            {item.label}
            {item.door && <sup className="text-[0.6em] opacity-60" style={{ color: active ? '#fff' : item.color }} aria-hidden="true">↗</sup>}
            {item.count !== undefined && (
              <span className="font-mono text-[0.85em] font-bold" style={{ color: active ? '#fff' : 'var(--pj-success, #06D6A0)' }}>
                · {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ChipRail;
