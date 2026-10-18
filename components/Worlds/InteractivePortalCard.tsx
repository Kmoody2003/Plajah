import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Globe, Lock, Sparkles, Users, Scroll, History, Music2, Eye, ArrowUpRight,
  Compass, Cpu, Layers, Film
} from 'lucide-react';
import { IPWorld, Character } from '../../types';
import { WorldPortalThemeId, WORLD_PORTAL_THEMES } from '../../data/worldsShowcaseData';

export interface PortalCardData {
  world: IPWorld & {
    tagline?: string;
    genreLabel?: string;
    portalCoordinates?: string;
    realmQuote?: string;
    secondaryBackdrop?: string;
    storyIntelMeta?: {
      filmsLinked: number;
      booksLinked: number;
      albumsLinked: number;
      scenesExtracted: number;
      shotsIndexed: number;
      dialogueLinesSynced: number;
      graphicNovelPages: number;
      universeAffinityScore: number;
      crossoverCharacters: string[];
      keyMacGuffins: string[];
      councilArchetype: string;
    };
  };
  characters?: Character[];
  loreCount?: number;
  timelineCount?: number;
  isShowcase?: boolean;
}

interface InteractivePortalCardProps {
  item: PortalCardData;
  theme: WorldPortalThemeId;
  index: number;
  onEnterPortal: (item: PortalCardData) => void;
  onQuickPeek: (item: PortalCardData) => void;
}

