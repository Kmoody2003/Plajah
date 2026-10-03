// Pastoral care: care queue (computed in code), follow-up/visit tasks with due dates + assignment,
// milestones digest, drifting members, and ARIA's narrative plan ("who should we follow up with this week?").
import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, Plus, Check, Cake, ListChecks } from 'lucide-react';
import type { ChmsTask, FollowUpCandidates } from '../../../services/chmsPeople';
import { followUpCandidates, ariaFollowUpPlan, saveTask, completeTask, fullName, todayISO } from '../../../services/chmsPeople';
import type { ChmsPerson } from '../../../types';
import CareFlagsPanel from './finance/CareFlagsPanel';
import { usePeople, card, field, fieldSm, btn, btnPrimary, h2, label, Empty, Modal } from './PeopleUI';

const KINDS: ChmsTask['kind'][] = ['FOLLOW_UP', 'WELCOME', 'VISIT', 'HOSPITAL', 'CALL', 'OTHER'];
const inDays = (n: number) => todayISO(new Date(Date.now() + n * 86400000));

const CareHub: React.FC = () => {
  const { org, people, attendance, tasks, gaveFlags, members, access, reload, openPerson } = usePeople();
  const cand: FollowUpCandidates = useMemo(() => followUpCandidates(people, attendance, tasks, gaveFlags), [people, attendance, tasks, gaveFlags]);
  const [plan, setPlan] = useState<{ text: string; ai: boolean } | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [adding, setAdding] = useState<{ person?: ChmsPerson; kind: ChmsTask['kind']; title: string } | null>(null);
  const [form, setForm] = useState({ title: '', dueDate: inDays(3), assignedUid: '', personId: '' });
  const [showDone, setShowDone] = useState(false);
  const staffMembers = members.filter(m => m.status === 'ACTIVE' && m.userId);
  const open = tasks.filter(t => t.status === 'OPEN'), done = tasks.filter(t => t.status === 'DONE').slice(-20).reverse();
  const today = todayISO();

  const runAria = async () => { setPlanBusy(true); setPlan(await ariaFollowUpPlan(org, cand)); setPlanBusy(false); };
  const startTask = (person: ChmsPerson | undefined, kind: ChmsTask['kind'], title: string) => { setAdding({ person, kind, title }); setForm({ title, dueDate: inDays(kind === 'WELCOME' ? 2 : 5), assignedUid: '', personId: person?.id || '' }); };
  const submit = async () => {
    if (!adding) return;
    const person = people.find(p => p.id === form.personId) || adding.person;
    const a = members.find(m => m.userId === form.assignedUid);
    await saveTask(org.id, { kind: adding.kind, title: form.title.trim() || adding.title, dueDate: form.dueDate, personId: person?.id, personName: person ? fullName(person) : 'General', assignedUid: form.assignedUid || undefined, assignedName: a?.displayName });
    setAdding(null); await reload();
  };

  const Chip: React.FC<{ p: ChmsPerson; sub?: string; act: string; kind: ChmsTask['kind']; title: string }> = ({ p, sub, act, kind, title }) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
      <button className="font-bold text-white text-left flex-1 truncate hover:text-small-orange" onClick={() => openPerson(p.id)}>{fullName(p)}</button>
      {sub && <span className="text-white/40 text-[10px]">{sub}</span>}
      {access.staff && <button className="text-[9px] font-black uppercase tracking-widest text-small-orange" onClick={() => startTask(p, kind, title)}>{act}</button>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div><h3 className={`${h2} flex items-center gap-1.5`}><Sparkles size={12} /> This week's follow-ups</h3><p className="text-[10px] text-white/40 mt-0.5">Lists are computed from attendance &amp; dates. ARIA only writes the outreach plan.</p></div>
          <button className={btnPrimary} onClick={runAria} disabled={planBusy}>{planBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Ask ARIA</button>
        </div>
        {plan && <div className="px-4 py-3 rounded-2xl bg-small-orange/5 border border-small-orange/20 text-xs text-white/80 whitespace-pre-wrap">{plan.text}{!plan.ai && <p className="mt-2 text-[9px] text-white/30">ARIA unavailable — showing the built-in summary.</p>}</div>}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${card} p-5 space-y-2`}>
          <h3 className={h2}>New visitors needing follow-up ({cand.newVisitors.length})</h3>
          {cand.newVisitors.map(p => <Chip key={p.id} p={p} act="Welcome task" kind="WELCOME" title={`Welcome ${p.firstName}`} />)}
          {!cand.newVisitors.length && <p className="text-[11px] text-white/30">All recent visitors have been contacted.</p>}
        </div>
        <div className={`${card} p-5 space-y-2`}>
          <h3 className={h2}>Haven't attended in 3+ weeks ({cand.lapsed.length})</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">{cand.lapsed.slice(0, 40).map(x => <Chip key={x.person.id} p={x.person} sub={`${x.weeks} wk`} act="Check in" kind="FOLLOW_UP" title={`Check in with ${x.person.firstName}`} />)}</div>
          {!cand.lapsed.length && <p className="text-[11px] text-white/30">No lapsed attenders.</p>}
        </div>
        <div className={`${card} p-5 space-y-2`}>
          <h3 className={h2}>Drifting members ({cand.drifting.length})</h3>
          {cand.drifting.slice(0, 20).map(x => <Chip key={x.person.id} p={x.person} sub={`score ${x.engagement.score}`} act="Pastoral visit" kind="VISIT" title={`Reconnect with ${x.person.firstName}`} />)}
          {!cand.drifting.length && <p className="text-[11px] text-white/30">No one flagged.</p>}
          <p className="text-[9px] text-white/30">Engagement = attendance + serving + gave yes/no. Amounts are never used.</p>
        </div>
        <div className={`${card} p-5 space-y-2`}>
          <h3 className={`${h2} flex items-center gap-1.5`}><Cake size={12} /> Birthdays &amp; anniversaries (7 days)</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {cand.milestones.map((m, i) => <Chip key={m.person.id + i} p={m.person} sub={`${m.kind}${m.years ? ` · ${m.years}` : ''} · ${m.days === 0 ? 'today' : `in ${m.days}d`}`} act="Send card" kind="OTHER" title={`${m.kind} card for ${m.person.firstName}`} />)}
          </div>
          {!cand.milestones.length && <p className="text-[11px] text-white/30">Nothing this week.</p>}
        </div>
      </div>

      <div className={`${card} p-5 space-y-3`}>
        <div className="flex items-center justify-between"><h3 className={`${h2} flex items-center gap-1.5`}><ListChecks size={12} /> Care tasks ({open.length} open)</h3>
          {access.staff && <button className={btn} onClick={() => startTask(undefined, 'VISIT', '')}><Plus size={12} /> New task</button>}</div>
        {open.length === 0 ? <Empty>No open tasks.</Empty> : open.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
            <button onClick={async () => { await completeTask(t.id); await reload(); }} className="w-5 h-5 rounded border border-white/30 flex items-center justify-center hover:bg-emerald-400/30"><Check size={12} className="text-emerald-300" /></button>
            <div className="flex-1 min-w-0"><p className="font-bold text-white truncate">{t.title}</p><p className="text-[10px] text-white/40">{t.kind.replace('_', ' ')} · {t.personName}{t.assignedName ? ` · ${t.assignedName}` : ''}</p></div>
            <span className={`text-[10px] font-black ${t.dueDate < today ? 'text-red-400' : t.dueDate === today ? 'text-amber-300' : 'text-white/40'}`}>{t.dueDate < today ? 'overdue ' : ''}{t.dueDate}</span>
          </div>
        ))}
        {done.length > 0 && <button className="text-[10px] font-black uppercase tracking-widest text-white/30" onClick={() => setShowDone(s => !s)}>{showDone ? 'Hide' : 'Show'} completed ({done.length})</button>}
        {showDone && done.map(t => <p key={t.id} className="text-[11px] text-white/30 line-through">{t.title} — {t.personName}</p>)}
      </div>

      {adding && (
        <Modal title="Care task" onClose={() => setAdding(null)}>
          <div className="space-y-3">
            <select value={adding.kind} onChange={e => setAdding({ ...adding, kind: e.target.value as any })} className={field}>{KINDS.map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select>
            <select value={form.personId} onChange={e => setForm(f => ({ ...f, personId: e.target.value }))} className={field}><option value="">Person…</option>{people.slice(0, 600).map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to happen?" className={field} />
            <div className="grid grid-cols-2 gap-2"><div><p className={`${label} mb-1`}>Due</p><input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={field} /></div>
              <div><p className={`${label} mb-1`}>Assign to</p><select value={form.assignedUid} onChange={e => setForm(f => ({ ...f, assignedUid: e.target.value }))} className={field}><option value="">Unassigned</option>{staffMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName || m.userId.slice(0, 6)}</option>)}</select></div></div>
            <button className={`${btnPrimary} w-full`} disabled={!form.title.trim() && !adding.title} onClick={submit}>Create task</button>
          </div>
        </Modal>
      )}
      {access.staff && <CareFlagsPanel orgId={org.id} onOpenPerson={openPerson} />}
      <span className={fieldSm + ' hidden'} />
    </div>
  );
};

export default CareHub;
