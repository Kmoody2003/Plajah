import React, { useEffect, useState } from 'react';
import { PenTool, ScanLine, Library, Wand2, ClipboardCheck, BarChart3, Users, Plus, GraduationCap, AlertTriangle, LayoutGrid, FileText } from 'lucide-react';
import TodayDueFirst from './TodayDueFirst';
import EduFeedPanel from './EduFeedPanel';
import MediaToolsRow from './MediaToolsRow';
import WellbeingPanel from './WellbeingPanel';
import { fetchClassrooms, enrollInClassroom } from '../../services/backendService';
import { loadTeacherMetrics, type TeacherMetrics } from '../../services/academiaStats';
import { listMyTemplates, lessonLink } from '../../services/assignmentTemplateService';

/**
 * Teacher hub (ACADEMIA_HOME for teachers). Three jobs, in this order:
 *   1. Lessons — build and assign them
 *   2. Worksheets — scan, rebuild, assess
 *   3. Class performance — real numbers from graded work and the Learner Ledger
 * Everything on this screen reads live data for the signed-in account; nothing is demo.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; isAdminLens?: boolean }

const go = (onNavigate: (v: string) => void, tab: string) => {
  try { sessionStorage.setItem('plajah:teacherTab', tab); } catch { /* private mode */ }
  onNavigate('TEACHER_TOOLS');
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string }> = ({ label, value, hint, tone = '#fff' }) => (
  <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-white/45">{label}</p>
    <p className="text-3xl font-black mt-1 leading-none" style={{ color: tone }}>{value}</p>
    {hint && <p className="text-[11px] text-white/45 mt-1.5 leading-snug">{hint}</p>}
  </div>
);

