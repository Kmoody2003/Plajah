import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, ChevronRight, X, Play, BookOpen } from 'lucide-react';
import ContentStatusBadge from '../ContentStatusBadge';
import { isComingSoon } from '../../services/contentStatus';
import { SUBJECTS, COURSES, THREADS, coursesIn, loadCurriculum, contextCourseForGrade, type Course } from '../../services/courseCatalog';
import { skillsForBand, contextItems } from '../../services/mathInContext';
import { loadMastery, rollup, levelFor, levelMeta, lessonKey, mathKey, type SkillMap } from '../../services/mastery';
import { hasBank, loadBank } from '../../data/practice';
import type { Question } from '../../data/practice/types';
import type { Curriculum } from '../../services/schoolChassis';
import { loadMathTopics, loadMathPool } from '../../services/mathPractice';
import PracticeView, { type PracticeItem } from './PracticeView';
import AccuracyBadge from './AccuracyBadge';
import LessonReader from './LessonReader';
import { getRoleLens } from '../../services/roleLens';
import { useSchoolProfile } from '../../hooks/useSchoolProfile';
import { filterServable } from '../../services/contentIntegrity';
import { STAGE_LABEL, STAGE_ORDER } from '../../data/lawMedicineRoster';
import { loadOpenImpacts, byLesson } from '../../services/livingKnowledge/client';
import type { Impact } from '../../services/livingKnowledge/types';
import DevelopmentsPanel from './DevelopmentsPanel';

