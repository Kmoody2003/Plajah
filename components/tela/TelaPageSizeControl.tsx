import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Maximize2, RotateCw, Search } from 'lucide-react';
import type { TelaFrame, TelaFramePreset } from '../../types';
import {
  PAGE_PRESET_CATEGORIES,
  TELA_PAGE_SIZE_CATALOG,
  getPagePreset,
  pxFromUnitValue,
  unitValueFromPx,
  type PagePresetCategory,
} from '../../services/tela/pagePresets';

export type PageDimUnit = 'px' | 'in' | 'mm';

interface TelaPageSizeControlProps {
  frame: TelaFrame | null | undefined;
  onSelectPreset: (preset: TelaFramePreset) => void;
  onCustomResize: (w: number, h: number) => void;
  onFlipOrientation: (nextOrientation: 'PORTRAIT' | 'LANDSCAPE') => void;
}

export const TelaPageSizeControl: React.FC<TelaPageSizeControlProps> = ({
  frame,
  onSelectPreset,
  onCustomResize,
  onFlipOrientation,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PagePresetCategory | 'all'>('all');
  const [unit, setUnit] = useState<PageDimUnit>('px');
  const [wDraft, setWDraft] = useState('');
  const [hDraft, setHDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!frame) {
      setWDraft('');
      setHDraft('');
      return;
    }
    setWDraft(String(unitValueFromPx(frame.w, unit)));
    setHDraft(String(unitValueFromPx(frame.h, unit)));
  }, [frame?.id, frame?.w, frame?.h, unit]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TELA_PAGE_SIZE_CATALOG.filter(p => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.displayDims.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [category, search]);

  const grouped = useMemo(() => {
    const map = new Map<PagePresetCategory, typeof filtered>();
    for (const item of filtered) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  const commitCustomSize = () => {
    if (!frame) return;
    const nextW = pxFromUnitValue(parseFloat(wDraft), unit);
    const nextH = pxFromUnitValue(parseFloat(hDraft), unit);
    if (nextW >= 40 && nextH >= 40 && (nextW !== frame.w || nextH !== frame.h)) {
      onCustomResize(Math.min(30000, nextW), Math.min(30000, nextH));
    } else {
      setWDraft(String(unitValueFromPx(frame.w, unit)));
      setHDraft(String(unitValueFromPx(frame.h, unit)));
    }
  };

  const activeMeta = frame ? getPagePreset(frame.preset) : null;
  const activeLabel = frame
    ? frame.preset === 'FREE'
      ? `Custom ${unitValueFromPx(frame.w, unit)}×${unitValueFromPx(frame.h, unit)} ${unit}`
      : activeMeta?.label || `${frame.w}×${frame.h}`
    : 'Page Size';

  const nextOrient: 'PORTRAIT' | 'LANDSCAPE' =
    frame && frame.w > frame.h ? 'PORTRAIT' : 'LANDSCAPE';

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1 shrink-0" data-testid="page-size-toolbar">
      {/* Preset Dropdown Trigger */}
      <button
        type="button"
        disabled={!frame}
        onClick={() => setOpen(v => !v)}
        data-testid="page-size-preset-trigger"
        className="h-8 px-2.5 rounded-[9px] text-[.7rem] font-semibold text-white/85 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.12] flex items-center gap-1.5 disabled:opacity-40 max-w-[205px]"
        title="Choose Page / Canvas Size Preset (Film, Comic, Card Stock, Poster, Banner, Paper)"
      >
        <Maximize2 size={12} className="text-[#8FF5FF] shrink-0" />
        <span className="truncate">{activeLabel}</span>
        <ChevronDown size={12} className="opacity-60 shrink-0" />
      </button>

      {/* Inline Custom Width × Height Fields */}
      <div
        className="flex items-center gap-1 h-8 px-1.5 rounded-[9px] bg-white/[0.04] border border-white/[0.11]"
        title="Type custom page width and height and press Enter"
      >
        <input
          type="text"
          inputMode="decimal"
          aria-label="Page width"
          data-testid="page-size-custom-w"
          disabled={!frame}
          value={wDraft}
          onChange={e => setWDraft(e.target.value)}
          onBlur={commitCustomSize}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              commitCustomSize();
              e.currentTarget.blur();
            }
          }}
          className="w-12 h-6 bg-transparent text-center text-[.68rem] font-mono text-white outline-none rounded hover:bg-white/[0.06] focus:bg-white/[0.1]"
        />
        <span className="text-[10px] text-white/35 select-none">×</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Page height"
          data-testid="page-size-custom-h"
          disabled={!frame}
          value={hDraft}
          onChange={e => setHDraft(e.target.value)}
          onBlur={commitCustomSize}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              commitCustomSize();
              e.currentTarget.blur();
            }
          }}
          className="w-12 h-6 bg-transparent text-center text-[.68rem] font-mono text-white outline-none rounded hover:bg-white/[0.06] focus:bg-white/[0.1]"
        />
        <select
          aria-label="Dimension unit"
          value={unit}
          onChange={e => setUnit(e.target.value as PageDimUnit)}
          className="h-6 bg-transparent text-[.64rem] font-bold text-[#8FF5FF] outline-none cursor-pointer pr-0.5"
        >
          <option value="px" style={{ background: '#17131d' }}>px</option>
          <option value="in" style={{ background: '#17131d' }}>in</option>
          <option value="mm" style={{ background: '#17131d' }}>mm</option>
        </select>
      </div>

      {/* Quick Flip Orientation */}
      <button
        type="button"
        disabled={!frame}
        onClick={() => frame && onFlipOrientation(nextOrient)}
        className="w-7 h-8 rounded-[9px] text-white/65 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.1] grid place-items-center disabled:opacity-40"
        title={`Swap Portrait / Landscape (${frame ? `${frame.w}×${frame.h}` : ''})`}
      >
        <RotateCw size={12} />
      </button>

      {/* Categorized Preset Picker Popover */}
      {open && frame && (
        <div
          className="absolute left-0 top-10 z-[130] w-[360px] max-w-[92vw] rounded-[14px] border border-white/[0.14] shadow-2xl overflow-hidden flex flex-col"
          style={{ background: 'rgba(18,13,26,0.985)', backdropFilter: 'blur(14px)', maxHeight: '72vh' }}
        >
          {/* Search */}
          <div className="p-2.5 border-b border-white/[0.08] flex flex-col gap-2">
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.1]">
              <Search size={13} className="text-white/45 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search film 16:9, comic, postcard, poster, banner…"
                className="flex-1 min-w-0 bg-transparent text-[.72rem] text-white outline-none placeholder:text-white/35"
              />
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold transition-colors ${category === 'all' ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/[0.05] text-white/55 hover:text-white'}`}
              >
                All ({TELA_PAGE_SIZE_CATALOG.length})
              </button>
              {PAGE_PRESET_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold transition-colors ${category === c.id ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/[0.05] text-white/55 hover:text-white'}`}
                >
                  {c.id === 'film' ? 'Film (Fabula)' : c.id === 'comic' ? 'Comics' : c.id === 'print' ? 'Cards & Print' : c.id === 'banner' ? 'Banners' : 'Paper'}
                </button>
              ))}
            </div>
          </div>

          {/* Preset List */}
          <div className="overflow-y-auto custom-scrollbar p-1.5 flex-1">
            {PAGE_PRESET_CATEGORIES.map(cat => {
              const items = grouped.get(cat.id);
              if (!items?.length) return null;
              return (
                <div key={cat.id} className="mb-2 last:mb-0">
                  <div className="px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[.1em] text-[#8FF5FF]/80">
                    {cat.label}
                  </div>
                  {items.map(p => {
                    const isSel = frame.preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectPreset(p.id);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-[8px] flex items-center justify-between gap-2 text-[.72rem] transition-colors ${
                          isSel
                            ? 'bg-[var(--pj-magenta,#D40055)]/25 text-white font-bold'
                            : 'text-white/80 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{p.label}</span>
                        <span className="shrink-0 text-[10px] font-mono text-white/40">{p.displayDims}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!filtered.length && (
              <div className="px-3 py-6 text-center text-[.72rem] text-white/45">
                No presets match “{search}”. Type any exact W × H in the bar above.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
