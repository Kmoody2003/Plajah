import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Target, Users, Clock, Check, Heart, Zap } from 'lucide-react';
import { Sanctuary, SanctuaryCampaignKind } from '../../types';
import { SANCTUARY_THEME } from './SanctuaryIdentity';

// Immediate-payout crowdfunding banner. NO escrow / all-or-nothing — a pledge settles
// straight to the creator at pledge time (Connect Direct). The goal is aspirational;
// the bar never gates or refunds. Two kinds:
//   • DONATION — personal-cause fundraiser, gifts & tips (GoFundMe-style)
//   • PROJECT  — back-a-project / direct support
// Members & visitors contribute; the owner launches or closes one.

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Per-kind copy so the same banner reads correctly for a fundraiser vs a project.
const KIND_COPY: Record<SanctuaryCampaignKind, {
  eyebrow: string; verb: string; backers: string; icon: typeof Heart;
}> = {
  DONATION: { eyebrow: 'Fundraiser',       verb: 'Donate', backers: 'supporters', icon: Heart },
  PROJECT:  { eyebrow: 'Back this project', verb: 'Back',   backers: 'backers',     icon: Zap },
};

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
  const [form, setForm] = useState<{ title: string; goalAmount: number; story: string; kind: SanctuaryCampaignKind }>(
    { title: '', goalAmount: 1000, story: '', kind: 'PROJECT' }
  );

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
          <Target size={13} style={{ color: SANCTUARY_THEME.gold }} /> Start a fundraiser or project
        </button>
      );
    }
    const kinds: Array<{ k: SanctuaryCampaignKind; label: string; hint: string }> = [
      { k: 'PROJECT',  label: 'Back a project', hint: 'Fund a specific thing' },
      { k: 'DONATION', label: 'Personal cause', hint: 'Gifts & tips' },
    ];
    return (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
        <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: SANCTUARY_THEME.gold }}>New campaign</p>

        {/* Kind chooser — decides fee treatment and reward expectations */}
        <div className="grid grid-cols-2 gap-2">
          {kinds.map(({ k, label, hint }) => {
            const active = form.kind === k;
            const Icon = KIND_COPY[k].icon;
            return (
              <button key={k} onClick={() => setForm({ ...form, kind: k })}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${active ? 'bg-white/10' : 'bg-black/30'}`}
                style={{ borderColor: active ? SANCTUARY_THEME.gold : 'rgba(255,255,255,0.1)' }}>
                <span className="flex items-center gap-1.5 text-[11px] font-black tracking-tight text-white">
                  <Icon size={12} style={{ color: active ? SANCTUARY_THEME.gold : 'rgba(255,255,255,0.5)' }} /> {label}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/35">{hint}</span>
              </button>
            );
          })}
        </div>

        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder={form.kind === 'DONATION' ? 'Fundraiser title (e.g. Help with recovery)' : 'Project title (e.g. Fund the album)'}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25" />
        <textarea value={form.story} onChange={e => setForm({ ...form, story: e.target.value })} placeholder="What are you raising for?" rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25 resize-none" />
        <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-3 py-2">
          <span className="text-white/40 text-sm">$</span>
          <input type="number" min={1} value={form.goalAmount} onChange={e => setForm({ ...form, goalAmount: Number(e.target.value) })}
            className="w-full bg-transparent text-sm outline-none" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30">goal</span>
        </div>

        {/* Honest disclosure: this is immediate-payout, not Kickstarter escrow. */}
        <p className="text-[10px] leading-relaxed text-white/45">
          Money reaches you <span className="text-white/70 font-semibold">immediately</span> as people give — it isn’t held until the goal is met. The goal is just a target shown on the bar.
        </p>

        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
          <button
            disabled={!form.title.trim() || form.goalAmount < 1}
            onClick={async () => {
              await onSave({ campaign: { isActive: true, kind: form.kind, title: form.title.trim(), story: form.story.trim(), goalAmount: form.goalAmount, raisedAmount: 0, backerCount: 0 } });
              setEditing(false);
            }}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-30"
            style={{ background: SANCTUARY_THEME.gold }}
          >
            Launch
          </button>
        </div>
      </div>
    );
  }

  const kind: SanctuaryCampaignKind = c.kind ?? 'PROJECT';
  const copy = KIND_COPY[kind];
  const pct = Math.min(100, c.goalAmount > 0 ? (c.raisedAmount / c.goalAmount) * 100 : 0);
  const daysLeft = c.deadline ? Math.max(0, Math.ceil((c.deadline - Date.now()) / 86400000)) : null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: SANCTUARY_THEME.heroGradient, border: `1px solid ${SANCTUARY_THEME.line}` }}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: SANCTUARY_THEME.gold }}>
              <copy.icon size={10} /> {copy.eyebrow}
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

        {/* Progress — aspirational goal, never enforced */}
        <div className="flex items-end justify-between mb-1.5">
          <span className="text-xl font-black tabular-nums" style={{ color: SANCTUARY_THEME.goldSoft }}>{money(c.raisedAmount)}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">of {money(c.goalAmount)} goal</span>
        </div>
        <div className="h-2 rounded-full bg-black/50 overflow-hidden mb-2">
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${SANCTUARY_THEME.goldDeep}, ${SANCTUARY_THEME.gold})` }} />
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/40"><Users size={10} /> {c.backerCount} {copy.backers}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 tabular-nums">{Math.round(pct)}% of goal</span>
        </div>

        {!isOwner && (
          thanked ? (
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen }}>
              <Check size={13} /> Thank you{kind === 'DONATION' ? ' for giving' : ' for backing'}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {[5, 25, 100].map(a => (
                  <button key={a} disabled={busy} onClick={() => contribute(a)}
                    className="flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-black transition-all disabled:opacity-40 hover:brightness-110"
                    style={{ background: SANCTUARY_THEME.gold }}>
                    {copy.verb} {money(a)}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-center text-white/35 mt-2 leading-relaxed">
                Goes straight to the creator now — not held until a goal is met.
              </p>
            </>
          )
        )}
      </div>
    </div>
  );
};

export default SanctuaryCampaignBanner;
