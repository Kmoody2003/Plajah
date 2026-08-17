/**
 * CommandSplitBar — the TABLET / bar-mode form of the "Command Split" nav
 * (2026 shell redesign). Where CommandSplitNav renders a vertical rail + sub-column
 * for desktop, this renders a fixed two-row TOP BAR for tablet widths:
 *
 *   Row 1 — brand "P" → Home · a scrolling strip of the 7 category chips ·
 *           right-aligned tools (⌘ command, Create +, Notifications, avatar, ↩ Classic).
 *   Row 2 — a scrolling sub-row of the selected category's destinations.
 *
 * Selecting a category in Row 1 swaps Row 2. A full-frame command launcher (⌘ / ⌘K)
 * reaches every destination by search. The destination map + types are reused from
 * CommandSplitNav so there is a single source of truth for the shell's routes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Bell, Command, RotateCcw, X } from 'lucide-react';
import { NAV_SECTIONS, NavDest, NavSection } from './CommandSplitNav';

type ViewId = string;

const ALL_DESTS: NavDest[] = NAV_SECTIONS.flatMap(s => s.items);
const destById = (id: ViewId) => ALL_DESTS.find(d => d.id === id);
const sectionIndexOf = (id: ViewId) => NAV_SECTIONS.findIndex(s => s.items.some(i => i.id === id));

export interface CommandSplitBarProps {
  view: string;
  onNavigate: (view: string) => void;
  hasUser?: boolean;
  displayName?: string;
  avatarUrl?: string;
  accountSlot?: number | null;
  notificationCount?: number;
  onCreate?: () => void;
  onOpenNotifications?: () => void;
  onOpenAccountSwitcher?: () => void;
  onExitNew?: () => void; // back to classic bar
}

const CommandSplitBar: React.FC<CommandSplitBarProps> = ({
  view, onNavigate, hasUser, displayName, avatarUrl, accountSlot,
  notificationCount = 0, onCreate, onOpenNotifications, onOpenAccountSwitcher, onExitNew,
}) => {
  const [openCat, setOpenCat] = useState<number>(() => Math.max(0, sectionIndexOf(view)));
  const [launcher, setLauncher] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // keep the open category following the active view
  useEffect(() => { const si = sectionIndexOf(view); if (si >= 0) setOpenCat(si); }, [view]);

  // ⌘K / Ctrl-K opens the launcher; Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openLauncher(); }
      if (e.key === 'Escape') setLauncher(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLauncher = () => { setLauncher(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 40); };
  const go = (id: ViewId) => { setLauncher(false); onNavigate(id); };

  const visibleSection = (s: NavSection): NavDest[] => s.items.filter(i => !i.requiresUser || hasUser);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as NavDest[];
    return ALL_DESTS.filter(d => (!d.requiresUser || hasUser) && (d.label.toLowerCase().includes(q)));
  }, [query, hasUser]);

  const activeSection = NAV_SECTIONS[openCat] || NAV_SECTIONS[0];

  return (
    <>
      <header className="sticky top-0 z-50 w-full flex flex-col border-b border-white/[0.07] backdrop-blur-xl"
        style={{ background: 'linear-gradient(180deg,rgba(20,13,32,.97),rgba(14,10,22,.98))' }}>

        {/* ── Row 1 — brand · category chips · tools (≈56px) ── */}
        <div className="flex items-center gap-2 h-14 px-2.5">
          <button onClick={() => go('DASHBOARD')} title="Home"
            className="shrink-0 w-9 h-9 rounded-xl grid place-items-center font-display italic text-white text-[.95rem]"
            style={{ background: 'linear-gradient(135deg,#6B0099 0%,#D40055 55%,#FF8C00 100%)' }}>P</button>

          {/* scrolling category chips */}
          <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-1.5 w-max pr-2">
              {NAV_SECTIONS.map((s, i) => (
                <button key={s.key} onClick={() => setOpenCat(i)} title={s.key}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[.78rem] font-semibold transition-colors ${i === openCat ? 'text-white' : 'text-white/60 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1]'}`}
                  style={i === openCat ? { background: 'linear-gradient(135deg,#6B0099,#00DAF3)', boxShadow: '0 0 16px rgba(0,218,243,.3)' } : undefined}>
                  {React.createElement(s.icon, { size: 15 })}
                  <span>{s.key}</span>
                </button>
              ))}
            </div>
          </div>

          {/* tools cluster */}
          <div className="shrink-0 flex items-center gap-1.5 pl-1">
            <button onClick={openLauncher} title="Command menu (Ctrl K)"
              className="grid place-items-center w-9 h-9 rounded-xl text-[#00DAF3] hover:bg-white/[0.08] transition-colors">
              <Command size={18} />
            </button>
            <button onClick={onCreate} title="Create"
              className="grid place-items-center w-9 h-9 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors">
              <Plus size={18} />
            </button>
            <button onClick={onOpenNotifications} title="Notifications"
              className="relative grid place-items-center w-9 h-9 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors">
              <Bell size={18} />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] grid place-items-center rounded-full bg-[#D40055] text-white text-[9px] font-black">{notificationCount > 99 ? '99+' : notificationCount}</span>
              )}
            </button>
            {onExitNew && (
              <button onClick={onExitNew} title="Back to Classic navigation"
                className="grid grid-flow-col place-items-center h-9 px-2 rounded-xl text-[#00DAF3] hover:bg-white/[0.08] transition-colors text-[.7rem] font-bold gap-1">
                <RotateCcw size={15} />
                <span className="hidden sm:inline">Classic</span>
              </button>
            )}
            <button onClick={onOpenAccountSwitcher} title="Switch account"
              className="relative w-9 h-9 rounded-full grid place-items-center font-display italic text-white text-[.75rem] overflow-hidden shrink-0"
              style={{ background: avatarUrl ? undefined : 'linear-gradient(135deg,#6B0099,#00DAF3)' }}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (displayName?.[0]?.toUpperCase() || 'P')}
              {!!accountSlot && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#FF8C00] text-[#2a1500] text-[9px] font-black grid place-items-center border-2 border-[#0E0A16]">{accountSlot}</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Row 2 — selected category's destinations (≈44px) ── */}
        <div className="h-11 flex items-center overflow-x-auto custom-scrollbar border-t border-white/[0.05]"
          style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.015),transparent)' }}>
          <div className="flex items-center gap-1 w-max px-2.5">
            <span className="shrink-0 text-[.58rem] font-black uppercase tracking-[0.18em] text-white/35 pr-2 inline-flex items-center gap-1.5">
              {React.createElement(activeSection.icon, { size: 12 })}
              {activeSection.key}
            </span>
            {visibleSection(activeSection).map(d => { const A = d.icon; const active = view === d.id; return (
              <button key={d.id} onClick={() => go(d.id)} title={d.label}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[.76rem] font-semibold transition-colors ${active ? 'text-white' : 'text-white/70 hover:text-white hover:bg-white/[0.07]'}`}
                style={active ? { background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 4px 16px rgba(212,0,85,.3)' } : undefined}>
                <A size={14} className="shrink-0 opacity-90" />
                <span>{d.label}</span>
              </button>
            ); })}
          </div>
        </div>
      </header>

      {/* Command launcher */}
      {launcher && (
        <div className="fixed inset-0 z-[400] bg-[rgba(7,6,12,0.72)] backdrop-blur-2xl px-[6%] py-11 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setLauncher(false); }}>
          <div className="max-w-[720px] mx-auto animate-[fadeInUp_420ms_ease-out]">
            <button className="absolute top-4 right-6 text-white/60 hover:text-white" onClick={() => setLauncher(false)}><X size={22} /></button>
            <div className="rounded-[28px] border border-white/10 bg-[rgba(17,12,25,0.72)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl p-3.5">
              <div className="flex items-center gap-3 bg-[rgba(27,19,41,0.85)] border border-white/[0.12] rounded-2xl px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Search size={18} className="text-white/60" />
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search Plajah — pages, people, music…"
                  className="flex-1 bg-transparent border-0 outline-none text-white text-[1rem] placeholder:text-white/35" />
                <span className="text-[.6rem] font-bold text-white/45 border border-white/15 rounded px-1.5 py-0.5">ESC</span>
              </div>
              {!query && (
                <>
                  <div className="text-[.6rem] font-black uppercase tracking-[0.2em] text-white/40 mt-6 mb-2.5">Recent</div>
                  <div className="flex flex-wrap gap-2">
                    {['FEED', 'MUSIC', 'PLAJAH_SPORTS', 'FABULA'].map(id => { const d = destById(id); if (!d) return null; const A = d.icon; return (
                      <button key={id} onClick={() => go(id)} className="inline-flex items-center gap-1.5 text-[.74rem] font-semibold text-white/85 px-3 py-1.5 rounded-full border border-white/[0.14] bg-white/[0.045] hover:bg-white/[0.09]"><A size={13} /> {d.label}</button>
                    ); })}
                  </div>
                </>
              )}
              {(query ? [{ key: results.length + ' result' + (results.length === 1 ? '' : 's'), icon: Search, items: results }] as NavSection[] : NAV_SECTIONS).map((s, si) => (
                <div key={si}>
                  <div className="text-[.6rem] font-black uppercase tracking-[0.2em] text-white/40 mt-5 mb-2.5 flex items-center gap-1.5">{React.createElement(s.icon, { size: 12 })} {s.key}</div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))' }}>
                    {(query ? results : visibleSection(s)).map(d => { const A = d.icon; return (
                      <button key={d.id} onClick={() => go(d.id)}
                        className="flex flex-col items-center gap-1.5 text-center p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.045] hover:bg-white/[0.1] hover:-translate-y-0.5 transition-all">
                        <span className="w-11 h-11 rounded-xl grid place-items-center bg-[#1B1329]"><A size={20} className="text-white/85" /></span>
                        <span className="text-[.66rem] font-bold text-white/90 leading-tight">{d.label}</span>
                      </button>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CommandSplitBar;
