import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2, Minimize2, Search, ChevronDown, Play, Pause,
  Volume2, Compass, Home, Music2, Zap, Film, Video as VideoIcon,
  Gamepad2, Globe, BookOpen, GraduationCap, FlaskConical,
  LayoutPanelTop, Grid3x3, Mail, MessageSquare, ShoppingBag,
  Building2, Clapperboard, MonitorPlay, Settings as SettingsIcon,
  User, Sparkles, Activity, Newspaper, Disc3, MapPin, Megaphone,
  Radio, Ticket, Shield, Heart, Landmark, Minus, Square, X,
} from 'lucide-react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { isWindowsApp, startWindowDrag, minimizeWindow, maximizeWindow, closeWindow } from '../services/windowsBridgeService';

export interface DesktopGlobalToolbarProps {
  view: string;
  onNavigate: (view: any) => void;
  user?: any;
  userProfile?: any;
  activePersonaKey?: string;
  onOpenPersonaModal?: () => void;
  onOpenSearch?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isWindowsNative?: boolean;
}

interface AppDestination {
  id: string;
  label: string;
  category: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const APP_DESTINATIONS: AppDestination[] = [
  // Discover
  { id: 'DASHBOARD', label: 'Front Row', category: 'Discover', icon: Home },
  { id: 'FEED', label: 'Plajah Social', category: 'Discover', icon: Compass },
  { id: 'WORLDS', label: 'Worlds', category: 'Discover', icon: Globe },
  { id: 'SEARCH', label: 'Explore & Search', category: 'Discover', icon: Search },

  // Entertainment
  { id: 'MUSIC', label: 'Chora Music', category: 'Entertainment', icon: Music2 },
  { id: 'VIDEOS', label: 'Reello Video', category: 'Entertainment', icon: VideoIcon },
  { id: 'MOVIES_TV', label: 'Taleo Cinema', category: 'Entertainment', icon: Film },
  { id: 'RADIO', label: 'Radio Stream', category: 'Entertainment', icon: Radio },
  { id: 'GAMES', label: 'Arcade', category: 'Entertainment', icon: Gamepad2 },
  { id: 'LIVE_HUB', label: 'Live Hub', category: 'Entertainment', icon: Sparkles },
  { id: 'PPV_EVENTS', label: 'Live Events', category: 'Entertainment', icon: Ticket },

  // Sports & News
  { id: 'PLAJAH_SPORTS', label: 'Plajah Sports', category: 'Sports & News', icon: Zap },
  { id: 'HEALTH_FITNESS', label: 'Health & Fitness', category: 'Sports & News', icon: Activity },
  { id: 'ARTICLES', label: 'The Newstand', category: 'Sports & News', icon: Newspaper },

  // Creation & Studio
  { id: 'FABULA', label: 'Fabula Studio', category: 'Creation & Studio', icon: Film },
  { id: 'AMBO_PRO', label: 'Ambo Stage', category: 'Creation & Studio', icon: MonitorPlay },
  { id: 'TELA', label: 'Tela Studio', category: 'Creation & Studio', icon: LayoutPanelTop },
  { id: 'PLAJAH_PIXELS', label: 'Plajah Pixels', category: 'Creation & Studio', icon: Grid3x3 },
  { id: 'TV_STUDIO', label: 'TV Broadcast Studio', category: 'Creation & Studio', icon: Clapperboard },
  { id: 'MELOS', label: 'Melos Audio Lab', category: 'Creation & Studio', icon: Music2 },
  { id: 'ARTIST_MANAGER', label: 'Artist Manager', category: 'Creation & Studio', icon: Building2 },

  // Education & Community
  { id: 'CLASSROOMS', label: 'Academia', category: 'Education & Community', icon: GraduationCap },
  { id: 'BOOKS', label: 'Lorea Library', category: 'Education & Community', icon: BookOpen },
  { id: 'PLAJAH_LABS', label: 'Museion Labs', category: 'Education & Community', icon: FlaskConical },
  { id: 'STORE_HUB', label: 'Store', category: 'Education & Community', icon: ShoppingBag },
  { id: 'POSTMAN', label: 'The Postman', category: 'Education & Community', icon: Mail },
  { id: 'CHAT', label: 'Chat & Community', category: 'Education & Community', icon: MessageSquare },
];

export const DesktopGlobalToolbar: React.FC<DesktopGlobalToolbarProps> = ({
  view,
  onNavigate,
  user,
  userProfile,
  activePersonaKey,
  onOpenPersonaModal,
  onOpenSearch,
  isFullscreen,
  onToggleFullscreen,
  isWindowsNative = false,
}) => {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Global Player Context for live playback indicator
  let playerState: any = null;
  try {
    playerState = useGlobalPlayerState();
  } catch {
    // Graceful fallback if mounted outside provider
  }

  const currentTrack = playerState?.currentTrack;
  const isPlaying = playerState?.isPlaying;
  const togglePlayPause = playerState?.togglePlayPause;

  // Active view metadata
  const currentApp = APP_DESTINATIONS.find(d => d.id === view) || {
    id: view,
    label: view.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    category: 'Application',
    icon: Sparkles,
  };
  const CurrentIcon = currentApp.icon;

  // Click outside to close switcher
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setIsSwitcherOpen(false);
      }
    };
    if (isSwitcherOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isSwitcherOpen]);

  // Window drag handler for Windows native host
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag on left click and ignore if target is an interactive element
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag="true"]') || target.closest('button') || target.closest('input')) {
      return;
    }
    if (isWindowsNative || isWindowsApp()) {
      startWindowDrag();
    }
  };

  // Group switcher items
  const categories = Array.from(new Set(APP_DESTINATIONS.map(d => d.category)));

  return (
    <header
      onPointerDown={handlePointerDown}
      className={`h-10 w-full shrink-0 flex items-center justify-between select-none relative z-[100] transition-colors duration-200 border-b border-white/[0.08] bg-[#0c0816]/92 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
        isWindowsNative && !isFullscreen ? 'pr-[144px]' : 'pr-3'
      }`}
      style={{
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* ── Left: Brand + Breadcrumb + App Switcher ── */}
      <div className="flex items-center gap-2 pl-3 min-w-0" data-no-drag="true" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Monogram / Home Button */}
        <button
          onClick={() => onNavigate('DASHBOARD')}
          title="Plajah Front Row (Home)"
          className="w-6 h-6 rounded-md grid place-items-center font-display italic text-white text-[0.8rem] font-black shrink-0 transition-transform hover:scale-105 active:scale-95 shadow-sm"
          style={{
            background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
          }}
        >
          P
        </button>

        {/* Brand Text */}
        <span className="font-display font-extrabold text-xs tracking-wider text-white/90 hidden sm:inline select-none">
          PLAJAH
        </span>

        <span className="text-white/20 text-xs hidden sm:inline select-none">/</span>

        {/* Current App Breadcrumb with Switcher Trigger */}
        <div className="relative" ref={switcherRef}>
          <button
            onClick={() => setIsSwitcherOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
              isSwitcherOpen
                ? 'bg-white/15 text-white border border-white/20'
                : 'text-white/80 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
            title="Switch platform application"
          >
            <CurrentIcon size={13} className="text-small-orange shrink-0" />
            <span className="truncate max-w-[140px] md:max-w-[200px]">{currentApp.label}</span>
            <ChevronDown size={11} className={`text-white/50 transition-transform duration-200 ${isSwitcherOpen ? 'rotate-180 text-white' : ''}`} />
          </button>

          {/* Quick App Switcher Flyout */}
          {isSwitcherOpen && (
            <div
              className="absolute left-0 top-full mt-1.5 w-72 max-h-[75vh] overflow-y-auto custom-scrollbar rounded-xl bg-[#140d22]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-2 z-[200] animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="px-2 py-1 mb-1 border-b border-white/10 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-black text-white/40">Plajah Applications</span>
                <span className="text-[9px] text-white/30 font-mono">⌘K / Esc</span>
              </div>

              {categories.map(cat => {
                const items = APP_DESTINATIONS.filter(d => d.category === cat);
                return (
                  <div key={cat} className="mb-2">
                    <p className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-small-orange/70">
                      {cat}
                    </p>
                    <div className="grid grid-cols-1 gap-0.5">
                      {items.map(item => {
                        const ItemIcon = item.icon;
                        const isCurrent = item.id === view;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              onNavigate(item.id);
                              setIsSwitcherOpen(false);
                            }}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                              isCurrent
                                ? 'bg-small-orange/20 text-white font-semibold border border-small-orange/40'
                                : 'text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <ItemIcon size={14} className={isCurrent ? 'text-small-orange' : 'text-white/50'} />
                            <span className="truncate flex-1">{item.label}</span>
                            {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-small-orange shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Search / Command Launcher & Now Playing Pill ── */}
      <div className="flex items-center gap-2 min-w-0 px-2 flex-1 justify-center max-w-xl" data-no-drag="true" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Command Search Pill */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 h-7 px-3 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/20 transition-all text-white/50 hover:text-white/80 text-xs w-48 sm:w-64 max-w-full justify-between"
          title="Search destinations and content (Ctrl+K / ⌘K)"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Search size={12} className="text-white/40 shrink-0" />
            <span className="truncate text-[11px]">Search or switch apps...</span>
          </div>
          <kbd className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded bg-white/10 font-mono text-white/60">
            ⌘K
          </kbd>
        </button>

        {/* Now Playing Pill (when audio is active) */}
        {currentTrack && (
          <div className="hidden lg:flex items-center gap-2 h-7 px-2.5 rounded-full bg-white/[0.06] border border-white/10 max-w-[200px] shrink-0 animate-in fade-in duration-200">
            {/* Equalizer animation */}
            <div className="flex items-end gap-0.5 h-3 shrink-0">
              <span
                className={`w-0.5 bg-small-orange rounded-full transition-all ${
                  isPlaying ? 'animate-pulse h-3' : 'h-1.5 opacity-50'
                }`}
              />
              <span
                className={`w-0.5 bg-fuchsia-500 rounded-full transition-all ${
                  isPlaying ? 'animate-pulse h-2.5' : 'h-1.5 opacity-50'
                }`}
                style={{ animationDelay: '150ms' }}
              />
              <span
                className={`w-0.5 bg-small-orange rounded-full transition-all ${
                  isPlaying ? 'animate-pulse h-3.5' : 'h-2 opacity-50'
                }`}
                style={{ animationDelay: '300ms' }}
              />
            </div>

            {/* Track Info */}
            <button
              onClick={() => onNavigate('PLAYER')}
              className="text-[11px] text-white/80 hover:text-white truncate font-medium text-left"
              title={`${currentTrack.title} — ${currentTrack.artist || 'Plajah Music'}`}
            >
              <span className="truncate">{currentTrack.title}</span>
            </button>

            {/* Play / Pause toggle */}
            {togglePlayPause && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlayPause();
                }}
                className="w-5 h-5 rounded-full grid place-items-center hover:bg-white/15 text-white/70 hover:text-white transition-colors shrink-0"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={10} /> : <Play size={10} className="translate-x-px" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Persona, Fullscreen Toggle, & Window Controls ── */}
      <div className="flex items-center gap-2 shrink-0" data-no-drag="true" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Active Persona / Profile Chip */}
        {activePersonaKey && (
          <button
            onClick={onOpenPersonaModal}
            className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white transition-colors"
            title="Switch Persona / Organization"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>{activePersonaKey}</span>
          </button>
        )}

        {/* ── Full Screen Mode Toggle Button ── */}
        <button
          onClick={onToggleFullscreen}
          className={`h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all border ${
            isFullscreen
              ? 'bg-small-orange/20 text-small-orange border-small-orange/40 shadow-sm'
              : 'text-white/70 hover:text-white hover:bg-white/10 border-white/[0.08] hover:border-white/20'
          }`}
          title={isFullscreen ? 'Exit Full Screen Mode (F11 / Esc)' : 'Enter Full Screen Mode (F11)'}
        >
          {isFullscreen ? (
            <>
              <Minimize2 size={13} className="shrink-0" />
              <span className="hidden xl:inline text-[11px]">Exit Full Screen</span>
            </>
          ) : (
            <>
              <Maximize2 size={13} className="shrink-0" />
              <span className="hidden xl:inline text-[11px]">Full Screen</span>
            </>
          )}
        </button>

        {/* Non-native Window Controls (rendered in browser/PWA desktop mode) */}
        {!isWindowsNative && (
          <div className="hidden sm:flex items-center gap-1 border-l border-white/10 pl-2">
            <button
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
              }}
              className="w-7 h-7 rounded grid place-items-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimize window"
            >
              <Minus size={13} />
            </button>
            <button
              onClick={onToggleFullscreen}
              className="w-7 h-7 rounded grid place-items-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title={isFullscreen ? 'Restore' : 'Maximize'}
            >
              <Square size={11} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default DesktopGlobalToolbar;
