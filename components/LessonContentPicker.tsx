// LessonContentPicker — Phase D: the teacher content-surfacing picker. Browse Plajah's
// rights-cleared archives (Chora Vault music history, the Internet-Archive film library, and
// open-access museum art) and add items straight into a lesson as resources. This is the
// differentiator no ClassDojo/Seesaw has: real teaching material, one click away.

import React, { useEffect, useState } from 'react';
import { X, Music, Film, Image as ImageIcon, Check, Plus, Loader2, Search } from 'lucide-react';
import { fetchVaultTracks, fetchArchiveVideos } from '../services/archiveContentService';
import { fetchArtworksByMovement, MOVEMENTS } from '../services/artMuseumService';

export interface PickedResource {
  label: string;
  url: string;
  kind: 'music' | 'film' | 'art';
  thumb?: string;
  sub?: string; // secondary line (artist, year, movement…)
}

type SourceTab = 'music' | 'film' | 'art';

const MUSIC_GENRES: { id: string; label: string }[] = [
  { id: 'classical', label: 'Classical' }, { id: 'jazz', label: 'Jazz' }, { id: 'blues', label: 'Blues' },
  { id: 'gospel', label: 'Gospel' }, { id: 'folk', label: 'Folk' }, { id: 'opera', label: 'Opera' }, { id: 'world', label: 'World' },
];

const FILM_TOPICS: { q: string; label: string }[] = [
  { q: 'collection:feature_films', label: 'Feature Films' },
  { q: 'collection:silent_films', label: 'Silent Era' },
  { q: 'collection:academic_films', label: 'Educational' },
  { q: 'collection:newsreels', label: 'Newsreels' },
  { q: 'collection:animationandcartoons', label: 'Animation' },
];

const C = { bg: '#12121a', border: '#20202c', ink: '#fff', muted: '#9a9aa6', accent: '#3FB98E', orange: '#FF8C00' };

