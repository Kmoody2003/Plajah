import React, { useEffect, useRef, useState } from 'react';
import { Film, Music2, Video, User, Play, Pause, Search, Radio } from 'lucide-react';
import { TV_NAV_VIEWS } from '../../services/tvCapabilities';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import Logo from '../Logo';

/**
 * TvSpine — a persistent left rail replacing the fixed top tab bar.
 *
 * This is "Spine", one of three TV redesign directions mocked up and reviewed
 * (Evolution/Spine/Channels — see the artifacts linked from project memory),
 * picked as the base for "Lineup". A rail is the shape that gets a viewer to
 * content fastest: every surface is one press away with no "go up to a bar
 * first" step, and it keeps the shell visible while browsing instead of a top
 * bar that scrolls out of view.
 *
 * DROP-IN REPLACEMENT FOR TvTopTabs — same props, same shell-focus contract
 * (a content screen's `useTvGrid` still hands focus back on "Up at row 0";
 * this shell still hands it forward on "Down" or "Right"). That is what makes
 * this swappable at a single conditional in App.tsx with zero changes to any
 * content screen's own D-pad logic: every screen already built against that
 * contract keeps working unmodified, whichever shell is mounted above it.
 *
 * A true "press Left to leave the rightmost content" gesture — the more
 * natural fit for a LEFT rail — would mean touching every content screen's
 * `useTvGrid` zone logic individually. That is real, valuable follow-up work,
 * not done here: this ships the rail with the exit gesture unchanged (Up),
 * which is the safe, additive way to land the shape of "Lineup" without
 * touching five other screens' tested navigation blind.
 */

const RAIL_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  SEARCH:       { label: 'Search',  icon: Search },
  MOVIES_TV:    { label: 'Taleo',   icon: Film },
  MUSIC:        { label: 'Chora',   icon: Music2 },
  VIDEOS:       { label: 'Reello',  icon: Video },
  LIVE_HUB:     { label: 'Live',    icon: Radio },
  USER_PROFILE: { label: 'Profile', icon: User },
};

/** Collapsed rail width. Exported so anything positioned beside it — a fixed
 *  overlay like LiveTvPlus, the App.tsx flow wrapper for the other screens —
 *  can read the same number rather than duplicating a magic pixel value. */
export const TV_SPINE_W = 84;
/** Expanded width when the rail itself holds focus. */
export const TV_SPINE_W_OPEN = 232;

