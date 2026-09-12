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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Shelf, WorkCard, Chip } from './index';
import ShaderLayer from '../components/ShaderLayer';
import { getShaderThumb, peekShaderThumb } from './shaderThumbs';
import { getSilentAnalyser } from '../engine/silentAnalyser';
import { GeneratorPreviewTile } from '../components/ShaderPreviewTile';
import { SHADER_LIBRARY, type ShaderLibraryEntry } from '../components/ShaderPanel';
import { SCENE_CATALOG } from '../engine/sceneCatalog';
import type { VisualizerMode } from '../types';

/** What kind of thing a chosen library item is — the dispatch the studio switches on. */
export type LibrarySource =
  | { kind: 'shader'; src: string }
  | { kind: 'generator'; mode: VisualizerMode }
  | { kind: 'milkdrop'; index: number; name: string };

type Section = 'shaders' | 'generators' | 'milkdrop';

/** The rail earns its keep as a browser at ~170px and stops being a rail past ~460px. */
const LIB_MIN = 170;
const LIB_MAX = 460;

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
const Tile: React.FC<{ name: string; sub?: string; selected?: boolean; onClick: () => void; onDoubleClick?: () => void; hue: number; mode?: string }> =
({ name, sub, selected, onClick, onDoubleClick, hue, mode }) => (
  <button
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    title="Click to preview · double-click to send to program"
    className="text-left rounded-card overflow-hidden border transition-colors"
    style={{
      borderColor: selected ? 'var(--pj-orange)' : 'rgba(255,255,255,0.08)',
      boxShadow: selected ? '0 0 0 1px var(--pj-orange)' : 'none',
      background: 'rgba(255,255,255,0.02)',
    }}
  >
    <div className="relative h-[34px] overflow-hidden">
      {mode
        ? <GeneratorPreviewTile mode={mode} hue={hue} />
        : <div className="h-full" style={{ background: `radial-gradient(90% 80% at 40% 40%, hsl(${hue} 70% 45% / 0.7), transparent 62%), #100c18` }} />}
    </div>
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
  // Prefer live audio when it is running; otherwise fall back to the silent analyser so the
  // preview still MOVES rather than freezing on a still.
  const driver = analyser ?? getSilentAnalyser();
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
        {work && driver
          ? <ShaderLayer analyser={driver} source={work.src} startTimeMs={0} />
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
  // A single click PICKS — it locks the preview and highlights the card without changing what is
  // on program. A double click COMMITS: the work lights up on the program output. So you can audition
  // in the preview and only send it live when you mean to.
  const [pickedSrc, setPickedSrc] = useState<string | null>(null);

  // Width is the user's, and it sticks. The preview and the shelves both flow from it, so widening
  // the rail widens the preview — which is the point of making it resizable rather than fixed.
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(typeof localStorage !== 'undefined' && localStorage.getItem('plajah-pixels-lib-w'));
    return saved >= LIB_MIN && saved <= LIB_MAX ? saved : 210;
  });
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      // The rail is pinned to the left, so its width is simply the pointer's x.
      const w = Math.max(LIB_MIN, Math.min(LIB_MAX, e.clientX));
      setWidth(w);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('plajah-pixels-lib-w', String(Math.round(widthRef.current))); } catch { /* private mode */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  // The handler closes over the first width; a ref keeps the persisted value current without
  // re-binding the listeners every drag frame.
  const widthRef = useRef(width);
  widthRef.current = width;
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
      className="relative shrink-0 h-full flex flex-col bg-black/70 backdrop-blur-2xl border-r border-white/10"
      style={{ width }}
      aria-label="Library"
    >
      {/* The preview window — plays what you point at, then what you picked, then what is live. */}
      <Preview
        work={(() => {
          const src = hoverSrc ?? pickedSrc ?? selectedSrc;
          return src ? (SHADER_LIBRARY.find(w => w.src === src) ?? null) : null;
        })()}
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
                      livePreview
                      selected={selectedSrc === w.src}
                      picked={pickedSrc === w.src && selectedSrc !== w.src}
                      onClick={() => setPickedSrc(w.src)}
                      onDoubleClick={() => { setPickedSrc(w.src); onSelect({ kind: 'shader', src: w.src }); }}
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
                  mode={g.mode}
                  selected={!selectedSrc && selectedMode === g.mode}
                  onClick={() => { setPickedSrc(null); setHoverLabel(g.name); }}
                  onDoubleClick={() => onSelect({ kind: 'generator', mode: g.mode })}
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
                  onClick={() => { setPickedSrc(null); setHoverLabel(m.name); }}
                  onDoubleClick={() => onSelect({ kind: 'milkdrop', index: m.i, name: m.name })}
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
      {/* Resize handle — a hairline that widens on hover, sitting on the right edge. Doubles as a
          keyboard target so the rail is resizable without a pointer. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize library"
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { const w = Math.max(LIB_MIN, width - 16); setWidth(w); try { localStorage.setItem('plajah-pixels-lib-w', String(w)); } catch { /* */ } }
          if (e.key === 'ArrowRight') { const w = Math.min(LIB_MAX, width + 16); setWidth(w); try { localStorage.setItem('plajah-pixels-lib-w', String(w)); } catch { /* */ } }
        }}
        className="absolute top-0 right-0 h-full w-1.5 translate-x-1/2 cursor-col-resize z-10 group"
      >
        <span className="block h-full w-px mx-auto bg-white/10 group-hover:bg-[var(--pj-orange)] group-focus:bg-[var(--pj-orange)] transition-colors" />
      </div>
    </aside>
  );
};

export default LibraryRail;
