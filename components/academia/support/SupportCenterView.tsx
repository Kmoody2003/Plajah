import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookHeart, ClipboardList, HeartHandshake, Lock, Newspaper, Sparkles, Users } from 'lucide-react';
import {
  emptyPlan, listSharedPlans, loadPlan, savePlan, saveTeamFields, supportActions, PLAN_TYPES,
  type SupportPlan, type SupportTab, type TeamMember,
} from '../../../services/learningSupport';
import { fetchClassrooms, listChildProfiles } from '../../../services/backendService';
import { AboutMeEditor, OnePageProfile, SupportsEditor, card, eyebrow } from './ProfileEditors';
import PlanGoals, { type PlanMode } from './PlanGoals';
import ResourceCenter from './ResourceCenter';
import SupportCommunity from './SupportCommunity';

/**
 * Learning Support (ACADEMIA_SUPPORT): Academia's IEP / 504 / neurodiversity home.
 *
 *   Whose plan   Me · each of my children · my students (plans families have shared with me)
 *   Supports     the switches that change how Academia behaves for that learner
 *   All about me strengths-first profile, communication, optional identity, printable one-page profile
 *   Plan & goals plan type, review dates, what the team should do, measurable goals with progress, the team, notes
 *   Resources    guides for parents, teachers and learners
 *   Community    inclusion-tagged posts from the school-community feed
 *
 * Opened from the teacher, parent and student hubs and from the Supports dock; a hub can preselect a tab and a learner
 * through sessionStorage `plajah:support` ({ tab, learner }).
 */
type Tab = SupportTab;
type Who = { kind: 'me' } | { kind: 'child'; uid: string } | { kind: 'students' };

interface Props { user?: any; profile?: any; onNavigate: (view: string) => void }


