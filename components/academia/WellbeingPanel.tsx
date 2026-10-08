import React, { useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Wind, X, Check, Lock, HandHeart } from 'lucide-react';
import Stillness from '../ora/Stillness';
import { saveCheckin, getCheckin, today } from '../../services/oraService';
import { MOODS, HELP_LINE, HAND_LABEL, submitWeather, hasVoted, getWeather, summarizeWeather, askForHand, listHandRequests, markSeen, K_MIN, type Mood, type HandKind, type HandRequest, type WeatherSummary } from '../../services/oraEdu';

/**
 * Ora wellbeing for the education stack, one panel for three roles.
 *  student: a private check-in (stays on the student's own Ora), an anonymous class-weather tap, a calm
 *           corner, and "I need a hand" which tells a chosen grown-up only that help was asked for.
 *  teacher: class weather once 5+ students answered (never who), a calm start for the room, requests, their own break.
 *  parent:  when their child asked for a hand, plus simple ways to help. Never the child's check-ins or journal.
 */
type Role = 'student' | 'teacher' | 'parent';
interface Props { role: Role; user?: any; profile?: any; classes?: any[]; onNavigate: (view: string) => void }

const card = 'rounded-3xl border border-white/10 bg-white/[0.04] p-5';
const pill = 'rounded-full px-4 py-2 text-[12px] font-black';

const CalmOverlay: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[300] bg-[#07060d]/95 backdrop-blur-md overflow-auto">
    <div className="max-w-xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-black text-white">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white"><X size={16} /></button></div>
      <Stillness />
    </div>
  </div>
);

