import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Target, Users, Clock, Check } from 'lucide-react';
import { Sanctuary } from '../../types';
import { SANCTUARY_THEME } from './SanctuaryIdentity';

// Kickstarter/GoFundMe banner for a Sanctuary's active campaign. Members and
// visitors see progress and can contribute; the owner can launch or close one.

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const SanctuaryCampaignBanner: React.FC<{
  sanctuary: Sanctuary;
  isOwner?: boolean;
  onContribute: (amount: number) => Promise<void>;
  onSave: (patch: Partial<Sanctuary>) => Promise<void>;
}> = ({ sanctuary, isOwner, onContribute, onSave }) => {
  const c = sanctuary.campaign;
  const [busy, setBusy] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', goalAmount: 1000, story: '', allOrNothing: false });

  const contribute = async (amount: number) => {
    setBusy(true);
    try { await onContribute(amount); setThanked(true); setTimeout(() => setThanked(false), 3000); }
    finally { setBusy(false); }
  };

  // Owner, no campaign yet → launch CTA / form.
  if (!c?.isActive) {
    if (!isOwner) return null;
    if (!editing) {
      return (
        <button
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}
        >
          <Target size={13} style={{ color: SANCTUARY_THEME.gold }} /> Launch a funding campaign
        </button>
      );
    }
    return (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
        <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: SANCTUARY_THEME.gold }}>New campaign</p>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Campaign title (e.g. Fund the album)"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25" />
        <textarea value={form.story} onChange={e => setForm({ ...form, story: e.target.value })} placeholder="What are you raising for?" rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25 resize-none" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2">
            <span className="text-white/40 text-sm">$</span>
            <input type="number" min={1} value={form.goalAmount} onChange={e => setForm({ ...form, goalAmount: Number(e.target.value) })}
              className="w-full bg-transparent text-sm outline-none" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">goal</span>
          </div>
          <button onClick={() => setForm({ ...form, allOrNothing: !form.allOrNothing })}
            className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${form.allOrNothing ? 'text-white border-white/30 bg-white/10' : 'text-white/40 border-white/10'}`}>
            {form.allOrNothing ? 'All-or-nothing' : 'Keep what you raise'}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
          <button
            disabled={!form.title.trim() || form.goalAmount < 1}
            onClick={async () => {
              await onSave({ campaign: { isActive: true, title: form.title.trim(), story: form.story.trim(), goalAmount: form.goalAmount, raisedAmount: 0, backerCount: 0, allOrNothing: form.allOrNothing } });
              setEditing(false);
            }}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-30"
            style={{ background: SANCTUARY_THEME.gold }}
          >
            Launch campaign
          </button>
        </div>
      </div>
    );
  }

  const pct = Math.min(100, c.goalAmount > 0 ? (c.raisedAmount / c.goalAmount) * 100 : 0);
  const daysLeft = c.deadline ? Math.max(0, Math.ceil((c.deadline - Date.now()) / 86400000)) : null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: SANCTUARY_THEME.heroGradient, border: `1px solid ${SANCTUARY_THEME.line}` }}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: SANCTUARY_THEME.gold }}>
              {c.allOrNothing ? 'All-or-nothing campaign' : 'Funding campaign'}
            </p>
            <h3 className="text-lg font-black tracking-tight text-white">{c.title}</h3>
          </div>
          {daysLeft != null && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/50 shrink-0">
              <Clock size={10} /> {daysLeft}d left
            </span>
          )}
        </div>
        {c.story && <p className="text-[12px] text-white/55 leading-relaxed mb-4">{c.story}</p>}

        {/* Progress */}
        <div className="flex items-end justify-between mb-1.5">
          <span className="text-xl font-black tabular-nums" style={{ color: SANCTUARY_THEME.goldSoft }}>{money(c.raisedAmount)}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">of {money(c.goalAmount)}</span>
        </div>
        <div className="h-2 rounded-full bg-black/50 overflow-hidden mb-2">
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${SANCTUARY_THEME.goldDeep}, ${SANCTUARY_THEME.gold})` }} />
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/40"><Users size={10} /> {c.backerCount} backers</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 tabular-nums">{Math.round(pct)}% funded</span>
        </div>

        {!isOwner && (
          thanked ? (
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen }}>
              <Check size={13} /> Thank you for backing
            </div>
          ) : (
            <div className="flex gap-2">
              {[5, 25, 100].map(a => (
                <button key={a} disabled={busy} onClick={() => contribute(a)}
                  className="flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-black transition-all disabled:opacity-40 hover:brightness-110"
                  style={{ background: SANCTUARY_THEME.gold }}>
                  Back {money(a)}
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default SanctuaryCampaignBanner;
