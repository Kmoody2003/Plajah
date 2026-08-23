// components/plajahPixels/ui/shell.tsx — the Pixels shell.
//
// Proposal 2. Pixels organised its controls twice, in two incompatible ways:
// an eight-tab settings flyout AND six draggable floating panels. Neither won,
// so you had to learn both and remember which things lived where — and the tell
// was that Shaders was a panel while Colours was a tab, with no principle behind
// the split. Meanwhile the three things that genuinely ARE different jobs were
// not a mode at all; they were overlapping booleans (showClipGrid, showTimeline).
//
// This file supplies the three parts that resolve that:
//
//   Depth      a three-rung ladder (Simple / Studio / Full). A DISPLAY FILTER,
//              never a feature gate — nothing is removed from the build, no
//              state is lost moving between rungs, and a project made at Full
//              opens at Full. The only thing a rung changes is how much of the
//              instrument is on screen at once.
//
//   Inspector  one right rail that shows properties of what is SELECTED. That
//              single rule replaces six floating panels: a panel does not have
//              to move its markup to dock here, because DraggablePanel portals
//              into it (see components/DraggablePanel.tsx).
//
//   ModeBar    Compose / Perform / Render promoted to the spine, as verbs.
//              "Stage / Deck / Timeline" names the furniture; a verb names what
//              you came to do, which is what lets someone pick correctly without
//              a manual.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════════════
   Depth
   ═══════════════════════════════════════════════════════════════════════════ */

export type Depth = 'simple' | 'studio' | 'full';

const DEPTH_ORDER: Record<Depth, number> = { simple: 0, studio: 1, full: 2 };
const DEPTH_KEY = 'plajah-pixels-depth-v1';

export const DEPTHS: { id: Depth; label: string; blurb: string }[] = [
  { id: 'simple', label: 'Simple', blurb: 'A work, your audio, full screen.' },
  { id: 'studio', label: 'Studio', blurb: 'Layers, the deck, blending, automation.' },
  { id: 'full',   label: 'Full',   blurb: 'GLSL, MIDI, matte, the render queue.' },
];

const DepthCtx = createContext<{ depth: Depth; setDepth: (d: Depth) => void }>({
  depth: 'studio', setDepth: () => {},
});

export const DepthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [depth, setDepthState] = useState<Depth>(() => {
    try {
      const v = localStorage.getItem(DEPTH_KEY) as Depth | null;
      return v && v in DEPTH_ORDER ? v : 'studio';
    } catch { return 'studio'; }
  });
  const setDepth = useCallback((d: Depth) => {
    setDepthState(d);
    try { localStorage.setItem(DEPTH_KEY, d); } catch { /* storage unavailable */ }
  }, []);
  const value = useMemo(() => ({ depth, setDepth }), [depth, setDepth]);
  return <DepthCtx.Provider value={value}>{children}</DepthCtx.Provider>;
};

export const useDepth = () => useContext(DepthCtx);

/** True when the current rung is at least `min`. */
export function useAtDepth(min: Depth): boolean {
  const { depth } = useDepth();
  return DEPTH_ORDER[depth] >= DEPTH_ORDER[min];
}

/**
 * Show children only from rung `min` upward.
 *
 * Deliberately renders nothing rather than hiding with CSS: a control that is
 * present but invisible still takes tab order and still reads to a screen
 * reader, which is the opposite of the point.
 */
export const AtDepth: React.FC<{ min: Depth; children: React.ReactNode }> = ({ min, children }) => (
  useAtDepth(min) ? <>{children}</> : null
);

/* ═══════════════════════════════════════════════════════════════════════════
   Mode
   ═══════════════════════════════════════════════════════════════════════════ */

export type PixMode = 'compose' | 'perform' | 'render';

export const MODES: { id: PixMode; label: string; glyph: string; blurb: string }[] = [
  { id: 'compose', label: 'Compose', glyph: '◱', blurb: 'Build one look and get it right.' },
  { id: 'perform', label: 'Perform', glyph: '▦', blurb: 'Play the deck against live audio.' },
  { id: 'render',  label: 'Render',  glyph: '⏱', blurb: 'Lay it on a timeline and export.' },
];

