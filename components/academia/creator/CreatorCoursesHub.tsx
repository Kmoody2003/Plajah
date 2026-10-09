/**
 * CreatorCoursesHub — landing + studio for creator-taught courses (AppView 'CREATOR_COURSES').
 *
 * One screen, three states:
 *   HOME     — hero, "Your studio" dashboard (when you teach), what-you-get, template quick-starts,
 *              and the public directory of creator courses.
 *   COMMAND  — the per-course control room (CourseCommand) for a course you own.
 *   PAGE     — the public course page / sales page with enroll (also the deep-link target `?course=`).
 *
 * Creator courses are still Academia: same classroom docs, gradebook, roster, live sessions and
 * class chat as school classes. This view is the creator-economy front door to that machinery.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Award, BookOpen, CalendarDays, CheckCircle2, Clock, GraduationCap, Layers, Lock, Megaphone, MessageSquare, PartyPopper,
  PlayCircle, Plus, Radio, Rocket, Search, Sparkles, Star, Users, Wallet,
} from 'lucide-react';
import type { Classroom, UserProfile } from '../../../types';
import { enrollInClassroom } from '../../../services/backendService';
import {
  COURSE_CATEGORIES, COURSE_TEMPLATES, FORMATS, categoryMeta, confirmPaidEnrollment, courseStats, fetchCourse, fetchMyCourses, fetchPublicCourses, money, readiness, startCourseCheckout,
} from '../../../services/creatorCourses';
import CourseStudio from './CourseStudio';
import { chalkBoard, chalkOverlay } from '../../../services/creatorArt';
import CourseCommand from './CourseCommand';
import MotionSwitch from './MotionSwitch';
import { useMotion } from './useMotion';
import { ClassroomDetail } from '../../ClassroomsView';

interface Props {
  profile: UserProfile | null;
  user: any;
  onNavigate: (view: string) => void;
  onBack: () => void;
  onVisitUser?: (uid: string) => void;
  /** Deep link (?course=ID): open this course's public page. */
  initialCourseId?: string | null;
}

type Mode = { k: 'HOME' } | { k: 'COMMAND'; id: string; tab?: any } | { k: 'PAGE'; id: string };

const glass = 'rounded-3xl border border-white/10 bg-white/[0.04]';

