/**
 * PraxisView — "Start a Business" walkthrough.
 *
 * Plajah Academia's learn-by-building venture school + coach + tool, in one.
 * The curriculum is the act of building your business: each stage teaches AND
 * produces a real artifact, and Plajah assembles your plan (the Blueprint) as
 * you go. The coach is Aria, operating on the Three P's — Provide, Protect,
 * Prosper. She educates and deep-links you to official filing; she never poses
 * as your lawyer, CPA, or financial advisor.
 *
 * First slice: intake (Spark) → the full journey map → an interactive Spark
 * chapter → the living Blueprint. Later stages are previewable and explain
 * exactly what they'll build with you.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Shield, TrendingUp, Rocket, Check, ChevronRight, ExternalLink,
  Lock, FileText, Lightbulb, BookOpen, Sparkles,
} from 'lucide-react';
import AriaMark from '../aria/AriaMark';
import {
  STAGES, THREE_P, ARCHETYPES, FOUNDER_BANDS, SPARK_LESSON, KNOWLEDGE_SOURCES,
  type PKey, type FounderBand, type Stage,
} from '../../data/praxisJourney';
import {
  type Venture, newVenture, loadVenture, saveVenture, updatePlan, completeStage, awardPraxisPoints,
} from '../../services/praxisService';

interface Props { user?: any; profile?: any; onBack?: () => void; }
type Mode = 'intake' | 'journey' | 'chapter' | 'plan';

const askAria = (prompt: string) =>
  window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));

const pColor = (k: PKey) => THREE_P[k].color;

// ── Small UI atoms ───────────────────────────────────────────────────────────
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`text-[9px] font-black uppercase tracking-[0.28em] text-white/40 ${className}`}>{children}</p>
);

const PTag: React.FC<{ k: PKey }> = ({ k }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest"
    style={{ color: pColor(k), background: pColor(k) + '1f', border: `1px solid ${pColor(k)}44` }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: pColor(k) }} />{THREE_P[k].label}
  </span>
);

// ── Main ─────────────────────────────────────────────────────────────────────
const PraxisView: React.FC<Props> = ({ user, profile, onBack }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [mode, setMode] = useState<Mode>('intake');
  const [venture, setVenture] = useState<Venture | null>(null);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  // Resume an existing venture
  useEffect(() => {
    const v = loadVenture(uid);
    if (v) { setVenture(v); setMode('journey'); }
  }, [uid]);

  const persist = (v: Venture) => { setVenture(v); return v; };

  if (mode === 'intake' && !venture) {
    return <Intake uid={uid} onBack={onBack} onCreate={(v) => { persist(saveVenture(v)); setMode('journey'); }} />;
  }
  if (!venture) return null;

  const activeOrder = STAGES.find(s => s.key === venture.currentStage)?.order ?? 1;
  const statusOf = (s: Stage): 'done' | 'active' | 'locked' =>
    venture.completedStages.includes(s.key) ? 'done' : s.key === venture.currentStage ? 'active' : s.order < activeOrder ? 'done' : 'locked';

  // ── Chapter view ──
  if (mode === 'chapter' && activeStage) {
    return (
      <Chapter
        stage={activeStage} venture={venture} uid={uid}
        onBack={() => { setMode('journey'); }}
        onUpdate={(v) => persist(v)}
      />
    );
  }

  // ── Blueprint (living plan) ──
  if (mode === 'plan') {
    return <Blueprint venture={venture} onBack={() => setMode('journey')} />;
  }

  // ── Journey map ──
  const activeStageObj = STAGES.find(s => s.key === venture.currentStage);
  return (
    <div className="min-h-full bg-black/30 text-white">
      {/* header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10">
              <ArrowLeft size={16} className="text-white/60" />
            </button>
          )}
          <AriaMark size={30} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black tracking-tight leading-none">Praxis</h1>
            <Eyebrow className="mt-1">Building · {venture.name}</Eyebrow>
          </div>
          <button onClick={() => setMode('plan')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10">
            <FileText size={12} /> Blueprint
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-7">
        {/* Three-P legend */}
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {(Object.keys(THREE_P) as PKey[]).map(k => (
            <div key={k} className="rounded-2xl p-4 border" style={{ background: pColor(k) + '10', borderColor: pColor(k) + '33' }}>
              <div className="flex items-center gap-2">
                {k === 'provide' ? <Lightbulb size={14} style={{ color: pColor(k) }} /> :
                 k === 'protect' ? <Shield size={14} style={{ color: pColor(k) }} /> :
                 <TrendingUp size={14} style={{ color: pColor(k) }} />}
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: pColor(k) }}>{THREE_P[k].label}</span>
              </div>
              <p className="text-[11px] text-white/50 mt-1.5 leading-snug">{THREE_P[k].blurb}</p>
            </div>
          ))}
        </div>

        {/* Aria coach strip */}
        <div className="rounded-3xl p-5 mb-7 border border-[#8b5cf6]/25 bg-[#8b5cf6]/[0.08] flex flex-col sm:flex-row sm:items-center gap-4">
          <AriaMark size={44} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <Eyebrow className="text-[#a78bfa]/80">Aria · your coach</Eyebrow>
            <p className="text-sm text-white/85 mt-1 leading-snug">
              {!venture.thesis
                ? "Let's start by making your idea sharp. I'll help you say it in one honest sentence."
                : `You're on ${activeStageObj?.title}. ${activeStageObj?.oneLiner} I'm here for every step — and always watching your back.`}
            </p>
          </div>
          <button onClick={() => askAria(
            `You are Aria, my Praxis business coach working on the Three P's — Provide, Protect, Prosper. My venture is "${venture.name}": ${venture.thesis || venture.purpose}. I'm at the ${activeStageObj?.title} stage. Coach me through it in plain language, protect me from mistakes, and tell me the single next action.`
          )} className="shrink-0 px-4 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white bg-gradient-to-br from-[#7c3aed] to-[#8b5cf6] hover:scale-105 transition-all">
            Ask Aria
          </button>
        </div>

        {/* Proactive nudges */}
        <div className="space-y-2 mb-8">
          <Eyebrow className="pl-1">Aria is watching</Eyebrow>
          <Nudge k="protect" text="Before you spend money or hire anyone, we'll set up your EIN and entity — so your personal savings aren't on the line." />
          <Nudge k="prosper" text="When you price, we'll price for margin — not just to undercut the shop down the street." />
        </div>

        {/* Journey */}
        <Eyebrow className="pl-1 mb-3">Your walkthrough · 8 stages</Eyebrow>
        <div className="space-y-2.5">
          {STAGES.map(s => {
            const st = statusOf(s);
            return (
              <button key={s.key}
                onClick={() => { setActiveStage(s); setMode('chapter'); }}
                className={`w-full text-left rounded-2xl border p-4 flex items-center gap-4 transition-all group ${
                  st === 'active' ? 'bg-white/[0.06] border-white/25' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.05]'
                }`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
                  style={{ background: st === 'done' ? '#06d6a022' : pColor(s.lead) + '1f', color: st === 'done' ? '#06d6a0' : pColor(s.lead), border: `1px solid ${st === 'done' ? '#06d6a055' : pColor(s.lead) + '44'}` }}>
                  {st === 'done' ? <Check size={16} /> : st === 'locked' ? <Lock size={13} className="opacity-60" /> : s.order}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black tracking-tight">{s.title}</span>
                    <PTag k={s.lead} />
                    {st === 'active' && <span className="text-[8px] font-black uppercase tracking-widest text-white/50">· You're here</span>}
                  </div>
                  <p className="text-[11px] text-white/45 mt-0.5 truncate">{s.oneLiner}</p>
                </div>
                <ChevronRight size={16} className="text-white/25 group-hover:text-white/50 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Sources */}
        <div className="mt-9">
          <Eyebrow className="pl-1 mb-3">Built on open, public knowledge</Eyebrow>
          <div className="grid sm:grid-cols-2 gap-2">
            {KNOWLEDGE_SOURCES.slice(0, 6).map(src => (
              <a key={src.name} href={src.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 hover:bg-white/[0.06] transition-all">
                <ExternalLink size={12} className="text-white/30 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white/70 truncate">{src.name}</p>
                  <p className="text-[9px] text-white/35 truncate">{src.what}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Nudge row ──
const Nudge: React.FC<{ k: PKey; text: string }> = ({ k, text }) => (
  <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
    <span className="mt-0.5 shrink-0">
      {k === 'protect' ? <Shield size={15} style={{ color: pColor(k) }} /> : <TrendingUp size={15} style={{ color: pColor(k) }} />}
    </span>
    <p className="text-[12.5px] text-white/70 leading-snug flex-1">{text}</p>
    <span className="shrink-0"><PTag k={k} /></span>
  </div>
);

// ── Intake ───────────────────────────────────────────────────────────────────
const Intake: React.FC<{ uid?: string; onBack?: () => void; onCreate: (v: Venture) => void }> = ({ uid, onBack, onCreate }) => {
  const [name, setName] = useState('');
  const [thesis, setThesis] = useState('');
  const [serves, setServes] = useState('');
  const [purpose, setPurpose] = useState('');
  const [archetype, setArchetype] = useState('local_service');
  const [state, setState] = useState('');
  const [band, setBand] = useState<FounderBand>('new');
  const [mode, setMode] = useState<'real' | 'simulate'>('real');

  const canGo = name.trim().length > 1;

  return (
    <div className="min-h-full bg-black/30 text-white">
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10">
              <ArrowLeft size={16} className="text-white/60" />
            </button>
          )}
          <AriaMark size={30} className="shrink-0" />
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">Start a Business</h1>
            <Eyebrow className="mt-1">Praxis · Plajah Academia</Eyebrow>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-7">
        <div className="rounded-3xl p-5 mb-6 border border-[#8b5cf6]/25 bg-[#8b5cf6]/[0.08] flex items-center gap-4">
          <AriaMark size={48} className="shrink-0" />
          <div>
            <Eyebrow className="text-[#a78bfa]/80">Aria</Eyebrow>
            <p className="text-sm text-white/85 mt-1 leading-snug">Tell me your idea in whatever words you've got. I'll build the plan around <span className="font-bold">your</span> purpose, and walk you through the whole thing — Provide, Protect, Prosper.</p>
          </div>
        </div>

        <div className="space-y-5">
          <Field label="What do you want to call it?" hint="You can change this anytime.">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vesper Coffee"
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
          </Field>
          <Field label="What's the idea?" hint="One line is plenty — Aria will help you sharpen it.">
            <input value={thesis} onChange={e => setThesis(e.target.value)} placeholder="e.g. A neighborhood café that doubles as a work spot"
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Who is it for?">
              <input value={serves} onChange={e => setServes(e.target.value)} placeholder="e.g. Remote workers & students"
                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
            </Field>
            <Field label="Where? (US state)" hint="So we get your forms & taxes right.">
              <input value={state} onChange={e => setState(e.target.value)} placeholder="e.g. Michigan"
                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
            </Field>
          </div>
          <Field label="Why does it matter to you?" hint="Your 'why' anchors the whole plan.">
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. I want a third place my neighborhood actually loves"
              className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
          </Field>

          <Field label="What kind of business?">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ARCHETYPES.map(a => (
                <button key={a.id} onClick={() => setArchetype(a.id)}
                  className={`rounded-2xl px-3 py-3 text-left border transition-all ${archetype === a.id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
                  <div className="text-lg leading-none">{a.emoji}</div>
                  <div className="text-[11px] font-bold mt-1.5">{a.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/35 mt-2">{ARCHETYPES.find(a => a.id === archetype)?.note}</p>
          </Field>

          <Field label="How much do you know about business?" hint="This sets how deep every lesson goes — change it anytime.">
            <div className="grid sm:grid-cols-3 gap-2">
              {FOUNDER_BANDS.map(b => (
                <button key={b.id} onClick={() => setBand(b.id)}
                  className={`rounded-2xl px-3 py-3 text-left border transition-all ${band === b.id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
                  <div className="text-[12px] font-black">{b.label}</div>
                  <div className="text-[10px] text-white/40 mt-0.5 leading-snug">{b.sub}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Real or practice?" hint="Practice runs everything in a safe sandbox — great for learning first.">
            <div className="grid grid-cols-2 gap-2">
              {([['real', 'Build for real', 'Real forms, real deep-links, real business page.'], ['simulate', 'Practice run', 'A sandbox venture — fail safely, learn the ropes.']] as const).map(([id, t, d]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`rounded-2xl px-4 py-3 text-left border transition-all ${mode === id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
                  <div className="text-[12px] font-black">{t}</div>
                  <div className="text-[10px] text-white/40 mt-0.5 leading-snug">{d}</div>
                </button>
              ))}
            </div>
          </Field>

          <button disabled={!canGo}
            onClick={() => onCreate(newVenture(uid, { name, thesis, serves, purpose, archetype, band, mode, jurisdiction: { country: 'US', state } }))}
            className="w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white hover:brightness-110">
            Begin the walkthrough →
          </button>
          <p className="text-[10px] text-white/35 text-center leading-snug -mt-1">
            Aria educates you and takes you to official filing sites (IRS, your state) — she never files for you or acts as your lawyer, accountant, or financial advisor.
          </p>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="text-[11px] font-black uppercase tracking-widest text-white/60">{label}</label>
    {hint && <p className="text-[10px] text-white/35 mt-0.5 mb-2">{hint}</p>}
    {!hint && <div className="mb-2" />}
    {children}
  </div>
);

// ── Chapter ──────────────────────────────────────────────────────────────────
const Chapter: React.FC<{ stage: Stage; venture: Venture; uid?: string; onBack: () => void; onUpdate: (v: Venture) => void }> = ({ stage, venture, uid, onBack, onUpdate }) => {
  const isSpark = stage.key === 'spark';
  const done = venture.completedStages.includes(stage.key);

  // Spark working fields
  const [thesis, setThesis] = useState(venture.plan.spark_thesis || venture.thesis);
  const [serves, setServes] = useState(venture.plan.spark_serves || venture.serves);
  const [value, setValue] = useState(venture.plan.bmc_value || '');
  const [customer, setCustomer] = useState(venture.plan.bmc_customer || '');
  const [revenue, setRevenue] = useState(venture.plan.bmc_revenue || '');
  const [saved, setSaved] = useState(false);

  const lesson = SPARK_LESSON[venture.band];

  const finishSpark = async () => {
    let v = updatePlan(venture, {
      spark_thesis: thesis, spark_serves: serves, bmc_value: value, bmc_customer: customer, bmc_revenue: revenue,
    });
    v = { ...v, thesis: thesis || v.thesis, serves: serves || v.serves };
    v = completeStage({ ...v }, 'spark', 'validate');
    saveVenture(v);
    onUpdate(v);
    if (uid) await awardPraxisPoints(uid, 'spark');
    setSaved(true);
  };

  return (
    <div className="min-h-full bg-black/30 text-white">
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10">
            <ArrowLeft size={16} className="text-white/60" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight">{stage.title}</h1>
              <PTag k={stage.lead} />
            </div>
            <Eyebrow className="mt-0.5">Stage {stage.order} of {STAGES.length}</Eyebrow>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-7 space-y-6">
        {/* LEARN */}
        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-3"><BookOpen size={14} className="text-white/50" /><Eyebrow>Learn</Eyebrow></div>
          <p className="text-[15px] text-white/85 leading-relaxed">{isSpark ? lesson.intro : stage.learn}</p>
          {isSpark && <p className="text-[13px] text-white/55 leading-relaxed mt-3">{lesson.why}</p>}
        </section>

        {/* DO */}
        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-1"><Sparkles size={14} className="text-[#FF8C00]" /><Eyebrow>Do · you'll walk away with</Eyebrow></div>
          <p className="text-[13px] text-white/60 mb-4">{stage.produces}</p>

          {isSpark ? (
            <div className="space-y-4">
              <MiniField label="Your one-line thesis">
                <input value={thesis} onChange={e => { setThesis(e.target.value); setSaved(false); }} placeholder="We help ___ do ___ so they can ___."
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
              </MiniField>
              <MiniField label="Who exactly you serve">
                <input value={serves} onChange={e => { setServes(e.target.value); setSaved(false); }} placeholder="Be specific — 'remote workers near downtown', not 'everyone'."
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
              </MiniField>
              <div>
                <Eyebrow className="mb-2">Business Model Canvas · the seed</Eyebrow>
                <div className="grid sm:grid-cols-3 gap-2">
                  <MiniField label="Value you give">
                    <textarea value={value} onChange={e => { setValue(e.target.value); setSaved(false); }} rows={3} placeholder="What problem you solve"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
                  </MiniField>
                  <MiniField label="Who pays">
                    <textarea value={customer} onChange={e => { setCustomer(e.target.value); setSaved(false); }} rows={3} placeholder="Your paying customer"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
                  </MiniField>
                  <MiniField label="How you earn">
                    <textarea value={revenue} onChange={e => { setRevenue(e.target.value); setSaved(false); }} rows={3} placeholder="How money comes in"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
                  </MiniField>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button onClick={() => askAria(`You are Aria, my Praxis coach. Sharpen this venture thesis into one crisp sentence (who I serve, the change I make, why it's different): "${thesis}". Ask me one question if you need to.`)}
                  className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
                  <AriaMark size={16} petals={false} /> Ask Aria to sharpen it
                </button>
                <button onClick={finishSpark} disabled={!thesis.trim()}
                  className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white disabled:opacity-30 hover:brightness-110 flex items-center justify-center gap-2">
                  <Check size={13} /> {done ? 'Update & continue' : 'Complete Spark → Validate'}
                </button>
              </div>
              {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. On to Validate whenever you're ready.</p>}
            </div>
          ) : stage.key === 'form' ? (
            <FormPreview state={venture.jurisdiction.state} />
          ) : (
            <LockedPreview stage={stage} />
          )}
        </section>

        {/* COACH */}
        {!isSpark && (
          <button onClick={() => askAria(`You are Aria, my Praxis business coach on the Three P's. Walk me through the "${stage.title}" stage for my venture "${venture.name}" (${venture.thesis}). Teach it plainly, protect me from common mistakes, and give me the single next action.`)}
            className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-br from-[#7c3aed] to-[#8b5cf6] hover:scale-[1.01] transition-all flex items-center justify-center gap-2">
            <AriaMark size={18} petals={false} /> Coach me through {stage.title}
          </button>
        )}
      </div>
    </div>
  );
};

const MiniField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-black uppercase tracking-widest text-white/45 block mb-1.5">{label}</label>
    {children}
  </div>
);

const FormPreview: React.FC<{ state?: string }> = ({ state }) => {
  const items = [
    { t: 'Choose your entity', d: 'LLC, S-corp, C-corp, or sole prop — Aria explains the trade-offs for your situation.', p: 'protect' as PKey },
    { t: 'Get your EIN (free)', d: 'Your federal tax ID, straight from the IRS — never pay a third party for this.', p: 'protect' as PKey, url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online' },
    { t: `Register in ${state || 'your state'}`, d: 'File with your Secretary of State. We deep-link you to the official site.', p: 'protect' as PKey },
    { t: 'Licenses & permits', d: 'Only the ones your business actually needs — no upsells.', p: 'protect' as PKey, url: 'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits' },
    { t: 'Open a business bank account', d: 'Keep business and personal money separate — this protects you legally and at tax time.', p: 'protect' as PKey },
  ];
  return (
    <div className="space-y-2">
      {items.map(it => (
        <div key={it.t} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3.5 py-3">
          <span className="w-6 h-6 rounded-lg border flex items-center justify-center shrink-0" style={{ borderColor: pColor(it.p) + '55', color: pColor(it.p) }}><Shield size={12} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">{it.t}</p>
            <p className="text-[11px] text-white/45 leading-snug">{it.d}</p>
          </div>
          {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#00daf3] flex items-center gap-1 hover:underline">Official <ExternalLink size={11} /></a>}
        </div>
      ))}
      <p className="text-[10px] text-white/35 pt-1 leading-snug">This chapter unlocks after Validate. Aria prepares every form and hands you off to the official government site to file — she can't and won't file on your behalf.</p>
    </div>
  );
};

const LockedPreview: React.FC<{ stage: Stage }> = ({ stage }) => (
  <div className="rounded-2xl bg-white/[0.02] border border-dashed border-white/10 p-5">
    <div className="flex items-center gap-2 text-white/50 mb-2"><Lock size={13} /><span className="text-[10px] font-black uppercase tracking-widest">Unlocks as you build</span></div>
    <p className="text-[13px] text-white/60 leading-relaxed">{stage.learn}</p>
    <div className="flex flex-wrap gap-1.5 mt-3">
      {stage.tools.map(t => <span key={t} className="text-[9px] font-bold uppercase tracking-widest text-white/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">{t}</span>)}
    </div>
  </div>
);

// ── Blueprint (living plan) ──────────────────────────────────────────────────
const Blueprint: React.FC<{ venture: Venture; onBack: () => void }> = ({ venture, onBack }) => {
  const p = venture.plan;
  const rows: { k: string; v?: string }[] = [
    { k: 'Idea', v: p.spark_thesis || venture.thesis },
    { k: 'Purpose', v: venture.purpose },
    { k: 'Who you serve', v: p.spark_serves || venture.serves },
    { k: 'Value you give', v: p.bmc_value },
    { k: 'Who pays', v: p.bmc_customer },
    { k: 'How you earn', v: p.bmc_revenue },
    { k: 'Where', v: [venture.jurisdiction.city, venture.jurisdiction.state, venture.jurisdiction.country].filter(Boolean).join(', ') },
  ];
  return (
    <div className="min-h-full bg-black/30 text-white">
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10">
            <ArrowLeft size={16} className="text-white/60" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black tracking-tight">Blueprint</h1>
            <Eyebrow className="mt-0.5">{venture.name} · your living plan</Eyebrow>
          </div>
          <FileText size={18} className="text-white/40" />
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-7 space-y-5">
        <p className="text-[13px] text-white/50 leading-relaxed">Plajah assembles this as you go. Every stage adds to it — by the end it's a real business plan you can export and share.</p>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] divide-y divide-white/[0.06] overflow-hidden">
          {rows.map(r => (
            <div key={r.k} className="px-5 py-3.5 flex gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 w-32 shrink-0 pt-0.5">{r.k}</span>
              <span className={`text-[14px] flex-1 ${r.v ? 'text-white/85' : 'text-white/25 italic'}`}>{r.v || 'Not yet — Aria will help you fill this in.'}</span>
            </div>
          ))}
        </div>
        <div>
          <Eyebrow className="pl-1 mb-2">Progress</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map(s => (
              <span key={s.key} className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 border ${venture.completedStages.includes(s.key) ? 'bg-[#06d6a0]/15 border-[#06d6a0]/40 text-[#06d6a0]' : 'bg-white/5 border-white/10 text-white/35'}`}>
                {venture.completedStages.includes(s.key) && '✓ '}{s.title}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-white/35 leading-snug">Export to Word / PDF and a pitch-deck version are coming as you reach the Fund stage.</p>
      </div>
    </div>
  );
};

export default PraxisView;
