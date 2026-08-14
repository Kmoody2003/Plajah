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
}

const WorksheetFillable: React.FC<WorksheetFillableProps> = ({ sheet, preview, answers, setAnswers, accent = '#FF8C00', results, readOnly }) => {
  const set = (id: string, v: string) => { if (!readOnly) setAnswers(a => ({ ...a, [id]: v })); };
  const borderFor = (id: string): string => {
    if (results && id in results) {
      const r = results[id];
      if (r === true) return '#5fd17f';
      if (r === false) return '#ff8080';
    }
    return accent;
  };

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
