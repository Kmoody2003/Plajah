import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Film, Play } from 'lucide-react';
import type { Video, Album } from '../../types';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { tvCardRing, RAIL_GUTTER } from './tvFocusRing';
import { thumb, THUMB, onThumbError } from '../../src/lib/imageThumb';
import TvBrandBackdrop from './TvBrandBackdrop';
import { loadTaleoRails, type TaleoRail } from './moviesTvSections';
import { fetchVideoById } from '../../services/backendService';

/**
 * Taleo on a television — the declarative twin of the pointer-driven MoviesTVView, built on the
 * same useTvGrid Chora and Reello use. The old TV Taleo was the WEB view left to the global
 * geometric navigator, which infers the "nearest" focusable from element rects; on a dense,
 * multi-rail film wall that guesses wrong and reads as jumpy. Here the screen declares its rows and
 * a press only ever moves an index, so the same press always does the same thing.
 *
 * Poster cards (2/3), one vertical stack of rails, no side panel — a lean-back film grid. Selecting
 * a card opens MovieUXView (raw Video / VIDEO Album); a Continue-Watching card re-fetches by id first.
 */

const MoviesTvView: React.FC<{
  onBack: () => void;
  onSelectMovie: (item: Video | Album) => void;
}> = ({ onBack, onSelectMovie }) => {
  const [rails, setRails] = useState<TaleoRail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadTaleoRails().then(r => { if (alive) { setRails(r); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => rails.map(r => ({ id: r.id, count: r.items.length })), [rails]);

  const run = (rowId: string, col: number) => {
    const item = rails.find(r => r.id === rowId)?.items[col];
    if (!item) return;
    if (item.action.kind === 'ITEM') { onSelectMovie(item.action.item); return; }
    // Continue watching → re-fetch the full video, then open (mirrors MoviesTVView.resumeItem).
    fetchVideoById(item.action.id).then(v => { if (v) onSelectMovie(v); }).catch(() => {});
  };

  const { pos, zone } = useTvGrid({
    rows,
    onSelect: (p, rowId) => run(rowId, p.col),
    onBack: () => { onBack(); return true; },
  });

  // Keep the focused card centred along its rail and its row in view.
  const cellRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cellRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' }); }, [pos]);

  return (
    <div className="relative h-[100dvh] text-white flex flex-col overflow-hidden" data-tv-capture>
      <TvBrandBackdrop />

      <div className="relative flex items-center gap-3 px-12 pt-9 pb-3 shrink-0">
        <Film size={22} className="text-white/70" />
        <h1 className="text-2xl font-black tracking-tight">Taleo</h1>
      </div>

      <div className="relative flex-1 overflow-y-auto no-scrollbar px-12 pb-16 space-y-9">
        {loading && (
          <div className="space-y-9">
            {[0, 1, 2].map(r => (
              <div key={r}>
                <div className="h-4 w-40 bg-white/10 rounded mb-4" />
                <div className="flex gap-6">{[0, 1, 2, 3, 4].map(c => <div key={c} className="w-48 aspect-[2/3] rounded-xl bg-white/[0.06] shrink-0" />)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && rails.length === 0 && (
          <p className="text-white/40 text-lg mt-10">No films or series yet.</p>
        )}

        {rails.map((rail, rIdx) => (
          <section key={rail.id}>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/60 mb-4">{rail.title}</h2>
            <div className={`flex gap-6 overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
              {rail.items.map((it, col) => {
                const focused = zone === 'CONTENT' && isFocused(pos, rIdx, col);
                return (
                  <div
                    key={it.id || col}
                    ref={focused ? cellRef : undefined}
                    onClick={() => run(rail.id, col)}
                    className="shrink-0 w-48 cursor-pointer transition-transform"
                    style={focused ? { transform: 'scale(1.05)' } : undefined}
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.05]" style={{ boxShadow: tvCardRing(focused) }}>
                      {it.image
                        ? <img src={thumb(it.image, THUMB.card)} onError={onThumbError(it.image)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : <div className="w-full h-full grid place-items-center"><Film size={30} className="text-white/15" /></div>}
                      {focused && (
                        <div className="absolute inset-0 grid place-items-center bg-black/25">
                          <span className="w-12 h-12 rounded-full grid place-items-center" style={{ background: '#FF8C00', color: '#000' }}><Play size={22} fill="currentColor" className="ml-0.5" /></span>
                        </div>
                      )}
                      {typeof it.progress === 'number' && it.progress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20"><div className="h-full bg-[#FF8C00]" style={{ width: `${Math.round(it.progress * 100)}%` }} /></div>
                      )}
                    </div>
                    <p className={`mt-2 text-sm font-bold truncate ${focused ? 'text-white' : 'text-white/80'}`}>{it.title}</p>
                    {it.subtitle && <p className="text-xs text-white/40 truncate">{it.subtitle}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default MoviesTvView;
