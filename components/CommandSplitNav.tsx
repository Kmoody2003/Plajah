/**
 * CommandSplitNav — the "New" shell navigation pillar (2026 redesign), rendered
 * behind the `useShellNext` beta toggle in place of the classic sidebar.
 *
 * Mechanic ("Command Split"): a slim category rail (Tier 1: 7 sections + pins)
 * drives a labelled sub-column (Tier 2) of that section's destinations, and a
 * command launcher (⌘ / ⌘K) reaches all ~40 destinations by search. The pillar is
 * collapsible — when collapsed, Tier 2 becomes a click-flyout off the rail.
 *
 * It owns its own destination map (ids are AppView route strings) and navigates
 * via `onNavigate`, so App.tsx only has to render it and pass a few handlers —
 * no giant prop surface. The ad billboard, nano player, and layout switcher stay
 * where they are in App.tsx.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, Settings as SettingsIcon, Music2, Globe, Video as VideoIcon, Film, Zap, Activity,
  Newspaper, BookOpen, Cross, FlaskConical, Radio, AppWindow, Repeat, Gamepad2, Users, UsersRound,
  Heart, Landmark, Shield, ShoppingBag, GraduationCap, Camera, MessageSquare, MessageCircle,
  Mail, Rss, Sparkles, Clapperboard, MonitorPlay, Cctv, Search, HelpCircle, Monitor, Factory, Building2,
  Briefcase, MapPin, TrendingUp, Ticket, Home, LayoutPanelTop, Megaphone,
  Compass, Palette, Trophy, Bell, Plus, ChevronLeft,
  ChevronRight, LogOut, Command, RotateCcw, X, Disc3, Grid3x3,
} from 'lucide-react';
import UniversalCommandResults from './UniversalCommandResults';

type ViewId = string;

type IconProps = { size?: number; className?: string; style?: React.CSSProperties };
export interface NavDest { id: ViewId; label: string; icon: React.ComponentType<IconProps>; requiresUser?: boolean; }
export interface NavSection { key: string; icon: React.ComponentType<IconProps>; items: NavDest[]; }

// ── Plajah brand-gradient icon treatment ──────────────────────────────────────
// Lucide icons stroke with `currentColor`; an SVG stroke can't take a Tailwind
// gradient, so we register a paint-server once and point icons' stroke at it.
// Same brand ramp as the "P" logo / player chevron (purple → magenta → orange).
export const PLAJAH_ICON_GRAD_ID = 'plajah-icon-grad';
export const plajahIconStroke: React.CSSProperties = { stroke: `url(#${PLAJAH_ICON_GRAD_ID})` };
/** Render ONCE inside a bar so `url(#plajah-icon-grad)` resolves. */
export const PlajahIconGradientDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <linearGradient id={PLAJAH_ICON_GRAD_ID} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6B0099" />
        <stop offset="55%" stopColor="#D40055" />
        <stop offset="100%" stopColor="#FF8C00" />
      </linearGradient>
    </defs>
  </svg>
);

