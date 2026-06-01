import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Globe, Film, Link2, Check, ChevronDown, Loader2,
  Users, Map, BookOpen, Clock, Plus, X, Star,
} from 'lucide-react';
import {
  fetchUserAlbums, fetchUserWorlds, updateAlbum, auth,
} from '../services/backendService';
import type { Album, IPWorld } from '../types';

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmTransmediaHub() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [worlds, setWorlds]         = useState<IPWorld[]>([]);
  const [selectedFilmId, setSelectedFilmId] = useState<string>('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  // Per-film overrides (worldId, characterIds, timelineYear, relatedProjectIds)
  const [worldId, setWorldId]               = useState<string>('');
  const [characterIds, setCharacterIds]     = useState<string[]>([]);
  const [timelineYear, setTimelineYear]     = useState<string>('');
  const [relatedProjectIds, setRelatedProjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    Promise.all([
      fetchUserAlbums(auth.currentUser.uid),
      fetchUserWorlds(auth.currentUser.uid),
    ]).then(([albs, wrlds]) => {
      const films = albs.filter(a => a.type === 'VIDEO');
      setAlbums(albs);          // all albums for related projects
      setWorlds(wrlds);
      if (films.length > 0) {
        const f = films[0];
        setSelectedFilmId(f.id);
        setWorldId(f.worldId ?? '');
        setCharacterIds(f.characterIds ?? []);
        setRelatedProjectIds(f.relatedProjectIds ?? []);
      }
      setLoading(false);
    });
  }, []);

  const film   = albums.find(a => a.id === selectedFilmId && a.type === 'VIDEO');
  const world  = worlds.find(w => w.id === worldId);
  const filmAlbums = albums.filter(a => a.type === 'VIDEO');

  const handleFilmChange = (id: string) => {
    setSelectedFilmId(id);
    const f = albums.find(a => a.id === id);
    if (f) {
      setWorldId(f.worldId ?? '');
      setCharacterIds(f.characterIds ?? []);
      setTimelineYear(f.movieMetadata?.releaseYear ? String(f.movieMetadata.releaseYear) : '');
      setRelatedProjectIds(f.relatedProjectIds ?? []);
    }
  };

  const handleSave = async () => {
    if (!film || saving) return;
    setSaving(true);
    await updateAlbum(film.id, {
      worldId: worldId || undefined,
      characterIds,
      relatedProjectIds,
      movieMetadata: {
        ...(film.movieMetadata ?? {}),
        releaseYear: timelineYear ? parseInt(timelineYear) : undefined,
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleRelated = (id: string) =>
    setRelatedProjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2';

  if (loading) return (
    <div className="py-24 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Transmedia<br />Hub</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Link films to your IP World · characters · timeline · universe</p>
        </div>
        <button onClick={handleSave} disabled={saving || !film}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: saved ? '#22c55e' : '#818cf8', color: '#fff' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><Check size={14} /> Saved!</> : 'Save Links'}
        </button>
      </div>

      {/* Film selector */}
      {filmAlbums.length > 0 ? (
        <div className="relative w-full max-w-sm">
          <select value={selectedFilmId} onChange={e => handleFilmChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {filmAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-white/8 bg-white/[0.02] text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No films yet — distribute a film first</p>
        </div>
      )}

      {film && (
        <>
          {/* IP World link */}
          <section>
            <label className={labelCls}>Link to IP World</label>
            <p className="text-[9px] text-white/20 mb-3">Connect this film to one of your IP universes. The world's characters, lore, and timeline will be available to tag.</p>
            {worlds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* No world option */}
                <button onClick={() => setWorldId('')}
                  className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
                  style={{
                    background:  !worldId ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: !worldId ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                  }}>
                  <Film size={16} className={!worldId ? 'text-white' : 'text-white/20'} />
                  <div className="flex-1">
                    <p className={`text-xs font-black uppercase tracking-widest ${!worldId ? 'text-white' : 'text-white/35'}`}>Standalone Film</p>
                    <p className="text-[9px] text-white/20">Not linked to any universe</p>
                  </div>
                  {!worldId && <Check size={12} className="text-white" />}
                </button>

                {worlds.map(w => (
                  <button key={w.id} onClick={() => setWorldId(w.id)}
                    className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
                    style={{
                      background:  worldId === w.id ? `${w.themeConfig.primaryColor}12` : 'rgba(255,255,255,0.02)',
                      borderColor: worldId === w.id ? `${w.themeConfig.primaryColor}40` : 'rgba(255,255,255,0.07)',
                    }}>
                    {w.coverImage ? (
                      <img src={w.coverImage} alt={w.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${w.themeConfig.primaryColor}20` }}>
                        <Globe size={16} style={{ color: w.themeConfig.primaryColor }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black uppercase tracking-widest truncate ${worldId === w.id ? 'text-white' : 'text-white/40'}`}>{w.name}</p>
                      <p className="text-[9px] text-white/20">{w.worldType}</p>
                    </div>
                    {worldId === w.id && <Check size={12} style={{ color: w.themeConfig.primaryColor }} className="flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-2xl border border-white/8 bg-white/[0.02]">
                <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">No IP Worlds yet</p>
                <p className="text-[9px] text-white/15 mt-1">Create an IP World in My Worlds to link this film to a universe</p>
              </div>
            )}
          </section>

          {/* Timeline position */}
          <section>
            <label className={labelCls}>In-Universe Timeline Year</label>
            <p className="text-[9px] text-white/20 mb-3">Where does this film sit on the world's timeline? (in-universe year, not release year)</p>
            <input
              type="number"
              value={timelineYear}
              onChange={e => setTimelineYear(e.target.value)}
              placeholder="e.g. 2347 (in-universe year)"
              className="w-48 bg-white/5 border border-white/8 rounded-2xl px-5 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all"
            />
          </section>

          {/* Related projects */}
          <section>
            <label className={labelCls}>Related Projects</label>
            <p className="text-[9px] text-white/20 mb-3">Link this film to other albums, books, or films that share the same IP — shown as "You might also like" on the film page.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {albums.filter(a => a.id !== film.id).map(a => {
                const linked = relatedProjectIds.includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggleRelated(a.id)}
                    className="flex flex-col items-start gap-2 p-3 rounded-2xl border transition-all text-left"
                    style={{
                      background:  linked ? 'rgba(129,140,248,0.08)' : 'rgba(255,255,255,0.02)',
                      borderColor: linked ? 'rgba(129,140,248,0.3)'  : 'rgba(255,255,255,0.07)',
                    }}>
                    {a.coverImage && (
                      <img src={a.coverImage} alt={a.title} className="w-full aspect-square object-cover rounded-xl" />
                    )}
                    <div className="w-full">
                      <p className={`text-[9px] font-black uppercase tracking-widest truncate ${linked ? 'text-white' : 'text-white/35'}`}>{a.title}</p>
                      <p className="text-[7px] text-white/20 uppercase tracking-widest">{a.type}{a.subType ? ` · ${a.subType}` : ''}</p>
                    </div>
                    {linked && <Check size={10} className="text-violet-400" />}
                  </button>
                );
              })}
            </div>
            {albums.filter(a => a.id !== film.id).length === 0 && (
              <p className="text-[9px] text-white/18">No other projects yet — create more content to link together.</p>
            )}
          </section>

          {/* Universe summary */}
          {world && (
            <div className="p-5 rounded-2xl border border-white/8 bg-white/[0.02] space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Universe Summary — {world.name}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Characters', value: world.characterIds.length,  icon: <Users size={14} /> },
                  { label: 'Lore',       value: world.loreIds.length,       icon: <BookOpen size={14} /> },
                  { label: 'Timelines',  value: world.timelineIds.length,   icon: <Clock size={14} /> },
                  { label: 'Assets',     value: world.assetIds.length,      icon: <Star size={14} /> },
                ].map(stat => (
                  <div key={stat.label} className="flex items-center gap-2 p-3 bg-white/[0.03] rounded-xl">
                    <span className="text-white/30">{stat.icon}</span>
                    <div>
                      <p className="text-[8px] text-white/20 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-base font-black text-white">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {timelineYear && (
                <p className="text-[9px] text-white/30 pt-2 border-t border-white/5">
                  This film is set in year <span className="text-white font-black">{timelineYear}</span> of the {world.name} universe
                </p>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
