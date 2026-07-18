// TaleoUniverseBrowser — the catalogue-level half of blueprint Part 2D.
//
// MovieUXView already got the per-film Universe *rail* ("this film's world, inline").
// This is the other half: the UNIVERSE tab in MoviesTVView becomes a cross-world
// browser — every world that has films attached, and the characters who appear across
// more than one title. Everything is derived from fields that already exist on Video
// (`worldId`, `characterIds`) and from worlds already fetched by MoviesTVView, so no
// new backend surface is introduced; the only extra call is fetchWorldCharacters(),
// which MoviesTVView already uses.
//
// Degrades silently and completely: a world with no films simply doesn't appear, a
// film with no worldId is ignored, characters that never fetch just don't render.

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Globe, Users, Film, ChevronRight, Sparkles, Layers } from 'lucide-react';
import type { Video, IPWorld, Character, Universe } from '../types';
import { fetchWorldCharacters } from '../services/backendService';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

interface WorldWithFilms {
  world: IPWorld;
  films: Video[];
}

/** A character tagged on 2+ titles — the "appears across the universe" signal. */
interface CrossoverCharacter {
  character: Character;
  worldName: string;
  titles: Video[];
}

const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={`text-[9px] font-black uppercase tracking-[0.3em] mb-3 ${className || 'text-[#FFB68D]'}`}>{children}</p>
);

