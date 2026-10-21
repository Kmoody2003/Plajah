// CinemaProsceniumHero — the desktop album view's stage: the visual viewer runs edge to edge as the hero
// (Cinema), framed like a proscenium — soft shafts of light, a hairline stage edge, a glass-rimmed cover
// medallion, a serif eyebrow and one orange Play (Classical, from the Art Council's Cinema session).
// Presentational only: PlayerView owns playback, the stage engines and every action in the More menu.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ListPlus, Maximize2, MoreHorizontal, Pause, Play, Shuffle, ZapOff, type LucideIcon } from 'lucide-react';

export type CinemaStage = 'ART' | 'VISUALIZER' | 'SLIDESHOW' | 'VIDEO';

export interface CinemaMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  active?: boolean;
}

interface Props {
  backdropSrc?: string;
  stage: CinemaStage;
  stages: { id: CinemaStage; label: string }[];
  onStage: (stage: CinemaStage) => void;
  onFullscreen?: () => void;
  /** Visualizer / slideshow / video, rendered full-bleed (video is boxed above the identity row). */
  stageContent?: React.ReactNode;
  /** The scrubbable waveform that sits on the stage floor. */
  floor?: React.ReactNode;
  medallion: React.ReactNode;
  eyebrow: string;
  title: string;
  artist: string;
  onArtist?: () => void;
  meta: string[];
  badges?: React.ReactNode;
  isPlaying: boolean;
  onPlay: () => void;
  onShuffle?: () => void;
  onAddToPlaylist?: () => void;
  menu: CinemaMenuItem[][];
  onBack: () => void;
  fxHot?: boolean;
  onKillFx?: () => void;
  topRight?: React.ReactNode;
}

const DISPLAY = "'Bricolage Grotesque', var(--font-display), system-ui, sans-serif";
const SERIF = "Newsreader, Georgia, serif";
// Which of the eight stage bays catch light (1-based), and how strongly.
const SHAFTS: Record<number, number> = { 2: 0.10, 5: 0.18, 6: 0.18, 8: 0.10 };

const roundBtn = 'w-12 h-12 rounded-full grid place-items-center text-white border border-white/25 bg-black/30 backdrop-blur-md hover:bg-white/10 transition-colors';

