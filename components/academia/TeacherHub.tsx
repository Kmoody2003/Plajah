import React, { useEffect, useMemo, useRef, useState } from 'react';
import CreateEventButton from '../events/CreateEventButton';
import {
  PenTool, ScanLine, Library, Wand2, ClipboardCheck, BarChart3, Users, Plus, AlertTriangle, LayoutGrid, FileText,
  FileBarChart, ShieldCheck, Plug, MessageCircle, Search, Notebook, Microscope, Star, CalendarCheck, Accessibility, CalendarRange, Landmark,
} from 'lucide-react';
import TodayDueFirst from './TodayDueFirst';
import EduFeedPanel from './EduFeedPanel';
import WellbeingPanel from './WellbeingPanel';
import SupportHubCard from './support/SupportHubCard';
import { openSupportCenter } from '../../services/learningSupport';
import StudentDossier from './StudentDossier';
import AttendanceSheet from './AttendanceSheet';
import { DidYouKnow, ExhibitsRow, StudiosRow, LoreaShelf, CurriculumShowcase, AcademiaResponsiveStyles } from './AcademiaShowcase';
import { fetchClassrooms, enrollInClassroom } from '../../services/backendService';
import { loadTeacherMetrics, type TeacherMetrics } from '../../services/academiaStats';
import { listMyTemplates, lessonLink, fetchTeacherReviewQueue, type ReviewItem } from '../../services/assignmentTemplateService';
import { loadTeacherRoster, type RosterStudent } from '../../services/academiaDossier';
import type { AssignmentTemplate } from '../../data/assignmentTemplates';

/**
 * Teacher hub (ACADEMIA_HOME for teachers), top to bottom:
 *   1. Profile band + toolbox row — every tool one tap away, attendance first
 *   2. Recent work — what you last built and what's waiting to grade
 *   3. Search, dead center — type a student's name, their Student Dossier opens in place
 *   4. Lesson hooks, Ora class weather, class performance
 *   5. Exhibitions, studios, Lorea and the flagship curriculums further down
 * Everything on this screen reads live data for the signed-in account; nothing is demo.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; isAdminLens?: boolean }

const go = (onNavigate: (v: string) => void, tab: string) => {
  try { sessionStorage.setItem('plajah:teacherTab', tab); } catch { /* private mode */ }
  onNavigate('TEACHER_TOOLS');
};

interface ToolDef { label: string; meta?: string; icon: React.ComponentType<{ size?: number }>; color: string; tab?: string; view?: string; onClick?: () => void }