/**
 * What each mode means in terms of the surfaces the studio already has.
 *
 * The studio never had a mode: it had independent booleans that could be in any
 * of eight combinations, most of which are not a thing anyone wants. This maps
 * three named jobs onto them, so the combinations that make sense are the only
 * ones reachable from the bar.
 */
export function surfacesForMode(mode: PixMode): { deck: boolean; render: boolean } {
  switch (mode) {
    case 'compose': return { deck: false, render: false };
    case 'perform': return { deck: true,  render: false };
    case 'render':  return { deck: false, render: true  };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Inspector
   ═══════════════════════════════════════════════════════════════════════════ */

interface DockApi {
  /** Where docked panels portal to. Null until the Inspector has mounted. */
  el: HTMLElement | null;
  /** False when the Inspector is closed — panels then float as before. */
  docking: boolean;
}
const DockCtx = createContext<DockApi>({ el: null, docking: false });
export const useDock = () => useContext(DockCtx);

export const InspectorProvider: React.FC<{
  docking: boolean;
  el: HTMLElement | null;
  children: React.ReactNode;
}> = ({ docking, el, children }) => {
  const value = useMemo(() => ({ el, docking }), [el, docking]);
  return <DockCtx.Provider value={value}>{children}</DockCtx.Provider>;
};

export interface InspectorProps {
  /** What is selected right now — the inspector is always ABOUT something. */
  kind?: string;
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  /** Set by the studio; panels portal into this element. */
  dockRef: (el: HTMLDivElement | null) => void;
  /** Properties of what is selected, shown ABOVE the docked panels — an inspector leads with the
   *  selection and keeps the tabs beneath it. This is the mockup's whole right rail. */
  selection?: React.ReactNode;
  children?: React.ReactNode;
}

export const Inspector: React.FC<InspectorProps> = ({
  kind, title, subtitle, onClose, dockRef, selection, children,
}) => {
  return (
    <aside
      className="w-[320px] shrink-0 h-full flex flex-col bg-black/70 backdrop-blur-2xl border-l border-white/10"
      aria-label="Inspector"
    >
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="type-label-sm uppercase tracking-[0.14em]" style={{ color: 'var(--pj-orange)' }}>
              {kind || 'Nothing selected'}
            </p>
            <p className="type-title-md font-bold text-white truncate mt-0.5">{title || '—'}</p>
            {subtitle && <p className="type-body-sm text-white/40 leading-snug mt-1">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close inspector"
              className="w-6 h-6 grid place-content-center rounded-control text-white/30 hover:text-white hover:bg-white/10 transition-colors"
            >✕</button>
          )}
        </div>
      </div>

      {/* The selection leads; the docked panels follow. One scroll area over both so a long
          selection and a docked tab do not fight for height. */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {selection}
        <div ref={dockRef} />
      </div>

      {children}

    </aside>
  );
};

/** A titled block inside the inspector. */
export const InspectorGroup: React.FC<{
  label: string; aside?: React.ReactNode; children: React.ReactNode;
}> = ({ label, aside, children }) => (
  <section className="px-3 py-2.5 border-b border-white/[0.08]">
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="type-label-sm uppercase tracking-[0.14em] text-white/30">{label}</span>
      {aside && <span className="ml-auto type-label-sm text-white/25">{aside}</span>}
    </div>
    {children}
  </section>
);

/* ═══════════════════════════════════════════════════════════════════════════
   ModeBar
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The depth ladder.
 *
 * It rides the ModeBar rather than the Inspector: the platform's global player
 * bar overlays the bottom of the screen, which is exactly where it used to sit,
 * so half of it was unreachable. The spine is also the more honest home — depth
 * is a property of the whole view, like the mode, not of the selection.
 */
export const DepthLadder: React.FC = () => {
  const { depth, setDepth } = useDepth();
  return (
    <div className="flex gap-0.5 p-0.5 rounded-control bg-black/50" role="radiogroup" aria-label="Interface depth">
      {DEPTHS.map(d => {
        const on = depth === d.id;
        return (
          <button
            key={d.id}
            role="radio"
            aria-checked={on}
            onClick={() => setDepth(d.id)}
            title={d.blurb}
            className="h-7 px-2.5 rounded-control type-label-sm uppercase tracking-[0.1em] transition-colors"
            style={{
              background: on ? 'var(--pj-cyan)' : 'transparent',
              color: on ? '#04191C' : 'rgba(255,255,255,0.45)',
              fontWeight: on ? 600 : 400,
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
};

export interface ModeBarProps {
  mode: PixMode;
  onMode: (m: PixMode) => void;
  /** The look being worked on, and what it is doing. */
  lookName?: string;
  lookMode?: string;
  /** Standalone only — the platform supplies its own exit when embedded. */
  onExit?: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  /** Transport and anything else the studio wants inline. */
  children?: React.ReactNode;
}

export const ModeBar: React.FC<ModeBarProps> = ({
  mode, onMode, lookName, lookMode, onExit, inspectorOpen, onToggleInspector, children,
}) => (
  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/70 backdrop-blur-2xl border-b border-white/10">
    {onExit && (
      <button
        onClick={onExit}
        title="Leave Pixels"
        className="h-7 w-7 shrink-0 grid place-content-center rounded-control text-white/40 hover:text-white hover:bg-white/10 transition-colors"
      >
        <span aria-hidden="true">←</span><span className="sr-only">Exit Pixels</span>
      </button>
    )}
    <span className="flex items-baseline gap-2 pr-1 min-w-0 select-none">
      <span className="type-title-md font-extrabold tracking-tight text-white">Pixels</span>
      {lookName && (
        <span className="type-label-sm uppercase tracking-[0.12em] text-white/35 truncate hidden sm:inline">
          {lookName}{lookMode ? ' · ' + lookMode : ''}
        </span>
      )}
    </span>

    <div className="flex gap-0.5 p-0.5 rounded-control bg-black/50" role="tablist" aria-label="Mode">
      {MODES.map(m => {
        const on = mode === m.id;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={on}
            onClick={() => onMode(m.id)}
            title={m.blurb}
            className="h-7 px-3 rounded-control type-body-sm flex items-center gap-1.5 transition-colors"
            style={{
              background: on ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: on ? '#fff' : 'rgba(255,255,255,0.45)',
              fontWeight: on ? 600 : 400,
              boxShadow: on ? 'inset 0 0 0 1px rgba(255,255,255,0.14)' : undefined,
            }}
          >
            <span aria-hidden="true">{m.glyph}</span>{m.label}
          </button>
        );
      })}
    </div>

    {children}

    <span className="ml-auto flex items-center gap-2">
    <DepthLadder />

    <button
      onClick={onToggleInspector}
      aria-pressed={inspectorOpen}
      title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
      className="h-7 px-3 rounded-control type-body-sm border transition-colors"
      style={{
        background: inspectorOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
        borderColor: 'var(--pj-border, rgba(255,255,255,0.14))',
        color: inspectorOpen ? '#fff' : 'rgba(255,255,255,0.45)',
      }}
    >
      Inspector
    </button>
    </span>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   SettingsShell
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The settings tabs, rendered either into the Inspector or as the old sliding
 * overlay.
 *
 * Pixels rendered the same eight tabs in two places at once: this drawer, 384px
 * wide, sliding over the canvas you are trying to look at — and a compacted copy
 * inside the deck. Neither was authoritative, so you had to learn both. The
 * Inspector is the one place properties live, and these tabs are properties, so
 * this is where they belong.
 *
 * Same trick as DraggablePanel: swap the wrapper, never the children. Fifteen
 * hundred lines of controls move without a single one being edited.
 */
export const SettingsShell: React.FC<{
  docked: boolean;
  el: HTMLElement | null;
  children: React.ReactNode;
}> = ({ docked, el, children }) => {
  if (docked && el) {
    // A plain block, not a flex column: the Inspector owns the scrolling, so the
    // children's own flex-1/overflow rules resolve to natural height here.
    return createPortal(<div className="text-sm">{children}</div>, el);
  }
  return (
    <motion.div
      id="settings-drawer"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 180 }}
      className="absolute top-0 right-0 h-full w-96 bg-black/75 backdrop-blur-3xl border-l border-white/10 z-20 flex flex-col shadow-2xl overflow-hidden text-sm"
    >
      {children}
    </motion.div>
  );
};
