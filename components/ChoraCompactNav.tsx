// ChoraCompactNav — the adaptive navigation surfaces for compact desktop + touch tablets.
//
//   • ChoraNavBar   — Concept C: a horizontal top bar (scrollable page chips + create) that
//                     replaces the vertical pillar on touch tablets / portrait. Fixed-position
//                     chrome, so it doesn't disturb the app's flex shell.
//   • ChoraAddPillar— Concept B: a slim create/"add" pillar docked to the RIGHT edge.
//   • NavLayoutSwitcher — the user's control: Auto (A↔C responsive) · Rail · Bar · Split.
//
// All page data (icon + label + id) is passed in by App.tsx so this stays the single source
// of truth for the primary destinations without duplicating the full sidebar config.

import React, { useRef } from 'react';
import {
  Plus, MoreHorizontal, Upload, Radio as RadioIcon,
  Wand2, PanelLeft, PanelTop, Columns2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canUpload, canGoLive } from '../services/tvCapabilities';
import type { NavLayoutPref } from '../hooks/useNavLayout';

export interface NavPage { id: string; label: string; icon: LucideIcon; }

// ── Concept C: horizontal top bar ───────────────────────────────────────────
export function ChoraNavBar({
  pages, activeView, onNavigate, onMore, onCreate, switcher,
}: {
  pages: NavPage[];
  activeView: string;
  onNavigate: (id: string) => void;
  onMore: () => void;
  onCreate: () => void;
  switcher?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nudge = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[140] flex items-center gap-2 px-3 glass-high border-b border-white/[0.08]"
      // Add the safe-area inset ON TOP of the 56px bar (not into it), so the row stays centered.
      style={{ height: 'calc(3.5rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
      aria-label="Primary"
    >
      {/* Logo */}
      <div className="w-9 h-9 rounded-xl bg-small-orange/90 flex items-center justify-center shrink-0 shadow-lg">
        <span className="font-display font-black text-white text-lg leading-none">P</span>
      </div>

      <button onClick={() => nudge(-1)} aria-label="Scroll left"
        className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors">
        <ChevronLeft size={16} />
      </button>

      {/* Scrollable page chips */}
      <div ref={scrollRef} className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth min-w-0">
        {pages.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`shrink-0 flex items-center gap-2 h-10 px-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors ${
                active ? 'bg-small-orange/20 text-small-orange ring-1 ring-small-orange/40'
                       : 'text-white/55 hover:text-white bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
        <button onClick={onMore}
          className="shrink-0 flex items-center gap-2 h-10 px-3.5 rounded-full text-[11px] font-black uppercase tracking-widest text-white/45 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
          <MoreHorizontal size={15} /> <span>More</span>
        </button>
      </div>

      <button onClick={() => nudge(1)} aria-label="Scroll right"
        className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors">
        <ChevronRight size={16} />
      </button>

      {switcher}

      {/* Create */}
      <button onClick={onCreate} aria-label="Create"
        className="shrink-0 w-10 h-10 rounded-full bg-small-orange text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg">
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </nav>
  );
}

// ── Concept B: right-edge create / "add" pillar ─────────────────────────────
export function ChoraAddPillar({
  onCreate, onUpload, onGoLive,
}: {
  onCreate: () => void;
  onUpload?: () => void;
  onGoLive?: () => void;
}) {
  return (
    <aside
      className="hidden lg:flex fixed right-0 top-0 bottom-0 z-40 w-16 flex-col items-center justify-center gap-3 glass-high border-l border-white/[0.08]"
      aria-label="Create"
    >
      {/* Create/upload/go-live are all creation. A TV is for consumption — see tvCapabilities. */}
      {canUpload() && (
        <button onClick={onCreate} aria-label="Create"
          className="w-11 h-11 rounded-2xl bg-small-orange text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg">
          <Plus size={20} strokeWidth={2.5} />
        </button>
      )}
      {onUpload && canUpload() && (
        <button onClick={onUpload} aria-label="Upload" title="Upload"
          className="w-11 h-11 rounded-2xl bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.1] flex items-center justify-center transition-colors">
          <Upload size={18} />
        </button>
      )}
      {onGoLive && canGoLive() && (
        <button onClick={onGoLive} aria-label="Go live" title="Go live"
          className="w-11 h-11 rounded-2xl bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.1] flex items-center justify-center transition-colors">
          <RadioIcon size={18} />
        </button>
      )}
    </aside>
  );
}

// ── The user's control: layout switcher ─────────────────────────────────────
const SWITCHER_OPTIONS: { pref: NavLayoutPref; icon: LucideIcon; label: string }[] = [
  { pref: 'auto',  icon: Wand2,    label: 'Auto (responsive)' },
  { pref: 'rail',  icon: PanelLeft, label: 'Side rail' },
  { pref: 'bar',   icon: PanelTop,  label: 'Top bar' },
  { pref: 'split', icon: Columns2,  label: 'Split pillars' },
];

export function NavLayoutSwitcher({
  pref, onSetPref, compact,
}: {
  pref: NavLayoutPref;
  onSetPref: (p: NavLayoutPref) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'p-1 rounded-xl bg-white/[0.04]'}`} role="group" aria-label="Navigation layout">
      {SWITCHER_OPTIONS.map(({ pref: p, icon: Icon, label }) => (
        <button
          key={p}
          onClick={() => onSetPref(p)}
          title={label}
          aria-label={label}
          aria-pressed={pref === p}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
            pref === p ? 'bg-small-orange text-black' : 'text-white/35 hover:text-white/80 hover:bg-white/[0.08]'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
