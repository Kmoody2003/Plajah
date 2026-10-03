import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Plus, Check, Clock, ClipboardList, Star, Users } from 'lucide-react';
import { fetchClassrooms, listChildProfiles, createChildProfile, createChatRoom } from '../../services/backendService';
import { loadLearnerStats, type LearnerStats, type AppStat } from '../../services/academiaStats';
import { fetchChildWork, type ChildWork } from '../../services/assignmentTemplateService';
import { relativeDue } from './TodayDueFirst';
import EduFeedPanel from './EduFeedPanel';
import WellbeingPanel from './WellbeingPanel';

/**
 * Parent hub (ACADEMIA_HOME for parents). Two jobs: talk to the teacher, and see the child's
 * progress and actual work. Everything is read through the guardian rules, so a parent only ever
 * sees their own children.
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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''); const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false); const [note, setNote] = useState('');

  const loadKids = async () => {
    if (!uid) { setKids([]); return; }
    const k = await listChildProfiles(uid).catch(() => []);
    setKids(k); setSel(s => (s && k.find(c => c.uid === s)) ? s : (k[0]?.uid || ''));
  };
  useEffect(() => { void loadKids(); fetchClassrooms().then(c => setClasses(c || [])).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  const child = (kids || []).find(k => k.uid === sel);
  useEffect(() => {
    setStats(null); setWork(null);
    if (!sel || !uid) return;
    let alive = true;
    loadLearnerStats(sel).then(s => alive && setStats(s)).catch(() => {});
    fetchChildWork(uid, sel).then(w => alive && setWork(w)).catch(() => alive && setWork({ assigned: [], submissions: [] }));
    return () => { alive = false; };
  }, [sel, uid]);

  const teachers = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; classes: string[] }>();
    for (const c of classes) if (c?.ownerId && (c.enrolledStudents || []).includes(sel) && c.ownerId !== uid) {
      const t = m.get(c.ownerId) || { uid: c.ownerId, name: c.ownerName || 'Teacher', classes: [] };
      t.classes.push(c.title || 'Class'); m.set(c.ownerId, t);
    }
    return [...m.values()];
  }, [classes, sel, uid]);

  const messageTeacher = async (teacherUid: string) => {
    if (!uid) return;
    try { await createChatRoom([uid, teacherUid], 'PRIVATE'); onNavigate('CHAT'); }
    catch (e: any) { setNote(e?.message || 'Could not open that conversation right now.'); }
  };

  const addChild = async () => {
    if (!uid || name.trim().length < 2) return;
    setBusy(true);
    const by = parseInt(year, 10);
    const c = await createChildProfile(uid, { displayName: name.trim(), birthYear: by > 1990 ? by : undefined });
    setBusy(false);
    if (c) { setAdding(false); setName(''); setYear(''); await loadKids(); setSel(c.uid); setNote(`${c.displayName} was added.`); }
    else setNote('Could not add a child right now.');
  };

  const openAsChild = () => { if (child) window.dispatchEvent(new CustomEvent('plajah:enter-kids', { detail: { child } })); };

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-center gap-2 mb-2 text-[#FF6FA8]"><Heart size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Family</span></div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">Hi {first}.</h1>
        <p className="text-white/55 text-sm mt-1 mb-6">Stay in touch with the teacher and see how your child is really doing.</p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(kids || []).map(k => (
            <button key={k.uid} type="button" onClick={() => setSel(k.uid)} aria-pressed={sel === k.uid}
              className={`rounded-full px-4 py-2 text-sm font-black border transition-colors ${sel === k.uid ? 'bg-white text-[#12091b] border-white' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>{k.displayName}</button>
          ))}
          <button type="button" onClick={() => setAdding(a => !a)} className="rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider border border-dashed border-white/25 text-white/60 hover:bg-white/10 inline-flex items-center gap-1.5"><Plus size={13} /> Add a child</button>
          {child && <button type="button" onClick={openAsChild} className="ml-auto rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/15">See {child.displayName}'s Homeroom</button>}
        </div>

        {adding && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-6 grid sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
            <label className="grid gap-1 text-[11px] font-black text-white/60">Child's first name<input value={name} onChange={e => setName(e.target.value)} className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white" /></label>
            <label className="grid gap-1 text-[11px] font-black text-white/60">Birth year<input value={year} inputMode="numeric" placeholder="2017" onChange={e => setYear(e.target.value)} className="rounded-xl bg-[#0d0915] border border-white/10 px-3 py-2 text-sm text-white" /></label>
            <button type="button" disabled={busy || name.trim().length < 2} onClick={addChild} className="rounded-full bg-[#FF6FA8] text-black text-xs font-black px-5 py-2.5 disabled:opacity-50">{busy ? 'Adding…' : 'Add child'}</button>
          </div>
        )}
        {note && <p role="status" className="text-[12px] text-[#06D6A0] mb-4">{note}</p>}

        {kids && kids.length === 0 && !adding && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Users className="mx-auto mb-2 text-white/30" />
            <p className="font-black">No children linked yet</p>
            <p className="text-sm text-white/50 mb-4">Add your child, or ask their teacher to link a school account to you.</p>
            <button type="button" onClick={() => setAdding(true)} className="rounded-full bg-[#FF6FA8] text-black text-xs font-black px-5 py-2.5">Add a child</button>
          </div>
        )}

        {child && (
          <>
            {/* 1 — Communication */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">01</p>
              <h2 className="text-lg font-black mb-1">Talk with {child.displayName}'s teachers</h2>
              <p className="text-[12px] text-white/50 mb-3">Messages stay on Plajah. Nothing is shared with anyone outside the class.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {teachers.map(t => (
                  <div key={t.uid} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full grid place-items-center bg-gradient-to-br from-[#6B0099] to-[#00DAF3] font-black">{t.name[0]?.toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-black truncate">{t.name}</p><p className="text-[11px] text-white/45 truncate">{t.classes.join(' · ')}</p></div>
                    <button type="button" onClick={() => messageTeacher(t.uid)} className="rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-black uppercase tracking-wider px-3.5 py-2 inline-flex items-center gap-1.5"><MessageCircle size={13} /> Message</button>
                  </div>
                ))}
                {teachers.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50 sm:col-span-2">{child.displayName} isn't enrolled in a teacher's class yet. Once they are, their teachers appear here.</div>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => onNavigate('CHAT')} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10">All messages</button>
                <button type="button" onClick={() => onNavigate('EDU_SOCIAL')} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10">School feed</button>
                <button type="button" onClick={() => onNavigate('LEARN')} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10">Learn together: all courses</button>
              </div>
            </section>

            {/* 2 — Progress */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">02</p>
              <h2 className="text-lg font-black mb-3">{child.displayName}'s progress</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {APPS.map(a => <ProgressCard key={a.key} label={a.label} color={a.color} stat={stats ? (stats[a.key] as AppStat) : undefined} onOpen={() => onNavigate(a.view)} />)}
              </div>
              {stats && stats.streakDays > 0 && <p className="text-[12px] text-white/50 mt-3">🔥 {stats.streakDays}-day practice streak</p>}
            </section>

            {/* 3 — Work and assignments */}
            <section className="mb-9">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">03</p>
              <h2 className="text-lg font-black mb-3">Assignments &amp; work</h2>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2 flex items-center gap-1.5"><Clock size={13} /> Still to hand in</p>
                  {work === null && <p className="text-sm text-white/45">Loading…</p>}
                  {work && work.assigned.length === 0 && <p className="text-sm text-white/55 flex items-center gap-1.5"><Check size={14} className="text-[#06D6A0]" /> Nothing outstanding.</p>}
                  {(work?.assigned || []).map(a => {
                    const r = relativeDue(a.dueDate);
                    return <div key={a.assignmentId} className="py-2 border-b border-white/5 last:border-0"><p className="text-sm font-bold">{a.title}</p><p className="text-[11px]" style={{ color: a.overdue ? '#ff6b8a' : r.urgent ? '#FF8C00' : 'rgba(255,255,255,.45)' }}>{a.className} · {r.label}</p></div>;
                  })}
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/45 mb-2 flex items-center gap-1.5"><ClipboardList size={13} /> Handed in</p>
                  {work === null && <p className="text-sm text-white/45">Loading…</p>}
                  {work && work.submissions.length === 0 && <p className="text-sm text-white/55">No work handed in yet.</p>}
                  {(work?.submissions || []).slice(0, 6).map(s => (
                    <div key={s.id} className="py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-bold flex-1 min-w-0 truncate">{s.title}</p>
                        {s.grade ? <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#06D6A0]/15 text-[#5ff0c6] inline-flex items-center gap-1"><Star size={10} />{s.grade.total}/{s.grade.max}</span> : <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#FF8C00]/15 text-[#ffb35c]">awaiting grade</span>}</div>
                      {s.reflection && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-2">“{s.reflection}”</p>}
                      {s.grade?.feedback && <p className="text-[12px] text-white/70 mt-1">Teacher: {s.grade.feedback}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        <WellbeingPanel role="parent" user={user} profile={profile} onNavigate={onNavigate} />
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
    {stat?.started && stat.pct != null && <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full" style={{ width: `${Math.max(3, Math.min(100, stat.pct))}%`, background: color }} /></div>}
  </button>
);

export default ParentHub;
