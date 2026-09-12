// The preset gallery — a library of sounds, not a list of filenames.
//
// Every card wears a generated cover, an author, and a one-line note from an engineer's head about
// why the sound works (services/melos/instruments/presetArt.ts). Shared across instruments; ONDA
// passes its factory bank today, KERA and FONDO will pass theirs.

import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { coverCss, accentFor, PRESET_NOTES } from '../../../../services/melos/instruments/presetArt';
import { SELECT, SURFACE } from '../theme';

export interface GalleryItem {
  id?: string;
  name: string;
  category?: string;
  tags?: string[];
  description?: string;
  cover?: string;           // art seed; falls back to the name
  author?: string;
  user?: boolean;
}

// Shared across every instrument: ONDA passes its rich OndaPatch bank; the shared
// InstrumentWindow passes presetHub entries (name + category), and coverCss makes a
// deterministic cover from either. Generic so the picked value keeps its real type.
export function PresetGallery<T extends GalleryItem>({ presets, engineLabel, currentName, onPick, onClose }: {
  presets: T[]; engineLabel: string; currentName?: string; onPick: (preset: T) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(presets.map((p) => p.category).filter(Boolean) as string[])], [presets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
        || (p.tags || []).some((t) => t.includes(q)) || (PRESET_NOTES[p.name] || '').toLowerCase().includes(q);
    });
  }, [presets, query, category]);

  const noteFor = (p: T) => p.description || PRESET_NOTES[p.name] || (p.tags || []).slice(0, 4).join(' · ');

  return (
    <div className="absolute inset-0 z-[55] grid place-items-center bg-black/72 backdrop-blur-sm p-5" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-[22px] border border-white/[0.16] overflow-hidden shadow-2xl flex flex-col" style={{ background: SURFACE, maxHeight: '86vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10 flex-none" style={{ background: '#0C0C10' }}>
          <span className="text-[12px] font-semibold text-white">Preset library</span>
          <span className="text-[11px] text-white/40">{engineLabel}</span>
          <div className="relative ml-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sounds"
              className="w-52 h-8 pl-7 pr-2 rounded-lg bg-black/40 border border-white/10 text-[12px] text-white outline-none focus:border-white/30" />
          </div>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/10 flex-wrap flex-none">
          <button onClick={() => setCategory(null)} className={`h-6 px-2.5 rounded-lg text-[10px] border ${!category ? 'text-white border-transparent' : 'border-white/10 text-white/40 hover:text-white'}`} style={!category ? { background: `${SELECT}29` } : undefined}>All</button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c === category ? null : c)} className={`h-6 px-2.5 rounded-lg text-[10px] border ${category === c ? 'text-white border-transparent' : 'border-white/10 text-white/40 hover:text-white'}`} style={category === c ? { background: `${accentFor(c)}33` } : undefined}>{c}</button>
          ))}
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
            {filtered.map((p) => {
              const accent = accentFor(p.category);
              const active = p.name === currentName;
              return (
                <button key={p.id || p.name} onClick={() => { onPick(p); onClose(); }}
                  className="text-left rounded-2xl overflow-hidden border transition-transform hover:-translate-y-0.5"
                  style={{ borderColor: active ? SELECT : 'rgba(255,255,255,0.1)', background: '#131318' }}>
                  <div className="relative" style={{ height: 92, background: coverCss(p.cover || p.name, p.category) }}>
                    <span className="absolute top-2 right-2 font-mono text-[8.5px] font-bold tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.5)', color: accent, backdropFilter: 'blur(3px)' }}>{engineLabel}</span>
                    {p.category && <span className="absolute bottom-2 left-2.5 font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}>{p.category}</span>}
                  </div>
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-white truncate flex-1">{p.name}</span>
                      {active && <span className="text-[8px] font-mono px-1 rounded" style={{ background: `${SELECT}33`, color: '#FF9CC4' }}>loaded</span>}
                    </div>
                    <span className="font-mono text-[9px] text-white/30 -mt-1">{p.author || 'Melos'}</span>
                    <p className="text-[11px] leading-snug text-white/50">{noteFor(p)}</p>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {(p.tags || []).slice(0, 3).map((t) => <span key={t} className="font-mono text-[8.5px] text-white/35 border border-white/10 rounded px-1.5 py-0.5">{t}</span>)}
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <p className="text-[12px] text-white/35 py-8 col-span-full text-center">No sounds match.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
