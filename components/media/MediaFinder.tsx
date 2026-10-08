import React, { useState } from 'react';
import { Search, Plus, Check, Loader2 } from 'lucide-react';
import { findMedia, type MediaAsset } from '../../services/lessonMedia';

/**
 * Search the archives for media to put in a lesson: Library of Congress photographs, museum
 * open-access artworks and Chora Vault recordings. Everything shown is rights-checked and arrives
 * with its credit line, so a teacher can add it without worrying about permissions.
 */
const KINDS: Array<{ id: 'photos' | 'art' | 'audio'; label: string }> = [
  { id: 'photos', label: 'Historic photos' }, { id: 'art', label: 'Artworks' }, { id: 'audio', label: 'Vault audio' },
];

const MediaFinder: React.FC<{ chosen: string[]; onAdd: (a: MediaAsset) => void; initialQuery?: string }> = ({ chosen, onAdd, initialQuery = '' }) => {
  const [q, setQ] = useState(initialQuery);
  const [kinds, setKinds] = useState<Array<'photos' | 'art' | 'audio'>>(['photos', 'art', 'audio']);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MediaAsset[] | null>(null);

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true); setResults(null);
    const r = await findMedia({ q: q.trim(), kinds, limit: 8 });
    setResults(r); setBusy(false);
  };
  const toggle = (k: 'photos' | 'art' | 'audio') => setKinds(ks => (ks.includes(k) ? ks.filter(x => x !== k) : [...ks, k]));

  return (
    <div>
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search media" placeholder="e.g. Edison phonograph, Woodward Avenue, jazz 1920s"
            className="w-full rounded-full bg-white/[0.06] border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/30" />
        </div>
        <button type="submit" disabled={busy || q.trim().length < 2} className="rounded-full px-4 py-2 text-[12px] font-black bg-white text-black disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : 'Search'}</button>
      </form>
      <div className="flex gap-1.5 mb-3" role="group" aria-label="Media types">
        {KINDS.map(k => (
          <button key={k.id} type="button" aria-pressed={kinds.includes(k.id)} onClick={() => toggle(k.id)}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${kinds.includes(k.id) ? 'bg-white/90 text-black' : 'bg-white/5 text-white/55'}`}>{k.label}</button>
        ))}
      </div>
      <p className="text-[10px] text-white/40 mb-3">Only public-domain and openly licensed items appear. Credits are added for you.</p>

      {results && results.length === 0 && <p className="text-sm text-white/50">Nothing usable found. Try simpler words, or a different type.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {(results || []).map(a => {
          const on = chosen.includes(a.id);
          return (
            <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
              {a.kind === 'image'
                ? <img src={a.thumbUrl || a.url} alt={a.title} loading="lazy" className="h-24 w-full object-cover bg-black/40" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                : <div className="h-24 grid place-items-center bg-gradient-to-br from-[#6B0099] to-[#D40055] text-2xl">🎵</div>}
              <div className="p-2 flex-1 flex flex-col">
                <p className="text-[11px] font-bold leading-tight line-clamp-2">{a.title}</p>
                <p className="text-[9px] text-white/40 mt-0.5">{a.date || ''} · {a.provider === 'loc' ? 'Library of Congress' : a.provider === 'vault' ? 'Chora Vault' : a.provider === 'met' ? 'The Met' : 'Art Institute'}</p>
                <button type="button" onClick={() => !on && onAdd(a)} disabled={on} className="mt-auto pt-2 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 text-[#FF8C00] disabled:text-emerald-300">
                  {on ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add to lesson</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MediaFinder;