const WellbeingPanel: React.FC<Props> = ({ role, user, profile, classes = [], onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const name = profile?.displayName || profile?.name || user?.displayName || 'A student';
  const [calm, setCalm] = useState<null | string>(null);
  const [mine, setMine] = useState<Mood | null>(null);
  const [savedMine, setSavedMine] = useState(false);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [weather, setWeather] = useState<Record<string, WeatherSummary>>({});
  const [reqs, setReqs] = useState<HandRequest[]>([]);
  const [handOpen, setHandOpen] = useState(false);
  const [sentKind, setSentKind] = useState<HandKind | null>(null);
  const [err, setErr] = useState('');

  const myClasses = useMemo(() => classes.filter(c => c?.id), [classes]);
  const grownUps = useMemo(() => {
    const t = myClasses.map(c => c.ownerId).filter(Boolean);
    const g = [profile?.guardianUid, ...(profile?.coGuardianUids || [])].filter(Boolean);
    return { teachers: [...new Set(t)] as string[], guardians: [...new Set(g)] as string[] };
  }, [myClasses, profile]);

  useEffect(() => { if (role === 'student') getCheckin().then(c => { if (c) { setMine(c.mood); setSavedMine(true); } }).catch(() => {}); }, [role]);
  useEffect(() => { setVoted(Object.fromEntries(myClasses.map(c => [c.id, hasVoted(c.id)]))); }, [myClasses]);
  useEffect(() => {
    if (role !== 'teacher') return; let alive = true;
    Promise.all(myClasses.filter(c => c.ownerId === uid).map(async c => [c.id, summarizeWeather(await getWeather(c.id).catch(() => null))] as const)).then(r => alive && setWeather(Object.fromEntries(r)));
    return () => { alive = false; };
  }, [role, myClasses, uid]);
  useEffect(() => { if (role !== 'student') listHandRequests().then(setReqs).catch(() => {}); }, [role]);

  const checkIn = async (m: Mood) => { setMine(m); try { await saveCheckin({ mood: m, surface: 'ROOM' } as any); setSavedMine(true); } catch { setErr('Could not save that. It stays private either way.'); } };
  const tapWeather = async (classId: string, m: Mood) => { try { if (await submitWeather(classId, m)) setVoted(v => ({ ...v, [classId]: true })); } catch { setErr('Could not send that.'); } };
  const ask = async (kind: HandKind, to: string[]) => {
    setErr(''); try { await askForHand({ studentName: name, kind, toUids: to, classId: myClasses[0]?.id }); setSentKind(kind); setHandOpen(false); } catch { setErr('Could not reach them. Tell a grown-up near you.'); }
  };

  return (
    <section aria-label="Wellbeing" className="text-white">
      <div className="flex items-center gap-2 mb-3"><HeartHandshake size={16} className="text-[#5ff0c6]" /><h2 className="text-lg font-black">{role === 'student' ? 'How are you today?' : role === 'teacher' ? 'Wellbeing' : 'Wellbeing at home'}</h2></div>

      {role === 'student' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45 flex items-center gap-1.5"><Lock size={11} /> Only you can see this</p>
            <div className="flex gap-1.5 mt-3 flex-wrap" role="group" aria-label="My check-in">{MOODS.map(m => (
              <button key={m.v} type="button" aria-pressed={mine === m.v} aria-label={m.label} onClick={() => checkIn(m.v)} className={`w-14 h-14 rounded-2xl text-2xl grid place-items-center border ${mine === m.v ? 'border-white bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>{m.emoji}</button>))}</div>
            <p className="text-[12px] text-white/50 mt-2">{savedMine ? 'Saved to your private Ora. Your teacher and grown-ups do not see it.' : 'Pick the weather inside you. No right answer.'}</p>
            <div className="flex gap-2 flex-wrap mt-3"><button type="button" onClick={() => setCalm('My calm corner')} className={`${pill} bg-white text-black inline-flex items-center gap-1.5`}><Wind size={13} /> Calm corner</button><button type="button" onClick={() => onNavigate('ORA')} className={`${pill} border border-white/20`}>My journal and goals</button></div>
          </div>
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45">Class weather (nobody sees your answer)</p>
            {myClasses.length === 0 && <p className="text-[12px] text-white/45 mt-2">Join a class to share class weather.</p>}
            {myClasses.slice(0, 3).map(c => (
              <div key={c.id} className="mt-2"><p className="text-[12px] font-black">{c.title || c.name || 'Class'}</p>
                {voted[c.id] ? <p className="text-[12px] text-[#5ff0c6] flex items-center gap-1"><Check size={12} /> Thanks. Your answer is anonymous and the teacher only sees a class summary.</p>
                  : <div className="flex gap-1 mt-1">{MOODS.map(m => <button key={m.v} type="button" aria-label={`${c.title || 'Class'}: ${m.label}`} onClick={() => tapWeather(c.id, m.v)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/15 text-xl">{m.emoji}</button>)}</div>}</div>))}
            <div className="mt-4 pt-3 border-t border-white/10">
              {sentKind ? <p className="text-[12px] text-[#5ff0c6] flex gap-1.5"><Check size={13} className="mt-0.5" /> They know you asked. {HAND_LABEL[sentKind]}.</p>
                : <button type="button" onClick={() => setHandOpen(true)} className={`${pill} bg-[#D40055] text-white inline-flex items-center gap-1.5`}><HandHeart size={14} /> I need a hand</button>}
              <p className="text-[11px] text-white/40 mt-2 leading-snug">{HELP_LINE}</p>
            </div>
          </div>
        </div>)}

      {role === 'teacher' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45">Class weather today</p>
            {myClasses.filter(c => c.ownerId === uid).length === 0 && <p className="text-[12px] text-white/45 mt-2">No classes yet.</p>}
            {myClasses.filter(c => c.ownerId === uid).slice(0, 5).map(c => { const w = weather[c.id]; return (
              <div key={c.id} className="mt-2 rounded-xl bg-black/20 px-3 py-2"><p className="text-[12px] font-black">{c.title || c.name || 'Class'}</p>
                {!w || !w.shown ? <p className="text-[11px] text-white/45">{w && w.total > 0 ? `Waiting for ${K_MIN - w.total} more answer${K_MIN - w.total === 1 ? '' : 's'} before showing a summary, so no one can be singled out.` : 'No answers yet today.'}</p>
                  : <><div className="flex gap-1 mt-1" aria-label="Class weather summary">{MOODS.map(m => <div key={m.v} className="flex-1 text-center"><div className="h-10 rounded bg-white/10 relative overflow-hidden"><div className="absolute bottom-0 left-0 right-0 bg-[#5ff0c6]/70" style={{ height: `${w.share![m.v]}%` }} /></div><span className="text-sm">{m.emoji}</span></div>)}</div><p className="text-[11px] text-white/60 mt-1">{w.headline} ({w.total} answers)</p></>}</div>); })}
            <div className="flex gap-2 flex-wrap mt-3"><button type="button" onClick={() => setCalm('A calm start for the room')} className={`${pill} bg-white text-black inline-flex items-center gap-1.5`}><Wind size={13} /> Calm start for the room</button><button type="button" onClick={() => setCalm('Take a minute for yourself')} className={`${pill} border border-white/20`}>Take a minute</button></div>
          </div>
          <RequestsCard reqs={reqs} setReqs={setReqs} who="teacher" />
        </div>)}

      {role === 'parent' && (
        <div className="grid md:grid-cols-2 gap-3">
          <RequestsCard reqs={reqs} setReqs={setReqs} who="parent" />
          <div className={card}>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45">What you will and will not see</p>
            <p className="text-[12px] text-white/65 mt-2 leading-relaxed">Your child's check-ins and journal stay private to them, because children share more when they know it is theirs. You are told when they press "I need a hand", and only that.</p>
            <p className="text-[12px] text-white/65 mt-2 leading-relaxed">Good ways to help: ask open questions, listen before fixing, keep a regular bedtime, and share your own calm with them.</p>
            <div className="flex gap-2 flex-wrap mt-3"><button type="button" onClick={() => setCalm('A calm minute together')} className={`${pill} bg-white text-black inline-flex items-center gap-1.5`}><Wind size={13} /> Breathe together</button><button type="button" onClick={() => onNavigate('ORA')} className={`${pill} border border-white/20`}>My own Ora</button></div>
            <p className="text-[11px] text-white/40 mt-3 leading-snug">{HELP_LINE}</p>
          </div>
        </div>)}

      {err && <p role="alert" className="text-[12px] text-rose-300 mt-2">{err}</p>}

      {handOpen && (
        <div role="dialog" aria-modal="true" aria-label="I need a hand" className="fixed inset-0 z-[300] bg-black/70 grid place-items-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0e0b16] border border-white/10 p-6 text-white">
            <h3 className="text-lg font-black">Who should know, and what do you need?</h3>
            <p className="text-[12px] text-white/55 mt-1">They will only see that you asked. They will not see your check-ins or anything private.</p>
            {(['TALK', 'BREAK', 'QUIET'] as HandKind[]).map(k => (
              <div key={k} className="mt-3"><p className="text-[12px] font-black">{HAND_LABEL[k]}</p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {grownUps.teachers.length > 0 && <button type="button" onClick={() => ask(k, grownUps.teachers)} className={`${pill} bg-white text-black`}>Tell my teacher</button>}
                  {grownUps.guardians.length > 0 && <button type="button" onClick={() => ask(k, grownUps.guardians)} className={`${pill} bg-white text-black`}>Tell my grown-up</button>}
                  {(grownUps.teachers.length > 0 && grownUps.guardians.length > 0) && <button type="button" onClick={() => ask(k, [...grownUps.teachers, ...grownUps.guardians])} className={`${pill} border border-white/25`}>Both</button>}
                </div></div>))}
            {grownUps.teachers.length + grownUps.guardians.length === 0 && <p className="text-[12px] text-amber-300 mt-3">No teacher or grown-up is linked to this account yet. Please tell a trusted adult near you.</p>}
            <p className="text-[11px] text-white/40 mt-4 leading-snug">{HELP_LINE}</p>
            <button type="button" onClick={() => setHandOpen(false)} className="mt-3 text-[12px] text-white/50 underline">Not now</button>
          </div>
        </div>)}

      {calm && <CalmOverlay title={calm} onClose={() => setCalm(null)} />}
      <span className="sr-only">{today()}</span>
    </section>
  );
};

const RequestsCard: React.FC<{ reqs: HandRequest[]; setReqs: (r: HandRequest[]) => void; who: 'teacher' | 'parent' }> = ({ reqs, setReqs, who }) => (
  <div className={card}>
    <p className="text-[11px] font-black uppercase tracking-wider text-white/45">Students who asked for a hand</p>
    {reqs.length === 0 && <p className="text-[12px] text-white/45 mt-2">No requests. You will see them here when a student asks.</p>}
    <div className="grid gap-2 mt-2">{reqs.slice(0, 6).map(r => { const me = r.seenBy.length > 0; return (
      <div key={r.id} className={`rounded-xl px-3 py-2 border ${me ? 'border-white/8 bg-white/[0.02]' : 'border-[#D40055]/40 bg-[#D40055]/10'}`}>
        <p className="text-[13px] font-black">{r.studentName}</p><p className="text-[12px] text-white/65">{HAND_LABEL[r.kind]}</p>
        <p className="text-[10px] text-white/35">{new Date(r.createdAt).toLocaleString()}</p>
        {!me && <button type="button" onClick={async () => { await markSeen(r.id).catch(() => {}); setReqs(reqs.map(x => (x.id === r.id ? { ...x, seenBy: [...x.seenBy, 'me'] } : x))); }} className="mt-1 text-[11px] font-black underline text-[#7fe0bd]">Mark as seen</button>}
      </div>); })}</div>
    <p className="text-[11px] text-white/40 mt-3 leading-snug">{who === 'teacher' ? 'Follow your school’s student-support process. Ora does not assess or diagnose; it only tells you a student asked.' : 'Talk with them kindly and privately. If you are worried about their safety, contact their school or local emergency services.'}</p>
  </div>);

export default WellbeingPanel;
