// The Library, as a place.
//
// Proposal 2's thesis, in its own words: "Library is a place, not a modal. A permanent left rail
// with shelves by series, cards with stills, and search — the same pattern every creative tool
// has converged on." It shipped as a modal behind a button, which is why it kept being reported
// missing: a place you have to know to summon is not a place.
//
// This is that rail. It reuses the same catalogue, shelving and cards the modal used — nothing is
// re-implemented, only re-housed — so a card looks and behaves identically whether the Library is
// a column or a floating panel. Picking a card sets the look immediately: on a rail there is no
// Apply button to reach for, and the canvas beside it is the preview.

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Shelf, WorkCard, Chip } from './index';
import { SHADER_LIBRARY, type ShaderLibraryEntry } from '../components/ShaderPanel';

/** The source filters, matching the modal's. `all` first because most sessions want everything. */
const KINDS: { id: 'all' | 'signature' | 'raw' | 'procedural' | 'isf'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'signature', label: 'Signature' },
  { id: 'raw', label: 'GLSL' },
  { id: 'procedural', label: 'Procedural' },
  { id: 'isf', label: 'ISF' },
];

interface ShelfGroup { key: string; title: string; sub?: string; items: ShaderLibraryEntry[] }

interface Props {
  /** The look currently on the canvas, so its card reads as selected. */
  selectedSrc: string | null;
  /** Picking a card puts the work on the canvas. */
  onSelect: (src: string) => void;
  /** Optional: import ISF, delegated to the existing panel so the two do not diverge. */
  onImport?: () => void;
}

export const LibraryRail: React.FC<Props> = ({ selectedSrc, onSelect, onImport }) => {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SHADER_LIBRARY.filter(s =>
      (kind === 'all' || (s.kind ?? 'raw') === kind) &&
      (!q || s.name.toLowerCase().includes(q) || (s.setTitle ?? '').toLowerCase().includes(q)));
  }, [search, kind]);

  // Signature works shelve by series and set — how they were made and how you would look for
  // one. Everything else falls under a single shelf per category, exactly as the modal grouped it.
  const shelves = useMemo<ShelfGroup[]>(() => {
    const out: ShelfGroup[] = [];
    const sig = filtered.filter(s => s.kind === 'signature');
    const seen = new Set<string>();
    for (const w of sig) {
      const key = `${w.series}·${w.setTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        title: w.setTitle || 'Signature',
        sub: `Series ${w.series}`,
        items: sig.filter(x => x.series === w.series && x.setTitle === w.setTitle),
      });
    }
    const rest = filtered.filter(s => s.kind !== 'signature');
    const byCat = new Map<string, ShaderLibraryEntry[]>();
    for (const s of rest) {
      const list = byCat.get(s.category) ?? [];
      list.push(s);
      byCat.set(s.category, list);
    }
    for (const [cat, items] of byCat) out.push({ key: cat, title: cat, items });
    return out;
  }, [filtered]);

  return (
    <aside
      className="w-[210px] shrink-0 h-full flex flex-col bg-black/70 backdrop-blur-2xl border-r border-white/10"
      aria-label="Library"
    >
      {/* Header — named for what it holds, with the count the modal used to show. */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-baseline gap-2">
        <span className="type-label-sm uppercase tracking-[0.14em]" style={{ color: 'var(--pj-cyan)' }}>
          Library
        </span>
        <span className="ml-auto type-label-sm text-white/25 tabular-nums">{SHADER_LIBRARY.length}</span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.08]">
        <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search the library"
          className="flex-1 min-w-0 bg-transparent type-body-sm text-white/80 placeholder-white/25 outline-none"
        />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.08] overflow-x-auto scrollbar-none">
        {KINDS.map(k => (
          <Chip key={k.id} interactive selected={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>

      {/* Shelves — the same WorkCard the modal used, so stills and band dots are identical. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 scrollbar-none">
        {shelves.map(shelf => (
          <div key={shelf.key}>
            <Shelf title={shelf.title} sub={shelf.sub} count={shelf.items.length} />
            <div className="grid grid-cols-2 gap-1.5">
              {shelf.items.map(w => (
                <WorkCard
                  key={w.name}
                  name={w.name}
                  cacheKey={w.name}
                  src={w.src}
                  meta={w.kind === 'signature' ? w.setTitle : (w.license || w.category)}
                  bands={w.reacts?.map(r => r[0])}
                  selected={selectedSrc === w.src}
                  onClick={() => onSelect(w.src)}
                />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="type-body-sm text-white/25 text-center py-6">Nothing matches.</p>
        )}
      </div>

      {onImport && (
        <button
          onClick={onImport}
          className="px-3 py-2 border-t border-white/[0.08] text-left type-label-sm uppercase tracking-[0.14em] text-white/40 hover:text-white hover:bg-white/[0.04] transition-colors flex items-center justify-between"
        >
          <span>+ Import ISF</span>
          <span className="text-white/20">{SHADER_LIBRARY.length} works</span>
        </button>
      )}
    </aside>
  );
};

export default LibraryRail;
