// Course calendar: what's scheduled for one course, on each item's class date (else its due date). Tap an
// item to preview it or change its dates; right-click (or long-press) it for quick moves, when students can
// open it and what happens after it's due. "Auto-schedule" lays the course plan's unscheduled lessons onto
// the next class meetings. Works for Christian Ed courses and a teacher's own Academia classes (courseSource);
// the after-due rule and the auto-scheduler's open/due offsets are Christian Ed only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, fromIsoDay, isoDay, monthGrid } from '../../../services/edu/courseSchedule';
import { AFTER_DUE_LABEL, afterDueOf, autoSchedule, endOfDay, type AfterDue } from '../../../services/edu/assignmentPolicy';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import useContextMenu, { type MenuNode } from '../../ui/ContextMenu';
import { announceWorkChanged, fmtDay } from '../christianEd/edWork';
import { KIND_META } from './TelaPage';
import { calendarDay, type CourseItem, type CourseSource, type ScheduleCourse } from './courseSource';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86_400_000;
const colorOf = (kind?: string) =>
  (KIND_META as Record<string, { color: string }>)[kind || '']?.color || (kind === 'QUIZ' || kind === 'TEST' ? KIND_META.QUIZ_EXAM.color : KIND_META.ASSIGNMENT.color);
const LEADS: Array<[number, string]> = [[0, 'Right away'], [1, 'The day before'], [3, '3 days before'], [7, 'A week before']];
const DUE_AFTER: Array<[number, string]> = [[0, 'On the class date'], [1, 'The day after'], [7, 'A week after']];
const DEFAULT_TOOLS = { allowSelfCheckBeforeTurnIn: true, allowHandRaiseQuestion: true, allowScratchpadNotes: false, allowSacredLibraryAndReferences: true };

/** Days between when it opens and its class date (how far ahead students get it). */
const leadOf = (a: CourseItem) => (a.opensAt ? Math.max(0, Math.round((calendarDay(a) - a.opensAt) / DAY)) : 0);
/** Days from the class date to the due date. */
const dueAfterOf = (a: CourseItem) => (a.scheduledFor ? Math.max(0, Math.round((new Date(a.dueAt).setHours(9, 0, 0, 0) - new Date(a.scheduledFor).setHours(9, 0, 0, 0)) / DAY)) : 0);

