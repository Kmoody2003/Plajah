// components/elevate/MyOrgTasksAndDepartments.tsx
// Member home "My work" panel: the departments this person is in, what they have to do for the org,
// and their Christian Education classes. Real records only — every list says what would appear in it
// when it's empty. Tasks are cloud-saved (services/memberTasksService), so every device shows the same list.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Users, Calendar, Plus, GraduationCap, ArrowRight, Clock, ClipboardList, Trash2, Loader2, HeartHandshake } from 'lucide-react';
import type { Ministry, Organization, OrgMembership } from '../../types';
import { auth } from '../../services/backendService';
import type { ChurchProgram } from '../../services/churchEducationService';
import { myClassRoles } from '../../services/memberDepartments';
import {
  loadMemberTasks, addMemberTask, setMemberTaskDone, deleteMemberTask, dueLabel, isOverdue, type MemberTaskItem,
} from '../../services/memberTasksService';
import { useClassLiveNow } from '../../hooks/useClassLiveNow';
import { UniversalStudentDesk } from '../desk/UniversalStudentDesk';

interface MyOrgTasksAndDepartmentsProps {
  org: Organization;
  membership?: OrgMembership | null;
  /** Departments this person is actually in (services/memberDepartments). */
  departments: Ministry[];
  /** Christian Ed classes this person can see (null while loading). */
  programs: ChurchProgram[] | null;
  /** Staff / department heads see every class; everyone else sees theirs. */
  seesAllClasses?: boolean;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenClass?: (classId: string) => void;
  onOpenServe?: () => void;
}

const SOURCE_LABEL: Record<MemberTaskItem['source'], string> = { OWN: 'My to-do', SHIFT: 'Scheduled shift', CARE: 'Care task' };

