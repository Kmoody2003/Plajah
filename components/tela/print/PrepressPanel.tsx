/**
 * PrepressPanel — Tela's print production desk.
 *
 * Pick what you're making (book, magazine, newspaper, comic, flyer, card, banner, wrap…) and the press it
 * prints on (home printer, digital, offset, newsprint, wide format). Tela renders every page off-screen,
 * measures it (domPrintJob) and runs preflight live, soft-proofs a page against the press condition, works
 * out spine and cover spreads, saddle-stitch creep and gang-ups, and exports:
 *   • Press PDF  — CMYK, bleed, crop/registration marks, colour bar, PDF/X-1a structure
 *   • Digital PDF — RGB with bleed and trim box, for POD services that take RGB
 *   • Home print — RGB, single pages or an imposed fold-and-staple booklet
 * Wraps and dielines live in the second tab (WrapDesigner).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, Eye, Info, Layers, Loader2, Printer, ScanSearch, X, XCircle } from 'lucide-react';
import type { TelaDoc, TelaFrame } from '../../../types';
import type { DocPrintSpec, JobPage, PreflightFinding, PrintIntent, SpotColor } from '../../../services/print/types';
import { PX_PER_IN } from '../../../services/print/types';
import { PRINT_PRODUCTS, defaultSpecFor, productById } from '../../../services/print/products';
import { OUTPUT_CONDITIONS, PAPER_STOCKS, conditionById, paperById } from '../../../services/print/conditions';
import { preflight, preflightSummary } from '../../../services/print/preflight';
import { coverSpread, pageCountRule, spineTextAllowed, spineWidthFromStock } from '../../../services/print/binding';
import { creepOffsets, nUp, saddleStitchSpreads } from '../../../services/print/imposition';
import { measurePage, rasterizePage, rasterizeRegion, sampleMaxTac, settle, softProof } from '../../../services/print/domPrintJob';
import WrapDesigner from './WrapDesigner';
import type { RasterPage } from '../../../services/print/pressPdf';
import type { ResolvedFont } from '../../../services/print/vector';

interface Props {
  doc: TelaDoc;
  /** Natural-size page content (96 px = 1 in) — the same renderer the print portal uses. */
  renderFrame: (frame: TelaFrame) => React.ReactNode;
  onSetSpec: (spec: DocPrintSpec | null, resizeFrameIds?: string[]) => void;
  onAddBlankPages: (count: number, trimIn: [number, number]) => void;
  onCreateWrapBoard?: React.ComponentProps<typeof WrapDesigner>['onCreateArtboard'];
  onClose: () => void;
}

const KIND_GROUPS: Array<[string, string[]]> = [
  ['Books', ['book']], ['Magazines & newspapers', ['magazine', 'newspaper', 'zine']], ['Comics & manga', ['comic', 'manga']],
  ['Flats & folds', ['flyer', 'poster', 'postcard', 'business-card', 'brochure', 'sticker', 'banner']], ['Wraps', ['vehicle-wrap', 'object-wrap']],
];

const CUT: SpotColor = { name: 'CutContour', previewHex: '#ff00ff', cmykFallback: [0, 100, 0, 0], technical: 'cut' };
const CREASE: SpotColor = { name: 'Crease', previewHex: '#3b82f6', cmykFallback: [100, 0, 0, 0], technical: 'crease' };

const lbl = 'block text-[9.5px] font-extrabold uppercase tracking-[.12em] text-white/40 mb-1';
const field = 'w-full h-9 px-2.5 rounded-[9px] text-[.8rem] bg-white/[0.05] border border-white/[0.12] text-white/90 outline-none focus:border-[#8FF5FF]/50';

function guessProduct(doc: TelaDoc): string {
  if (doc.issue) return 'newspaper-tabloid';
  if (doc.publication?.kind === 'comic-book') return 'comic-us';
  if (doc.publication?.kind === 'manga') return 'manga-tankobon';
  if (doc.publication?.kind === 'picture-book') return 'picture-book-8.5';
  return 'flyer-letter';
}

