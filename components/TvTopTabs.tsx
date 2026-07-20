import React from 'react';
import { Film, Music2, Video, User, Play, Pause } from 'lucide-react';
import { TV_NAV_VIEWS } from '../services/tvCapabilities';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../src/lib/imageThumb';

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
}> = ({ activeView, onSelect, onOpenNowPlaying }) => {
  const { currentTrack, currentAlbum, isPlaying } = useGlobalPlayer();
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;

  return (
  <nav
    // z-[60] and opaque: several views mount their own `fixed top-0 z-50` header, which drew
    // straight through this bar. Sitting above them and painting solid keeps one nav visible
    // instead of two overlapping ones.
    className="sticky top-0 z-[60] flex items-center gap-2 px-8 py-3 bg-[#0a0a0c] border-b border-white/10"
    // Marks this as a nav row so the D-pad layer treats it as one band rather than
    // hunting for the "nearest" tab across the whole screen.
    data-tv-navbar
    role="tablist"
  >
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
          className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full font-black uppercase tracking-widest text-[11px] transition-colors ${
            active
              ? 'bg-white text-black'
              : 'text-white/55 hover:text-white hover:bg-white/10'
          }`}
        >
          <Icon size={16} />
          {meta.label}
        </button>
      );
    })}

    {/* Now Playing lives here rather than in a corner overlay: once you leave the player to
        browse, this is the way back, and on a remote the way back must be somewhere you can
        always reach. Only appears when something is actually playing. */}
    {currentTrack && (
      <button
        data-tv-focusable
        onClick={onOpenNowPlaying}
        className="ml-auto flex items-center gap-3 pl-1.5 pr-5 py-1.5 rounded-full bg-white/[0.07] border border-white/12 hover:bg-white/[0.14] transition-colors max-w-[22rem]"
        title="Back to what's playing"
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
  </nav>
  );
};

export default TvTopTabs;