export default function CourseCalendar({ source, programId, focus, onProgram, onPreview, onSchedule, units = [] }: {
  source: CourseSource;
  programId: string;
  /** Month to open on (e.g. the first item just scheduled); defaults to this month. */
  focus?: Date | null;
  onProgram: (id: string) => void;
  onPreview: (unitId: string) => void;
  /** Opens the library to pick items to schedule. */
  onSchedule: () => void;
  /** The library's lessons, so the course plan's unscheduled ones can be auto-scheduled. */
  units?: IngestedCurriculumUnit[];
}) {
  const programs = source.courses;
  const program = programs.find(p => p.id === programId) || programs[0] || null;
  const ce = program?.kind === 'CHRISTIAN_EDUCATION';
  const [items, setItems] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!program) { setItems([]); return; }
    setLoading(true);
    try { setItems(await source.list(program)); } catch { setItems([]); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, source.kind]);
  useEffect(() => { void refresh(); }, [refresh]);
  const [month, setMonth] = useState(() => focus || new Date());
  const [sel, setSel] = useState<CourseItem | null>(null);
  const [moved, setMoved] = useState('');
  // The selected item's bar sits under the month: bring it into view when an item is tapped.
  const selRef = useRef<HTMLDivElement>(null);
  const selId = sel?.id;
  useEffect(() => { if (selId) selRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selId]);

  const cells = useMemo(() => monthGrid(month, program?.meetingSchedule), [month, program?.meetingSchedule]);
  const byDay = useMemo(() => {
    const m: Record<string, CourseItem[]> = {};
    for (const a of items) (m[isoDay(new Date(calendarDay(a)))] ||= []).push(a);
    return m;
  }, [items]);
  const inMonth = useMemo(
    () => items.filter(a => { const d = new Date(calendarDay(a)); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); }).sort((a, b) => calendarDay(a) - calendarDay(b)),
    [items, month],
  );

  const apply = async (a: CourseItem, at: { dueAt: number; opensAt?: number | null; scheduledFor?: number | null; afterDue?: AfterDue }, msg: string) => {
    if (!program) return;
    const next = await source.move(program, a, at);
    if (next) {
      setSel(s => (s?.id === next.id ? next : s));
      setItems(list => list.map(x => (x.id === next.id ? next : x)));
      setMoved(msg);
      announceWorkChanged();
    } else {
      setMoved('Couldn’t change it. Try again.');
    }
  };

  /** Move the class date; it keeps how far ahead it opens and how long after it's due. */
  const moveTo = (a: CourseItem, day: Date) => {
    const lead = leadOf(a);
    const classDay = new Date(day); classDay.setHours(9, 0, 0, 0);
    const scheduled = classDay.getTime();
    const dueAt = a.scheduledFor ? endOfDay(scheduled + dueAfterOf(a) * DAY) : endOfDay(scheduled);
    return apply(a, { scheduledFor: ce ? scheduled : undefined, dueAt, opensAt: lead ? scheduled - lead * DAY : null }, `Moved to ${fmtDay(classDay)}.`);
  };
  const setLead = (a: CourseItem, lead: number) => {
    const day = calendarDay(a);
    return apply(a, { dueAt: a.dueAt, scheduledFor: a.scheduledFor ?? null, opensAt: lead ? day - lead * DAY : null }, lead ? `Students can open it ${lead} day${lead === 1 ? '' : 's'} before.` : 'Students can open it now.');
  };
  const setDueAfter = (a: CourseItem, days: number) => {
    const day = calendarDay(a);
    const dueAt = endOfDay(day + days * DAY);
    return apply(a, { dueAt, scheduledFor: a.scheduledFor ?? day, opensAt: a.opensAt ?? null }, `Due ${fmtDay(new Date(dueAt))}.`);
  };
  const setAfterDue = (a: CourseItem, rule: AfterDue) =>
    apply(a, { dueAt: a.dueAt, scheduledFor: a.scheduledFor ?? null, opensAt: a.opensAt ?? null, afterDue: rule }, rule === 'accept_late' ? 'Late work accepted.' : 'Locks after the due date.');
  const nextMeeting = (a: CourseItem) => {
    const slot = autoSchedule(1, { meetingSchedule: program?.meetingSchedule, taken: [], from: new Date(calendarDay(a) + DAY), leadDays: 0, dueAfterDays: 0 })[0];
    return moveTo(a, new Date(slot.scheduledFor));
  };
  const remove = async (a: CourseItem) => {
    if (!program || !source.remove) return;
    await source.remove(program, a);
    setItems(list => list.filter(x => x.id !== a.id));
    setSel(null);
    setMoved('');
    announceWorkChanged();
  };

  const menu = useContextMenu<CourseItem>(a => {
    const lead = leadOf(a);
    const rule = afterDueOf(a);
    const nodes: MenuNode<CourseItem>[] = [
      { kind: 'header', label: a.title, swatch: colorOf(a.kind) },
      ...(a.unitId ? [{ id: 'preview', label: 'Preview', onSelect: () => onPreview(a.unitId!) }] : []),
      { id: 'dates', label: 'Dates & rules…', onSelect: () => setSel(a) },
      { kind: 'separator' },
      { id: 'next', label: program?.meetingSchedule ? 'Move to the next class meeting' : 'Move a week later', onSelect: () => void nextMeeting(a) },
      { id: 'week', label: 'Move a week earlier', onSelect: () => void moveTo(a, new Date(calendarDay(a) - 7 * DAY)) },
      {
        id: 'opens', label: 'Students can open it', submenu: LEADS.map(([d, l]) => ({
          id: `lead${d}`, label: d ? `${l} the class` : l, checked: lead === d, onSelect: () => void setLead(a, d),
        })),
      },
    ];
    if (ce) {
      nodes.push(
        {
          id: 'due', label: 'Due', submenu: DUE_AFTER.map(([d, l]) => ({
            id: `due${d}`, label: l, checked: !!a.scheduledFor && dueAfterOf(a) === d, onSelect: () => void setDueAfter(a, d),
          })),
        },
        {
          id: 'after', label: 'After the due date', submenu: (Object.keys(AFTER_DUE_LABEL) as AfterDue[]).map(k => ({
            id: k, label: AFTER_DUE_LABEL[k], checked: rule === k, onSelect: () => void setAfterDue(a, k),
          })),
        },
      );
      if (source.remove) nodes.push({ kind: 'separator' }, { id: 'remove', label: 'Unassign', danger: true, onSelect: () => void remove(a) });
    }
    return nodes;
  });

  // ── Auto-schedule the course plan's lessons that aren't on the calendar yet ──
  const planUnits = useMemo(() => {
    const plan = program?.program;
    if (!plan) return [];
    const onCal = new Set(items.map(i => i.unitId).filter(Boolean));
    const byId = new Map(units.map(u => [u.id, u]));
    const seen = new Set<string>();
    const out: IngestedCurriculumUnit[] = [];
    for (const w of plan.weeks) for (const id of w.unitIds || []) {
      const u = byId.get(id);
      if (!u || seen.has(id) || onCal.has(id) || u.isAnswerKeyOnly || !u.questions.length) continue;
      seen.add(id);
      out.push(u);
    }
    return out;
  }, [program, items, units]);
  const [auto, setAuto] = useState(false);
  const [autoLead, setAutoLead] = useState(3);
  const [autoDue, setAutoDue] = useState(0);
  const [autoRule, setAutoRule] = useState<AfterDue>('lock');
  const [autoBusy, setAutoBusy] = useState(false);
  const preview = useMemo(
    () => (auto && program ? autoSchedule(planUnits.length, { meetingSchedule: program.meetingSchedule, taken: items.map(calendarDay), leadDays: autoLead, dueAfterDays: autoDue, afterDue: autoRule }) : []),
    [auto, program, planUnits.length, items, autoLead, autoDue, autoRule],
  );
  const runAuto = async () => {
    if (!program) return;
    setAutoBusy(true);
    try {
      for (let i = 0; i < planUnits.length; i++) {
        const s = preview[i];
        await source.deliver(program as ScheduleCourse, planUnits[i], {
          scheduledFor: s.scheduledFor, dueAt: s.dueAt, opensAt: s.opensAt ?? undefined, afterDue: s.afterDue, tools: DEFAULT_TOOLS, ledgerEvent: 'auto_scheduled',
        });
      }
      setMoved(`Scheduled ${planUnits.length} lesson${planUnits.length === 1 ? '' : 's'}, ${fmtDay(new Date(preview[0].scheduledFor))} → ${fmtDay(new Date(preview[preview.length - 1].scheduledFor))}.`);
      setMonth(new Date(preview[0].scheduledFor));
      setAuto(false);
      announceWorkChanged();
      await refresh();
    } catch {
      setMoved('Couldn’t schedule all of them. Check the calendar for what went out.');
    }
    setAutoBusy(false);
  };

  if (!program) {
    return <div className="lib-empty"><h3>{source.loading ? 'Loading your classes…' : 'No courses yet'}</h3>{!source.loading && <p className="dim">{source.empty}</p>}</div>;
  }

  return (
    <div className="lib-calview">
      <div className="row wrap">
        <div className="chips grow" role="group" aria-label="Course">
          {programs.map(p => (
            <button key={p.id} type="button" className="chip" aria-pressed={p.id === program.id} onClick={() => { onProgram(p.id); setSel(null); setAuto(false); }}>{p.name}</button>
          ))}
        </div>
        {ce && (
          <button type="button" className="btn sm" aria-expanded={auto} onClick={() => setAuto(o => !o)}
            title="Put the course plan’s lessons that aren’t scheduled yet onto the next class meetings">
            Auto-schedule
          </button>
        )}
        <button type="button" className="btn sm" onClick={onSchedule}>+ Schedule work</button>
      </div>

      {auto && (
        <div className="lib-calsel" role="region" aria-label="Auto-schedule" style={{ display: 'grid', gap: 8 }}>
          {planUnits.length === 0 ? (
            <div className="small">Every lesson in {program.name}’s course plan is already on the calendar. Use “+ Schedule work” to pick more from the library.</div>
          ) : (
            <>
              <div className="t">{planUnits.length} lesson{planUnits.length === 1 ? '' : 's'} from the course plan, one per {program.meetingSchedule ? `class (${program.meetingSchedule.split(/[·,]/)[0].trim()})` : 'week'}, after what’s already scheduled</div>
              <div className="chips" role="group" aria-label="Students can open each one">
                {LEADS.map(([d, l]) => <button key={d} type="button" className="chip" aria-pressed={autoLead === d} onClick={() => setAutoLead(d)}>{d ? `Opens ${l.toLowerCase()}` : 'Opens right away'}</button>)}
              </div>
              <div className="chips" role="group" aria-label="When each is due">
                {DUE_AFTER.map(([d, l]) => <button key={d} type="button" className="chip" aria-pressed={autoDue === d} onClick={() => setAutoDue(d)}>Due {l.toLowerCase()}</button>)}
              </div>
              <div className="chips" role="group" aria-label="After the due date">
                {(Object.keys(AFTER_DUE_LABEL) as AfterDue[]).map(k => <button key={k} type="button" className="chip" aria-pressed={autoRule === k} onClick={() => setAutoRule(k)}>{AFTER_DUE_LABEL[k]}</button>)}
              </div>
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {planUnits.map((u, i) => preview[i] && (
                  <li key={u.id}>{u.title} — class {fmtDay(new Date(preview[i].scheduledFor))}{preview[i].opensAt ? `, opens ${fmtDay(new Date(preview[i].opensAt!))}` : ''}, due {fmtDay(new Date(preview[i].dueAt))}</li>
                ))}
              </ol>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn sm p" disabled={autoBusy} onClick={() => void runAuto()}>{autoBusy ? 'Scheduling…' : `Schedule ${planUnits.length}`}</button>
                <button type="button" className="btn sm" onClick={() => setAuto(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

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
              <button key={a.id} type="button" className={`lib-pill${sel?.id === a.id ? ' on' : ''}`} style={{ ['--k' as string]: colorOf(a.kind) }}
                title={`${a.title} — right-click for options`} onClick={() => setSel(a)} {...menu.bind(a)}>
                {a.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      {menu.node}

      {sel && (
        <div ref={selRef} className="lib-calsel" role="region" aria-label="Selected item">
          <span className="lib-dot" style={{ background: colorOf(sel.kind) }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="t">{sel.title}</div>
            <div className="small">
              {sel.scheduledFor ? `Class ${fmtDay(new Date(sel.scheduledFor))} · ` : ''}Due {fmtDay(new Date(sel.dueAt))}
              {sel.opensAt && sel.opensAt > Date.now() ? ` · students can open it ${fmtDay(new Date(sel.opensAt))}` : ' · on desks now'}
              {ce ? ` · ${afterDueOf(sel) === 'accept_late' ? 'late accepted' : 'locks after due'}` : ''}
              {moved ? ` · ${moved}` : ''}
            </div>
          </div>
          <label className="lbl" style={{ minWidth: 150 }}>
            {ce ? 'Class date' : 'Move to'}
            <input type="date" className="field" value={isoDay(new Date(calendarDay(sel)))} onChange={e => { if (e.target.value) void moveTo(sel, fromIsoDay(e.target.value)); }} />
          </label>
          {ce && (
            <label className="lbl" style={{ minWidth: 150 }}>
              Due
              <input type="date" className="field" value={isoDay(new Date(sel.dueAt))} min={isoDay(new Date(calendarDay(sel)))}
                onChange={e => { if (e.target.value) void apply(sel, { dueAt: endOfDay(fromIsoDay(e.target.value).getTime()), scheduledFor: sel.scheduledFor ?? calendarDay(sel), opensAt: sel.opensAt ?? null }, `Due ${fmtDay(fromIsoDay(e.target.value))}.`); }} />
            </label>
          )}
          {sel.unitId && <button type="button" className="btn sm" onClick={() => onPreview(sel.unitId!)}>Preview</button>}
          <button type="button" className="btn sm" aria-label="More options" onClick={e => menu.openFrom(e.currentTarget, sel)}>⋯</button>
          <button type="button" className="btn sm" aria-label="Close" onClick={() => { setSel(null); setMoved(''); }}>✕</button>
        </div>
      )}

      <div className="lib-agenda">
        <div className="small">{loading ? 'Loading…' : inMonth.length ? `${inMonth.length} this month` : 'Nothing scheduled this month.'}</div>
        {inMonth.map(a => (
          <button key={a.id} type="button" className="lib-agenda-r" onClick={() => setSel(a)} {...menu.bind(a)}>
            <span className="lib-agenda-d">{new Date(calendarDay(a)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
            <span className="lib-dot" style={{ background: colorOf(a.kind) }} />
            <span className="grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
            {a.opensAt && a.opensAt > Date.now() && <span className="tag soon">Opens {new Date(a.opensAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
            {a.scheduledFor && <span className="tag">Due {new Date(a.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