// ── The canonical destination map (mirrors App.tsx's allNavItems, grouped) ──
export const NAV_SECTIONS: NavSection[] = [
  { key: 'Discover', icon: Compass, items: [
    { id: 'USER_PROFILE', label: 'My Profile', icon: User },
    { id: 'DASHBOARD', label: 'Global Archive', icon: Home },
    { id: 'FEED', label: 'Plajah Social', icon: Rss },
    { id: 'WORLDS', label: 'Worlds', icon: Globe },
    { id: 'SEARCH', label: 'Find People', icon: Search },
  ]},
  { key: 'Entertainment', icon: Clapperboard, items: [
    { id: 'MUSIC', label: 'Chora', icon: Music2 },
    { id: 'VIDEOS', label: 'Reello', icon: VideoIcon },
    { id: 'MOVIES_TV', label: 'Taleo', icon: Film },
    { id: 'RADIO', label: 'Radio', icon: Radio },
    { id: 'GAMES', label: 'Games', icon: Gamepad2 },
    { id: 'GLOBAL_PHOTOS', label: 'Photos', icon: Camera },
    { id: 'LIVE_HUB', label: 'Live Hub', icon: Sparkles },
    { id: 'PPV_EVENTS', label: 'Live Events', icon: Ticket },
  ]},
  { key: 'Sports & News', icon: Trophy, items: [
    { id: 'PLAJAH_SPORTS', label: 'Plajah Sports', icon: Zap },
    { id: 'HEALTH_FITNESS', label: 'Health & Fitness', icon: Activity },
    { id: 'ARTICLES', label: 'The Newstand', icon: Newspaper },
  ]},
  { key: 'Education', icon: GraduationCap, items: [
    { id: 'BOOKS', label: 'Lorea', icon: BookOpen },
    { id: 'CLASSROOMS', label: 'Plajah Academia', icon: GraduationCap },
    { id: 'PLAJAH_LABS', label: 'Museion', icon: FlaskConical },
    { id: 'TELA', label: 'Tela', icon: LayoutPanelTop },
  ]},
  { key: 'Community', icon: UsersRound, items: [
    { id: 'CLUBS', label: 'Clubs', icon: Users },
    { id: 'CHAT', label: 'Chat', icon: MessageSquare },
    { id: 'DISCUSSION', label: 'Discussion', icon: MessageCircle },
    { id: 'PLAJAH_ELEVATE', label: 'Plajah Elevate', icon: Landmark },
    { id: 'BIBLE', label: 'Lectio', icon: Cross },
    { id: 'SACRED_LIBRARY', label: 'Sacred Library', icon: BookOpen },
    { id: 'CHARITY', label: 'Charity', icon: Heart },
    { id: 'PAY_IT_FORWARD', label: 'Pay It Forward', icon: Heart },
    { id: 'SANCTUARY_HUB', label: 'Sanctuary', icon: Shield },
    { id: 'STORE_HUB', label: 'Plajah Store', icon: ShoppingBag },
  ]},
  { key: 'Creator Tools', icon: Palette, items: [
    { id: 'CREATOR_HUB', label: 'Creator Hub', icon: Clapperboard },
    { id: 'ARTIST_MANAGER', label: 'Artist Manager', icon: Music2, requiresUser: true },
    { id: 'PLAJAH_STUDIO', label: 'Marketing', icon: Megaphone, requiresUser: true },
    { id: 'PLAJAH_BUSINESS', label: 'Plajah Business', icon: Briefcase, requiresUser: true },
    { id: 'TERRA', label: 'Terra', icon: MapPin, requiresUser: true },
    { id: 'TELA', label: 'Tela', icon: LayoutPanelTop },
    { id: 'FABULA', label: 'Fabula', icon: Film },
    { id: 'DJ_CONSOLE', label: 'DJ Console', icon: Disc3 },
    { id: 'PLAJAH_PIXELS', label: 'Plajah Pixels', icon: Grid3x3 },
    { id: 'TV_STUDIO', label: 'TV Studio', icon: Clapperboard },
    { id: 'AMBO_PRO', label: 'Ambo', icon: MonitorPlay },
    { id: 'MEDIA_ROUTER', label: 'Router & Switcher', icon: Cctv },
    { id: 'POSTMAN', label: 'The Postman', icon: Mail },
    { id: 'APPS', label: 'Apps', icon: AppWindow },
    { id: 'CROSSOVER', label: 'Crossover', icon: Repeat },
  ]},
  { key: 'Plajah Business', icon: Building2, items: [
    { id: 'PLAJAH_BUSINESS', label: 'Plajah Business', icon: Briefcase, requiresUser: true },
    { id: 'STORE_HUB', label: 'Plajah Store', icon: ShoppingBag },
    { id: 'TERRA', label: 'Terra', icon: MapPin, requiresUser: true },
    { id: 'CHAT', label: 'Chat', icon: MessageSquare },
    { id: 'TELA', label: 'Tela', icon: LayoutPanelTop },
  ]},
  { key: 'Platform', icon: Factory, items: [
    { id: 'HELP_CENTER', label: 'Help Center', icon: HelpCircle },
    { id: 'BROWSER', label: 'Partner Sites', icon: Monitor },
  ]},
];

const PINNED_IDS: ViewId[] = ['DASHBOARD', 'FEED', 'MUSIC', 'VIDEOS', 'PLAJAH_SPORTS', 'CHAT'];

const ALL_DESTS: NavDest[] = NAV_SECTIONS.flatMap(s => s.items);
const destById = (id: ViewId) => ALL_DESTS.find(d => d.id === id);
const sectionIndexOf = (id: ViewId) => NAV_SECTIONS.findIndex(s => s.items.some(i => i.id === id));

