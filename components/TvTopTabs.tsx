import React, { useEffect, useRef, useState } from 'react';
import { Film, Music2, Video, User, Play, Pause, Search } from 'lucide-react';
import { TV_NAV_VIEWS } from '../services/tvCapabilities';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../src/lib/imageThumb';
import Logo from './Logo';

/**
 * The television's entire top-level navigation: four tabs, always visible, always reachable.
 *
 * A sidebar is a pointer idea — it needs to be opened, it steals a press to enter and another to
 * leave, and on this app it was the thing viewers fell out of the app through. Four fixed tabs
 * across the top is how every TV app does it, because with a D-pad the shortest path to any
 * destination should be "up, then across".
 */
const TAB_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  MOVIES_TV:    { label: 'Taleo',   icon: Film },
  MUSIC:        { label: 'Chora',   icon: Music2 },
  VIDEOS:       { label: 'Reello',  icon: Video },
  USER_PROFILE: { label: 'Profile', icon: User },
};

const TvTopTabs: React.FC<{
  activeView: string;
  onSelect: (view: string) => void;
  /** Jump back to whatever is playing. */
  onOpenNowPlaying?: () => void;
  /** Open the cross-catalog search. */
  onOpenSearch?: () => void;
  /** True while the shell has handed keyboard focus to this bar (a capture screen pressed up). */
  focused?: boolean;
  /** Focus is leaving downward, back into the screen below. */
  onExitDown?: () => void;
}> = ({ activeView, onSelect, onOpenNowPlaying, onOpenSearch, focused = false, onExitDown }) => {
  const { currentTrack, currentAlbum, isPlaying } = useGlobalPlayer();
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;

  // Left-to-right focus order: the four tabs, then Search, then Now Playing (only when something is
  // playing). The brand cluster on the far left is decoration — not a focus stop.
  const items = [...TV_NAV_VIEWS, 'SEARCH', ...(currentTrack ? ['NOW_PLAYING'] : [])];
  const [idx, setIdx] = useState(0);

  // Refs so the handler can stay bound and read current values. Rebinding on every change of
  // `focused`/`idx`/`items` made the listener order depend on render timing, which is what put a
  // one-press lag on the way back down into the screen.
  const focusedRef = useRef(focused); focusedRef.current = focused;
  const idxRef = useRef(idx); idxRef.current = idx;
  const itemsRef = useRef(items); itemsRef.current = items;

  // Start on the tab you're already in, so arriving here doesn't lose your place.
  useEffect(() => {
    if (!focused) return;
    const i = TV_NAV_VIEWS.indexOf(activeView as any);
    setIdx(i >= 0 ? i : 0);
  }, [focused, activeView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const kc = e.keyCode || e.which;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'ArrowRight' || kc === 39 || kc === 22) { stop(); setIdx(i => Math.min(itemsRef.current.length - 1, i + 1)); return; }
      if (e.key === 'ArrowLeft'  || kc === 37 || kc === 21) { stop(); setIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown'  || kc === 40 || kc === 20) { stop(); onExitDown?.(); return; }
      if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) {
        stop();
        const target = itemsRef.current[idxRef.current];
        if (target === 'NOW_PLAYING') onOpenNowPlaying?.();
        else if (target === 'SEARCH') { onOpenSearch?.(); onExitDown?.(); }
        else { onSelect(target); onExitDown?.(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onSelect, onOpenNowPlaying, onOpenSearch, onExitDown]);

  const ringStyle = (key: string) =>
    focused && items[idx] === key
      ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)', transform: 'scale(1.04)' }
      : undefined;

  return (
  <nav
    // z-[60] and opaque: several views mount their own `fixed top-0 z-50` header, which drew
    // straight through this bar. Sitting above them and painting solid keeps one nav visible
    // instead of two overlapping ones.
    //
    // Three-column grid — brand | tabs | actions — so the tabs sit dead-centre no matter how wide
    // the brand or the now-playing chip get. `1fr auto 1fr` gives the two outer clusters equal
    // pull, which is what keeps the centre truly centred.
    className="sticky top-0 z-[60] grid grid-cols-[1fr_auto_1fr] items-center px-8 py-3 bg-[#0a0a0c] border-b border-white/10"
    // Marks this as a nav row so the D-pad layer treats it as one band rather than
    // hunting for the "nearest" tab across the whole screen.
    data-tv-navbar
    role="tablist"
  >
    {/* ── Brand (far left, persistent) ── the site's gradient chevron + wordmark + Early Access. */}
    <div className="flex items-center gap-3 min-w-0">
      <Logo size={30} />
      <span className="text-[19px] font-black tracking-tight text-white leading-none">Plajah</span>
      <span
        className="hidden sm:inline-block text-[9px] font-black uppercase tracking-[0.18em] text-white px-2.5 py-1 rounded-full leading-none"
        style={{ background: 'linear-gradient(120deg, #6B0099, #D40055 55%, #FF8C00)' }}
      >
        Early Access
      </span>
    </div>

    {/* ── Tabs (centre) ── */}
    <div className="flex items-center gap-2 justify-center">
      {TV_NAV_VIEWS.map((view) => {
        const meta = TAB_META[view];
        if (!meta) return null;
        const Icon = meta.icon;
        const active = activeView === view;
        return (
          <button
            key={view}
            role="tab"
            aria-selected={active}
            data-tv-focusable
            onClick={() => onSelect(view)}
            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full font-black uppercase tracking-widest text-[11px] transition-all ${
              active
                ? 'bg-white text-black'
                : 'text-white/55 hover:text-white hover:bg-white/10'
            }`}
            style={ringStyle(view)}
          >
            <Icon size={16} />
            {meta.label}
          </button>
        );
      })}
    </div>

    {/* ── Actions (far right) ── Search, then Now Playing. */}
    <div className="flex items-center gap-2.5 justify-end min-w-0">
      <button
        data-tv-focusable
        onClick={onOpenSearch}
        title="Search Plajah"
        aria-label="Search"
        className="flex items-center gap-2.5 px-5 py-2.5 rounded-full font-black uppercase tracking-widest text-[11px] text-white/55 hover:text-white hover:bg-white/10 transition-all shrink-0"
        style={ringStyle('SEARCH')}
      >
        <Search size={16} />
        <span className="hidden md:inline">Search</span>
      </button>

      {/* Now Playing: once you leave the player to browse, this is the way back, and on a remote the
          way back must be somewhere you can always reach. Only appears when something is playing. */}
      {currentTrack && (
        <button
          data-tv-focusable
          onClick={onOpenNowPlaying}
          className="flex items-center gap-3 pl-1.5 pr-5 py-1.5 rounded-full bg-white/[0.07] border border-white/12 hover:bg-white/[0.14] transition-all max-w-[18rem] min-w-0"
          title="Back to what's playing"
          style={ringStyle('NOW_PLAYING')}
        >
          <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center">
            {art ? <img src={thumb(art, THUMB.micro)} alt="" className="w-full h-full object-cover" />
                 : <Music2 size={14} className="text-white/50" />}
          </span>
          {isPlaying ? <Play size={13} className="text-emerald-400 shrink-0" /> : <Pause size={13} className="text-white/40 shrink-0" />}
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-bold text-white truncate">{(currentTrack as any).title || 'Now playing'}</span>
            <span className="block text-[9px] text-white/45 truncate">{(currentAlbum as any)?.artist || (currentTrack as any).artist || ''}</span>
          </span>
        </button>
      )}
    </div>
  </nav>
  );
};

export default TvTopTabs;
