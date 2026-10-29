// Course calendar: what's scheduled for one course, by due date. Tap an item to preview it or move it
// to another day. Reads the class's desk assignments (this device + the class mirror, via useClassWork).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import { rescheduleDeskAssignment, type UniversalDeskAssignment } from '../../../services/universalStudentDeskService';
import { addMonths, fromIsoDay, isoDay, monthGrid } from '../../../services/edu/courseSchedule';
import { announceWorkChanged, fmtDay, useClassWork } from '../christianEd/edWork';
import { KIND_META, kindOf } from './TelaPage';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CourseCalendar({ programs, programId, focus, onProgram, onPreview, onSchedule }: {
  programs: ChurchProgram[];
  programId: string;
  /** Month to open on (e.g. the first item just scheduled); defaults to this month. */
  focus?: Date | null;
  onProgram: (id: string) => void;
  onPreview: (unitId: string) => void;
  /** Opens the library to pick items to schedule. */
  onSchedule: () => void;
}) {
  const program = programs.find(p => p.id === programId) || programs[0] || null;
  const one = useMemo(() => (program ? [program] : []), [program]);
  const { work, loading } = useClassWork(one, { asTeacher: true });
  const items = useMemo(() => (program ? work[program.id]?.assignments || [] : []), [work, program]);
  const [month, setMonth] = useState(() => focus || new Date());
  const [sel, setSel] = useState<UniversalDeskAssignment | null>(null);
  const [moved, setMoved] = useState('');
  // The selected item's bar sits under the month: bring it into view when an item is tapped.
  const selRef = useRef<HTMLDivElement>(null);
  const selId = sel?.id;
  useEffect(() => { if (selId) selRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selId]);

  const cells = useMemo(() => monthGrid(month, program?.meetingSchedule), [month, program?.meetingSchedule]);
  const byDay = useMemo(() => {
    const m: Record<string, UniversalDeskAssignment[]> = {};
    for (const a of items) (m[isoDay(new Date(a.dueAt))] ||= []).push(a);
    return m;
  }, [items]);
  const inMonth = useMemo(
    () => items.filter(a => { const d = new Date(a.dueAt); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); }).sort((a, b) => a.dueAt - b.dueAt),
    [items, month],
  );

  const moveTo = (a: UniversalDeskAssignment, iso: string) => {
    const due = fromIsoDay(iso);
    const lead = a.opensAt ? Math.round((a.dueAt - a.opensAt) / 86_400_000) : 0;
    const next = rescheduleDeskAssignment(a.id, { dueAt: due.getTime(), dueLabel: `Due ${fmtDay(due)}`, opensAt: lead ? due.getTime() - lead * 86_400_000 : null });
    if (next) {
      setSel(next);
      setMoved(`Moved to ${fmtDay(due)}.`);
      announceWorkChanged();
    }
  };

  if (!program) {
    return <div className="lib-empty"><h3>No courses yet</h3><p className="dim">Make a class in Christian Education, then schedule library work for it.</p></div>;
  }

  return (
    <div className="lib-calview">
      <div className="row wrap">
        <div className="chips grow" role="group" aria-label="Course">
          {programs.map(p => (
            <button key={p.id} type="button" className="chip" aria-pressed={p.id === program.id} onClick={() => { onProgram(p.id); setSel(null); }}>{p.name}</button>
          ))}
        </div>
        <button type="button" className="btn sm" onClick={onSchedule}>+ Schedule work</button>
      </div>

      <div className="row">
        <button type="button" className="btn sm" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}>‹</button>
        <h3 className="lib-month grow" style={{ textAlign: 'center' }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button type="button" className="btn sm" onClick={() => setMonth(new Date())}>Today</button>
        <button type="button" className="btn sm" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}>›</button>
      </div>

      <div className="lib-cal big" role="grid" aria-label={`${program.name} calendar`}>
        {WEEKDAYS.map(d => <div key={d} className="lib-cal-wd" aria-hidden>{d}</div>)}
        {cells.map(c => (
          <div key={c.iso} role="gridcell" className={`lib-cal-d${c.inMonth ? '' : ' out'}${c.isToday ? ' today' : ''}${c.isMeeting ? ' meet' : ''}`}>
            <span className="lib-cal-n">{c.date.getDate()}</span>
            {(byDay[c.iso] || []).map(a => (
              <button key={a.id} type="button" className={`lib-pill${sel?.id === a.id ? ' on' : ''}`} style={{ ['--k' as string]: KIND_META[kindOf(a.unitSnapshot)].color }} title={a.title} onClick={() => setSel(a)}>
                {a.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      {sel && (
        <div ref={selRef} className="lib-calsel" role="region" aria-label="Selected item">
          <span className="lib-dot" style={{ background: KIND_META[kindOf(sel.unitSnapshot)].color }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="t">{sel.title}</div>
            <div className="small">
              Due {fmtDay(new Date(sel.dueAt))}
              {sel.opensAt && sel.opensAt > Date.now() ? ` · students see it ${fmtDay(new Date(sel.opensAt))}` : ' · on desks now'}
              {moved ? ` · ${moved}` : ''}
            </div>
          </div>
          <label className="lbl" style={{ minWidth: 150 }}>
            Move to
            <input type="date" className="field" value={isoDay(new Date(sel.dueAt))} onChange={e => e.target.value && moveTo(sel, e.target.value)} />
          </label>
          <button type="button" className="btn sm" onClick={() => onPreview(sel.unitId)}>Preview</button>
          <button type="button" className="btn sm" aria-label="Close" onClick={() => { setSel(null); setMoved(''); }}>✕</button>
        </div>
      )}

      <div className="lib-agenda">
        <div className="small">{loading ? 'Loading…' : inMonth.length ? `${inMonth.length} due this month` : 'Nothing due this month.'}</div>
        {inMonth.map(a => (
          <button key={a.id} type="button" className="lib-agenda-r" onClick={() => setSel(a)}>
            <span className="lib-agenda-d">{new Date(a.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
            <span className="lib-dot" style={{ background: KIND_META[kindOf(a.unitSnapshot)].color }} />
            <span className="grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
            {a.opensAt && a.opensAt > Date.now() && <span className="tag soon">Opens {new Date(a.opensAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