const PrepressPanel: React.FC<Props> = ({ doc, renderFrame, onSetSpec, onAddBlankPages, onCreateWrapBoard, onClose }) => {
  const [tab, setTab] = useState<'press' | 'wrap'>(productById(doc.print?.productId || '')?.binding === 'wrap' ? 'wrap' : 'press');
  const [spec, setSpecState] = useState<DocPrintSpec>(() => doc.print || defaultSpecFor(guessProduct(doc)));
  const paperFrames = useMemo(() => doc.frames.filter(f => f.kind === 'PAPER' || (doc.print?.pageFrameIds || []).includes(f.id)), [doc.frames, doc.print]);
  const pageFrames = useMemo(() => {
    const ids = spec.pageFrameIds.length ? spec.pageFrameIds : paperFrames.map(f => f.id);
    return ids.map(id => doc.frames.find(f => f.id === id)).filter((f): f is TelaFrame => !!f);
  }, [spec.pageFrameIds, paperFrames, doc.frames]);
  const product = productById(spec.productId);
  const cond = conditionById(spec.conditionId);
  const paper = paperById(spec.paperId);

  const setSpec = (patch: Partial<DocPrintSpec>) => setSpecState(s => ({ ...s, ...patch }));
  const chooseProduct = (id: string) => setSpecState(s => defaultSpecFor(id, { pageFrameIds: s.pageFrameIds, spotColors: s.spotColors }));
  const chooseCondition = (id: DocPrintSpec['conditionId']) => { const c = conditionById(id); setSpec({ conditionId: id, intent: c.intent, marks: { ...spec.marks, crop: c.intent !== 'home' } }); };
  const save = (resize = false) => onSetSpec(spec, resize ? pageFrames.map(f => f.id) : undefined);
  // Persist edits (not the initial open) so the spec travels with the document.
  const mounted = useRef(false);
  useEffect(() => { if (mounted.current) onSetSpec(spec); mounted.current = true; }, [spec]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Off-screen render + measurement ──
  const pageEls = useRef(new Map<string, HTMLDivElement>());
  const [job, setJob] = useState<JobPage[]>([]);
  const [checking, setChecking] = useState(false);
  const [deep, setDeep] = useState(false);
  const runCheck = useCallback(async (withInk: boolean) => {
    setChecking(true);
    const pages: JobPage[] = [];
    for (const f of pageFrames) {
      const el = pageEls.current.get(f.id); if (!el) continue;
      await settle(el);
      const pg = measurePage(el, { id: f.id, label: f.label || `Page ${pages.length + 1}`, trimIn: [f.w / PX_PER_IN, f.h / PX_PER_IN] });
      if (withInk && cond.colorModel === 'CMYK') pg.maxTac = sampleMaxTac(await rasterizePage(el, 24), cond.tac, cond.gcr);
      pages.push(pg);
    }
    setJob(pages); setDeep(withInk); setChecking(false);
  }, [pageFrames, cond]);
  useEffect(() => { const t = setTimeout(() => void runCheck(false), 400); return () => clearTimeout(t); }, [runCheck, spec.productId, spec.bleedIn, spec.safeIn, spec.trimIn]);

  const findings = useMemo<PreflightFinding[]>(() => preflight({ title: doc.title, spec, pages: job }), [doc.title, spec, job]);
  const summary = preflightSummary(findings);

  // ── Soft proof ──
  const [proofId, setProofId] = useState<string | null>(null);
  const [proof, setProof] = useState<{ url: string; gamut: number } | null>(null);
  const proofPage = async (id: string) => {
    const el = pageEls.current.get(id); if (!el) return;
    setProofId(id); setProof(null);
    const raster = await rasterizePage(el, 72);
    const { proof: img, gamutPct } = await softProof(raster, cond.tac, cond.gcr);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0);
    setProof({ url: c.toDataURL('image/png'), gamut: gamutPct });
  };

  // ── Export ──
  const [busy, setBusy] = useState<string | null>(null);
  const [vectorOn, setVectorOn] = useState(true);
  const [result, setResult] = useState<{ name: string; notes: string[]; conformance: string } | null>(null);
  const exportPdf = async (mode: 'press' | 'digital' | 'home-pages' | 'home-booklet', dpi: number) => {
    setBusy(mode); setResult(null);
    try {
      const { buildPressPdf } = await import('../../../services/print/pressPdf');
      const outSpec: DocPrintSpec = mode === 'press' ? spec
        : mode === 'digital' ? { ...spec, conditionId: 'WIDE_FORMAT', intent: 'digital', marks: { ...spec.marks, crop: false, registration: false, colorBar: false } }
        : { ...spec, conditionId: 'HOME_RGB', intent: 'home', bleedIn: 0 };
      const pages: RasterPage[] = [];
      const fonts: Record<string, ResolvedFont> = {};
      const { buildVectorPage } = vectorOn ? await import('../../../services/print/vectorPage') : { buildVectorPage: null };
      for (const f of pageFrames) {
        const el = pageEls.current.get(f.id); if (!el) continue;
        setBusy(`${mode}: rendering ${f.label || 'page'}…`);
        if (buildVectorPage) {
          // Text and shapes become real vector; the raster keeps only images and effects.
          const vb = await buildVectorPage(el, fonts);
          try { pages.push({ label: f.label || `Page ${pages.length + 1}`, ...(await rasterizePage(vb.clone, dpi)), includesBleed: false, vector: vb.vector }); }
          finally { vb.dispose(); }
        } else {
          pages.push({ label: f.label || `Page ${pages.length + 1}`, ...(await rasterizePage(el, dpi)), includesBleed: false });
        }
      }
      setBusy(`${mode}: writing PDF…`);
      const res = await buildPressPdf({
        // Digital = RGB with bleed and boxes (the RGB wide-format condition keeps bleed; marks are off).
        title: doc.title, spec: outSpec, dpi, pages,
        impose: mode === 'home-booklet' ? 'home-booklet' : 'none',
        // Die lines travel with press and digital files (never home prints): CutContour / Crease spots.
        dielines: spec.dieline && (mode === 'press' || mode === 'digital') ? [
          ...(spec.dieline.cut.length ? [{ pageIndex: 0, paths: spec.dieline.cut, spot: spec.spotColors.find(s => s.technical === 'cut') || CUT }] : []),
          ...(spec.dieline.crease.length ? [{ pageIndex: 0, paths: spec.dieline.crease, spot: spec.spotColors.find(s => s.technical === 'crease') || CREASE }] : []),
        ] : undefined,
        marks: mode === 'press' ? undefined : false,
        fonts,
      });
      const name = `${(doc.title || 'tela').replace(/[^\w-]+/g, '-')}-${mode}-${cond.id.toLowerCase()}.pdf`;
      const url = URL.createObjectURL(new Blob([res.bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setResult({ name, notes: res.notes, conformance: res.conformance });
    } catch (e) {
      setResult({ name: 'Export failed', notes: [(e as Error).message], conformance: '' });
    }
    setBusy(null);
  };

  // ── Wrap panels: each panel rendered on its own at full-size resolution ──
  const [panelPpi, setPanelPpi] = useState(100);
  const exportPanels = async () => {
    const wrap = spec.wrap; const f = pageFrames[0]; const el = f && pageEls.current.get(f.id);
    if (!wrap || !el) return;
    setBusy('panels'); setResult(null);
    try {
      const { buildPanelPdf } = await import('../../../services/print/pressPdf');
      const pxScale = panelPpi / (PX_PER_IN * wrap.scale); // board CSS px → device px at full-size ppi
      const out = [];
      for (const p of wrap.panels) {
        setBusy(`Rendering ${p.label}…`);
        const r = p.rectIn, k = PX_PER_IN * wrap.scale;
        out.push({ label: p.label, widthIn: r.w, heightIn: r.h, raster: await rasterizeRegion(el, { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }, pxScale) });
      }
      setBusy('Writing panel PDF…');
      const bytes = await buildPanelPdf(`${doc.title} — wrap panels`, out);
      const name = `${(doc.title || 'wrap').replace(/[^\w-]+/g, '-')}-panels-${panelPpi}ppi.pdf`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setResult({ name, conformance: `${out.length} panels at full size, ${panelPpi} ppi, RGB`, notes: out.map(o => `${o.label}: ${o.widthIn.toFixed(1)}×${o.heightIn.toFixed(1)} in (${o.raster.width}×${o.raster.height} px)`) });
    } catch (e) { setResult({ name: 'Panel export failed', notes: [(e as Error).message], conformance: '' }); }
    setBusy(null);
  };
  const biggestPanelMp = spec.wrap ? Math.max(...spec.wrap.panels.map(p => p.rectIn.w * p.rectIn.h * panelPpi * panelPpi)) / 1e6 : 0;

  // ── Binding / imposition maths ──
  const pages = pageFrames.length;
  const rule = pageCountRule(spec.binding, pages);
  const spine = spineWidthFromStock(Math.max(pages, 2), paper);
  const cover = ['perfect', 'case', 'saddle'].includes(spec.binding) ? coverSpread({ trimIn: spec.trimIn, bleedIn: spec.bleedIn, binding: spec.binding, pages: Math.max(pages, 2), paper }) : null;
  const creep = spec.binding === 'saddle' && pages >= 4 ? Math.max(...Object.values(creepOffsets(pages, paper))) : 0;
  const gang = spec.binding === 'none' && spec.trimIn[0] <= 6 && spec.trimIn[1] <= 6 ? nUp({ sheetIn: [12, 18], itemIn: spec.trimIn, bleedIn: spec.bleedIn, gutterIn: 0.125, marginIn: 0.375, allowRotate: true }) : null;
  const trimMismatch = pageFrames.some(f => Math.abs(f.w / PX_PER_IN - spec.trimIn[0]) > 0.01 || Math.abs(f.h / PX_PER_IN - spec.trimIn[1]) > 0.01);

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-stretch justify-center p-3 sm:p-6" style={{ background: 'rgba(5,4,9,0.72)', backdropFilter: 'blur(4px)' }} data-testid="prepress">
      <div className="flex w-full max-w-[1400px] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0f1016] text-white shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
          <Printer size={18} className="text-[#8FF5FF]" />
          <h2 className="text-sm font-black uppercase tracking-wider">Prepress &amp; print production</h2>
          <nav className="ml-2 flex gap-1 rounded-xl bg-black/40 p-1">
            {(['press', 'wrap'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === t ? 'bg-[#8FF5FF]/15 text-[#8FF5FF]' : 'text-white/50 hover:text-white'}`}>{t === 'press' ? 'Pages → press' : 'Wraps & dielines'}</button>
            ))}
          </nav>
          {tab === 'press' && (
            <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${summary.ready ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`} data-testid="preflight-summary">
              {summary.ready ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {summary.errors} errors · {summary.warnings} warnings
            </span>
          )}
          <button onClick={onClose} aria-label="Close" className={`${tab === 'press' ? '' : 'ml-auto'} rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white`}><X size={16} /></button>
        </header>

        {tab === 'wrap' ? (
          <div className="flex-1 overflow-auto p-5"><WrapDesigner onCreateArtboard={onCreateWrapBoard} onClose={() => setTab('press')} /></div>
        ) : (
          <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_1fr_340px]">
            {/* ── Spec ── */}
            <aside className="space-y-4 overflow-auto border-r border-white/10 p-4">
              <div>
                <span className={lbl}>What are you making?</span>
                <select className={field} value={spec.productId} onChange={e => chooseProduct(e.target.value)} data-testid="product">
                  {KIND_GROUPS.map(([g, kinds]) => (
                    <optgroup key={g} label={g}>{PRINT_PRODUCTS.filter(p => kinds.includes(p.kind)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
                  ))}
                </select>
                {product?.note && <p className="mt-1.5 text-[11px] leading-snug text-white/40">{product.note}</p>}
              </div>
              <div>
                <span className={lbl}>Printed on</span>
                <select className={field} value={spec.conditionId} onChange={e => chooseCondition(e.target.value as DocPrintSpec['conditionId'])}>
                  {(['home', 'digital', 'offset', 'newsprint', 'wide-format'] as PrintIntent[]).map(intent => (
                    <optgroup key={intent} label={intent}>{OUTPUT_CONDITIONS.filter(c => c.intent === intent || (intent === 'digital' && c.id === 'GRACOL2013')).filter((c, i, a) => a.indexOf(c) === i).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-white/40">{cond.colorModel} · ink limit {cond.colorModel === 'CMYK' ? `${cond.tac}%` : 'n/a'} · images {cond.ppi.recommended} ppi</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label><span className={lbl}>Trim width (in)</span><input type="number" step="0.0625" className={field} value={spec.trimIn[0]} onChange={e => setSpec({ trimIn: [+e.target.value, spec.trimIn[1]] })} /></label>
                <label><span className={lbl}>Trim height (in)</span><input type="number" step="0.0625" className={field} value={spec.trimIn[1]} onChange={e => setSpec({ trimIn: [spec.trimIn[0], +e.target.value] })} /></label>
                <label><span className={lbl}>Bleed (in)</span><input type="number" step="0.0625" min={0} className={field} value={spec.bleedIn} onChange={e => setSpec({ bleedIn: +e.target.value })} /></label>
                <label><span className={lbl}>Safe (in)</span><input type="number" step="0.0625" min={0} className={field} value={spec.safeIn} onChange={e => setSpec({ safeIn: +e.target.value })} /></label>
              </div>
              <div>
                <span className={lbl}>Paper</span>
                <select className={field} value={spec.paperId} onChange={e => setSpec({ paperId: e.target.value })}>{PAPER_STOCKS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              </div>
              <div>
                <span className={lbl}>Printer’s marks</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-white/70">
                  {(['crop', 'bleed', 'registration', 'colorBar'] as const).map(k => (
                    <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={spec.marks[k]} onChange={e => setSpec({ marks: { ...spec.marks, [k]: e.target.checked } })} />{k === 'colorBar' ? 'colour bar' : k}</label>
                  ))}
                </div>
              </div>
              <div>
                <span className={lbl}>Spot colours</span>
                {spec.spotColors.map(s => <p key={s.name} className="text-[12px] text-white/70"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.previewHex }} />{s.name}{s.technical ? ` (${s.technical})` : ''}</p>)}
                {!spec.spotColors.some(s => s.technical === 'cut') && <button className="text-[12px] font-bold text-[#8FF5FF]" onClick={() => setSpec({ spotColors: [...spec.spotColors, CUT] })}>+ CutContour (die-cut line)</button>}
              </div>
              <div>
                <span className={lbl}>Pages in this job ({pages})</span>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {doc.frames.map(f => (
                    <label key={f.id} className="flex items-center gap-2 text-[12px] text-white/70">
                      <input type="checkbox" checked={pageFrames.some(p => p.id === f.id)} onChange={e => setSpec({ pageFrameIds: e.target.checked ? [...pageFrames.map(p => p.id), f.id] : pageFrames.map(p => p.id).filter(id => id !== f.id) })} />
                      {f.label || f.id} <span className="text-white/30">{(f.w / PX_PER_IN).toFixed(2)}×{(f.h / PX_PER_IN).toFixed(2)} in</span>
                    </label>
                  ))}
                </div>
                {trimMismatch && <button onClick={() => save(true)} className="mt-2 w-full rounded-lg bg-[#8FF5FF]/15 px-3 py-2 text-[12px] font-bold text-[#8FF5FF]">Size pages to {spec.trimIn[0]}×{spec.trimIn[1]} in</button>}
              </div>
            </aside>

            {/* ── Pages ── */}
            <main className="overflow-auto p-5">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[11px] text-white/40">Cyan = trim · red = bleed · dashed = safe area. Click a page to soft-proof it on {cond.label}.</p>
                <button onClick={() => void runCheck(true)} disabled={checking} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/80 disabled:opacity-40">
                  {checking ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />} {deep ? 'Re-check ink' : 'Check ink coverage'}
                </button>
              </div>
              <div className="flex flex-wrap gap-5">
                {pageFrames.map((f, i) => {
                  const scale = Math.min(200 / f.w, 260 / f.h);
                  const b = spec.bleedIn * PX_PER_IN * scale, s = spec.safeIn * PX_PER_IN * scale;
                  const flagged = findings.some(x => x.pageId === f.id && x.level === 'error');
                  return (
                    <figure key={f.id} className="text-center">
                      <button onClick={() => void proofPage(f.id)} className="relative block" style={{ padding: b }} title="Soft proof">
                        <span className="absolute inset-0 border border-red-400/70" style={{ background: 'rgba(255,80,80,0.08)' }} />
                        <span className="relative block overflow-hidden bg-white" style={{ width: f.w * scale, height: f.h * scale, outline: `1px solid ${flagged ? '#f87171' : '#8FF5FF'}` }}>
                          <span className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: f.w, height: f.h, transform: `scale(${scale})` }}>{renderFrame(f)}</span>
                          <span className="pointer-events-none absolute border border-dashed border-[#8FF5FF]/70" style={{ inset: s }} />
                        </span>
                      </button>
                      <figcaption className="mt-1.5 text-[11px] text-white/50">{i + 1}. {f.label || 'Page'}</figcaption>
                    </figure>
                  );
                })}
                {!pageFrames.length && <p className="text-sm text-white/50">No pages selected. Tick frames on the left.</p>}
              </div>
              {proofId && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[12px] text-white/70"><Eye size={14} className="text-[#8FF5FF]" /> Soft proof — {cond.label}{proof && cond.colorModel === 'CMYK' && <span className={proof.gamut > 2 ? 'text-amber-300' : 'text-emerald-300'}> · {proof.gamut.toFixed(1)}% of the page is outside what this press can print</span>}
                    <button onClick={() => { setProofId(null); setProof(null); }} className="ml-auto text-white/40 hover:text-white"><X size={14} /></button></div>
                  {proof ? <img src={proof.url} alt="Soft proof" className="max-h-[520px] bg-white" /> : <p className="text-[12px] text-white/40"><Loader2 size={12} className="mr-1 inline animate-spin" />Rendering proof…</p>}
                  <p className="mt-2 text-[10.5px] text-white/35">Screen approximation using Tela’s printer model, not a contract proof. Order a hard proof for colour-critical work.</p>
                </div>
              )}
            </main>

            {/* ── Preflight, binding, export ── */}
            <aside className="space-y-4 overflow-auto border-l border-white/10 p-4">
              <section>
                <h3 className={lbl}>Preflight</h3>
                <ul className="space-y-1.5" data-testid="findings">
                  {findings.length === 0 && <li className="rounded-lg bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-200">{checking ? 'Checking…' : 'No problems found.'}</li>}
                  {findings.slice(0, 60).map((f, i) => (
                    <li key={i} className={`rounded-lg px-3 py-2 text-[12px] leading-snug ${f.level === 'error' ? 'bg-red-400/10 text-red-100' : f.level === 'warn' ? 'bg-amber-400/10 text-amber-100' : 'bg-white/[0.04] text-white/70'}`}>
                      <span className="flex gap-1.5">{f.level === 'error' ? <XCircle size={13} className="mt-0.5 shrink-0 text-red-300" /> : f.level === 'warn' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" /> : <Info size={13} className="mt-0.5 shrink-0 text-white/40" />}<span>{f.message}</span></span>
                      <span className="mt-1 block pl-5 text-[11px] opacity-70">{f.fix}</span>
                      {f.autoFix === 'pad-pages' && rule.padTo > pages && <button onClick={() => onAddBlankPages(rule.padTo - pages, spec.trimIn)} className="mt-1 ml-5 text-[11px] font-bold text-[#8FF5FF]">Add {rule.padTo - pages} blank page(s)</button>}
                      {(f.autoFix === 'extend-bleed' || f.autoFix === 'convert-cmyk') && <span className="mt-1 ml-5 block text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">Handled at export</span>}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-white/10 p-3 text-[12px] text-white/70 space-y-1">
                <h3 className={lbl}><Layers size={11} className="mr-1 inline" />Binding &amp; imposition</h3>
                <p>{rule.message}</p>
                {['perfect', 'case'].includes(spec.binding) && <p>Spine ≈ <b>{spine.toFixed(3)} in</b> on {paper.label}{spineTextAllowed(spine) ? '' : ' — too thin for spine text'}.</p>}
                {cover && <p>Cover flat: <b>{cover.widthIn.toFixed(3)} × {cover.heightIn.toFixed(3)} in</b>{cover.estimated ? ' (estimate — use the printer’s cover template)' : ''}.</p>}
                {spec.binding === 'saddle' && pages >= 4 && <p>{saddleStitchSpreads(pages).length} printer sheets; centre pages creep {creep.toFixed(3)} in — keep live area {Math.max(spec.safeIn, creep + 0.125).toFixed(3)} in from the outside edge.</p>}
                {gang && <p>Gangs {gang.count} up on a 12×18 press sheet{gang.rotated ? ' (rotated)' : ''}, {gang.wastePct.toFixed(0)}% waste.</p>}
                <p className="text-[10.5px] text-white/35">Spine and creep are planning estimates from paper caliper; your printer’s template is final.</p>
              </section>

              <section className="space-y-2">
                <h3 className={lbl}>Export</h3>
                <label className="flex items-start gap-2 text-[12px] text-white/70">
                  <input type="checkbox" checked={vectorOn} onChange={e => setVectorOn(e.target.checked)} className="mt-0.5" data-testid="vector-toggle" />
                  <span>Vector text &amp; shapes <span className="block text-[10.5px] text-white/40">Live type with embedded fonts and sharp paths; images stay raster. Off = whole pages as images.</span></span>
                </label>
                <button disabled={!!busy || !pages} onClick={() => void exportPdf('press', cond.intent === 'newsprint' ? 200 : 300)} className="flex w-full items-center gap-2 rounded-xl bg-[#8FF5FF] px-3 py-2.5 text-[12px] font-black text-[#061418] disabled:opacity-40" data-testid="export-press">
                  <Download size={14} /> Press PDF — {cond.colorModel}, bleed, marks
                </button>
                <button disabled={!!busy || !pages} onClick={() => void exportPdf('digital', 300)} className="flex w-full items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-[12px] font-bold text-white/85 disabled:opacity-40"><Download size={14} /> Digital / POD PDF — RGB, bleed, trim box</button>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={!!busy || !pages} onClick={() => void exportPdf('home-pages', 200)} className="rounded-xl border border-white/15 px-3 py-2 text-[11.5px] font-bold text-white/80 disabled:opacity-40">Home: pages</button>
                  <button disabled={!!busy || pages < 4} onClick={() => void exportPdf('home-booklet', 200)} className="rounded-xl border border-white/15 px-3 py-2 text-[11.5px] font-bold text-white/80 disabled:opacity-40" title="Fold-and-staple booklet, duplex on the short edge">Home: booklet</button>
                </div>
                {spec.wrap && (
                  <div className="space-y-1.5 rounded-xl border border-[#8FF5FF]/30 p-3">
                    <p className="text-[12px] font-bold text-white/85">Wrap panels — full size, one page per panel</p>
                    <div className="flex items-center gap-2 text-[11px] text-white/60">
                      <select className="rounded bg-white/[0.06] px-1.5 py-1 text-white" value={panelPpi} onChange={e => setPanelPpi(+e.target.value)}>{[72, 100, 120, 150].map(v => <option key={v} value={v}>{v} ppi</option>)}</select>
                      <span>{spec.wrap.panels.length} panels · largest ≈ {biggestPanelMp.toFixed(0)} MP</span>
                    </div>
                    {biggestPanelMp > 150 && <p className="text-[11px] text-amber-300">That’s near a browser’s canvas limit; use a lower ppi (vehicles are viewed from metres away — 72–100 ppi at full size is common).</p>}
                    <button disabled={!!busy} onClick={() => void exportPanels()} className="w-full rounded-lg bg-[#8FF5FF]/15 px-3 py-2 text-[12px] font-bold text-[#8FF5FF] disabled:opacity-40" data-testid="export-panels">Export panel PDF</button>
                  </div>
                )}
                {!summary.ready && <p className="text-[11px] text-red-300/80">Errors above will show in print. You can still export a proof.</p>}
                {busy && <p className="text-[12px] text-white/60"><Loader2 size={12} className="mr-1 inline animate-spin" />{busy}</p>}
                {result && <div className="rounded-lg bg-white/[0.04] p-2.5 text-[11px] text-white/60"><p className="font-bold text-white/85">{result.name}</p>{result.conformance && <p>{result.conformance}</p>}{result.notes.slice(0, 14).map(n => <p key={n}>• {n}</p>)}</div>}
              </section>
            </aside>
          </div>
        )}
      </div>

      {/* Off-screen natural-size pages: what gets measured and rasterised. */}
      <div aria-hidden style={{ position: 'fixed', left: -200000, top: 0, pointerEvents: 'none' }}>
        {pageFrames.map(f => (
          <div key={f.id} ref={el => { if (el) pageEls.current.set(f.id, el); else pageEls.current.delete(f.id); }} data-print-page={f.id}
            style={{ width: f.w, height: f.h, overflow: 'hidden', background: '#fff', position: 'relative' }}>
            {renderFrame(f)}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};

export default PrepressPanel;
