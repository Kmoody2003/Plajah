// StemAssignPanel — hand a STEM project or lesson to one of the teacher's real classes.
//
// No parallel system: the seed is adopted into the teacher's own template library (saveTemplate), then the stock
// AssignTemplatePanel writes the templateAssignments record. Students open it in AssignedLessonView, which shows
// the "Open in Plajah Build" step (the assignment's buildLaunch), turn it in, and the teacher grades it in
// LessonGradingPanel exactly like any other Academia lesson. Real classes only: with no class, it says so.

import React, { useEffect, useState } from 'react';
import { Loader2, Users, GraduationCap } from 'lucide-react';
import type { TemplateSeed, AssignmentTemplate } from '../../data/assignmentTemplates';
import { templateFromSeed, saveTemplate, type AssignStudent } from '../../services/assignmentTemplateService';
import { fetchClassrooms } from '../../services/backendService';
import { loadTeacherRoster } from '../../services/academiaDossier';
import AssignTemplatePanel from '../academia/AssignTemplatePanel';

interface ClassOpt { id: string; name: string; students: AssignStudent[] }

const StemAssignPanel: React.FC<{ seed: TemplateSeed; user?: any; profile?: any; onNavigate?: (v: string) => void }> = ({ seed, user, profile, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState('');
  const [template, setTemplate] = useState<AssignmentTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!uid) { setClasses([]); return; }
    let live = true;
    (async () => {
      const all: any[] = await fetchClassrooms().catch(() => []);
      const mine = (all || []).filter(c => c?.ownerId === uid);
      const roster = await loadTeacherRoster(mine).catch(() => []);
      const opts = mine.map(c => ({
        id: c.id,
        name: c.title || c.name || 'Class',
        students: roster.filter(r => r.classIds.includes(c.id)).map(r => ({ id: r.uid, name: r.name })),
      }));
      if (live) { setClasses(opts); if (opts[0]) setClassId(opts[0].id); }
    })();
    return () => { live = false; };
  }, [uid]);

  const adopt = async () => {
    if (!uid) return;
    setSaving(true); setErr('');
    const t = templateFromSeed(seed, uid, seed.id);
    const ok = await saveTemplate(t);
    setSaving(false);
    if (ok) setTemplate(t); else setErr('Could not save it to your library. Check your connection and try again.');
  };

  if (!uid) return <p className="text-[13px] text-white/60">Sign in with a teacher account to assign this to a class.</p>;
  if (classes === null) return <p className="text-[13px] text-white/60 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading your classes…</p>;
  if (!classes.length) {
    return (
      <div className="text-[13px] text-white/70 space-y-2">
        <p>You don’t have a class yet. Create one, add students, then come back to assign this.</p>
        {onNavigate && <button onClick={() => onNavigate('CLASSROOMS')} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-white/10"><GraduationCap size={14} /> My classes</button>}
      </div>
    );
  }
  const cls = classes.find(c => c.id === classId) || classes[0];
  const teacher = { uid, name: profile?.displayName || user?.displayName || 'Teacher', photo: profile?.photoURL || user?.photoURL || undefined };

  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-white/70">
        <Users size={14} /> Class
        <select value={cls.id} onChange={e => setClassId(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white">
          {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>)}
        </select>
      </label>
      {!template ? (
        <button onClick={adopt} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[#0E8074] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60" data-testid="stem-adopt">
          {saving && <Loader2 size={14} className="animate-spin" />} Add to my lessons and assign
        </button>
      ) : (
        <AssignTemplatePanel template={template} classId={cls.id} className={cls.name} students={cls.students} teacher={teacher} />
      )}
      {err && <p className="text-[12px] text-amber-400">{err}</p>}
    </div>
  );
};

export default StemAssignPanel;
