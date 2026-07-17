// VerovioScore — publication-grade engraving of a MusicXML score, rendered by Verovio
// (RISM, LGPLv3; https://www.verovio.org). Lazy-loaded so the ~multi-MB WASM toolkit never
// enters the main bundle, and self-contained (WASM is embedded in the module — no asset to
// serve). Renders black-on-white like a real printed page, with a Print / Save-as-PDF action.
// Falls back gracefully (onFail) so the Breakdown keeps working if Verovio can't load.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Printer, Loader2 } from 'lucide-react';

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

interface Props {
  musicXml: string;
  title?: string;
  /** Called if Verovio can't load or parse — parent should show its lightweight engraver instead. */
  onFail?: () => void;
}

const VerovioScore: React.FC<Props> = ({ musicXml, title = 'Score', onFail }) => {
  const [svg, setSvg] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
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
        const ok = tk.loadData(musicXml);
        if (!ok) throw new Error('Verovio could not parse the MusicXML');
        const pages = Math.max(1, tk.getPageCount());
        let out = '';
        for (let p = 1; p <= pages; p++) out += tk.renderToSVG(p);
        if (cancelled) return;
        setSvg(out);
        setState('ready');
      } catch {
        if (cancelled) return;
        setState('error');
        onFail?.();
      }
    })();
    return () => { cancelled = true; };
  }, [musicXml]); // eslint-disable-line react-hooks/exhaustive-deps

  const print = useMemo(() => () => {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(`<!doctype html><title>${title}</title>` +
      `<style>@page{margin:14mm} body{margin:0;background:#fff} svg{width:100%;height:auto;display:block;page-break-inside:avoid}</style>` +
      `<h2 style="font-family:system-ui;text-align:center;margin:8px 0 16px">${title}</h2>${svg}`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* */ } }, 300);
  }, [svg, title]);

  if (state === 'error') return null; // parent handles the fallback via onFail

  return (
    <div className="relative">
      {state === 'ready' && (
        <button
          onClick={print}
          title="Print or save the score as a PDF"
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/70 border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/80 hover:text-white hover:bg-black/90 transition-colors"
        >
          <Printer size={12} /> Print / PDF
        </button>
      )}
      {state === 'loading' && (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-white/40">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[9px] font-black uppercase tracking-widest">Engraving with Verovio…</span>
        </div>
      )}
      {state === 'ready' && (
        // Real printed-page look: black notation on white paper, regardless of app theme.
        <div className="bg-white rounded-2xl p-4 overflow-x-auto custom-scrollbar [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
};

export default VerovioScore;
