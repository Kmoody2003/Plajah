// TelaToolRail — Tela's left tool rail: named, collapsible sections of labeled tools. Labels can
// be hidden to give the canvas more room; section names stay and a tooltip still names each tool.
// One tab stop for the whole rail, arrow keys move inside it (the WAI-ARIA toolbar pattern).
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export interface TelaRailItem {
  id: string;
  label: string;
  /** Plain-language description of what the tool does. */
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Only list keys that are really wired for the current frame type. */
  shortcut?: string;
  /** Set for tools and panels that stay on; leave undefined for one-shot actions. */
  active?: boolean;
  disabled?: boolean;
}

export interface TelaRailSection {
  id: string;
  title: string;
  /** Fits the narrow rail (about 7 characters). */
  shortTitle: string;
  blurb: string;
  items: TelaRailItem[];
  defaultCollapsed?: boolean;
  /** Keeps the section open while it holds the running mode, whatever was saved. */
  forceOpen?: boolean;
}

const COMPACT_KEY = 'tela.rail.compact';
const COLLAPSED_KEY = 'tela.rail.collapsed';
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-[#00DAF3] focus-visible:ring-inset';

const readStored = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeStored = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private window: the choice lasts this session only */ }
};

interface TipState { title: string; desc: string; shortcut?: string; x: number; y: number }