const Eyebrow: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="text-[11px] font-black uppercase tracking-[0.25em] text-white/60 mb-3">{children}</h2>
);
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const ago = (t: number) => { const h = Math.round((Date.now() - t) / 3_600_000); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
const lift = 'transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_14px_40px_-12px_rgba(255,140,0,0.35)] hover:border-[#FF8C00]/45';

const TeacherHub: React.FC<Props> = ({ user, profile, onNavigate, isAdminLens }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const first = (profile?.displayName || 'Teacher').split(' ')[0];
  const [classes, setClasses] = useState<any[] | null>(null);
  const [m, setM] = useState<TeacherMetrics | null>(null);
  const [templates, setTemplates] = useState<AssignmentTemplate[] | null>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<RosterStudent | null>(null);
  const [msg, setMsg] = useState('');
  /** Open attendance sheet: undefined = closed, '' = default class, id = that class. */
  const [attFor, setAttFor] = useState<string | undefined>(undefined);
  const [attVersion, setAttVersion] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dossierRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!uid) { setClasses([]); setRoster([]); return; }
    const all: any[] = await fetchClassrooms().catch(() => []);
    const mine = (all || []).filter(c => c?.ownerId === uid);
    setClasses(mine);
    loadTeacherMetrics(uid, mine).then(setM).catch(() => {});
    loadTeacherRoster(mine).then(setRoster).catch(() => setRoster([]));
    listMyTemplates(uid).then(t => setTemplates([...t].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)))).catch(() => setTemplates([]));
    fetchTeacherReviewQueue(uid, 20).then(setQueue).catch(() => {});
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  // "/" focuses search from anywhere on the page, like the rest of Plajah's search fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const joinOwn = async (classId: string) => {
    await enrollInClassroom(classId).catch(() => {});
    setMsg('You are enrolled in your own class. Switch to Student to see its homework.');
    void load();
  };

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => (roster || []).filter(s => !needle || s.name.toLowerCase().includes(needle) || (s.username || '').toLowerCase().includes(needle)).slice(0, needle ? 12 : 6), [roster, needle]);
  const classMatches = useMemo(() => (needle ? (m?.classes || []).filter(c => c.title.toLowerCase().includes(needle)) : []), [m, needle]);
  const pick = (s: RosterStudent) => { setSel(s); setTimeout(() => dossierRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };

  const t = m?.totals;
  const tools: ToolDef[] = [
    { label: 'Take attendance', meta: 'Today', icon: CalendarCheck, color: '#60A5FA', onClick: () => ((classes || []).length ? setAttFor(sel?.classIds[0] || '') : onNavigate('CLASSROOMS')) },
    { label: 'Year curriculum', meta: '180 days · Math & ELA', icon: CalendarRange, color: '#F5B83D', view: 'ACADEMIA_YEAR' },
    { label: 'Education Council', meta: 'Global educators', icon: Landmark, color: '#c4b5fd', view: 'EDUCATION_COUNCIL' },
    { label: 'Build a lesson', meta: templates ? `${templates.length} saved` : undefined, icon: PenTool, color: '#FF8C00', tab: 'templates' },
    { label: 'Scan worksheet', meta: 'Paper to digital', icon: ScanLine, color: '#06D6A0', tab: 'worksheet' },
    { label: 'Plan from mastery', meta: 'Find the gaps', icon: Wand2, color: '#FF6FA8', tab: 'plan' },
    { label: 'Gradebook', meta: t?.awaiting ? `${t.awaiting} to grade` : 'All caught up', icon: BarChart3, color: '#F5B83D', tab: 'grade' },
    { label: 'Assess work', meta: 'Rubrics', icon: ClipboardCheck, color: '#c4b5fd', tab: 'assess' },
    { label: 'Checks', meta: 'For understanding', icon: LayoutGrid, color: '#60A5FA', tab: 'checks' },
    { label: 'Planner', meta: 'Lesson plans', icon: FileText, color: '#00DAF3', tab: 'planner' },
    { label: 'Content library', meta: 'Rights-cleared', icon: Library, color: '#a78bfa', tab: 'library' },
    { label: 'Reports', meta: 'Progress', icon: FileBarChart, color: '#06D6A0', tab: 'reports' },
    { label: 'Integrity', meta: 'Original work', icon: ShieldCheck, color: '#60A5FA', tab: 'integrity' },
    { label: 'Learning support', meta: 'IEP · 504 plans', icon: Accessibility, color: '#00DAF3', onClick: () => openSupportCenter(onNavigate, { tab: 'plan' }) },
    { label: 'Integrations', meta: 'Google · Clever', icon: Plug, color: '#FFB266', tab: 'connect' },
    { label: 'Investigate', meta: 'Inquiry studio', icon: Microscope, color: '#06D6A0', view: 'INQUIRY' },
    { label: 'Class Points', meta: 'Celebrate', icon: Star, color: '#F5B83D', view: 'CLASS_POINTS' },
    { label: 'My notebook', meta: 'Notes', icon: Notebook, color: '#c4b5fd', view: 'NOTES' },
    { label: 'Message parents', meta: 'Inbox', icon: MessageCircle, color: '#FF6FA8', view: 'CHAT' },
  ];
  const recent = [
    ...queue.slice(0, 2).map(r => ({ key: r.submissionId, kind: 'To grade', color: '#FF6FA8', title: r.title, meta: `${r.studentName} · ${ago(r.submittedAt)}`, img: '/academia/kingdoms.jpg', onClick: () => go(onNavigate, 'assess') })),
    ...(templates || []).slice(0, 4).map((tp, i) => ({ key: tp.id, kind: 'Lesson', color: '#00DAF3', title: tp.structure?.title || 'Untitled lesson', meta: `${tp.subject} · edited ${ago(tp.updatedAt || tp.createdAt)}`, img: ['/academia/archipelago.jpg', '/academia/ginkgo.jpg', '/academia/pillars.jpg', '/academia/baobab.jpg'][i % 4], onClick: () => go(onNavigate, 'templates') })),
  ].slice(0, 4);

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <AcademiaResponsiveStyles />
      <div className="acad-tight max-w-[1360px] mx-auto px-4 sm:px-8 py-6">

        {/* Profile band */}
        <section className="relative rounded-[28px] overflow-hidden border border-white/10">
          <img src="/academia/archipelago.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-55" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,10,15,0.96) 0%, rgba(10,10,15,0.75) 45%, rgba(10,10,15,0.2) 100%)' }} />
          <div className="relative flex flex-wrap items-center justify-between gap-5 sm:gap-6 px-4 sm:px-10 py-6 sm:py-8">
            <div className="flex items-center gap-5 min-w-0">
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="" className="w-16 h-16 sm:w-[76px] sm:h-[76px] shrink-0 rounded-[22px] object-cover shadow-[0_0_0_4px_rgba(255,140,0,0.25)]" />
                : <div className="w-16 h-16 sm:w-[76px] sm:h-[76px] shrink-0 rounded-[22px] bg-[#FF8C00] text-[#0a0a0f] grid place-items-center text-[28px] font-black shadow-[0_0_0_4px_rgba(255,140,0,0.25),0_20px_50px_-10px_rgba(255,140,0,0.6)]" style={{ fontFamily: 'Outfit' }}>{initials(profile?.displayName || 'T')}</div>}
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FFB266]">Teacher Studio</p>
                <h1 className="text-[26px] sm:text-[42px] font-black leading-[1.05] mt-1" style={{ fontFamily: 'Outfit' }}>Good to see you, {first}</h1>
                <p className="text-[14px] text-white/70 mt-1">{classes === null ? 'Loading your classes…' : `${classes.length} class${classes.length === 1 ? '' : 'es'}${t ? ` · ${t.students} students` : ''}`}</p>
              </div>
            </div>
            <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
              <div className="grid grid-cols-3 gap-2.5">
              {[
                { v: t ? t.awaiting : '…', l: 'waiting on you', c: '#FFB266' },
                { v: t ? (t.avgMastery == null ? '—' : `${t.avgMastery}%`) : '…', l: 'class mastery', c: '#06D6A0' },
                { v: t ? t.atRisk : '…', l: 'need support', c: '#ff8aa3' },
              ].map(s => (
                <div key={s.l} className="px-3 sm:px-4 py-3 rounded-2xl bg-[#0a0a0f]/70 border border-white/[0.12]"><div className="text-[24px] font-black" style={{ color: s.c, fontFamily: 'Outfit' }}>{s.v}</div><div className="text-[12px] text-white/65">{s.l}</div></div>
              ))}
              </div>
              <CreateEventButton compact label="Plan a class event" host={{ kind: 'teacher', id: uid, label: first ? `${first}’s class` : 'My class' }} />
            </div>
          </div>
        </section>

        {/* Toolbox row */}
        <section className="mt-7" aria-labelledby="tools-h">
          <Eyebrow id="tools-h">Your toolbox</Eyebrow>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {tools.map(tl => (
              <button key={tl.label} type="button" onClick={() => (tl.onClick ? tl.onClick() : tl.tab ? go(onNavigate, tl.tab) : onNavigate(tl.view!))}
                className={`shrink-0 w-[132px] h-[132px] rounded-[20px] bg-white/[0.04] border border-white/10 p-3.5 text-left flex flex-col justify-between ${lift}`}>
                <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `${tl.color}24`, color: tl.color }}><tl.icon size={21} /></span>
                <span><span className="block text-[14px] font-bold leading-tight">{tl.label}</span>{tl.meta && <span className="block text-[12px] mt-0.5" style={{ color: tl.color }}>{tl.meta}</span>}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent work */}
        <section className="mt-6" aria-labelledby="recent-h">
          <Eyebrow id="recent-h">Recent work</Eyebrow>
          {recent.length === 0 && templates !== null && <p className="text-[13px] text-white/55">Lessons you build and work waiting to grade show up here.</p>}
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
            {recent.map(r => (
              <button key={r.key} type="button" onClick={r.onClick} className={`text-left flex gap-3 items-center p-2.5 rounded-[18px] bg-white/[0.04] border border-white/10 ${lift}`}>
                <img src={r.img} alt="" className="w-[72px] h-[72px] rounded-xl object-cover shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: r.color }}>{r.kind}</span>
                  <span className="block font-bold text-[15px] my-0.5 truncate">{r.title}</span>
                  <span className="block text-[12px] text-white/60 truncate">{r.meta}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <TodayDueFirst uid={uid} role="teacher"
              onOpenAssignment={(id) => { try { window.history.pushState({}, '', lessonLink(id)); } catch { /* non-fatal */ } onNavigate('STUDENT_LESSON'); }}
              onNavigate={(v) => (v === 'TEACHER_TOOLS' ? go(onNavigate, 'assess') : onNavigate(v))} />
          </div>
        </section>

        {/* Search, dead center */}
        <section className="mt-14 flex flex-col items-center text-center" aria-labelledby="find-h">
          <h2 id="find-h" className="text-[26px] sm:text-[38px] font-black" style={{ fontFamily: 'Outfit' }}>Find any student or class</h2>
          <p className="text-[15px] text-white/65 mt-2 mb-5">Type a name. Their whole picture opens right here: grades, work, mastery and messages.</p>
          <label htmlFor="teacher-find" className="sr-only">Search students and classes</label>
          <div className="w-full max-w-[760px] flex items-center gap-3 px-4 sm:px-5 h-[60px] sm:h-[72px] rounded-full bg-[#14131b] border-2 border-white/[0.14] focus-within:border-[#FF8C00] focus-within:shadow-[0_0_0_6px_rgba(255,140,0,0.14),0_30px_80px_-30px_rgba(255,140,0,0.5)] transition-all">
            <Search size={26} className="text-[#FF8C00] shrink-0" aria-hidden="true" />
            <input id="teacher-find" ref={searchRef} type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter' && matches[0]) pick(matches[0]); }}
              placeholder={roster && roster.length ? `Try “${roster[0].name.split(' ')[0]}”` : 'Search your students'}
              className="flex-1 min-w-0 bg-transparent outline-none text-[17px] sm:text-[20px] font-medium placeholder:text-white/45" />
            <kbd className="hidden sm:inline font-mono text-[12px] text-white/55 border border-white/20 rounded-lg px-2 py-1">/</kbd>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3.5 max-w-[760px]">
            <span className="self-center text-[12px] text-white/55">
              {roster === null ? 'Loading your roster…' : roster.length === 0 ? 'Add students to a class and they appear here.' : needle ? (matches.length || classMatches.length ? `${matches.length + classMatches.length} match${matches.length + classMatches.length === 1 ? '' : 'es'}` : 'No one matches') : 'Your students:'}
            </span>
            {matches.map(s => {
              const on = sel?.uid === s.uid;
              return (
                <button key={s.uid} type="button" onClick={() => pick(s)} aria-pressed={on}
                  className={`min-h-[44px] inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full text-[14px] font-semibold border ${on ? 'bg-[#FF8C00]/15 border-[#FF8C00]' : 'bg-white/[0.04] border-white/[0.14]'}`}>
                  {s.photo ? <img src={s.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-black text-[#0a0a0f] bg-[#FFB266]">{initials(s.name)}</span>}
                  {s.name} <span className="font-normal text-white/55">· {s.classTitles[0]}</span>
                </button>
              );
            })}
            {classMatches.map(c => (
              <button key={c.classId} type="button" onClick={() => onNavigate('CLASSROOMS')} className="min-h-[44px] px-4 rounded-full text-[14px] font-semibold text-[#FFB266] bg-[#FF8C00]/[0.08] border border-[#FF8C00]/35">Class · {c.title}</button>
            ))}
          </div>
        </section>

        <div ref={dossierRef} className="scroll-mt-6">
          {sel && uid && <StudentDossier key={sel.uid} teacherUid={uid} student={sel} onNavigate={onNavigate} onClose={() => setSel(null)} onTakeAttendance={() => setAttFor(sel.classIds[0] || '')} attendanceVersion={attVersion} />}
        </div>

        <div className="mt-14 acad-fold-gap">
          <DidYouKnow role="teacher" onNavigate={onNavigate} />
          <WellbeingPanel role="teacher" user={user} profile={profile} classes={classes || []} onNavigate={onNavigate} />
          <SupportHubCard role="teacher" uid={uid} onNavigate={onNavigate} />
        </div>

        {/* Class performance */}
        <section className="mt-10 mb-12" aria-labelledby="classes-h">
          <Eyebrow id="classes-h">Your classes</Eyebrow>
          <div className="rounded-[22px] bg-white/[0.03] border border-white/10 overflow-hidden">
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
                <div key={c.classId} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold truncate">{c.title}</p>
                    <p className="text-[12px] text-white/55">{c.enrolled} students · {c.submitted} submitted · {c.graded} graded{c.awaiting ? ` · ${c.awaiting} waiting` : ''}</p>
                  </div>
                  <div className="w-36 hidden sm:block">
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#06D6A0]" style={{ width: `${c.avgMastery ?? 0}%` }} /></div>
                    <p className="text-[11px] text-white/55 mt-1 text-right">{c.avgMastery == null ? 'nothing graded' : `${c.avgMastery}% mastery`}</p>
                  </div>
                  <button type="button" onClick={() => setAttFor(c.classId)} className="min-h-[36px] px-3 rounded-full border border-[#60A5FA]/40 text-[#93C5FD] text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0"><CalendarCheck size={13} /> <span className="hidden sm:inline">Attendance</span></button>
                  {c.atRisk > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#ff8aa3] bg-[#ff6b8a]/10 border border-[#ff6b8a]/30 rounded-full px-2 py-1"><AlertTriangle size={11} />{c.atRisk}</span>}
                  {isAdminLens && !enrolledSelf && (
                    <button type="button" onClick={() => joinOwn(c.classId)} className="text-[10px] font-black uppercase tracking-wider text-white/60 border border-white/15 rounded-full px-2.5 py-1 hover:bg-white/10" title="Enroll yourself so you can test the student side of this class">Test as student</button>
                  )}
                </div>
              );
            })}
          </div>
          {msg && <p role="status" className="text-[12px] text-[#06D6A0] mt-2">{msg}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={() => onNavigate('CLASSROOMS')} className="text-[12px] font-bold rounded-full border border-white/15 px-4 py-2 hover:bg-white/10">Manage classes &amp; roster</button>
            <button type="button" onClick={() => onNavigate('LEARN')} className="text-[12px] font-bold rounded-full border border-white/15 px-4 py-2 hover:bg-white/10">Course library</button>
          </div>
        </section>

        <ExhibitsRow role="teacher" onNavigate={onNavigate} />
        <StudiosRow role="teacher" onNavigate={onNavigate} prefsUid={uid} />
        <LoreaShelf role="teacher" onNavigate={onNavigate} />
        <CurriculumShowcase role="teacher" onNavigate={onNavigate} />

        <EduFeedPanel currentUser={user} profile={profile} eduRole="TEACHER" onOpenFeed={() => onNavigate('EDU_SOCIAL')} />
      </div>
      {attFor !== undefined && uid && (classes || []).length > 0 && (
        <AttendanceSheet teacherUid={uid} classes={classes || []} roster={roster || []} initialClassId={attFor || undefined}
          onClose={() => setAttFor(undefined)} onSaved={() => setAttVersion(v => v + 1)} />
      )}
    </div>
  );
};
export default TeacherHub;