const TaleoUniverseBrowser: React.FC<{
  worlds: IPWorld[];
  /** Cinema-side platform videos (already filtered to Taleo genres by MoviesTVView). */
  videos: Video[];
  /** Partner streaming ecosystems — the old HiveView content, kept as a closing section. */
  universes: Universe[];
  onSelectVideo: (video: Video) => void;
  onOpenAlly: (url: string) => void;
  onOpenWorlds?: () => void;
}> = ({ worlds, videos, universes, onSelectVideo, onOpenAlly, onOpenWorlds }) => {
  const [characters, setCharacters] = useState<Record<string, Character[]>>({});
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);

  // ── Worlds that actually have films linked to them ──────────────────────────
  const worldsWithFilms = useMemo<WorldWithFilms[]>(() => {
    const byWorld = new Map<string, Video[]>();
    for (const v of videos) {
      const wid = (v as any).worldId as string | undefined;
      if (!wid) continue;
      const list = byWorld.get(wid) || [];
      list.push(v);
      byWorld.set(wid, list);
    }
    return worlds
      .map(world => ({ world, films: byWorld.get(world.id) || [] }))
      .filter(w => w.films.length > 0)
      .sort((a, b) => b.films.length - a.films.length);
  }, [worlds, videos]);

  // Fetch characters for the linked worlds (bounded — this is a catalogue page, not a hub).
  useEffect(() => {
    let cancelled = false;
    const ids = worldsWithFilms.slice(0, 8).map(w => w.world.id).filter(id => !characters[id]);
    if (ids.length === 0) return;
    Promise.all(ids.map(id =>
      fetchWorldCharacters(id).then(cs => [id, cs] as const).catch(() => [id, [] as Character[]] as const)
    )).then(pairs => {
      if (cancelled) return;
      setCharacters(prev => {
        const next = { ...prev };
        for (const [id, cs] of pairs) next[id] = cs;
        return next;
      });
    });
    return () => { cancelled = true; };
    // `characters` is intentionally omitted — the id filter above already dedupes and
    // including it would re-trigger the effect on every successful fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldsWithFilms]);

  // ── Characters appearing across more than one title ─────────────────────────
  const crossovers = useMemo<CrossoverCharacter[]>(() => {
    const titlesByCharacter = new Map<string, Video[]>();
    for (const v of videos) {
      for (const cid of ((v as any).characterIds as string[] | undefined) || []) {
        const list = titlesByCharacter.get(cid) || [];
        list.push(v);
        titlesByCharacter.set(cid, list);
      }
    }
    const flatChars = new Map<string, { c: Character; worldName: string }>();
    for (const { world } of worldsWithFilms) {
      for (const c of characters[world.id] || []) {
        if (c.discarded) continue;
        flatChars.set(c.id, { c, worldName: world.name });
      }
    }
    const out: CrossoverCharacter[] = [];
    for (const [cid, titles] of titlesByCharacter) {
      if (titles.length < 2) continue;           // "across titles" means 2+
      const hit = flatChars.get(cid);
      if (!hit) continue;                        // character not loaded → skip silently
      out.push({ character: hit.c, worldName: hit.worldName, titles });
    }
    return out.sort((a, b) => b.titles.length - a.titles.length).slice(0, 12);
  }, [videos, worldsWithFilms, characters]);

  const partnerUniverses = universes.filter(u => u.type === 'ALLY');
  const active = worldsWithFilms.find(w => w.world.id === activeWorldId) || null;

  const posterFor = (v: Video) =>
    (v as any).thumbnailUrl || (v as any).coverImageUrl ||
    ((v as any).muxPlaybackId ? `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=400&height=600&time=5` : '');

  return (
    <main className="pt-8 pb-40 px-4 sm:px-6 md:px-12 container mx-auto">
      <div className="mb-8 sm:mb-12">
        <Eyebrow>Cross-World Browser</Eyebrow>
        <h2 className="text-3xl sm:text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">
          The<br /><span className="text-[#D0BCFF]">Universe</span>
        </h2>
        <p className="mt-5 text-white/45 max-w-xl text-sm leading-relaxed">
          Every world on Plajah that has films attached, and the characters who cross between titles.
          Pick a world to see its whole catalogue.
        </p>
      </div>

      {/* ── Worlds with linked films ───────────────────────────────────────── */}
      {worldsWithFilms.length > 0 ? (
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={13} className="text-[#D0BCFF]" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">
              {worldsWithFilms.length} World{worldsWithFilms.length === 1 ? '' : 's'} with films
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {worldsWithFilms.map(({ world, films }) => {
              const isActive = world.id === activeWorldId;
              const cast = (characters[world.id] || []).filter(c => !c.discarded && c.imageUrl).slice(0, 5);
              return (
                <motion.button
                  key={world.id}
                  whileHover={{ y: -4 }}
                  onClick={() => setActiveWorldId(isActive ? null : world.id)}
                  className={`group text-left rounded-3xl overflow-hidden border transition-all duration-300 ${isActive ? 'border-[#D0BCFF]/60 bg-[#D0BCFF]/8' : 'border-white/8 bg-white/4 hover:border-[#D0BCFF]/30'}`}
                >
                  <div className="relative h-32 overflow-hidden bg-black/40">
                    {world.coverImage ? (
                      <img
                        src={thumb(world.coverImage, THUMB.card) || undefined}
                        onError={onThumbError(world.coverImage)}
                        loading="lazy" decoding="async" alt={world.name}
                        className="w-full h-full object-cover opacity-70 group-hover:opacity-95 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Globe size={30} className="text-white/10" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#131314] via-[#131314]/30 to-transparent" />
                  </div>
                  <div className="p-4 -mt-8 relative">
                    <h3 className="font-black text-base uppercase tracking-tight text-white group-hover:text-[#D0BCFF] transition-colors truncate">{world.name}</h3>
                    <div className="flex items-center gap-3 mt-2 text-[9px] font-black uppercase tracking-widest text-white/35">
                      <span className="inline-flex items-center gap-1"><Film size={11} /> {films.length} title{films.length === 1 ? '' : 's'}</span>
                      {cast.length > 0 && <span className="inline-flex items-center gap-1"><Users size={11} /> {(characters[world.id] || []).length}</span>}
                    </div>
                    {cast.length > 0 && (
                      <div className="flex -space-x-2 mt-3">
                        {cast.map(c => (
                          <img
                            key={c.id}
                            src={thumb(c.imageUrl, THUMB.micro) || undefined}
                            onError={onThumbError(c.imageUrl)}
                            loading="lazy" decoding="async" alt={c.name} title={c.name}
                            className="w-7 h-7 rounded-full object-cover border-2 border-[#131314]"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mb-14">
          <div className="py-20 text-center border-2 border-dashed border-white/8 rounded-3xl max-w-lg">
            <Globe className="text-white/10 mx-auto mb-4" size={44} />
            <p className="text-white/30 font-black text-lg uppercase tracking-widest mb-2">No linked worlds yet</p>
            <p className="text-white/20 text-xs uppercase tracking-widest px-6 leading-relaxed">
              Attach a world to a film in its settings and it will appear here.
            </p>
            {onOpenWorlds && (
              <button onClick={onOpenWorlds} className="mt-6 px-5 py-2 rounded-full bg-[#D0BCFF]/15 text-[#D0BCFF] text-[10px] font-black uppercase tracking-widest hover:bg-[#D0BCFF]/25 transition-colors">
                Open Worlds
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── The selected world's catalogue ─────────────────────────────────── */}
      {active && (
        <motion.section
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-14 rounded-3xl border border-[#D0BCFF]/20 bg-[#D0BCFF]/5 p-5 sm:p-7"
        >
          <Eyebrow className="text-[#D0BCFF]">From this universe</Eyebrow>
          <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-1">{active.world.name}</h3>
          {active.world.description && (
            <p className="text-white/45 text-sm leading-relaxed max-w-2xl mb-6 line-clamp-3">{active.world.description}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {active.films.map(v => {
              const poster = posterFor(v);
              return (
                <motion.button
                  key={v.id}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => onSelectVideo(v)}
                  className="group text-left rounded-2xl overflow-hidden border border-white/8 hover:border-[#D0BCFF]/40 bg-white/4 transition-all"
                >
                  <div className="aspect-[2/3] bg-black/40 overflow-hidden">
                    {poster ? (
                      <img
                        src={thumb(poster, THUMB.card) || undefined}
                        onError={onThumbError(poster)}
                        loading="lazy" decoding="async" alt={v.title}
                        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film size={22} className="text-white/10" /></div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="text-xs font-black uppercase tracking-tight truncate text-white">{v.title}</h4>
                    {v.genre && <p className="text-[9px] text-white/35 uppercase tracking-widest mt-1 truncate">{v.genre}</p>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Characters across titles ───────────────────────────────────────── */}
      {crossovers.length > 0 && (
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={13} className="text-[#FFB68D]" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Appearing across titles</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {crossovers.map(({ character, worldName, titles }) => (
              <div key={character.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-3">
                  {character.imageUrl ? (
                    <img
                      src={thumb(character.imageUrl, THUMB.micro) || undefined}
                      onError={onThumbError(character.imageUrl)}
                      loading="lazy" decoding="async" alt={character.name}
                      className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <Users size={16} className="text-white/20" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-sm uppercase tracking-tight text-white truncate">{character.name}</h4>
                    <p className="text-[9px] text-white/35 uppercase tracking-widest truncate">{character.role || worldName}</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FFB68D] shrink-0">{titles.length} titles</span>
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  {titles.slice(0, 4).map(v => (
                    <button
                      key={v.id}
                      onClick={() => onSelectVideo(v)}
                      className="group flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-[11px] text-white/55 group-hover:text-white truncate">{v.title}</span>
                      <ChevronRight size={12} className="text-white/20 group-hover:text-[#D0BCFF] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Partner ecosystems (previously the whole tab) ───────────────────── */}
      {partnerUniverses.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe size={13} className="text-white/30" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Streaming partners</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            {partnerUniverses.map(u => (
              <motion.button
                key={u.id}
                whileHover={{ scale: 1.02, y: -3 }}
                onClick={() => u.url && onOpenAlly(u.url)}
                className="group text-left bg-white/4 border border-white/8 hover:border-[#D0BCFF]/30 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#D0BCFF]/10 flex items-center justify-center shrink-0 group-hover:bg-[#D0BCFF]/20 transition-all">
                  <Globe className="text-[#D0BCFF]" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-base uppercase tracking-tight text-white group-hover:text-[#D0BCFF] transition-colors truncate">{u.name}</h3>
                  <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mt-1">Partner Ecosystem</p>
                </div>
                <ChevronRight size={16} className="text-white/20 group-hover:text-[#D0BCFF] group-hover:translate-x-1 transition-all shrink-0" />
              </motion.button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};

export default TaleoUniverseBrowser;
