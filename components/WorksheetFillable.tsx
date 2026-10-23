// WorksheetFillable — the interactive worksheet overlay, shared by the teacher preview (Scan Worksheet)
// and the student assignment view. Renders the scan with answer inputs / choice buttons positioned by
// each field's 0–100% bounding box, so the fillable version looks like the original sheet.
//
// Optional `results` (fieldId → correct|null) colors each field after grading; `readOnly` locks inputs.

import React, { useRef, useState, useEffect } from 'react';
import { Pen, Eraser, Trash2, Highlighter } from 'lucide-react';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';
import { useWindowsInk, type InkPoint } from '../hooks/useWindowsInk';
import { useViewport } from '../hooks/useViewport';
import type { SelfCheckField } from '../services/worksheetScanCore';

const INK = '#fff';

export interface WorksheetFillableProps {
  sheet: DigitalWorksheet;
  preview?: string;
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  accent?: string;
  /** fieldId → true (correct) | false (wrong) | null (needs manual) — colors fields post-grade. */
  results?: Record<string, boolean | null>;
  readOnly?: boolean;
  /** overlay preserves the scan; rebuilt renders a clean Plajah/Tela-style paper form. */
  mode?: 'overlay' | 'rebuilt';
  /** "Check my work" marks: try-again / blank / check-read get a colored ring and a short note. */
  flags?: Record<string, SelfCheckField>;
}

const FLAG_COLOR: Record<SelfCheckField['status'], string> = {
  'looks-good': '#5fd17f', 'try-again': '#ff6b6b', blank: '#e0a400', 'check-read': '#36c5f0', 'teacher-reviews': '#8166e6',
};

