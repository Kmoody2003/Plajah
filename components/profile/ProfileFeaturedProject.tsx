/**
 * ProfileFeaturedProject — the body of the profile marquee.
 *
 * One project, put forward by the creator. If they haven't chosen one the slot falls
 * back to their most recent release, so it is never empty on an account with content
 * (and renders nothing at all on an account without any).
 *
 * The pick is stored on the profile as `featuredProject` ({ kind, id, setAt }) and is
 * cleared with `null` — NEVER `undefined`, which throws on a Firestore write.
 */
import React, { useMemo, useState } from 'react';
import { cleanDescription } from '../../utils/description';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Sparkles, Pencil, X, Check, RotateCcw } from 'lucide-react';
import type { Album, FeaturedProjectRef } from '../../types';
import { featuredProjectChoices, type FeaturedProjectView } from '../../hooks/useProfileMarquee';

interface ProfileFeaturedProjectProps {
  featured: FeaturedProjectView | null;
  albums: Album[];
  videos: any[];
  articles: any[];
  isOwnProfile: boolean;
  isMobile: boolean;
  /** Persisted by the profile view. `null` clears the pick back to "most recent release". */
  onSetFeatured: (ref: FeaturedProjectRef | null) => void;
  onPlayAlbum: (album: Album) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenVideo: (video: any) => void;
  onOpenArticle: (article: any) => void;
}

const fmtDate = (ms: number): string => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
};

const ProfileFeaturedProject: React.FC<ProfileFeaturedProjectProps> = ({
  featured,
  albums,
  videos,
  articles,
  isOwnProfile,
  isMobile,
  onSetFeatured,
  onPlayAlbum,
  onOpenAlbum,
  onOpenVideo,
  onOpenArticle,
}) => {
  const [picking, setPicking] = useState(false);
  const choices = useMemo(
    () => (picking ? featuredProjectChoices(albums, videos, articles).slice(0, 24) : []),
    [picking, albums, videos, articles],
  );

  if (!featured) return null;

  const open = () => {
    if (featured.kind === 'ALBUM' && featured.album) onOpenAlbum(featured.album);
    else if (featured.kind === 'VIDEO') onOpenVideo(featured.raw);
    else if (featured.kind === 'ARTICLE') onOpenArticle(featured.raw);
  };

  const canPlay = featured.kind === 'ALBUM' && !!featured.album?.tracks?.length;
  const description: string = cleanDescription(featured.album?.description) || cleanDescription(featured.raw?.description);
  const trackCount = featured.album?.tracks?.length || 0;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="m-0 text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Featured project</h3>
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.12em] text-small-orange transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-small-orange rounded"
          >
            <Pencil size={10} /> Change featured project
          </button>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-3xl border border-white/10 p-5 ${isMobile ? '' : 'lg:p-6'}`}
        style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))' }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(80% 120% at 100% 0%, rgba(255,140,0,0.14), transparent 60%)' }}
        />
        <div className={`relative flex gap-5 ${isMobile ? 'flex-col items-center text-center' : 'lg:gap-6'}`}>
          {/* Cover */}
          <div className={`relative shrink-0 ${isMobile ? 'w-40' : 'w-[176px] lg:w-[196px]'}`}>
            <div
              className="relative aspect-square overflow-hidden rounded-2xl shadow-[0_24px_50px_-28px_rgba(0,0,0,0.95)]"
              style={{ background: 'radial-gradient(70% 70% at 30% 25%, #FF8C00, transparent 60%), radial-gradient(80% 80% at 78% 76%, #D40055, transparent 62%), linear-gradient(150deg,#31003D,#12000E)' }}
            >
              {featured.cover && (
                <img src={featured.cover} alt={featured.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {canPlay && (
                <button
                  type="button"
                  onClick={() => featured.album && onPlayAlbum(featured.album)}
                  aria-label={`Play ${featured.title}`}
                  className="absolute bottom-3 left-3 grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-small-orange"
                >
                  <Play size={16} fill="currentColor" />
                </button>
              )}
            </div>
          </div>

          {/* Detail */}
          <div className="min-w-0 flex-1">
            <div className={`flex flex-wrap items-center gap-2 ${isMobile ? 'justify-center' : ''}`}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#FF8C00]/50 bg-[#FF8C00]/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#FFCE8F]">
                <Sparkles size={10} />{featured.isPick ? 'Artist pick' : 'Latest release'}
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/60">
                {featured.subtitle}
              </span>
              {featured.createdAt > 0 && (
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/60">
                  {fmtDate(featured.createdAt)}
                </span>
              )}
            </div>

            <h4 className={`mt-3 font-black uppercase italic leading-[0.98] tracking-tighter text-white ${isMobile ? 'text-2xl' : 'text-3xl lg:text-4xl'}`}>
              {featured.title}
            </h4>

            {description && (
              <p className={`mt-2.5 max-w-2xl text-sm font-medium leading-relaxed text-white/55 ${isMobile ? 'mx-auto' : ''}`}>
                {description.length > 220 ? `${description.slice(0, 217)}…` : description}
              </p>
            )}

            <div className={`mt-5 flex flex-wrap items-center gap-2.5 ${isMobile ? 'justify-center' : ''}`}>
              {canPlay && (
                <button
                  type="button"
                  onClick={() => featured.album && onPlayAlbum(featured.album)}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-[10px] font-black uppercase tracking-widest text-black transition-transform hover:scale-[1.02] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: 'linear-gradient(120deg,#D40055,#FF8C00)' }}
                >
                  <Play size={13} fill="currentColor" />
                  {trackCount > 1 ? 'Play project' : 'Play'}
                </button>
              )}
              <button
                type="button"
                onClick={open}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Open project
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Owner picker ── */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setPicking(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#140C14] shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div>
                  <h5 className="m-0 text-sm font-black uppercase tracking-widest text-white">Featured project</h5>
                  <p className="m-0 mt-1 text-[11px] font-medium text-white/45">
                    Pick the one project your profile leads with. Clear it and your newest release takes the slot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-[52vh] overflow-y-auto p-4">
                {choices.length === 0 ? (
                  <p className="py-8 text-center text-xs font-black uppercase tracking-widest text-white/30">
                    Nothing to feature yet — publish a release first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {choices.map(c => {
                      const selected = featured.isPick && featured.id === c.id && featured.kind === c.kind;
                      return (
                        <button
                          key={`${c.kind}-${c.id}`}
                          type="button"
                          onClick={() => { onSetFeatured({ kind: c.kind, id: c.id, setAt: Date.now() }); setPicking(false); }}
                          className={`group/pick overflow-hidden rounded-2xl border text-left transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-small-orange ${
                            selected ? 'border-small-orange bg-small-orange/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                          }`}
                        >
                          <span className="relative block aspect-square w-full overflow-hidden bg-white/5">
                            {c.cover ? (
                              <img src={c.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                            ) : (
                              <span className="absolute inset-0" style={{ background: 'linear-gradient(150deg,#31003D,#12000E)' }} />
                            )}
                            {selected && (
                              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-small-orange text-black">
                                <Check size={12} />
                              </span>
                            )}
                          </span>
                          <span className="block px-3 py-2.5">
                            <span className="block truncate text-[12px] font-bold text-white">{c.title}</span>
                            <span className="block truncate text-[9px] font-black uppercase tracking-widest text-white/35">{c.subtitle}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
                <button
                  type="button"
                  onClick={() => { onSetFeatured(null); setPicking(false); }}
                  className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/45 transition-colors hover:text-white"
                >
                  <RotateCcw size={12} /> Use my newest release
                </button>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-white/10"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileFeaturedProject;