export default function CreatorCoursesHub({ profile, user, onNavigate, onBack, onVisitUser, initialCourseId }: Props) {
  const uid: string | undefined = user?.uid || profile?.uid;
  // The in-app Motion switch (Auto / On / Off) decides; Auto defers to the device's reduce-motion setting.
  const mo = useMotion({ uid, saved: profile?.motionPref });
  const calm = !mo.animates;
  /** Staggered rise-in + lift on hover; collapses to nothing for people who ask for less motion. */
  const rise = (i: number) => calm ? {} : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.45, delay: Math.min(i, 6) * 0.06, ease: 'easeOut' as const }, whileHover: { y: -5 }, whileTap: { scale: 0.985 } };
  const [mode, setMode] = useState<Mode>(initialCourseId ? { k: 'PAGE', id: initialCourseId } : { k: 'HOME' });
  const [mine, setMine] = useState<Classroom[]>([]);
  const [pub, setPub] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState<{ template?: string } | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [launched, setLaunched] = useState<{ id: string; title: string; published: boolean } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [m, p] = await Promise.all([uid ? fetchMyCourses(uid).catch(() => []) : Promise.resolve([]), fetchPublicCourses().catch(() => [])]);
    setMine(m); setPub(p); setLoading(false);
  }, [uid]);
  useEffect(() => { reload(); }, [reload]);

  const replaceMine = (c: Classroom) => setMine(list => list.map(x => (x.id === c.id ? c : x)));

  // A just-created course can be opened before the list refetches, so look in both lists first.
  const find = (id: string) => mine.find(c => c.id === id) || pub.find(c => c.id === id);

  const totals = useMemo(() => {
    const s = mine.map(courseStats);
    return { learners: s.reduce((n, x) => n + x.learners, 0), net: s.reduce((n, x) => n + x.net, 0), live: mine.filter(c => c.status !== 'DRAFT').length, drafts: mine.filter(c => c.status === 'DRAFT').length };
  }, [mine]);

  const filtered = pub.filter(c =>
    (cat === 'All' || c.category === cat) &&
    (!q.trim() || `${c.title} ${c.tagline || ''} ${c.ownerName} ${c.category}`.toLowerCase().includes(q.trim().toLowerCase())));

  const openStudio = (template?: string) => {
    if (!uid) { onNavigate('LANDING'); return; }
    setStudio({ template });
  };

  // ── COMMAND ──
  if (mode.k === 'COMMAND') {
    const c = find(mode.id);
    if (c) return <CourseCommand course={c} user={user} profile={profile} initialTab={mode.tab} onBack={() => { setMode({ k: 'HOME' }); reload(); }} onNavigate={onNavigate} onVisitUser={onVisitUser} onChanged={replaceMine} />;
  }

  // ── PAGE ──
  if (mode.k === 'PAGE') {
    return <CoursePage id={mode.id} seed={find(mode.id)} user={user} onBack={() => { setMode({ k: 'HOME' }); reload(); }} onManage={id => setMode({ k: 'COMMAND', id })} onSignIn={() => onNavigate('LANDING')} />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] pb-24">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Warm "yellow chalk" so the drawing never reads as the same colour as the white headline. Quieter on phones, where it sits right behind the copy. */}
        <div className="absolute inset-0 bg-cover bg-right-top opacity-30 sm:opacity-55" style={{ backgroundImage: `url("${chalkBoard('Music', { tint: '#2a1346', strength: 0.55, ink: '#ffd98a' })}")` }} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07070c]/85 via-[#07070c]/55 to-[#07070c]/10 sm:from-[#07070c]/70 sm:via-[#07070c]/30 sm:to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_500px_at_80%_-10%,rgba(212,0,85,0.35),transparent),radial-gradient(900px_500px_at_0%_0%,rgba(107,0,153,0.45),transparent)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-12">
          <div className="flex items-start justify-between gap-3 mb-6">
            <button onClick={onBack} className="flex items-center gap-2 min-h-[44px] text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"><ArrowLeft size={14} /> Academia</button>
            <MotionSwitch className="flex flex-col items-end text-right" />
          </div>
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-white text-[10px] font-black uppercase tracking-[0.25em]"><GraduationCap size={13} /> Plajah Academia · Creator courses</span>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.02] mt-5 text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]">Teach what you know.<br /><span className="bg-gradient-to-r from-[#FFB04A] via-[#FF6FA8] to-[#C4A5FF] bg-clip-text text-transparent">Run it like a real school.</span></h1>
            <p className="text-white/90 text-lg mt-5 max-w-2xl [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">Build a course in minutes, then use everything a school teacher gets: roster, gradebook, live classes and class chat, plus Plajah's marketing toolchest to fill it. You keep {Math.round((1 - 0.05) * 100)}% of every enrollment.</p>
            <div className="flex flex-wrap gap-3 mt-7">
              <button onClick={() => openStudio()} className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] font-black flex items-center gap-2 hover:scale-[1.02] transition-transform"><Plus size={18} /> Create a course</button>
              <button onClick={() => document.getElementById('cc-directory')?.scrollIntoView({ behavior: 'smooth' })} className="px-6 py-3.5 rounded-2xl bg-white/10 font-bold hover:bg-white/20 flex items-center gap-2"><Search size={16} /> Browse courses</button>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-14">
        {launched && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 flex flex-wrap items-center gap-4">
            <CheckCircle2 className="text-emerald-300" />
            <div className="flex-1 min-w-[200px]"><div className="font-black">{launched.published ? `“${launched.title}” is live!` : `“${launched.title}” saved as a draft.`}</div><div className="text-sm text-white/60">{launched.published ? 'Now tell people. Your posts, invite and email are already written.' : 'Finish it any time from your studio.'}</div></div>
            <button className="px-4 py-2.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest" onClick={() => { setMode({ k: 'COMMAND', id: launched.id, tab: launched.published ? 'PROMOTE' : 'CURRICULUM' }); setLaunched(null); }}>{launched.published ? 'Promote it' : 'Keep building'}</button>
          </motion.div>
        )}

        {/* ── Your studio ── */}
        {uid && (mine.length > 0 || loading) && (
          <section aria-labelledby="studio-h">
            <div className="flex items-end justify-between mb-5">
              <h2 id="studio-h" className="text-2xl font-black tracking-tight">Your studio</h2>
              <button onClick={() => openStudio()} className="text-[11px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-1.5"><Plus size={14} /> New course</button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { l: 'Learners', v: String(totals.learners), i: Users },
                { l: 'You earned', v: money(totals.net), i: Wallet },
                { l: 'Live courses', v: String(totals.live), i: Rocket },
                { l: 'Drafts', v: String(totals.drafts), i: Layers },
              ].map(k => (<div key={k.l} className={`${glass} p-4`}><k.i size={16} className="text-white/60" /><div className="text-3xl font-black mt-2">{loading ? '…' : k.v}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/40">{k.l}</div></div>))}
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {mine.map((c, ci) => <motion.div key={c.id} {...rise(ci)}><StudioCard c={c} onOpen={() => setMode({ k: 'COMMAND', id: c.id })} onView={() => setMode({ k: 'PAGE', id: c.id })} /></motion.div>)}
            </div>
          </section>
        )}

        {/* ── First-timer path ── */}
        {(!uid || (mine.length === 0 && !loading)) && (
          <section aria-labelledby="start-h">
            <h2 id="start-h" className="text-2xl font-black tracking-tight mb-1">Start in five minutes</h2>
            <p className="text-white/50 text-sm mb-5">Pick a shape. We'll set up the modules, lessons and assignments, and Aria can draft the outline for you.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COURSE_TEMPLATES.filter(t => t.id !== 'blank').map((t, ti) => (
                <motion.button key={t.id} {...rise(ti)} onClick={() => openStudio(t.id)} className={`${glass} overflow-hidden text-left hover:border-white/30`}>
                  <div className="h-28 bg-cover bg-right" style={{ backgroundImage: `url("${chalkBoard(t.id)}")` }} aria-hidden="true" />
                  <div className="p-5">
                    <div className="font-black">{t.emoji} {t.name}</div>
                    <div className="text-sm text-white/50 mt-1">{t.blurb}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-3">{t.sections.length * t.lessonsPerSection} lessons · {FORMATS.find(f => f.id === t.format)?.label}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── What you get ── */}
        <section aria-labelledby="get-h">
          <h2 id="get-h" className="text-2xl font-black tracking-tight mb-5">Everything a school has. Everything a creator needs.</h2>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className={`${glass} p-6 relative overflow-hidden`}>
              <div className="absolute inset-0 bg-cover bg-right opacity-25" style={{ backgroundImage: `url("${chalkBoard('Science', { tint: '#0f2f3a', strength: 0.5, ink: '#9fe9ff' })}")` }} aria-hidden="true" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07070c]/80 via-[#07070c]/50 to-transparent" aria-hidden="true" />
              <div className="relative">
              <div className="flex items-center gap-2 text-[#00DAF3] text-[10px] font-black uppercase tracking-widest mb-4"><GraduationCap size={14} /> Run your class</div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { i: Users, t: 'Roster', d: 'See every learner and how they are doing.' },
                  { i: Award, t: 'Gradebook', d: 'Collect work, score it, leave feedback.' },
                  { i: Radio, t: 'Live classes', d: 'Schedule sessions learners can join.' },
                  { i: MessageSquare, t: 'Class chat', d: 'One thread for your whole class.' },
                  { i: BookOpen, t: 'Academia library', d: 'Pull from Plajah’s curricula and teacher tools.' },
                  { i: Star, t: 'Certificates', d: 'Reward finishers with a shareable credential.', soon: true },
                ].map(f => (
                  <div key={f.t} className="flex gap-3"><div className="w-9 h-9 shrink-0 rounded-xl bg-white/10 flex items-center justify-center"><f.i size={16} /></div><div><div className="font-bold text-sm">{f.t}{(f as any).soon && <span className="ml-2 text-[9px] uppercase tracking-widest text-white/65">soon</span>}</div><div className="text-xs text-white/80">{f.d}</div></div></div>
                ))}
              </div>
              <button onClick={() => onNavigate('TEACHER_TOOLS')} className="mt-5 min-h-[44px] text-[11px] font-black uppercase tracking-widest text-[#00DAF3] hover:underline">Open teacher tools →</button>
              </div>
            </div>
            <div className={`${glass} p-6 relative overflow-hidden`}>
              <div className="absolute inset-0 bg-cover bg-right opacity-25" style={{ backgroundImage: `url("${chalkBoard('Business', { tint: '#3a2208', strength: 0.5, ink: '#ffd98a' })}")` }} aria-hidden="true" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07070c]/80 via-[#07070c]/50 to-transparent" aria-hidden="true" />
              <div className="relative">
              <div className="flex items-center gap-2 text-[#FF8C00] text-[10px] font-black uppercase tracking-widest mb-4"><Megaphone size={14} /> Fill your class</div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { i: PartyPopper, t: 'Launch invite', d: 'An Evite with RSVPs for your kickoff.' },
                  { i: Megaphone, t: 'Social posts', d: 'Written for each network, one tap to copy.' },
                  { i: Sparkles, t: 'Billboards & ads', d: 'Promote on Plajah with the ad packages.' },
                  { i: MessageSquare, t: 'Email', d: 'A ready-made announcement via The Post Man.' },
                ].map(f => (
                  <div key={f.t} className="flex gap-3"><div className="w-9 h-9 shrink-0 rounded-xl bg-white/10 flex items-center justify-center"><f.i size={16} /></div><div><div className="font-bold text-sm">{f.t}</div><div className="text-xs text-white/80">{f.d}</div></div></div>
                ))}
              </div>
              <p className="mt-5 text-xs text-white/40">Open any course and choose Promote.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Directory ── */}
        <section id="cc-directory" aria-labelledby="dir-h">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <h2 id="dir-h" className="text-2xl font-black tracking-tight">Courses from creators</h2>
            <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-3 text-base sm:text-sm placeholder-white/30 focus:outline-none focus:border-white/40" /></div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
            {['All', ...COURSE_CATEGORIES.map(c => c.id)].map(c => (
              <button key={c} onClick={() => setCat(c)} className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full text-xs font-bold border ${cat === c ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:text-white'}`}>{c === 'All' ? 'All' : `${categoryMeta(c).emoji} ${c}`}</button>
            ))}
          </div>
          {loading ? <p className="text-white/40 text-sm py-10 text-center">Loading courses…</p> : filtered.length === 0 ? (
            <div className={`${glass} py-14 text-center`}><div className="mx-auto mb-4 h-32 w-56 rounded-2xl bg-cover bg-center border border-white/10" style={{ backgroundImage: `url("${chalkBoard('Other')}")` }} aria-hidden="true" /><p className="font-black">{pub.length === 0 ? 'No courses yet. Yours could be the first.' : 'Nothing matches that search.'}</p>{pub.length === 0 && <button onClick={() => openStudio()} className="mt-4 px-5 py-2.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest">Create a course</button>}</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{filtered.map((c, ci) => <motion.div key={c.id} {...rise(ci)}><PublicCard c={c} onOpen={() => setMode({ k: 'PAGE', id: c.id })} /></motion.div>)}</div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {studio && (
          <CourseStudio
            key="studio"
            ownerName={profile?.displayName || user?.displayName || 'You'}
            initialTemplate={studio.template}
            hasPayouts={!!profile?.stripeConnectAccountId}
            onClose={() => setStudio(null)}
            onCreated={(course, published) => {
              setStudio(null);
              setMine(m => [course, ...m]);
              setLaunched({ id: course.id, title: course.title, published });
              reload();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function StudioCard({ c, onOpen, onView }: { c: Classroom; onOpen: () => void; onView: () => void }) {
  const s = courseStats(c);
  const r = readiness(c);
  const draft = c.status === 'DRAFT';
  return (
    <div className={`${glass} overflow-hidden flex flex-col`}>
      <button onClick={onOpen} className="relative aspect-video block text-left" aria-label={`Manage ${c.title}`}>
        <img src={c.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${draft ? 'bg-amber-500/90 text-black' : 'bg-emerald-500/90 text-black'}`}>{draft ? 'Draft' : 'Live'}</span>
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <div className="font-black leading-tight line-clamp-2">{c.title}</div>
        <div className="flex gap-4 text-xs text-white/50 mt-2"><span><b className="text-white/80">{s.learners}</b> learners</span><span><b className="text-white/80">{money(s.net)}</b> earned</span></div>
        {draft && <div className="mt-3"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40 mb-1"><span>Ready to launch</span><span>{r.score}%</span></div><div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#D40055] to-[#FF8C00]" style={{ width: `${r.score}%` }} /></div></div>}
        <div className="flex gap-2 mt-4">
          <button onClick={onOpen} className="flex-1 px-3 py-2.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest">Manage</button>
          <button onClick={onView} className="px-3 py-2.5 rounded-xl bg-white/10 text-[11px] font-black uppercase tracking-widest hover:bg-white/20">View page</button>
        </div>
      </div>
    </div>
  );
}

function PublicCard({ c, onOpen }: { c: Classroom; onOpen: () => void }) {
  const m = categoryMeta(c.category);
  const s = courseStats(c);
  return (
    <button onClick={onOpen} className={`${glass} overflow-hidden text-left hover:border-white/30 hover:-translate-y-0.5 transition-all`}>
      <div className="relative aspect-video">
        <img src={c.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-[9px] font-black uppercase tracking-widest">{m.emoji} {c.category}</span>
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#FF8C00] text-[11px] font-black">{money(c.price)}</span>
      </div>
      <div className="p-4">
        <div className="font-black leading-tight line-clamp-2">{c.title}</div>
        {c.tagline && <div className="text-xs text-white/50 mt-1 line-clamp-2">{c.tagline}</div>}
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 mt-3"><span>{c.ownerName}</span><span>·</span><span>{c.lessons.length} lessons</span>{s.learners > 0 && <><span>·</span><span>{s.learners} enrolled</span></>}</div>
      </div>
    </button>
  );
}

// ── Public course page ───────────────────────────────────────────────────────

function CoursePage({ id, seed, user, onBack, onManage, onSignIn }: { id: string; seed?: Classroom; user: any; onBack: () => void; onManage: (id: string) => void; onSignIn: () => void }) {
  useMotion();
  const [c, setC] = useState<Classroom | null>(seed || null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inside, setInside] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCourse(id).then(x => { if (!alive) return; if (x) setC(x); else if (!seed) setMissing(true); }).catch(() => { if (alive && !seed) setMissing(true); });
    return () => { alive = false; };
  }, [id, seed]);

  const uid: string | undefined = user?.uid;
  const [confirming, setConfirming] = useState(false);

  // Returning from Stripe (?enrolled=1) or reopening a course you already paid for: ask the server to
  // finish the seat. The webhook can land a few seconds after the redirect, so this polls briefly.
  const returnedFromCheckout = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('enrolled') === '1';
  const cid = c?.id;
  const alreadyIn = !!(uid && c?.enrolledStudents.includes(uid));
  const isOwnerNow = !!(uid && c?.ownerId === uid);
  useEffect(() => {
    if (!uid || !cid || alreadyIn || isOwnerNow || !(c && c.price > 0)) return;
    let alive = true;
    setConfirming(returnedFromCheckout);
    confirmPaidEnrollment(cid, returnedFromCheckout ? 8 : 1).then(async ok => {
      if (!alive) return;
      if (ok) { const fresh = await fetchCourse(cid).catch(() => null); if (alive && fresh) setC(fresh); }
      setConfirming(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cid, alreadyIn, isOwnerNow]);

  if (missing) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white/60"><p>This course isn't available.</p><button onClick={onBack} className="px-4 py-2 rounded-xl bg-white/10">Back</button></div>;
  if (!c) return <div className="min-h-screen flex items-center justify-center text-white/40">Loading course…</div>;

  const owner = uid === c.ownerId;
  const enrolled = !!uid && c.enrolledStudents.includes(uid);
  const draft = c.status === 'DRAFT';
  const stats = courseStats(c);
  const full = stats.seatsLeft === 0;
  const m = categoryMeta(c.category);

  if (inside) return <ClassroomDetail classroom={c} onBack={() => setInside(false)} user={user} />;
  if (draft && !owner) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white/60"><p>This course isn't published yet.</p><button onClick={onBack} className="px-4 py-2 rounded-xl bg-white/10">Back</button></div>;

  const enroll = async () => {
    if (!uid) { onSignIn(); return; }
    setErr(''); setBusy(true);
    try {
      if (c.price > 0) { await startCourseCheckout(c.id); return; }
      await enrollInClassroom(c.id);
      setC({ ...c, enrolledStudents: [...c.enrolledStudents, uid] });
    } catch (e: any) { setErr(e?.message || 'Could not enroll.'); }
    setBusy(false);
  };

  const sections: Array<[string, typeof c.lessons]> = [];
  [...c.lessons].sort((a, b) => a.order - b.order).forEach(l => {
    const k = l.section || 'Lessons';
    const hit = sections.find(s => s[0] === k);
    if (hit) hit[1].push(l); else sections.push([k, [l]]);
  });

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] pb-32 lg:pb-24">
      <div className="relative">
        <img src={c.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-125" />
        <div className="absolute inset-0 bg-cover bg-right opacity-40 sm:opacity-70" style={{ backgroundImage: `url("${chalkOverlay(c.category, 0.3, true, '#ffd98a')}")` }} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-color)]/85 via-[var(--bg-color)]/50 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/70 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-10">
          <button onClick={onBack} className="flex items-center gap-2 min-h-[44px] text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 mb-6"><ArrowLeft size={14} /> All courses</button>
          <span className="px-3 py-1.5 rounded-lg bg-white/10 text-[10px] font-black uppercase tracking-widest">{m.emoji} {c.category}</span>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.02] mt-4 max-w-3xl text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]">{c.title}</h1>
          {c.tagline && <p className="text-xl text-white/90 mt-3 max-w-2xl [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{c.tagline}</p>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-sm text-white/85">
            <span>by <b className="text-white">{c.ownerName}</b></span>
            <span className="flex items-center gap-1.5"><PlayCircle size={14} /> {c.lessons.length} lessons</span>
            {c.assignments.length > 0 && <span className="flex items-center gap-1.5"><Award size={14} /> {c.assignments.length} assignments</span>}
            <span className="flex items-center gap-1.5"><Layers size={14} /> {FORMATS.find(f => f.id === (c.format || 'SELF_PACED'))?.label}</span>
            {stats.learners > 0 && <span className="flex items-center gap-1.5"><Users size={14} /> {stats.learners} enrolled</span>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 grid lg:grid-cols-[1fr_340px] gap-10">
        <main className="space-y-10 min-w-0">
          {!!c.outcomes?.length && (
            <section><h2 className="text-xl font-black mb-4">What you'll learn</h2>
              <ul className="grid sm:grid-cols-2 gap-3">{c.outcomes.map(o => <li key={o} className="flex gap-2.5 text-sm text-white/80"><CheckCircle2 size={17} className="text-emerald-400 shrink-0 mt-0.5" />{o}</li>)}</ul></section>
          )}
          {c.description && <section><h2 className="text-xl font-black mb-3">About this course</h2><p className="text-white/70 whitespace-pre-wrap leading-relaxed">{c.description}</p></section>}
          <section>
            <h2 className="text-xl font-black mb-4">Curriculum</h2>
            <div className="space-y-4">
              {sections.map(([name, ls]) => (
                <div key={name} className={`${glass} overflow-hidden`}>
                  <div className="px-5 py-3 bg-white/[0.04] font-black text-sm flex justify-between"><span>{name}</span><span className="text-white/40 font-bold">{ls.length} lessons</span></div>
                  <ul className="divide-y divide-white/5">{ls.map(l => (
                    <li key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                      {l.preview || enrolled || owner ? <PlayCircle size={16} className="text-[#00DAF3] shrink-0" /> : <Lock size={15} className="text-white/25 shrink-0" />}
                      <span className="flex-1 min-w-0 truncate">{l.title}</span>
                      {l.preview && !enrolled && !owner && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Free preview</span>}
                    </li>))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside>
          <div className={`${glass} p-6 lg:sticky lg:top-6`}>
            <div className="text-4xl font-black">{money(c.price)}</div>
            {c.format && c.format !== 'SELF_PACED' && c.startDate && <div className="flex items-center gap-2 text-sm text-white/60 mt-2"><CalendarDays size={14} /> Starts {new Date(c.startDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>}
            {stats.seatsLeft !== null && <div className="flex items-center gap-2 text-sm text-white/60 mt-1"><Clock size={14} /> {full ? 'Course is full' : `${stats.seatsLeft} seats left`}</div>}
            <div className="mt-5 space-y-2">
              {owner ? (
                <>
                  <button onClick={() => onManage(c.id)} className="w-full py-3.5 rounded-2xl bg-white text-black font-black">Manage course</button>
                  {draft && <p className="text-xs text-amber-300">Draft: only you can see this page.</p>}
                </>
              ) : enrolled ? (
                <button onClick={() => setInside(true)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6B0099] to-[#D40055] font-black flex items-center justify-center gap-2"><PlayCircle size={18} /> Continue learning</button>
              ) : (
                <button onClick={enroll} disabled={busy || full} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] font-black disabled:opacity-50">
                  {busy ? 'One moment…' : full ? 'Full' : !uid ? 'Sign in to enroll' : c.price > 0 ? `Enroll · ${money(c.price)}` : 'Enroll free'}
                </button>
              )}
              {confirming && <p role="status" className="text-sm text-emerald-300">Payment received. Unlocking your seat…</p>}
              {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
            </div>
            <ul className="mt-5 space-y-2 text-xs text-white/50">
              <li className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> Gradebook feedback from your instructor</li>
              <li className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> A class chat with your instructor and classmates</li>
              {c.format && c.format !== 'SELF_PACED' && <li className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> Live sessions on your calendar</li>}
            </ul>
          </div>
        </aside>
      </div>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#14121d]/95 backdrop-blur px-4 pt-3 flex items-center gap-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="min-w-0">
          <div className="text-2xl font-black leading-none">{money(c.price)}</div>
          <div className="text-[11px] text-white/50 mt-1 truncate">{stats.seatsLeft !== null ? (full ? 'Course is full' : `${stats.seatsLeft} seats left`) : (c.format && c.format !== 'SELF_PACED' && c.startDate ? `Starts ${new Date(c.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Start any time')}</div>
        </div>
        {owner ? (
          <button onClick={() => onManage(c.id)} className="ml-auto flex-1 max-w-[260px] min-h-[48px] rounded-2xl bg-white text-black font-black">Manage course</button>
        ) : enrolled ? (
          <button onClick={() => setInside(true)} className="ml-auto flex-1 max-w-[260px] min-h-[48px] rounded-2xl bg-gradient-to-r from-[#6B0099] to-[#D40055] font-black">Continue learning</button>
        ) : (
          <button onClick={enroll} disabled={busy || full} className="ml-auto flex-1 max-w-[260px] min-h-[48px] rounded-2xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] font-black disabled:opacity-50">
            {busy ? 'One moment…' : full ? 'Full' : !uid ? 'Sign in to enroll' : c.price > 0 ? `Enroll · ${money(c.price)}` : 'Enroll free'}
          </button>
        )}
      </div>
    </div>
  );
}