const Action: React.FC<{ icon: React.ElementType; label: string; desc: string; accent: string; onClick: () => void }> = ({ icon: Icon, label, desc, accent, onClick }) => (
  <button type="button" onClick={onClick} className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:bg-white/[0.08] hover:-translate-y-0.5 transition-all flex gap-3 items-start">
    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${accent}22`, color: accent }}><Icon size={20} /></span>
    <span className="min-w-0"><span className="block text-[14px] font-black">{label}</span><span className="block text-[12px] text-white/50 leading-snug mt-0.5">{desc}</span></span>
  </button>
);

const Section: React.FC<{ n: string; title: string; sub: string; children: React.ReactNode }> = ({ n, title, sub, children }) => (
  <section className="mb-9">
    <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">{n}</p><h2 className="text-lg font-black">{title}</h2><p className="text-[12px] text-white/50">{sub}</p></div>
    {children}
  </section>
);

const Pill: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10 inline-flex items-center gap-1.5">{children}</button>
);

const TeacherHub: React.FC<Props> = ({ user, profile, onNavigate, isAdminLens }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const first = (profile?.displayName || 'Teacher').split(' ')[0];
  const [classes, setClasses] = useState<any[] | null>(null);
  const [m, setM] = useState<TeacherMetrics | null>(null);
  const [templateCount, setTemplateCount] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!uid) { setClasses([]); return; }
    const all: any[] = await fetchClassrooms().catch(() => []);
    const mine = (all || []).filter(c => c?.ownerId === uid);
    setClasses(mine);
    loadTeacherMetrics(uid, mine).then(setM).catch(() => {});
    listMyTemplates(uid).then(t => setTemplateCount(t.length)).catch(() => setTemplateCount(0));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  const joinOwn = async (classId: string) => {
    await enrollInClassroom(classId).catch(() => {});
    setMsg('You are enrolled in your own class. Switch to Student to see its homework.');
    void load();
  };

  const t = m?.totals;
  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-center gap-2 mb-2 text-[#FF8C00]"><GraduationCap size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Teacher Studio</span></div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">Good to see you, {first}.</h1>
        <p className="text-white/55 text-sm mt-1 mb-6">Build lessons, turn paper into worksheets, and see how every class is really doing.</p>

        <div className="mb-9">
          <TodayDueFirst uid={uid} role="teacher"
            onOpenAssignment={(id) => { try { window.history.pushState({}, '', lessonLink(id)); } catch { /* non-fatal */ } onNavigate('STUDENT_LESSON'); }}
            onNavigate={(v) => (v === 'TEACHER_TOOLS' ? go(onNavigate, 'assess') : onNavigate(v))} />
        </div>

        <Section n="01" title="Lessons" sub="Plan it, build it, hand it out.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Action icon={PenTool} label="Build a lesson" desc={templateCount ? `${templateCount} saved template${templateCount === 1 ? '' : 's'}. Standards-aligned and assignable.` : 'Standards-aligned assignment templates you can assign in one tap'} accent="#FF8C00" onClick={() => go(onNavigate, 'templates')} />
            <Action icon={Wand2} label="Plan from mastery" desc="Pick the standard your class is weakest on and get a plan" accent="#D40055" onClick={() => go(onNavigate, 'plan')} />
            <Action icon={Library} label="Content library" desc="Rights-cleared music, film and art to teach with" accent="#7a2bd6" onClick={() => go(onNavigate, 'library')} />
            <Action icon={FileText} label="Planner" desc="Your saved lesson plans, in one place" accent="#36c5f0" onClick={() => go(onNavigate, 'planner')} />
          </div>
        </Section>

        <Section n="02" title="Worksheets" sub="Paper in, interactive worksheet out. Then assess it.">
          <div className="grid sm:grid-cols-3 gap-3">
            <Action icon={ScanLine} label="Scan a worksheet" desc="Photograph a page; Plajah rebuilds it as an editable, fillable worksheet" accent="#06D6A0" onClick={() => go(onNavigate, 'worksheet')} />
            <Action icon={ClipboardCheck} label="Assess work" desc="Grade submissions against the rubric; mastery lands in the ledger" accent="#2bd67a" onClick={() => go(onNavigate, 'assess')} />
            <Action icon={LayoutGrid} label="Checks" desc="Quick checks for understanding" accent="#3B82F6" onClick={() => go(onNavigate, 'checks')} />
          </div>
        </Section>

        <Section n="03" title="Class performance" sub="Live from graded work and the Learner Ledger.">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Classes" value={classes === null ? '…' : classes.length} hint={t ? `${t.students} students enrolled` : undefined} />
            <Stat label="Waiting on you" value={t ? t.awaiting : '…'} hint="submissions to grade" tone={t && t.awaiting ? '#FF8C00' : '#fff'} />
            <Stat label="Class mastery" value={t ? (t.avgMastery == null ? '—' : `${t.avgMastery}%`) : '…'} hint={t ? `from ${t.graded} graded` : undefined} tone="#06D6A0" />
            <Stat label="Need support" value={t ? t.atRisk : '…'} hint="ledger evidence, mastery under 50%" tone={t && t.atRisk ? '#ff6b8a' : '#fff'} />
          </div>

          <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
            {classes === null && <p className="p-4 text-sm text-white/50">Loading your classes…</p>}
            {classes && classes.length === 0 && (
              <div className="p-6 text-center">
                <Users className="mx-auto mb-2 text-white/30" />
                <p className="text-sm font-bold">No classes yet</p>
                <p className="text-[12px] text-white/50 mb-3">Create one, add or provision your students, and the numbers above come alive.</p>
                <button type="button" onClick={() => onNavigate('CLASSROOMS')} className="inline-flex items-center gap-1.5 rounded-full bg-[#FF8C00] text-black text-xs font-black px-4 py-2"><Plus size={14} /> Create a class</button>
              </div>
            )}
            {(m?.classes || []).map(c => {
              const enrolledSelf = !!(classes || []).find(k => k.id === c.classId)?.enrolledStudents?.includes(uid);
              return (
                <div key={c.classId} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{c.title}</p>
                    <p className="text-[11px] text-white/45">{c.enrolled} students · {c.submitted} submitted · {c.graded} graded{c.awaiting ? ` · ${c.awaiting} waiting` : ''}</p>
                  </div>
                  <div className="w-28 hidden sm:block">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#06D6A0]" style={{ width: `${c.avgMastery ?? 0}%` }} /></div>
                    <p className="text-[10px] text-white/45 mt-1 text-right">{c.avgMastery == null ? 'nothing graded' : `${c.avgMastery}% mastery`}</p>
                  </div>
                  {c.atRisk > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#ff6b8a] bg-[#ff6b8a]/10 border border-[#ff6b8a]/30 rounded-full px-2 py-1"><AlertTriangle size={11} />{c.atRisk}</span>}
                  {isAdminLens && !enrolledSelf && (
                    <button type="button" onClick={() => joinOwn(c.classId)} className="text-[10px] font-black uppercase tracking-wider text-white/60 border border-white/15 rounded-full px-2.5 py-1 hover:bg-white/10" title="Enroll yourself so you can test the student side of this class">Test as student</button>
                  )}
                </div>
              );
            })}
          </div>
          {msg && <p role="status" className="text-[12px] text-[#06D6A0] mt-2">{msg}</p>}

          <div className="flex flex-wrap gap-2 mt-4">
            <Pill onClick={() => go(onNavigate, 'grade')}><BarChart3 size={13} /> Gradebook</Pill>
            <Pill onClick={() => go(onNavigate, 'reports')}>Progress reports</Pill>
            <Pill onClick={() => onNavigate('CLASSROOMS')}>Manage classes &amp; roster</Pill>
            <Pill onClick={() => onNavigate('LEARN')}>Course library</Pill>
            <Pill onClick={() => onNavigate('INQUIRY')}>Investigation Studio</Pill>
            <Pill onClick={() => onNavigate('NOTES')}>My notebook</Pill>
            <Pill onClick={() => onNavigate('CLASS_POINTS')}>Class Points</Pill>
            <Pill onClick={() => onNavigate('CHAT')}>Message parents</Pill>
          </div>
        </Section>

        <WellbeingPanel role="teacher" user={user} profile={profile} classes={classes || []} onNavigate={onNavigate} />
        <MediaToolsRow prefsUid={uid} canCustomize onNavigate={onNavigate} title="Studios for your classroom" />

        <EduFeedPanel currentUser={user} profile={profile} eduRole="TEACHER" onOpenFeed={() => onNavigate('EDU_SOCIAL')} />
      </div>
    </div>
  );
};
export default TeacherHub;
