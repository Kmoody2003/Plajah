/**
 * CourseCommand — the control room for ONE creator course.
 *
 * Everything a school teacher gets, aimed at a creator's class: curriculum editing, a real
 * roster, a gradebook, live sessions, the class group chat, and — the creator-economy part —
 * a Promote tab wired into the rest of the Plajah toolchest (Evite launch party, social posts,
 * the full MarketingKit with billboards/ads/campaigns, and The Post Man for email).
 *
 * It reads and writes the same `classrooms/{id}` doc the student-facing ClassroomDetail uses, so
 * nothing here can disagree with what learners see.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Award, BarChart3, BookOpen, CalendarDays, Check, CheckCircle2, Circle, Copy, ExternalLink, Eye, Mail, Megaphone,
  MessageSquare, PartyPopper, Radio, Rocket, Settings, Share2, Users, Wallet,
} from 'lucide-react';
import { collection, doc, getDocs, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import type { Classroom, LiveClassSession, Submission, UserProfile } from '../../../types';
import { db } from '../../../services/firebase';
import { ensureClassroomRoom, fetchUserProfiles, gradeSubmission } from '../../../services/backendService';
import { scheduleClassroomMeeting } from '../../../services/classroomMeetings';
import {
  PLATFORM_CUT, buildPromoKit, courseStats, courseUrl, money, publishCourse, readiness, unpublishCourse, updateCourse,
} from '../../../services/creatorCourses';
import OutlineEditor from './OutlineEditor';
import PayoutNotice from './PayoutNotice';
import MotionSwitch from './MotionSwitch';
import { useMotion } from './useMotion';
import { chalkOverlay } from '../../../services/creatorArt';
import MarketingKit from '../../MarketingKit';
import { ClassroomDetail } from '../../ClassroomsView';

type Tab = 'OVERVIEW' | 'CURRICULUM' | 'LEARNERS' | 'GRADEBOOK' | 'LIVE' | 'PROMOTE' | 'SETTINGS';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'OVERVIEW', label: 'Overview', icon: BarChart3 },
  { id: 'CURRICULUM', label: 'Curriculum', icon: BookOpen },
  { id: 'LEARNERS', label: 'Learners', icon: Users },
  { id: 'GRADEBOOK', label: 'Gradebook', icon: Award },
  { id: 'LIVE', label: 'Live & chat', icon: Radio },
  { id: 'PROMOTE', label: 'Promote', icon: Megaphone },
  { id: 'SETTINGS', label: 'Settings', icon: Settings },
];

interface Props {
  course: Classroom;
  user: any;
  profile: UserProfile | null;
  onBack: () => void;
  onNavigate: (view: string) => void;
  onChanged: (c: Classroom) => void;
  /** Open a learner's profile. */
  onVisitUser?: (uid: string) => void;
  /** Open on this tab (e.g. straight to Promote after publishing). */
  initialTab?: Tab;
}

const card = 'rounded-3xl border border-white/10 bg-white/[0.04] p-5';
const btn = 'min-h-[44px] px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all';
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked: the text is visible to select */ }
    }}>
      {done ? <Check size={13} /> : <Copy size={13} />}{done ? 'Copied' : label}
    </button>
  );
}