export const MyOrgTasksAndDepartments: React.FC<MyOrgTasksAndDepartmentsProps> = ({
  org,
  departments,
  programs,
  seesAllClasses = false,
  onOpenDepartment,
  onOpenClass,
  onOpenServe,
}) => {
  const uid = auth.currentUser?.uid || '';
  const [tasks, setTasks] = useState<MemberTaskItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [err, setErr] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newDue, setNewDue] = useState('');
  const [adding, setAdding] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [deskOpen, setDeskOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) { setTasks([]); setLoadFailed(true); return; }
    const r = await loadMemberTasks(org.id);
    setTasks(r.items);
    setLoadFailed(r.failed);
  }, [org.id, uid]);
  useEffect(() => { setTasks(null); void reload(); }, [reload]);

  const deptName = (id?: string) => {
    const m = id ? (org.ministries || []).find(x => x.id === id) : undefined;
    return m ? `${m.iconEmoji ? `${m.iconEmoji} ` : ''}${m.name}` : '';
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setErr('');
    try {
      const created = await addMemberTask(org.id, { title, ministryId: newDept || undefined, dueDate: newDue || undefined });
      setTasks(prev => [created, ...(prev || [])]);
      setNewTitle('');
      setNewDue('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save that task. Check your connection and try again.');
    }
    setAdding(false);
  };

  const toggle = async (t: MemberTaskItem) => {
    if (t.source === 'SHIFT') { onOpenServe?.(); return; }
    setTasks(prev => (prev || []).map(x => (x.key === t.key ? { ...x, done: !x.done } : x)));
    try {
      await setMemberTaskDone(t, !t.done);
    } catch {
      setTasks(prev => (prev || []).map(x => (x.key === t.key ? { ...x, done: t.done } : x)));
      setErr('Could not update that task.');
    }
  };

  const remove = async (t: MemberTaskItem) => {
    setTasks(prev => (prev || []).filter(x => x.key !== t.key));
    try { await deleteMemberTask(t); } catch { void reload(); setErr('Could not delete that task.'); }
  };

  const all = tasks || [];
  const visible = deptFilter === 'ALL' ? all : all.filter(t => t.ministryId === deptFilter);
  const openCount = all.filter(t => !t.done).length;

  const { teaching, enrolled } = useMemo(() => myClassRoles(programs || [], uid), [programs, uid]);
  const myClasses = useMemo(() => {
    if (!programs) return [];
    if (seesAllClasses) return programs;
    return programs.filter(p => teaching.includes(p) || enrolled.includes(p));
  }, [programs, seesAllClasses, teaching, enrolled]);
  const live = useClassLiveNow(useMemo(() => myClasses.map(p => p.id), [myClasses]));

  const panel = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 min-w-0';
  const heading = 'text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5';
  const empty = 'rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-[12px] leading-relaxed text-white/60';

  return (
    <section
      aria-label="My work in this organization"
      className="rounded-3xl border border-white/12 bg-gradient-to-br from-[#160a28]/95 via-[#10071e]/95 to-[#0b0214]/95 p-4 sm:p-5 shadow-2xl space-y-4 text-white"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-2xl grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)' }}>
          <ClipboardList size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF8C00]">My work · {org.name}</div>
          <h2 className="text-base sm:text-lg font-black tracking-tight m-0" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {!uid ? 'Sign in to see your work' : tasks === null ? 'Loading your tasks…' : openCount ? `${openCount} open ${openCount === 1 ? 'task' : 'tasks'}` : 'You’re all caught up'}
            <span className="text-white/45 font-bold"> · {departments.length} {departments.length === 1 ? 'department' : 'departments'} · {myClasses.length} {myClasses.length === 1 ? 'class' : 'classes'}</span>
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Departments */}
        <div className={`lg:col-span-3 ${panel}`}>
          <div className={`${heading} text-[#D0BCFF]`}><Users size={13} /> My departments</div>
          {departments.length === 0 ? (
            <div className={empty}>
              You’re not in a department yet. When a leader adds you to one — or you join one — it shows here, with its tasks and classes.
            </div>
          ) : (
            <div className="space-y-1.5">
              {departments.map(d => {
                const due = all.filter(t => t.ministryId === d.id && !t.done).length;
                const active = deptFilter === d.id;
                return (
                  <div key={d.id} className={`rounded-xl border px-3 py-2 flex items-center gap-2 transition ${active ? 'border-purple-400/60 bg-purple-500/15' : 'border-white/10 bg-black/30 hover:bg-white/[0.05]'}`}>
                    <button type="button" onClick={() => setDeptFilter(active ? 'ALL' : d.id)} className="text-left min-w-0 flex-1" title={active ? 'Show every task' : `Show ${d.name} tasks`}>
                      <span className="text-[13px] font-bold text-white truncate block">{d.iconEmoji ? `${d.iconEmoji} ` : ''}{d.name}</span>
                      {d.meetingTime && <span className="text-[10.5px] text-white/45 truncate block">{d.meetingTime}</span>}
                    </button>
                    {due > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[10px] font-black shrink-0">{due} due</span>}
                    {onOpenDepartment && (
                      <button type="button" onClick={() => onOpenDepartment(d.id)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0" aria-label={`Open ${d.name}`}>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className={`lg:col-span-6 ${panel}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`${heading} text-amber-300`}><Calendar size={13} /> My tasks &amp; shifts</span>
            {deptFilter !== 'ALL' && (
              <button type="button" onClick={() => setDeptFilter('ALL')} className="text-[10px] font-bold text-amber-300 hover:underline">
                Show all ({all.length})
              </button>
            )}
          </div>

          {uid && (
            <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); void handleAdd(); }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                maxLength={300}
                placeholder="Add a to-do…"
                aria-label="New task"
                className="flex-1 min-w-[160px] bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-[13px] text-white outline-none focus:border-amber-400"
              />
              {departments.length > 0 && (
                <select aria-label="Department" value={newDept} onChange={e => setNewDept(e.target.value)} className="bg-black/60 border border-white/15 rounded-xl px-2 py-2 text-[12px] text-white max-w-[150px]">
                  <option value="">No department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <input type="date" aria-label="Due date" value={newDue} onChange={e => setNewDue(e.target.value)} className="bg-black/60 border border-white/15 rounded-xl px-2 py-2 text-[12px] text-white [color-scheme:dark]" />
              <button type="submit" disabled={!newTitle.trim() || adding} className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black text-[12px] font-black inline-flex items-center gap-1 shrink-0">
                {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
              </button>
            </form>
          )}
          {err && <p className="text-[11px] text-rose-300 m-0">{err}</p>}

          {tasks === null ? (
            <div className="flex items-center gap-2 text-[12px] text-white/50 py-3"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          ) : !uid ? (
            <div className={empty}>Sign in to see your tasks and shifts for {org.name}.</div>
          ) : visible.length === 0 ? (
            <div className={empty}>
              {deptFilter !== 'ALL'
                ? `Nothing for ${deptName(deptFilter) || 'this department'} right now.`
                : loadFailed
                  ? 'Your tasks couldn’t load. Check your connection — they’re saved to your account, not this device.'
                  : 'Nothing on your list. Volunteer shifts you’re scheduled for, care tasks a leader assigns you, and to-dos you add here all show up in this list — on every device you sign in on.'}
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1 m-0 p-0 list-none">
              {visible.map(t => {
                const overdue = isOverdue(t);
                const when = dueLabel(t);
                return (
                  <li key={t.key} className={`group rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${t.done ? 'border-white/5 bg-black/20 opacity-60' : 'border-white/10 bg-black/35'}`}>
                    <button
                      type="button"
                      onClick={() => void toggle(t)}
                      className="mt-0.5 shrink-0"
                      aria-label={t.source === 'SHIFT' ? 'Answer this shift on the schedule' : t.done ? 'Mark not done' : 'Mark done'}
                      title={t.source === 'SHIFT' ? 'Confirm or swap this shift in Serve & shifts' : undefined}
                    >
                      {t.source === 'SHIFT' ? <HeartHandshake size={16} className="text-cyan-300" />
                        : t.done ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Circle size={16} className="text-white/40" />}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={`text-[13px] font-bold leading-snug m-0 ${t.done ? 'line-through text-white/50' : 'text-white'}`}>
                        {t.title}{t.positionName ? <span className="text-white/50 font-semibold"> · {t.positionName}</span> : null}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="px-2 py-0.5 rounded-full bg-white/[0.07] text-white/65 font-bold">{SOURCE_LABEL[t.source]}</span>
                        {t.ministryId && deptName(t.ministryId) && <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-bold">{deptName(t.ministryId)}</span>}
                        {t.shiftStatus === 'PENDING' && <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold">Needs your answer</span>}
                        {when && <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-300 font-bold' : 'text-white/50'}`}><Clock size={10} /> {overdue ? `Overdue · ${when}` : when}</span>}
                      </div>
                    </div>
                    {t.source === 'OWN' && (
                      <button type="button" onClick={() => void remove(t)} className="p-1 rounded-md text-white/30 hover:text-rose-300 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0" aria-label="Delete task">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Christian Ed classes */}
        <div className={`lg:col-span-3 ${panel}`}>
          <div className={`${heading} text-emerald-300`}><GraduationCap size={13} /> {seesAllClasses ? 'Classes' : 'My classes'}</div>
          {programs === null ? (
            <div className="flex items-center gap-2 text-[12px] text-white/50 py-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          ) : myClasses.length === 0 ? (
            <div className={empty}>
              {seesAllClasses
                ? `${org.name} has no Christian Education classes yet. Classes created in the department show here.`
                : 'You’re not in a class yet. Classes you teach or are enrolled in show here — ask your teacher for the class code.'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {myClasses.slice(0, 6).map(p => {
                const role = teaching.includes(p) ? 'Teaching' : enrolled.includes(p) ? 'Enrolled' : '';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenClass?.(p.id)}
                    className="w-full text-left rounded-xl border border-white/10 bg-black/30 hover:bg-white/[0.06] px-3 py-2 flex items-center gap-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-[13px] font-bold text-white truncate block">{p.name}</span>
                      <span className="text-[10.5px] text-white/45 truncate block">{[p.meetingSchedule, `${(p.students || []).length} students`].filter(Boolean).join(' · ')}</span>
                    </span>
                    {live[p.id] ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9.5px] font-black shrink-0">LIVE</span>
                    ) : role ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 text-[9.5px] font-black shrink-0">{role}</span>
                    ) : null}
                  </button>
                );
              })}
              {myClasses.length > 6 && <p className="text-[11px] text-white/45 m-0">+{myClasses.length - 6} more in Christian Education</p>}
            </div>
          )}
          {enrolled.length > 0 && (
            <button type="button" onClick={() => setDeskOpen(v => !v)} className="w-full py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-[12px] font-black inline-flex items-center justify-center gap-1.5">
              <GraduationCap size={13} /> {deskOpen ? 'Hide my desk' : 'Open my desk'}
            </button>
          )}
        </div>
      </div>

      {deskOpen && (
        <div className="pt-4 border-t border-white/10">
          <UniversalStudentDesk
            studentUid={uid}
            studentName={auth.currentUser?.displayName || 'Class member'}
            defaultDomain="CHRISTIAN_EDUCATION"
            orgId={org.id}
            orgName={org.name}
            onBack={() => setDeskOpen(false)}
            onOpenTelaStudio={(docId: string) => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }))}
          />
        </div>
      )}
    </section>
  );
};

export default MyOrgTasksAndDepartments;
