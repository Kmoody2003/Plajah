/**
 * Tela PDF reader: read, search, mark up, sign and fill any PDF, with Smart Fill for forms.
 *
 * Rendering is pdf.js (canvas + selectable text layer, pages drawn only near the viewport).
 * Everything the person adds — form values, highlights, ink, notes, text, signatures, new fields on
 * flat forms, page rotations and deletions — is kept as data and written into a real PDF with pdf-lib
 * on Save/Download (services/tela/pdf/pdfWrite.ts), so the original is never touched until then.
 * Smart Fill rules live in services/tela/pdf/smartFill.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Bot, ChevronDown, ChevronLeft, ChevronRight, Download, Eraser, FileText, Highlighter, Info, LayoutGrid, ListTree, Loader2,
  Minus, Moon, MousePointer2, PenLine, Plus, Printer, RotateCw, Save, ScanText, Search, Sparkles, Square, StickyNote, Strikethrough, Trash2, Type, Underline,
  Undo2, Upload, Volume2, Wand2, X, Columns2, Signature, Check, MessageSquare,
} from 'lucide-react';
import './telaPdf.css';
import { loadPdfjs, fieldsOf, runsOf, loadFillProfile, saveFillProfile, aiMapFields, askPdf, ocrPage, signedIn, saveFormWithPdfjs } from '../../../services/tela/pdf/client';
import {
  PROFILE_FIELDS, applyLearned, detectBlanks, emptyFillProfile, labelFor, learnFrom, mapRequest, planFill, planSummary, searchRuns, valuesToWrite,
  type FillProfile, type PdfField, type PlanRow, type SearchHit, type TextRun, type ProfileKey,
} from '../../../services/tela/pdf/smartFill';
import { writePdf, type Markup, type Rect } from '../../../services/tela/pdf/pdfWrite';

export interface PdfSource { name: string; bytes?: Uint8Array; url?: string }

interface Props {
  source: PdfSource | null;
  onClose: () => void;
  /** Save the edited PDF back into Tela (replaces the document's PDF, or adds it to the open canvas). */
  onSaveToTela?: (bytes: Uint8Array, name: string) => Promise<void>;
  saveLabel?: string;
}

type Tool = 'select' | 'highlight' | 'underline' | 'strike' | 'ink' | 'note' | 'text' | 'rect' | 'sign' | 'erase';
type Panel = 'fill' | 'search' | 'ask' | 'info' | null;
type Side = 'thumbs' | 'outline' | 'notes' | null;
type Value = string | boolean;
type OutlineItem = { title: string; dest: any; items: OutlineItem[] };

const COLORS = ['#ffe066', '#7ee787', '#7cc7ff', '#ff8fb1', '#d40055', '#111111'];
const uid = () => Math.random().toString(36).slice(2, 10);
const btn = 'h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors';
const on = 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40';
const OUTCOME_TONE: Record<PlanRow['outcome'], string> = {
  fill: 'text-emerald-300', suggest: 'text-amber-300', keep: 'text-white/45', human: 'text-pink-300', sensitive: 'text-pink-300', choice: 'text-pink-200', 'no-data': 'text-sky-300', unknown: 'text-white/40',
};
const OUTCOME_LABEL: Record<PlanRow['outcome'], string> = {
  fill: 'Will fill', suggest: 'Check', keep: 'Answered', human: 'You sign / certify', sensitive: 'You type', choice: 'Your choice', 'no-data': 'Missing', unknown: 'Unclear',
};

function normRect(r: number[]): { left: number; top: number; width: number; height: number } {
  return { left: Math.min(r[0], r[2]), top: Math.min(r[1], r[3]), width: Math.abs(r[2] - r[0]), height: Math.abs(r[3] - r[1]) };
}

// ─── One page ────────────────────────────────────────────────────────────────

interface PageProps {
  pdf: any; pdfjs: any; index: number; scale: number; rotation: number; dark: boolean; tool: Tool; color: string;
  fields: PdfField[]; values: Record<string, Value>; fieldTone: Record<string, string>;
  setValue: (name: string, v: Value) => void; onSignField: (f: PdfField) => void;
  markups: Markup[]; onAdd: (m: Markup) => void; onErase: (id: string) => void; onEditText: (id: string, text: string) => void; editing: string | null; setEditing: (id: string | null) => void;
  hits: Array<SearchHit & { run: TextRun; current: boolean }>; links: Array<{ rect: Rect; url?: string; dest?: any }>; onGoDest: (dest: any) => void;
  baseSize: { w: number; h: number }; onVisible: (i: number, ratio: number) => void; pendingSign: string | null; onPlaced: () => void;
  registerEl: (i: number, el: HTMLDivElement | null) => void;
}