export const TelaToolRail: React.FC<{ sections: TelaRailSection[] }> = ({ sections }) => {
  const uid = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLButtonElement | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);

  const [compact, setCompact] = useState(() => {
    const saved = readStored(COMPACT_KEY);
    return saved ? saved === '1' : window.innerWidth < 1024;
  });
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(readStored(COLLAPSED_KEY) || '{}'); } catch { return {}; }
  });
  const [tip, setTip] = useState<TipState | null>(null);

  const isCollapsed = (section: TelaRailSection) =>
    !section.forceOpen && (collapsedById[section.id] ?? !!section.defaultCollapsed);

  const toggleSection = (section: TelaRailSection) => {
    const next = { ...collapsedById, [section.id]: !isCollapsed(section) };
    setCollapsedById(next);
    writeStored(COLLAPSED_KEY, JSON.stringify(next));
  };

  const toggleCompact = () => {
    setTip(null);
    setCompact(value => { writeStored(COMPACT_KEY, value ? '0' : '1'); return !value; });
  };

  // Tools inside a collapsed section can't take focus, so they are not stops.
  const buttons = () => [...(railRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])].filter(button => !button.closest('[hidden]'));

  // Roving tabindex: the last focused button, else the running tool, is the rail's one tab stop.
  const syncTabStop = () => {
    const all = buttons();
    const stop = (lastFocused.current && all.includes(lastFocused.current) && lastFocused.current)
      || all.find(button => button.getAttribute('aria-pressed') === 'true' && !button.hasAttribute('data-rail-chrome'))
      || all[0];
    railRef.current?.querySelectorAll('button').forEach(button => { button.tabIndex = button === stop ? 0 : -1; });
  };
  useLayoutEffect(syncTabStop);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (event.key === 'Escape') { setTip(null); return; }
    if (!keys.includes(event.key)) return;
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || !all.length) return;
    event.preventDefault();
    const to = event.key === 'Home' ? 0
      : event.key === 'End' ? all.length - 1
      : (at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    all[to].focus();
  };

  const hideTip = useCallback(() => { window.clearTimeout(tipTimer.current); setTip(null); }, []);
  useEffect(() => hideTip, [hideTip]);

  const showTip = (event: React.SyntheticEvent<HTMLElement>, content: Omit<TipState, 'x' | 'y'>, delay: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    const place = () => setTip({ ...content, x: box.right + 8, y: box.top + box.height / 2 });
    window.clearTimeout(tipTimer.current);
    if (delay) tipTimer.current = window.setTimeout(place, delay); else place();
  };

  const tipProps = (content: Omit<TipState, 'x' | 'y'>) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => showTip(event, content, 350),
    onMouseLeave: hideTip,
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      lastFocused.current = event.currentTarget;
      syncTabStop();
      if (event.currentTarget.matches(':focus-visible')) showTip(event, content, 0);
    },
    onBlur: hideTip,
    onClick: hideTip,
  });

  return (
    <div
      ref={railRef}
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Tela tools"
      onKeyDown={onKeyDown}
      onScroll={hideTip}
      className="shrink-0 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar select-none z-30"
      style={{ width: compact ? 60 : 188, height: '100%', maxHeight: '100%', borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0b0a10' }}
    >
      <div className={`sticky top-0 z-10 flex items-center h-9 shrink-0 ${compact ? 'justify-center' : 'justify-between pl-3 pr-1.5'}`} style={{ background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {!compact && <span className="text-[12px] font-bold text-white/90">Tools</span>}
        <button
          type="button"
          data-rail-chrome
          aria-label={compact ? 'Show tool names' : 'Hide tool names'}
          aria-pressed={!compact}
          {...tipProps({ title: compact ? 'Show tool names' : 'Hide tool names', desc: compact ? 'Widen this panel so every tool shows its name.' : 'Shrink this panel to icons to give the canvas more room.' })}
          onClick={() => { hideTip(); toggleCompact(); }}
          className={`w-8 h-8 grid place-items-center rounded-[8px] text-white/70 hover:text-white hover:bg-white/[.08] transition-colors ${FOCUS_RING}`}
        >
          {compact ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
        </button>
      </div>

      {sections.map(section => {
        const collapsed = isCollapsed(section);
        const headingId = `${uid}-${section.id}-heading`;
        const bodyId = `${uid}-${section.id}-body`;
        const runningInside = collapsed && section.items.some(item => item.active);
        return (
          <section key={section.id} aria-labelledby={headingId} className="shrink-0 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 id={headingId} className="m-0">
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                aria-label={section.title}
                {...tipProps({ title: section.title, desc: section.blurb })}
                onClick={() => { hideTip(); toggleSection(section); }}
                className={`w-full text-left hover:bg-white/[.05] transition-colors ${compact ? 'px-1 pt-2 pb-1' : 'px-3 pt-2.5 pb-1.5'} ${FOCUS_RING}`}
              >
                <span className={`flex items-center gap-1 ${compact ? 'justify-center' : ''}`}>
                  {!compact && <ChevronRight size={13} aria-hidden className="shrink-0 text-white/60 transition-transform" style={{ transform: collapsed ? 'none' : 'rotate(90deg)' }} />}
                  <span className={`font-bold text-white/85 truncate ${compact ? 'text-[10px]' : 'text-[12px]'}`}>{compact ? section.shortTitle : section.title}</span>
                  {runningInside && <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#00DAF3]" />}
                </span>
                {!compact && <span className="block pl-[17px] mt-0.5 text-[11px] leading-[1.3] text-white/60" style={{ whiteSpace: 'normal' }}>{section.blurb}</span>}
              </button>
            </h3>
            <div id={bodyId} hidden={collapsed} className={compact ? 'flex flex-col items-center gap-0.5' : 'flex flex-col gap-0.5 px-1.5'}>
              {section.items.map(item => {
                const descId = `${uid}-${section.id}-${item.id}-desc`;
                return (
                  <React.Fragment key={item.id}>
                    <button
                      type="button"
                      aria-label={item.label}
                      aria-describedby={descId}
                      aria-pressed={item.active}
                      aria-keyshortcuts={item.shortcut?.replace(/\s/g, '')}
                      disabled={item.disabled}
                      {...tipProps({ title: item.label, desc: item.desc, shortcut: item.shortcut })}
                      onClick={() => { hideTip(); item.onClick(); }}
                      className={`relative flex items-center rounded-[8px] transition-colors disabled:opacity-45 disabled:cursor-wait ${compact ? 'w-9 h-9 justify-center' : 'w-full h-8 gap-2.5 px-2'} ${item.active ? 'text-white' : 'text-white/80 hover:text-white hover:bg-white/[.08]'} ${FOCUS_RING}`}
                      style={item.active ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' } : undefined}
                    >
                      <span aria-hidden className="shrink-0 grid place-items-center">{item.icon}</span>
                      {!compact && <span className="flex-1 min-w-0 text-left text-[12.5px] font-medium truncate">{item.label}</span>}
                      {!compact && item.shortcut && item.shortcut.length === 1 && (
                        <kbd className={`shrink-0 text-[10px] font-semibold font-[inherit] ${item.active ? 'text-white/90' : 'text-white/55'}`}>{item.shortcut}</kbd>
                      )}
                    </button>
                    <span id={descId} className="sr-only">{item.desc}</span>
                  </React.Fragment>
                );
              })}
            </div>
          </section>
        );
      })}

      {tip && createPortal(
        <div
          role="tooltip"
          className="fixed pointer-events-none rounded-[10px] px-3 py-2 max-w-[260px]"
          style={{ left: tip.x, top: tip.y, transform: 'translateY(-50%)', zIndex: 10000, background: '#1b1724', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 10px 28px rgba(0,0,0,.5)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-bold text-white">{tip.title}</span>
            {tip.shortcut && <kbd className="shrink-0 px-1.5 py-px rounded-[5px] text-[10.5px] font-semibold font-[inherit] text-white/90 bg-white/[.12]">{tip.shortcut}</kbd>}
          </div>
          <p className="m-0 mt-1 text-[11.5px] leading-[1.4] text-white/75">{tip.desc}</p>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TelaToolRail;
