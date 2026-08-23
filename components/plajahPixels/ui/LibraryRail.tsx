// The Library, as the one place looks come from.
//
// Proposal 2's thesis was "One library, one canvas, one inspector". Before this there were THREE
// browsers of the same catalogue: this rail (shaders only), the deck's own source browser
// (Generators / Milkdrop / Shaders / Media), and the old shader modal. That is the exact
// "organised twice" fault the proposal set out to remove, tripled.
//
// So the rail now holds every browsable catalogue — Generators, Milkdrop, Shaders — and the deck
// keeps only the arranger (the launch grid). Picking anything here puts it on the canvas through
// one dispatch; the canvas beside it is the preview. There is no Apply on a rail.
//
// Media is deliberately NOT here: it is user uploads, not a preset catalogue, so it belongs in a
// media bin, not next to the browsable sets. Text and 3D likewise remain their own surfaces for
// now — the win is collapsing the three duplicated PRESET browsers into one.

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Shelf, WorkCard, Chip } from './index';
import ShaderLayer from '../components/ShaderLayer';
import { getShaderThumb, peekShaderThumb } from './shaderThumbs';
import { SHADER_LIBRARY, type ShaderLibraryEntry } from '../components/ShaderPanel';
import { SCENE_CATALOG } from '../engine/sceneCatalog';
import type { VisualizerMode } from '../types';

/** What kind of thing a chosen library item is — the dispatch the studio switches on. */
export type LibrarySource =
  | { kind: 'shader'; src: string }
  | { kind: 'generator'; mode: VisualizerMode }
  | { kind: 'milkdrop'; index: number; name: string };

type Section = 'shaders' | 'generators' | 'milkdrop';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'shaders', label: 'Shaders' },
  { id: 'generators', label: 'Generators' },
  { id: 'milkdrop', label: 'Milkdrop' },
];

/** Shader source filters, within the Shaders section. */
const KINDS: { id: 'all' | 'signature' | 'raw' | 'procedural' | 'isf'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'signature', label: 'Signature' },
  { id: 'raw', label: 'GLSL' },
  { id: 'procedural', label: 'Procedural' },
  { id: 'isf', label: 'ISF' },
];

interface ShelfGroup { key: string; title: string; sub?: string; items: ShaderLibraryEntry[] }

interface Props {
  /** The shader look currently on the canvas, so its card reads as selected. */
  selectedSrc: string | null;
  /** The generator currently on the canvas, if any. */
  selectedMode?: VisualizerMode | null;
  /** True while a milkdrop preset is the look, with its index for the selected state. */
  milkdropOn?: boolean;
  milkdropIndex?: number;
  /** Picking anything routes through here; the studio decides what it means. */
  onSelect: (source: LibrarySource) => void;
  /** Import ISF, delegated to the existing panel so the two do not diverge. */
  onImport?: () => void;
  /** Drives the live preview. Null before audio starts; the preview falls back to a still then. */
  analyser?: AnalyserNode | null;
}

/** A plain tile for sources that have no GLSL still to render — generators and milkdrop. */
const Tile: React.FC<{ name: string; sub?: string; selected?: boolean; onClick: () => void; hue: number }> =
({ name, sub, selected, onClick, hue }) => (
  <button
    onClick={onClick}
    className="text-left rounded-card overflow-hidden border transition-colors"
    style={{
      borderColor: selected ? 'var(--pj-orange)' : 'rgba(255,255,255,0.08)',
      boxShadow: selected ? '0 0 0 1px var(--pj-orange)' : 'none',
      background: 'rgba(255,255,255,0.02)',
    }}
  >
    <div className="h-[34px]" style={{
      background: `radial-gradient(90% 80% at 40% 40%, hsl(${hue} 70% 45% / 0.7), transparent 62%), #100c18`,
    }} />
    <div className="px-1.5 py-1">
      <p className="type-body-sm text-white/70 leading-tight truncate">{name}</p>
      {sub && <p className="type-label-sm text-white/30 truncate">{sub}</p>}
    </div>
  </button>
);

/**
 * The preview window.
 *
 * A shader gets a real live render when there is an analyser to drive it — the same ShaderLayer
 * the canvas uses, at thumbnail size — and falls back to its rendered still before audio starts.
 * A generator or milkdrop preset has no self-contained render at this size (it needs the whole
 * visualiser), so it shows its name on a swatch; picking it makes the main canvas its preview.
 */
