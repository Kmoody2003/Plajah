// WorksheetFillable — the interactive worksheet overlay, shared by the teacher preview (Scan Worksheet)
// and the student assignment view. Renders the scan with answer inputs / choice buttons positioned by
// each field's 0–100% bounding box, so the fillable version looks like the original sheet.
//
// Optional `results` (fieldId → correct|null) colors each field after grading; `readOnly` locks inputs.

import React from 'react';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';

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
}

const WorksheetFillable: React.FC<WorksheetFillableProps> = ({ sheet, preview, answers, setAnswers, accent = '#FF8C00', results, readOnly, mode = 'overlay' }) => {
  const set = (id: string, v: string) => { if (!readOnly) setAnswers(a => ({ ...a, [id]: v })); };
  const borderFor = (id: string): string => {
    if (results && id in results) {
      const r = results[id];
      if (r === true) return '#5fd17f';
      if (r === false) return '#ff8080';
    }
    return accent;
  };

  const faithfulSource = preview || sheet.originalImageUrl || sheet.sourceImageUrl;
  if (mode === 'rebuilt' && faithfulSource) return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #d8d0df', background: '#fff' }}>
      <img src={faithfulSource} alt="Faithful worksheet page" style={{ width: '100%', display: 'block' }} />
      {sheet.fields.map(field => {
        const bd = borderFor(field.id); const style: React.CSSProperties = { position: 'absolute', left: `${field.box.x}%`, top: `${field.box.y}%`, width: `${Math.max(field.box.width, 7)}%`, minHeight: `${Math.max(field.box.height, 3.5)}%`, boxSizing: 'border-box' };
        if (field.type === 'multiple-choice' && field.choices?.length) return <select key={field.id} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} disabled={readOnly} aria-label={field.label} style={{ ...style, border: `2px solid ${bd}`, borderRadius: 4, background: 'rgba(255,255,255,.94)', color: '#17121d', fontSize: 10 }}><option value="">Select</option>{field.choices.map(choice => <option key={choice}>{choice}</option>)}</select>;
        return <input key={field.id} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} readOnly={readOnly} aria-label={field.label} inputMode={field.type === 'numeric' ? 'decimal' : 'text'} style={{ ...style, border: `2px solid ${bd}`, borderRadius: 4, background: 'rgba(255,255,255,.94)', color: '#17121d', padding: '2px 4px', fontSize: 11, fontWeight: 650, boxShadow: '0 1px 5px rgba(0,0,0,.18)' }} />;
      })}
    </div>
  );

  if (mode === 'rebuilt' && sheet.segments?.length) return (
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
        return <input key={field.id} value={answers[field.id] || ''} onChange={event => set(field.id, event.target.value)} readOnly={readOnly} aria-label={field.label} style={{ ...style, border: `1.4px solid ${bd}`, borderRadius: 5, background: '#fff', color: '#19131f', padding: '2px 5px', fontSize: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }} />;
      })}
    </div>
  );

  if (mode === 'rebuilt') return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #ddd5e4', background: '#fff', color: '#1B1523', minHeight: 430, boxShadow: '0 14px 40px rgba(0,0,0,.2)' }}>
      <div style={{ height: 7, background: 'linear-gradient(90deg,var(--pj-purple,#6B0099),var(--pj-magenta,#D40055),var(--pj-orange,#FF8C00))' }} />
      <div style={{ padding: '24px 22px 28px' }}>
        <div style={{ color: accent, fontSize: 9, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>{sheet.subject} · {sheet.framework || 'Teacher worksheet'}</div>
        <h2 style={{ fontFamily: 'var(--font-display,Outfit,system-ui)', fontSize: 25, lineHeight: 1.08, margin: '8px 0 6px' }}>{sheet.title}</h2>
        <p style={{ color: '#6E6480', fontSize: 12, lineHeight: 1.5, margin: '0 0 20px' }}>{sheet.objective}</p>
        <div style={{ display: 'grid', gap: 16 }}>{sheet.fields.map((f, index) => { const bd = borderFor(f.id); return <label key={f.id} style={{ display: 'block' }}><span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, fontWeight: 720, marginBottom: 7 }}><span style={{ color: accent, marginRight: 7 }}>{f.ordinal || index + 1}.</span>{f.label}</span>{f.type === 'multiple-choice' && f.choices?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{f.choices.map(c => <button type="button" key={c} disabled={readOnly} onClick={() => set(f.id, c)} style={{ minHeight: 34, borderRadius: 999, padding: '0 12px', border: `1px solid ${answers[f.id] === c ? bd : '#D9D1E0'}`, background: answers[f.id] === c ? `${bd}18` : '#FAF8FC', color: '#1B1523', fontWeight: 700, cursor: readOnly ? 'default' : 'pointer' }}>{c}</button>)}</div> : f.type === 'long-text' ? <textarea value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} readOnly={readOnly} style={{ width: '100%', minHeight: 92, borderRadius: 12, border: `1.5px solid ${bd}`, background: '#FBFAFD', color: '#1B1523', padding: 10, resize: 'vertical' }} /> : <input value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} readOnly={readOnly} inputMode={f.type === 'numeric' ? 'numeric' : 'text'} style={{ width: '100%', minHeight: 40, borderRadius: 11, border: `1.5px solid ${bd}`, background: '#FBFAFD', color: '#1B1523', padding: '0 11px', fontWeight: 650 }} />}</label>; })}</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #20202c', background: '#000' }}>
      {preview
        ? <img src={preview} alt="worksheet scan" style={{ width: '100%', display: 'block', opacity: 0.9 }} />
        : <div style={{ paddingTop: '130%' }} />}
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
            inputMode={f.type === 'numeric' ? 'numeric' : 'text'}
            style={{ ...style, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '2px 4px', borderRadius: 6, border: `1.5px solid ${bd}`, background: 'rgba(0,0,0,0.6)', color: INK }} />
        );
      })}
    </div>
  );
};

export default WorksheetFillable;