const CinemaProsceniumHero: React.FC<Props> = ({
  backdropSrc, stage, stages, onStage, onFullscreen, stageContent, floor, medallion, eyebrow, title, artist, onArtist,
  meta, badges, isPlaying, onPlay, onShuffle, onAddToPlaylist, menu, onBack, fxHot, onKillFx, topRight,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const isVideo = stage === 'VIDEO';
  const titleSize = title.length > 28 ? 'clamp(2.5rem, 4.4vw, 4.25rem)' : 'clamp(3rem, 6vw, 5.5rem)';

  return (
    <section
      className="relative w-full overflow-hidden normal-case"
      style={{ height: isVideo ? 'clamp(560px, 82vh, 900px)' : 'clamp(460px, 62vh, 660px)', background: '#100A18' }}
    >
      {/* Stage — art backdrop or the live stage engine */}
      <div className="absolute inset-0">
        {backdropSrc && (
          <img
            src={backdropSrc}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: stage === 'ART' ? 'brightness(0.55) saturate(1.05)' : 'blur(40px) brightness(0.35)', transform: 'scale(1.06)' }}
          />
        )}
        {stage !== 'ART' && !isVideo && stageContent && <div className="absolute inset-0">{stageContent}</div>}
      </div>

      {/* Proscenium — warm wash, light shafts across eight bays, the stage edge */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(45% 75% at 68% 38%, rgba(255,140,0,0.30) 0%, rgba(212,0,85,0.26) 32%, rgba(107,0,153,0.34) 62%, rgba(16,10,24,0) 100%)', mixBlendMode: 'screen' }} />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none grid" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              borderRight: i < 7 ? '1px solid rgba(255,255,255,0.035)' : undefined,
              background: SHAFTS[i + 1] ? `linear-gradient(180deg, rgba(255,184,107,${SHAFTS[i + 1]}), rgba(255,184,107,0) 78%)` : undefined,
            }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '58%', background: 'linear-gradient(180deg, rgba(6,4,10,0) 0%, rgba(6,4,10,0.6) 50%, #06040A 100%)' }} />
      <div aria-hidden="true" className="absolute pointer-events-none" style={{ inset: '20px 20px 0 20px', border: '1px solid rgba(255,255,255,0.14)', borderBottom: 0, borderRadius: '26px 26px 0 0' }} />

      {isVideo && stageContent && (
        <div className="absolute z-10" style={{ left: 48, right: 48, top: 92, bottom: 230 }}>{stageContent}</div>
      )}

      {floor && <div className="absolute inset-x-0 bottom-0 z-[5]">{floor}</div>}

      {/* Top bar — back, stage switcher, fullscreen, more */}
      <div className="absolute z-30 flex items-center justify-between gap-6" style={{ top: 32, left: 48, right: 48 }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="h-11 flex items-center gap-2 text-white text-sm font-semibold hover:text-[#FFB86B] transition-colors">
            <ChevronLeft size={18} /> Chora
          </button>
          {fxHot && onKillFx && (
            <button type="button" onClick={onKillFx} title="Kill all DJ audio FX — reset the track to its natural, dry sound"
              className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[13px] font-semibold text-red-100 border border-red-400/60 bg-red-600/25 animate-pulse">
              <ZapOff size={14} /> Kill FX
            </button>
          )}
        </div>
        <nav aria-label="Viewer" className="flex items-center gap-7 text-sm font-semibold">
          {stages.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStage(s.id)}
              aria-pressed={stage === s.id}
              className="h-11 transition-colors"
              style={stage === s.id ? { color: '#fff', borderBottom: '2px solid #FF8C00' } : { color: 'rgba(255,255,255,0.72)', borderBottom: '2px solid transparent' }}
            >
              {s.label}
            </button>
          ))}
          {onFullscreen && (
            <button type="button" onClick={onFullscreen} className="h-11 flex items-center gap-1.5 text-white/70 hover:text-white transition-colors">
              <Maximize2 size={14} /> Fullscreen
            </button>
          )}
          {topRight}
        </nav>
      </div>

      {/* Identity — medallion, eyebrow, title, credits line, actions */}
      <div className="absolute z-20 flex items-end gap-9 pointer-events-none" style={{ left: 48, right: 48, bottom: 40 }}>
        <div
          className="shrink-0 rounded-full p-1.5 pointer-events-auto"
          style={{
            width: isVideo ? 132 : 'clamp(150px, 15vw, 216px)', aspectRatio: '1',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.38))',
            boxShadow: '0 30px 70px rgba(0,0,0,0.65)',
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-black">{medallion}</div>
        </div>
        <div className="flex-1 min-w-0 pb-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, color: '#FFB86B' }}>{eyebrow}</span>
            {badges}
          </div>
          <h1
            className="mt-2 text-white uppercase"
            style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: titleSize, lineHeight: 0.9, letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}
          >
            {title}
          </h1>
          <p className="mt-3.5 text-[15px] text-white/80 truncate">
            <button type="button" onClick={onArtist} disabled={!onArtist} className="pointer-events-auto font-bold text-white hover:text-[#FFB86B] transition-colors disabled:hover:text-white">{artist}</button>
            {meta.filter(Boolean).map(m => <span key={m}> · {m}</span>)}
          </p>
        </div>
        <div className="flex items-center gap-3 pb-1.5 pointer-events-auto">
          {onAddToPlaylist && <button type="button" onClick={onAddToPlaylist} aria-label="Add to playlist" title="Add this song to a playlist" className={roundBtn}><ListPlus size={19} /></button>}
          {onShuffle && <button type="button" onClick={onShuffle} aria-label="Shuffle" title="Shuffle this album" className={roundBtn}><Shuffle size={19} /></button>}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="More options" aria-expanded={menuOpen} className={roundBtn}><MoreHorizontal size={19} /></button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 bottom-[calc(100%+12px)] w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/12 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]" style={{ background: 'rgba(16,10,24,0.97)', backdropFilter: 'blur(20px)' }}>
                {menu.filter(g => g.length).map((group, gi) => (
                  <div key={gi} className={gi ? 'mt-1.5 pt-1.5 border-t border-white/10' : ''}>
                    {group.map(item => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        disabled={!item.onClick}
                        onClick={() => { item.onClick?.(); setMenuOpen(false); }}
                        className="w-full h-10 px-3 rounded-xl flex items-center gap-3 text-left text-sm font-medium hover:bg-white/8 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                        style={{ color: item.active ? '#FF8C00' : 'rgba(255,255,255,0.88)' }}
                      >
                        <item.icon size={16} className="shrink-0" style={{ color: item.active ? '#FF8C00' : 'rgba(255,255,255,0.55)' }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onPlay}
            className="h-[62px] pl-[26px] pr-8 rounded-full flex items-center gap-2.5 text-base font-extrabold text-[#06040A] bg-[#FF8C00] hover:brightness-110 active:scale-[0.98] transition"
            style={{ boxShadow: '0 0 0 6px rgba(255,140,0,0.16), 0 16px 40px rgba(255,140,0,0.35)' }}
          >
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default CinemaProsceniumHero;
