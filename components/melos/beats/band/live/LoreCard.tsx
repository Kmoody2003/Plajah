// An instrument's lore (band/lore.ts) as openable sections — how it makes sound, what it's made of,
// how it's built and tuned, its properties, its relatives around the world, its music and traditions,
// and the sources — with the band member who plays it able to read any section aloud.

import React, { useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Volume2 } from 'lucide-react';
import type { InstrumentLore } from '../../../../../services/melos/beats/band/lore';
import type { LiveDirector } from '../../../../../services/melos/beats/band/live/director';

type Section = 'physics' | 'materials' | 'construction' | 'tuning' | 'properties' | 'variants' | 'music' | 'traditions' | 'sources';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'physics', label: 'How it sounds' }, { id: 'materials', label: 'Materials' }, { id: 'construction', label: 'How it\'s built' },
  { id: 'tuning', label: 'Tuning' }, { id: 'properties', label: 'Range & size' }, { id: 'variants', label: 'Around the world' },
  { id: 'music', label: 'Its music' }, { id: 'traditions', label: 'Traditions' }, { id: 'sources', label: 'Sources' },
];

function text(l: InstrumentLore, s: Section): string[] {
  switch (s) {
    case 'properties': return [`Range: ${l.properties.range}`, `Size: ${l.properties.size}`, ...l.properties.other];
    case 'variants': return l.variants.map((v) => `${v.name} (${v.where}): ${v.how}`);
    case 'sources': return [];
    default: return l[s];
  }
}

export const LoreCard: React.FC<{ lore: InstrumentLore; accent: string; reader?: { name: string; director: LiveDirector | null } }> = ({ lore, accent, reader }) => {
  const [open, setOpen] = useState<Section | null>(null);
  const p = 'text-[11px] leading-relaxed text-white/75 m-0';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map(({ id, label }) => (
          <button key={id} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}
            className="h-6 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1"
            style={open === id ? { background: `${accent}33`, borderColor: accent, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.6)' }}>
            {id === 'sources' ? <BookOpen size={10} /> : <ChevronDown size={10} style={{ transform: open === id ? 'rotate(180deg)' : undefined }} />}
            {label}
          </button>
        ))}
      </div>
      {open && (
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 flex flex-col gap-1.5">
          {open !== 'sources' && reader?.director && (
            <button onClick={() => void reader.director!.say(text(lore, open).join(' '))}
              className="self-end h-5 px-1.5 rounded-md text-[9.5px] flex items-center gap-1 border border-white/10 text-white/55 hover:text-white hover:bg-white/10">
              <Volume2 size={10} /> {reader.name} reads this
            </button>
          )}
          {open === 'sources'
            ? <ul className="flex flex-col gap-1 m-0 p-0 list-none">{lore.sources.map((s) => (
                <li key={s.url} className="text-[10.5px]"><a href={s.url} target="_blank" rel="noreferrer" className="text-[#7DD3FC] hover:underline inline-flex items-center gap-1">{s.title}<ExternalLink size={9} /></a><span className="text-white/40"> · {s.publisher}</span></li>
              ))}</ul>
            : open === 'variants'
              ? <ul className="flex flex-col gap-1 m-0 pl-4">{lore.variants.map((v) => <li key={v.name} className={p}><span className="font-semibold text-white/90">{v.name}</span> <span className="text-white/40">· {v.where}</span> — {v.how}</li>)}</ul>
              : text(lore, open).map((t, i) => <p key={i} className={p}>{t}</p>)}
        </div>
      )}
    </div>
  );
};
