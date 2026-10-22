import React, { useEffect, useState } from 'react';
import { Accessibility, ArrowRight, BookHeart } from 'lucide-react';
import { activeSupportCount, listSharedPlans, loadPlan, openSupportCenter, PLAN_TYPES, type SupportPlan } from '../../../services/learningSupport';
import { useActiveSupports } from '../../../hooks/useLearningSupport';

/**
 * The Learning Support doorway on each Academia hub, with a live one-line summary:
 *   teacher  how many families have shared a plan with you
 *   parent   the selected child's plan, goals and supports
 *   student  how many supports you have on
 */
interface Props { role: 'teacher' | 'parent' | 'student'; uid?: string; learnerUid?: string; learnerName?: string; onNavigate: (v: string) => void }

const SupportHubCard: React.FC<Props> = ({ role, uid, learnerUid, learnerName, onNavigate }) => {
  const mine = useActiveSupports();
  const [shared, setShared] = useState<SupportPlan[] | null>(null);
  const [plan, setPlan] = useState<SupportPlan | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (role === 'teacher' && uid) listSharedPlans(uid).then(p => alive && setShared(p));
    if (role === 'parent' && learnerUid) { setPlan(undefined); loadPlan(learnerUid).then(p => alive && setPlan(p)); }
    return () => { alive = false; };
  }, [role, uid, learnerUid]);

  const goals = plan ? plan.goals.filter(g => g.status === 'active').length : 0;
  const line = role === 'teacher'
    ? shared === null ? 'Checking for shared plans…' : shared.length ? `${shared.length} learner${shared.length === 1 ? '' : 's'} shared a plan with you. See what to do in class and log progress.` : 'When a family shares an IEP, 504 or learning plan with you, it shows up here.'
    : role === 'parent'
      ? plan === undefined ? 'Loading…' : plan ? `${PLAN_TYPES.find(t => t.id === plan.planType)?.label} · ${goals} active goal${goals === 1 ? '' : 's'} · ${activeSupportCount(plan.supports)} supports on · shared with ${plan.team.length} teacher${plan.team.length === 1 ? '' : 's'}` : `Set up supports, an “All about me” page and goals for ${learnerName || 'your child'}. Private to the teachers you choose.`
      : activeSupportCount(mine) ? `${activeSupportCount(mine)} supports on. Change them any time.` : 'Easier reading, Listen, calm visuals, breaks and more. Turn on whatever helps you.';
  const title = role === 'teacher' ? 'Learning support' : role === 'parent' ? `Learning support for ${learnerName || 'your child'}` : 'My supports';

  return (
    <section className="mb-9 rounded-3xl border border-[#00DAF3]/25 p-5 sm:p-6 flex flex-wrap items-center gap-4" aria-label={title}
      style={{ background: 'linear-gradient(120deg, rgba(0,218,243,.10), rgba(107,0,153,.08) 60%, rgba(255,255,255,.02))' }}>
      <span className="w-12 h-12 rounded-2xl grid place-items-center bg-[#00DAF3]/15 text-[#00DAF3] shrink-0"><Accessibility size={24} /></span>
      <div className="flex-1 min-w-[220px]">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00DAF3]">IEP · 504 · Neurodiversity</p>
        <h2 className="text-lg font-black">{title}</h2>
        <p className="text-[13px] text-white/65 mt-0.5">{line}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openSupportCenter(onNavigate, { tab: 'resources' })} className="min-h-[44px] px-4 rounded-full border border-white/15 text-[12px] font-black uppercase tracking-wider hover:bg-white/10 inline-flex items-center gap-1.5"><BookHeart size={14} /> Resources</button>
        <button type="button" onClick={() => openSupportCenter(onNavigate, role === 'parent' ? { tab: 'plan', learner: learnerUid } : role === 'teacher' ? { tab: 'plan' } : { tab: 'supports' })}
          className="min-h-[44px] px-4 rounded-full bg-[#00DAF3] text-black text-[12px] font-black uppercase tracking-wider inline-flex items-center gap-1.5">{role === 'teacher' ? 'Shared plans' : role === 'parent' ? (plan ? 'Open plan' : 'Set up') : 'My supports'} <ArrowRight size={14} /></button>
      </div>
    </section>
  );
};
export default SupportHubCard;
