import React, { useState } from 'react';
import { Character, IPWorld, Album, Video } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Film, Globe, Users, Image, Play,
  BookOpen, Disc, Tv, Star,
} from 'lucide-react';

interface CharacterWorldViewProps {
  character: Character;
  world: IPWorld | null;
  worldContent: { albums: Album[]; videos: Video[] } | null;
  onBack: () => void;
  currentUser: any;
}

type CharTab = 'overview' | 'gallery' | 'clips' | 'appearances';

// Returns type icon for a content item
const ContentTypeIcon: React.FC<{ item: any; size?: number }> = ({ item, size = 12 }) => {
  const t = item.subType || item.type || item.category || '';
  if (t === 'MOVIE' || t === 'SHORT_FILM') return <Film size={size} />;
  if (t === 'TV_SERIES') return <Tv size={size} />;
  if (item.chapters) return <BookOpen size={size} />;
  if (item.tracks) return <Disc size={size} />;
  return <Globe size={size} />;
};

const CharacterWorldView: React.FC<CharacterWorldViewProps> = ({
  character, world, worldContent, onBack,
}) => {
  const [tab, setTab] = useState<CharTab>('overview');

  const accent = character.accentColor || '#D0BCFF';
  const coverSrc = character.gallery?.[0] || character.imageUrl;

  // All world content where this character is tagged
  const appearances = [
    ...(worldContent?.videos || []).filter(v => v.characterIds?.includes(character.id)),
    ...(worldContent?.albums || []).filter(a => (a as any).characterIds?.includes(character.id)),
  ];

  const TABS: CharTab[] = ['overview', 'gallery', 'clips', 'appearances'];

  return (
    <div className="fixed inset-0 z-[175] bg-black/50 text-white overflow-y-auto custom-scrollbar">
      {/* Blurred background art */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {coverSrc && (
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-[90px] opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/40 to-black/70" />
      </div>

      {/* Hero cover band */}
      <div className="relative z-10">
        <div className="relative h-56 md:h-72 overflow-hidden">
          {character.gallery?.[0] ? (
            <img src={character.gallery[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, ${accent}30 0%, #000 100%)` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

          {/* Back */}
          <button
            onClick={onBack}
            className="absolute top-5 left-5 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/80 transition-all"
          >
            <ArrowLeft size={18} />
          </button>

          {/* World chip */}
          {world && (
            <div className="absolute top-5 right-5 flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
              <Globe size={10} style={{ color: accent }} />
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>
                {world.name}
              </span>
            </div>
          )}
        </div>

        {/* Identity row */}
        <div className="px-6 lg:px-14 -mt-16 relative z-10 pb-6">
          <div className="flex items-end gap-5 mb-8">
            {/* Portrait */}
            <div
              className="w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2"
              style={{ borderColor: accent + '60' }}
            >
              <img
                src={
                  character.imageUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(character.name)}&background=333&color=fff&size=256`
                }
                alt={character.name}
                className="w-full h-full object-cover"
                onError={e => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(character.name)}&background=333&color=fff&size=256`;
                }}
              />
            </div>

            <div className="min-w-0 pb-2 space-y-1">
              {character.role && (
                <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>
                  {character.role}
                </p>
              )}
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white leading-none">
                {character.name}
              </h1>
              {character.actorName && (
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                  Portrayed by {character.actorName}
                </p>
              )}
              {appearances.length > 0 && (
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                  {appearances.length} appearance{appearances.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] rounded-full p-1 w-fit mb-8">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                  tab === t
                    ? 'bg-white text-[#1C1B1F] shadow-md'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 max-w-3xl"
              >
                {/* Bio */}
                {character.bio && (
                  <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: accent }}>
                      About
                    </p>
                    <p className="text-white/70 leading-relaxed">{character.bio}</p>
                    {character.lore && (
                      <div className="mt-5 pt-5 border-t border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Origin & Lore</p>
                        <p className="text-white/45 leading-relaxed text-sm">{character.lore}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Physical stats */}
                {character.physicalStats && Object.values(character.physicalStats).some(Boolean) && (
                  <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>
                      Profile
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(character.physicalStats)
                        .filter(([, v]) => v)
                        .map(([key, val]) => (
                          <div key={key} className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{key}</p>
                            <p className="text-white font-black text-sm">{String(val)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Relationships */}
                {character.relationships && character.relationships.length > 0 && (
                  <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>
                      Relationships
                    </p>
                    <div className="space-y-3">
                      {character.relationships.map((rel, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06]">
                          <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                            <Users size={13} className="text-white/40" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white text-sm truncate">{rel.characterName}</p>
                          </div>
                          <span
                            className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
                            style={{ color: accent, borderColor: accent + '30', backgroundColor: accent + '10' }}
                          >
                            {rel.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {character.tags && character.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {character.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[9px] font-black uppercase tracking-widest text-white/45"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {!character.bio && !character.lore && !character.relationships?.length && (
                  <div className="py-16 text-center bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                    <Star size={36} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white/20 font-black uppercase tracking-widest text-sm">
                      No profile information yet
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── GALLERY ── */}
            {tab === 'gallery' && (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {character.gallery && character.gallery.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {character.gallery.map((url, i) => (
                      <motion.div
                        key={i}
                        whileHover={{ scale: 1.02, y: -2 }}
                        className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/8 cursor-pointer group relative"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Image size={20} className="text-white/60" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 text-center bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                    <Image size={40} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white/20 font-black uppercase tracking-widest text-sm">No gallery images yet</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── CLIPS ── */}
            {tab === 'clips' && (
              <motion.div
                key="clips"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {character.clips && character.clips.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {character.clips.map((url, i) => (
                      <div key={i} className="rounded-2xl overflow-hidden bg-white/5 border border-white/8 relative group">
                        <video
                          src={url}
                          playsInline
                          controls
                          className="w-full aspect-video object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 text-center bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                    <Film size={40} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white/20 font-black uppercase tracking-widest text-sm">No clips available yet</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── APPEARANCES ── */}
            {tab === 'appearances' && (
              <motion.div
                key="appearances"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {appearances.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {appearances.map((item, i) => {
                      const thumb =
                        (item as any).coverImage ||
                        (item as any).coverImageUrl ||
                        (item as any).thumbnailUrl;
                      return (
                        <motion.div
                          key={(item as any).id || i}
                          whileHover={{ y: -5 }}
                          className="group aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/8 cursor-pointer relative"
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={item.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ContentTypeIcon item={item} size={28} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className="text-[11px] font-black text-white line-clamp-2 leading-tight">
                              {item.title}
                            </p>
                          </div>
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
                              <Play size={16} fill="white" className="text-white ml-0.5" />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-24 text-center bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                    <Globe size={40} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white/20 font-black uppercase tracking-widest text-sm">
                      No tagged appearances yet
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default CharacterWorldView;
