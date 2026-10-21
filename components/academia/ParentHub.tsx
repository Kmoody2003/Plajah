import React, { useEffect, useMemo, useState } from 'react';
import {
  Heart, MessageCircle, Plus, Check, Clock, ClipboardList, Star, Users,
  KeyRound, Shield, Filter, History, Eye, EyeOff, Copy, Sparkles,
} from 'lucide-react';
import { fetchClassrooms, listChildProfiles, createChildProfile, createChatRoom } from '../../services/backendService';
import { loadLearnerStats, type LearnerStats, type AppStat } from '../../services/academiaStats';
import { fetchChildWork, type ChildWork } from '../../services/assignmentTemplateService';
import { provisionChild, claimChild, generateKidFriendlyPassword } from '../../services/learnerAuthService';
import { DEFAULT_CHILD_CONTROLS } from '../../services/contentSafety';
import { db } from '../../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { relativeDue } from './TodayDueFirst';
import EduFeedPanel from './EduFeedPanel';
import WellbeingPanel from './WellbeingPanel';
import { ChildSnapshot, ParentFamilySections } from './ParentFamily';
import ParentalControlsPanel, { ParentalControlTabId } from '../ParentalControlsPanel';

/**
 * Parent hub (ACADEMIA_HOME for parents).
 * Lets parents:
 * 1. Create or claim child accounts and view/reset their child's @username & password
 * 2. Moderate platform sections, set maturity ratings, auto-hide mature themes, set time allowances, and filter words
 * 3. Inspect full Child Activity History & screen-time breakdown
 * 4. Message teachers and track academic progress & assignments
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void }

const APPS: Array<{ key: keyof LearnerStats; label: string; color: string; view: string }> = [
  { key: 'voca', label: 'Voca · reading aloud', color: '#D40055', view: 'VOCA' },
  { key: 'penna', label: 'Penna · handwriting', color: '#C9871F', view: 'HANDWRITING_WORKSHOP' },
  { key: 'reading', label: 'Reading Quest', color: '#7a2bd6', view: 'READING_QUEST' },
  { key: 'languages', label: 'Languages', color: '#3B82F6', view: 'LANGUAGE_QUEST' },
  { key: 'ledger', label: 'Learning record', color: '#06D6A0', view: 'LEARNER_LEDGER' },
];

const ParentHub: React.FC<Props> = ({ user, profile, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const first = (profile?.displayName || 'there').split(' ')[0];
  const [kids, setKids] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string>('');
  const [classes, setClasses] = useState<any[]>([]);
  const [stats, setStats] = useState<LearnerStats | null>(null);
  const [work, setWork] = useState<ChildWork | null>(null);

  // Add child / claim child state
  const [adding, setAdding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Parental controls & password state
  const [controlTab, setControlTab] = useState<ParentalControlTabId>('content');
  const [showInlinePassword, setShowInlinePassword] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);

  const loadKids = async () => {
    if (!uid) { setKids([]); return; }
    const k = await listChildProfiles(uid).catch(() => []);
    setKids(k);
    setSel(s => (s && k.find(c => c.uid === s)) ? s : (k[0]?.uid || ''));
  };

  useEffect(() => {
    void loadKids();
    fetchClassrooms().then(c => setClasses(c || [])).catch(() => {});
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [uid]);

  const child = (kids || []).find(k => k.uid === sel);

  useEffect(() => {
    setStats(null);
    setWork(null);
    setShowInlinePassword(false);
    if (!sel || !uid) return;
    let alive = true;
    loadLearnerStats(sel).then(s => alive && setStats(s)).catch(() => {});
    fetchChildWork(uid, sel)
      .then(w => alive && setWork(w))
      .catch(() => alive && setWork({ assigned: [], submissions: [] }));
    return () => { alive = false; };
  }, [sel, uid]);

  const teachers = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; classes: string[] }>();
    for (const c of classes) {
      if (c?.ownerId && (c.enrolledStudents || []).includes(sel) && c.ownerId !== uid) {
        const t = m.get(c.ownerId) || { uid: c.ownerId, name: c.ownerName || 'Teacher', classes: [] };
        t.classes.push(c.title || 'Class');
        m.set(c.ownerId, t);
      }
    }
    return [...m.values()];
  }, [classes, sel, uid]);

  const messageTeacher = async (teacherUid: string) => {
    if (!uid) return;
    try {
      await createChatRoom([uid, teacherUid], 'PRIVATE');
      onNavigate('CHAT');
    } catch (e: any) {
      setNote(e?.message || 'Could not open that conversation right now.');
    }
  };

  const addChild = async () => {
    if (!uid || name.trim().length < 2) return;
    setBusy(true);
    setNote('');
    const by = parseInt(year, 10);
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanPassword = password.trim();

    try {
      if (cleanUsername && cleanPassword.length >= 6) {
        const res = await provisionChild({
          role: 'parent',
          displayName: name.trim(),
          username: cleanUsername,
          password: cleanPassword,
          birthYear: by > 1990 ? by : undefined,
          speechRecognition: true,
        });
        if (db && res?.childUid) {
          await setDoc(
            doc(db, 'users', res.childUid),
            {
              username: res.username || cleanUsername,
              parentalControls: {
                ...DEFAULT_CHILD_CONTROLS,
                savedChildPassword: cleanPassword,
                passwordUpdatedAt: Date.now(),
                updatedAt: Date.now(),
                updatedBy: uid,
              },
            },
            { merge: true }
          ).catch(() => {});
        }
        setAdding(false);
        setName('');
        setYear('');
        setUsername('');
        setPassword('');
        await loadKids();
        if (res?.childUid) setSel(res.childUid);
        setNote(`${name.trim()} (@${cleanUsername}) was added with login credentials!`);
        setBusy(false);
        return;
      }
    } catch {
      // Fallback to local/Firestore profile creation if backend route unavailable
    }

    const c = await createChildProfile(uid, {
      displayName: name.trim(),
      birthYear: by > 1990 ? by : undefined,
    });
    if (c && db && (cleanUsername || cleanPassword)) {
      await setDoc(
        doc(db, 'users', c.uid),
        {
          ...(cleanUsername ? { username: cleanUsername } : {}),
          parentalControls: {
            ...DEFAULT_CHILD_CONTROLS,
            ...(cleanPassword ? { savedChildPassword: cleanPassword, passwordUpdatedAt: Date.now() } : {}),
            updatedAt: Date.now(),
            updatedBy: uid,
          },
        },
        { merge: true }
      ).catch(() => {});
    }
    setBusy(false);
    if (c) {
      setAdding(false);
      setName('');
      setYear('');
      setUsername('');
      setPassword('');
      await loadKids();
      setSel(c.uid);
      setNote(`${c.displayName} was added.`);
    } else {
      setNote('Could not add a child right now.');
    }
  };

  const handleClaimCode = async () => {
    if (!claimCode.trim()) return;
    setBusy(true);
    setNote('');
    try {
      await claimChild(claimCode.trim());
      setClaimCode('');
      setClaiming(false);
      await loadKids();
      setNote('Child account claimed and linked to your family!');
    } catch (e: any) {
      setNote(e?.message || 'Could not claim that code.');
    } finally {
      setBusy(false);
    }
  };

  const openAsChild = () => {
    if (child) window.dispatchEvent(new CustomEvent('plajah:enter-kids', { detail: { child } }));
  };

  const jumpToControls = (tab: ParentalControlTabId) => {
    setControlTab(tab);
    document.getElementById('parent-hub-controls-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const savedPassword = child?.parentalControls?.savedChildPassword;

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-center gap-2 mb-2 text-[#FF6FA8]">
          <Heart size={18} />
          <span className="text-[11px] font-black uppercase tracking-[0.3em]">Family &amp; Parent Hub</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">Hi {first}.</h1>
        <p className="text-white/55 text-sm mt-1 mb-6">
          Manage your children&apos;s passwords, parental controls, time allowances, word filters, activity history, and school progress.
        </p>

        {/* Child selector pills + Add Child / Claim Code buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(kids || []).map(k => (
            <button
              key={k.uid}
              type="button"
              onClick={() => setSel(k.uid)}
              aria-pressed={sel === k.uid}
              className={`rounded-full px-4 py-2 text-sm font-black border transition-colors ${
                sel === k.uid
                  ? 'bg-white text-[#12091b] border-white'
                  : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              {k.displayName}
              {k.username ? <span className="ml-1.5 text-xs opacity-60 font-mono">@{k.username}</span> : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setAdding(a => !a); setClaiming(false); }}
            className="rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border border-dashed border-white/25 text-white/70 hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <Plus size={13} /> Add a child
          </button>
          <button
            type="button"
            onClick={() => { setClaiming(c => !c); setAdding(false); }}
            className="rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border border-white/15 text-white/70 hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <KeyRound size={13} /> Claim teacher code
          </button>
          {child && (
            <button
              type="button"
              onClick={openAsChild}
              className="ml-auto rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/15"
            >
              See {child.displayName}&apos;s Homeroom
            </button>
          )}
        </div>

        {/* Claim with teacher code drawer */}
        {claiming && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-6 flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[200px] grid gap-1 text-[11px] font-black text-white/60">
              Teacher Claim Code
              <input
                value={claimCode}
                onChange={e => setClaimCode(e.target.value.toUpperCase())}
                placeholder="QK7-M4PD-RJ9"
                className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white font-mono tracking-widest"
              />
            </label>
            <button
              type="button"
              disabled={busy || !claimCode.trim()}
              onClick={handleClaimCode}
              className="rounded-full bg-[#FF6FA8] text-black text-xs font-black px-5 py-2.5 disabled:opacity-50"
            >
              {busy ? 'Claiming…' : 'Claim Account'}
            </button>
          </div>
        )}

        {/* Add child drawer with Username + Password */}
        {adding && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-6 space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <label className="grid gap-1 text-[11px] font-black text-white/60">
                Child&apos;s first name
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Maya"
                  className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-black text-white/60">
                Birth year
                <input
                  value={year}
                  inputMode="numeric"
                  placeholder="2016"
                  onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-black text-white/60">
                Username (sign-in handle)
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="maya_star"
                  className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white font-mono"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-black text-white/60">
                <span className="flex items-center justify-between">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => setPassword(generateKidFriendlyPassword())}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <Sparkles size={10} /> Generate
                  </button>
                </span>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="6+ characters"
                  className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white font-mono"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-white/45">
                Your child signs in with their @username and password (no email needed). You can view or reset their password anytime.
              </p>
              <button
                type="button"
                disabled={busy || name.trim().length < 2}
                onClick={addChild}
                className="rounded-full bg-[#FF6FA8] text-black text-xs font-black px-5 py-2.5 disabled:opacity-50 shrink-0"
              >
                {busy ? 'Creating…' : 'Create Child Account'}
              </button>
            </div>
          </div>
        )}
        {note && <p role="status" className="text-[12px] text-[#06D6A0] mb-4">{note}</p>}

        {kids && kids.length === 0 && !adding && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Users className="mx-auto mb-2 text-white/30" />
            <p className="font-black">No children linked yet</p>
            <p className="text-sm text-white/50 mb-4">
              Add your child to set their username &amp; password, maturity rating, time allowances, word filters, and activity log.
            </p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full bg-[#FF6FA8] text-black text-xs font-black px-5 py-2.5"
            >
              Add a child
            </button>
          </div>
        )}

        {child && (
          <>
            {/* Quick Child Credentials & Safety Action Strip */}
            <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-white/[0.03] to-white/[0.03] border border-emerald-500/25 p-4 mb-8 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} className="text-emerald-400" />
                    <span className="text-xs font-bold text-white/80">Login:</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/40 border border-white/10 text-emerald-300">
                      {child.username ? `@${child.username}` : 'Username not set'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white/80">Password:</span>
                    {savedPassword ? (
                      <>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/40 border border-white/10 text-emerald-300">
                          {showInlinePassword ? savedPassword : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowInlinePassword(v => !v)}
                          className="text-xs text-white/70 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-white/5"
                        >
                          {showInlinePassword ? <EyeOff size={12} /> : <Eye size={12} />}
                          {showInlinePassword ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(savedPassword).catch(() => {});
                            setCopiedPw(true);
                            setTimeout(() => setCopiedPw(false), 1800);
                          }}
                          className="text-xs text-white/70 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-white/5"
                        >
                          {copiedPw ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          {copiedPw ? 'Copied' : 'Copy'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => jumpToControls('credentials')}
                        className="text-xs text-amber-300 hover:text-amber-200 underline font-semibold"
                      >
                        Set or reset password →
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick jump buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => jumpToControls('credentials')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <KeyRound size={12} className="text-emerald-400" /> Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToControls('content')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <Shield size={12} className="text-emerald-400" /> Content &amp; Maturity
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToControls('time')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <Clock size={12} className="text-emerald-400" /> Time Limits
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToControls('words')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <Filter size={12} className="text-emerald-400" /> Word Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToControls('activity')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 text-[11px] font-extrabold flex items-center gap-1.5"
                  >
                    <History size={12} /> Activity History
                  </button>
                </div>
              </div>
            </div>

            {/* How they're doing, then Ora, before anything else */}
            <ChildSnapshot child={child} work={work} stats={stats} onNavigate={onNavigate} />
            <WellbeingPanel role="parent" user={user} profile={profile} onNavigate={onNavigate} />

            {/* 1 — Communication */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">01</p>
              <h2 className="text-lg font-black mb-1">Talk with {child.displayName}&apos;s teachers</h2>
              <p className="text-[12px] text-white/50 mb-3">
                Messages stay on Plajah. Nothing is shared with anyone outside the class.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {teachers.map(t => (
                  <div key={t.uid} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full grid place-items-center bg-gradient-to-br from-[#6B0099] to-[#00DAF3] font-black">
                      {t.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black truncate">{t.name}</p>
                      <p className="text-[11px] text-white/45 truncate">{t.classes.join(' · ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => messageTeacher(t.uid)}
                      className="rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-black uppercase tracking-wider px-3.5 py-2 inline-flex items-center gap-1.5"
                    >
                      <MessageCircle size={13} /> Message
                    </button>
                  </div>
                ))}
                {teachers.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50 sm:col-span-2">
                    {child.displayName} isn&apos;t enrolled in a teacher&apos;s class yet. Once they are, their teachers appear here.
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => onNavigate('CHAT')}
                  className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10"
                >
                  All messages
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('EDU_SOCIAL')}
                  className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10"
                >
                  School feed
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('LEARN')}
                  className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10"
                >
                  Learn together: all courses
                </button>
              </div>
            </section>

            {/* 2 — Progress */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">02</p>
              <h2 className="text-lg font-black mb-3">{child.displayName}&apos;s progress</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {APPS.map(a => (
                  <ProgressCard
                    key={a.key}
                    label={a.label}
                    color={a.color}
                    stat={stats ? (stats[a.key] as AppStat) : undefined}
                    onOpen={() => onNavigate(a.view)}
                  />
                ))}
              </div>
              {stats && stats.streakDays > 0 && (
                <p className="text-[12px] text-white/50 mt-3">🔥 {stats.streakDays}-day practice streak</p>
              )}
            </section>

            {/* 3 — Work and assignments */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">03</p>
              <h2 className="text-lg font-black mb-3">Assignments &amp; work</h2>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2 flex items-center gap-1.5">
                    <Clock size={13} /> Still to hand in
                  </p>
                  {work === null && <p className="text-sm text-white/45">Loading…</p>}
                  {work && work.assigned.length === 0 && (
                    <p className="text-sm text-white/55 flex items-center gap-1.5">
                      <Check size={14} className="text-[#06D6A0]" /> Nothing outstanding.
                    </p>
                  )}
                  {(work?.assigned || []).map(a => {
                    const r = relativeDue(a.dueDate);
                    return (
                      <div key={a.assignmentId} className="py-2 border-b border-white/5 last:border-0">
                        <p className="text-sm font-bold">{a.title}</p>
                        <p
                          className="text-[11px]"
                          style={{
                            color: a.overdue ? '#ff6b8a' : r.urgent ? '#FF8C00' : 'rgba(255,255,255,.45)',
                          }}
                        >
                          {a.className} · {r.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2 flex items-center gap-1.5">
                    <ClipboardList size={13} /> Handed in
                  </p>
                  {work === null && <p className="text-sm text-white/45">Loading…</p>}
                  {work && work.submissions.length === 0 && (
                    <p className="text-sm text-white/55">No work handed in yet.</p>
                  )}
                  {(work?.submissions || []).slice(0, 6).map(s => (
                    <div key={s.id} className="py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold flex-1 min-w-0 truncate">{s.title}</p>
                        {s.grade ? (
                          <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#06D6A0]/15 text-[#5ff0c6] inline-flex items-center gap-1">
                            <Star size={10} />
                            {s.grade.total}/{s.grade.max}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#FF8C00]/15 text-[#ffb35c]">
                            awaiting grade
                          </span>
                        )}
                      </div>
                      {s.reflection && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-2">“{s.reflection}”</p>}
                      {s.grade?.feedback && <p className="text-[12px] text-white/70 mt-1">Teacher: {s.grade.feedback}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 4 — Full Parental Controls, Password Manager & Child Activity History */}
            <section id="parent-hub-controls-section" className="mb-9 scroll-mt-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">04</p>
              <h2 className="text-lg font-black mb-1">
                Parental Controls, Password &amp; Activity History — {child.displayName}
              </h2>
              <p className="text-[12px] text-white/50 mb-3">
                View or reset {child.displayName}&apos;s password, moderate sections, set maturity ratings, auto-hide mature themes, configure time allowances, block words, and inspect full activity history.
              </p>
              <ParentalControlsPanel
                target={child}
                actor={profile || ({ uid: uid || '' } as any)}
                initialTab={controlTab}
                onSaved={() => void loadKids()}
                onTargetUpdated={() => void loadKids()}
              />
            </section>
          </>
        )}

        {!child && <WellbeingPanel role="parent" user={user} profile={profile} onNavigate={onNavigate} />}
        <ParentFamilySections child={child} onNavigate={onNavigate} />
        <EduFeedPanel currentUser={user} profile={profile} eduRole="PARENT" onOpenFeed={() => onNavigate('EDU_SOCIAL')} />
      </div>
    </div>
  );
};

const ProgressCard: React.FC<{ label: string; color: string; stat?: AppStat; onOpen: () => void }> = ({ label, color, stat, onOpen }) => (
  <button type="button" onClick={onOpen} className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:bg-white/[0.08] transition-colors">
    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</p>
    <p className="text-xl font-black mt-1">{stat ? (stat.started ? stat.headline : 'Not started yet') : '…'}</p>
    <p className="text-[11px] text-white/45 mt-0.5">{stat?.started ? stat.detail : ' '}</p>
    {stat?.started && stat.pct != null && (
      <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
        <div className="h-full" style={{ width: `${Math.max(3, Math.min(100, stat.pct))}%`, background: color }} />
      </div>
    )}
  </button>
);

export default ParentHub;