const PdfPage = React.memo(function PdfPage(p: PageProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textDiv = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<any>(null);
  const [near, setNear] = useState(false);
  const [ink, setInk] = useState<Array<[number, number]> | null>(null);
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);

  useEffect(() => { let live = true; p.pdf.getPage(p.index + 1).then((pg: any) => { if (live) setPage(pg); }); return () => { live = false; }; }, [p.pdf, p.index]);
  const viewport = useMemo(() => page ? page.getViewport({ scale: p.scale, rotation: (page.rotate + p.rotation) % 360 }) : null, [page, p.scale, p.rotation]);
  const w = viewport ? viewport.width : p.baseSize.w * p.scale, h = viewport ? viewport.height : p.baseSize.h * p.scale;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    p.registerEl(p.index, el);
    const io = new IntersectionObserver(es => es.forEach(e => { setNear(e.isIntersecting); }), { rootMargin: '1200px 0px' });
    const vis = new IntersectionObserver(es => es.forEach(e => p.onVisible(p.index, e.intersectionRatio)), { threshold: [0, 0.25, 0.5, 0.75, 1] });
    io.observe(el); vis.observe(el);
    return () => { io.disconnect(); vis.disconnect(); p.registerEl(p.index, null); };
  }, [p.index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas.
  useEffect(() => {
    if (!page || !viewport || !near || !canvas.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = canvas.current; c.width = Math.floor(viewport.width * dpr); c.height = Math.floor(viewport.height * dpr);
    const task = page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined, annotationMode: 2 /* ENABLE_FORMS: widgets come from our form layer */ });
    task.promise.catch(() => { /* cancelled by a zoom */ });
    return () => { try { task.cancel(); } catch { /* done */ } };
  }, [page, viewport, near]);

  // Selectable text.
  useEffect(() => {
    const div = textDiv.current; if (!page || !viewport || !near || !div) return;
    div.replaceChildren();
    const tl = new p.pdfjs.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: div, viewport });
    tl.render().catch(() => { /* cancelled */ });
    return () => { try { tl.cancel(); } catch { /* done */ } };
  }, [page, viewport, near, p.pdfjs]);

  const toPdf = useCallback((cx: number, cy: number): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(cx - r.left, cy - r.top); return [x, y];
  }, [viewport]);
  const toView = useCallback((rect: number[]) => normRect(viewport.convertToViewportRectangle(rect)), [viewport]);

  // Text markup from the selection.
  const onMouseUp = () => {
    if (!viewport || !['highlight', 'underline', 'strike'].includes(p.tool)) return;
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const box = wrap.current!.getBoundingClientRect();
    const rects: Rect[] = [];
    for (const cr of Array.from(sel.getRangeAt(0).getClientRects())) {
      if (cr.width < 1 || cr.height < 1 || cr.right < box.left || cr.left > box.right || cr.bottom < box.top || cr.top > box.bottom) continue;
      const [x1, y1] = toPdf(cr.left, cr.bottom), [x2, y2] = toPdf(cr.right, cr.top);
      rects.push([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    }
    if (!rects.length) return;
    p.onAdd({ id: uid(), page: p.index, kind: p.tool as 'highlight', rects, color: p.color, text: sel.toString().slice(0, 500) });
    sel.removeAllRanges();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!viewport) return;
    if (p.tool === 'ink') { (e.target as Element).setPointerCapture(e.pointerId); setInk([toPdf(e.clientX, e.clientY)]); }
    else if (p.tool === 'rect') { (e.target as Element).setPointerCapture(e.pointerId); const a = toPdf(e.clientX, e.clientY); setDrag({ a, b: a }); }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (ink) setInk(s => s ? [...s, toPdf(e.clientX, e.clientY)] : s);
    else if (drag) setDrag(d => d ? { ...d, b: toPdf(e.clientX, e.clientY) } : d);
  };
  const onPointerUp = () => {
    if (ink && ink.length > 1) p.onAdd({ id: uid(), page: p.index, kind: 'ink', strokes: [ink], color: p.color, width: 2 });
    if (drag && Math.abs(drag.a[0] - drag.b[0]) > 4 && Math.abs(drag.a[1] - drag.b[1]) > 4) p.onAdd({ id: uid(), page: p.index, kind: 'rect', rect: [drag.a[0], drag.a[1], drag.b[0], drag.b[1]], color: p.color, width: 1.5 });
    setInk(null); setDrag(null);
  };
  const onClick = (e: React.MouseEvent) => {
    if (!viewport) return;
    const [x, y] = toPdf(e.clientX, e.clientY);
    if (p.tool === 'note') { const id = uid(); p.onAdd({ id, page: p.index, kind: 'note', at: [x, y], text: '', color: '#ffcc00' }); p.setEditing(id); }
    else if (p.tool === 'text') { const id = uid(); p.onAdd({ id, page: p.index, kind: 'text', rect: [x, y - 40, x + 220, y], text: '', color: p.color === '#ffe066' ? '#111111' : p.color, size: 12 }); p.setEditing(id); }
    else if (p.tool === 'sign' && p.pendingSign) { p.onAdd({ id: uid(), page: p.index, kind: 'image', rect: [x - 80, y - 24, x + 80, y + 24], dataUrl: p.pendingSign, label: 'Signature' }); p.onPlaced(); }
  };

  const drawing = ['ink', 'note', 'text', 'rect', 'sign'].includes(p.tool);
  const pathOf = (s: Array<[number, number]>) => s.map(([x, y], i) => { const [vx, vy] = viewport.convertToViewportPoint(x, y); return `${i ? 'L' : 'M'}${vx.toFixed(1)} ${vy.toFixed(1)}`; }).join(' ');

  return (
    <div ref={wrap} data-page={p.index} className={`pdf-page mx-auto mb-4 bg-white shadow-[0_6px_30px_rgba(0,0,0,.45)] ${p.dark ? 'pdf-dark' : ''} pdf-tool-${p.tool}`}
      style={{ width: w, height: h, ['--scale-factor' as any]: p.scale }} onMouseUp={onMouseUp}>
      {near ? <canvas ref={canvas} style={{ width: w, height: h, display: 'block' }} /> : <div className="absolute inset-0 grid place-items-center text-[11px] text-black/30">Page {p.index + 1}</div>}
      <div ref={textDiv} className="textLayer" />
      {viewport && <>
        {p.hits.map((hit, i) => {
          const r = hit.run, len = Math.max(1, r.str.length);
          const v = toView([r.x + r.w * hit.start / len, r.y - r.h * 0.25, r.x + r.w * hit.end / len, r.y + r.h * 0.95]);
          return <div key={i} className={`pdf-hit ${hit.current ? 'current' : ''}`} style={v} data-hit-current={hit.current || undefined} />;
        })}
        {p.links.map((l, i) => {
          const v = toView(l.rect);
          return l.url
            ? <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} className="absolute z-[3]" style={v} />
            : <button key={i} type="button" onClick={() => p.onGoDest(l.dest)} className="absolute z-[3] cursor-pointer" style={v} aria-label="Go to linked page" />;
        })}
        {/* Markup layer */}
        <svg className="absolute inset-0 z-[3]" width={w} height={h} style={{ pointerEvents: drawing || p.tool === 'erase' ? 'auto' : 'none', cursor: p.tool === 'erase' ? 'not-allowed' : drawing ? 'crosshair' : undefined }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
          {p.markups.map(m => {
            const erase = p.tool === 'erase' ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); p.onErase(m.id); }, style: { cursor: 'pointer', pointerEvents: 'all' as const } } : {};
            if (m.kind === 'highlight') return <g key={m.id} {...erase}>{m.rects.map((r, i) => { const v = toView(r); return <rect key={i} x={v.left} y={v.top} width={v.width} height={v.height} fill={m.color} opacity={0.4} style={{ mixBlendMode: 'multiply' }} />; })}</g>;
            if (m.kind === 'underline' || m.kind === 'strike') return <g key={m.id} {...erase}>{m.rects.map((r, i) => { const v = toView(r); const y = m.kind === 'underline' ? v.top + v.height - 1 : v.top + v.height * 0.55; return <g key={i}><rect x={v.left} y={v.top} width={v.width} height={v.height} fill="transparent" /><line x1={v.left} x2={v.left + v.width} y1={y} y2={y} stroke={m.color} strokeWidth={Math.max(1.2, v.height * 0.08)} /></g>; })}</g>;
            if (m.kind === 'ink') return <g key={m.id} {...erase}>{m.strokes.map((s, i) => <path key={i} d={pathOf(s)} fill="none" stroke={m.color} strokeWidth={m.width * p.scale} strokeLinecap="round" strokeLinejoin="round" />)}</g>;
            if (m.kind === 'rect') { const v = toView(m.rect); return <rect key={m.id} {...erase} x={v.left} y={v.top} width={v.width} height={v.height} fill="transparent" stroke={m.color} strokeWidth={m.width * p.scale} />; }
            if (m.kind === 'image') { const v = toView(m.rect); return <image key={m.id} {...erase} href={m.dataUrl} x={v.left} y={v.top} width={v.width} height={v.height} preserveAspectRatio="xMidYMid meet" />; }
            return null;
          })}
          {ink && ink.length > 1 && <path d={pathOf(ink)} fill="none" stroke={p.color} strokeWidth={2 * p.scale} strokeLinecap="round" />}
          {drag && (() => { const v = toView([drag.a[0], drag.a[1], drag.b[0], drag.b[1]]); return <rect x={v.left} y={v.top} width={v.width} height={v.height} fill="none" stroke={p.color} strokeDasharray="4 3" />; })()}
        </svg>
        {/* Notes and text boxes are HTML so they can be edited in place. */}
        {p.markups.map(m => {
          if (m.kind === 'note') {
            const [vx, vy] = viewport.convertToViewportPoint(m.at[0], m.at[1]);
            const open = p.editing === m.id;
            return <div key={m.id} className="absolute z-[6]" style={{ left: vx, top: vy }}>
              <button type="button" title={m.text || 'Note'} onClick={e => { e.stopPropagation(); if (p.tool === 'erase') p.onErase(m.id); else p.setEditing(open ? null : m.id); }}
                className="w-6 h-6 -translate-y-full grid place-items-center rounded-md bg-amber-300 text-black shadow"><MessageSquare size={13} /></button>
              {open && <textarea autoFocus defaultValue={m.text} placeholder="Write a note…" onBlur={e => { p.onEditText(m.id, e.target.value); p.setEditing(null); }}
                className="absolute left-7 -top-6 w-56 h-24 p-2 text-[12px] rounded-lg bg-amber-50 text-black border border-amber-300 shadow-xl outline-none" />}
            </div>;
          }
          if (m.kind === 'text') {
            const v = toView(m.rect);
            return p.editing === m.id
              ? <textarea key={m.id} autoFocus defaultValue={m.text} onBlur={e => { p.onEditText(m.id, e.target.value); p.setEditing(null); }}
                  className="absolute z-[6] p-0.5 bg-white/80 border border-cyan-500 outline-none resize" style={{ ...v, color: m.color, fontSize: m.size * p.scale, fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.15 }} />
              : <div key={m.id} onClick={e => { e.stopPropagation(); if (p.tool === 'erase') p.onErase(m.id); else p.setEditing(m.id); }}
                  className="absolute z-[5] whitespace-pre-wrap cursor-text" style={{ ...v, color: m.color, fontSize: m.size * p.scale, fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.15 }}>{m.text}</div>;
          }
          return null;
        })}
        {/* Form layer */}
        {p.fields.map((f, i) => {
          if (f.type === 'button') return null;
          const v = toView(f.rect); const tone = p.fieldTone[f.name] || ''; const val = p.values[f.name];
          const fs = Math.max(8, Math.min(v.height * 0.68, 14 * p.scale));
          const k = `${f.name}:${i}`; const common = { title: f.label || f.tooltip || f.name, 'aria-label': f.label || f.tooltip || f.name, className: `pdf-field ${tone}` };
          if (f.readOnly) return <div key={`${f.name}:${i}`} className="absolute z-[4] overflow-hidden whitespace-pre-wrap text-[#0b1530]" style={{ ...v, fontSize: fs, fontFamily: 'Helvetica, Arial, sans-serif' }}>{f.type === 'checkbox' ? (val === true ? '✔' : '') : f.type === 'radio' ? (val === f.exportValue ? '●' : '') : typeof val === 'string' ? val : ''}</div>;
          // A text box labelled "Signature" is signed like a real signature field (the image is drawn into its box).
          const signed = p.markups.some(m => m.kind === 'image' && m.rect.join() === f.rect.join());
          if (signed && (f.type === 'signature' || f.type === 'text')) return null;
          if (f.type === 'signature' || (f.type === 'text' && /\bsignature\b/i.test(`${f.label ?? ''} ${f.tooltip ?? ''}`) && !val)) return <button key={k} {...common} type="button" style={v} onClick={() => p.onSignField(f)}><span className="text-[10px] text-pink-700/80 font-bold">Sign here</span></button>;
          if (f.type === 'checkbox') return <input key={k} {...common} type="checkbox" style={{ ...v, accentColor: '#0891b2' }} checked={val === true} onChange={e => p.setValue(f.name, e.target.checked)} />;
          if (f.type === 'radio') return <input key={k} {...common} type="radio" name={`r-${f.name}`} style={{ ...v, accentColor: '#0891b2' }} checked={!!f.exportValue && val === f.exportValue} onChange={() => p.setValue(f.name, f.exportValue ?? 'On')} />;
          if (f.type === 'dropdown' || f.type === 'list') return <select key={k} {...common} style={{ ...v, fontSize: fs }} value={typeof val === 'string' ? val : ''} onChange={e => p.setValue(f.name, e.target.value)}>
            <option value="" />{(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select>;
          if (f.multiline) return <textarea key={k} {...common} style={{ ...v, fontSize: Math.min(fs, 12 * p.scale), resize: 'none' }} value={typeof val === 'string' ? val : ''} maxLength={f.maxLen} onChange={e => p.setValue(f.name, e.target.value)} />;
          return <input key={k} {...common} type="text" style={{ ...v, fontSize: fs, letterSpacing: f.comb && f.maxLen ? `${Math.max(0, v.width / f.maxLen - fs * 0.6)}px` : undefined }} value={typeof val === 'string' ? val : ''} maxLength={f.maxLen} onChange={e => p.setValue(f.name, e.target.value)} />;
        })}
      </>}
    </div>
  );
});

