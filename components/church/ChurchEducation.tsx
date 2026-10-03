import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, Library, GraduationCap, ChevronLeft, Loader2, Users, Check } from 'lucide-react';
import type { Organization } from '../../types';
import { COURSES } from '../../services/courseCatalog';
import { openScripture } from '../scripture/ScriptureRefChip';
import { parseRef } from '../../services/scriptureRef';
import { KIND_LABEL, STARTERS, listPrograms, saveProgram, deleteProgram, newProgram, fromStarter, attachClassroom, resolvePassage, type ChurchProgram, type PlanWeek, type ProgramKind } from '../../services/churchEducationService';

/**
 * Education for a church: Sunday school, Bible study, catechesis, discipleship. Leaders plan weeks around
 * Lectio passages and Sacred Library readings and attach Academia courses; members open each week straight
 * into the reader. `canEdit` is the leader view; members see the same programs read-only.
 */
const field = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/40 placeholder:text-white/25';
const nav = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));

const ChurchEducation: React.FC<{ church: Organization; canEdit: boolean }> = ({ church, canEdit }) => {
  const [programs, setPrograms] = useState<ChurchProgram[] | null>(null);
  const [open, setOpen] = useState<ChurchProgram | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const reload = () => listPrograms(church.id).then(setPrograms).catch(() => { setPrograms([]); setErr('Could not load programs.'); });
  useEffect(() => { reload(); }, [church.id]);

  const persist = async (p: ChurchProgram) => { setBusy(true); setErr(''); try { await saveProgram(p); setOpen(p); await reload(); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch { setErr('Could not save. Check your connection and permissions.'); } setBusy(false); };
  const start = (p: ChurchProgram) => persist(p);
  const courseOptions = useMemo(() => COURSES.filter(c => c.kind === 'curriculum' && ['humanities', 'arts', 'economics', 'literacy'].includes(c.subject)), []);

  if (open) {
    const p = open; const set = (patch: Partial<ChurchProgram>) => setOpen({ ...p, ...patch });
    const setWeek = (i: number, patch: Partial<PlanWeek>) => set({ weeks: p.weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
    return (
      <div className="space-y-4 text-white">
        <button type="button" onClick={() => { setOpen(null); reload(); }} className="text-[11px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1"><ChevronLeft size={14} /> All programs</button>
        {canEdit ? <input aria-label="Program name" value={p.name} onChange={e => set({ name: e.target.value })} className={`${field} text-lg font-black`} /> : <h2 className="text-xl font-black">{p.name}</h2>}
        <p className="text-[12px] text-white/50">{KIND_LABEL[p.kind]}{p.ageBand ? ` · ${p.ageBand}` : ''}</p>
        {canEdit ? <textarea aria-label="Description" value={p.description} onChange={e => set({ description: e.target.value })} rows={2} className={`${field} resize-none`} placeholder="What is this program about?" /> : p.description && <p className="text-sm text-white/70">{p.description}</p>}

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/45">Weekly plan</p>
          {p.weeks.map((w, i) => { const ok = !!parseRef(w.passage.trim()); return (
            <div key={w.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
              {canEdit ? (
                <div className="grid gap-2">
                  <div className="flex gap-2"><span className="text-[11px] font-black text-white/40 pt-2.5 w-14">Week {i + 1}</span><input aria-label={`Week ${i + 1} title`} value={w.title} onChange={e => setWeek(i, { title: e.target.value })} className={field} placeholder="Lesson title" /><button type="button" aria-label={`Remove week ${i + 1}`} onClick={() => set({ weeks: p.weeks.filter((_, j) => j !== i) })} className="px-2 text-white/40 hover:text-rose-300"><Trash2 size={14} /></button></div>
                  <input aria-label={`Week ${i + 1} passage`} value={w.passage} onChange={e => setWeek(i, { passage: e.target.value })} className={`${field} ${w.passage && !ok ? 'border-amber-400/60' : ''}`} placeholder="Passage, e.g. Luke 15:11-32" />
                  {w.passage && !ok && <p className="text-[11px] text-amber-300">Lectio can't read this passage yet. Check the book name and numbers.</p>}
                  <textarea aria-label={`Week ${i + 1} notes`} value={w.note} onChange={e => setWeek(i, { note: e.target.value })} rows={2} className={`${field} resize-none`} placeholder="Teacher notes and discussion questions" />
                  <input aria-label={`Week ${i + 1} library reading`} value={w.library || ''} onChange={e => setWeek(i, { library: e.target.value })} className={field} placeholder="Sacred Library reading (optional): a hymn, prayer, early text" />
                </div>
              ) : (
                <div><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Week {i + 1}</p><p className="font-black">{w.title}</p>{w.note && <p className="text-[12px] text-white/60 mt-0.5">{w.note}</p>}</div>
              )}
              <div className="flex gap-2 flex-wrap">
                {ok && <button type="button" onClick={() => openScripture(parseRef(w.passage.trim())!)} className="rounded-full bg-white text-black px-3.5 py-1.5 text-[11px] font-black inline-flex items-center gap-1.5"><BookOpen size={12} /> Read {w.passage} in Lectio</button>}
                {w.library && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SACRED_LIBRARY'))} className="rounded-full border border-white/25 px-3.5 py-1.5 text-[11px] font-black inline-flex items-center gap-1.5"><Library size={12} /> {w.library}</button>}
              </div>
            </div>); })}
          {canEdit && <button type="button" onClick={() => set({ weeks: [...p.weeks, { id: `w${Date.now().toString(36)}`, title: '', passage: '', note: '' }] })} className="rounded-full border border-dashed border-white/25 px-4 py-2 text-[11px] font-black inline-flex items-center gap-1.5"><Plus size={12} /> Add a week</button>}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/45">Academia courses</p>
          {p.courseIds.length === 0 && !canEdit && <p className="text-[12px] text-white/40">No courses attached.</p>}
          <div className="flex flex-wrap gap-1.5">{(canEdit ? courseOptions : courseOptions.filter(c => p.courseIds.includes(c.id))).map(c => { const on = p.courseIds.includes(c.id); return (
            <button key={c.id} type="button" disabled={!canEdit} aria-pressed={on} onClick={() => set({ courseIds: on ? p.courseIds.filter(x => x !== c.id) : [...p.courseIds, c.id] })} className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${on ? 'bg-white text-black border-white' : 'border-white/15 text-white/60'}`}>{c.emoji} {c.title}</button>); })}</div>
          {p.courseIds.length > 0 && <button type="button" onClick={() => nav('LEARN')} className="text-[11px] font-black underline text-[#7fe0bd]">Open these in Academia</button>}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" disabled={busy || !p.name.trim()} onClick={() => persist(p)} className="rounded-full bg-small-orange text-black px-5 py-2.5 text-[12px] font-black disabled:opacity-40 inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? 'Saved' : 'Save program'}</button>
            {!p.classroomId ? <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { setOpen(await attachClassroom(church, p)); } catch { setErr('Could not create the class.'); } setBusy(false); }} className="rounded-full border border-white/25 px-5 py-2.5 text-[12px] font-black inline-flex items-center gap-1.5"><Users size={14} /> Create class roster</button> : <span className="text-[11px] text-emerald-300 self-center">Class created. Manage the roster, assignments and records in Classrooms.</span>}
            <button type="button" onClick={async () => { if (window.confirm('Delete this program?')) { await deleteProgram(p.id).catch(() => {}); setOpen(null); reload(); } }} className="rounded-full px-4 py-2.5 text-[12px] font-black text-rose-300">Delete</button>
          </div>)}
        {err && <p role="alert" className="text-[12px] text-rose-300">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-white">
      <p className="text-sm text-white/55">{canEdit ? 'Run Sunday school, Bible study and catechesis with the same tools schools use: weekly plans built on Lectio passages and the Sacred Library, Academia courses, a class roster and learning records.' : 'Classes and studies your church offers.'}</p>
      {programs === null && <p className="text-sm text-white/40">Loading...</p>}
      {programs?.length === 0 && !canEdit && <p className="text-sm text-white/40">Nothing posted yet.</p>}
      <div className="grid gap-2">{programs?.map(p => (
        <button key={p.id} type="button" onClick={() => setOpen(p)} className="text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] p-4"><p className="font-black">{p.name}</p><p className="text-[12px] text-white/55">{KIND_LABEL[p.kind]}{p.ageBand ? ` · ${p.ageBand}` : ''} · {p.weeks.length} weeks</p></button>))}</div>
      {canEdit && (
        <>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/45 flex items-center gap-1.5"><GraduationCap size={13} /> Start from a plan</p>
          <div className="grid sm:grid-cols-3 gap-2">{STARTERS.map(s => (
            <button key={s.id} type="button" disabled={busy} onClick={() => start(fromStarter(church, s.id))} className="text-left rounded-2xl border border-white/12 bg-white/[0.03] hover:bg-white/[0.08] p-3"><p className="font-black text-sm">{s.name}</p><p className="text-[11px] text-white/50 mt-0.5">{s.ageBand} · {s.weeks.length} weeks</p><p className="text-[11px] text-white/45 mt-1 leading-snug">{s.description}</p></button>))}</div>
          <div className="flex gap-2 flex-wrap items-center">
            {(['sunday-school', 'bible-study', 'youth', 'adult', 'confirmation', 'vbs', 'discipleship'] as ProgramKind[]).map(k => (
              <button key={k} type="button" disabled={busy} onClick={() => setOpen(newProgram(church, { name: `New ${KIND_LABEL[k].toLowerCase()}`, kind: k }))} className="px-3 py-1.5 rounded-full border border-white/15 text-[11px] font-black text-white/70 hover:bg-white/10 inline-flex items-center gap-1"><Plus size={11} /> {KIND_LABEL[k]}</button>))}
          </div>
        </>)}
      {err && <p role="alert" className="text-[12px] text-rose-300">{err}</p>}
    </div>
  );
};
export default ChurchEducation;
