import React, { useState } from 'react';
import { CalendarDays, Check, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import {
  GOAL_AREAS, PLAN_TYPES, latestValue, newGoalId, supportActions,
  type GoalArea, type SupportGoal, type SupportPlan, type TeamMember,
} from '../../../services/learningSupport';
import { card, eyebrow } from './ProfileEditors';

/**
 * The formal half of a support plan: plan type, review dates, measurable goals with a progress trend, the team the
 * family has chosen, and shared team notes.
 *   family  learner (adult) or guardian: edits everything
 *   team    a teacher on the team: logs progress, edits shared notes; everything else is read-only
 *   view    a child learner: sees their goals and progress, cannot change the plan
 */
export type PlanMode = 'family' | 'team' | 'view';

const areaOf = (id: GoalArea) => GOAL_AREAS.find(a => a.id === id) || GOAL_AREAS[GOAL_AREAS.length - 1];
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Progress points over time against the target line. */
const Trend: React.FC<{ g: SupportGoal; color: string }> = ({ g, color }) => {
  const pts = [...g.entries].sort((a, b) => a.at - b.at).slice(-12);
  const W = 220, H = 56, pad = 4;
  if (!pts.length) return <div className="h-[56px] grid place-items-center text-[12px] text-white/40 rounded-xl border border-dashed border-white/12">No data yet</div>;
  const x = (i: number) => pad + (pts.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (pts.length - 1));
  const y = (v: number) => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[56px]" role="img" aria-label={`Progress: ${pts.map(p => p.value).join(', ')}; target ${g.target}`}>
      <line x1={pad} x2={W - pad} y1={y(g.target)} y2={y(g.target)} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={3.2} fill={color} />)}
    </svg>
  );
};

