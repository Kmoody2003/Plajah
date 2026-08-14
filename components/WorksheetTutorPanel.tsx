// WorksheetTutorPanel — the in-worksheet Plajah tutor UI.
//
// Reusable, self-contained chat panel that helps a student on a worksheet question. It calls the real
// worksheetTutorService (which knows the answer key but only guides), escalates hints, checks a typed
// answer locally, and exposes the digital hand-raise. Used teacher-side today (preview the tutor on a
// scanned worksheet) and drops into the student assignment view unchanged.

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Lightbulb, HelpCircle, Hand, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { tutorReply, type TutorTurn, type TutorMode } from '../services/worksheetTutorService';
import type { DigitalWorksheet, WorksheetField } from '../services/worksheetDigitizer';

const C = {
  card: '#12121a', alt: '#15151f', border: '#20202c', ink: '#fff', muted: '#9a9aa6', faint: '#777',
  green: '#5fd17f', gold: '#FFD24A', red: '#ff8080',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const norm = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const fieldCorrect = (f: WorksheetField, v: string): boolean => {
  if (f.correctAnswer === undefined || v.trim() === '') return false;
  if (f.type === 'numeric') {
    const a = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    const b = parseFloat(String(f.correctAnswer).replace(/[^0-9.\-]/g, ''));
    return !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) <= (f.tolerance || 0);
  }
  return norm(v) === norm(String(f.correctAnswer));
};

export interface WorksheetTutorPanelProps {
  sheet: DigitalWorksheet;
  accent?: string;
  /** Fires when the student raises their hand (wire to alert teacher + parent). */
  onRaiseHand?: (field: WorksheetField) => void;
  /** Optional: start on a specific field. */
  activeFieldId?: string;
}

const WorksheetTutorPanel: React.FC<WorksheetTutorPanelProps> = ({ sheet, accent = '#FF8C00', onRaiseHand, activeFieldId }) => {
  const fields = sheet.fields;
  const [fieldId, setFieldId] = useState(activeFieldId || fields[0]?.id || '');
  const field = fields.find(f => f.id === fieldId) || fields[0];
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [raised, setRaised] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when switching questions.
  useEffect(() => {
    setTurns(field ? [{ role: 'tutor', text: `Hi! I'm here to help with "${field.label}". I won't just tell you the answer — I'll help you get there. Tap Hint or ask me anything.` }] : []);
    setInput(''); setAnswer(''); setHintLevel(0); setRaised(false);
  }, [fieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, busy]);

  if (!field) return null;

  const ask = async (studentMessage: string, mode: TutorMode, showStudent = true) => {
    if (busy) return;
    const history = turns;
    if (showStudent) setTurns(t => [...t, { role: 'student', text: studentMessage }]);
    setBusy(true);
    const reply = await tutorReply({
      field: { label: field.label, type: field.type, correctAnswer: field.correctAnswer, choices: field.choices },
      subject: sheet.subject, gradeBand: sheet.gradeBand,
      studentMessage, history, mode, hintLevel,
    });
    if (mode === 'hint') setHintLevel(h => h + 1);
    setTurns(t => [...t, { role: 'tutor', text: reply }]);
    setBusy(false);
  };

  const send = () => { const v = input.trim(); if (!v) return; setInput(''); ask(v, 'chat'); };
  const checkAnswer = () => {
    if (!answer.trim()) return;
    if (fieldCorrect(field, answer)) {
      setTurns(t => [...t, { role: 'student', text: `My answer: ${answer}` }, { role: 'tutor', text: `That's it — nice work! You reasoned all the way to it. 🎉` }]);
    } else {
      ask(`I think the answer is ${answer}. Is that right?`, 'chat');
    }
  };
  const raise = () => { setRaised(true); onRaiseHand?.(field); setTurns(t => [...t, { role: 'tutor', text: `I've raised your hand — your teacher and parent have been alerted. Want a hint while you wait?` }]); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: 14, background: C.card, overflow: 'hidden', fontFamily: C.font, minHeight: 360 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: `${accent}22`, color: accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Sparkles size={15} /></span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>Plajah tutor</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.green, fontWeight: 700 }}>● on this problem</span>
      </div>

      {/* question selector (only if >1) */}
      {fields.length > 1 && (
        <div style={{ padding: '8px 13px', borderBottom: `1px solid ${C.border}` }}>
          <select value={fieldId} onChange={e => setFieldId(e.target.value)} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.alt, color: C.ink, fontSize: 12, fontFamily: C.font }}>
            {fields.map((f, i) => <option key={f.id} value={f.id}>{i + 1}. {f.label.slice(0, 48)}{f.label.length > 48 ? '…' : ''}</option>)}
          </select>
        </div>
      )}

      {/* chat */}
      <div ref={scrollRef} style={{ flex: 1, padding: 13, display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', maxHeight: 300 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ alignSelf: t.role === 'student' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '8px 11px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.5, background: t.role === 'student' ? `${accent}26` : C.alt, border: `1px solid ${t.role === 'student' ? 'transparent' : C.border}`, color: C.ink }}>{t.text}</div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', padding: '8px 11px', fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> thinking…</div>}
      </div>

      {/* answer check */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 13px', borderTop: `1px solid ${C.border}` }}>
        <input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkAnswer()} placeholder="check your answer" inputMode={field.type === 'numeric' ? 'numeric' : 'text'} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.alt, color: C.ink, fontSize: 12.5, fontFamily: C.font }} />
        <button onClick={checkAnswer} style={{ cursor: 'pointer', padding: '0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.green, fontWeight: 800, fontSize: 11 }}>Check</button>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 6, padding: '9px 13px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <TutorBtn onClick={() => ask('(asked for a hint)', 'hint', false)} icon={Lightbulb} label="Hint" accent={accent} disabled={busy} />
        <TutorBtn onClick={() => ask('Explain the idea', 'explain')} icon={HelpCircle} label="Explain" accent={accent} disabled={busy} />
        <TutorBtn onClick={() => ask("I'm stuck", 'stuck')} icon={AlertCircle} label="Stuck" accent={accent} disabled={busy} />
        <button onClick={raise} disabled={raised} style={{ cursor: raised ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8, border: `1px solid ${raised ? C.gold : C.border}`, background: raised ? `${C.gold}1f` : 'transparent', color: C.gold, fontSize: 11, fontWeight: 700 }}>
          {raised ? <CheckCircle2 size={13} /> : <Hand size={13} />} {raised ? 'Hand raised' : 'Raise hand'}
        </button>
      </div>

      {/* free input */}
      <div style={{ display: 'flex', gap: 6, padding: '0 13px 12px' }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask Plajah…" style={{ flex: 1, padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.alt, color: C.ink, fontSize: 12.5, fontFamily: C.font }} />
        <button onClick={send} disabled={busy || !input.trim()} style={{ cursor: busy || !input.trim() ? 'default' : 'pointer', padding: '0 13px', borderRadius: 9, border: 'none', background: accent, color: '#1a1a1a', fontWeight: 800, opacity: busy || !input.trim() ? 0.5 : 1 }}><Send size={15} /></button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const TutorBtn: React.FC<{ onClick: () => void; icon: any; label: string; accent: string; disabled?: boolean }> = ({ onClick, icon: Icon, label, accent, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: accent, fontSize: 11, fontWeight: 700, opacity: disabled ? 0.5 : 1 }}>
    <Icon size={13} /> {label}
  </button>
);

export default WorksheetTutorPanel;