const WorksheetFillable: React.FC<WorksheetFillableProps> = ({ sheet, preview, answers, setAnswers, accent = '#FF8C00', results, readOnly, mode = 'overlay', flags }) => {
  const set = (id: string, v: string) => { if (!readOnly) setAnswers(a => ({ ...a, [id]: v })); };
  const borderFor = (id: string): string => {
    if (results && id in results) {
      const r = results[id];
      if (r === true) return '#5fd17f';
      if (r === false) return '#ff8080';
    }
    const flag = flags?.[id];
    if (flag && flag.status !== 'looks-good' && flag.status !== 'teacher-reviews') return FLAG_COLOR[flag.status];
    return accent;
  };
  // On a phone the page-overlay inputs are a few pixels tall and iOS zooms into them, so the
  // worksheet defaults to the labelled list form there; the student can still flip to the page.
  const { isPhone } = useViewport();
  const [pageView, setPageView] = useState<boolean | null>(null);
  const showPage = pageView ?? !isPhone;
  const listToggle = mode === 'rebuilt' ? (
    <button type="button" onClick={() => setPageView(!showPage)} style={{ marginBottom: 8, minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1px solid #2a2a36', background: 'transparent', color: '#c9c9d4', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
      {showPage ? 'List view · easier on a phone' : 'Page view · see the sheet'}
    </button>
  ) : null;
  const flagNote = (id: string) => {
    const flag = flags?.[id];
    if (!flag || flag.status === 'looks-good' || flag.status === 'teacher-reviews') return null;
    return <span role="status" style={{ display: 'block', marginTop: 6, fontSize: 13, fontWeight: 650, color: FLAG_COLOR[flag.status] }}>{flag.message}</span>;
  };

  // ── Inking overlay state ──
  const [inkEnabled, setInkEnabled] = useState(false);
  const [inkTool, setInkTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [inkColor, setInkColor] = useState('#2563eb');
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkLastRef = useRef<{ x: number; y: number } | null>(null);
  const inkDrawingRef = useRef(false);

  // Resize ink canvas to match container
  useEffect(() => {
    const cvs = inkCanvasRef.current;
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cvs.width = rect.width * dpr;
    cvs.height = rect.height * dpr;
    const ctx = cvs.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [preview, mode]);

  const clearInk = () => {
    const cvs = inkCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
  };

  const drawInk = (pt: InkPoint) => {
    const cvs = inkCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const isErase = inkTool === 'eraser' || pt.isEraser;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';

    if (inkTool === 'highlighter' && !isErase) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 18;
    } else {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isErase ? '#000' : inkColor;
      const baseWidth = isErase ? 24 : 3;
      ctx.lineWidth = Math.max(1, baseWidth * (0.4 + pt.pressure * 0.8));
    }

    const lp = inkLastRef.current || { x: pt.x, y: pt.y };
    ctx.beginPath();
    ctx.moveTo(lp.x, lp.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    inkLastRef.current = { x: pt.x, y: pt.y };
  };

  const { pointerEvents: inkPointerEvents } = useWindowsInk({
    enablePalmRejection: true,
    transformPoint: ({ x, y }) => ({ x, y }),
    onStrokeStart: (point) => {
      if (!inkEnabled) return;
      inkDrawingRef.current = true;
      inkLastRef.current = { x: point.x, y: point.y };
      drawInk(point);
    },
    onStrokeMove: (points) => {
      if (!inkDrawingRef.current || !inkEnabled) return;
      for (const pt of points) {
        drawInk(pt);
      }
    },
    onStrokeEnd: () => {
      inkDrawingRef.current = false;
      inkLastRef.current = null;
    },
  });

  // The straightened page is the coordinate space the answer boxes were measured on.
  const faithfulSource = preview || sheet.cleanedImageUrl || sheet.originalImageUrl || sheet.sourceImageUrl;
  if (mode === 'rebuilt' && faithfulSource && showPage) return (
    <div>{listToggle}
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #d8d0df', background: '#fff' }}>
      <img src={faithfulSource} alt="Faithful worksheet page" style={{ width: '100%', display: 'block' }} />
      {sheet.fields.map(field => {
        const bd = borderFor(field.id); const style: React.CSSProperties = { position: 'absolute', left: `${field.box.x}%`, top: `${field.box.y}%`, width: `${Math.max(field.box.width, 7)}%`, minHeight: `${Math.max(field.box.height, 3.5)}%`, boxSizing: 'border-box' };
        if (field.type === 'multiple-choice' && field.choices?.length) return <select key={field.id} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} disabled={readOnly} aria-label={field.label} style={{ ...style, border: `2px solid ${bd}`, borderRadius: 4, background: 'rgba(255,255,255,.94)', color: '#17121d', fontSize: 10 }}><option value="">Select</option>{field.choices.map(choice => <option key={choice}>{choice}</option>)}</select>;
        return <input key={field.id} id={`ws-field-${field.id}`} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} readOnly={readOnly} aria-label={field.label} title={flags?.[field.id]?.message} inputMode={field.type === 'numeric' ? 'decimal' : 'text'} style={{ ...style, border: `2px solid ${bd}`, borderRadius: 4, background: 'rgba(255,255,255,.94)', color: '#17121d', padding: '2px 4px', fontSize: isPhone ? 16 : 11, fontWeight: 650, boxShadow: '0 1px 5px rgba(0,0,0,.18)' }} />;
      })}
    </div>
    </div>
  );

  if (mode === 'rebuilt' && sheet.segments?.length && showPage) return (
    <div>{listToggle}
    <div style={{ position: 'relative', width: '100%', paddingTop: '129.4%', borderRadius: 12, overflow: 'hidden', border: '1px solid #ddd5e4', background: '#fff', color: '#1B1523', boxShadow: '0 14px 40px rgba(0,0,0,.2)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#fff,#fdfbff)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5, background: 'linear-gradient(90deg,#6B0099,#D40055,#FF8C00)' }} />
      {sheet.segments.map((segment, index) => {
        const pos: React.CSSProperties = { position: 'absolute', left: `${segment.box.x}%`, top: `${segment.box.y}%`, width: `${segment.box.width}%`, minHeight: `${segment.box.height}%`, overflow: 'hidden' };
        if (segment.kind === 'image' || segment.kind === 'diagram' || segment.kind === 'table') return <div key={segment.id} style={{ ...pos, border: '1px solid #d8d0df', borderRadius: 5, background: '#f5f1f8', color: '#756a80', display: 'grid', placeItems: 'center', fontSize: 8, textTransform: 'uppercase' }}>{segment.kind}</div>;
        const heading = segment.kind === 'heading';
        return <div key={segment.id} style={{ ...pos, fontFamily: heading ? 'var(--font-display,Outfit,system-ui)' : 'Arial,system-ui,sans-serif', fontSize: `${Math.max(7, Math.min(18, segment.box.height * (heading ? 2.2 : 1.55)))}px`, fontWeight: heading ? 850 : segment.kind === 'question' ? 650 : 450, lineHeight: 1.15, textAlign: heading && index === 0 ? 'center' : 'left', whiteSpace: 'pre-wrap' }}>{segment.text}</div>;
      })}
      {sheet.fields.map(field => {
        const bd = borderFor(field.id); const style: React.CSSProperties = { position: 'absolute', left: `${field.box.x}%`, top: `${field.box.y}%`, width: `${Math.max(field.box.width, 8)}%`, minHeight: `${Math.max(field.box.height, 4)}%`, boxSizing: 'border-box', zIndex: 3 };
        return <input key={field.id} id={`ws-field-${field.id}`} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} readOnly={readOnly} aria-label={field.label} title={flags?.[field.id]?.message} inputMode={field.type === 'numeric' ? 'decimal' : 'text'} style={{ ...style, border: `1.4px solid ${bd}`, borderRadius: 5, background: '#fff', color: '#19131f', padding: '2px 5px', fontSize: isPhone ? 16 : 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }} />;
      })}
    </div>
    </div>
  );

  if (mode === 'rebuilt') return (
    <div>{(faithfulSource || sheet.segments?.length) ? listToggle : null}
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #ddd5e4', background: '#fff', color: '#1B1523', minHeight: 430, boxShadow: '0 14px 40px rgba(0,0,0,.2)' }}>
      <div style={{ height: 7, background: 'linear-gradient(90deg,var(--pj-purple,#6B0099),var(--pj-magenta,#D40055),var(--pj-orange,#FF8C00))' }} />
      <div style={{ padding: isPhone ? '18px 14px 22px' : '24px 22px 28px' }}>
        <div style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '.16em', textTransform: 'uppercase' }}>{sheet.subject} · {sheet.framework || 'Teacher worksheet'}</div>
        <h2 style={{ fontFamily: 'var(--font-display,Outfit,system-ui)', fontSize: isPhone ? 22 : 25, lineHeight: 1.1, margin: '8px 0 6px' }}>{sheet.title}</h2>
        {sheet.objective && <p style={{ color: '#6E6480', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>{sheet.objective}</p>}
        <div style={{ display: 'grid', gap: 18 }}>{sheet.fields.map((f, index) => {
          const bd = borderFor(f.id);
          const ring = !!flags?.[f.id] && flags[f.id].status !== 'looks-good' && flags[f.id].status !== 'teacher-reviews';
          const inputStyle: React.CSSProperties = { width: '100%', minHeight: 46, borderRadius: 11, border: `${ring ? 2.5 : 1.5}px solid ${bd}`, background: '#FBFAFD', color: '#1B1523', padding: '0 12px', fontWeight: 650, fontSize: 16 };
          const choiceStyle = (on: boolean): React.CSSProperties => ({ minHeight: 44, borderRadius: 999, padding: '0 16px', fontSize: 15, border: `1.5px solid ${on ? bd : '#D9D1E0'}`, background: on ? `${bd}22` : '#FAF8FC', color: '#1B1523', fontWeight: 700, cursor: readOnly ? 'default' : 'pointer' });
          return <div key={f.id} id={`ws-field-${f.id}`} style={{ display: 'block', scrollMarginTop: 80 }}>
            <label htmlFor={`ws-input-${f.id}`} style={{ display: 'block', fontSize: 15, lineHeight: 1.45, fontWeight: 720, marginBottom: 8 }}><span style={{ color: accent, marginRight: 7 }}>{f.ordinal || `${index + 1}.`}</span>{f.label.replace(/^\s*\(?\d{1,3}[.)]\s*/, '')}</label>
            {f.type === 'multiple-choice' && f.choices?.length
              ? <div role="radiogroup" aria-label={f.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{f.choices.map(c => <button type="button" role="radio" aria-checked={answers[f.id] === c} key={c} disabled={readOnly} onClick={() => set(f.id, c)} style={choiceStyle(answers[f.id] === c)}>{c}</button>)}</div>
              : f.type === 'true-false'
              ? <div role="radiogroup" aria-label={f.label} style={{ display: 'flex', gap: 8 }}>{['true', 'false'].map(c => <button type="button" role="radio" aria-checked={answers[f.id] === c} key={c} disabled={readOnly} onClick={() => set(f.id, c)} style={{ ...choiceStyle(answers[f.id] === c), flex: 1, borderRadius: 12, textTransform: 'capitalize' }}>{c}</button>)}</div>
              : f.type === 'long-text'
              ? <textarea id={`ws-input-${f.id}`} value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} readOnly={readOnly} style={{ ...inputStyle, minHeight: 110, padding: 12, resize: 'vertical', fontWeight: 500 }} />
              : <input id={`ws-input-${f.id}`} value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} readOnly={readOnly} inputMode={f.type === 'numeric' ? 'decimal' : 'text'} autoComplete="off" autoCorrect="off" enterKeyHint="next" style={inputStyle} />}
            {flagNote(f.id)}
          </div>;
        })}</div>
      </div>
    </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #20202c', background: '#000' }}>
      {/* Stylus Inking Controls */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-black/80 backdrop-blur border border-white/10 shadow-lg text-white text-xs">
        <button
          type="button"
          onClick={() => setInkEnabled(v => !v)}
          className={`p-1.5 min-w-[36px] min-h-[36px] grid place-items-center rounded-lg transition-colors ${inkEnabled ? 'bg-orange-500 text-white font-bold' : 'text-white/60 hover:text-white'}`}
          title={inkEnabled ? 'Inking Active (Stylus/Pen)' : 'Enable Stylus Inking'}
        >
          <Pen size={14} />
        </button>
        {inkEnabled && (
          <>
            <div className="w-px h-3.5 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={() => setInkTool('pen')}
              className={`p-1.5 min-w-[36px] min-h-[36px] grid place-items-center rounded-lg ${inkTool === 'pen' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
              title="Pen"
            >
              <Pen size={12} />
            </button>
            <button
              type="button"
              onClick={() => setInkTool('highlighter')}
              className={`p-1.5 min-w-[36px] min-h-[36px] grid place-items-center rounded-lg ${inkTool === 'highlighter' ? 'bg-yellow-500/30 text-yellow-300' : 'text-white/40 hover:text-white'}`}
              title="Highlighter"
            >
              <Highlighter size={12} />
            </button>
            <button
              type="button"
              onClick={() => setInkTool('eraser')}
              className={`p-1.5 min-w-[36px] min-h-[36px] grid place-items-center rounded-lg ${inkTool === 'eraser' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
              title="Eraser"
            >
              <Eraser size={12} />
            </button>
            <div className="w-px h-3.5 bg-white/15 mx-0.5" />
            {['#2563eb', '#111111', '#dc2626'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { setInkColor(c); setInkTool('pen'); }}
                className={`w-6 h-6 rounded-full border ${inkColor === c && inkTool === 'pen' ? 'border-white scale-110 ring-1 ring-white' : 'border-black/30'}`}
                style={{ background: c }}
                title={`Color ${c}`}
              />
            ))}
            <div className="w-px h-3.5 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={clearInk}
              className="p-1.5 min-w-[36px] min-h-[36px] grid place-items-center rounded-lg text-white/40 hover:text-rose-400" aria-label="Clear all ink"
              title="Clear all ink annotations"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {preview
        ? <img src={preview} alt="worksheet scan" style={{ width: '100%', display: 'block', opacity: 0.9 }} />
        : <div style={{ paddingTop: '130%' }} />}

      {/* Stylus Inking Overlay Canvas */}
      <canvas
        ref={inkCanvasRef}
        {...inkPointerEvents}
        className={`absolute inset-0 z-10 w-full h-full touch-none ${inkEnabled ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      />

      {sheet.fields.map(f => {
        const style: React.CSSProperties = {
          position: 'absolute', left: `${f.box.x}%`, top: `${f.box.y}%`,
          width: `${Math.max(f.box.width, 8)}%`, minHeight: `${Math.max(f.box.height, 4)}%`,
          boxSizing: 'border-box',
        };
        const bd = borderFor(f.id);
        if (f.type === 'multiple-choice' && f.choices?.length) {
          return (
            <div key={f.id} style={{ ...style, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {f.choices.map(c => (
                <button key={c} onClick={() => set(f.id, c)} disabled={readOnly} title={f.label}
                  style={{ cursor: readOnly ? 'default' : 'pointer', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, border: `1px solid ${answers[f.id] === c ? bd : '#20202c'}`, background: answers[f.id] === c ? `${bd}33` : 'rgba(0,0,0,0.55)', color: INK }}>{c}</button>
              ))}
            </div>
          );
        }
        return (
          <input key={f.id} value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} readOnly={readOnly}
            title={f.label} placeholder="✎"
            inputMode={f.type === 'numeric' ? 'decimal' : 'text'}
            style={{ ...style, textAlign: 'center', fontSize: isPhone ? 16 : 12, fontWeight: 700, padding: '2px 4px', borderRadius: 6, border: `1.5px solid ${bd}`, background: 'rgba(0,0,0,0.6)', color: INK }} />
        );
      })}
    </div>
  );
};

export default WorksheetFillable;