function useAutosave(plan: SupportPlan | null, dirty: boolean, save: (p: SupportPlan) => Promise<boolean>) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!plan || !dirty) return;
    if (t.current) clearTimeout(t.current);
    setState('saving');
    t.current = setTimeout(() => { save(plan).then(ok => setState(ok ? 'saved' : 'local')); }, 700);
    return () => { if (t.current) clearTimeout(t.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  return state;
}

const SaveState: React.FC<{ s: ReturnType<typeof useAutosave> }> = ({ s }) => (
  <span role="status" className={`text-[12px] ${s === 'local' ? 'text-[#FFB266]' : 'text-white/50'}`}>
    {s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : s === 'local' ? 'Saved on this device only. Check your connection.' : ''}
  </span>
);

const SupportCenterView: React.FC<Props> = ({ user, profile, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const myName: string = profile?.displayName || user?.displayName || 'Me';
  const isChildAcct = !!(profile?.isChild || profile?.accountType === 'CHILD');
  const isTeacher = profile?.accountType === 'TEACHER' || !!profile?.isTeacher || (profile?.teachingKind || []).length > 0;

  const preset = useMemo(() => { try { const v = JSON.parse(sessionStorage.getItem('plajah:support') || '{}'); sessionStorage.removeItem('plajah:support'); return v || {}; } catch { return {}; } }, []);
  const [tab, setTab] = useState<Tab>(preset.tab || (isTeacher ? 'plan' : 'supports'));
  const [kids, setKids] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [who, setWho] = useState<Who>(preset.learner ? { kind: 'child', uid: preset.learner } : isTeacher && profile?.accountType === 'TEACHER' ? { kind: 'students' } : { kind: 'me' });

  useEffect(() => {
    if (!uid) return;
    if (!isChildAcct) listChildProfiles(uid).then(k => setKids(k || [])).catch(() => {});
    fetchClassrooms().then(c => setClasses(c || [])).catch(() => {});
  }, [uid, isChildAcct]);

  // The plan being edited (me or a child).
  const subjectUid = who.kind === 'me' ? uid : who.kind === 'child' ? who.uid : undefined;
  const subjectChild = who.kind === 'child' ? kids.find(k => k.uid === who.uid) : null;
  const [plan, setPlan] = useState<SupportPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    setPlan(null); setDirty(false);
    if (!subjectUid) return;
    let alive = true;
    const name = who.kind === 'me' ? myName : subjectChild?.displayName;
    loadPlan(subjectUid).then(p => { if (alive) setPlan(p ? { ...p, learnerName: p.learnerName || name } : emptyPlan(subjectUid, name, who.kind === 'child' ? uid : profile?.guardianUid)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectUid, subjectChild?.displayName]);
  const edit = (p: SupportPlan) => { setPlan(p); setDirty(true); };
  const saveState = useAutosave(plan, dirty, savePlan);

  // Teachers: plans families have shared with them.
  const [shared, setShared] = useState<SupportPlan[] | null>(null);
  const [openShared, setOpenShared] = useState<string | null>(null);
  const [teamDirty, setTeamDirty] = useState(false);
  useEffect(() => { if (who.kind === 'students' && uid) listSharedPlans(uid).then(setShared); }, [who.kind, uid]);
  const sharedPlan = shared?.find(p => p.learnerUid === openShared) || null;
  const editShared = (p: SupportPlan) => { setShared(list => (list || []).map(x => (x.learnerUid === p.learnerUid ? p : x))); setTeamDirty(true); };
  const teamSave = useAutosave(sharedPlan, teamDirty, p => saveTeamFields(p.learnerUid, { goals: p.goals, teamNotes: p.teamNotes || '' }));

  const candidates: TeamMember[] = useMemo(() => {
    if (!subjectUid) return [];
    const m = new Map<string, TeamMember>();
    for (const c of classes) if (c?.ownerId && c.ownerId !== subjectUid && c.ownerId !== uid && (c.enrolledStudents || []).includes(subjectUid)) m.set(c.ownerId, { uid: c.ownerId, name: c.ownerName || 'Teacher', role: 'teacher' });
    return [...m.values()];
  }, [classes, subjectUid, uid]);

  const self = who.kind === 'me';
  const mode: PlanMode = self && isChildAcct ? 'view' : 'family';
  const canEditTeam = !(self && isChildAcct);
  const personTabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = who.kind === 'students'
    ? [{ id: 'plan', label: 'Shared with me', icon: ClipboardList }]
    : [{ id: 'supports', label: 'Supports', icon: Sparkles }, { id: 'about', label: 'All about me', icon: HeartHandshake }, { id: 'plan', label: 'Plan & goals', icon: ClipboardList }];
  const allTabs = [...personTabs, { id: 'resources' as Tab, label: 'Resources', icon: BookHeart }, { id: 'community' as Tab, label: 'News & community', icon: Newspaper }];
  useEffect(() => { if (!allTabs.some(t => t.id === tab)) setTab(allTabs[0].id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [who.kind]);
  const eduRole = isTeacher ? 'TEACHER' : profile?.accountType === 'PARENT' || kids.length ? 'PARENT' : 'STUDENT';

  const whoChip = (on: boolean) => `min-h-[44px] px-4 rounded-full border text-[14px] font-bold inline-flex items-center gap-2 ${on ? 'bg-[#00DAF3] text-black border-[#00DAF3]' : 'border-white/15 text-white/75 hover:border-white/35'}`;

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-28">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
        {/* Hero */}
        <section className="relative rounded-[28px] overflow-hidden border border-white/10 px-5 sm:px-10 py-8 sm:py-10" style={{ background: 'radial-gradient(120% 140% at 0% 0%, rgba(0,218,243,.18), transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(212,0,85,.16), transparent 60%), #0e0e16' }}>
          <p className={`${eyebrow} text-[#00DAF3]`}>Learning Support · IEP · 504 · Neurodiversity</p>
          <h1 className="text-[30px] sm:text-[46px] font-black leading-[1.05] mt-2 max-w-[18ch]" style={{ fontFamily: 'Outfit, system-ui' }}>Every kind of mind belongs here</h1>
          <p className="text-[15px] sm:text-[17px] text-white/75 mt-3 max-w-[62ch]">Autistic, ADHD, dyslexic, and every other kind of learner gets first-class support in Academia. Supports change how lessons work, plans keep the whole team on the same page, and families and teachers get guides they can trust.</p>
          <ul className="flex flex-wrap gap-2 mt-5 text-[12.5px]">
            {['No diagnosis needed for any support', 'Strengths first', 'Private to the people you choose', 'The learner’s voice leads'].map(t => <li key={t} className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 font-semibold">{t}</li>)}
          </ul>
        </section>

        {/* Whose plan */}
        {uid && (
          <nav className="flex flex-wrap items-center gap-2 mt-6" aria-label="Whose supports">
            <button type="button" aria-pressed={who.kind === 'me'} onClick={() => setWho({ kind: 'me' })} className={whoChip(who.kind === 'me')}>Me</button>
            {kids.map(k => <button key={k.uid} type="button" aria-pressed={who.kind === 'child' && who.uid === k.uid} onClick={() => setWho({ kind: 'child', uid: k.uid })} className={whoChip(who.kind === 'child' && who.uid === k.uid)}>{k.displayName || 'My child'}</button>)}
            {isTeacher && <button type="button" aria-pressed={who.kind === 'students'} onClick={() => setWho({ kind: 'students' })} className={whoChip(who.kind === 'students')}><Users size={16} /> My students</button>}
            <span className="flex-1" />
            {who.kind !== 'students' && <SaveState s={saveState} />}
            {who.kind === 'students' && <SaveState s={teamSave} />}
          </nav>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Learning support sections" className="flex gap-1 overflow-x-auto mt-4 mb-6 border-b border-white/10 -mx-1 px-1">
          {allTabs.map(t => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`min-h-[48px] px-4 text-[14px] font-bold inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-[#00DAF3] text-white' : 'border-transparent text-white/55 hover:text-white'}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {!uid && ['supports', 'about', 'plan'].includes(tab) && (
          <div className={`${card} mb-5`}>
            <p className="text-[15px] font-bold">Supports work without an account</p>
            <p className="text-[13px] text-white/60 mt-1">Use the Supports button on any learning screen. Sign in to save a plan, write an “All about me” page and share it with teachers.</p>
          </div>
        )}

        <div role="tabpanel">
          {tab === 'supports' && who.kind !== 'students' && plan && (
            <>
              <p className="text-[14px] text-white/65 mb-4 max-w-[70ch]">{self ? 'Turn on whatever helps. These follow you to every lesson on any device you sign in on, and you can also flip the common ones from the Supports button on any learning screen.' : `These follow ${plan.learnerName || 'your child'} to every lesson on any device they sign in on.`}</p>
              <SupportsEditor supports={plan.supports} onChange={s => edit({ ...plan, supports: s })} />
            </>
          )}
          {tab === 'about' && who.kind !== 'students' && plan && <AboutMeEditor plan={plan} self={self} onChange={a => edit({ ...plan, about: a })} onPrint={() => setPrinting(true)} />}
          {tab === 'plan' && who.kind !== 'students' && plan && <PlanGoals plan={plan} mode={mode} me={uid ? { uid, name: myName } : undefined} candidates={candidates} canEditTeam={canEditTeam} onChange={edit} />}
          {['supports', 'about', 'plan'].includes(tab) && who.kind !== 'students' && uid && !plan && <p className="text-[14px] text-white/50">Loading…</p>}

          {tab === 'plan' && who.kind === 'students' && (
            <div className="grid gap-5">
              {shared === null && <p className="text-[14px] text-white/50">Loading plans shared with you…</p>}
              {shared && shared.length === 0 && (
                <div className={card}>
                  <Lock className="text-white/35 mb-2" />
                  <p className="text-[16px] font-bold">No plans shared with you yet</p>
                  <p className="text-[13px] text-white/60 mt-1 max-w-[62ch]">Families and learners choose which teachers see their supports. When one shares a plan with you, you'll see exactly what to do in class, their goals, and a place to log progress.</p>
                </div>
              )}
              {shared && shared.length > 0 && !sharedPlan && (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
                  {shared.map(p => {
                    const acts = supportActions(p.supports, p.about);
                    const goals = p.goals.filter(g => g.status === 'active').length;
                    return (
                      <button key={p.learnerUid} type="button" onClick={() => { setOpenShared(p.learnerUid); setTeamDirty(false); }} className="text-left rounded-3xl border border-white/10 bg-white/[0.035] p-5 hover:border-[#00DAF3]/50 transition-colors">
                        <p className="text-[18px] font-black">{p.about.preferredName || p.learnerName || 'Learner'}</p>
                        <p className="text-[12px] text-[#00DAF3] font-bold mt-0.5">{PLAN_TYPES.find(t => t.id === p.planType)?.label} · {goals} active goal{goals === 1 ? '' : 's'}</p>
                        {p.about.strengths.length > 0 && <p className="text-[13px] text-white/70 mt-2"><b className="text-[#F5B83D]">Strengths:</b> {p.about.strengths.slice(0, 3).join(', ')}</p>}
                        <ul className="mt-2 grid gap-1">{acts.slice(0, 3).map((a, i) => <li key={i} className="text-[12.5px] text-white/60 leading-snug">• {a}</li>)}</ul>
                        {acts.length > 3 && <p className="text-[12px] text-white/45 mt-1">+{acts.length - 3} more</p>}
                      </button>
                    );
                  })}
                </div>
              )}
              {sharedPlan && (
                <>
                  <button type="button" onClick={() => setOpenShared(null)} className="self-start min-h-[44px] px-4 rounded-full border border-white/15 text-[13px] font-bold hover:bg-white/10">← All shared plans</button>
                  <h2 className="text-[26px] font-black" style={{ fontFamily: 'Outfit, system-ui' }}>{sharedPlan.about.preferredName || sharedPlan.learnerName}</h2>
                  <PlanGoals plan={sharedPlan} mode="team" me={uid ? { uid, name: myName } : undefined} onChange={editShared} />
                  <AboutMeEditor plan={sharedPlan} readOnly onChange={() => {}} onPrint={() => setPrinting(true)} />
                </>
              )}
            </div>
          )}

          {tab === 'resources' && <ResourceCenter defaultAudience={isTeacher ? 'teacher' : kids.length || profile?.accountType === 'PARENT' ? 'parent' : isChildAcct ? 'learner' : 'all'} />}
          {tab === 'community' && <SupportCommunity currentUser={user} profile={profile} eduRole={eduRole} />}
        </div>
      </div>
      {printing && (who.kind === 'students' ? sharedPlan : plan) && <OnePageProfile plan={(who.kind === 'students' ? sharedPlan : plan)!} onClose={() => setPrinting(false)} />}
    </div>
  );
};
export default SupportCenterView;
