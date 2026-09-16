// ProgressionBrowser — browse the chord/progression repository (services/melos/progressionRepo) by
// genre + search, pick a key, and insert the realised progression as a MIDI clip on an instrument
// track. The first usable piece of the Virtual Composer (docs/MELOS_COUNCIL_AND_COMPOSER.md, P1).
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Music2, Plus } from 'lucide-react';
import { allProgressions, progressionsByGenre, searchProgressions, genreFacets, tagsFor, type Genre } from '../../../../services/melos/progressionRepo';
import { progressionChords } from '../../../../services/melos/composition/progressionToClip';

const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

interface Props {
  /** Insert the chosen progression → the caller writes the MIDI clip onto the track. */
  onInsert: (progId: string, rootPc: number, seventh: boolean) => void;
  onClose: () => void;
  /** Track name shown in the header, e.g. the instrument the clip lands on. */
  target?: string;
}

export default function ProgressionBrowser({ onInsert, onClose, target }: Props) {
  const [genre, setGenre] = useState<Genre | 'all'>('all');
  const [query, setQuery] = useState('');
  const [rootPc, setRootPc] = useState(0);
  const [seventh, setSeventh] = useState(false);
  const facets = useMemo(() => genreFacets(), []);

  const list = useMemo(() => {
    let base = query.trim() ? searchProgressions(query) : (genre === 'all' ? allProgressions() : progressionsByGenre(genre));
    return base;
  }, [genre, query]);

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div className="relative w-full max-w-2xl max-h-[86vh] flex flex-col bg-[#100e16] border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/8">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/30">Chord progressions{target ? ` · ${target}` : ''}</p>
            <h3 className="text-base font-black tracking-tight text-white">Insert a progression</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 shrink-0"><X size={15} /></button>
        </div>

        {/* Controls: key + triad/7th + search */}
        <div className="px-6 py-3 border-b border-white/8 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30 mr-1">Key</span>
            <select value={rootPc} onChange={(e) => setRootPc(+e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#8B5CFF]/60">
              {KEYS.map((k, i) => <option key={k} value={i} className="bg-[#100e16]">{k}</option>)}
            </select>
          </div>
          <button onClick={() => setSeventh(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${seventh ? 'bg-[#8B5CFF]/20 border-[#8B5CFF]/60 text-[#D0BCFF]' : 'border-white/10 text-white/50 hover:text-white'}`}>
            {seventh ? '7th chords' : 'Triads'}
          </button>
          <div className="relative flex-1 min-w-[140px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search progressions…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-white placeholder:text-white/25 outline-none focus:border-[#8B5CFF]/60" />
          </div>
        </div>

        {/* Genre facets */}
        {!query.trim() && (
          <div className="px-6 py-2.5 border-b border-white/8 flex flex-wrap gap-1.5">
            <button onClick={() => setGenre('all')}
              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${genre === 'all' ? 'bg-white text-black border-white' : 'border-white/12 text-white/45 hover:text-white'}`}>All</button>
            {facets.map(f => (
              <button key={f.genre} onClick={() => setGenre(f.genre)}
                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${genre === f.genre ? 'bg-[#8B5CFF] text-white border-[#8B5CFF]' : 'border-white/12 text-white/45 hover:text-white'}`}>
                {f.genre} <span className="opacity-50">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
          {list.length === 0 ? (
            <div className="py-16 text-center text-white/25"><Music2 size={28} className="mx-auto mb-3" /><p className="text-[10px] font-black uppercase tracking-widest">No progressions match</p></div>
          ) : list.map(p => {
            const chords = progressionChords(p.id, rootPc, seventh);
            return (
              <button key={p.id} onClick={() => { onInsert(p.id, rootPc, seventh); onClose(); }}
                className="group w-full text-left px-3 py-3 rounded-2xl hover:bg-white/[0.05] border border-transparent hover:border-white/10 transition-colors flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-white tracking-tight">{p.name}</span>
                    {tagsFor(p.id).slice(0, 3).map(g => <span key={g} className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]/70 bg-[#8B5CFF]/10 border border-[#8B5CFF]/25 rounded-full px-1.5 py-0.5">{g}</span>)}
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/25">{p.mode}</span>
                  </div>
                  <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{p.character}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {chords.map((c, i) => <span key={i} className="text-[10px] font-mono font-bold text-white/70 bg-white/[0.04] border border-white/8 rounded px-1.5 py-0.5">{c.symbol}</span>)}
                  </div>
                </div>
                <span className="shrink-0 mt-1 w-8 h-8 rounded-full grid place-items-center bg-white/5 text-white/30 group-hover:bg-[#8B5CFF] group-hover:text-white transition-colors"><Plus size={15} /></span>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-2.5 border-t border-white/8 text-center">
          <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest">Inserts one bar per chord at the playhead · edit in the piano roll after</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