export interface CommandSplitNavProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  hasUser?: boolean;
  displayName?: string;
  subtitle?: string;
  avatarUrl?: string;
  accountSlot?: number | null;
  linkedAccounts?: Array<{ uid: string; displayName: string; email: string; photoURL?: string; slot: number }>;
  playerController?: React.ReactNode;
  notificationCount?: number;
  onCreate?: () => void;
  onGoLive?: () => void;
  onOpenNotifications?: () => void;
  onOpenAccountSwitcher?: () => void;
  onSignOut?: () => void;
  /** Return to the classic sidebar (flips the beta toggle off). */
  onExitNew?: () => void;
  /** slim = compact desktop / split mode → narrower rails */
  slim?: boolean;
  onVisitUser?: (uid: string) => void;
  onSelectItem?: (item: any) => void;
  onSelectArticle?: (article: any) => void;
  onSelectGame?: (game: any) => void;
  onSelectLiveFeed?: (feed: any) => void;
}

const CommandSplitNav: React.FC<CommandSplitNavProps> = ({
  view, onNavigate, hasUser, displayName, subtitle, avatarUrl, accountSlot, linkedAccounts = [], playerController,
  notificationCount = 0, onCreate, onGoLive, onOpenNotifications, onOpenAccountSwitcher,
  onSignOut, onExitNew, slim, onVisitUser, onSelectItem, onSelectArticle, onSelectGame, onSelectLiveFeed,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('plajah_cmdsplit_collapsed') === '1'; } catch { return false; }
  });
  const [openCat, setOpenCat] = useState<number>(() => Math.max(0, sectionIndexOf(view)));
  const [flyoutOpen, setFlyoutOpen] = useState(false);
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
    const onOpenCmd = () => openLauncher();
    window.addEventListener('keydown', onKey);
    window.addEventListener('plajah:open-command', onOpenCmd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('plajah:open-command', onOpenCmd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem('plajah_cmdsplit_collapsed', collapsed ? '1' : '0'); } catch { /* */ }
    if (!collapsed) setFlyoutOpen(false);
  }, [collapsed]);

  const openLauncher = () => { setLauncher(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 40); };

  const go = (id: ViewId) => { setLauncher(false); setFlyoutOpen(false); onNavigate(id); };

  const visibleSection = (s: NavSection): NavDest[] => s.items.filter(i => !i.requiresUser || hasUser);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as NavDest[];
    return ALL_DESTS.filter(d => (!d.requiresUser || hasUser) && (d.label.toLowerCase().includes(q)));
  }, [query, hasUser]);

  const tier1W = slim ? 60 : 68;
  const tier2W = slim ? 190 : 212;

  const IconBtn: React.FC<{ title: string; onClick?: () => void; active?: boolean; children: React.ReactNode; className?: string; badge?: number }> =
    ({ title, onClick, active, children, className = '', badge }) => (
    <button title={title} onClick={onClick}
      className={`relative grid place-items-center w-11 h-11 rounded-[13px] transition-colors shrink-0 ${active ? 'text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.08]'} ${className}`}
      style={active ? { background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 6px 22px rgba(212,0,85,.32)' } : undefined}>
      {children}
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] grid place-items-center rounded-full bg-[#D40055] text-white text-[9px] font-black">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );

  const Tier2List = (
    <>
      <div className="px-4 pt-3.5 pb-2 font-display italic text-[1.1rem] text-white flex items-center gap-2">
        {React.createElement(NAV_SECTIONS[openCat].icon, { size: 17, style: plajahIconStroke })}
        <span>{NAV_SECTIONS[openCat].key}</span>
      </div>
      <button onClick={openLauncher}
        className="mx-3 mb-2 flex items-center gap-2 text-[.75rem] text-white/45 hover:text-white bg-white/[0.045] hover:bg-white/[0.08] border border-white/[0.12] rounded-xl px-3 py-2 transition-colors">
        <Search size={13} /> Jump to anything
        <span className="ml-auto text-[.58rem] font-bold border border-white/15 rounded px-1.5 py-0.5">Ctrl K</span>
      </button>
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
        <div className="text-[.58rem] font-black uppercase tracking-[0.2em] text-white/35 px-4 pt-2 pb-1">Pinned</div>
        {PINNED_IDS.map(id => { const d = destById(id); if (!d) return null; const A = d.icon; return (
          <button key={id} onClick={() => go(id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[.82rem] font-semibold text-white/90 hover:bg-white/[0.07] transition-colors ${view === id ? 'bg-white/[0.09] shadow-[inset_3px_0_0_#D40055]' : ''}`}>
            <A size={16} className="shrink-0 opacity-80" style={plajahIconStroke} /> {d.label}
          </button>
        ); })}
        <div className="text-[.58rem] font-black uppercase tracking-[0.2em] text-white/35 px-4 pt-3 pb-1">{NAV_SECTIONS[openCat].key}</div>
        {visibleSection(NAV_SECTIONS[openCat]).map(d => { const A = d.icon; return (
          <button key={d.id} onClick={() => go(d.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[.82rem] font-semibold text-white/90 hover:bg-white/[0.07] transition-colors ${view === d.id ? 'bg-white/[0.09] shadow-[inset_3px_0_0_#D40055]' : ''}`}>
            <A size={16} className="shrink-0 opacity-80" style={plajahIconStroke} /> {d.label}
          </button>
        ); })}
      </div>
      {playerController && (
        <div className="px-3 py-3 border-t border-[var(--border-color)]">
          <p className="pj-eyebrow mb-2 text-[var(--on-surface-variant)]">Nano controller</p>
          {playerController}
        </div>
      )}
      {hasUser && (
        <button
          type="button"
          onClick={onOpenAccountSwitcher}
          className="mx-3 mb-3 flex items-center gap-3 rounded-card border border-[var(--border-color)] bg-[var(--glass-2)] p-3 text-left transition-colors hover:bg-[var(--glass-3)]"
          aria-label="Switch account"
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[var(--glass-3)] ring-2 ring-[var(--pj-orange-soft)]">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <User size={18} className="m-3 text-[var(--on-surface-variant)]" />}
            {!!accountSlot && <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-full bg-[var(--pj-orange)] text-[8px] font-black text-black">{accountSlot}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate type-label-md text-[var(--text-primary)]">{displayName || 'Signed in'}</span>
            <span className="block truncate type-body-sm text-[var(--on-surface-variant)]">{subtitle || 'Manage accounts'}</span>
          </span>
          {linkedAccounts.length > 1 && (
            <span className="flex -space-x-2" aria-label={`${linkedAccounts.length} linked accounts`}>
              {linkedAccounts.filter(a => a.uid !== linkedAccounts.find(x => x.slot === accountSlot)?.uid).slice(0, 3).map(a => (
                <span key={a.uid} className="h-6 w-6 overflow-hidden rounded-full border-2 border-[var(--bg-color)] bg-[var(--glass-3)]">
                  {a.photoURL ? <img src={a.photoURL} alt="" className="h-full w-full object-cover" /> : <User size={10} className="m-1.5" />}
                </span>
              ))}
            </span>
          )}
          <ChevronRight size={16} className="shrink-0 text-[var(--on-surface-variant)]" />
        </button>
      )}
    </>
  );

  return (
    <>
      <PlajahIconGradientDefs />
      <div className="relative flex sticky top-0 h-screen z-50 shrink-0">
        {/* Tier 1 — category rail */}
        <nav className="flex flex-col items-center gap-1.5 py-3.5 h-screen overflow-y-auto custom-scrollbar border-r border-white/[0.07]"
          style={{ width: tier1W, background: 'linear-gradient(180deg,#140D20,#0E0A16)' }}>
          <button onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}
            className="grid place-items-center w-10 h-6 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] mb-1">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button onClick={() => go('DASHBOARD')} title="Home"
            className="w-10 h-10 rounded-xl grid place-items-center font-display italic text-white text-[1rem] mb-1"
            style={{ background: 'linear-gradient(135deg,#6B0099 0%,#D40055 55%,#FF8C00 100%)' }}>P</button>
          <IconBtn title="Command menu (Ctrl K)" onClick={openLauncher} className="!text-[#00DAF3]"><Command size={20} /></IconBtn>
          <div className="w-10 h-px bg-white/[0.08] my-2" />
          {NAV_SECTIONS.map((s, i) => (
            <button key={s.key} title={s.key}
              onClick={() => { setOpenCat(i); if (collapsed) setFlyoutOpen(true); }}
              className={`relative grid place-items-center w-[46px] h-[46px] rounded-[13px] transition-colors shrink-0 ${i === openCat ? 'text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.08]'}`}
              style={i === openCat ? { background: 'linear-gradient(135deg,#6B0099,#00DAF3)', boxShadow: '0 0 18px rgba(0,218,243,.32)' } : undefined}>
              {React.createElement(s.icon, { size: 20, style: i === openCat ? undefined : plajahIconStroke })}
            </button>
          ))}
          <div className="w-10 h-px bg-white/[0.08] my-2" />
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <IconBtn title="Search" onClick={openLauncher}><Search size={18} style={plajahIconStroke} /></IconBtn>
            <IconBtn title="Create" onClick={onCreate}><Plus size={18} style={plajahIconStroke} /></IconBtn>
            <IconBtn title="Go Live" onClick={onGoLive}><Radio size={18} style={plajahIconStroke} /></IconBtn>
            <IconBtn title="Notifications" onClick={onOpenNotifications} badge={notificationCount}><Bell size={18} style={plajahIconStroke} /></IconBtn>
            <IconBtn title="Settings" onClick={() => go('CREATOR')}><SettingsIcon size={18} style={plajahIconStroke} /></IconBtn>
            {hasUser && <IconBtn title="Sign out" onClick={onSignOut}><LogOut size={18} style={plajahIconStroke} /></IconBtn>}
            {onExitNew && (
              <button title="Back to Classic navigation" onClick={onExitNew}
                className="grid place-items-center w-11 h-11 rounded-[13px] text-[#00DAF3] hover:bg-white/[0.08] transition-colors"><RotateCcw size={18} /></button>
            )}
            <div className="w-10 h-px bg-white/[0.08] my-1" />
            <button title="Switch account" onClick={onOpenAccountSwitcher}
              className="relative w-10 h-10 rounded-full grid place-items-center font-display italic text-white text-[.8rem] overflow-hidden"
              style={{ background: avatarUrl ? undefined : 'linear-gradient(135deg,#6B0099,#00DAF3)' }}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (displayName?.[0]?.toUpperCase() || 'P')}
              {!!accountSlot && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#FF8C00] text-[#2a1500] text-[9px] font-black grid place-items-center border-2 border-[#0E0A16]">{accountSlot}</span>
              )}
            </button>
          </div>
        </nav>

        {/* Tier 2 — labelled sub-column (inline when expanded) */}
        {!collapsed && (
          <div className="flex flex-col h-screen overflow-hidden border-r border-white/[0.07]"
            style={{ width: tier2W, background: 'linear-gradient(160deg,rgba(20,13,32,.96),rgba(14,10,22,.98))' }}>
            {Tier2List}
          </div>
        )}

        {/* Collapsed flyout */}
        {collapsed && (
          <div className={`absolute top-0 h-screen flex flex-col z-40 border-r border-white/[0.14] shadow-2xl transition-all duration-200 ${flyoutOpen ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-2 pointer-events-none'}`}
            style={{ left: tier1W, width: tier2W, background: 'linear-gradient(160deg,rgba(20,13,32,.98),rgba(14,10,22,.99))' }}
            onMouseLeave={() => setFlyoutOpen(false)}>
            {Tier2List}
          </div>
        )}
      </div>

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
                      <button key={id} onClick={() => go(id)} className="inline-flex items-center gap-1.5 text-[.74rem] font-semibold text-white/85 px-3 py-1.5 rounded-full border border-white/[0.14] bg-white/[0.045] hover:bg-white/[0.09]"><A size={13} style={plajahIconStroke} /> {d.label}</button>
                    ); })}
                  </div>
                </>
              )}
              {query && <UniversalCommandResults query={query} onNavigate={onNavigate} onClose={() => setLauncher(false)} onVisitUser={onVisitUser} onSelectItem={onSelectItem} onSelectArticle={onSelectArticle} onSelectGame={onSelectGame} onSelectLiveFeed={onSelectLiveFeed} />}
              {(query ? [{ key: results.length + ' result' + (results.length === 1 ? '' : 's'), icon: Search, items: results }] as NavSection[] : NAV_SECTIONS).map((s, si) => (
                <div key={si}>
                  <div className="text-[.6rem] font-black uppercase tracking-[0.2em] text-white/40 mt-5 mb-2.5 flex items-center gap-1.5">{React.createElement(s.icon, { size: 12, style: plajahIconStroke })} {query ? `Pages & tools · ${s.key}` : s.key}</div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))' }}>
                    {(query ? results : visibleSection(s)).map(d => { const A = d.icon; return (
                      <button key={d.id} onClick={() => go(d.id)}
                        className="flex flex-col items-center gap-1.5 text-center p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.045] hover:bg-white/[0.1] hover:-translate-y-0.5 transition-all">
                        <span className="w-11 h-11 rounded-xl grid place-items-center bg-[#1B1329]"><A size={20} className="text-white/85" style={plajahIconStroke} /></span>
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

export default CommandSplitNav;
