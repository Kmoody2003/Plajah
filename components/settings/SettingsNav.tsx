import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, LogOut, Search, Settings, Shield } from 'lucide-react';
import { auth } from '../../services/firebase';
import { UserAvatar } from '../avatar/UserAvatar';
import NativeShellSwitch from '../NativeShellSwitch';
import {
  SETTINGS_GROUPS, SettingsGroup, SettingsPage, groupOfPage, searchPages, visiblePages,
} from './settingsMap';

// Shared navigation for the user settings. Desktop shows a sidebar (search, profile card, nine groups,
// the active group opens to show its pages). Phone shows the same groups as a drill-down list.
// Both read settingsMap, so the two never drift apart.

interface Who { displayName?: string; handle?: string; avatarUrl?: string; }
interface Common {
  who: Who;
  can: (cap?: string) => boolean;
  badges?: Record<string, number>;   // page id → count shown beside it
  onSelect: (pageId: string) => void;
  onNavigate: (target: string) => void;
}

const initials = (name?: string) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

const Tile: React.FC<{ g: SettingsGroup; size?: number }> = ({ g, size = 36 }) => (
  <span className="rounded-xl flex items-center justify-center shrink-0" style={{ width: size, height: size, backgroundColor: g.tint + '22', color: g.tint }}>
    <g.icon size={Math.round(size * 0.52)} />
  </span>
);

const Badge: React.FC<{ n?: number }> = ({ n }) => n ? (
  <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-500 text-black leading-none">{n}</span>
) : null;

const ProfileCard: React.FC<{ who: Who; onClick: () => void; className?: string }> = ({ who, onClick, className = '' }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-3xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] active:bg-white/[0.08] text-left ${className}`}>
    {who.avatarUrl
      ? <UserAvatar uid={auth.currentUser?.uid} src={who.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
      : <div className="w-11 h-11 rounded-full shrink-0 bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center text-white font-black text-sm">{initials(who.displayName)}</div>}
    <div className="min-w-0 flex-1">
      <div className="text-white font-bold text-sm truncate">{who.displayName || 'Your account'}</div>
      <div className="text-white/40 text-xs truncate">{who.handle ? `@${who.handle}` : 'Edit your profile'}</div>
    </div>
  </button>
);

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <label className="flex items-center gap-2.5 h-11 px-4 rounded-full border border-white/10 bg-white/[0.03] focus-within:border-[#FF8C00] transition-colors">
    <Search size={16} className="text-white/30 shrink-0" />
    <input
      type="search" value={value} onChange={e => onChange(e.target.value)}
      placeholder="Search settings" aria-label="Search settings"
      className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-white/30"
    />
  </label>
);

const Results: React.FC<{ q: string; can: Common['can']; onPick: (p: SettingsPage) => void; compact?: boolean }> = ({ q, can, onPick, compact }) => {
  const hits = useMemo(() => searchPages(q, can), [q, can]);
  if (!hits.length) return <p className="px-3 py-6 text-sm text-white/35">No settings match “{q}”. Try a shorter word.</p>;
  return (
    <div className={compact ? 'rounded-3xl bg-white/[0.03] border border-white/8 overflow-hidden' : 'space-y-1'}>
      {hits.map(({ group, page }, i) => (
        <button
          key={page.id} onClick={() => onPick(page)}
          className={`w-full flex items-center gap-3 text-left ${compact ? `px-3.5 py-3 min-h-[56px] active:bg-white/[0.06] ${i ? 'border-t border-white/[0.06]' : ''}` : 'px-3 py-2.5 rounded-2xl hover:bg-white/5'}`}
        >
          <Tile g={group} size={compact ? 36 : 32} />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-medium text-white truncate">{page.label}</span>
            <span className="block text-xs text-white/40 truncate">{group.title}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

/* ───────────────────────── Desktop / tablet sidebar ───────────────────────── */

export const SettingsSidebar: React.FC<Common & {
  activeTab: string;
  onExit: () => void;
  isStaff?: boolean;
  onAdmin?: () => void;
}> = ({ who, can, badges = {}, activeTab, onSelect, onNavigate, onExit, isStaff, onAdmin }) => {
  const [q, setQ] = useState('');
  const activeGroup = groupOfPage(activeTab);
  const pick = (p: SettingsPage) => { if (p.navigate) onNavigate(p.navigate); else onSelect(p.id); setQ(''); };

  return (
    <aside className="hidden lg:flex w-80 shrink-0 border-r border-white/5 flex-col gap-4 p-5 bg-black/40 backdrop-blur-3xl overflow-y-auto">
      <div className="flex items-center gap-3 px-1 pt-1">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-xl">
          <Settings size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-white leading-none">Settings</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange mt-1">Your account</p>
        </div>
      </div>

      <ProfileCard who={who} onClick={() => onSelect('PROFILE')} />
      <SearchBox value={q} onChange={setQ} />

      <nav className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1" aria-label="Settings">
        {q.trim() ? <Results q={q} can={can} onPick={pick} /> : (
          <div className="space-y-1">
            {SETTINGS_GROUPS.map(g => {
              const pages = visiblePages(g, can);
              if (!pages.length) return null;
              const open = activeGroup?.id === g.id;
              return (
                <div key={g.id}>
                  <button
                    onClick={() => pick(pages[0])}
                    aria-current={open ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-2xl text-left transition-all ${open ? 'bg-white' : 'hover:bg-white/5'}`}
                  >
                    <Tile g={g} size={34} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-semibold truncate ${open ? 'text-black' : 'text-white'}`}>{g.title}</span>
                      <span className={`block text-xs truncate ${open ? 'text-black/55' : 'text-white/35'}`}>{g.desc}</span>
                    </span>
                  </button>
                  {open && pages.length > 1 && (
                    <div className="ml-[26px] pl-4 border-l border-white/10 my-1 space-y-0.5">
                      {pages.map(p => (
                        <button
                          key={p.id} onClick={() => pick(p)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[13px] font-semibold transition-colors ${p.id === activeTab ? 'text-[#FF8C00] bg-white/5' : 'text-white/45 hover:text-white hover:bg-white/5'}`}
                        >
                          <span className="truncate">{p.label}</span><Badge n={badges[p.id]} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="space-y-2 shrink-0">
        {isStaff && onAdmin && (
          <button onClick={onAdmin} className="w-full flex items-center gap-3 px-4 py-3 bg-red-600/10 text-red-500 border border-red-500/20 rounded-2xl hover:bg-red-600/20 transition-all text-[10px] font-black uppercase tracking-widest">
            <Shield size={16} /> System Admin
          </button>
        )}
        <button onClick={onExit} className="w-full flex items-center gap-3 px-4 py-3 text-white/30 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
          <LogOut size={16} /> Exit settings
        </button>
      </div>
    </aside>
  );
};

