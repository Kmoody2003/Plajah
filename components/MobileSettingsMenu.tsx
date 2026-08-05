import React from 'react';
import {
  User, Baby, ShieldCheck, Mail, Share2, Database, Image as ImageIcon, Globe, Notebook,
  LayoutTemplate, LayoutGrid, Send, Tv, Radio, Film, FileText, BarChart2, Music2, Rss,
  Activity, BookOpen, CalendarClock, Users, CheckSquare, ShoppingBag, DollarSign,
  ChevronRight, LogOut,
} from 'lucide-react';

// Phone-only settings surface — an iOS/Android-style grouped drill-down. The desktop dashboard packs
// a permanent sidebar + dense panels that scroll and resize badly on a phone; on phone we replace the
// chrome entirely: a scrollable menu of grouped rows (big touch targets, one accent per row), each of
// which pushes into the SAME underlying settings panel with a back header. Content is unchanged — only
// the navigation paradigm is touch-first.

interface Item { id: string; label: string; icon: React.ComponentType<{ size?: number }>; cap?: string; tint: string; }
interface Section { title: string; items: Item[]; }

const SECTIONS: Section[] = [
  { title: 'Account', items: [
    { id: 'ACCOUNT', label: 'Account Settings', icon: User, tint: '#FF8C00' },
    { id: 'FAMILY', label: 'Family', icon: Baby, tint: '#38bdf8' },
    { id: 'SAFETY', label: 'Content & Safety', icon: ShieldCheck, tint: '#34d399' },
    { id: 'ALIASES', label: 'Emails & Aliases', icon: Mail, tint: '#a78bfa' },
    { id: 'NETWORKS', label: 'Social Networks', icon: Share2, tint: '#f472b6' },
  ] },
  { title: 'My Content', items: [
    { id: 'ASSETS', label: 'My Assets', icon: Database, tint: '#FF8C00' },
    { id: 'PHOTOS', label: 'Photo Gallery', icon: ImageIcon, tint: '#38bdf8' },
    { id: 'WORLDS', label: 'My Worlds', icon: Globe, tint: '#34d399' },
    { id: 'INTERESTS', label: 'Interest Notebook', icon: Notebook, tint: '#a78bfa' },
  ] },
  { title: 'Appearance', items: [
    { id: 'THEMES', label: 'Theme Presets', icon: LayoutTemplate, tint: '#f472b6' },
    { id: 'SIDEBAR', label: 'Sidebar Config', icon: LayoutGrid, tint: '#FF8C00' },
    { id: 'MAILING_LIST', label: 'Mailing List', icon: Send, tint: '#38bdf8' },
  ] },
  { title: 'Broadcast', items: [
    { id: 'BROADCAST', label: 'Master Control', icon: Tv, cap: 'LIVE_STREAM', tint: '#ef4444' },
    { id: 'RADIO_MANAGER', label: 'Artist Radio Station', icon: Radio, cap: 'RUN_RADIO', tint: '#a78bfa' },
  ] },
  { title: 'Creator Studios', items: [
    { id: 'FILM_STUDIO', label: 'Film · Distribution', icon: Film, cap: 'CREATE_VIDEO', tint: '#FF8C00' },
    { id: 'FILM_RIGHTS', label: 'Film · Rights & Docs', icon: FileText, cap: 'CREATE_VIDEO', tint: '#FF8C00' },
    { id: 'FILM_ANALYTICS', label: 'Film · Analytics', icon: BarChart2, cap: 'CREATE_VIDEO', tint: '#FF8C00' },
    { id: 'MUSIC_STUDIO', label: 'Music Hub', icon: Music2, cap: 'CREATE_MUSIC', tint: '#a78bfa' },
    { id: 'ARTIST_RADIO', label: 'Artist Radio', icon: Radio, cap: 'CREATE_MUSIC', tint: '#a78bfa' },
    { id: 'PODCAST_HUB', label: 'Podcast RSS', icon: Rss, cap: 'CREATE_MUSIC', tint: '#a78bfa' },
    { id: 'AUDIO_HEALTH', label: 'Audio Health', icon: Activity, cap: 'CREATE_MUSIC', tint: '#a78bfa' },
    { id: 'BOOKS_STUDIO', label: 'Books Hub', icon: BookOpen, cap: 'CREATE_BOOK', tint: '#f59e0b' },
    { id: 'SERIAL_SCHEDULER', label: 'Serial Scheduler', icon: CalendarClock, cap: 'CREATE_BOOK', tint: '#f59e0b' },
    { id: 'BOOK_CLUBS', label: 'Book Clubs', icon: Users, cap: 'CREATE_BOOK', tint: '#f59e0b' },
    { id: 'CLASSROOM_ANALYTICS', label: 'Classroom Analytics', icon: BarChart2, cap: 'TEACH', tint: '#38bdf8' },
    { id: 'CERTIFICATES', label: 'Certificates', icon: CheckSquare, cap: 'TEACH', tint: '#38bdf8' },
  ] },
  { title: 'Business', items: [
    { id: 'STORE_MANAGEMENT', label: 'Store Management', icon: ShoppingBag, cap: 'SELL_MERCH', tint: '#34d399' },
    { id: 'REVENUE', label: 'Revenue & Money', icon: DollarSign, cap: 'MONETIZE', tint: '#34d399' },
  ] },
];