const Preview: React.FC<{ work: ShaderLibraryEntry | null; label: string | null; analyser?: AnalyserNode | null }> =
({ work, label, analyser }) => {
  const [still, setStill] = useState<string | null>(() => (work ? peekShaderThumb(work.name) : null));
  useEffect(() => {
    setStill(work ? peekShaderThumb(work.name) : null);
    if (!work) return;
    let dead = false;
    getShaderThumb(work.name, work.src).then(u => { if (!dead && u) setStill(u); });
    return () => { dead = true; };
  }, [work]);

  return (
    <div className="px-3 pt-3 pb-2">
      <div className="relative aspect-video rounded-card overflow-hidden bg-black/60 border border-white/10">
        {work && analyser
          ? <ShaderLayer analyser={analyser} source={work.src} startTimeMs={0} />
          : work && still
            ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${still})` }} />
            : (
              <div className="absolute inset-0 grid place-content-center"
                style={{ background: 'radial-gradient(90% 80% at 40% 40%, rgba(107,0,153,0.5), transparent 62%), #0b0910' }}>
                <span className="type-label-sm uppercase tracking-[0.16em] text-white/40 px-2 text-center">
                  {label ?? 'Hover a work'}
                </span>
              </div>
            )}
      </div>
      {(work?.name || label) && (
        <p className="type-body-sm text-white/70 truncate mt-1.5">{work?.name ?? label}</p>
      )}
    </div>
  );
};

export const LibraryRail: React.FC<Props> = ({
  selectedSrc, selectedMode, milkdropOn, milkdropIndex, onSelect, onImport, analyser,
}) => {
  // What the preview window shows: whatever is under the pointer, falling back to the current
  // selection so the window is never empty once something is on the canvas.
  const [hoverSrc, setHoverSrc] = useState<string | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('shaders');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('all');

  // Milkdrop's preset list is large and only butterchurn knows it — lazily, exactly as the deck's
  // browser did, so nothing loads it until the Milkdrop section is opened.
  const [milkNames, setMilkNames] = useState<string[]>([]);
  const [milkLoading, setMilkLoading] = useState(false);
  useEffect(() => {
    if (section !== 'milkdrop' || milkNames.length) return;
    setMilkLoading(true);
    import('butterchurn-presets').then(mod => {
      const api = (mod as { default?: unknown }).default || mod;
      const presets = (api as { getPresets?: () => Record<string, unknown> }).getPresets?.() ?? api;
      setMilkNames(Object.keys(presets as Record<string, unknown>).sort());
    }).catch(() => { /* offline or missing — the section simply shows nothing */ })
      .finally(() => setMilkLoading(false));
  }, [section, milkNames.length]);

  const q = search.trim().toLowerCase();

  // ── Shaders ──
  const filteredShaders = useMemo(() =>
    SHADER_LIBRARY.filter(s =>
      (kind === 'all' || (s.kind ?? 'raw') === kind) &&
      (!q || s.name.toLowerCase().includes(q) || (s.setTitle ?? '').toLowerCase().includes(q))),
  [kind, q]);

  const shaderShelves = useMemo<ShelfGroup[]>(() => {
    const out: ShelfGroup[] = [];
    const sig = filteredShaders.filter(s => s.kind === 'signature');
    const seen = new Set<string>();
    for (const w of sig) {
      const key = `${w.series}·${w.setTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, title: w.setTitle || 'Signature', sub: `Series ${w.series}`,
        items: sig.filter(x => x.series === w.series && x.setTitle === w.setTitle) });
    }
    const rest = filteredShaders.filter(s => s.kind !== 'signature');
    const byCat = new Map<string, ShaderLibraryEntry[]>();
    for (const s of rest) { const l = byCat.get(s.category) ?? []; l.push(s); byCat.set(s.category, l); }
    for (const [cat, items] of byCat) out.push({ key: cat, title: cat, items });
    return out;
  }, [filteredShaders]);

  // ── Generators (SCENE_CATALOG) ──
  const generators = useMemo(() =>
    SCENE_CATALOG.filter(s => !q || s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q)),
  [q]);

  // ── Milkdrop ──
  const milk = useMemo(() =>
    milkNames.map((name, i) => ({ name, i }))
      .filter(m => !q || m.name.toLowerCase().includes(q))
      .slice(0, 160),
  [milkNames, q]);

  const count = section === 'shaders' ? SHADER_LIBRARY.length
    : section === 'generators' ? SCENE_CATALOG.length
    : milkNames.length;

  return (
    <aside
      className="w-[210px] shrink-0 h-full flex flex-col bg-black/70 backdrop-blur-2xl border-r border-white/10"
      aria-label="Library"
    >
      {/* The preview window — plays what you point at. */}
      <Preview
        work={hoverSrc ? (SHADER_LIBRARY.find(w => w.src === hoverSrc) ?? null)
              : selectedSrc ? (SHADER_LIBRARY.find(w => w.src === selectedSrc) ?? null) : null}
        label={hoverLabel}
        analyser={analyser}
      />

      {/* Header + section switch — the three catalogues that used to be three separate browsers. */}
      <div className="px-3 pt-2.5 pb-2 border-t border-b border-white/10">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="type-label-sm uppercase tracking-[0.14em]" style={{ color: 'var(--pj-cyan)' }}>Library</span>
          <span className="ml-auto type-label-sm text-white/25 tabular-nums">{count}</span>
        </div>
        <div className="flex gap-1">
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              onClick={() => setSection(sec.id)}
              className="flex-1 h-6 rounded-control type-label-sm uppercase tracking-[0.1em] transition-colors"
              style={{
                background: section === sec.id ? 'var(--pj-purple)' : 'transparent',
                color: section === sec.id ? '#F3E6FA' : 'rgba(255,255,255,0.35)',
              }}
            >
              {sec.label}
            </button>
          ))}
        </div>
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

      {/* Shader source filter, only where it applies */}
      {section === 'shaders' && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.08] overflow-x-auto scrollbar-none">
          {KINDS.map(k => (
            <Chip key={k.id} interactive selected={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>
          ))}
        </div>
      )}

      {/* The shelves */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 scrollbar-none">
        {section === 'shaders' && (<>
          {shaderShelves.map(shelf => (
            <div key={shelf.key}>
              <Shelf title={shelf.title} sub={shelf.sub} count={shelf.items.length} />
              <div className="grid grid-cols-2 gap-1.5">
                {shelf.items.map(w => (
                  <div
                    key={w.name}
                    onPointerEnter={() => { setHoverSrc(w.src); setHoverLabel(null); }}
                    onPointerLeave={() => setHoverSrc(null)}
                  >
                    <WorkCard
                      name={w.name} cacheKey={w.name} src={w.src}
                      meta={w.kind === 'signature' ? w.setTitle : (w.license || w.category)}
                      bands={w.reacts?.map(r => r[0])}
                      selected={selectedSrc === w.src}
                      onClick={() => onSelect({ kind: 'shader', src: w.src })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredShaders.length === 0 && <p className="type-body-sm text-white/25 text-center py-6">Nothing matches.</p>}
        </>)}

        {section === 'generators' && (
          <div className="grid grid-cols-2 gap-1.5 pt-1.5">
            {generators.map((g, i) => (
              <div key={g.name}
                onPointerEnter={() => { setHoverSrc(null); setHoverLabel(g.name); }}
                onPointerLeave={() => setHoverLabel(null)}>
                <Tile
                  name={g.name} sub={g.cat}
                  hue={(i * 47) % 360}
                  selected={!selectedSrc && selectedMode === g.mode}
                  onClick={() => onSelect({ kind: 'generator', mode: g.mode })}
                />
              </div>
            ))}
          </div>
        )}

        {section === 'milkdrop' && (<>
          {milkLoading && <p className="type-body-sm text-white/25 text-center py-6">Loading presets…</p>}
          <div className="grid grid-cols-2 gap-1.5 pt-1.5">
            {milk.map(m => (
              <div key={m.i}
                onPointerEnter={() => { setHoverSrc(null); setHoverLabel(m.name); }}
                onPointerLeave={() => setHoverLabel(null)}>
                <Tile
                  name={m.name} hue={(m.i * 31) % 360}
                  selected={!!milkdropOn && milkdropIndex === m.i}
                  onClick={() => onSelect({ kind: 'milkdrop', index: m.i, name: m.name })}
                />
              </div>
            ))}
          </div>
          {!milkLoading && milk.length === 0 && <p className="type-body-sm text-white/25 text-center py-6">Nothing matches.</p>}
        </>)}
      </div>

      {section === 'shaders' && onImport && (
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
