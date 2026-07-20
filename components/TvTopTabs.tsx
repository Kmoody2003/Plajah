import React from 'react';
import { Film, Music2, Video, User } from 'lucide-react';
import { TV_NAV_VIEWS } from '../services/tvCapabilities';

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
}> = ({ activeView, onSelect }) => (
  <nav
    className="flex items-center gap-2 px-8 py-3 bg-black/80 border-b border-white/10"
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
  </nav>
);

export default TvTopTabs;