// Flat id → label, so the detail view's back header can title itself.
export const SETTINGS_TAB_LABELS: Record<string, string> =
  SECTIONS.reduce((acc, s) => { s.items.forEach((i) => { acc[i.id] = i.label; }); return acc; }, {} as Record<string, string>);

const initials = (name?: string) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const MobileSettingsMenu: React.FC<{
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  visible: (cap?: string) => boolean;   // capability gate (closes over profile in the parent)
  onSelect: (tabId: string) => void;
  onExit: () => void;
}> = ({ displayName, handle, avatarUrl, visible, onSelect, onExit }) => (
  <div className="absolute inset-0 z-40 bg-[#020202] overflow-y-auto overscroll-contain">
    {/* header */}
    <div
      className="sticky top-0 z-10 bg-[#020202]/90 backdrop-blur-xl px-5 pb-3 flex items-center justify-between border-b border-white/5"
      style={{ paddingTop: 'max(0.9rem, env(safe-area-inset-top))' }}
    >
      <h1 className="text-xl font-black text-white tracking-tight">Settings</h1>
      <button onClick={onExit} className="h-9 px-4 rounded-full bg-white/8 text-white/70 text-xs font-bold active:bg-white/15">Done</button>
    </div>

    {/* profile card → Account */}
    <button
      onClick={() => onSelect('ACCOUNT')}
      className="mx-4 mt-4 w-[calc(100%-2rem)] flex items-center gap-4 p-4 rounded-3xl bg-white/[0.04] border border-white/10 active:bg-white/[0.08] text-left"
    >
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
        : <div className="w-14 h-14 rounded-full shrink-0 bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center text-white font-black text-lg">{initials(displayName)}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-white font-bold text-base truncate">{displayName || 'Your account'}</div>
        <div className="text-white/40 text-sm truncate">{handle ? `@${handle}` : 'Manage profile, aliases & more'}</div>
      </div>
      <ChevronRight size={20} className="text-white/25 shrink-0" />
    </button>

    {/* grouped sections */}
    <div className="px-4 pt-2 pb-8 space-y-7">
      {SECTIONS.map((section) => {
        const items = section.items.filter((i) => visible(i.cap));
        if (!items.length) return null;
        return (
          <div key={section.title}>
            <div className="px-2 pb-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/30">{section.title}</div>
            <div className="rounded-3xl bg-white/[0.03] border border-white/8 overflow-hidden">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-4 pl-3.5 pr-4 py-3.5 text-left active:bg-white/[0.06] ${i ? 'border-t border-white/[0.06]' : ''}`}
                  style={{ minHeight: 56 }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.tint + '22', color: item.tint }}>
                    <item.icon size={19} />
                  </span>
                  <span className="flex-1 text-white text-[15px] font-medium truncate">{item.label}</span>
                  <ChevronRight size={19} className="text-white/25 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* exit */}
      <button
        onClick={onExit}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl bg-white/[0.03] border border-white/8 text-white/50 text-sm font-bold active:bg-white/[0.06]"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <LogOut size={17} /> Exit Dashboard
      </button>
    </div>
  </div>
);

export default MobileSettingsMenu;
