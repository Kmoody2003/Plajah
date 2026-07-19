// VerovioScore — publication-grade engraving of a MusicXML score, rendered by Verovio
// (RISM, LGPLv3; https://www.verovio.org). Lazy-loaded so the ~multi-MB WASM toolkit never
// enters the main bundle, and self-contained (WASM is embedded in the module — no asset to
// serve). Renders black-on-white like a real printed page, with a Print / Save-as-PDF action.
// Falls back gracefully (onFail) so the Breakdown keeps working if Verovio can't load.
//
// Three ways to feed it a score:
//   <VerovioScore musicXml={xmlString} />      — raw MusicXML you already have in memory
//   <VerovioScore musicXmlUrl="…/score.xml" /> — plain MusicXML fetched over the network
//   <VerovioScore mxlUrl="…/score.mxl" />      — ZIPPED MusicXML (.mxl). These are ZIP
//        archives, so loadData() will NOT parse them — they go through the toolkit's
//        loadZipDataBase64(). This is what the OpenScore Lieder corpus ships.
//
// Set `paged` to page through a long score one sheet at a time instead of scrolling the
// whole thing (all pages are engraved up-front either way, so Print always gets everything).

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Printer, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// The toolkit is expensive to construct — build it once per session and reuse.
let toolkitPromise: Promise<any> | null = null;
async function getToolkit(): Promise<any> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
        import('verovio/wasm'),
        import('verovio/esm'),
      ]);
      const mod = await createVerovioModule();
      return new VerovioToolkit(mod);
    })().catch(err => { toolkitPromise = null; throw err; });
  }
  return toolkitPromise;
}

/** ArrayBuffer → base64, chunked so we never blow the argument limit on a big score. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}

// The singleton toolkit holds one score at a time, so serialise renders across instances.
let renderQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = renderQueue.then(job, job);
  renderQueue = next.catch(() => {});
  return next;
}

interface Props {
  musicXml?: string;
  /** Plain (unzipped) MusicXML to fetch. */
  musicXmlUrl?: string;
  /** Zipped MusicXML (.mxl) to fetch — handled via loadZipDataBase64. */
  mxlUrl?: string;
  title?: string;
  /** Show one page at a time with prev/next instead of one long scroll. */
  paged?: boolean;
  /** Called if Verovio can't load or parse — parent should show its lightweight engraver instead. */
  onFail?: () => void;
}

const VerovioScore: React.FC<Props> = ({ musicXml, musicXmlUrl, mxlUrl, title = 'Score', paged, onFail }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setPages([]);
    setPage(0);

    enqueue(async () => {
      try {
        const tk = await getToolkit();
        if (cancelled) return;
        tk.setOptions({
          scale: 45,
          pageWidth: 2100,
          adjustPageHeight: true,
          breaks: 'auto',
          header: 'none',
          footer: 'none',
          spacingStaff: 10,
          spacingSystem: 14,
        });

        let ok = false;
        if (mxlUrl) {
          const res = await fetch(mxlUrl);
          if (!res.ok) throw new Error(`Score fetch failed (${res.status})`);
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          // .mxl is a ZIP container — this is the only entry point that understands it.
          ok = !!tk.loadZipDataBase64(toBase64(buf));
        } else if (musicXmlUrl) {
          const res = await fetch(musicXmlUrl);
          if (!res.ok) throw new Error(`Score fetch failed (${res.status})`);
          const xml = await res.text();
          if (cancelled) return;
          ok = !!tk.loadData(xml);
        } else if (musicXml) {
          ok = !!tk.loadData(musicXml);
        }
        if (!ok) throw new Error('Verovio could not parse the score');

        const count = Math.max(1, tk.getPageCount());
        const out: string[] = [];
        for (let p = 1; p <= count; p++) out.push(tk.renderToSVG(p));
        if (cancelled) return;
        setPages(out);
        setState('ready');
      } catch {
        if (cancelled) return;
        setState('error');
        onFail?.();
      }
    });

    return () => { cancelled = true; };
  }, [musicXml, musicXmlUrl, mxlUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSvg = useMemo(() => pages.join(''), [pages]);

  const print = useMemo(() => () => {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(`<!doctype html><title>${title}</title>` +
      `<style>@page{margin:14mm} body{margin:0;background:#fff} svg{width:100%;height:auto;display:block;page-break-inside:avoid}</style>` +
      `<h2 style="font-family:system-ui;text-align:center;margin:8px 0 16px">${title}</h2>${allSvg}`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* */ } }, 300);
  }, [allSvg, title]);

  const goto = useCallback((n: number) => {
    setPage(p => {
      const next = Math.min(pages.length - 1, Math.max(0, n));
      if (next !== p) scrollRef.current?.scrollTo({ top: 0 });
      return next;
    });
  }, [pages.length]);

  if (state === 'error') return null; // parent handles the fallback via onFail

  const shown = paged ? (pages[page] || '') : allSvg;

  return (
    <div className="relative">
      {state === 'ready' && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          <button
            onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(2)))}
            title="Smaller"
            className="flex items-center justify-center rounded-lg bg-black/70 border border-white/15 p-1.5 text-white/70 hover:text-white hover:bg-black/90 transition-colors"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={() => setZoom(z => Math.min(2.4, +(z + 0.2).toFixed(2)))}
            title="Larger"
            className="flex items-center justify-center rounded-lg bg-black/70 border border-white/15 p-1.5 text-white/70 hover:text-white hover:bg-black/90 transition-colors"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={print}
            title="Print or save the score as a PDF"
            className="flex items-center gap-1.5 rounded-lg bg-black/70 border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/80 hover:text-white hover:bg-black/90 transition-colors"
          >
            <Printer size={12} /> Print / PDF
          </button>
        </div>
      )}

      {state === 'loading' && (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-white/40">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[9px] font-black uppercase tracking-widest">Engraving with Verovio…</span>
        </div>
      )}

      {state === 'ready' && (
        <>
          {/* Real printed-page look: black notation on white paper, regardless of app theme. */}
          <div
            ref={scrollRef}
            className="bg-white rounded-2xl p-4 overflow-auto custom-scrollbar [&_svg]:h-auto [&_svg]:block [&_svg]:mx-auto"
            style={{ maxHeight: paged ? '68vh' : undefined }}
          >
            <div style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}
              className="[&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: shown }} />
          </div>

          {paged && pages.length > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => goto(page - 1)} disabled={page === 0}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-25 disabled:hover:text-white/60 transition-colors"
              >
                <ChevronLeft size={12} /> Prev
              </button>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
                Page {page + 1} / {pages.length}
              </span>
              <button
                onClick={() => goto(page + 1)} disabled={page >= pages.length - 1}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-25 disabled:hover:text-white/60 transition-colors"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VerovioScore;