export const InteractivePortalCard: React.FC<InteractivePortalCardProps> = ({
  item,
  theme,
  index,
  onEnterPortal,
  onQuickPeek,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });
  const tSpec = WORLD_PORTAL_THEMES[theme];
  const { world, characters = [], loreCount = 0, timelineCount = 0, isShowcase } = item;

  const charCount = characters.length || world.characterIds?.length || 0;
  const effectiveLoreCount = loreCount || world.loreIds?.length || 0;
  const effectiveTimelineCount = timelineCount || world.timelineIds?.length || 0;
  const accent = world.themeConfig?.primaryColor || tSpec.primaryAccent;
  const secondary = world.themeConfig?.secondaryColor || tSpec.secondaryAccent;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    setTilt({
      rx: (0.5 - ny) * 12,
      ry: (nx - 0.5) * 14,
      mx: nx * 100,
      my: ny * 100,
      hovered: true,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });
  };

  // Shape geometry per theme:
  // ASTRAL_GATEWAY: Rounded cosmic monolith with a living circular/elliptical Stargate iris window
  // MYTHIC_ORRERY: Tall Sovereign Cathedral Arch (`rounded-t-[11rem] rounded-b-[2rem]`) with brass astrolabe Filigree
  // QUANTUM_LOOM: Razor-cut Anamorphic Reality Breach with glowing scanline brackets & telemetry
  const frameClass =
    theme === 'MYTHIC_ORRERY'
      ? 'rounded-t-[9.5rem] rounded-b-[2rem]'
      : theme === 'QUANTUM_LOOM'
      ? 'rounded-[1.5rem] clip-quantum'
      : 'rounded-[2.75rem]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.08 }}
      style={{ perspective: '1200px' }}
      className="group relative"
    >
      {/* Outer Portal Energy Aura */}
      <div
        className={`absolute -inset-1 ${frameClass} opacity-30 group-hover:opacity-90 blur-xl transition-all duration-700 pointer-events-none`}
        style={{
          background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, ${accent}, ${secondary}, transparent 75%)`,
        }}
      />

      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => onEnterPortal(item)}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
          transition: tilt.hovered ? 'transform 80ms ease-out' : 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
          borderColor: tilt.hovered ? accent : 'rgba(255,255,255,0.13)',
        }}
        className={`relative h-[31rem] ${frameClass} overflow-hidden cursor-pointer border bg-[#06050C] shadow-[0_25px_70px_rgba(0,0,0,0.85)] select-none flex flex-col justify-between`}
      >
        {/* ── LAYER 1: Deep Realm Horizon Image (Parallax Shift) ── */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out"
          style={{
            transform: tilt.hovered
              ? `scale(1.14) translate(${(50 - tilt.mx) * 0.18}px, ${(50 - tilt.my) * 0.18}px)`
              : 'scale(1.02)',
          }}
        >
          <img
            src={world.coverImage || `https://picsum.photos/seed/${world.id}/900/700`}
            alt={world.name}
            className="w-full h-full object-cover opacity-75 group-hover:opacity-95 transition-opacity duration-700"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                theme === 'MYTHIC_ORRERY'
                  ? 'linear-gradient(180deg, rgba(10,8,12,0.25) 0%, rgba(10,8,12,0.55) 48%, rgba(7,6,9,0.97) 92%)'
                  : theme === 'QUANTUM_LOOM'
                  ? 'linear-gradient(180deg, rgba(2,6,13,0.3) 0%, rgba(2,6,13,0.6) 50%, rgba(2,6,13,0.98) 92%)'
                  : 'linear-gradient(180deg, rgba(3,2,10,0.15) 0%, rgba(3,2,10,0.52) 48%, rgba(3,2,10,0.97) 92%)',
            }}
          />
        </div>

        {/* ── LAYER 2: Theme-Specific Dimensional Aperture / Portal Frame Overlay ── */}
        {theme === 'ASTRAL_GATEWAY' && (
          <div className="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
            <div className="relative w-64 h-64 flex items-center justify-center">
              {/* Outer rotating stargate rune ring */}
              <div
                className="absolute inset-0 rounded-full border border-dashed transition-transform duration-1000 group-hover:rotate-45 group-hover:scale-110"
                style={{ borderColor: `${accent}66`, boxShadow: `inset 0 0 40px ${accent}33, 0 0 30px ${accent}22` }}
              />
              {/* Inner counter-rotating horizon ring */}
              <div
                className="absolute inset-4 rounded-full border transition-transform duration-1000 group-hover:-rotate-45 group-hover:scale-105"
                style={{ borderColor: `${secondary}55` }}
              />
              {/* Central dimensional lens glare */}
              <div
                className="w-44 h-44 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: `radial-gradient(circle, transparent 40%, ${accent}22 75%, ${secondary}44 100%)`,
                }}
              />
            </div>
          </div>
        )}

        {theme === 'MYTHIC_ORRERY' && (
          <div className="absolute inset-3 rounded-t-[8.8rem] rounded-b-[1.5rem] border pointer-events-none transition-all duration-500"
            style={{
              borderColor: tilt.hovered ? `${accent}88` : 'rgba(245, 158, 11, 0.25)',
              boxShadow: tilt.hovered ? `inset 0 0 35px rgba(245,158,11,0.18)` : 'none',
            }}
          >
            {/* Keystone crest at top of cathedral arch */}
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#09080C] border text-[8px] font-black tracking-[0.35em] uppercase"
              style={{ borderColor: `${accent}66`, color: accent }}>
              {world.timelineConfig?.startYear ?? 0} — {world.timelineConfig?.endYear ?? 3000} {world.timelineConfig?.unitName || 'ERAS'}
            </div>
          </div>
        )}

        {theme === 'QUANTUM_LOOM' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner HUD brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2" style={{ borderColor: accent }} />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2" style={{ borderColor: accent }} />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2" style={{ borderColor: secondary }} />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2" style={{ borderColor: secondary }} />
            {/* Horizontal scanline */}
            <div
              className="absolute inset-x-0 h-[1px] opacity-40 group-hover:opacity-90 transition-all"
              style={{
                top: `${tilt.my}%`,
                background: `linear-gradient(90deg, transparent, ${accent}, ${secondary}, transparent)`,
              }}
            />
          </div>
        )}

        {/* ── LAYER 3: Top Portal Telemetry & Status Header ── */}
        <div className={`relative z-10 p-6 flex items-center justify-between gap-2 ${theme === 'MYTHIC_ORRERY' ? 'pt-9 px-8' : ''}`}>
          <div className="flex items-center gap-2 flex-wrap">
            {world.status === 'PUBLISHED' ? (
              <span
                className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 backdrop-blur-md border"
                style={{
                  backgroundColor: `${accent}20`,
                  borderColor: `${accent}55`,
                  color: '#fff',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                Gateway Open
              </span>
            ) : (
              <span className="px-3 py-1 bg-black/60 text-white/60 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/15 backdrop-blur-md flex items-center gap-1.5">
                <Lock size={10} /> Architect Draft
              </span>
            )}

            {world.storyIntelMeta && (
              <span className="px-2.5 py-1 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-200 text-[8px] font-black uppercase tracking-widest backdrop-blur-md flex items-center gap-1">
                <Sparkles size={9} className="text-violet-300" />
                Story Intel {world.storyIntelMeta.universeAffinityScore}%
              </span>
            )}

            {world.backgroundMusicAlbumId && (
              <span className="px-2.5 py-1 rounded-full bg-black/50 border border-white/15 text-white/70 text-[8px] font-black uppercase tracking-widest backdrop-blur-md flex items-center gap-1">
                <Music2 size={9} /> Chora OST
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickPeek(item);
            }}
            title="Peer through Portal Lens before entering"
            className="px-3 py-1.5 rounded-full bg-black/65 hover:bg-white text-white/80 hover:text-black border border-white/20 text-[9px] font-black uppercase tracking-widest backdrop-blur-md transition-all flex items-center gap-1.5 shrink-0"
          >
            <Eye size={11} /> Peer Inside
          </button>
        </div>

        {/* ── LAYER 4: Mid-Portal Floating Inhabitant Orbs (Revealed Inside the Aperture) ── */}
        <div className="relative z-10 px-6 my-auto flex flex-col items-center text-center pointer-events-none">
          {world.portalCoordinates && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 border border-white/10 backdrop-blur-md mb-3">
              <Compass size={10} style={{ color: accent }} />
              <span className="text-[8px] font-mono font-bold uppercase tracking-[0.25em] text-white/70">
                {world.portalCoordinates}
              </span>
            </div>
          )}

          {/* Character Portraits Floating Inside the Portal Window */}
          {characters.length > 0 && (
            <div
              className="flex items-center justify-center -space-x-2.5 mb-2 transition-transform duration-500 group-hover:scale-110"
              style={{
                transform: tilt.hovered
                  ? `translate(${(tilt.mx - 50) * 0.14}px, ${(tilt.my - 50) * 0.14}px)`
                  : 'none',
              }}
            >
              {characters.slice(0, 4).map((char, cIdx) => (
                <div
                  key={char.id || cIdx}
                  className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-black shadow-[0_0_20px_rgba(0,0,0,0.8)] transition-transform group-hover:mx-0.5"
                  style={{ borderColor: cIdx === 0 ? accent : 'rgba(255,255,255,0.35)' }}
                >
                  <img
                    src={char.imageUrl || `https://picsum.photos/seed/${char.id}/160/160`}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {characters.length > 4 && (
                <div className="w-10 h-10 rounded-2xl bg-black/80 border border-white/20 flex items-center justify-center text-[9px] font-black text-white">
                  +{characters.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── LAYER 5: Bottom Realm Identity, Story Intel Telemetry & Threshold CTA ── */}
        <div className="relative z-10 p-6 pt-3 space-y-3.5 bg-gradient-to-t from-black via-black/90 to-transparent">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[9px] font-black uppercase tracking-[0.28em]"
                style={{ color: accent }}
              >
                {world.genreLabel || `${world.worldType || 'FICTION'} UNIVERSE`}
              </span>
            </div>
            <h3 className={`text-2xl sm:text-[1.7rem] text-white leading-[1.02] ${tSpec.fontDisplayStyle}`}>
              {world.name}
            </h3>
            {world.tagline && (
              <p className="text-xs font-bold text-white/80 mt-1 line-clamp-1">
                {world.tagline}
              </p>
            )}
            <p className="text-[11px] text-white/55 line-clamp-2 leading-relaxed mt-1">
              {world.description}
            </p>
          </div>

          {/* Connected Media & Entity Telemetry Strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/75">
              <Users size={12} style={{ color: accent }} />
              <span>{charCount} Cast</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/75">
              <Scroll size={12} style={{ color: secondary }} />
              <span>{effectiveLoreCount} Lore</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/75">
              {world.storyIntelMeta ? (
                <>
                  <Film size={12} className="text-emerald-400" />
                  <span>{world.storyIntelMeta.scenesExtracted} Scenes</span>
                </>
              ) : (
                <>
                  <History size={12} className="text-emerald-400" />
                  <span>{effectiveTimelineCount} Events</span>
                </>
              )}
            </div>
          </div>

          {/* Step Through Portal CTA Bar */}
          <div
            className="w-full py-3 px-4 rounded-2xl flex items-center justify-between text-[10px] font-black uppercase tracking-[0.22em] transition-all duration-300 group-hover:scale-[1.01]"
            style={{
              background: tilt.hovered
                ? `linear-gradient(90deg, ${accent}, ${secondary})`
                : 'rgba(255,255,255,0.07)',
              color: tilt.hovered ? '#000000' : '#FFFFFF',
              border: `1px solid ${tilt.hovered ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
            }}
          >
            <span className="flex items-center gap-2">
              <Sparkles size={12} />
              Step Through Portal
            </span>
            <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InteractivePortalCard;