const LessonContentPicker: React.FC<{ onAdd: (items: PickedResource[]) => void; onClose: () => void }> = ({ onAdd, onClose }) => {
  const [tab, setTab] = useState<SourceTab>('music');
  const [musicGenre, setMusicGenre] = useState('classical');
  const [filmTopic, setFilmTopic] = useState('collection:feature_films');
  const [filmQuery, setFilmQuery] = useState('');
  const [movement, setMovement] = useState('impressionism');
  const [results, setResults] = useState<PickedResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, PickedResource>>({});

  const keyOf = (r: PickedResource) => `${r.kind}:${r.url}`;
  const toggle = (r: PickedResource) => setSelected(prev => {
    const k = keyOf(r); const next = { ...prev };
    if (next[k]) delete next[k]; else next[k] = r;
    return next;
  });

  // Load results for the active source/filter.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setResults([]);
    (async () => {
      try {
        let out: PickedResource[] = [];
        if (tab === 'music') {
          const tracks = await fetchVaultTracks('MUSIC', musicGenre, 24);
          out = (tracks || []).map(t => ({
            kind: 'music' as const, url: t.url, thumb: t.thumbnailUrl,
            label: t.title, sub: [t.artist, t.year].filter(Boolean).join(' · '),
          }));
        } else if (tab === 'film') {
          const q = filmQuery.trim() ? filmQuery.trim() : filmTopic;
          const vids = await fetchArchiveVideos(q, 24);
          out = (vids || []).map(v => ({
            kind: 'film' as const, url: `https://archive.org/details/${v.identifier}`, thumb: v.thumbnailUrl,
            label: v.title, sub: [v.year, v.runtime].filter(Boolean).join(' · '),
          }));
        } else {
          const art = await fetchArtworksByMovement(movement, { limit: 24 });
          out = (art || []).filter(a => a.thumbUrl || a.imageUrl).map(a => ({
            kind: 'art' as const, url: a.sourceUrl || a.imageUrl, thumb: a.thumbUrl || a.imageUrl,
            label: a.title, sub: [a.artist, a.date].filter(Boolean).join(' · '),
          }));
        }
        if (!cancelled) setResults(out);
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab, musicGenre, filmTopic, filmQuery, movement]);

  const chosen = Object.values(selected);
  const TABS: { id: SourceTab; label: string; icon: React.ElementType }[] = [
    { id: 'music', label: 'Music history', icon: Music },
    { id: 'film', label: 'Film archive', icon: Film },
    { id: 'art', label: 'Museum art', icon: ImageIcon },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-3xl max-h-[88vh] rounded-2xl border flex flex-col overflow-hidden" style={{ background: C.bg, borderColor: C.border, color: C.ink }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: C.border }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: C.accent }}>Add to lesson</p>
            <h3 className="text-lg font-black">Plajah archives</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Source tabs */}
        <div className="flex gap-2 px-5 pt-3 shrink-0">
          {TABS.map(t => {
            const Icon = t.icon; const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
                style={{ background: on ? `${C.accent}22` : 'transparent', color: on ? C.accent : C.muted, border: `1px solid ${on ? C.accent : C.border}` }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="px-5 pt-3 shrink-0">
          {tab === 'music' && (
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_GENRES.map(g => (
                <button key={g.id} onClick={() => setMusicGenre(g.id)} className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: musicGenre === g.id ? `${C.orange}22` : 'transparent', color: musicGenre === g.id ? C.orange : C.muted, border: `1px solid ${musicGenre === g.id ? C.orange : C.border}` }}>{g.label}</button>
              ))}
            </div>
          )}
          {tab === 'film' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#0a0a0f', border: `1px solid ${C.border}` }}>
                <Search size={14} style={{ color: C.muted }} />
                <input value={filmQuery} onChange={e => setFilmQuery(e.target.value)} placeholder="Search the film archive (e.g. Charlie Chaplin, WWII)…"
                  className="bg-transparent outline-none text-[13px] flex-1" style={{ color: C.ink }} />
              </div>
              {!filmQuery.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {FILM_TOPICS.map(t => (
                    <button key={t.q} onClick={() => setFilmTopic(t.q)} className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: filmTopic === t.q ? `${C.orange}22` : 'transparent', color: filmTopic === t.q ? C.orange : C.muted, border: `1px solid ${filmTopic === t.q ? C.orange : C.border}` }}>{t.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'art' && (
            <div className="flex flex-wrap gap-1.5">
              {MOVEMENTS.map(m => (
                <button key={m.id} onClick={() => setMovement(m.id)} className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: movement === m.id ? `${C.orange}22` : 'transparent', color: movement === m.id ? C.orange : C.muted, border: `1px solid ${movement === m.id ? C.orange : C.border}` }}>{m.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Results grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="h-40 grid place-items-center"><Loader2 size={22} className="animate-spin" style={{ color: C.muted }} /></div>
          ) : results.length === 0 ? (
            <div className="h-40 grid place-items-center text-[13px]" style={{ color: C.muted }}>No results — try another filter or search.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {results.map(r => {
                const on = !!selected[keyOf(r)];
                return (
                  <button key={keyOf(r)} onClick={() => toggle(r)} className="text-left rounded-xl overflow-hidden border transition-all relative"
                    style={{ borderColor: on ? C.accent : C.border, background: '#0a0a0f' }}>
                    <div className="aspect-video bg-black/60 relative">
                      {r.thumb ? <img src={r.thumb} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center" style={{ color: C.muted }}><Music size={20} /></div>}
                      {on && <div className="absolute inset-0 grid place-items-center bg-black/50"><div className="w-8 h-8 rounded-full grid place-items-center" style={{ background: C.accent }}><Check size={18} color="#000" /></div></div>}
                    </div>
                    <div className="p-2">
                      <p className="text-[12px] font-bold leading-tight line-clamp-2">{r.label}</p>
                      {r.sub && <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: C.muted }}>{r.sub}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t shrink-0" style={{ borderColor: C.border }}>
          <span className="text-[12px] font-bold" style={{ color: C.muted }}>{chosen.length} selected</span>
          <button disabled={!chosen.length} onClick={() => { onAdd(chosen); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest disabled:opacity-40"
            style={{ background: C.accent, color: '#000' }}>
            <Plus size={15} /> Add {chosen.length || ''} to lesson
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonContentPicker;
