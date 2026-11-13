// Teacher tools for an assignment's timing in a Christian Ed class: the dates and after-due rule of each
// assignment, the students' extension requests, and the class ledger that records all of it.
// Styles come from the class page (.ce .card / .btn / .tag / .field).
import React, { useEffect, useState } from 'react';
import { CalendarClock, History, Hourglass, Lock } from 'lucide-react';
import { mergeRemoteDeskAssignments, rescheduleDeskAssignment, type UniversalDeskAssignment } from '../../../services/universalStudentDeskService';
import { AFTER_DUE_LABEL, afterDueOf, dueLabelFor, fmtWhen, type AfterDue } from '../../../services/edu/assignmentPolicy';
import { decideExtension, fetchClassExtensions, type ExtensionRequest } from '../../../services/edu/extensions';
import { fetchClassLedger, LEDGER_LABEL, type LedgerEntry } from '../../../services/edu/eduLedger';
import { isoDay } from '../../../services/edu/courseSchedule';

const DAY = 86_400_000;
const toInput = (t?: number | null) => (t ? isoDay(new Date(t)) : '');
/** A yyyy-mm-dd day at a set hour (opens in the morning, due at the end of the day). */
const fromInput = (s: string, hour: number) => (s ? new Date(`${s}T${String(hour).padStart(2, '0')}:00`).getTime() : 0);