// ─── Thumbnails ──────────────────────────────────────────────────────────────

function Thumb({ pdf, index, active, rotation, onClick, onRotate, onDelete, removed }: { pdf: any; index: number; active: boolean; rotation: number; onClick: () => void; onRotate: () => void; onDelete: () => void; removed: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && setSeen(true)), { rootMargin: '400px' }); if (box.current) io.observe(box.current); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!seen) return; let task: any; let live = true;
    pdf.getPage(index + 1).then((pg: any) => {
      if (!live || !ref.current) return;
      const vp0 = pg.getViewport({ scale: 1, rotation: (pg.rotate + rotation) % 360 }); const vp = pg.getViewport({ scale: 132 / vp0.width, rotation: (pg.rotate + rotation) % 360 });
      const c = ref.current; c.width = vp.width; c.height = vp.height;
      task = pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }); task.promise.catch(() => {});
    });
    return () => { live = false; try { task?.cancel(); } catch { /* done */ } };
  }, [seen, pdf, index, rotation]);
  return <div ref={box} className={`group relative mb-3 ${removed ? 'opacity-30' : ''}`}>
    <button type="button" onClick={onClick} className={`block mx-auto rounded-md overflow-hidden bg-white ring-2 ${active ? 'ring-cyan-300' : 'ring-transparent hover:ring-white/30'}`}>
      <canvas ref={ref} style={{ width: 132, display: 'block' }} />
    </button>
    <div className="text-center text-[10px] text-white/50 mt-1">{index + 1}{removed ? ' · removed' : ''}</div>
    <div className="absolute top-1 right-3 hidden group-hover:flex gap-1">
      <button type="button" title="Rotate page" onClick={onRotate} className="w-6 h-6 grid place-items-center rounded bg-black/70 text-white"><RotateCw size={12} /></button>
      <button type="button" title={removed ? 'Keep page' : 'Remove page on save'} onClick={onDelete} className="w-6 h-6 grid place-items-center rounded bg-black/70 text-white"><Trash2 size={12} /></button>
    </div>
  </div>;
}

// ─── Signature pad ───────────────────────────────────────────────────────────