const GoalCard: React.FC<{ g: SupportGoal; mode: PlanMode; me?: { uid: string; name: string }; onChange: (g: SupportGoal | null) => void }> = ({ g, mode, me, onChange }) => {
  const a = areaOf(g.area);
  const [val, setVal] = useState('');
  const [note, setNote] = useState('');
  const last = latestValue(g);
  const canLog = mode !== 'view';
  const log = () => {
    const v = parseFloat(val); if (!Number.isFinite(v)) return;
    onChange({ ...g, entries: [...g.entries, { at: Date.now(), value: Math.max(0, Math.min(100, v)), note: note.trim() || undefined, by: me?.uid, byName: me?.name }] });
    setVal(''); setNote('');
  };
  return (
    <article className="rounded-3xl border p-4 sm:p-5 bg-white/[0.03]" style={{ borderColor: `${a.color}40` }}>
      <div className="flex items-start gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] rounded-full px-2.5 py-1" style={{ color: a.color, background: `${a.color}18` }}>{a.label}</span>
        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${g.status === 'met' ? 'bg-[#06D6A0]/15 text-[#06D6A0]' : g.status === 'paused' ? 'bg-white/10 text-white/60' : 'bg-white/5 text-white/70'}`}>{g.status === 'met' ? 'Met' : g.status === 'paused' ? 'Paused' : 'Working on it'}</span>
        <span className="flex-1" />
        {mode === 'family' && (
          <>
            <select aria-label="Goal status" value={g.status} onChange={e => onChange({ ...g, status: e.target.value as SupportGoal['status'] })} className="bg-transparent border border-white/15 rounded-full text-[12px] px-2 py-1">
              <option value="active" style={{ color: '#000' }}>Working on it</option><option value="met" style={{ color: '#000' }}>Met</option><option value="paused" style={{ color: '#000' }}>Paused</option>
            </select>
            <button type="button" aria-label="Delete goal" onClick={() => { if (confirm('Delete this goal and its progress?')) onChange(null); }} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 text-white/50"><Trash2 size={14} /></button>
          </>
        )}
      </div>
      <p className="text-[15px] font-semibold leading-snug mt-3">{g.statement}</p>
      {g.baseline && <p className="text-[12.5px] text-white/55 mt-1">Starting point: {g.baseline}</p>}
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center mt-3">
        <Trend g={g} color={a.color} />
        <div className="text-right">
          <p className="text-[26px] font-black tabular-nums" style={{ color: a.color, fontFamily: 'Outfit' }}>{last == null ? '—' : last}<span className="text-[13px] text-white/50 font-semibold"> / {g.target}</span></p>
          <p className="text-[11px] text-white/50">{g.unit}</p>
        </div>
      </div>
      {g.entries.length > 0 && (
        <details className="mt-2">
          <summary className="text-[12px] text-white/55 cursor-pointer">{g.entries.length} data point{g.entries.length === 1 ? '' : 's'}</summary>
          <ul className="mt-2 grid gap-1 text-[12.5px] text-white/70">
            {[...g.entries].sort((x, y) => y.at - x.at).map((e, i) => <li key={i}><b className="tabular-nums">{e.value}</b> · {fmt(e.at)}{e.byName ? ` · ${e.byName}` : ''}{e.note ? ` — ${e.note}` : ''}</li>)}
          </ul>
        </details>
      )}
      {canLog && g.status === 'active' && (
        <div className="flex flex-wrap gap-2 mt-3">
          <input inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} aria-label="Progress value" placeholder="Value" className="w-24 min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3 text-[14px] outline-none focus:border-[#00DAF3]" />
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={140} aria-label="Note" placeholder="Note: support used, how it went" className="flex-1 min-w-[160px] min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3 text-[14px] outline-none focus:border-[#00DAF3]" />
          <button type="button" onClick={log} disabled={!val.trim()} className="min-h-[44px] px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-[13px] font-bold disabled:opacity-40 inline-flex items-center gap-1.5"><Check size={14} /> Log</button>
        </div>
      )}
    </article>
  );
};

const NewGoal: React.FC<{ onAdd: (g: SupportGoal) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<GoalArea>('reading');
  const [statement, setStatement] = useState('');
  const [baseline, setBaseline] = useState('');
  const [target, setTarget] = useState('80');
  const [unit, setUnit] = useState('% accuracy');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="min-h-[48px] px-5 rounded-full border border-dashed border-white/25 text-[14px] font-bold hover:bg-white/5 inline-flex items-center gap-2"><Plus size={16} /> Add a goal</button>;
  const ok = statement.trim().length > 8;
  return (
    <div className="rounded-3xl border border-white/15 p-5 grid gap-3">
      <p className="text-[15px] font-bold">New goal</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Area">
        {GOAL_AREAS.map(a => <button key={a.id} type="button" role="radio" aria-checked={area === a.id} onClick={() => setArea(a.id)} className="min-h-[38px] px-3 rounded-full border text-[12.5px] font-semibold" style={area === a.id ? { borderColor: a.color, background: `${a.color}22`, color: '#fff' } : { borderColor: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' }}>{a.label}</button>)}
      </div>
      <label className="block">
        <span className="text-[13px] font-bold text-white/80">Goal</span>
        <textarea value={statement} onChange={e => setStatement(e.target.value)} rows={3} maxLength={500} placeholder="Given [condition], [learner] will [skill] [how well], e.g. “Given a grade-level passage read aloud or in print, Sam will retell the main idea and two details in 4 of 5 opportunities.”"
          className="mt-1 w-full rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 py-2.5 text-[14px] outline-none focus:border-[#00DAF3]" />
      </label>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-1"><span className="text-[13px] font-bold text-white/80">Starting point</span><input value={baseline} onChange={e => setBaseline(e.target.value)} maxLength={120} placeholder="e.g. 2 of 5 in September" className="mt-1 w-full min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3]" /></label>
        <label className="block"><span className="text-[13px] font-bold text-white/80">Target (0–100)</span><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} className="mt-1 w-full min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3]" /></label>
        <label className="block"><span className="text-[13px] font-bold text-white/80">Measured as</span><input value={unit} onChange={e => setUnit(e.target.value)} maxLength={30} className="mt-1 w-full min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3]" /></label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!ok} onClick={() => { onAdd({ id: newGoalId(), area, statement: statement.trim(), baseline: baseline.trim() || undefined, target: Math.max(1, Math.min(100, parseFloat(target) || 80)), unit: unit.trim() || '%', entries: [], status: 'active', createdAt: Date.now() }); setOpen(false); setStatement(''); setBaseline(''); }}
          className="min-h-[44px] px-5 rounded-full bg-[#00DAF3] text-black text-[13px] font-black disabled:opacity-40">Add goal</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 rounded-full border border-white/15 text-[13px] font-bold">Cancel</button>
      </div>
      <p className="text-[12px] text-white/45">Tip: build goals from strengths and the learner’s own aims. See “Writing goals you can actually measure” in Resources.</p>
    </div>
  );
};

interface Props {
  plan: SupportPlan;
  mode: PlanMode;
  me?: { uid: string; name: string };
  /** Teachers the family can add (from the learner's classes). */
  candidates?: TeamMember[];
  canEditTeam?: boolean;
  onChange: (p: SupportPlan) => void;
}

const PlanGoals: React.FC<Props> = ({ plan, mode, me, candidates = [], canEditTeam = false, onChange }) => {
  const family = mode === 'family';
  const set = (p: Partial<SupportPlan>) => onChange({ ...plan, ...p });
  const setGoal = (id: string, g: SupportGoal | null) => set({ goals: g ? plan.goals.map(x => (x.id === id ? g : x)) : plan.goals.filter(x => x.id !== id) });
  const addable = candidates.filter(c => !plan.teamUids.includes(c.uid));
  const actions = supportActions(plan.supports, plan.about);
  const active = plan.goals.filter(g => g.status !== 'met');
  const met = plan.goals.filter(g => g.status === 'met');

  return (
    <div className="grid gap-5">
      <section className={card} aria-labelledby="plantype-h">
        <p className={`${eyebrow} text-[#00DAF3]`}>The plan</p>
        <h2 id="plantype-h" className="text-[20px] font-black mt-1 mb-3" style={{ fontFamily: 'Outfit, system-ui' }}>{PLAN_TYPES.find(p => p.id === plan.planType)?.label}</h2>
        {family ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Plan type">
            {PLAN_TYPES.map(p => (
              <button key={p.id} type="button" role="radio" aria-checked={plan.planType === p.id} onClick={() => set({ planType: p.id })}
                className={`text-left rounded-2xl border p-3.5 ${plan.planType === p.id ? 'border-[#00DAF3] bg-[#00DAF3]/10' : 'border-white/12 hover:border-white/30'}`}>
                <span className="block text-[14px] font-bold">{p.label}</span>
                <span className="block text-[12px] text-white/55 leading-snug mt-0.5">{p.blurb}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-[13px] text-white/60">{PLAN_TYPES.find(p => p.id === plan.planType)?.blurb}</p>}
        {(plan.planType !== 'none' || plan.reviewDate || plan.reevalDate) && (
          <div className="grid sm:grid-cols-2 gap-3 mt-4 max-w-[560px]">
            {([['reviewDate', 'Next plan review'], ['reevalDate', 'Next re-evaluation']] as const).map(([k, l]) => (
              <label key={k} className="block">
                <span className="text-[13px] font-bold text-white/80 inline-flex items-center gap-1.5"><CalendarDays size={14} /> {l}</span>
                <input type="date" value={plan[k] || ''} readOnly={!family} onChange={e => set({ [k]: e.target.value } as Partial<SupportPlan>)} className="mt-1 w-full min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3] [color-scheme:dark]" />
              </label>
            ))}
          </div>
        )}
      </section>

      {actions.length > 0 && (
        <section className={card} aria-labelledby="do-h">
          <p className={`${eyebrow} text-[#06D6A0]`}>In class</p>
          <h2 id="do-h" className="text-[18px] font-black mt-1 mb-3">What the team should do</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {actions.map((t, i) => <li key={i} className="flex gap-2.5 text-[14px] leading-snug rounded-2xl bg-white/[0.03] border border-white/8 px-3.5 py-2.5"><Check size={16} className="text-[#06D6A0] shrink-0 mt-0.5" /> {t}</li>)}
          </ul>
          <p className="text-[12px] text-white/45 mt-3">Built from the supports on this plan. Change them under Supports.</p>
        </section>
      )}

      <section aria-labelledby="goals-h">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <p className={`${eyebrow} text-[#FFB266]`}>Goals</p>
            <h2 id="goals-h" className="text-[20px] font-black" style={{ fontFamily: 'Outfit, system-ui' }}>{active.length ? `${active.length} goal${active.length === 1 ? '' : 's'} in progress` : 'No goals yet'}</h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map(g => <GoalCard key={g.id} g={g} mode={mode} me={me} onChange={n => setGoal(g.id, n)} />)}
        </div>
        {active.length === 0 && !family && <p className="text-[13px] text-white/50">The family hasn't added goals to this plan.</p>}
        {family && <div className="mt-4"><NewGoal onAdd={g => set({ goals: [...plan.goals, g] })} /></div>}
        {met.length > 0 && (
          <details className="mt-5">
            <summary className="text-[13px] font-bold text-[#06D6A0] cursor-pointer">{met.length} goal{met.length === 1 ? '' : 's'} met 🎉</summary>
            <div className="grid gap-4 lg:grid-cols-2 mt-3">{met.map(g => <GoalCard key={g.id} g={g} mode={mode} me={me} onChange={n => setGoal(g.id, n)} />)}</div>
          </details>
        )}
      </section>

      <section className={card} aria-labelledby="team-h">
        <p className={`${eyebrow} text-[#FF6FA8]`}>Team</p>
        <h2 id="team-h" className="text-[18px] font-black mt-1">Who can see this plan</h2>
        <p className="text-[13px] text-white/55 mt-1 mb-3">Only the learner, their guardians and the people listed here. Never classmates, never on profiles or feeds.</p>
        <div className="flex flex-wrap gap-2">
          {plan.team.map(t => (
            <span key={t.uid} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] pl-3 pr-1.5 py-1.5 text-[13px]">
              <Users size={14} className="text-[#FF6FA8]" /> {t.name} <span className="text-white/45">· {t.role.replace('-', ' ')}</span>
              {family && canEditTeam && <button type="button" onClick={() => set({ team: plan.team.filter(x => x.uid !== t.uid) })} className="text-[11px] font-bold rounded-full px-2 py-1 hover:bg-white/10 text-white/60">Remove</button>}
            </span>
          ))}
          {plan.team.length === 0 && <span className="text-[13px] text-white/45">Not shared with anyone yet.</span>}
        </div>
        {family && canEditTeam && (
          <div className="mt-4">
            {addable.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {addable.map(c => <button key={c.uid} type="button" onClick={() => set({ team: [...plan.team, c] })} className="min-h-[40px] px-3.5 rounded-full border border-dashed border-white/25 text-[13px] font-semibold hover:bg-white/5 inline-flex items-center gap-1.5"><UserPlus size={14} /> Share with {c.name}</button>)}
              </div>
            ) : <p className="text-[12.5px] text-white/45">Teachers from {plan.learnerName ? `${plan.learnerName}'s` : 'your'} classes appear here to add.</p>}
          </div>
        )}
        {family && !canEditTeam && <p className="text-[12.5px] text-white/45 mt-3">Your grown-up chooses who is on your team.</p>}
      </section>

      {(mode !== 'view') && (
        <section className={card} aria-labelledby="notes-h">
          <p className={`${eyebrow} text-[#a78bfa]`}>Team notes</p>
          <h2 id="notes-h" className="text-[18px] font-black mt-1 mb-2">Working notes for everyone on the team</h2>
          <textarea value={plan.teamNotes || ''} onChange={e => set({ teamNotes: e.target.value })} rows={4} maxLength={4000} placeholder="What's working this week, what to try next, upcoming changes…"
            className="w-full rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 py-2.5 text-[14px] outline-none focus:border-[#00DAF3] resize-y" />
        </section>
      )}
    </div>
  );
};
export default PlanGoals;