/** One line under an assignment: when students can open it, its class date, due date and after-due rule. */
export function datesLine(a: UniversalDeskAssignment): string {
  const parts = [
    a.opensAt && a.opensAt > Date.now() ? `Opens ${fmtWhen(a.opensAt)}` : 'Open now',
    a.scheduledFor ? `Class ${fmtWhen(a.scheduledFor)}` : '',
    `Due ${fmtWhen(a.dueAt)}`,
    afterDueOf(a) === 'accept_late' ? 'late accepted' : 'locks after due',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Edit an assignment's three dates and its after-due rule. Every change goes to the class ledger. */
export const AssignmentDatesEditor: React.FC<{ a: UniversalDeskAssignment; onDone: () => void }> = ({ a, onDone }) => {
  const [opens, setOpens] = useState(toInput(a.opensAt));
  const [cls, setCls] = useState(toInput(a.scheduledFor));
  const [due, setDue] = useState(toInput(a.dueAt));
  const [after, setAfter] = useState<AfterDue>(afterDueOf(a));
  const [err, setErr] = useState('');

  const save = () => {
    const dueAt = fromInput(due, 23) + 59 * 60_000; // end of the due day
    const opensAt = fromInput(opens, 7);
    const scheduledFor = fromInput(cls, 9);
    if (!dueAt) { setErr('Pick a due date.'); return; }
    if (opensAt && opensAt > dueAt) { setErr('It has to open before it’s due.'); return; }
    // The teacher's device may only have the class copy; put it on this desk first so it can be moved.
    mergeRemoteDeskAssignments([a]);
    const next = rescheduleDeskAssignment(a.id, { dueAt, dueLabel: dueLabelFor(dueAt), opensAt: opensAt || null, scheduledFor: scheduledFor || null, afterDue: after });
    if (!next) { setErr('Couldn’t change it on this device. Refresh and try again.'); return; }
    onDone();
  };

  return (
    <div className="card" style={{ background: 'rgba(0,0,0,.25)' }}>
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '.72rem' }}>
          Students can open it
          <input type="date" className="field" value={opens} onChange={e => setOpens(e.target.value)} max={due || undefined} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '.72rem' }}>
          Class date
          <input type="date" className="field" value={cls} onChange={e => setCls(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '.72rem' }}>
          Due
          <input type="date" className="field" value={due} onChange={e => setDue(e.target.value)} min={opens || undefined} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '.72rem', minWidth: 220 }}>
          After the due date
          <select className="field" value={after} onChange={e => setAfter(e.target.value as AfterDue)}>
            {(Object.keys(AFTER_DUE_LABEL) as AfterDue[]).map(k => <option key={k} value={k}>{AFTER_DUE_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="u" style={{ color: '#ff7aa8' }}>{err}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm p" onClick={save}>Save dates</button>
        <button type="button" className="btn sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
};

/** Students' extension requests waiting on the teacher, with Grant (pick the new deadline) and Deny. */
export const ExtensionRequestsPanel: React.FC<{ programId: string; assignments: UniversalDeskAssignment[]; onChanged?: () => void }> = ({ programId, assignments, onChanged }) => {
  const [list, setList] = useState<ExtensionRequest[]>([]);
  const [until, setUntil] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { void fetchClassExtensions(programId).then(setList); }, [programId]);

  const waiting = list.filter(r => r.status === 'requested');
  if (!waiting.length) return null;

  const decide = async (r: ExtensionRequest, grant: boolean) => {
    setBusy(r.id); setErr('');
    try {
      const day = until[r.id] || isoDay(new Date(Date.now() + 2 * DAY));
      const next = await decideExtension(r, grant, grant ? fromInput(day, 23) + 59 * 60_000 : null, note[r.id] || '');
      setList(l => l.map(x => (x.id === r.id ? next : x)));
      onChanged?.();
    } catch {
      setErr('Couldn’t save that. Check you teach this class and try again.');
    }
    setBusy('');
  };

  return (
    <div className="card">
      <div className="row"><Hourglass size={16} /><div className="t grow">{waiting.length} extension request{waiting.length === 1 ? '' : 's'}</div></div>
      {waiting.map(r => {
        const a = assignments.find(x => x.id === r.assignmentId);
        return (
          <div key={r.id} className="card" style={{ background: 'rgba(0,0,0,.25)' }}>
            <div className="t">{r.studentName} · {r.assignmentTitle}</div>
            <div className="u">Asked {fmtWhen(r.requestedAt)}{a ? ` · was due ${fmtWhen(a.dueAt)}` : ''}</div>
            <div className="u" style={{ whiteSpace: 'pre-wrap' }}>“{r.reason}”</div>
            <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: '.72rem' }}>
                New due date
                <input type="date" className="field" value={until[r.id] || isoDay(new Date(Date.now() + 2 * DAY))} min={isoDay(new Date())} onChange={e => setUntil(u => ({ ...u, [r.id]: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: '.72rem', flex: 1, minWidth: 160 }}>
                Note to the student (optional)
                <input className="field" value={note[r.id] || ''} maxLength={500} onChange={e => setNote(n => ({ ...n, [r.id]: e.target.value }))} />
              </label>
              <button type="button" className="btn sm p" disabled={busy === r.id} onClick={() => decide(r, true)}>Grant</button>
              <button type="button" className="btn sm" disabled={busy === r.id} onClick={() => decide(r, false)}>Deny</button>
            </div>
          </div>
        );
      })}
      {err && <div className="u" style={{ color: '#ff7aa8' }}>{err}</div>}
    </div>
  );
};

const detailText = (e: LedgerEntry): string => {
  const d = e.detail || {};
  const bits: string[] = [];
  if (typeof d.opensAt === 'number') bits.push(`opens ${fmtWhen(d.opensAt)}`);
  if (typeof d.scheduledFor === 'number') bits.push(`class ${fmtWhen(d.scheduledFor)}`);
  if (typeof d.dueAt === 'number' && e.event !== 'turned_in' && e.event !== 'turned_in_late') bits.push(`due ${fmtWhen(d.dueAt)}`);
  if (typeof d.previousDueAt === 'number' && d.previousDueAt !== d.dueAt) bits.push(`was due ${fmtWhen(d.previousDueAt)}`);
  if (d.afterDue && (e.event === 'policy_changed' || e.event === 'assigned' || e.event === 'auto_scheduled')) bits.push(d.afterDue === 'accept_late' ? 'late accepted' : 'locks after due');
  if (typeof d.extendedUntil === 'number') bits.push(`until ${fmtWhen(d.extendedUntil)}`);
  if (typeof d.percentage === 'number') bits.push(`${d.percentage}%`);
  if (typeof d.reason === 'string' && d.reason) bits.push(`“${d.reason}”`);
  if (typeof d.note === 'string' && d.note) bits.push(`note: “${d.note}”`);
  return bits.join(' · ');
};

/** The class ledger: every scheduling, turn-in and extension event, newest first. Read-only by design. */
export const ClassLedgerPanel: React.FC<{ programId: string; refreshKey?: number }> = ({ programId, refreshKey }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);
  useEffect(() => { if (open) void fetchClassLedger(programId).then(setRows); }, [open, programId, refreshKey]);
  return (
    <div className="card">
      <button type="button" className="row" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        <History size={16} /><div className="t grow">Class ledger</div><span className="u">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="u">Every assignment, date change, turn-in and extension in this class. Entries can’t be edited or deleted.</div>
          {rows === null && <div className="u">Loading…</div>}
          {rows?.length === 0 && <div className="u">Nothing recorded yet.</div>}
          {rows?.slice(0, 200).map(e => (
            <div key={e.id} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: '.78rem' }}>
              {e.event === 'turn_in_refused' ? <Lock size={13} /> : <CalendarClock size={13} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div><strong>{LEDGER_LABEL[e.event] || e.event}</strong> · {e.assignmentTitle || e.assignmentId}</div>
                <div className="u">{e.actorName}{detailText(e) ? ` · ${detailText(e)}` : ''}</div>
              </div>
              <span className="u" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