function SignaturePad({ onDone, onCancel }: { onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const c = useRef<HTMLCanvasElement>(null); const [mode, setMode] = useState<'draw' | 'type'>('draw'); const [typed, setTyped] = useState(''); const [has, setHas] = useState(false);
  const last = useRef<[number, number] | null>(null);
  useEffect(() => { const k = c.current!; k.width = 900; k.height = 260; const ctx = k.getContext('2d')!; ctx.clearRect(0, 0, k.width, k.height); }, [mode]);
  useEffect(() => {
    if (mode !== 'type') return; const k = c.current!; const ctx = k.getContext('2d')!; ctx.clearRect(0, 0, k.width, k.height);
    ctx.fillStyle = '#0b1a4a'; ctx.font = 'italic 96px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive'; ctx.textBaseline = 'middle'; ctx.fillText(typed, 30, 140, 840); setHas(!!typed.trim());
  }, [typed, mode]);
  const pt = (e: React.PointerEvent): [number, number] => { const r = c.current!.getBoundingClientRect(); return [(e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 260 / r.height]; };
  const trim = (): string => {
    const k = c.current!; const ctx = k.getContext('2d')!; const d = ctx.getImageData(0, 0, k.width, k.height).data;
    let x1 = k.width, y1 = k.height, x2 = 0, y2 = 0;
    for (let y = 0; y < k.height; y++) for (let x = 0; x < k.width; x++) if (d[(y * k.width + x) * 4 + 3] > 10) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y; }
    if (x2 <= x1) return k.toDataURL('image/png');
    const o = document.createElement('canvas'); o.width = x2 - x1 + 16; o.height = y2 - y1 + 16; o.getContext('2d')!.drawImage(k, x1 - 8, y1 - 8, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  };
  return <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Your signature">
    <div className="w-full max-w-[560px] rounded-2xl bg-[#16141f] border border-white/10 p-4 text-white shadow-2xl">
      <div className="flex items-center gap-2 mb-3"><Signature size={16} className="text-pink-300" /><div className="font-bold text-sm">Your signature</div>
        <div className="ml-auto flex gap-1">{(['draw', 'type'] as const).map(m => <button key={m} type="button" onClick={() => { setMode(m); setHas(false); }} className={`${btn} ${mode === m ? on : ''}`}>{m === 'draw' ? 'Draw' : 'Type'}</button>)}</div></div>
      {mode === 'type' && <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full name" className="w-full mb-2 h-9 px-3 rounded-lg bg-white/5 border border-white/10 outline-none text-sm" />}
      <canvas ref={c} className="w-full rounded-xl bg-white touch-none" style={{ aspectRatio: '900 / 260' }}
        onPointerDown={e => { if (mode !== 'draw') return; (e.target as Element).setPointerCapture(e.pointerId); last.current = pt(e); }}
        onPointerMove={e => { if (!last.current) return; const ctx = c.current!.getContext('2d')!; const p = pt(e); ctx.strokeStyle = '#0b1a4a'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(...last.current); ctx.lineTo(...p); ctx.stroke(); last.current = p; setHas(true); }}
        onPointerUp={() => { last.current = null; }} />
      <p className="text-[11px] text-white/45 mt-2">Kept only while this PDF is open. Plajah never stores your signature. Place it where you mean to sign; signing is your act.</p>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onCancel} className={btn}>Cancel</button>
        <button type="button" disabled={!has} onClick={() => onDone(trim())} className={`${btn} bg-pink-500/80 text-white hover:bg-pink-500`}><Check size={14} />Use signature</button>
      </div>
    </div>
  </div>;
}

// ─── The reader ──────────────────────────────────────────────────────────────

export default function TelaPdfReader({ source, onClose, onSaveToTela, saveLabel }: Props) {
  const [src, setSrc] = useState<PdfSource | null>(source);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState<null | 'first' | 'wrong'>(null);
  const [password, setPassword] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [baseSize, setBaseSize] = useState({ w: 612, h: 792 });
  const [scale, setScale] = useState(1.2); const [fit, setFit] = useState<'width' | 'page' | null>('width');
  const [rotation, setRotation] = useState(0);
  const [pageRot, setPageRot] = useState<Record<number, number>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState(0); const [pageInput, setPageInput] = useState('1');
  const [tool, setTool] = useState<Tool>('select'); const [color, setColor] = useState(COLORS[0]);
  const [markups, setMarkups] = useState<Markup[]>([]); const undo = useRef<Markup[][]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<PdfField[]>([]); const [fieldsReady, setFieldsReady] = useState(false);
  const [virtualFields, setVirtualFields] = useState<PdfField[]>([]);
  const [values, setValues] = useState<Record<string, Value>>({}); const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [fieldTone, setFieldTone] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<number, Array<{ rect: Rect; url?: string; dest?: any }>>>({});
  const runsCache = useRef<Map<number, TextRun[]>>(new Map());
  const [ocrRuns, setOcrRuns] = useState<Record<number, TextRun[]>>({});
  const [side, setSide] = useState<Side>(typeof window !== 'undefined' && window.innerWidth > 900 ? 'thumbs' : null);
  const [panel, setPanel] = useState<Panel>(null);
  const [dark, setDark] = useState(false); const [spread, setSpread] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null); const [toast, setToast] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState<null | { field?: PdfField }>(null); const [pendingSign, setPendingSign] = useState<string | null>(null);
  const [flatten, setFlatten] = useState(false);
  // Search
  const [query, setQuery] = useState(''); const [hits, setHits] = useState<Array<SearchHit & { run: TextRun }>>([]); const [hitIdx, setHitIdx] = useState(0); const [searching, setSearching] = useState(false);
  // Smart Fill
  const [profile, setProfile] = useState<FillProfile>(emptyFillProfile()); const [profileSynced, setProfileSynced] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  const [plan, setPlan] = useState<PlanRow[] | null>(null); const [accepted, setAccepted] = useState<Set<string>>(new Set()); const [aiMap, setAiMap] = useState<Record<string, string>>({});
  const [learned, setLearned] = useState<ReturnType<typeof learnFrom> | null>(null);
  // Ask
  const [askConsent, setAskConsent] = useState(() => { try { return localStorage.getItem('tela.pdfAskConsent') === '1'; } catch { return false; } });
  const [askQ, setAskQ] = useState(''); const [askLog, setAskLog] = useState<Array<{ q: string; a?: string; err?: string }>>([]);

  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const visible = useRef<Map<number, number>>(new Map());
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(t => t === m ? null : t), 3800); };

  // Load bytes.
  useEffect(() => {
    if (!src) return; let live = true; setError(null); setPdf(null); setBytes(null);
    (async () => {
      try {
        let b = src.bytes;
        if (!b && src.url) { const r = await fetch(src.url, { credentials: 'include' }); if (!r.ok) throw new Error(`Could not load the PDF (${r.status}).`); b = new Uint8Array(await r.arrayBuffer()); }
        if (!b) throw new Error('No PDF to open.');
        if (live) setBytes(b);
      } catch (e: any) { if (live) setError(String(e?.message ?? e)); }
    })();
    return () => { live = false; };
  }, [src]);

  // Open with pdf.js.
  useEffect(() => {
    if (!bytes) return; let live = true; let task: any;
    (async () => {
      try {
        const P = await loadPdfjs(); if (!live) return; setPdfjs(P);
        task = P.getDocument({ data: bytes.slice(), password: password || undefined, isEvalSupported: false, enableXfa: false });
        const doc = await task.promise; if (!live) { doc.destroy(); return; }
        setNeedPassword(null);
        const first = await doc.getPage(1); const vp = first.getViewport({ scale: 1 }); setBaseSize({ w: vp.width, h: vp.height });
        setPdf(doc);
        // Reset per-document state.
        setMarkups([]); undo.current = []; setValues({}); setDirty(new Set()); setFieldTone({}); setPlan(null); setVirtualFields([]); setRemoved(new Set()); setPageRot({});
        runsCache.current = new Map(); setOcrRuns({}); setHits([]); setCurrent(0); setPageInput('1');
        doc.getOutline().then((o: any) => live && setOutline(o ?? [])).catch(() => setOutline([]));
        doc.getMetadata().then((m: any) => {
          if (!live) return; const i = m?.info ?? {};
          setEncrypted(!!i.EncryptFilterName || !!password);
          setInfo(Object.fromEntries(Object.entries({ Title: i.Title, Author: i.Author, Subject: i.Subject, Creator: i.Creator, Producer: i.Producer, 'PDF version': i.PDFFormatVersion, Created: i.CreationDate, Modified: i.ModDate }).filter(([, v]) => v).map(([k, v]) => [k, String(v)])));
        }).catch(() => {});
        // Fields + links on every page, labelled from the printed text.
        const all: PdfField[] = []; const lk: typeof links = {};
        for (let i = 0; i < doc.numPages && live; i++) {
          const pg = await doc.getPage(i + 1);
          const ann = await pg.getAnnotations({ intent: 'display' }).catch(() => []);
          lk[i] = ann.filter((a: any) => a.subtype === 'Link' && (a.url || a.dest)).map((a: any) => ({ rect: a.rect, url: a.url && /^(https?:|mailto:)/i.test(a.url) ? a.url : undefined, dest: a.dest }));
          const fs = await fieldsOf(pg, i);
          if (fs.length) { const runs = await runsOf(pg); runsCache.current.set(i, runs); fs.forEach(f => { f.label = labelFor(f.rect, runs, { box: f.type === 'checkbox' || f.type === 'radio' }) || undefined; }); }
          all.push(...fs);
        }
        if (!live) return;
        setLinks(lk); setFields(all); setFieldsReady(true);
        const v: Record<string, Value> = {};
        for (const f of all) {
          if (f.type === 'radio') { if (typeof f.value === 'string' && f.value !== 'Off') v[f.name] = f.value; }
          else if (f.value !== undefined && f.value !== null && !(f.name in v)) v[f.name] = f.value as Value;
        }
        setValues(v);
        if (all.some(f => f.type !== 'button' && !f.readOnly)) setPanel(p => p ?? 'fill');
      } catch (e: any) {
        if (!live) return;
        if (e?.name === 'PasswordException') { setNeedPassword(password ? 'wrong' : 'first'); return; }
        setError(e?.message ? `This PDF could not be opened: ${e.message}` : 'This PDF could not be opened.');
      }
    })();
    return () => { live = false; try { task?.destroy(); } catch { /* gone */ } };
  }, [bytes, password]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { try { pdf?.destroy(); } catch { /* gone */ } }, [pdf]);

  // Smart Fill profile (cloud, offline buffer on device).
  useEffect(() => { loadFillProfile().then(r => { setProfile(r.profile); setProfileSynced(r.synced); }); }, []);

  // Fit to width/page.
  const applyFit = useCallback(() => {
    const el = scroller.current; if (!el || !fit) return;
    const rot = rotation % 180 !== 0; const bw = rot ? baseSize.h : baseSize.w, bh = rot ? baseSize.w : baseSize.h;
    const avail = el.clientWidth - 48; const cols = spread ? 2 : 1;
    const s = fit === 'width' ? (avail / cols - (spread ? 12 : 0)) / bw : Math.min((avail / cols) / bw, (el.clientHeight - 32) / bh);
    setScale(Math.max(0.25, Math.min(4, s)));
  }, [fit, baseSize, rotation, spread]);
  useEffect(() => { applyFit(); const ro = new ResizeObserver(() => applyFit()); if (scroller.current) ro.observe(scroller.current); return () => ro.disconnect(); }, [applyFit, pdf, side, panel]);

  const zoom = (f: number) => { setFit(null); setScale(s => Math.max(0.25, Math.min(5, +(s * f).toFixed(3)))); };

  const goTo = useCallback((i: number) => {
    if (!pdf) return; const n = Math.max(0, Math.min(pdf.numPages - 1, i));
    pageEls.current.get(n)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); setCurrent(n); setPageInput(String(n + 1));
  }, [pdf]);
  const onVisible = useCallback((i: number, ratio: number) => {
    visible.current.set(i, ratio);
    let best = -1, br = 0; visible.current.forEach((r, k) => { if (r > br || (r === br && k < best)) { br = r; best = k; } });
    if (best >= 0 && br > 0) { setCurrent(best); setPageInput(String(best + 1)); }
  }, []);
  const registerEl = useCallback((i: number, el: HTMLDivElement | null) => { if (el) pageEls.current.set(i, el); else pageEls.current.delete(i); }, []);
  const goDest = useCallback(async (dest: any) => {
    if (!pdf || !dest) return;
    try { const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest; if (!d) return; const idx = typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) : Number(d[0]); goTo(idx); } catch { /* broken link */ }
  }, [pdf, goTo]);

  // Text of every page (cached), for search, Ask, blanks and read-aloud.
  const allRuns = useCallback(async (onProgress?: (i: number) => void): Promise<TextRun[][]> => {
    const out: TextRun[][] = [];
    for (let i = 0; i < (pdf?.numPages ?? 0); i++) {
      let r = runsCache.current.get(i);
      if (!r) { r = await runsOf(await pdf.getPage(i + 1)); runsCache.current.set(i, r); }
      out.push(r.length ? r : (ocrRuns[i] ?? [])); onProgress?.(i);
    }
    return out;
  }, [pdf, ocrRuns]);

  // ── Markup ──
  const pushUndo = () => { undo.current.push(markups); if (undo.current.length > 100) undo.current.shift(); };
  const addMarkup = useCallback((m: Markup) => { setMarkups(ms => { undo.current.push(ms); return [...ms, m]; }); }, []);
  const eraseMarkup = useCallback((id: string) => { setMarkups(ms => { undo.current.push(ms); return ms.filter(m => m.id !== id); }); }, []);
  const editText = useCallback((id: string, text: string) => {
    setMarkups(ms => { const m = ms.find(x => x.id === id); if (!m) return ms; if (!text.trim() && (m.kind === 'note' || m.kind === 'text')) return ms.filter(x => x.id !== id); return ms.map(x => x.id === id ? { ...x, text } as Markup : x); });
  }, []);
  const doUndo = () => { const prev = undo.current.pop(); if (prev) setMarkups(prev); };

  // ── Form values ──
  const setValue = useCallback((name: string, v: Value) => {
    setValues(s => ({ ...s, [name]: v })); setDirty(d => new Set(d).add(name));
    setFieldTone(t => { if (!t[name] || t[name] === 'human') return t; const n = { ...t }; delete n[name]; return n; });
  }, []);
  const allFields = useMemo(() => [...fields, ...virtualFields], [fields, virtualFields]);
  const fieldsByPage = useMemo(() => { const m = new Map<number, PdfField[]>(); for (const f of allFields) { const a = m.get(f.page) ?? []; a.push(f); m.set(f.page, a); } return m; }, [allFields]);
  const fillable = allFields.filter(f => !f.readOnly && f.type !== 'button');

  const runPlan = (map = aiMap) => {
    const withValues = allFields.map(f => ({ ...f, value: values[f.name] ?? (f.type === 'checkbox' ? false : undefined) }));
    const rows = planFill(withValues, profile, { aiMap: map });
    setPlan(rows); setAccepted(new Set(rows.filter(r => r.outcome === 'suggest' && (r.confidence ?? 0) >= 0.7 && r.key !== 'today').map(r => r.name)));
    const tones: Record<string, string> = {};
    rows.forEach(r => { if (r.outcome === 'human' || r.outcome === 'sensitive' || r.outcome === 'choice') tones[r.name] = 'human'; else if (r.outcome === 'suggest') tones[r.name] = 'suggest'; });
    setFieldTone(t => ({ ...Object.fromEntries(Object.entries(t).filter(([, v]) => v === 'smart')), ...tones }));
    return rows;
  };
  const applyPlan = () => {
    if (!plan) return;
    const write = valuesToWrite(plan, accepted);
    setValues(s => ({ ...s, ...write })); setDirty(d => { const n = new Set(d); Object.keys(write).forEach(k => n.add(k)); return n; });
    setFieldTone(t => { const n = { ...t }; Object.keys(write).forEach(k => { n[k] = 'smart'; }); return n; });
    flash(`Filled ${Object.keys(write).length} field${Object.keys(write).length === 1 ? '' : 's'}. Green fields came from your profile; check them before you send.`);
    setPlan(null);
  };
  const askAriaToPlace = async () => {
    const rows = plan ?? runPlan(); const req = mapRequest(allFields, rows);
    if (!req.fields.length) { flash('Every field Smart Fill could read is already placed.'); return; }
    setBusy('Aria is reading the unclear fields…');
    const r = await aiMapFields(req); setBusy(null);
    if (r.error) { flash(r.error); return; }
    setAiMap(r.map); runPlan(r.map);
    flash(Object.keys(r.map).length ? `Aria placed ${Object.keys(r.map).length} more field${Object.keys(r.map).length === 1 ? '' : 's'}. They're marked "Check".` : 'Aria could not place any more fields confidently.');
  };
  const findBlanks = async () => {
    setBusy('Looking for blanks…');
    const pages = await allRuns(); const found: PdfField[] = [];
    pages.forEach((runs, page) => detectBlanks(page, runs).forEach((b, i) => found.push({ name: `Tela_p${page + 1}_${i + 1}`, type: b.type, page, rect: b.rect, label: b.label || undefined })));
    setBusy(null); setVirtualFields(found);
    flash(found.length ? `Found ${found.length} blank${found.length === 1 ? '' : 's'}. They're fillable now and become real form fields when you save.` : 'No blank lines or boxes found. Use the Text tool to type anywhere on the page.');
  };
  const offerLearn = () => {
    const typed: Record<string, Value> = {}; dirty.forEach(n => { if (values[n] !== undefined) typed[n] = values[n]; });
    const l = learnFrom(allFields, typed, profile);
    if (!l.length) { flash('Nothing new to remember from this form.'); return; }
    setLearned(l);
  };
  const saveProfile = async (p: FillProfile, replace = false) => { const r = await saveFillProfile(p, replace); setProfile(r.profile); setProfileSynced(r.synced); };

  // ── Search ──
  const runSearch = async (q = query) => {
    if (!q.trim() || !pdf) { setHits([]); return; }
    setSearching(true);
    const pages = await allRuns();
    const found = searchRuns(pages, q).map(h => ({ ...h, run: pages[h.page][h.runIndex] }));
    setHits(found); setHitIdx(0); setSearching(false);
    if (found.length) goTo(found[0].page);
  };
  const stepHit = (d: number) => { if (!hits.length) return; const n = (hitIdx + d + hits.length) % hits.length; setHitIdx(n); goTo(hits[n].page); };
  useEffect(() => { const el = scroller.current?.querySelector('[data-hit-current]'); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [hitIdx, hits]);
  const hitsByPage = useMemo(() => { const m = new Map<number, Array<SearchHit & { run: TextRun; current: boolean }>>(); hits.forEach((h, i) => { const a = m.get(h.page) ?? []; a.push({ ...h, current: i === hitIdx }); m.set(h.page, a); }); return m; }, [hits, hitIdx]);

  // ── Ask ──
  const ask = async (q: string) => {
    if (!q.trim()) return;
    setAskLog(l => [...l, { q }]); setAskQ('');
    const pages = (await allRuns()).map(rs => rs.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim());
    const r = await askPdf(q, pages, src?.name ?? 'PDF');
    setAskLog(l => l.map((x, i) => i === l.length - 1 ? { q, a: r.answer ? r.answer + (r.truncated ? '\n\n(Only the first part of a very long PDF was read.)' : '') : undefined, err: r.error } : x));
  };

  // ── OCR for scans ──
  const recognize = async () => {
    if (!pdf) return; const i = current;
    setBusy(`Recognizing text on page ${i + 1}…`);
    try {
      const pg = await pdf.getPage(i + 1); const vp = pg.getViewport({ scale: 2.5 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const runs = await ocrPage(c, pg.getViewport({ scale: 1 }).height, 2.5, p => setBusy(`Recognizing text on page ${i + 1}… ${Math.round(p * 100)}%`));
      setOcrRuns(o => ({ ...o, [i]: runs })); runsCache.current.set(i, runs);
      flash(runs.length ? `Read ${runs.length} words on page ${i + 1}. Search, Ask and Find blanks can use them now.` : 'No text found on this page.');
    } catch { flash('Text recognition could not run on this device.'); }
    setBusy(null);
  };

  // ── Read aloud ──
  const [speaking, setSpeaking] = useState(false);
  const readAloud = async () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    let r = runsCache.current.get(current); if (!r && pdf) { r = await runsOf(await pdf.getPage(current + 1)); runsCache.current.set(current, r); }
    const text = (r ?? []).map(x => x.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) { flash('No readable text on this page.'); return; }
    const u = new SpeechSynthesisUtterance(text); u.onend = () => setSpeaking(false); speechSynthesis.speak(u); setSpeaking(true);
  };
  useEffect(() => () => { try { speechSynthesis.cancel(); } catch { /* none */ } }, []);

  // ── Save ──
  const build = async (): Promise<Uint8Array | null> => {
    if (!bytes) return null;
    const vals: Record<string, Value> = {}; dirty.forEach(n => { if (values[n] !== undefined) vals[n] = values[n]; });
    if (encrypted) {
      // pdf-lib cannot rewrite encrypted files; pdf.js saves the form values and keeps the encryption.
      if (markups.length || removed.size || virtualFields.length || Object.keys(pageRot).length || rotation) flash('This PDF is encrypted, so only form answers are saved into it. Use Print to keep marks and signatures as a new PDF.');
      setBusy('Writing your PDF…');
      try { return await saveFormWithPdfjs(pdf, fields, vals, Object.keys(vals)); }
      catch (e: any) { flash(`Could not save this encrypted PDF: ${e?.message ?? e}`); return null; }
      finally { setBusy(null); }
    }
    const rotate: Record<number, number> = {}; for (let i = 0; i < (pdf?.numPages ?? 0); i++) { const r = (rotation + (pageRot[i] ?? 0)) % 360; if (r) rotate[i] = r; }
    const used = new Set(virtualFields.filter(f => values[f.name] !== undefined && values[f.name] !== '' && values[f.name] !== false).map(f => f.name));
    setBusy('Writing your PDF…');
    try {
      const r = await writePdf(bytes, {
        values: vals, markups, rotate, remove: [...removed], flatten,
        newFields: virtualFields.filter(f => used.has(f.name) || !flatten).map(f => ({ name: f.name, page: f.page, rect: f.rect, type: f.type === 'checkbox' ? 'checkbox' : 'text', tooltip: f.label })),
      });
      if (r.failed.length) flash(`Saved. ${r.failed.length} field${r.failed.length === 1 ? '' : 's'} could not be written: ${r.failed.slice(0, 3).map(f => f.name).join(', ')}`);
      return r.bytes;
    } catch (e: any) { flash(`Could not write the PDF: ${e?.message ?? e}`); return null; }
    finally { setBusy(null); }
  };
  const outName = () => (src?.name ?? 'document.pdf').replace(/(\.pdf)?$/i, '') + (flatten ? ' (final)' : '') + '.pdf';
  const download = async () => {
    const b = await build(); if (!b) return;
    const url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = outName(); a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const saveToTela = async () => {
    if (!onSaveToTela) return; const b = await build(); if (!b) return;
    setBusy('Saving to Tela…'); try { await onSaveToTela(b, outName()); flash('Saved to Tela.'); setSavedPrint(fingerprint); } catch (e: any) { flash(`Could not save: ${e?.message ?? e}`); } finally { setBusy(null); }
  };
  const print = async () => {
    const edited = markups.length || dirty.size || removed.size || Object.keys(pageRot).length || rotation;
    const b = edited && !encrypted ? await build() : bytes; if (!b) return;
    const url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; f.src = url;
    f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(url, '_blank'); } window.setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60_000); };
    document.body.appendChild(f);
  };
  // What has changed since the last save (or since opening).
  const fingerprint = useMemo(() => JSON.stringify([markups.map(m => m.id + ('text' in m ? `:${m.text ?? ''}` : '')), [...dirty].map(n => [n, values[n]]), [...removed], pageRot, rotation]), [markups, dirty, values, removed, pageRot, rotation]);
  const [savedPrint, setSavedPrint] = useState<string | null>(null);
  useEffect(() => { setSavedPrint(null); }, [pdf]);
  const pristine = JSON.stringify([[], [], [], {}, 0]);
  const unsaved = fingerprint !== (savedPrint ?? pristine);
  const close = () => { if (unsaved && !window.confirm('Close without saving your changes to this PDF?')) return; onClose(); };

  // ── Keyboard ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setPanel('search'); window.setTimeout(() => document.getElementById('tela-pdf-search')?.focus(), 30); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); void print(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void (onSaveToTela ? saveToTela() : download()); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1.15); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoom(1 / 1.15); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
      if (e.key === 'Escape') { setTool('select'); setPendingSign(null); setEditing(null); }
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.shiftKey)) { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !e.shiftKey)) { e.preventDefault(); goTo(current - 1); }
      if (e.key === 'Home') goTo(0); if (e.key === 'End') goTo((pdf?.numPages ?? 1) - 1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // re-bound each render so handlers see fresh state

  const onWheel = (e: React.WheelEvent) => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); } };

  const openFile = (f: File) => { if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { flash('Choose a PDF file.'); return; } if (unsaved && !window.confirm('Open another PDF without saving changes to this one?')) return; f.arrayBuffer().then(b => { setPassword(''); setSrc({ name: f.name, bytes: new Uint8Array(b) }); }); };

  const ToolBtn = ({ id, icon, label }: { id: Tool; icon: React.ReactNode; label: string }) =>
    <button type="button" title={label} aria-label={label} aria-pressed={tool === id} onClick={() => { setTool(t => t === id ? 'select' : id); if (id === 'sign' && !pendingSign) setSignOpen({}); }} className={`${btn} ${tool === id ? on : ''}`}>{icon}</button>;

  const numPages = pdf?.numPages ?? 0;
  const groups = PROFILE_FIELDS.reduce<Record<string, typeof PROFILE_FIELDS>>((a, f) => { (a[f.group] ??= []).push(f); return a; }, {});

  return (
    <div className="tela-pdf fixed inset-0 z-[1200] flex flex-col bg-[#0d0c12] text-white" data-testid="tela-pdf-reader"
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) openFile(f); }}>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-white/10 bg-[#121019]">
        <button type="button" onClick={close} className={btn} title="Back to Tela"><ArrowLeft size={16} /><span className="hidden md:inline">Tela</span></button>
        <div className="flex items-center gap-1.5 min-w-0 px-1"><FileText size={15} className="text-cyan-300 shrink-0" /><div className="truncate max-w-[34vw] text-[13px] font-bold" title={src?.name}>{src?.name ?? 'PDF reader'}</div>{unsaved && <span className="text-[10px] text-amber-300">• edited</span>}</div>
        <div className="mx-1 h-5 w-px bg-white/10 hidden sm:block" />
        <button type="button" className={`${btn} ${side ? on : ''}`} title="Pages and outline" onClick={() => setSide(s => s ? null : 'thumbs')}><LayoutGrid size={15} /></button>
        <div className="flex items-center">
          <button type="button" className={btn} title="Previous page" onClick={() => goTo(current - 1)} disabled={current <= 0}><ChevronLeft size={16} /></button>
          <input aria-label="Page number" value={pageInput} onChange={e => setPageInput(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') goTo(Number(pageInput) - 1); }} onBlur={() => setPageInput(String(current + 1))}
            className="w-10 h-7 text-center rounded-md bg-white/5 border border-white/10 text-[12px] outline-none" />
          <span className="text-[12px] text-white/50 px-1">/ {numPages || '–'}</span>
          <button type="button" className={btn} title="Next page" onClick={() => goTo(current + 1)} disabled={current >= numPages - 1}><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center">
          <button type="button" className={btn} title="Zoom out (Ctrl −)" onClick={() => zoom(1 / 1.15)}><Minus size={15} /></button>
          <button type="button" className={`${btn} w-14 tabular-nums`} title="Fit width / fit page" onClick={() => setFit(f => f === 'width' ? 'page' : 'width')}>{Math.round(scale * 100)}%</button>
          <button type="button" className={btn} title="Zoom in (Ctrl +)" onClick={() => zoom(1.15)}><Plus size={15} /></button>
        </div>
        <button type="button" className={btn} title="Rotate view" onClick={() => setRotation(r => (r + 90) % 360)}><RotateCw size={15} /></button>
        <button type="button" className={`${btn} ${spread ? on : ''} hidden md:inline-flex`} title="Two pages side by side" onClick={() => setSpread(s => !s)}><Columns2 size={15} /></button>
        <button type="button" className={`${btn} ${dark ? on : ''}`} title="Night reading" onClick={() => setDark(d => !d)}><Moon size={15} /></button>
        <button type="button" className={`${btn} ${speaking ? on : ''}`} title="Read this page aloud" onClick={() => void readAloud()}><Volume2 size={15} /></button>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button type="button" className={`${btn} ${panel === 'search' ? on : ''}`} title="Search (Ctrl F)" onClick={() => setPanel(p => p === 'search' ? null : 'search')}><Search size={15} /></button>
          <button type="button" className={`${btn} ${panel === 'fill' ? on : ''}`} title="Fill & Sign" onClick={() => setPanel(p => p === 'fill' ? null : 'fill')} data-testid="tela-pdf-fill"><Wand2 size={15} /><span className="hidden lg:inline">Fill &amp; Sign</span>{fillable.length > 0 && <span className="text-[10px] px-1.5 rounded-full bg-emerald-400/20 text-emerald-200">{fillable.length}</span>}</button>
          <button type="button" className={`${btn} ${panel === 'ask' ? on : ''}`} title="Ask about this PDF" onClick={() => setPanel(p => p === 'ask' ? null : 'ask')}><Bot size={15} /><span className="hidden lg:inline">Ask</span></button>
          <button type="button" className={`${btn} ${panel === 'info' ? on : ''}`} title="Document info" onClick={() => setPanel(p => p === 'info' ? null : 'info')}><Info size={15} /></button>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <button type="button" className={btn} title="Open another PDF" onClick={() => fileInput.current?.click()}><Upload size={15} /></button>
          <button type="button" className={btn} title="Print (Ctrl P)" onClick={() => void print()} disabled={!pdf}><Printer size={15} /></button>
          <button type="button" className={btn} title="Download PDF with your changes" onClick={() => void download()} disabled={!pdf}><Download size={15} /></button>
          {onSaveToTela && <button type="button" className={`${btn} bg-cyan-400/15 text-cyan-100`} title="Save into Tela (Ctrl S)" onClick={() => void saveToTela()} disabled={!pdf}><Save size={15} /><span className="hidden sm:inline">{saveLabel ?? 'Save'}</span></button>}
        </div>
      </div>

      {/* Tool row */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-white/5 bg-[#100e16]">
        <ToolBtn id="select" icon={<MousePointer2 size={15} />} label="Select text and fill fields" />
        <ToolBtn id="highlight" icon={<Highlighter size={15} />} label="Highlight (select text)" />
        <ToolBtn id="underline" icon={<Underline size={15} />} label="Underline (select text)" />
        <ToolBtn id="strike" icon={<Strikethrough size={15} />} label="Strike through (select text)" />
        <ToolBtn id="ink" icon={<PenLine size={15} />} label="Draw" />
        <ToolBtn id="rect" icon={<Square size={15} />} label="Box" />
        <ToolBtn id="note" icon={<StickyNote size={15} />} label="Sticky note" />
        <ToolBtn id="text" icon={<Type size={15} />} label="Type on the page" />
        <ToolBtn id="sign" icon={<Signature size={15} />} label="Sign" />
        <ToolBtn id="erase" icon={<Eraser size={15} />} label="Remove markup" />
        <div className="flex items-center gap-1 ml-1">{COLORS.map(c => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={`w-5 h-5 rounded-full border ${color === c ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: c }} />)}</div>
        <button type="button" className={btn} title="Undo (Ctrl Z)" onClick={doUndo} disabled={!undo.current.length}><Undo2 size={15} /></button>
        <div className="ml-auto text-[11px] text-white/40 hidden md:block">
          {tool === 'sign' ? (pendingSign ? 'Click the page where you sign. Esc to stop.' : 'Make your signature first.') : tool === 'highlight' || tool === 'underline' || tool === 'strike' ? 'Select text to mark it.' : tool === 'note' || tool === 'text' ? 'Click the page to add.' : tool === 'erase' ? 'Click a mark to remove it.' : ''}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        {side && pdf && <aside className="w-[176px] shrink-0 border-r border-white/10 bg-[#110f17] flex flex-col">
          <div className="flex gap-1 p-1.5 border-b border-white/5">
            <button type="button" title="Pages" className={`${btn} flex-1 ${side === 'thumbs' ? on : ''}`} onClick={() => setSide('thumbs')}><LayoutGrid size={14} /></button>
            <button type="button" title="Outline" className={`${btn} flex-1 ${side === 'outline' ? on : ''}`} onClick={() => setSide('outline')}><ListTree size={14} /></button>
            <button type="button" title="Notes and marks" className={`${btn} flex-1 ${side === 'notes' ? on : ''}`} onClick={() => setSide('notes')}><MessageSquare size={14} />{markups.length > 0 && <span className="text-[10px]">{markups.length}</span>}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {side === 'thumbs' && Array.from({ length: numPages }, (_, i) => <Thumb key={i} pdf={pdf} index={i} active={i === current} rotation={(rotation + (pageRot[i] ?? 0)) % 360} removed={removed.has(i)}
              onClick={() => goTo(i)} onRotate={() => setPageRot(r => ({ ...r, [i]: ((r[i] ?? 0) + 90) % 360 }))}
              onDelete={() => setRemoved(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else if (n.size < numPages - 1) n.add(i); return n; })} />)}
            {side === 'outline' && (outline === null ? <div className="text-[12px] text-white/40">Reading…</div> : outline.length === 0 ? <div className="text-[12px] text-white/40 leading-relaxed">This PDF has no outline.</div>
              : <OutlineTree items={outline} onGo={goDest} />)}
            {side === 'notes' && (markups.length === 0 ? <div className="text-[12px] text-white/40 leading-relaxed">Highlights, notes and drawings you add show here.</div>
              : [...markups].sort((a, b) => a.page - b.page).map(m => <div key={m.id} className="group mb-2 rounded-lg bg-white/[.04] p-2 text-[11px]">
                  <div className="flex items-center gap-1 text-white/50"><span className="w-2 h-2 rounded-full" style={{ background: 'color' in m ? m.color : '#fff' }} />{m.kind} · p. {m.page + 1}
                    <button type="button" className="ml-auto opacity-0 group-hover:opacity-100" title="Remove" onClick={() => eraseMarkup(m.id)}><X size={12} /></button></div>
                  <button type="button" className="text-left text-white/80 mt-1 line-clamp-3" onClick={() => goTo(m.page)}>{('text' in m && m.text) || (m.kind === 'image' ? 'Signature' : 'Open')}</button>
                </div>))}
          </div>
        </aside>}

        {/* Pages */}
        <div ref={scroller} className="flex-1 min-w-0 overflow-auto bg-[#1b1924]" onWheel={onWheel}>
          {error ? <div className="h-full grid place-items-center p-6 text-center"><div><div className="text-pink-300 font-bold mb-2">{error}</div><button type="button" className={`${btn} mx-auto`} onClick={() => fileInput.current?.click()}><Upload size={14} />Open a PDF</button></div></div>
            : needPassword ? <div className="h-full grid place-items-center p-6"><form className="w-full max-w-xs rounded-2xl bg-[#16141f] border border-white/10 p-4" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('pw') as HTMLInputElement).value; setPassword(v); }}>
                <div className="font-bold text-sm mb-1">This PDF is password-protected</div>
                <div className="text-[12px] text-white/50 mb-3">{needPassword === 'wrong' ? 'That password did not open it. Try again.' : 'Enter the password the sender gave you. It stays on this device.'}</div>
                <input name="pw" type="password" autoFocus autoComplete="off" className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 outline-none text-sm mb-3" />
                <button type="submit" className={`${btn} w-full bg-cyan-400/20`}>Open</button></form></div>
            : !src ? <div className="h-full grid place-items-center p-6 text-center"><div>
                <BookOpen size={36} className="mx-auto text-cyan-300 mb-3" /><div className="text-lg font-bold mb-1">Open a PDF</div>
                <div className="text-[13px] text-white/50 mb-4 max-w-sm">Read, search, highlight, sign and fill forms. Smart Fill answers form questions from your profile; signatures and ID numbers always stay yours to enter.</div>
                <button type="button" className={`${btn} mx-auto bg-cyan-400/20 h-10 px-4`} onClick={() => fileInput.current?.click()}><Upload size={15} />Choose a PDF</button>
                <div className="text-[11px] text-white/35 mt-2">or drop one here</div></div></div>
            : !pdf ? <div className="h-full grid place-items-center text-white/50"><Loader2 className="animate-spin" /></div>
            : <div className={`py-6 px-6 ${spread ? 'flex flex-wrap justify-center gap-x-3 content-start' : ''}`}>
                {Array.from({ length: numPages }, (_, i) => <div key={i} className={`relative ${removed.has(i) ? 'opacity-35' : ''}`}>
                  {removed.has(i) && <div className="absolute z-10 left-1/2 -translate-x-1/2 top-3 text-[11px] px-2 py-0.5 rounded-full bg-black/70 text-pink-200">Removed when you save</div>}
                  <PdfPage pdf={pdf} pdfjs={pdfjs} index={i} scale={scale} rotation={(rotation + (pageRot[i] ?? 0)) % 360} dark={dark} tool={tool} color={color}
                    fields={fieldsByPage.get(i) ?? []} values={values} fieldTone={fieldTone} setValue={setValue} onSignField={f => setSignOpen({ field: f })}
                    markups={markups.filter(m => m.page === i)} onAdd={addMarkup} onErase={eraseMarkup} onEditText={editText} editing={editing} setEditing={setEditing}
                    hits={hitsByPage.get(i) ?? []} links={links[i] ?? []} onGoDest={goDest} baseSize={baseSize} onVisible={onVisible} registerEl={registerEl}
                    pendingSign={tool === 'sign' ? pendingSign : null} onPlaced={() => setTool('select')} />
                </div>)}
              </div>}
        </div>

        {/* Right panel */}
        {panel && <aside className="w-[min(360px,92vw)] shrink-0 border-l border-white/10 bg-[#121019] flex flex-col max-md:absolute max-md:right-0 max-md:top-[88px] max-md:bottom-0 max-md:z-20">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-white/5">
            <div className="text-[13px] font-bold">{panel === 'fill' ? 'Fill & Sign' : panel === 'search' ? 'Search' : panel === 'ask' ? 'Ask about this PDF' : 'Document info'}</div>
            <button type="button" className={`${btn} ml-auto`} onClick={() => setPanel(null)} aria-label="Close panel"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-[12px]">
            {panel === 'search' && <>
              <form onSubmit={e => { e.preventDefault(); void runSearch(); }} className="flex gap-1 mb-2">
                <input id="tela-pdf-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find in document" className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 outline-none" />
                <button type="submit" className={`${btn} bg-white/5`}>{searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}</button>
              </form>
              {hits.length > 0 && <div className="flex items-center gap-1 mb-2 text-white/60">{hitIdx + 1} of {hits.length}
                <button type="button" className={`${btn} ml-auto`} onClick={() => stepHit(-1)}><ChevronLeft size={14} /></button><button type="button" className={btn} onClick={() => stepHit(1)}><ChevronRight size={14} /></button></div>}
              {!searching && query && !hits.length && <div className="text-white/45">No matches.{Object.keys(ocrRuns).length === 0 ? ' If this is a scan, use Recognize text in Document info first.' : ''}</div>}
              {hits.slice(0, 300).map((h, i) => <button key={i} type="button" onClick={() => { setHitIdx(i); goTo(h.page); }} className={`block w-full text-left rounded-lg p-2 mb-1 ${i === hitIdx ? 'bg-cyan-400/10' : 'hover:bg-white/5'}`}>
                <div className="text-[10px] text-white/40">Page {h.page + 1}</div><div className="text-white/80">{h.snippet}</div></button>)}
            </>}

            {panel === 'fill' && <>
              {!fieldsReady && pdf && <div className="flex items-center gap-2 text-white/50 mb-3"><Loader2 size={13} className="animate-spin" />Reading the form…</div>}
              {fieldsReady && fillable.length === 0 && <div className="rounded-xl bg-white/[.04] p-3 mb-3 leading-relaxed text-white/70">
                This PDF has no fillable fields. <button type="button" className="text-cyan-300 font-semibold" onClick={() => void findBlanks()}>Find the blanks</button> to turn its lines and boxes into fields, or use the <b>Text</b> tool to type anywhere.
              </div>}
              {fillable.length > 0 && <div className="mb-3">
                <div className="text-white/60 mb-2">{fillable.length} field{fillable.length === 1 ? '' : 's'} on this form. Smart Fill reads each question and answers from your profile.</div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={`${btn} bg-emerald-400/20 text-emerald-100`} onClick={() => runPlan()} data-testid="tela-pdf-smartfill"><Sparkles size={14} />Smart Fill</button>
                  <button type="button" className={`${btn} bg-white/5`} onClick={() => void askAriaToPlace()} title="Aria sees the questions only, never your answers"><Bot size={14} />Ask Aria about unclear fields</button>
                  {fields.length === 0 && <button type="button" className={`${btn} bg-white/5`} onClick={() => void findBlanks()}><ScanText size={14} />Find blanks again</button>}
                </div>
              </div>}
              {plan && <div className="mb-3 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/[.04] text-white/70">{planSummary(plan)}</div>
                <div className="max-h-[42vh] overflow-y-auto divide-y divide-white/5">
                  {plan.map(r => <div key={r.name} className="px-3 py-2 flex items-start gap-2">
                    {r.outcome === 'suggest' ? <input type="checkbox" className="mt-0.5 accent-amber-400" checked={accepted.has(r.name)} onChange={e => setAccepted(s => { const n = new Set(s); if (e.target.checked) n.add(r.name); else n.delete(r.name); return n; })} aria-label={`Use suggestion for ${r.question}`} />
                      : <span className="w-3.5" />}
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => goTo(r.page)}>
                      <div className="truncate text-white/85" title={r.question}>{r.question}</div>
                      {r.value !== undefined && r.outcome !== 'keep' && <div className="truncate text-white/55">{typeof r.value === 'boolean' ? (r.value ? 'Checked' : 'Unchecked') : r.value}</div>}
                      {r.note && <div className="text-[10px] text-white/35">{r.note}</div>}
                    </button>
                    <span className={`text-[10px] font-semibold whitespace-nowrap ${OUTCOME_TONE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
                  </div>)}
                </div>
                <div className="flex gap-1.5 p-2 border-t border-white/10">
                  <button type="button" className={`${btn} bg-emerald-500/80 text-white flex-1`} onClick={applyPlan}><Check size={14} />Fill {valuesToWrite(plan, accepted) ? Object.keys(valuesToWrite(plan, accepted)).length : 0}</button>
                  <button type="button" className={btn} onClick={() => setPlan(null)}>Cancel</button>
                </div>
              </div>}

              <div className="rounded-xl bg-white/[.03] border border-white/10 mb-3">
                <button type="button" className="w-full flex items-center gap-2 px-3 py-2" onClick={() => setProfileOpen(o => !o)}>
                  <Sparkles size={13} className="text-emerald-300" /><span className="font-semibold">Your fill profile</span>
                  <span className="text-[10px] text-white/40">{Object.keys(profile.values).length} answers · {Object.keys(profile.remembered).length} remembered</span>
                  <ChevronDown size={14} className={`ml-auto transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>
                {profileOpen && <ProfileEditor profile={profile} groups={groups} synced={profileSynced} onSave={p => void saveProfile(p, true)} />}
              </div>

              {dirty.size > 0 && <button type="button" className={`${btn} w-full bg-white/5 mb-3`} onClick={offerLearn}><Sparkles size={14} />Remember my answers for next time</button>}
              {learned && <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/5 p-3 mb-3">
                <div className="font-semibold mb-1">Remember these?</div>
                <div className="text-white/50 mb-2">Saved to your fill profile so the next form fills itself. ID numbers and signatures are never kept.</div>
                {learned.map((l, i) => <div key={i} className="flex gap-2 py-0.5"><span className="text-white/55 truncate flex-1" title={l.question}>{l.key ? PROFILE_FIELDS.find(p => p.key === l.key)?.label : l.question}</span><span className="text-white/90 truncate max-w-[45%]">{l.value}</span></div>)}
                <div className="flex gap-1.5 mt-2">
                  <button type="button" className={`${btn} bg-emerald-500/80 text-white flex-1`} onClick={() => { void saveProfile(applyLearned(profile, learned)); setLearned(null); flash('Remembered.'); }}><Check size={14} />Remember</button>
                  <button type="button" className={btn} onClick={() => setLearned(null)}>Not now</button>
                </div>
              </div>}

              <div className="rounded-xl bg-white/[.03] border border-white/10 p-3 mb-3">
                <div className="flex items-center gap-2 mb-1"><Signature size={13} className="text-pink-300" /><span className="font-semibold">Sign</span></div>
                <div className="text-white/50 mb-2">Draw or type your signature, then click where it goes. Smart Fill never signs, dates a signature or ticks a certification for you.</div>
                <button type="button" className={`${btn} bg-pink-500/20 text-pink-100`} onClick={() => setSignOpen({})}><PenLine size={14} />{pendingSign ? 'Change signature' : 'Make my signature'}</button>
                {pendingSign && <button type="button" className={`${btn} ml-1 ${tool === 'sign' ? on : 'bg-white/5'}`} onClick={() => setTool('sign')}>Place it</button>}
              </div>

              <label className="flex items-start gap-2 text-white/60 mb-1"><input type="checkbox" className="mt-0.5" checked={flatten} onChange={e => setFlatten(e.target.checked)} />
                <span>Finalize when saving (lock fields into the page). Leave off to keep the form editable.</span></label>
            </>}

            {panel === 'ask' && <>
              {!askConsent ? <div className="rounded-xl bg-white/[.04] p-3 leading-relaxed text-white/70">
                Ask questions or get a summary with page citations. To answer, this PDF’s text is sent to the cloud assistant (Gemini). It is not stored.
                <button type="button" className={`${btn} mt-2 bg-cyan-400/20 w-full`} onClick={() => { setAskConsent(true); try { localStorage.setItem('tela.pdfAskConsent', '1'); } catch { /* fine */ } }}>Turn on Ask for PDFs</button>
                {!signedIn() && <div className="text-[11px] text-white/40 mt-2">You’ll need to sign in.</div>}
              </div> : <>
                <div className="flex flex-wrap gap-1 mb-2">{['Summarize this', 'What are the deadlines?', 'What do I need to sign or send back?'].map(q => <button key={q} type="button" className={`${btn} bg-white/5 h-7 text-[11px]`} onClick={() => void ask(q)}>{q}</button>)}</div>
                {askLog.map((x, i) => <div key={i} className="mb-3"><div className="text-cyan-200 font-semibold mb-1">{x.q}</div>
                  {x.a ? <div className="whitespace-pre-wrap text-white/80 leading-relaxed">{x.a}</div> : x.err ? <div className="text-pink-300">{x.err}</div> : <Loader2 size={14} className="animate-spin text-white/50" />}</div>)}
                <form onSubmit={e => { e.preventDefault(); void ask(askQ); }} className="flex gap-1 sticky bottom-0 bg-[#121019] pt-1">
                  <input value={askQ} onChange={e => setAskQ(e.target.value)} placeholder="Ask a question" className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 outline-none" />
                  <button type="submit" className={`${btn} bg-cyan-400/20`}><ChevronRight size={14} /></button>
                </form>
                <button type="button" className="text-[10px] text-white/35 mt-2" onClick={() => { setAskConsent(false); try { localStorage.removeItem('tela.pdfAskConsent'); } catch { /* fine */ } }}>Turn off Ask</button>
              </>}
            </>}

            {panel === 'info' && <>
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 mb-3">
                <dt className="text-white/40">Pages</dt><dd>{numPages}</dd>
                <dt className="text-white/40">Size</dt><dd>{(baseSize.w / 72).toFixed(2)} × {(baseSize.h / 72).toFixed(2)} in</dd>
                <dt className="text-white/40">File</dt><dd>{bytes ? `${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB` : '–'}</dd>
                <dt className="text-white/40">Form fields</dt><dd>{fields.length}</dd>
                {encrypted && <><dt className="text-white/40">Security</dt><dd className="text-amber-300">Encrypted — form answers save; marks print to a new PDF</dd></>}
                {Object.entries(info).map(([k, v]) => <React.Fragment key={k}><dt className="text-white/40">{k}</dt><dd className="break-words">{v}</dd></React.Fragment>)}
              </dl>
              <button type="button" className={`${btn} bg-white/5 w-full`} onClick={() => void recognize()} title="For scanned pages: reads the words on this device"><ScanText size={14} />Recognize text on page {current + 1}</button>
              <div className="text-[10px] text-white/35 mt-1">For scans. Runs on this device; the page never leaves it.</div>
            </>}
          </div>
        </aside>}
      </div>

      {busy && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1250] flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-[12px]"><Loader2 size={14} className="animate-spin" />{busy}</div>}
      {toast && !busy && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1250] max-w-[90vw] rounded-xl bg-black/85 px-4 py-2 text-[12px] text-white/90 shadow-xl" role="status">{toast}</div>}
      {signOpen && <SignaturePad onCancel={() => setSignOpen(null)} onDone={url => {
        const f = signOpen.field; setPendingSign(url); setSignOpen(null);
        if (f) { pushUndo(); setMarkups(ms => [...ms, { id: uid(), page: f.page, kind: 'image', rect: f.rect, dataUrl: url, label: 'Signature' }]); flash('Signed. Saving writes the signature onto the page.'); }
        else { setTool('sign'); flash('Click the page where you sign.'); }
      }} />}
    </div>
  );
}

function OutlineTree({ items, onGo, depth = 0 }: { items: OutlineItem[]; onGo: (dest: any) => void; depth?: number }) {
  return <ul>{items.map((it, i) => <li key={i}>
    <button type="button" onClick={() => onGo(it.dest)} className="block w-full text-left text-[12px] text-white/80 hover:text-white hover:bg-white/5 rounded px-1 py-0.5" style={{ paddingLeft: 4 + depth * 10 }}>{it.title}</button>
    {it.items?.length > 0 && depth < 5 && <OutlineTree items={it.items} onGo={onGo} depth={depth + 1} />}
  </li>)}</ul>;
}

function ProfileEditor({ profile, groups, synced, onSave }: { profile: FillProfile; groups: Record<string, typeof PROFILE_FIELDS>; synced: boolean; onSave: (p: FillProfile) => void }) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const changed = JSON.stringify(draft.values) !== JSON.stringify(profile.values) || JSON.stringify(draft.remembered) !== JSON.stringify(profile.remembered);
  return <div className="px-3 pb-3">
    <div className="text-[10px] text-white/40 mb-2">{synced ? 'Synced to your account — it fills forms on every device you sign in on.' : 'Saved on this device only. Sign in to use it everywhere.'} ID, bank and card numbers are never stored.</div>
    {Object.entries(groups).map(([g, fs]) => <div key={g} className="mb-2"><div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">{g}</div>
      {fs.map(f => <label key={f.key} className="flex items-center gap-2 mb-1"><span className="w-[42%] text-white/55 truncate">{f.label}</span>
        <input value={draft.values[f.key as ProfileKey] ?? ''} type={f.kind === 'date' ? 'date' : f.kind === 'email' ? 'email' : 'text'} onChange={e => setDraft(d => ({ ...d, values: { ...d.values, [f.key]: e.target.value } }))}
          className="flex-1 min-w-0 h-7 px-2 rounded-md bg-white/5 border border-white/10 outline-none" /></label>)}
    </div>)}
    {Object.keys(draft.remembered).length > 0 && <div className="mb-2"><div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">Remembered answers</div>
      {Object.entries(draft.remembered).map(([k, v]) => <div key={k} className="flex items-center gap-2 mb-1"><span className="w-[42%] text-white/55 truncate" title={k}>{k}</span>
        <input value={v} onChange={e => setDraft(d => ({ ...d, remembered: { ...d.remembered, [k]: e.target.value } }))} className="flex-1 min-w-0 h-7 px-2 rounded-md bg-white/5 border border-white/10 outline-none" />
        <button type="button" aria-label={`Forget ${k}`} onClick={() => setDraft(d => { const r = { ...d.remembered }; delete r[k]; return { ...d, remembered: r }; })} className="text-white/40 hover:text-white"><X size={12} /></button></div>)}
    </div>}
    <button type="button" disabled={!changed} onClick={() => onSave(draft)} className={`${btn} w-full bg-emerald-500/70 text-white`}><Save size={14} />Save profile</button>
  </div>;
}
