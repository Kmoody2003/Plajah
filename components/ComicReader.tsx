import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, BookOpen, Rows3, Square, ArrowLeftRight,
} from 'lucide-react';

// Best-in-class comic/manga reader: single page, double-page spread (manga RTL aware),
// and webtoon (continuous vertical scroll). Fit-to-width/height + zoom, tap zones,
// keyboard nav, a page scrubber. Controlled `index` so it stays in sync with the host
// reader's saved position + footer. Works for any image-page comic (authored or imported).

type Mode = 'page' | 'spread' | 'webtoon';
type Fit = 'width' | 'height';

interface Props {
  pages: { url: string }[];
  index: number;
  onIndexChange: (i: number) => void;
  readingDir?: 'ltr' | 'rtl';
  title?: string;
}

const ComicReader: React.FC<Props> = ({ pages, index, onIndexChange, readingDir = 'ltr', title }) => {
  const [mode, setMode] = useState<Mode>('page');
  const [fit, setFit] = useState<Fit>('height');
  const [zoom, setZoom] = useState(1);
  const [rtl, setRtl] = useState(readingDir === 'rtl');
  const webtoonRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const programmaticScroll = useRef(false);
  const n = pages.length;
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));

  const step = mode === 'spread' ? 2 : 1;
  const go = useCallback((dir: 1 | -1) => {
    // In RTL, "forward" (right→left) still advances page index.
    onIndexChange(clamp(index + dir * step));
  }, [index, step, n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard nav (RTL swaps left/right meaning).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
      else if (e.key === 'ArrowDown' || e.key === ' ') { if (mode !== 'webtoon') { e.preventDefault(); go(1); } }
      else if (e.key === 'ArrowUp') { if (mode !== 'webtoon') go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, rtl, mode]);

  // Webtoon: observe which page is topmost → report as index; scroll to index when it changes externally.
  useEffect(() => {
    if (mode !== 'webtoon' || !webtoonRef.current) return;
    const root = webtoonRef.current;
    const io = new IntersectionObserver((entries) => {
      if (programmaticScroll.current) return;
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) { const i = Number((top.target as HTMLElement).dataset.i); if (!Number.isNaN(i) && i !== index) onIndexChange(i); }
    }, { root, threshold: 0.5 });
    pageRefs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [mode, n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'webtoon') return;
    const el = pageRefs.current[index];
    if (el) { programmaticScroll.current = true; el.scrollIntoView({ block: 'start', behavior: 'auto' }); setTimeout(() => { programmaticScroll.current = false; }, 120); }
  }, [index, mode]);

  const imgClass = fit === 'width' ? 'w-full h-auto' : 'h-full max-h-[86vh] w-auto';
  const atStart = index <= 0;
  const atEnd = index >= n - 1;

  // Tap zones: click left/right thirds to page (RTL aware).
  const tap = (e: React.MouseEvent) => {
    if (mode === 'webtoon') return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.33) go(rtl ? 1 : -1);
    else if (x > 0.67) go(rtl ? -1 : 1);
  };

  const Btn: React.FC<{ on?: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ on, onClick, title, children }) => (
    <button onClick={onClick} title={title} className={`p-2.5 rounded-lg transition-colors ${on ? 'bg-small-orange text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}>{children}</button>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* Reader toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-2xl bg-black/40 border border-white/8 mb-3 self-center backdrop-blur-md">
        <Btn on={mode === 'page'} onClick={() => setMode('page')} title="Single page"><Square size={15} /></Btn>
        <Btn on={mode === 'spread'} onClick={() => setMode('spread')} title="Two-page spread"><BookOpen size={15} /></Btn>
        <Btn on={mode === 'webtoon'} onClick={() => setMode('webtoon')} title="Webtoon (vertical scroll)"><Rows3 size={15} /></Btn>
        <span className="w-px h-4 bg-white/10 mx-1" />
        {mode !== 'webtoon' && <>
          <Btn on={fit === 'height'} onClick={() => setFit('height')} title="Fit height"><Maximize2 size={15} /></Btn>
          <Btn on={fit === 'width'} onClick={() => setFit('width')} title="Fit width"><ArrowLeftRight size={15} /></Btn>
          <Btn onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))} title="Zoom out"><ZoomOut size={15} /></Btn>
          <span className="text-[10px] text-white/40 w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Btn onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} title="Zoom in"><ZoomIn size={15} /></Btn>
          <span className="w-px h-4 bg-white/10 mx-1" />
        </>}
        <Btn on={rtl} onClick={() => setRtl(v => !v)} title="Manga reading direction (right-to-left)">
          <span className="text-[9px] font-black uppercase tracking-widest px-1">{rtl ? 'RTL' : 'LTR'}</span>
        </Btn>
      </div>

      {/* Reading area */}
      {mode === 'webtoon' ? (
        <div ref={webtoonRef} className="flex-1 overflow-y-auto flex flex-col items-center gap-1 scrollbar-hide">
          {pages.map((p, i) => (
            <img key={i} data-i={i} ref={el => { pageRefs.current[i] = el; }} src={p.url} alt={`Page ${i + 1}`} loading="lazy" referrerPolicy="no-referrer"
              className="w-full max-w-3xl object-contain" />
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-auto" onClick={tap}>
          {/* tap hint arrows */}
          {!atStart && <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white/20 pointer-events-none"><ChevronLeft size={30} /></div>}
          {!atEnd && <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white/20 pointer-events-none"><ChevronRight size={30} /></div>}
          <div className="flex gap-3 items-center justify-center h-full" style={{ transform: `scale(${zoom})`, transformOrigin: 'center', flexDirection: rtl && mode === 'spread' ? 'row-reverse' : 'row' }}>
            {pages[index] && <img src={pages[index].url} alt={`Page ${index + 1}`} referrerPolicy="no-referrer"
              className={`${imgClass} object-contain rounded-lg shadow-2xl ring-1 ring-white/10`} />}
            {mode === 'spread' && pages[index + 1] && <img src={pages[index + 1].url} alt={`Page ${index + 2}`} referrerPolicy="no-referrer"
              className={`${imgClass} object-contain rounded-lg shadow-2xl ring-1 ring-white/10`} />}
          </div>
        </div>
      )}

      {/* Scrubber + counter */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 mt-2 self-center rounded-full bg-black/40 border border-white/8 backdrop-blur-md">
        <button onClick={() => go(rtl ? 1 : -1)} disabled={rtl ? atEnd : atStart} className="text-white/50 hover:text-white disabled:opacity-20"><ChevronLeft size={18} /></button>
        <input type="range" min={0} max={Math.max(0, n - 1)} value={index} onChange={e => onIndexChange(clamp(Number(e.target.value)))}
          className="w-40 accent-small-orange" style={{ direction: rtl ? 'rtl' : 'ltr' }} />
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50 tabular-nums whitespace-nowrap">{index + 1} / {n}</span>
        <button onClick={() => go(rtl ? -1 : 1)} disabled={rtl ? atStart : atEnd} className="text-white/50 hover:text-white disabled:opacity-20"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
};

export default ComicReader;
