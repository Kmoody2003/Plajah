// WorksheetAssignSetup — the "set it up for me" step between a scan and Publish.
//
// · Answer key: shows where every key came from (solved from the printed problem, read off the
//   teacher's key copy, typed) and lets the teacher photograph their filled-in copy to key the rest.
// · Assign to: the teacher's REAL classes, with the likeliest one pre-picked from the sheet's grade
//   band and subject, the roster resolved, and a next-school-day due date. The demo class remains as
//   a preview-only option for teachers without a class yet.

import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Camera, Loader2, Users, CalendarDays, Check } from 'lucide-react';
import type { DigitalWorksheet } from '../../../services/worksheetDigitizer';
import { readCompletedWorksheet } from '../../../services/worksheetDigitizer';
import { prepareWorksheetImage } from '../../../services/worksheetImagePipeline';
import { applyAnswerKeyReading } from '../../../services/worksheetScanCore';
import { loadMyTeachingClasses, loadClassRoster, suggestClassFor, nextSchoolDay, type TeachingClass } from '../../../services/teacherClasses';
import { DEMO_CLASS } from '../../../data/demoClassroom';

const T = { card: '#12121a', alt: '#15151f', border: '#20202c', ink: '#fff', muted: '#9a9aa6', faint: '#808090', orange: '#FF8C00', green: '#5fd17f', gold: '#FFD24A', blue: '#36c5f0', violet: '#8166e6' };

export interface AssignTarget {
  classId: string;
  className: string;
  students: Array<{ id: string; name: string }>;
  /** Demo roster: persist the worksheet but compute (never send) notifications. */
  simulate: boolean;
  dueDate: number | null;
}

const DEMO_ID = '__demo__';
const demoTarget = (dueDate: number | null): AssignTarget => ({ classId: DEMO_CLASS.id || 'demo-4b', className: DEMO_CLASS.name, students: DEMO_CLASS.students.map(s => ({ id: s.id, name: s.name })), simulate: true, dueDate });

const toLocalInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