/**
 * LEARN — every school and course on Plajah in one map, for ANYONE (self-learners included).
 * Subjects -> courses -> units -> skills, each skill showing a mastery level (Attempted / Familiar /
 * Proficient / Mastered) and a Practice button. Opening a course's full lesson reader / studio goes
 * to its own screen. No account type, school or role is required.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; onBack?: () => void }

const toItem = (q: Question): PracticeItem => ({
  id: q.id, prompt: q.prompt, choices: q.kind === 'tf' ? ['True', 'False'] : (q.choices || []), answer: q.answer, hint: q.hint, explanation: q.explanation, level: q.level,
});

interface Unit { id: string; title: string; skills: Array<{ key: string; title: string; sub?: string; body?: string; lessonId?: string; practice: () => Promise<PracticeItem[]>; canPractice: boolean; record?: { standardIds?: string[]; framework?: string; evidence?: string } }> }

const LearnMapView: React.FC<Props> = ({ user, profile, onNavigate, onBack }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [map, setMap] = useState<SkillMap>({});
  const [curricula, setCurricula] = useState<Record<string, Curriculum>>({});
  const [banks, setBanks] = useState<Record<string, Record<string, Question[]>>>({});
  const [mathTopics, setMathTopics] = useState<Record<number, string[]>>({});
  const { sp } = useSchoolProfile(profile);
  const [reading, setReading] = useState<null | { course: Course; skill: Unit['skills'][number] }>(null);
  const [q, setQ] = useState('');
  /** Ladder courses whose content has not been published yet are hidden rather than shown empty. */
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [impacts, setImpacts] = useState<Record<string, Impact[]>>({});
  const [open, setOpen] = useState<Course | null>(null);
  const [practice, setPractice] = useState<null | { title: string; subtitle?: string; accent: string; key: string; pool: PracticeItem[]; courseId?: string; record?: Unit['skills'][number]['record'] }>(null);

  useEffect(() => {
    let alive = true;
    loadMastery(uid).then(m => alive && setMap(m));
    loadMathTopics().then(t => alive && setMathTopics(t.byGrade)).catch(() => {});
    COURSES.filter(c => c.curriculumId).forEach(async c => {
      const cur = await loadCurriculum(c.curriculumId!);
      if (alive && cur) setCurricula(s => ({ ...s, [c.curriculumId!]: cur }));
      else if (alive && c.stage) setUnavailable(s => new Set(s).add(c.id));
      if (hasBank(c.curriculumId!)) {
        const b = await loadBank(c.curriculumId!);
        if (alive && b) {
          const byLesson: Record<string, Question[]> = {};
          for (const qu of filterServable(b.questions)) (byLesson[qu.lessonId] ||= []).push(qu);
          setBanks(s => ({ ...s, [c.curriculumId!]: byLesson }));
        }
      }
    });
    return () => { alive = false; };
  }, [uid]);

  const unitsFor = (c: Course): Unit[] => {
    if (c.kind === 'curriculum') {
      const cur = curricula[c.curriculumId!]; if (!cur) return [];
      const byLesson = banks[c.curriculumId!] || {};
      return cur.tracks.map(t => ({
        id: t.id, title: t.title,
        skills: t.lessons.map(l => ({
          key: lessonKey(cur.id, l.id), title: l.title, sub: l.minutes ? `${l.minutes} min` : undefined, body: l.body || l.blurb, lessonId: l.id,
          canPractice: !!byLesson[l.id]?.length,
          practice: async () => (byLesson[l.id] || []).map(toItem),
          record: { standardIds: l.standardIds, framework: cur.framework || cur.id, evidence: `${cur.id}/${l.id}` },
        })),
      }));
    }
    if (c.kind === 'math') {
      const topics = mathTopics[c.grade!] || [];
      return topics.length ? [{
        id: `g${c.grade}`, title: c.title,
        skills: topics.map(t => ({ key: mathKey(c.grade!, t), title: t, canPractice: true, practice: () => loadMathPool(c.grade!, t) })),
      }] : [];
    }
    if (c.kind === 'context') {
      const skills = skillsForBand(c.band!);
      const groups: Array<[string, string]> = [['shop', 'Money and business'], ['music', 'Music'], ['film', 'Film'], ['sports', 'Sports']];
      return groups.map(([t, label]) => ({
        id: `${c.id}-${t}`, title: label,
        skills: skills.filter(x => x.topic === t).map(x => ({ key: `ctx:${x.id}`, title: x.title, sub: x.realWorld, canPractice: true, practice: async () => contextItems(x.id, 20) })),
      })).filter(u => u.skills.length > 0);
    }
    return [];
  };

  const courseOf = (curriculumId: string) => COURSES.find(c => c.curriculumId === curriculumId);
  const connectionHooks = {
    resolve: (courseId: string, lessonId: string) => {
      const cur = curricula[courseId]; const c = courseOf(courseId); if (!cur || !c) return null;
      const l = cur.tracks.flatMap(t => t.lessons).find(x => x.id === lessonId); return l ? { title: l.title, course: c.title } : null;
    },
    onOpenLesson: (courseId: string, lessonId: string) => {
      const c = courseOf(courseId); if (!c) return;
      const skill = unitsFor(c).flatMap(u => u.skills).find(sk => sk.lessonId === lessonId); if (skill) setReading({ course: c, skill });
    },
    onOpenLabs: (id: string) => { try { window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: id } })); } catch { /* */ } },
  };

  const keysFor = (c: Course): string[] => unitsFor(c).flatMap(u => u.skills.map(s => s.key));

  useEffect(() => {
    if (!open?.stage) return; let alive = true;
    loadOpenImpacts(open.id).then(rows => alive && setImpacts(s => ({ ...s, [open.id]: rows })));
    return () => { alive = false; };
  }, [open]);

  const matches = (c: Course) => !q.trim() || `${c.title} ${c.blurb}`.toLowerCase().includes(q.trim().toLowerCase());

  const openCourse = (c: Course) => {
    if (isComingSoon(c)) return;
    if (c.kind === 'link') {
      if (c.labsDiscipline) { try { window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: c.labsDiscipline } })); } catch { /* */ } return; }
      onNavigate(c.view); return;
    }
    setOpen(c);
  };

  const startPractice = async (c: Course, s: Unit['skills'][number]) => {
    const pool = await s.practice();
    if (!pool.length) return;
    setPractice({ title: s.title, subtitle: c.title, accent: c.accent, key: s.key, pool, record: s.record, courseId: c.curriculumId || c.id });
  };

  // Courses touched most recently, for the "Keep going" strip.
  const recent = useMemo(() => {
    const rows = COURSES.filter(c => c.kind !== 'link').map(c => {
      const ks = keysFor(c); const times = ks.map(k => map[k]?.updatedAt || 0);
      return { c, t: Math.max(0, ...times), r: rollup(ks, map) };
    }).filter(x => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 3);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, curricula, mathTopics]);

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <div className="max-w-6xl mx-auto px-5 py-7">
        <div className="flex items-center gap-3 mb-2">
          {onBack && <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full grid place-items-center bg-white/5 hover:bg-white/10"><ArrowLeft size={18} /></button>}
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#3FB98E]">Plajah Learn</p>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">Learn anything. Free, for everyone.</h1>
        <p className="text-white/55 text-sm mt-1 mb-5">Every school and course on Plajah in one place. Practice for instant feedback, build mastery, and pick up where you left off, whether or not you're in a class.</p>

        <div className="relative max-w-md mb-7">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses (algebra, civics, film...)" aria-label="Search courses"
            className="w-full rounded-full bg-white/[0.06] border border-white/10 pl-10 pr-4 py-2.5 text-sm placeholder:text-white/35 focus:outline-none focus:border-white/30" />
        </div>

        {recent.length > 0 && !q && (
          <section className="mb-9" aria-label="Keep going">
            <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">Keep going</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {recent.map(({ c, r }) => (
                <button key={c.id} type="button" onClick={() => openCourse(c)} className="text-left rounded-2xl border border-white/10 p-4 hover:bg-white/[0.07] transition-colors" style={{ background: `linear-gradient(150deg, ${c.accent}22, rgba(255,255,255,0.02))` }}>
                  <p className="font-black">{c.emoji} {c.title}</p>
                  <div className="h-1.5 rounded-full bg-white/10 mt-3 overflow-hidden"><div className="h-full" style={{ width: `${r.pct}%`, background: c.accent }} /></div>
                  <p className="text-[11px] text-white/50 mt-1.5">{r.pct}% mastery · {r.started} skills started</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {!q && (
          <section className="mb-9" aria-label="Learning threads">
            <div className="mb-3"><h2 className="text-lg font-black">🧵 Learning threads</h2><p className="text-[12px] text-white/50">Subjects work better together. Pick a goal and follow it across math, reading, history, money and making.</p></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {THREADS.map(t => (
                <div key={t.id} className="rounded-2xl border border-white/10 p-4 min-w-0 overflow-hidden" style={{ background: `linear-gradient(155deg, ${t.accent}22 0%, rgba(255,255,255,0.025) 70%)` }}>
                  <p className="font-black">{t.emoji} {t.title}</p>
                  <p className="text-[12px] text-white/55 mt-0.5 mb-3">{t.blurb}</p>
                  <ol className="grid gap-1.5">
                    {t.steps.map((st, i) => (
                      <li key={i}>
                        <button type="button" title={st.why} onClick={() => { if (st.courseId) { const c = COURSES.find(x => x.id === st.courseId); if (c) openCourse(c); } else if (st.view) onNavigate(st.view); }}
                          className="w-full text-left flex items-center gap-2.5 rounded-xl bg-black/20 hover:bg-white/10 px-3 py-2 transition-colors">
                          <span className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-black shrink-0" style={{ background: t.accent, color: '#0a0a0f' }}>{i + 1}</span>
                          <span className="min-w-0"><span className="block text-[12px] font-black truncate">{st.label}</span><span className="block text-[10px] text-white/45 truncate">{st.why}</span></span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {!q && (
          <section className="mb-9" aria-label="Interactive atlases">
            <div className="mb-3"><h2 className="text-lg font-black">🔬 Interactive atlases</h2><p className="text-[12px] text-white/50">Take it apart, run it, see how it works.</p></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button type="button" onClick={() => onNavigate('MACHINE_ATLAS')} className="text-left rounded-2xl border border-white/10 p-4 hover:-translate-y-0.5 hover:border-white/25 transition-all group" style={{ background: 'linear-gradient(155deg, rgba(255,140,0,0.22) 0%, rgba(255,255,255,0.025) 70%)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">⚙️</span>
                  <div className="min-w-0 flex-1"><p className="font-black leading-tight">Machine Atlas</p><p className="text-[12px] text-white/55 leading-snug mt-0.5">Trades and machines in 3D: explode the parts, run fault scenarios.</p></div>
                  <ChevronRight size={16} className="text-white/30 group-hover:text-white/70 mt-1" />
                </div>
              </button>
              <button type="button" onClick={() => onNavigate('CELL_ATLAS')} className="text-left rounded-2xl border border-white/10 p-4 hover:-translate-y-0.5 hover:border-white/25 transition-all group" style={{ background: 'linear-gradient(155deg, rgba(212,0,85,0.2) 0%, rgba(255,255,255,0.025) 70%)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">🧬</span>
                  <div className="min-w-0 flex-1"><p className="font-black leading-tight">Cell &amp; Brain Atlas</p><p className="text-[12px] text-white/55 leading-snug mt-0.5">Red blood cell to neuron, at three levels of depth.</p><span className="inline-block mt-2 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ background: 'var(--pj-warning-soft)', color: 'var(--pj-warning)', border: '1px solid var(--pj-warning)' }}>Under review</span></div>
                  <ChevronRight size={16} className="text-white/30 group-hover:text-white/70 mt-1" />
                </div>
              </button>
            </div>
          </section>
        )}

        {SUBJECTS.map(s => {
          const cs = coursesIn(s.id).filter(matches).filter(c => !unavailable.has(c.id));
          if (!cs.length) return null;
          const card = (c: Course) => {
            const ks = c.kind === 'link' ? [] : keysFor(c); const r = rollup(ks, map);
            return (
              <button key={c.id} type="button" onClick={() => openCourse(c)} disabled={isComingSoon(c)} aria-disabled={isComingSoon(c)}
                className={`text-left rounded-2xl border border-white/10 p-4 transition-all group ${isComingSoon(c) ? 'opacity-60 cursor-default' : 'hover:-translate-y-0.5 hover:border-white/25'}`}
                style={{ background: `linear-gradient(155deg, ${c.accent}26 0%, rgba(255,255,255,0.025) 70%)` }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black leading-tight">{c.title}</p>
                    <p className="text-[12px] text-white/55 leading-snug mt-0.5 line-clamp-2">{c.blurb}</p>
                    {c.status && c.status !== 'LIVE' && <div className="mt-1.5"><ContentStatusBadge status={c.status} /></div>}
                  </div>
                  {!isComingSoon(c) && <ChevronRight size={16} className="text-white/30 group-hover:text-white/70 mt-1" />}
                </div>
                {c.kind !== 'link' && ks.length > 0 ? (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full transition-all" style={{ width: `${r.pct}%`, background: c.accent }} /></div>
                    <p className="text-[11px] text-white/45 mt-1.5">{r.pct}% mastery · {ks.length} skills{r.byLevel.mastered + r.byLevel.proficient > 0 ? ` · ${r.byLevel.mastered + r.byLevel.proficient} proficient+` : ''}</p>
                  </div>
                ) : <p className="text-[11px] mt-3 font-black uppercase tracking-widest" style={{ color: isComingSoon(c) ? undefined : c.accent }}>{isComingSoon(c) ? 'Coming soon' : c.kind === 'link' ? 'Open →' : 'Loading…'}</p>}
              </button>
            );
          };
          const grid = (list: Course[]) => <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{list.map(card)}</div>;
          const laddered = cs.some(c => c.stage);
          return (
            <section key={s.id} className="mb-9" aria-label={s.title}>
              <div className="mb-3"><h2 className="text-lg font-black">{s.emoji} {s.title}</h2><p className="text-[12px] text-white/50">{s.blurb}</p></div>
              {laddered ? STAGE_ORDER.map(st => {
                const inStage = cs.filter(c => c.stage === st); if (!inStage.length) return null;
                const groups = [...new Set(inStage.map(c => c.group || ''))];
                return (
                  <div key={st} className="mb-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: s.accent }}>{STAGE_LABEL[st]}</p>
                    {groups.map(g => (
                      <div key={g || 'main'} className="mb-3">
                        {g && <p className="text-[12px] font-bold text-white/60 mb-1.5">{g}</p>}
                        {grid(inStage.filter(c => (c.group || '') === g))}
                      </div>
                    ))}
                  </div>
                );
              }) : grid(cs)}
            </section>
          );
        })}
      </div>

      {open && <CoursePanel course={open} units={unitsFor(open)} map={map} impacts={impacts[open.id] || []} onClose={() => setOpen(null)} onPractice={s => startPractice(open, s)} onRead={s => setReading({ course: open, skill: s })} onOpenCourse={(id) => { const c = COURSES.find(x => x.id === id); if (c) setOpen(c); }} onOpenFull={() => { const c = open; setOpen(null); if (c.id === 'classic-literature') { try { sessionStorage.setItem('plajah:laTab', 'LIBRARY'); } catch { /* */ } } if (c.labsDiscipline) { try { window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: c.labsDiscipline } })); } catch { /* */ } return; } onNavigate(c.view); }} />}
      {reading && reading.skill.body && (
        <LessonReader viewer={uid ? { uid, name: profile?.displayName || profile?.name || user?.displayName || 'A teacher', isTeacher: profile?.accountType === 'TEACHER' || getRoleLens() === 'teacher', school: profile?.schoolName } : undefined} developments={(impacts[reading.course.id] || []).filter(i => i.lessonId === reading.skill.lessonId)} lesson={{ id: reading.skill.lessonId || reading.skill.key, title: reading.skill.title, body: reading.skill.body, courseId: reading.course.curriculumId || reading.course.id, accent: reading.course.accent, courseTitle: reading.course.title, subject: reading.course.subject }}
          school={sp} connections={connectionHooks} canPractice={reading.skill.canPractice} onPractice={() => { const r = reading; setReading(null); void startPractice(r.course, r.skill); }} onClose={() => setReading(null)} />
      )}
      {practice && (
        <PracticeView courseId={practice.courseId} onConnect={(v) => { setPractice(null); setOpen(null); onNavigate(v); }} title={practice.title} subtitle={practice.subtitle} accent={practice.accent} skillKey={practice.key} pool={practice.pool} record={practice.record} uid={uid}
          onClose={(m) => { setPractice(null); if (m) setMap(m); else loadMastery(uid).then(setMap); }} />
      )}
    </div>
  );
};

const CoursePanel: React.FC<{ course: Course; units: Unit[]; map: SkillMap; impacts: Impact[]; onClose: () => void; onPractice: (s: Unit['skills'][number]) => void; onRead: (s: Unit['skills'][number]) => void; onOpenFull: () => void; onOpenCourse?: (id: string) => void }> = ({ course, units, map, impacts, onClose, onPractice, onRead, onOpenFull, onOpenCourse }) => (
  <div role="dialog" aria-modal="true" aria-label={course.title} className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex justify-end" onClick={onClose}>
    <div className="w-full max-w-lg h-full overflow-y-auto bg-[#0e0b16] border-l border-white/10 p-5 sm:p-6" onClick={e => e.stopPropagation()}>
      <div className="flex items-start gap-3 mb-4">
        <span className="text-3xl">{course.emoji}</span>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-black leading-tight">{course.title}</h2><p className="text-[12px] text-white/55 mb-2">{course.blurb}</p>{course.status === 'UNDER_REVIEW' && <><ContentStatusBadge status={course.status} /><p className="text-[11px] text-white/55 mt-1 mb-2">Under review: this content is being checked for accuracy.</p></>}<AccuracyBadge courseId={course.kind === 'math' ? 'math-generated' : course.kind === 'context' ? 'context-math' : course.curriculumId || course.id} /></div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
      </div>
      {course.notice && <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-snug text-white/55">{course.notice}</p>}
      {course.stage && <DevelopmentsPanel rows={impacts} domain={course.subject === 'law' ? 'law' : 'medicine'} accent={course.accent} compact />}
      {course.view !== 'LEARN' && <button type="button" onClick={onOpenFull} className="w-full mb-5 rounded-2xl border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] px-4 py-3 text-sm font-black inline-flex items-center justify-center gap-2"><BookOpen size={16} /> Open the full course</button>}
      {course.kind === 'math' && onOpenCourse && (
        <button type="button" onClick={() => onOpenCourse(contextCourseForGrade(course.grade!))} className="w-full mb-5 rounded-2xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 px-4 py-3 text-[13px] font-black text-[#fbbf24] text-left">See this math at work in a shop, a band and a film →</button>
      )}
      {units.length === 0 && <p className="text-sm text-white/45">Loading skills…</p>}
      {units.map(u => (
        <div key={u.id} className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40 mb-2">{u.title}</p>
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {u.skills.map(s => {
              const lv = levelMeta(levelFor(map[s.key])); const pts = Math.round(map[s.key]?.points ?? 0);
              return (
                <div key={s.key} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: lv.color }} title={lv.label} />
                  <div className="min-w-0 flex-1">
                    {s.body
                      ? <button type="button" onClick={() => onRead(s)} className="text-[13px] font-bold leading-snug text-left hover:underline underline-offset-2">{s.title}</button>
                      : <p className="text-[13px] font-bold leading-snug">{s.title}</p>}
                    <p className="text-[10px] text-white/40">{lv.label}{pts > 0 ? ` · ${pts}%` : ''}{s.sub ? ` · ${s.sub}` : ''}</p>
                  </div>
                  {s.canPractice
                    ? <button type="button" onClick={() => onPractice(s)} className="rounded-full px-3.5 py-1.5 text-[11px] font-black text-black inline-flex items-center gap-1" style={{ background: course.accent }}><Play size={11} /> Practice</button>
                    : <span className="text-[10px] text-white/30">read only</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default LearnMapView;