export default function CourseCommand({ course: initial, user, profile, onBack, onNavigate, onChanged, onVisitUser, initialTab }: Props) {
  const [course, setCourse] = useState<Classroom>(initial);
  useMotion(); // re-render when the Motion switch changes
  const [tab, setTab] = useState<Tab>(initialTab || 'OVERVIEW');
  const [subs, setSubs] = useState<Submission[]>([]);
  const [learners, setLearners] = useState<UserProfile[]>([]);
  const [sessions, setSessions] = useState<LiveClassSession[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [toolkit, setToolkit] = useState(false);

  const url = courseUrl(course.id);
  const stats = courseStats(course);
  const ready = readiness({
    title: course.title, description: course.description, thumbnailUrl: course.thumbnailUrl, lessons: course.lessons, assignments: course.assignments,
    tagline: course.tagline, outcomes: course.outcomes, price: course.price, format: course.format, startDate: course.startDate,
  });
  const isDraft = course.status === 'DRAFT';
  const kit = useMemo(() => buildPromoKit(course, url), [course, url]);

  const apply = useCallback((patch: Partial<Classroom>) => {
    setCourse(c => { const next = { ...c, ...patch }; onChanged(next); return next; });
  }, [onChanged]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  // Submissions power both the gradebook and the "to grade" count; load once per course.
  const loadSubs = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'submissions'), where('classroomId', '==', course.id)));
      setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    } catch { setSubs([]); }
  }, [course.id]);
  useEffect(() => { loadSubs(); }, [loadSubs]);

  useEffect(() => {
    const ids = course.enrolledStudents.filter(u => u !== course.ownerId);
    let alive = true;
    fetchUserProfiles(ids.slice(0, 200)).then(p => { if (alive) setLearners(p); });
    return () => { alive = false; };
  }, [course.enrolledStudents, course.ownerId]);

  useEffect(() => {
    if (tab !== 'LIVE' && tab !== 'OVERVIEW') return;
    return onSnapshot(
      query(collection(db, 'liveClassSessions'), where('classroomId', '==', course.id), orderBy('scheduledAt', 'desc')),
      s => setSessions(s.docs.map(d => ({ id: d.id, ...d.data() } as LiveClassSession))),
      () => setSessions([]),
    );
  }, [tab, course.id]);

  const toGrade = subs.filter(s => s.grade === undefined || s.grade === null).length;
  const upcoming = sessions.filter(s => s.status !== 'ENDED' && s.scheduledAt + s.durationMinutes * 60_000 > Date.now()).sort((a, b) => a.scheduledAt - b.scheduledAt);

  const togglePublish = async () => {
    setBusy('publish');
    try {
      if (isDraft) { await publishCourse(course.id); apply({ status: 'PUBLISHED', publishedAt: Date.now() }); flash('Published. Your course is live.'); setTab('PROMOTE'); }
      else { await unpublishCourse(course.id); apply({ status: 'DRAFT' }); flash('Moved back to draft.'); }
    } catch (e: any) { flash(e?.message || 'Could not update.'); }
    setBusy('');
  };

  if (previewing) {
    return <ClassroomDetail classroom={course} onBack={() => setPreviewing(false)} user={user} />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/10">
        <img src={course.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-125" />
        <div className="absolute inset-0 bg-cover bg-right opacity-40 sm:opacity-70" style={{ backgroundImage: `url("${chalkOverlay(course.category, 0.28, true, '#ffd98a')}")` }} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-color)]/85 via-[var(--bg-color)]/50 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <button onClick={onBack} className="flex items-center gap-2 min-h-[44px] text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"><ArrowLeft size={14} /> Your studio</button>
            <MotionSwitch compact />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isDraft ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{isDraft ? 'Draft · private' : 'Live'}</span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 leading-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.55)]">{course.title}</h1>
              {course.tagline && <p className="text-white/90 mt-1 text-sm [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">{course.tagline}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => setPreviewing(true)}><Eye size={14} /> Classroom view</button>
              <button className={`${btn} ${isDraft ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00]' : 'bg-white/10 hover:bg-white/20'} disabled:opacity-40`} disabled={busy === 'publish' || (isDraft && !ready.ready)} onClick={togglePublish} title={isDraft && !ready.ready ? 'Add a title, 3 lessons and some lesson content first' : undefined}>
                <Rocket size={14} /> {isDraft ? 'Publish' : 'Unpublish'}
              </button>
            </div>
          </div>
          {msg && <p role="status" className="mt-3 text-sm text-emerald-300">{msg}</p>}
          {course.price > 0 && !profile?.stripeConnectAccountId && <div className="mt-4"><PayoutNotice price={course.price} hasPayouts={false} onSetup={() => onNavigate('CREATOR_PAYMENTS')} /></div>}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-[var(--bg-color)]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-2 sm:px-8 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 min-h-[48px] px-4 py-3.5 text-[11px] font-black uppercase tracking-widest flex items-center gap-2 border-b-2 ${tab === t.id ? 'border-[#FF8C00] text-white' : 'border-transparent text-white/40 hover:text-white'}`}>
              <t.icon size={14} />{t.label}
              {t.id === 'GRADEBOOK' && toGrade > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#D40055] text-[9px]">{toGrade}</span>}
            </button>
          ))}
        </div>
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {tab === 'OVERVIEW' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { l: 'Learners', v: String(stats.learners), s: stats.seatsLeft !== null ? `${stats.seatsLeft} seats left` : 'Unlimited seats', i: Users },
                { l: 'You earn', v: money(stats.net), s: stats.gross > 0 ? `${money(stats.gross)} gross` : course.price > 0 ? 'No sales yet' : 'Free course', i: Wallet },
                { l: 'To grade', v: String(toGrade), s: `${subs.length} submissions`, i: Award },
                { l: 'Next live', v: upcoming[0] ? new Date(upcoming[0].scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—', s: upcoming[0]?.title || 'Nothing scheduled', i: CalendarDays },
              ].map(k => (
                <div key={k.l} className={card}>
                  <k.i size={16} />
                  <div className="text-3xl font-black mt-2">{k.v}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">{k.l}</div>
                  <div className="text-xs text-white/40 mt-0.5 truncate">{k.s}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className={card}>
                <div className="flex items-center justify-between mb-3"><h3 className="font-black">Launch readiness</h3><span className="text-2xl font-black">{ready.score}%</span></div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full bg-gradient-to-r from-[#D40055] to-[#FF8C00]" style={{ width: `${ready.score}%` }} /></div>
                <ul className="space-y-2">
                  {ready.items.map(i => (
                    <li key={i.id} className="flex items-start gap-2.5 text-sm">
                      {i.done ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5" /> : <Circle size={16} className="text-white/25 mt-0.5" />}
                      <div><div className={i.done ? 'text-white/70' : ''}>{i.label}</div>{!i.done && <div className="text-xs text-white/40">{i.hint}</div>}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="font-black px-1">Do next</h3>
                {[
                  toGrade > 0 && { t: `Grade ${toGrade} submission${toGrade > 1 ? 's' : ''}`, d: 'Learners are waiting for feedback.', go: () => setTab('GRADEBOOK'), i: Award },
                  isDraft && { t: ready.ready ? 'Publish your course' : 'Finish your curriculum', d: ready.ready ? 'It is ready. Make it public.' : 'Add lesson content, then publish.', go: ready.ready ? togglePublish : () => setTab('CURRICULUM'), i: Rocket },
                  !isDraft && { t: 'Announce it', d: 'Posts, a launch party invite, email and ads are ready to send.', go: () => setTab('PROMOTE'), i: Megaphone },
                  upcoming.length === 0 && course.format !== 'SELF_PACED' && { t: 'Schedule your first live class', d: 'Learners get it on their calendar.', go: () => setTab('LIVE'), i: CalendarDays },
                  { t: 'Message your class', d: 'Open the class group chat.', go: async () => { await ensureClassroomRoom(course.id, course.ownerId, course.enrolledStudents, course.title); onNavigate('CHAT'); }, i: MessageSquare },
                ].filter(Boolean).map((a: any) => (
                  <button key={a.t} onClick={a.go} className={`${card} w-full text-left flex items-center gap-4 hover:border-white/30`}>
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center"><a.i size={18} /></div>
                    <div><div className="font-black">{a.t}</div><div className="text-xs text-white/50">{a.d}</div></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'CURRICULUM' && (
          <CurriculumTab course={course} onSaved={apply} flash={flash} />
        )}

        {tab === 'LEARNERS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">{stats.learners} learner{stats.learners === 1 ? '' : 's'}</h2>
              <div className="flex gap-2">
                <CopyButton text={learners.map(l => l.displayName).join(', ')} label="Copy names" />
                <button className={`${btn} bg-white/10 hover:bg-white/20`} onClick={async () => { await ensureClassroomRoom(course.id, course.ownerId, course.enrolledStudents, course.title); onNavigate('CHAT'); }}><MessageSquare size={13} /> Class chat</button>
              </div>
            </div>
            {stats.learners === 0 ? (
              <div className={`${card} text-center py-14`}>
                <Users size={36} className="mx-auto text-white/20 mb-3" />
                <p className="font-black">No learners yet</p>
                <p className="text-sm text-white/50 mt-1 mb-4">Share your course link to get your first one.</p>
                <button className={`${btn} bg-white text-black mx-auto`} onClick={() => setTab('PROMOTE')}><Megaphone size={14} /> Open promote tools</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {learners.map(l => {
                  const mine = subs.filter(s => s.studentId === l.uid);
                  const graded = mine.filter(s => typeof s.grade === 'number');
                  const pts = graded.reduce((n, s) => n + (s.grade || 0), 0);
                  const max = graded.reduce((n, s) => n + (course.assignments.find(a => a.id === s.assignmentId)?.maxPoints || 100), 0);
                  return (
                    <div key={l.uid} className={`${card} flex items-center gap-3 !p-4`}>
                      <img src={l.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(l.displayName || 'L')}`} alt="" className="w-11 h-11 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{l.displayName}</div>
                        <div className="text-xs text-white/40">{mine.length}/{course.assignments.length} submitted{max > 0 ? ` · ${Math.round((pts / max) * 100)}% avg` : ''}</div>
                      </div>
                      <button className="p-3 -m-1 rounded-lg hover:bg-white/10" aria-label={`Open ${l.displayName}'s profile`} onClick={() => onVisitUser?.(l.uid)}><ExternalLink size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'GRADEBOOK' && <GradebookTab course={course} subs={subs} learners={learners} uid={user?.uid} reload={loadSubs} />}

        {tab === 'LIVE' && (
          <LiveTab course={course} sessions={sessions} onNavigate={onNavigate} flash={flash} />
        )}

        {tab === 'PROMOTE' && (
          <div className="space-y-6">
            {isDraft && <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">This course is still a draft, so its link will not work for the public yet. You can prepare everything here and publish when ready.</div>}
            <div className={card}>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Your course link</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-[220px] bg-black/30 rounded-xl px-3 py-2.5 text-sm break-all">{url}</code>
                <CopyButton text={url} label="Copy link" />
                {typeof navigator !== 'undefined' && (navigator as any).share && <button className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => (navigator as any).share({ title: course.title, text: kit.social[0].text, url }).catch(() => {})}><Share2 size={13} /> Share</button>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className={card}>
                <div className="flex items-center gap-2 font-black mb-1"><PartyPopper size={18} className="text-[#FF8C00]" /> Launch party invite</div>
                <p className="text-sm text-white/50 mb-4">An Evite for your kickoff: RSVPs, reminders, calendar links, and your course link built in. Guests never need an account.</p>
                <button className={`${btn} bg-gradient-to-r from-[#D40055] to-[#FF8C00]`} onClick={() => {
                  try { sessionStorage.setItem('plajah.eventPrefill', JSON.stringify({ title: kit.evite.headline, description: kit.evite.details, ...(kit.evite.startsAt ? { startDate: kit.evite.startsAt } : {}) })); } catch { /* prefill is optional */ }
                  onNavigate('EVENT_CREATE');
                }}><PartyPopper size={14} /> Create launch invite</button>
              </div>
              <div className={card}>
                <div className="flex items-center gap-2 font-black mb-1"><Mail size={18} className="text-[#00DAF3]" /> Email your list</div>
                <p className="text-sm text-white/50 mb-3">Subject and body are written for you. Copy them, then send from The Post Man's campaigns.</p>
                <div className="text-xs text-white/40 mb-1">Subject</div>
                <div className="bg-black/30 rounded-xl px-3 py-2 text-sm mb-3">{kit.emailSubject}</div>
                <div className="flex gap-2 flex-wrap">
                  <CopyButton text={`${kit.emailSubject}\n\n${kit.emailBody}`} label="Copy email" />
                  <button className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => onNavigate('POSTMAN')}><Mail size={13} /> Open The Post Man</button>
                </div>
              </div>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2 font-black mb-3"><Megaphone size={18} className="text-[#8B5CF6]" /> Ready-to-post copy</div>
              <div className="grid md:grid-cols-2 gap-3">
                {kit.social.map(p => (
                  <div key={p.network} className="rounded-2xl bg-black/25 p-4 flex flex-col">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{p.network}</div>
                    <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{p.text}</p>
                    <div className="mt-3"><CopyButton text={p.text} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-black">Billboards, ads & campaigns</div>
                  <p className="text-sm text-white/50">Your billboard headline: <b className="text-white/80">{kit.billboard.headline}</b> · {kit.billboard.cta}. Open the full toolkit to schedule posts to your channels, buy a billboard, or build a campaign.</p>
                </div>
                <button className={`${btn} bg-white text-black`} onClick={() => setToolkit(t => !t)}><Megaphone size={14} /> {toolkit ? 'Hide toolkit' : 'Open marketing toolkit'}</button>
              </div>
              {toolkit && profile && (
                <div className="mt-5 -mx-2 sm:mx-0 rounded-2xl overflow-hidden border border-white/10">
                  <MarketingKit scope={{ kind: 'CREATOR', id: profile.uid, name: profile.displayName }} currentUser={profile} />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'SETTINGS' && <SettingsTab course={course} onSaved={apply} flash={flash} />}
      </motion.div>
    </div>
  );
}

// ── Curriculum ───────────────────────────────────────────────────────────────

function CurriculumTab({ course, onSaved, flash }: { course: Classroom; onSaved: (p: Partial<Classroom>) => void; flash: (m: string) => void }) {
  const [state, setState] = useState({ lessons: course.lessons, assignments: course.assignments, syllabus: course.syllabus });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const lessons = state.lessons.filter(l => l.title.trim());
      const patch = { lessons, assignments: state.assignments.filter(a => a.title.trim()), syllabus: state.syllabus };
      await updateCourse(course.id, patch);
      onSaved(patch); setDirty(false); flash('Curriculum saved.');
    } catch (e: any) { flash(e?.message || 'Could not save.'); }
    setSaving(false);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between sticky top-[52px] z-10 bg-[var(--bg-color)]/90 backdrop-blur py-2">
        <h2 className="text-2xl font-black">Curriculum</h2>
        <button className={`${btn} bg-white text-black disabled:opacity-40`} disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      </div>
      <OutlineEditor lessons={state.lessons} assignments={state.assignments} onChange={n => { setState(n); setDirty(true); }} />
    </div>
  );
}

// ── Gradebook ────────────────────────────────────────────────────────────────

function GradebookTab({ course, subs, learners, uid, reload }: { course: Classroom; subs: Submission[]; learners: UserProfile[]; uid: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [grade, setGrade] = useState('');
  const [fb, setFb] = useState('');
  const [err, setErr] = useState('');
  const name = (id: string, fallback: string) => learners.find(l => l.uid === id)?.displayName || fallback;

  const submit = async (s: Submission) => {
    const g = parseFloat(grade);
    const max = course.assignments.find(a => a.id === s.assignmentId)?.maxPoints ?? 100;
    if (isNaN(g) || g < 0 || g > max) { setErr(`Enter a score from 0 to ${max}.`); return; }
    setErr('');
    try {
      await gradeSubmission(s.id, g, fb);
      // Mirror for the learner's progress view; best-effort (needs the studentGrades rule deployed).
      await setDoc(doc(db, 'studentGrades', `${course.id}_${s.studentId}_${s.assignmentId}`), {
        classroomId: course.id, studentId: s.studentId, studentName: s.studentName, assignmentId: s.assignmentId,
        grade: g, maxPoints: max, ...(fb ? { feedback: fb } : {}), gradedBy: uid, gradedAt: Date.now(),
      }).catch(() => {});
      setOpen(null); setGrade(''); setFb('');
      await reload();
    } catch (e: any) { setErr(e?.message || 'Could not save the grade.'); }
  };

  if (course.assignments.length === 0) return <div className={`${card} text-center py-14`}><Award size={36} className="mx-auto text-white/20 mb-3" /><p className="font-black">No assignments yet</p><p className="text-sm text-white/50 mt-1">Add one in the Curriculum tab and learners can submit work for you to grade.</p></div>;

  return (
    <div className="space-y-6">
      {course.assignments.map(a => {
        const list = subs.filter(s => s.assignmentId === a.id).sort((x, y) => x.timestamp - y.timestamp);
        const done = list.filter(s => typeof s.grade === 'number').length;
        return (
          <section key={a.id} className={card}>
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="font-black">{a.title}</h3><div className="text-xs text-white/40">{a.maxPoints} pts · {done}/{list.length} graded</div></div>
            </div>
            {list.length === 0 ? <p className="text-sm text-white/40">No submissions yet.</p> : (
              <ul className="divide-y divide-white/5">
                {list.map(s => (
                  <li key={s.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{name(s.studentId, s.studentName)}</div>
                        <div className="text-xs text-white/50 line-clamp-2">{s.textContent}</div>
                        {s.contentUrl && <a href={s.contentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#00DAF3] inline-flex items-center gap-1 mt-0.5"><ExternalLink size={11} /> Open work</a>}
                      </div>
                      {typeof s.grade === 'number'
                        ? <span className="text-lg font-black text-emerald-300">{s.grade}<span className="text-xs text-white/30">/{a.maxPoints}</span></span>
                        : <button className={`${btn} bg-[#D40055]`} onClick={() => { setOpen(s.id); setGrade(''); setFb(''); setErr(''); }}>Grade</button>}
                      {typeof s.grade === 'number' && <button className="text-[10px] text-white/40 hover:text-white underline" onClick={() => { setOpen(s.id); setGrade(String(s.grade)); setFb(s.feedback || ''); setErr(''); }}>Edit</button>}
                    </div>
                    {open === s.id && (
                      <div className="mt-3 rounded-2xl bg-black/25 p-4 space-y-2">
                        <div className="flex gap-2"><input className={`${inputCls} !w-28`} type="number" placeholder={`/ ${a.maxPoints}`} value={grade} onChange={e => setGrade(e.target.value)} autoFocus /><input className={inputCls} placeholder="Feedback for the learner" value={fb} onChange={e => setFb(e.target.value)} /></div>
                        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
                        <div className="flex gap-2"><button className={`${btn} bg-white text-black`} onClick={() => submit(s)}>Save grade</button><button className={`${btn} text-white/50`} onClick={() => setOpen(null)}>Cancel</button></div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Live & chat ──────────────────────────────────────────────────────────────

function LiveTab({ course, sessions, onNavigate, flash }: { course: Classroom; sessions: LiveClassSession[]; onNavigate: (v: string) => void; flash: (m: string) => void }) {
  const [form, setForm] = useState({ title: '', scheduledAt: '', durationMinutes: 60 });
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!form.title.trim() || !form.scheduledAt) return;
    setSaving(true);
    try {
      await scheduleClassroomMeeting(course.id, { title: form.title.trim(), scheduledAt: new Date(form.scheduledAt).getTime(), durationMinutes: form.durationMinutes });
      setForm({ title: '', scheduledAt: '', durationMinutes: 60 }); flash('Live class scheduled.');
    } catch (e: any) { flash(e?.message || 'Could not schedule.'); }
    setSaving(false);
  };
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className={card}>
        <h3 className="font-black mb-3">Schedule a live class</h3>
        <div className="space-y-2">
          <input className={inputCls} placeholder="Session title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div className="flex gap-2"><input type="datetime-local" className={inputCls} value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} /><input type="number" min={15} step={15} className={`${inputCls} !w-28`} value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: Math.max(15, Number(e.target.value) || 60) }))} aria-label="Minutes" /></div>
          <button className={`${btn} bg-white text-black disabled:opacity-40`} disabled={saving || !form.title.trim() || !form.scheduledAt} onClick={add}><CalendarDays size={14} /> Schedule</button>
        </div>
        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-6 mb-2">Sessions</h4>
        {sessions.length === 0 ? <p className="text-sm text-white/40">Nothing scheduled.</p> : (
          <ul className="space-y-2">{sessions.map(s => (
            <li key={s.id} className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-2.5">
              <div><div className="text-sm font-bold">{s.title}</div><div className="text-xs text-white/40">{new Date(s.scheduledAt).toLocaleString()} · {s.durationMinutes} min</div></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{s.status}</span>
            </li>))}
          </ul>
        )}
        <p className="text-xs text-white/40 mt-4">Learners join from the classroom view. Replays can be saved to your lessons.</p>
      </div>
      <div className={card}>
        <h3 className="font-black mb-1">Class chat</h3>
        <p className="text-sm text-white/50 mb-4">One group thread for your whole class. Learners are added automatically when they enroll.</p>
        <button className={`${btn} bg-gradient-to-r from-[#6B0099] to-[#D40055]`} onClick={async () => { await ensureClassroomRoom(course.id, course.ownerId, course.enrolledStudents, course.title); onNavigate('CHAT'); }}><MessageSquare size={14} /> Open class chat</button>
        <p className="text-xs text-white/40 mt-3">Find it under Groups in Chat.</p>
      </div>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({ course, onSaved, flash }: { course: Classroom; onSaved: (p: Partial<Classroom>) => void; flash: (m: string) => void }) {
  const [f, setF] = useState({ title: course.title, tagline: course.tagline || '', description: course.description, price: course.price, capacity: course.capacity || 0, outcomes: (course.outcomes || []).join('\n') });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const patch: Partial<Classroom> = { title: f.title.trim() || course.title, tagline: f.tagline.trim(), description: f.description.trim(), price: Math.max(0, f.price), capacity: Math.max(0, f.capacity), outcomes: f.outcomes.split('\n').map(s => s.trim()).filter(Boolean) };
      await updateCourse(course.id, patch); onSaved(patch); flash('Settings saved.');
    } catch (e: any) { flash(e?.message || 'Could not save.'); }
    setSaving(false);
  };
  const L = 'block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5';
  return (
    <div className={`${card} max-w-2xl space-y-4`}>
      <div><span className={L}>Title</span><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
      <div><span className={L}>One-line promise</span><input className={inputCls} value={f.tagline} onChange={e => setF({ ...f, tagline: e.target.value })} /></div>
      <div><span className={L}>Description</span><textarea className={inputCls} rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
      <div><span className={L}>Outcomes (one per line)</span><textarea className={inputCls} rows={4} value={f.outcomes} onChange={e => setF({ ...f, outcomes: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><span className={L}>Price (USD)</span><input type="number" min={0} className={inputCls} value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) || 0 })} /></div>
        <div><span className={L}>Seats (0 = unlimited)</span><input type="number" min={0} className={inputCls} value={f.capacity} onChange={e => setF({ ...f, capacity: Number(e.target.value) || 0 })} /></div>
      </div>
      {f.price > 0 && <p className="text-xs text-white/50">You keep {money(Math.round(f.price * (1 - PLATFORM_CUT) * 100) / 100)} per enrollment after Plajah's {Math.round(PLATFORM_CUT * 100)}% (plus Stripe's processing fee).</p>}
      <button className={`${btn} bg-white text-black disabled:opacity-40`} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}