const WorksheetAssignSetup: React.FC<{
  sheet: DigitalWorksheet;
  onSheet: (next: DigitalWorksheet) => void;
  uid?: string;
  locked?: boolean;
  onTarget: (target: AssignTarget) => void;
  /** The class Teacher Tools is working in, preferred over the sheet-based guess. */
  preferClassId?: string;
}> = ({ sheet, onSheet, uid, locked, onTarget, preferClassId }) => {
  const [classes, setClasses] = useState<TeachingClass[] | null>(null);
  const [classId, setClassId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [roster, setRoster] = useState<Array<{ id: string; name: string }>>([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [due, setDue] = useState<number | null>(() => nextSchoolDay());
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMsg, setKeyMsg] = useState('');
  const keyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadMyTeachingClasses(uid).then(list => {
      if (!alive) return;
      setClasses(list);
      const preferred = preferClassId ? list.find(c => c.id === preferClassId) : undefined;
      if (preferred) { setClassId(preferred.id); setReason('The class you’re working in'); return; }
      const pick = suggestClassFor(sheet, list);
      if (pick) {
        setClassId(pick.id);
        const why = [sheet.gradeBand && pick.gradeBand === sheet.gradeBand ? `grade band ${pick.gradeBand}` : '', sheet.subject && new RegExp(sheet.subject.split(' ')[0], 'i').test(pick.title) ? sheet.subject : ''].filter(Boolean).join(' · ');
        setReason(why ? `Picked from the sheet: ${why}` : 'Your most active class');
      } else setClassId(DEMO_ID);
    });
    return () => { alive = false; };
    // The suggestion is made once per scan; later sheet edits don't re-pick behind the teacher's back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!classId) return;
    if (classId === DEMO_ID) { setRoster(demoTarget(due).students); return; }
    const cls = classes?.find(c => c.id === classId);
    if (!cls) return;
    let alive = true;
    setRosterBusy(true);
    void loadClassRoster(cls).then(r => { if (alive) { setRoster(r); setRosterBusy(false); } });
    return () => { alive = false; };
  }, [classId, classes]);

  useEffect(() => {
    if (!classId) return;
    if (classId === DEMO_ID) { onTarget(demoTarget(due)); return; }
    const cls = classes?.find(c => c.id === classId);
    if (cls) onTarget({ classId: cls.id, className: cls.title, students: roster, simulate: false, dueDate: due });
  }, [classId, classes, roster, due, onTarget]);

  const scanKey = async (file?: File) => {
    if (!file || keyBusy) return;
    setKeyBusy(true); setKeyMsg('Reading your answer key…');
    try {
      const prepared = await prepareWorksheetImage(file);
      const read = await readCompletedWorksheet(prepared.cleanedBase64, prepared.mimeType, sheet, { handwriting: 'auto', onProgress: setKeyMsg });
      const result = applyAnswerKeyReading(sheet, read);
      onSheet(result.sheet);
      setKeyMsg(result.applied.length
        ? `Keyed ${result.applied.length} answer${result.applied.length === 1 ? '' : 's'} from your copy${result.review.length ? ` · ${result.review.length} to double-check (highlighted gold below)` : ''}.`
        : read.message || "Couldn't read answers off that photo. Type the key below, or retake it flat and well lit.");
    } catch (error) {
      setKeyMsg(error instanceof Error ? error.message : 'Could not read that answer key.');
    } finally { setKeyBusy(false); }
  };

  const total = sheet.fields.length;
  const solved = sheet.fields.filter(f => f.keySource === 'solved' && f.correctAnswer !== undefined).length;
  const scanned = sheet.fields.filter(f => f.keySource === 'key-scan' && f.correctAnswer !== undefined).length;
  const keyed = sheet.fields.filter(f => f.correctAnswer !== undefined && !f.needsManualGrade).length;
  const open = sheet.fields.filter(f => f.type === 'long-text').length;
  const missing = Math.max(0, total - keyed - open);

  const box: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 };
  const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 };
  const input: React.CSSProperties = { width: '100%', minHeight: 44, borderRadius: 10, border: `1px solid ${T.border}`, background: '#0d0d14', color: T.ink, padding: '0 11px', fontSize: 16, font: 'inherit' };

  return (
    <>
      <div style={box}>
        <div style={{ ...eyebrow, color: T.green, display: 'flex', alignItems: 'center', gap: 6 }}><KeyRound size={13} /> Answer key · {keyed}/{total} auto-gradable</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {solved > 0 && <span style={{ fontSize: 11, padding: '4px 9px', borderRadius: 99, background: `${T.green}1c`, color: T.green, fontWeight: 700 }}>{solved} solved from the problems</span>}
          {scanned > 0 && <span style={{ fontSize: 11, padding: '4px 9px', borderRadius: 99, background: `${T.blue}1c`, color: T.blue, fontWeight: 700 }}>{scanned} from your key copy</span>}
          {open > 0 && <span style={{ fontSize: 11, padding: '4px 9px', borderRadius: 99, background: `${T.violet}1c`, color: '#c9bcf7', fontWeight: 700 }}>{open} open response · you grade</span>}
          {missing > 0 && <span style={{ fontSize: 11, padding: '4px 9px', borderRadius: 99, background: `${T.gold}1c`, color: T.gold, fontWeight: 700 }}>{missing} still need a key</span>}
        </div>
        <input ref={keyInput} type="file" accept="image/*" hidden onChange={e => { void scanKey(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        <button disabled={keyBusy || locked} onClick={() => keyInput.current?.click()} style={{ width: '100%', minHeight: 44, borderRadius: 10, border: `1px solid ${T.blue}`, background: `${T.blue}14`, color: '#bfeafb', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: keyBusy || locked ? 'default' : 'pointer', opacity: locked ? .5 : 1 }}>
          {keyBusy ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Reading key…</> : <><Camera size={15} /> Scan my filled-in answer key</>}
        </button>
        <div style={{ fontSize: 11.5, color: keyMsg ? T.muted : T.faint, marginTop: 8, lineHeight: 1.45 }}>{keyMsg || 'Photograph your own completed copy and every legible answer becomes the key. Arithmetic is already solved for you.'}</div>
      </div>

      <div style={box}>
        <div style={{ ...eyebrow, color: T.orange, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} /> Assign to</div>
        {classes === null ? (
          <div style={{ fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 7 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Finding your classes…</div>
        ) : (
          <>
            <select value={classId} disabled={locked} onChange={e => { setClassId(e.target.value); setReason(''); }} aria-label="Class" style={input}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.title}{c.gradeBand ? ` · ${c.gradeBand}` : ''} · {c.enrolledStudents.length} students</option>)}
              <option value={DEMO_ID}>{DEMO_CLASS.name} (demo · preview only)</option>
            </select>
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>
              {classId === DEMO_ID
                ? (classes.length ? 'Demo roster: the worksheet is saved, notifications are only counted.' : "You don't have a class yet — this publishes to the demo roster as a preview.")
                : rosterBusy ? 'Loading roster…' : `${roster.length} student${roster.length === 1 ? '' : 's'} + their linked guardians will be notified.${reason ? ` ${reason}.` : ''}`}
            </div>
          </>
        )}
        <label style={{ display: 'block', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 5 }}><CalendarDays size={12} /> Due</span>
          <input type="datetime-local" disabled={locked} value={due ? toLocalInput(due) : ''} onChange={e => setDue(e.target.value ? new Date(e.target.value).getTime() : null)} style={input} />
        </label>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 6, display: 'flex', gap: 5, alignItems: 'center' }}><Check size={11} /> Due dates land on each student's and parent's calendar automatically.</div>
      </div>
    </>
  );
};

export default WorksheetAssignSetup;