/** Tab strip above the page for groups that have more than one page (desktop and tablet). */
export const SettingsPageTabs: React.FC<{
  activeTab: string; can: Common['can']; badges?: Record<string, number>; onSelect: (id: string) => void; onNavigate: (t: string) => void;
}> = ({ activeTab, can, badges = {}, onSelect, onNavigate }) => {
  const g = groupOfPage(activeTab);
  if (!g) return null;
  const pages = visiblePages(g, can);
  if (pages.length < 2) return null;
  return (
    <div className="hidden lg:block mb-8">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={g.title}>
        {pages.map(p => (
          <button
            key={p.id} role="tab" aria-selected={p.id === activeTab}
            onClick={() => (p.navigate ? onNavigate(p.navigate) : onSelect(p.id))}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-widest transition-all ${p.id === activeTab ? 'bg-white text-black border-white' : 'border-white/10 text-white/45 hover:text-white hover:bg-white/5'}`}
          >
            {p.label}<Badge n={badges[p.id]} />
          </button>
        ))}
      </div>
    </div>
  );
};

/* ───────────────────────── Phone drill-down ───────────────────────── */

export const SettingsPhoneMenu: React.FC<Common & {
  groupId: string | null;                 // open group screen (null = top list)
  onGroupChange: (id: string | null) => void;
  onExit: () => void;
}> = ({ who, can, badges = {}, groupId, onGroupChange, onSelect, onNavigate, onExit }) => {
  const [q, setQ] = useState('');
  const group = SETTINGS_GROUPS.find(g => g.id === groupId) || null;
  const pick = (p: SettingsPage) => { if (p.navigate) onNavigate(p.navigate); else onSelect(p.id); };
  const openGroup = (g: SettingsGroup) => {
    const pages = visiblePages(g, can);
    if (pages.length === 1) pick(pages[0]); else onGroupChange(g.id);
  };

  return (
    <div className="absolute inset-0 z-40 bg-[#020202] overflow-y-auto overscroll-contain">
      <div
        className="sticky top-0 z-10 bg-[#020202]/90 backdrop-blur-xl px-4 pb-3 flex items-center justify-between border-b border-white/5"
        style={{ paddingTop: 'max(0.9rem, env(safe-area-inset-top))' }}
      >
        {group ? (
          <button onClick={() => onGroupChange(null)} className="h-10 -ml-1 pr-2 rounded-full flex items-center gap-1 text-white active:bg-white/10" aria-label="Back to settings">
            <ChevronLeft size={24} /><span className="text-sm font-semibold">Settings</span>
          </button>
        ) : <h1 className="text-xl font-black text-white tracking-tight uppercase">Settings</h1>}
        <button onClick={onExit} className="h-9 px-4 rounded-full bg-white/8 text-white/70 text-xs font-bold active:bg-white/15">Done</button>
      </div>

      {group ? (
        <div className="px-4 pt-5 pb-10">
          <div className="flex items-center gap-3 mb-5">
            <Tile g={group} size={44} />
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none">{group.title}</h2>
              <p className="text-xs text-white/40 mt-1">{group.desc}</p>
            </div>
          </div>
          <div className="rounded-3xl bg-white/[0.03] border border-white/8 overflow-hidden">
            {visiblePages(group, can).map((p, i) => (
              <button key={p.id} onClick={() => pick(p)} className={`w-full flex items-center gap-3 pl-3.5 pr-4 py-3 min-h-[56px] text-left active:bg-white/[0.06] ${i ? 'border-t border-white/[0.06]' : ''}`}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: group.tint + '22', color: group.tint }}><p.icon size={18} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-white truncate">{p.label}</span>
                  <span className="block text-xs text-white/40 truncate">{p.desc}</span>
                </span>
                <Badge n={badges[p.id]} />
                <ChevronRight size={19} className="text-white/25 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-10 space-y-4">
          <ProfileCard who={who} onClick={() => onSelect('PROFILE')} />
          <SearchBox value={q} onChange={setQ} />
          <NativeShellSwitch />
          {q.trim() ? <Results q={q} can={can} onPick={pick} compact /> : (
            <>
              <div className="px-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/30">All settings</div>
              <div className="rounded-3xl bg-white/[0.03] border border-white/8 overflow-hidden">
                {SETTINGS_GROUPS.map((g, i) => {
                  const pages = visiblePages(g, can);
                  if (!pages.length) return null;
                  return (
                    <button key={g.id} onClick={() => openGroup(g)} className={`w-full flex items-center gap-3 pl-3.5 pr-4 py-3 min-h-[56px] text-left active:bg-white/[0.06] ${i ? 'border-t border-white/[0.06]' : ''}`}>
                      <Tile g={g} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-white truncate">{g.title}</span>
                        <span className="block text-xs text-white/40 truncate">{pages.length > 1 ? pages.slice(0, 3).map(p => p.label).join(', ') : g.desc}</span>
                      </span>
                      <ChevronRight size={19} className="text-white/25 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button
            onClick={onExit}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl bg-white/[0.03] border border-white/8 text-white/50 text-sm font-bold active:bg-white/[0.06]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <LogOut size={17} /> Exit settings
          </button>
        </div>
      )}
    </div>
  );
};

/** Page heading shared by every settings page: group eyebrow, title, one-line description. */
export const SettingsPageHeader: React.FC<{ activeTab: string }> = ({ activeTab }) => {
  const g = groupOfPage(activeTab);
  const page = g?.pages.find(p => p.id === activeTab);
  if (!g || !page) return null;
  return (
    <div className="mb-8 lg:mb-10">
      <div className="flex items-center gap-3 mb-4">
        <Tile g={g} size={32} />
        <span className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: g.tint }}>{g.title}</span>
      </div>
      <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white leading-[0.92] text-balance" style={{ fontFamily: 'var(--font-display)' }}>
        {page.label}
      </h1>
      <div className="mt-5 h-1 w-20 rounded-full bg-gradient-to-r from-[#6B0099] to-[#FF8C00]" />
      <p className="mt-4 text-sm text-white/45 font-medium max-w-xl leading-relaxed">{page.desc}</p>
    </div>
  );
};
