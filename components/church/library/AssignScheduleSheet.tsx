// Assign & schedule: put several lesson-library items (assignments, quizzes, exams, resources) on one
// course's student desks at once, each with its own due date laid out on the course calendar.
//   1. Course   2. Spread (start day + one per class meeting / week / day / all on one day)
//   3. Calendar — tap an item, then a day, to move it; or set its date in the list
//   4. When students see each one, desk tools, optional course-plan weeks → Schedule
import React, { useEffect, useMemo, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import { assignUnitToClassroomDesk, listDeskAssignments, type DeskAssignmentToolsConfig } from '../../../services/universalStudentDeskService';
import { CADENCE_LABEL, addMonths, fromIsoDay, isoDay, monthGrid, opensBefore, spreadDates, type Cadence } from '../../../services/edu/courseSchedule';
import { announceWorkChanged, fmtDay } from '../christianEd/edWork';
import { KIND_META, kindOf } from './TelaPage';

const TOOLS: Array<[keyof DeskAssignmentToolsConfig, string]> = [
  ['allowSelfCheckBeforeTurnIn', 'Check my work'],
  ['allowHandRaiseQuestion', 'Ask the teacher'],
  ['allowScratchpadNotes', 'Scratchpad'],
  ['allowSacredLibraryAndReferences', 'Sacred Library'],
];
const LEADS: Array<[number, string]> = [[0, 'Right away'], [1, 'The day before'], [3, '3 days before'], [7, 'A week before']];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface ScheduledResult {
  programId: string;
  programName: string;
  count: number;
  first: Date;
  last: Date;
}

export default function AssignScheduleSheet({ units, programs, orgId, orgName, domain, teacher, onClose, onDone, onSaveProgram }: {
  units: IngestedCurriculumUnit[];
  programs: ChurchProgram[];
  orgId: string;
  orgName: string;
  domain: 'CHRISTIAN_EDUCATION' | 'ACADEMIA';
  teacher: { uid: string; name: string };
  onClose: () => void;
  onDone: (r: ScheduledResult) => void;
  /** When given, "Add to the course plan" files each item under the class's weeks too. */
  onSaveProgram?: (p: ChurchProgram) => Promise<void>;
}) {
  const [programId, setProgramId] = useState(programs.length === 1 ? programs[0].id : '');
  const program = programs.find(p => p.id === programId) || null;
  const [start, setStart] = useState(isoDay(new Date()));
  const [cadence, setCadence] = useState<Cadence>('meetings');
  const [order, setOrder] = useState(() => units.map(u => u.id));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [lead, setLead] = useState(3);
  const [tools, setTools] = useState<Record<keyof DeskAssignmentToolsConfig, boolean>>({
    allowSelfCheckBeforeTurnIn: true,
    allowHandRaiseQuestion: true,
    allowScratchpadNotes: false,
    allowSacredLibraryAndReferences: true,
  });
  const [addToPlan, setAddToPlan] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const byId = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);
  const auto = useMemo(() => spreadDates(order.length, fromIsoDay(start), cadence, program?.meetingSchedule), [order.length, start, cadence, program?.meetingSchedule]);
  const dates = useMemo(() => Object.fromEntries(order.map((id, i) => [id, overrides[id] ? fromIsoDay(overrides[id]) : auto[i]])), [order, overrides, auto]);
  // Show the month the first item lands in whenever the spread changes.
  const firstDue = auto[0]?.getTime();
  useEffect(() => { if (firstDue) setMonth(new Date(firstDue)); }, [firstDue]);
  const already = useMemo(() => {
    if (!program) return new Set<string>();
    const ids = new Set(listDeskAssignments({ classroomId: program.id }).map(a => a.unitId));
    return new Set(order.filter(id => ids.has(id)));
  }, [program, order]);
  const cells = useMemo(() => monthGrid(month, program?.meetingSchedule), [month, program?.meetingSchedule]);
  const onDay = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const id of order) (m[isoDay(dates[id])] ||= []).push(id);
    return m;
  }, [order, dates]);
  const withAccounts = (program?.students || []).filter(s => s.uid).length;

  const move = (id: string, by: number) => setOrder(o => {
    const i = o.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const n = [...o];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const setDay = (id: string, iso: string) => setOverrides(o => ({ ...o, [id]: iso }));
  const respread = () => setOverrides({});

  const send = async () => {
    if (!program) return;
    setBusy(true);
    setErr('');
    try {
      for (const id of order) {
        const unit = byId.get(id);
        if (!unit) continue;
        const due = dates[id];
        assignUnitToClassroomDesk({
          unit,
          domain,
          orgId,
          orgName,
          classroomId: program.id,
          classroomName: program.name,
          dueAt: due.getTime(),
          dueLabel: `Due ${fmtDay(due)}`,
          opensAt: opensBefore(due, lead)?.getTime(),
          assignedByUid: teacher.uid,
          assignedByName: teacher.name,
          toolsConfig: tools,
        });
      }
      if (addToPlan && onSaveProgram && program.weeks.length) {
        // One item per week from the week the class is on now; the rest go on the last week.
        const cur = Math.min(Math.max(program.currentWeek ?? 0, 0), program.weeks.length - 1);
        const weeks = program.weeks.map(w => ({ ...w, unitIds: [...(w.unitIds || [])] }));
        order.forEach((id, i) => {
          const w = weeks[Math.min(cur + i, weeks.length - 1)];
          if (!w.unitIds.includes(id)) w.unitIds.push(id);
        });
        await onSaveProgram({ ...program, weeks });
      }
      announceWorkChanged();
      const sorted = order.map(id => dates[id]).sort((a, b) => a.getTime() - b.getTime());
      onDone({ programId: program.id, programName: program.name, count: order.length, first: sorted[0], last: sorted[sorted.length - 1] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t schedule these. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lib-sheet" role="dialog" aria-modal="true" aria-label="Assign and schedule" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="lib-sheet-h">
        <div className="grow">
          <div className="eyebrow">Assign &amp; schedule</div>
          <h3>{order.length} item{order.length === 1 ? '' : 's'}{program ? ` → ${program.name}` : ''}</h3>
        </div>
        <button type="button" className="btn sm" onClick={onClose} autoFocus>Cancel</button>
      </div>

      <div className="lib-sheet-b">
        <section className="lib-step">
          <div className="lib-step-n">1</div>
          <div className="stack grow">
            <div className="lib-step-t">Course</div>
            {programs.length === 0 ? (
              <div className="err">No courses yet. Make a class in Christian Education first, then schedule work for it here.</div>
            ) : (
              <div className="chips">
                {programs.map(p => (
                  <button key={p.id} type="button" className="chip" aria-pressed={p.id === programId} onClick={() => setProgramId(p.id)}>
                    {p.name}
                    <span className="lib-chip-sub">{(p.students || []).length} students{p.meetingSchedule ? ` · ${p.meetingSchedule}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {program && withAccounts === 0 && (
              <div className="err">Nobody in {program.name} has a Plajah account yet, so no desk will get these. Add students in People first.</div>
            )}
          </div>
        </section>

        <section className="lib-step" aria-disabled={!program}>
          <div className="lib-step-n">2</div>
          <div className="stack grow">
            <div className="lib-step-t">Spread them out</div>
            <div className="row wrap">
              <label className="lbl">
                Starting
                <input type="date" className="field" value={start} onChange={e => { if (e.target.value) { setStart(e.target.value); respread(); } }} style={{ maxWidth: 190 }} />
              </label>
              <div className="chips" role="group" aria-label="How to space them">
                {(Object.keys(CADENCE_LABEL) as Cadence[]).map(c => (
                  <button key={c} type="button" className="chip" aria-pressed={cadence === c} onClick={() => { setCadence(c); respread(); }}>
                    {c === 'meetings' && program?.meetingSchedule ? `Each class (${program.meetingSchedule.split(/[·,]/)[0].trim()})` : CADENCE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lib-step">
          <div className="lib-step-n">3</div>
          <div className="stack grow">
            <div className="row">
              <div className="lib-step-t grow">Calendar</div>
              <button type="button" className="btn sm" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}>‹</button>
              <span className="lib-month">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <button type="button" className="btn sm" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}>›</button>
            </div>
            <div className="small">{picked ? `Now tap the day for “${byId.get(picked)?.title}”.` : 'Tap an item, then a day, to move it.'}{program?.meetingSchedule ? ' Class days are outlined.' : ''}</div>
            <div className="lib-cal" role="grid" aria-label="Course calendar">
              {WEEKDAYS.map((d, i) => <div key={i} className="lib-cal-wd" aria-hidden>{d}</div>)}
              {cells.map(c => (
                <button key={c.iso} type="button" role="gridcell"
                  className={`lib-cal-d${c.inMonth ? '' : ' out'}${c.isToday ? ' today' : ''}${c.isMeeting ? ' meet' : ''}${picked ? ' target' : ''}`}
                  aria-label={`${c.date.toDateString()}${onDay[c.iso]?.length ? `, ${onDay[c.iso].length} due` : ''}`}
                  onClick={() => { if (picked) { setDay(picked, c.iso); setPicked(null); } }}>
                  <span className="lib-cal-n">{c.date.getDate()}</span>
                  {(onDay[c.iso] || []).map(id => {
                    const u = byId.get(id)!;
                    return (
                      <span key={id} className={`lib-pill${picked === id ? ' on' : ''}`} style={{ ['--k' as string]: KIND_META[kindOf(u)].color }}
                        role="button" tabIndex={0} title={u.title}
                        onClick={e => { e.stopPropagation(); setPicked(p => (p === id ? null : id)); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPicked(p => (p === id ? null : id)); } }}>
                        {u.title}
                      </span>
                    );
                  })}
                </button>
              ))}
            </div>

            <ol className="lib-order">
              {order.map((id, i) => {
                const u = byId.get(id);
                if (!u) return null;
                return (
                  <li key={id} className={picked === id ? 'on' : ''}>
                    <span className="lib-dot" style={{ background: KIND_META[kindOf(u)].color }} />
                    <button type="button" className="lib-order-t" onClick={() => setPicked(p => (p === id ? null : id))}>
                      {u.title}
                      {already.has(id) && <span className="tag soon">Already on {program?.name} — this moves it</span>}
                    </button>
                    <input type="date" className="field lib-order-d" aria-label={`Due date for ${u.title}`} value={isoDay(dates[id])} onChange={e => e.target.value && setDay(id, e.target.value)} />
                    <span className="lib-order-mv">
                      <button type="button" className="btn sm" aria-label="Earlier in the order" disabled={i === 0} onClick={() => move(id, -1)}>↑</button>
                      <button type="button" className="btn sm" aria-label="Later in the order" disabled={i === order.length - 1} onClick={() => move(id, 1)}>↓</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            {Object.keys(overrides).length > 0 && <button type="button" className="btn link sm" style={{ justifySelf: 'start' }} onClick={respread}>Reset to the even spread</button>}
          </div>
        </section>

        <section className="lib-step">
          <div className="lib-step-n">4</div>
          <div className="stack grow">
            <div className="lib-step-t">Students see each one</div>
            <div className="chips" role="group" aria-label="When students see each item">
              {LEADS.map(([d, l]) => (
                <button key={d} type="button" className="chip" aria-pressed={lead === d} onClick={() => setLead(d)}>{l}{d ? ' it’s due' : ''}</button>
              ))}
            </div>
            <div className="small">Desk tools</div>
            <div className="chips">
              {TOOLS.map(([k, label]) => (
                <button key={k} type="button" className="chip" aria-pressed={tools[k]} onClick={() => setTools(t => ({ ...t, [k]: !t[k] }))}>{label}</button>
              ))}
            </div>
            {onSaveProgram && program && program.weeks.length > 0 && (
              <label className="lib-check">
                <input type="checkbox" checked={addToPlan} onChange={e => setAddToPlan(e.target.checked)} />
                Also add them to the course plan, one per week from week {Math.min((program.currentWeek ?? 0) + 1, program.weeks.length)}
              </label>
            )}
          </div>
        </section>
        {err && <div className="err">{err}</div>}
      </div>

      <div className="lib-sheet-f">
        <span className="small grow">
          {program && order.length > 0 ? `${fmtDay(Object.values(dates).sort((a, b) => a.getTime() - b.getTime())[0])} → ${fmtDay(Object.values(dates).sort((a, b) => b.getTime() - a.getTime())[0])}` : 'Pick a course'}
        </span>
        <button type="button" className="btn p" disabled={!program || busy || order.length === 0} onClick={() => void send()}>
          {busy ? 'Scheduling…' : `Schedule ${order.length} for ${program?.name || 'the course'}`}
        </button>
      </div>
    </div>
  );
}