const TvSpine: React.FC<{
  activeView: string;
  onSelect: (view: string) => void;
  onOpenNowPlaying?: () => void;
  onOpenSearch?: () => void;
  focused?: boolean;
  onExitDown?: () => void;
}> = ({ activeView, onSelect, onOpenNowPlaying, onOpenSearch, focused = false, onExitDown }) => {
  const { currentTrack, currentAlbum, isPlaying } = useGlobalPlayer();
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;

  // Top-to-bottom order: Search, the four surfaces, then Now Playing (only while
  // something plays) sits above Profile at the foot of the rail — matching
  // TvTopTabs' left-to-right order rotated 90°, so muscle memory carries over.
  const items = ['SEARCH', ...TV_NAV_VIEWS.filter(v => v !== 'USER_PROFILE'),
    ...(currentTrack ? ['NOW_PLAYING'] : []), 'USER_PROFILE'];
  const [idx, setIdx] = useState(0);
  // Whichever item leads the trailing group (Now Playing if present, else Profile)
  // gets the spacer margin that pushes that whole group to the foot of the rail.
  const footStart = currentTrack ? 'NOW_PLAYING' : 'USER_PROFILE';

  const focusedRef = useRef(focused); focusedRef.current = focused;
  const idxRef = useRef(idx); idxRef.current = idx;
  const itemsRef = useRef(items); itemsRef.current = items;

  useEffect(() => {
    if (!focused) return;
    const i = items.indexOf(activeView);
    setIdx(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, activeView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const kc = e.keyCode || e.which;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // Vertical rail: Down/Up move the selection (was Left/Right on the top bar).
      if (e.key === 'ArrowDown' || kc === 40 || kc === 20) { stop(); setIdx(i => Math.min(itemsRef.current.length - 1, i + 1)); return; }
      if (e.key === 'ArrowUp'   || kc === 38 || kc === 19) { stop(); setIdx(i => Math.max(0, i - 1)); return; }
      // Right exits into content (Down did that job on the top bar).
      if (e.key === 'ArrowRight' || kc === 39 || kc === 22) { stop(); onExitDown?.(); return; }
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

  const active = items[idx];
  const railW = focused ? TV_SPINE_W_OPEN : TV_SPINE_W;

  return (
    <nav
      // Fixed, not flowed: it overlays the left edge on top of whatever screen is
      // mounted below, rather than requiring every screen to sit inside a shared
      // flex row. Content screens get their inset from the App.tsx wrapper that
      // reads TV_SPINE_W, not from anything this component does to the DOM tree.
      className="fixed left-0 top-0 bottom-0 z-[70] flex flex-col gap-1 py-5 px-2.5 bg-[#0a0a0c] border-r border-white/10 transition-[width] duration-200 overflow-hidden"
      style={{ width: railW }}
      data-tv-navbar
      role="tablist"
      aria-orientation="vertical"
    >
      <div className="flex items-center gap-3 px-1.5 mb-3 h-11 shrink-0">
        <Logo size={26} />
        {focused && <span className="text-[15px] font-black tracking-tight text-white whitespace-nowrap">Plajah</span>}
      </div>

      {items.map((key) => {
        if (key === 'NOW_PLAYING') {
          return (
            <button
              key={key}
              data-tv-focusable
              onClick={onOpenNowPlaying}
              title="Back to what's playing"
              className={`flex items-center gap-3 h-14 px-2.5 rounded-2xl transition-all shrink-0 ${footStart === key ? 'mt-auto' : 'mt-1'} ${
                active === key ? 'bg-white text-black' : 'bg-white/[0.06] text-white hover:bg-white/[0.12]'
              }`}
              style={focused && active === key ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)', transform: 'scale(1.04)' } : undefined}
            >
              <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center">
                {art ? <img src={thumb(art, THUMB.micro)} alt="" className="w-full h-full object-cover" />
                     : <Music2 size={14} className={active === key ? 'text-black/50' : 'text-white/50'} />}
              </span>
              {isPlaying ? <Play size={12} className="shrink-0" /> : <Pause size={12} className="shrink-0 opacity-60" />}
              {focused && (
                <span className="min-w-0 text-left overflow-hidden">
                  <span className="block text-[10px] font-bold truncate">{(currentTrack as any)?.title || 'Now playing'}</span>
                </span>
              )}
            </button>
          );
        }

        const meta = RAIL_META[key];
        if (!meta) return null;
        const Icon = meta.icon;
        const isActive = active === key;
        const isCurrentView = key !== 'SEARCH' && key !== 'NOW_PLAYING' && activeView === key;

        return (
          <button
            key={key}
            role="tab"
            aria-selected={isCurrentView}
            data-tv-focusable
            onClick={() => onSelect(key)}
            className={`flex items-center gap-3 h-12 px-2.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shrink-0 ${
              footStart === key ? 'mt-auto' : ''
            } ${isActive
                ? 'bg-white/[0.1] text-white'
                : isCurrentView
                ? 'text-white/85'
                : 'text-white/45 hover:text-white hover:bg-white/[0.06]'
            }`}
            style={focused && isActive ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)', transform: 'scale(1.04)' } : undefined}
          >
            <Icon size={18} className="shrink-0" style={isCurrentView ? { color: '#FF8C00' } : undefined} />
            {focused && (
              isCurrentView
                ? <span className="whitespace-nowrap bg-gradient-to-r from-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">{meta.label}</span>
                : <span className="whitespace-nowrap">{meta.label}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default TvSpine;
