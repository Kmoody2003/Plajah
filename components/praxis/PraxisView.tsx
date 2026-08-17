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
  Lock, FileText, Lightbulb, BookOpen, Sparkles, Download,
} from 'lucide-react';
import AriaMark from '../aria/AriaMark';
import {
  STAGES, THREE_P, ARCHETYPES, FOUNDER_BANDS, SPARK_LESSON, KNOWLEDGE_SOURCES, ENTITIES, getEntity,
  type PKey, type FounderBand, type Stage,
} from '../../data/praxisJourney';
import {
  type Venture, newVenture, loadVenture, loadVentureFor, saveVenture, updatePlan, completeStage, awardPraxisPoints,
} from '../../services/praxisService';
import { launchBusinessPage } from '../../services/brandActivation';
import { runWatchers, type Nudge as NudgeData } from '../../services/praxisWatchers';
import { exportBusinessPlan } from '../../services/praxisExport';

interface Props { user?: any; profile?: any; onBack?: () => void; onNavigate?: (view: string) => void; }
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
const PraxisView: React.FC<Props> = ({ user, profile, onBack, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [mode, setMode] = useState<Mode>('intake');
  const [venture, setVenture] = useState<Venture | null>(null);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  // Resume an existing venture — instant from the local cache, then reconciled
  // with Firestore (whichever copy is newer wins) so it follows you across devices.
  useEffect(() => {
    let alive = true;
    const local = loadVenture(uid);
    if (local) { setVenture(local); setMode('journey'); }
    loadVentureFor(uid).then(v => {
      if (!alive || !v) return;
      setVenture(cur => (!cur || (v.updatedAt || 0) > (cur.updatedAt || 0)) ? v : cur);
      setMode(m => (m === 'intake' ? 'journey' : m));
    });
    return () => { alive = false; };
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
        onNavigate={onNavigate}
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

        {/* Proactive nudges — the live watcher engine */}
        {(() => {
          const nudges = runWatchers(venture);
          return (
            <div className="space-y-2 mb-8">
              <div className="flex items-center gap-2 pl-1">
                <Eyebrow>Aria is watching</Eyebrow>
                {nudges.length > 0 && <span className="text-[9px] font-black text-white/40 tabular-nums">{nudges.length}</span>}
              </div>
              {nudges.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] text-white/45 flex items-center gap-2">
                  <Check size={13} className="text-[#06d6a0]" /> Nothing needs you right now — she'll flag anything the moment it comes up.
                </div>
              ) : nudges.map(n => <Nudge key={n.id} nudge={n} />)}
            </div>
          );
        })()}

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

// ── Nudge row (live watcher output) ──
const SEV_STYLE: Record<NudgeData['severity'], { ring: string; bg: string; label: string; col: string }> = {
  urgent: { ring: 'rgba(255,84,104,.4)', bg: 'rgba(255,84,104,.08)', label: 'Urgent', col: '#ff5468' },
  warn: { ring: 'rgba(245,166,35,.35)', bg: 'rgba(245,166,35,.07)', label: 'Heads up', col: '#f5a623' },
  info: { ring: 'rgba(255,255,255,.1)', bg: 'rgba(255,255,255,.03)', label: '', col: '#9e99ad' },
};
const Nudge: React.FC<{ nudge: NudgeData }> = ({ nudge: n }) => {
  const sev = SEV_STYLE[n.severity];
  return (
    <div className="rounded-2xl border px-4 py-3.5 flex items-start gap-3" style={{ borderColor: sev.ring, background: sev.bg }}>
      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: pColor(n.p) + '1f', border: `1px solid ${pColor(n.p)}44`, color: pColor(n.p) }}>
        {n.p === 'protect' ? <Shield size={14} /> : n.p === 'prosper' ? <TrendingUp size={14} /> : <Lightbulb size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold">{n.title}</span>
          <PTag k={n.p} />
          {n.severity !== 'info' && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: sev.col + '22', color: sev.col }}>{sev.label}</span>}
        </div>
        <p className="text-[11.5px] text-white/55 leading-snug mt-1">{n.body}</p>
      </div>
      <button onClick={() => askAria(n.actionPrompt)}
        className="shrink-0 self-center px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center gap-1.5 whitespace-nowrap">
        <AriaMark size={14} petals={false} /> {n.actionLabel}
      </button>
    </div>
  );
};

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
const Chapter: React.FC<{ stage: Stage; venture: Venture; uid?: string; onBack: () => void; onUpdate: (v: Venture) => void; onNavigate?: (view: string) => void }> = ({ stage, venture, uid, onBack, onUpdate, onNavigate }) => {
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

  // Shared: write plan sections, apply any venture-field updates, complete the
  // stage, persist, award points, and surface the "saved" confirmation.
  const completeChapter = async (patch: Record<string, string>, fieldUpdates: Partial<Venture>, next: string) => {
    let v = updatePlan(venture, patch);
    if (Object.keys(fieldUpdates).length) v = { ...v, ...fieldUpdates };
    v = completeStage(v, stage.key, next);
    saveVenture(v);
    onUpdate(v);
    if (uid) await awardPraxisPoints(uid, stage.key);
    setSaved(true);
  };

  // Persist the launched Organization id onto the venture without completing the stage.
  const setOrg = (orgId: string) => { const v = saveVenture({ ...venture, orgId }); onUpdate(v); };

  const finishSpark = () => completeChapter(
    { spark_thesis: thesis, spark_serves: serves, bmc_value: value, bmc_customer: customer, bmc_revenue: revenue },
    { thesis: thesis || venture.thesis, serves: serves || venture.serves },
    'validate',
  );

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
          ) : stage.key === 'validate' ? (
            <ValidateDo
              venture={venture} saved={saved} uid={uid}
              onComplete={(patch) => completeChapter(patch, {}, 'form')}
            />
          ) : stage.key === 'form' ? (
            <FormDo
              venture={venture} saved={saved} uid={uid}
              onComplete={(patch) => completeChapter(patch, {}, 'books')}
            />
          ) : stage.key === 'books' ? (
            <BooksDo
              venture={venture} saved={saved} uid={uid}
              onComplete={(patch) => completeChapter(patch, {}, 'operate')}
            />
          ) : stage.key === 'operate' ? (
            <OperateDo
              venture={venture} saved={saved} uid={uid}
              onLaunched={setOrg} onNavigate={onNavigate}
              onComplete={(patch) => completeChapter(patch, {}, 'comply')}
            />
          ) : stage.key === 'comply' ? (
            <ComplyDo
              venture={venture} saved={saved} uid={uid}
              onComplete={(patch) => completeChapter(patch, {}, 'fund')}
            />
          ) : stage.key === 'fund' ? (
            <FundDo
              venture={venture} saved={saved} uid={uid} onNavigate={onNavigate}
              onComplete={(patch) => completeChapter(patch, {}, 'grow')}
            />
          ) : stage.key === 'grow' ? (
            <GrowDo
              venture={venture} saved={saved} uid={uid}
              onComplete={(patch) => completeChapter(patch, {}, 'grow')}
            />
          ) : (
            <LockedPreview stage={stage} />
          )}
        </section>

        {/* COACH */}
        {!isSpark && stage.key !== 'validate' && (
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

// ── Validate chapter (interactive) ───────────────────────────────────────────
const PRICE_BASES: { id: string; label: string; hint: string }[] = [
  { id: 'value', label: 'Value-based', hint: 'Price on the value you create — usually the most you can charge.' },
  { id: 'competitor', label: 'Competitor', hint: 'Anchor to what rivals charge, then justify a difference.' },
  { id: 'cost_plus', label: 'Cost-plus', hint: 'Your cost + a margin. Simple, but leaves money on the table.' },
];

const ValidateDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onComplete }) => {
  const p = venture.plan;
  const [tam, setTam] = useState(p.val_tam || '');
  const [sam, setSam] = useState(p.val_sam || '');
  const [som, setSom] = useState(p.val_som || '');
  const [who, setWho] = useState(p.icp_who || venture.serves);
  const [problem, setProblem] = useState(p.icp_problem || '');
  const [where, setWhere] = useState(p.icp_where || '');
  const [price, setPrice] = useState(p.price || '');
  const [basis, setBasis] = useState(p.price_basis || 'value');

  const canComplete = !!who.trim() && (!!som.trim() || !!sam.trim()) && !!price.trim();
  const funnel = [
    { label: 'Everyone with this problem', sub: 'TAM', v: tam, w: '100%', c: '#b692f6' },
    { label: 'The slice you can serve', sub: 'SAM', v: sam, w: '66%', c: '#d40055' },
    { label: 'What you can win in year one', sub: 'SOM', v: som, w: '38%', c: '#ff8c00' },
  ];

  return (
    <div className="space-y-5">
      {/* Market sizing funnel */}
      <div>
        <Eyebrow className="mb-2">Size the market · top to bottom</Eyebrow>
        <div className="space-y-2">
          {funnel.map((f, i) => (
            <div key={f.sub} className="flex items-center gap-3">
              <div className="h-11 rounded-xl border flex items-center px-3 shrink-0" style={{ width: f.w, minWidth: 140, background: f.c + '18', borderColor: f.c + '44' }}>
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: f.c }}>{f.sub}</span>
                <span className="text-[10px] text-white/45 ml-2 leading-tight">{f.label}</span>
              </div>
              <input
                value={f.v}
                onChange={e => { const val = e.target.value; i === 0 ? setTam(val) : i === 1 ? setSam(val) : setSom(val); }}
                placeholder={i === 0 ? 'e.g. 40,000' : i === 1 ? 'e.g. 8,000' : 'e.g. 400'}
                className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-2 leading-snug">Rough is fine — this is a first estimate, not a promise. Aria can ground these in real Census &amp; BLS data.</p>
      </div>

      {/* ICP */}
      <div>
        <Eyebrow className="mb-2">Your ideal customer</Eyebrow>
        <div className="grid sm:grid-cols-3 gap-2">
          <MiniField label="Who exactly">
            <textarea value={who} onChange={e => setWho(e.target.value)} rows={3} placeholder="Be specific"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
          </MiniField>
          <MiniField label="Their real problem">
            <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={3} placeholder="The pain you remove"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
          </MiniField>
          <MiniField label="Where you'll find them">
            <textarea value={where} onChange={e => setWhere(e.target.value)} rows={3} placeholder="Channels, places, communities"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25 resize-none" />
          </MiniField>
        </div>
      </div>

      {/* Pricing draft */}
      <div>
        <Eyebrow className="mb-2">First price</Eyebrow>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="sm:w-40">
            <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#8b5cf6]/50">
              <span className="text-white/40 text-sm mr-1">$</span>
              <input value={price} onChange={e => setPrice(e.target.value)} placeholder="0"
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/25" inputMode="decimal" />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-2">
            {PRICE_BASES.map(b => (
              <button key={b.id} onClick={() => setBasis(b.id)}
                className={`rounded-xl px-3 py-2 text-left border transition-all ${basis === b.id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
                <div className="text-[11px] font-black">{b.label}</div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-white/35 mt-2 leading-snug">{PRICE_BASES.find(b => b.id === basis)?.hint} Aria will pressure-test your margin here.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(
          `You are Aria, my Praxis coach. Help me validate "${venture.thesis || venture.name}" serving "${who || venture.serves}" in ${venture.jurisdiction.state || 'my area'}. Use public data (U.S. Census County Business Patterns, BLS) to sanity-check my market size (TAM ${tam || '?'}, SAM ${sam || '?'}, SOM ${som || '?'}) and my $${price || '?'} ${basis} price. Point out anything I'm getting wrong.`
        )} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Ask Aria to size it with real data
        </button>
        <button onClick={() => onComplete({ val_tam: tam, val_sam: sam, val_som: som, icp_who: who, icp_problem: problem, icp_where: where, price, price_basis: basis })}
          disabled={!canComplete}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white disabled:opacity-30 hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> Complete Validate → Form
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next up: Form — make it legal.</p>}
    </div>
  );
};

const EIN_URL = 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online';
const REGISTER_URL = 'https://www.sba.gov/business-guide/launch-your-business/register-your-business';
const LICENSE_URL = 'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits';
const NP_1023_URL = 'https://www.irs.gov/charities-non-profits/application-for-recognition-of-exemption';

const FormDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onComplete }) => {
  const state = venture.jurisdiction.state;
  const [entityId, setEntityId] = useState(venture.plan.form_entity || (venture.archetype === 'nonprofit' ? 'nonprofit' : venture.archetype === 'startup' ? 'c_corp' : 'llc'));
  const entity = getEntity(entityId)!;

  // Checklist adapts to the chosen entity
  const items = [
    { key: 'name', t: `Check the name "${venture.name}" is free`, d: `Search ${state || 'your state'}'s business registry so nobody already has it.` },
    { key: 'ein', t: 'Get your EIN — free', d: 'Your federal tax ID, straight from the IRS. Never pay a third party for this.', url: EIN_URL },
    { key: 'register', t: `Register your ${entity.label} in ${state || 'your state'}`, d: 'File with your Secretary of State — the step that makes it official.', url: REGISTER_URL },
    ...(entity.doc ? [{ key: 'doc', t: `Put your ${entity.doc} in place`, d: 'Spells out ownership and rules — and helps hold your liability shield.', url: entityId === 'nonprofit' ? NP_1023_URL : undefined }] : []),
    { key: 'licenses', t: 'Get only the licenses & permits you need', d: `${venture.archetype === 'restaurant' ? 'Food businesses also need health permits & a food-handler card. ' : ''}No upsells — just what your business actually requires.`, url: LICENSE_URL },
    ...(entity.needsAgent ? [{ key: 'agent', t: 'Name a registered agent', d: 'Whoever officially receives legal mail — can be you at a real address.' }] : []),
    { key: 'bank', t: 'Open a business bank account', d: 'Keep business and personal money apart — protects your shield and makes taxes sane.' },
  ] as { key: string; t: string; d: string; url?: string }[];

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    items.forEach(it => { if (venture.plan[`form_ck_${it.key}`] === '1') seed[it.key] = true; });
    return seed;
  });
  const toggle = (k: string) => setChecks(c => ({ ...c, [k]: !c[k] }));
  const doneCount = items.filter(it => checks[it.key]).length;

  const complete = () => {
    const patch: Record<string, string> = { form_entity: entityId };
    items.forEach(it => { patch[`form_ck_${it.key}`] = checks[it.key] ? '1' : ''; });
    onComplete(patch);
  };

  return (
    <div className="space-y-5">
      {/* Entity picker */}
      <div>
        <Eyebrow className="mb-2">Choose your legal structure</Eyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ENTITIES.map(e => (
            <button key={e.id} onClick={() => setEntityId(e.id)}
              className={`rounded-2xl px-3 py-3 text-left border transition-all ${entityId === e.id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
              <div className="text-[12px] font-black">{e.label}</div>
              <div className="text-[10px] text-white/40 mt-0.5 leading-snug">{e.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Entity detail */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2.5">
        <div className="flex items-center gap-2"><span className="text-sm font-black">{entity.label}</span><PTag k="protect" /></div>
        {([['Liability', entity.liability], ['Taxes', entity.taxes], ['Best for', entity.bestFor]] as const).map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 w-16 shrink-0 pt-0.5">{k}</span>
            <span className="text-[12.5px] text-white/75 leading-snug flex-1">{v}</span>
          </div>
        ))}
        <button onClick={() => askAria(`You are Aria, my Praxis coach. I'm leaning toward a ${entity.label} for my ${venture.archetype} "${venture.name}" in ${state || 'my state'}. Explain in plain terms whether that's right for me, what it protects me from, and the one thing people get wrong. Compare it to an LLC if that's better for my case.`)}
          className="mt-1 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Ask Aria if this is right for me
        </button>
      </div>

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Your formation checklist</Eyebrow>
          <span className="text-[10px] font-black text-white/40 tabular-nums">{doneCount}/{items.length} done</span>
        </div>
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.key} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all ${checks[it.key] ? 'bg-[#06d6a0]/[0.06] border-[#06d6a0]/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <button onClick={() => toggle(it.key)} aria-pressed={!!checks[it.key]}
                className="w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all"
                style={checks[it.key] ? { background: '#06d6a0', borderColor: '#06d6a0' } : { borderColor: 'rgba(255,255,255,0.25)' }}>
                {checks[it.key] && <Check size={13} className="text-black" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-bold ${checks[it.key] ? 'text-white/60 line-through' : ''}`}>{it.t}</p>
                <p className="text-[11px] text-white/45 leading-snug">{it.d}</p>
              </div>
              {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#00daf3] flex items-center gap-1 hover:underline">Official <ExternalLink size={11} /></a>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(`You are Aria, my Praxis coach on the Three P's. Walk me through forming my ${entity.label} in ${state || 'my state'} step by step — name check, EIN, state registration, ${entity.doc || 'documents'}, licenses, and a bank account. Deep-link me to the official sites and flag every deadline. You prepare; I file.`)}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Coach me through filing
        </button>
        <button onClick={complete}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> {doneCount === items.length ? 'Complete Form → Books' : 'Save & continue → Books'}
        </button>
      </div>
      <p className="text-[10px] text-white/35 leading-snug text-center">
        This is education, not legal or tax advice. Aria prepares everything and takes you to the official government site — she never files for you, and confirm anything binding with a professional.
      </p>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next: Books — understand your money.</p>}
    </div>
  );
};

// ── Books chapter (interactive) ──────────────────────────────────────────────
const bkNum = (s: string) => parseFloat((s || '').replace(/[^0-9.-]/g, '')) || 0;
const bkMoney = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const COA_GROUPS: { group: string; color: string; accounts: string[] }[] = [
  { group: 'Income', color: '#06d6a0', accounts: ['Sales revenue', 'Service revenue', 'Other income'] },
  { group: 'Cost of goods', color: '#ff8c00', accounts: ['Materials / inventory', 'Merchant fees', 'Shipping'] },
  { group: 'Expenses', color: '#00daf3', accounts: ['Payroll', 'Rent / space', 'Marketing', 'Software', 'Utilities', 'Insurance'] },
  { group: 'Assets & liabilities', color: '#b692f6', accounts: ['Business bank', 'Equipment', 'Loans / credit'] },
];

const PLRow: React.FC<{ label: string; hint?: string; value: string; onChange: (v: string) => void; accent?: string }> = ({ label, hint, value, onChange, accent }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.05]">
    <div className="min-w-0">
      <div className="text-[12.5px] font-bold" style={accent ? { color: accent } : undefined}>{label}</div>
      {hint && <div className="text-[10px] text-white/35 leading-tight">{hint}</div>}
    </div>
    <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-1.5 focus-within:border-[#8b5cf6]/50 shrink-0" style={{ width: 118 }}>
      <span className="text-white/40 text-[13px] mr-1">$</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="0" inputMode="decimal"
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-white/25 tabular-nums" />
    </div>
  </div>
);

const BooksDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onComplete }) => {
  const p = venture.plan;
  const [method, setMethod] = useState(p.books_method || 'cash');
  const [revenue, setRevenue] = useState(p.books_revenue || '');
  const [cogs, setCogs] = useState(p.books_cogs || '');
  const [payroll, setPayroll] = useState(p.books_payroll || '');
  const [rent, setRent] = useState(p.books_rent || '');
  const [marketing, setMarketing] = useState(p.books_marketing || '');
  const [other, setOther] = useState(p.books_other || '');
  const [accounts, setAccounts] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    (p.books_accounts || 'Sales revenue,Payroll,Rent / space,Marketing,Business bank').split(',').forEach(a => { if (a) seed[a] = true; });
    return seed;
  });
  const toggle = (a: string) => setAccounts(s => ({ ...s, [a]: !s[a] }));

  const rev = bkNum(revenue), cg = bkNum(cogs);
  const opex = bkNum(payroll) + bkNum(rent) + bkNum(marketing) + bkNum(other);
  const gross = rev - cg;
  const net = gross - opex;
  const gm = rev ? Math.round((gross / rev) * 100) : 0;
  const nm = rev ? Math.round((net / rev) * 100) : 0;
  const canComplete = rev > 0;

  const complete = () => {
    const chosen = Object.keys(accounts).filter(a => accounts[a]);
    onComplete({
      books_method: method, books_revenue: revenue, books_cogs: cogs,
      books_payroll: payroll, books_rent: rent, books_marketing: marketing, books_other: other,
      books_accounts: chosen.join(','),
      books_net: rev ? String(net) : '', books_margin: rev ? String(nm) : '',
    });
  };

  return (
    <div className="space-y-5">
      {/* Accounting method */}
      <div>
        <Eyebrow className="mb-2">How you'll count money</Eyebrow>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'cash', label: 'Cash basis', hint: 'Count it when money actually moves. Simplest — where most small businesses start.' },
            { id: 'accrual', label: 'Accrual basis', hint: 'Count it when earned or owed, before cash moves. Required as you scale.' },
          ].map(m => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              className={`rounded-2xl px-3 py-3 text-left border transition-all ${method === m.id ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
              <div className="text-[12px] font-black">{m.label}</div>
              <div className="text-[10px] text-white/45 mt-0.5 leading-snug">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chart of accounts */}
      <div>
        <Eyebrow className="mb-2">Your starting chart of accounts</Eyebrow>
        <p className="text-[11px] text-white/45 mb-2.5 leading-snug">Every dollar lands in a bucket. Pick the ones you'll actually use — this is the backbone every report is built from.</p>
        <div className="space-y-2.5">
          {COA_GROUPS.map(g => (
            <div key={g.group}>
              <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: g.color }}>{g.group}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.accounts.map(a => (
                  <button key={a} onClick={() => toggle(a)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${accounts[a] ? 'text-black' : 'text-white/55 bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'}`}
                    style={accounts[a] ? { background: g.color, borderColor: g.color } : undefined}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* First P&L */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Your first P&amp;L · one month</Eyebrow>
          <PTag k="provide" />
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          <PLRow label="Revenue" hint="Everything you sold" value={revenue} onChange={setRevenue} accent="#06d6a0" />
          <PLRow label="− Cost of goods" hint="What each sale cost you to deliver" value={cogs} onChange={setCogs} />
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-t border-white/[0.06]">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/60">Gross profit <span className="text-white/30 normal-case font-bold tracking-normal">· {gm}% margin</span></span>
            <span className="text-sm font-black tabular-nums" style={{ color: gross >= 0 ? '#06d6a0' : '#ff5468' }}>${bkMoney(gross)}</span>
          </div>
          <PLRow label="− Payroll" hint="You + any team" value={payroll} onChange={setPayroll} />
          <PLRow label="− Rent / space" value={rent} onChange={setRent} />
          <PLRow label="− Marketing" value={marketing} onChange={setMarketing} />
          <PLRow label="− Other expenses" value={other} onChange={setOther} />
          <div className="flex items-center justify-between px-4 py-3 border-t-2" style={{ borderColor: net >= 0 ? 'rgba(6,214,160,.4)' : 'rgba(255,84,104,.4)', background: net >= 0 ? 'rgba(6,214,160,.08)' : 'rgba(255,84,104,.08)' }}>
            <span className="text-[12px] font-black uppercase tracking-widest">Net profit <span className="text-white/40 normal-case font-bold tracking-normal">· {nm}% margin</span></span>
            <span className="text-lg font-black tabular-nums" style={{ color: net >= 0 ? '#06d6a0' : '#ff5468' }}>${bkMoney(net)}</span>
          </div>
        </div>
        <p className="text-[10px] text-white/35 mt-2 leading-snug">
          {net >= 0
            ? 'Positive net means the business feeds itself. Margin is what’s left of each dollar after costs — grow it before you grow revenue.'
            : 'Negative net is normal early — you’re spending ahead of sales. Watch how many months of runway that leaves you.'}
          {' '}Later, connect your Plajah storefront and this fills from real POS &amp; orders.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(
          `You are Aria, my Praxis coach on the Three P's. Read my first monthly P&L for "${venture.name}" — revenue $${revenue || '0'}, COGS $${cogs || '0'}, payroll $${payroll || '0'}, rent $${rent || '0'}, marketing $${marketing || '0'}, other $${other || '0'} (net $${bkMoney(net)}, ${nm}% margin, ${method} basis). Explain in plain terms what it's telling me, where my margin is weak versus a typical ${venture.archetype}, and the one number to fix first. Teach me — don't just report.`
        )} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Ask Aria to read my P&amp;L
        </button>
        <button onClick={complete} disabled={!canComplete}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white disabled:opacity-30 hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> Complete Books → Operate
        </button>
      </div>
      <p className="text-[10px] text-white/35 leading-snug text-center">Cash vs accrual and the tax treatment of specific items vary — confirm anything binding with a bookkeeper or CPA.</p>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next: Operate — build &amp; run it.</p>}
    </div>
  );
};

// ── Operate chapter (interactive — launches a REAL Plajah business page) ──────
const templateForArchetype = (a: string) => (a === 'restaurant' ? 'restaurant' : 'custom');

const OperateDo: React.FC<{
  venture: Venture; saved: boolean; uid?: string;
  onLaunched: (orgId: string) => void;
  onComplete: (patch: Record<string, string>) => void;
  onNavigate?: (view: string) => void;
}> = ({ venture, saved, uid, onLaunched, onComplete, onNavigate }) => {
  const p = venture.plan;
  const [name, setName] = useState(venture.name);
  const [about, setAbout] = useState(p.operate_about || venture.thesis || '');
  const [store, setStore] = useState(p.operate_store !== '0');
  const [club, setClub] = useState(p.operate_club === '1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const templateId = templateForArchetype(venture.archetype);
  const launched = !!venture.orgId;
  const canLaunch = venture.mode === 'real' && !!uid && !launched;

  const launch = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await launchBusinessPage(templateId, {
        name: name.trim() || venture.name, about: about.trim(), createClub: club, enableStore: store,
      });
      if (r.error || !r.organization) { setErr(r.error || 'Could not create your business page — try again.'); setBusy(false); return; }
      onLaunched(r.organization.id);
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong launching your page.');
    }
    setBusy(false);
  };

  const complete = () => onComplete({
    operate_about: about, operate_store: store ? '1' : '0', operate_club: club ? '1' : '0', operate_template: templateId,
  });

  const wires = [
    { t: 'A public business page', d: 'your storefront, hours, and brand on the Business directory' },
    { t: 'Products & services', d: 'list what you sell — it powers your store, POS, and kiosk' },
    { t: 'Team & roles', d: 'invite people with the right permissions for your kind of business' },
  ];

  return (
    <div className="space-y-5">
      {launched ? (
        <div className="rounded-2xl border p-5 text-center space-y-3" style={{ borderColor: 'rgba(6,214,160,.35)', background: 'rgba(6,214,160,.07)' }}>
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(6,214,160,.16)' }}><Rocket size={22} className="text-[#06d6a0]" /></div>
          <div>
            <div className="text-lg font-black">{venture.name} is live</div>
            <div className="text-[12px] text-white/50 mt-0.5 leading-snug">Your real Plajah business page is created. Now fill it in — products, team, and settings all live in your dashboard.</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button onClick={() => onNavigate?.('BUSINESS_DASHBOARD')} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-black hover:brightness-90 flex items-center justify-center gap-2">Open your dashboard <ChevronRight size={13} /></button>
            <button onClick={() => askAria(`You are Aria, my Praxis coach. My ${venture.archetype} "${venture.name}" just launched its Plajah page. Give me a concrete opening-week operations playbook — first products to list, roles to fill, and a simple daily routine to run it.`)} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2"><AriaMark size={16} petals={false} /> Ops playbook</button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2"><Rocket size={15} className="text-[#ff8c00]" /><span className="text-[13px] font-black">Turn the plan into a real page</span></div>
            <p className="text-[12px] text-white/55 leading-snug">This creates your actual Plajah business page — the same one on the Business directory — wired into everything Plajah already runs:</p>
            <div className="space-y-1.5">
              {wires.map(w => (
                <div key={w.t} className="flex gap-2.5"><ChevronRight size={13} className="text-[#8b5cf6] mt-0.5 shrink-0" /><div><span className="text-[12.5px] font-bold">{w.t}</span><span className="text-[11px] text-white/40"> — {w.d}</span></div></div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <MiniField label="Business name">
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50" />
            </MiniField>
            <MiniField label="One-line about">
              <input value={about} onChange={e => setAbout(e.target.value)} placeholder="What you do, for whom" className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
            </MiniField>
            <div className="grid grid-cols-2 gap-2">
              {([['store', 'Storefront', 'Sell products & services', store, setStore], ['club', 'Community club', 'A space for your customers', club, setClub]] as const).map(([id, t, d, val, set]) => (
                <button key={id} onClick={() => set(v => !v)} className={`rounded-2xl px-3 py-3 text-left border transition-all ${val ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'}`}>
                  <div className="flex items-center justify-between"><span className="text-[12px] font-black">{t}</span><span className="w-4 h-4 rounded-md border flex items-center justify-center" style={val ? { background: '#8b5cf6', borderColor: '#8b5cf6' } : { borderColor: 'rgba(255,255,255,.25)' }}>{val && <Check size={11} className="text-white" />}</span></div>
                  <div className="text-[10px] text-white/45 mt-0.5">{d}</div>
                </button>
              ))}
            </div>
          </div>

          {err && <p className="text-[11px] text-[#ff5468] text-center">{err}</p>}

          {canLaunch ? (
            <button onClick={launch} disabled={busy} className="w-full py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2">
              {busy ? 'Creating your page…' : <><Rocket size={14} /> Launch my business page</>}
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-[11px] text-white/50 leading-snug">{venture.mode === 'simulate' ? 'Practice mode — in a real venture this button creates your live Plajah page. You can still walk through every step here.' : 'Sign in to launch your real business page. You can keep learning the steps meanwhile.'}</p>
            </div>
          )}
        </>
      )}

      <div className="pt-1">
        <button onClick={complete} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] flex items-center justify-center gap-2">
          <Check size={13} /> {launched ? 'Complete Operate → Comply' : 'Continue → Comply'}
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next: Comply — stay protected.</p>}
    </div>
  );
};

// ── Comply chapter (interactive — the Protect compliance calendar) ────────────
const COMPLY_URLS = {
  taxes: 'https://www.sba.gov/business-guide/manage-your-business/pay-business-taxes',
  estimated: 'https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes',
  f941: 'https://www.irs.gov/forms-pubs/about-form-941',
  f1099: 'https://www.irs.gov/forms-pubs/about-form-1099-nec',
  boi: 'https://www.fincen.gov/boi',
  f990: 'https://www.irs.gov/forms-pubs/about-form-990',
};
const passThrough = (e?: string) => ['sole_prop', 'llc', 'partnership', 's_corp'].includes(e || '');
const entityIsRegistered = (e?: string) => ['llc', 's_corp', 'c_corp', 'nonprofit'].includes(e || '');
const sellsGoods = (a: string) => ['retail', 'restaurant', 'ecommerce'].includes(a);

interface Obligation { key: string; title: string; cadence: string; url?: string; on: (v: Venture) => boolean; }
const OBLIGATIONS: Obligation[] = [
  { key: 'income', title: 'Federal income tax return', cadence: 'Annual · around Apr 15', url: COMPLY_URLS.taxes, on: () => true },
  { key: 'estimated', title: 'Quarterly estimated taxes', cadence: 'Quarterly · Apr / Jun / Sep / Jan', url: COMPLY_URLS.estimated, on: v => passThrough(v.plan.form_entity) },
  { key: 'sales', title: 'Sales tax filing', cadence: 'Monthly or quarterly (your state)', url: COMPLY_URLS.taxes, on: v => sellsGoods(v.archetype) },
  { key: 'payroll', title: 'Payroll taxes — Form 941', cadence: 'Quarterly, plus deposits', url: COMPLY_URLS.f941, on: () => false },
  { key: 'w2', title: 'W-2s to your team', cadence: 'Annual · Jan 31', on: () => false },
  { key: 'f1099', title: '1099-NEC to contractors', cadence: 'Annual · Jan 31', url: COMPLY_URLS.f1099, on: () => false },
  { key: 'boi', title: 'Beneficial Ownership (BOI) report', cadence: 'Once, soon after forming', url: COMPLY_URLS.boi, on: v => entityIsRegistered(v.plan.form_entity) && v.plan.form_entity !== 'nonprofit' },
  { key: 'annual_report', title: 'State annual report / franchise', cadence: 'Annual (your state)', on: v => entityIsRegistered(v.plan.form_entity) },
  { key: 'license', title: 'Renew licenses & permits', cadence: 'Annual', on: () => true },
  { key: 'insurance', title: 'Review business insurance', cadence: 'Annual', on: v => ['restaurant', 'retail', 'local_service'].includes(v.archetype) },
  { key: 'f990', title: 'Form 990 (nonprofit)', cadence: 'Annual', url: COMPLY_URLS.f990, on: v => v.plan.form_entity === 'nonprofit' },
];

const ComplyDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onComplete }) => {
  const p = venture.plan;
  const [items, setItems] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    const savedKeys = (p.comply_items || '').split(',').filter(Boolean);
    OBLIGATIONS.forEach(o => { seed[o.key] = savedKeys.length ? savedKeys.includes(o.key) : o.on(venture); });
    return seed;
  });
  const [reminders, setReminders] = useState(p.comply_reminders !== '0');
  const toggle = (k: string) => setItems(s => ({ ...s, [k]: !s[k] }));
  const active = OBLIGATIONS.filter(o => items[o.key]);

  const complete = () => onComplete({ comply_items: active.map(o => o.key).join(','), comply_reminders: reminders ? '1' : '0' });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: 'rgba(0,218,243,.25)', background: 'rgba(0,218,243,.06)' }}>
        <Shield size={18} className="text-[#00daf3] mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/60 leading-snug">The Protect layer. Every business has a rhythm of filings and renewals — miss one and it costs penalties or your good standing. Here's your calendar, built from your structure and what you sell.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Your compliance calendar</Eyebrow>
          <span className="text-[10px] font-black text-white/40 tabular-nums">{active.length} tracked</span>
        </div>
        <div className="space-y-2">
          {OBLIGATIONS.map(o => (
            <div key={o.key} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all ${items[o.key] ? 'bg-[#00daf3]/[0.05] border-[#00daf3]/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <button onClick={() => toggle(o.key)} aria-pressed={!!items[o.key]} className="w-6 h-6 rounded-lg border flex items-center justify-center shrink-0"
                style={items[o.key] ? { background: '#00daf3', borderColor: '#00daf3' } : { borderColor: 'rgba(255,255,255,.25)' }}>
                {items[o.key] && <Check size={13} className="text-black" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{o.title}</p>
                <p className="text-[11px] text-white/45">{o.cadence}</p>
              </div>
              {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#00daf3] flex items-center gap-1 hover:underline">Official <ExternalLink size={11} /></a>}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-2 leading-snug">Exact dates and thresholds vary by state and revenue — confirm with your state's site or a CPA, and uncheck anything that doesn't apply to you.</p>
      </div>

      <button onClick={() => setReminders(r => !r)} className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${reminders ? 'bg-[#8b5cf6]/[0.1] border-[#8b5cf6]/30' : 'bg-white/[0.03] border-white/[0.07]'}`}>
        <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={reminders ? { background: '#8b5cf6', borderColor: '#8b5cf6' } : { borderColor: 'rgba(255,255,255,.25)' }}>{reminders && <Check size={12} className="text-white" />}</span>
        <div><div className="text-[12.5px] font-bold flex items-center gap-2"><AriaMark size={16} petals={false} /> Let Aria watch these deadlines</div><div className="text-[11px] text-white/45">She'll flag anything coming due so it never sneaks up on you.</div></div>
      </button>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(`You are Aria, my Praxis coach on the Three P's (Protect). Build my compliance calendar for a ${getEntity(venture.plan.form_entity)?.label || 'small business'} ${venture.archetype} in ${venture.jurisdiction.state || 'my state'}: which tax filings, reports, and renewals I owe, exactly when they're due, and the official link for each. Flag the ones people miss most.`)}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Build my calendar with Aria
        </button>
        <button onClick={complete} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> Complete Comply → Fund
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next: Fund — fuel the growth.</p>}
    </div>
  );
};

// ── Fund chapter (interactive — the capital ladder + dilution) ────────────────
interface Rung { key: string; title: string; desc: string; equity?: boolean; internal?: string; url?: string; fits: (v: Venture) => boolean; }
const fitsLocal = (a: string) => ['local_service', 'retail', 'restaurant', 'ecommerce'].includes(a);
const RUNGS: Rung[] = [
  { key: 'bootstrap', title: 'Bootstrap', desc: 'Fund it from savings and revenue — you keep 100% ownership and control.', fits: () => true },
  { key: 'credit', title: 'Business credit', desc: 'Build EIN-based credit (Net-30 vendors, a business card) — separate from your personal score, and the key to bigger financing later.', fits: () => true },
  { key: 'grants', title: 'Grants', desc: "Money you don't repay — competitive. Try grants.gov and local/industry programs.", url: 'https://www.grants.gov/', fits: v => ['nonprofit', 'local_service', 'retail', 'restaurant'].includes(v.archetype) },
  { key: 'loan', title: 'Microloan / SBA', desc: 'Small loans built for small businesses (SBA, CDFIs, credit unions).', url: 'https://www.sba.gov/funding-programs/loans', fits: v => fitsLocal(v.archetype) },
  { key: 'crowd', title: 'Crowdfunding', desc: 'Raise from your audience and customers. On Plajah: Sanctuary & SeedRaiser.', internal: 'SANCTUARY_HUB', fits: () => true },
  { key: 'angel', title: 'Angel investors', desc: 'Early individuals buy equity, usually via a SAFE. Money plus mentorship.', equity: true, fits: v => ['startup', 'creator'].includes(v.archetype) },
  { key: 'vc', title: 'Venture capital', desc: 'Funds buy equity to fuel fast growth — the raise-and-scale track.', equity: true, fits: v => v.archetype === 'startup' },
];

const FundDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onNavigate?: (view: string) => void; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onNavigate, onComplete }) => {
  const p = venture.plan;
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    const savedKeys = (p.fund_rungs || '').split(',').filter(Boolean);
    RUNGS.forEach(r => { seed[r.key] = savedKeys.length ? savedKeys.includes(r.key) : r.fits(venture); });
    return seed;
  });
  const [amount, setAmount] = useState(p.fund_amount || '');
  const [use, setUse] = useState(p.fund_use || '');
  const [premoney, setPremoney] = useState(p.fund_premoney || '');
  const toggle = (k: string) => setPicked(s => ({ ...s, [k]: !s[k] }));

  const equitySelected = RUNGS.some(r => r.equity && picked[r.key]);
  const raise = bkNum(amount), pre = bkNum(premoney);
  const post = pre + raise;
  const invPct = post > 0 ? (raise / post) * 100 : 0;
  const founderPct = 100 - invPct;

  const complete = () => onComplete({
    fund_rungs: RUNGS.filter(r => picked[r.key]).map(r => r.key).join(','),
    fund_amount: amount, fund_use: use, fund_premoney: premoney,
  });

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-white/55 leading-snug">How you'll fuel it — the capital ladder. Cheapest and most in-your-control at the top; more money and more strings as you go down. Pick what fits where you are.</p>

      {/* Ladder */}
      <div className="space-y-2">
        {RUNGS.map(r => {
          const fits = r.fits(venture);
          return (
            <div key={r.key} className={`rounded-xl border px-3.5 py-3 transition-all ${picked[r.key] ? 'bg-[#ff8c00]/[0.06] border-[#ff8c00]/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(r.key)} aria-pressed={!!picked[r.key]} className="w-6 h-6 rounded-lg border flex items-center justify-center shrink-0"
                  style={picked[r.key] ? { background: '#ff8c00', borderColor: '#ff8c00' } : { borderColor: 'rgba(255,255,255,.25)' }}>
                  {picked[r.key] && <Check size={13} className="text-black" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold">{r.title}</span>
                    {r.equity && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/10 text-white/50">gives up equity</span>}
                    {fits && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(6,214,160,.15)', color: '#06d6a0' }}>fits you</span>}
                  </div>
                  <p className="text-[11px] text-white/45 leading-snug mt-0.5">{r.desc}</p>
                </div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#00daf3] flex items-center gap-1 hover:underline">Official <ExternalLink size={11} /></a>}
                {r.internal && <button onClick={() => onNavigate?.(r.internal!)} className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#8b5cf6] flex items-center gap-1 hover:underline">Open <ChevronRight size={11} /></button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Raise plan */}
      <div className="grid sm:grid-cols-2 gap-3">
        <MiniField label="How much do you need?">
          <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#8b5cf6]/50">
            <span className="text-white/40 text-sm mr-1">$</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="25,000" inputMode="decimal" className="w-full bg-transparent text-sm outline-none placeholder:text-white/25 tabular-nums" />
          </div>
        </MiniField>
        <MiniField label="What it's for">
          <input value={use} onChange={e => setUse(e.target.value)} placeholder="Inventory, hiring, equipment…" className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#8b5cf6]/50 placeholder:text-white/25" />
        </MiniField>
      </div>

      {/* Dilution calculator (equity paths) */}
      {equitySelected && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2"><TrendingUp size={15} className="text-[#ff8c00]" /><span className="text-[13px] font-black">What raising costs you — dilution</span></div>
          <MiniField label="Your company's value before the raise (pre-money)">
            <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#8b5cf6]/50">
              <span className="text-white/40 text-sm mr-1">$</span>
              <input value={premoney} onChange={e => setPremoney(e.target.value)} placeholder="250,000" inputMode="decimal" className="w-full bg-transparent text-sm outline-none placeholder:text-white/25 tabular-nums" />
            </div>
          </MiniField>
          {raise > 0 && pre > 0 ? (
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Investor gets</div>
                <div className="text-xl font-black tabular-nums text-[#ff8c00]">{invPct.toFixed(1)}%</div>
              </div>
              <div className="flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40">You keep</div>
                <div className="text-xl font-black tabular-nums text-[#06d6a0]">{founderPct.toFixed(1)}%</div>
              </div>
              <div className="flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Post-money</div>
                <div className="text-xl font-black tabular-nums">${bkMoney(post)}</div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-white/40">Enter a raise amount above and a pre-money value to see how much of the company you'd give up.</p>
          )}
          <p className="text-[10px] text-white/35 leading-snug">Dilution is the trade: cash now for a smaller slice. Raising ${bkMoney(raise)} at ${bkMoney(pre)} pre-money hands over {invPct.toFixed(1)}% of everything you build next. Raise what you need, not the most you can.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(`You are Aria, my Praxis coach on the Three P's (Prosper). Map a realistic funding path for my ${venture.archetype} "${venture.name}" that needs $${amount || '?'} for ${use || 'growth'}. Which rungs fit — bootstrapping, business credit, grants, SBA loans, crowdfunding, angels, VC — in what order, and what I need ready for each. If I'm giving up equity, sanity-check my dilution.`)}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Map my funding path
        </button>
        <button onClick={complete} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> Complete Fund → Grow
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> Saved to your Blueprint{uid ? ' · +15 points' : ''}. Next: Grow — scale &amp; build wealth.</p>}
    </div>
  );
};

// ── Grow chapter (interactive — unit economics + wealth / financial literacy) ──
const MONEY_MOVES = [
  { key: 'reinvest', t: 'Reinvest profit first', d: 'Early on, money put back in compounds faster than money taken out.' },
  { key: 'bizcredit', t: 'Build business credit', d: 'Net-30 vendors + a card on your EIN — unlocks bigger, cheaper financing later.' },
  { key: 'safety', t: 'Personal safety net', d: '3–6 months of personal expenses saved, so the business never forces a bad call.' },
  { key: 'retirement', t: 'Founder retirement account', d: 'A SEP-IRA or Solo 401(k) — large tax-advantaged saving for the self-employed.' },
  { key: 'invest', t: 'Invest the surplus', d: 'Cash beyond your reserve can work — low-cost index funds are the boring, proven path.' },
  { key: 'crypto', t: 'Understand crypto & blockchain', d: "Learn what it is, the real risks, custody, and stablecoins first — never put in what you can't lose." },
];

const GrowDo: React.FC<{ venture: Venture; saved: boolean; uid?: string; onComplete: (patch: Record<string, string>) => void }> = ({ venture, saved, uid, onComplete }) => {
  const p = venture.plan;
  const [cac, setCac] = useState(p.grow_cac || '');
  const [ltv, setLtv] = useState(p.grow_ltv || '');
  const [moves, setMoves] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    const savedKeys = (p.grow_moves || '').split(',').filter(Boolean);
    MONEY_MOVES.forEach(m => { seed[m.key] = savedKeys.length ? savedKeys.includes(m.key) : ['reinvest', 'bizcredit', 'safety'].includes(m.key); });
    return seed;
  });
  const toggle = (k: string) => setMoves(s => ({ ...s, [k]: !s[k] }));

  const c = bkNum(cac), l = bkNum(ltv);
  const ratio = c > 0 ? l / c : 0;
  const verdict = ratio >= 3 ? { t: 'Healthy — each customer pays back well', col: '#06d6a0' }
    : ratio >= 1 ? { t: 'Thin — you profit, but slowly. Lift LTV or cut CAC', col: '#f59e0b' }
      : c > 0 ? { t: 'Underwater — each customer costs more than they return', col: '#ff5468' }
        : { t: '', col: '#9e99ad' };

  const complete = () => onComplete({ grow_cac: cac, grow_ltv: ltv, grow_moves: MONEY_MOVES.filter(m => moves[m.key]).map(m => m.key).join(',') });

  return (
    <div className="space-y-5">
      {/* Unit economics */}
      <div>
        <div className="flex items-center justify-between mb-2"><Eyebrow>Do the unit economics work?</Eyebrow><PTag k="prosper" /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <MiniField label="Cost to get one customer (CAC)">
            <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#8b5cf6]/50"><span className="text-white/40 text-sm mr-1">$</span><input value={cac} onChange={e => setCac(e.target.value)} placeholder="30" inputMode="decimal" className="w-full bg-transparent text-sm outline-none placeholder:text-white/25 tabular-nums" /></div>
          </MiniField>
          <MiniField label="What a customer is worth (LTV)">
            <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#8b5cf6]/50"><span className="text-white/40 text-sm mr-1">$</span><input value={ltv} onChange={e => setLtv(e.target.value)} placeholder="120" inputMode="decimal" className="w-full bg-transparent text-sm outline-none placeholder:text-white/25 tabular-nums" /></div>
          </MiniField>
        </div>
        {ratio > 0 && (
          <div className="mt-2 rounded-xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: verdict.col + '44', background: verdict.col + '14' }}>
            <div className="text-2xl font-black tabular-nums" style={{ color: verdict.col }}>{ratio.toFixed(1)}<span className="text-sm">:1</span></div>
            <div className="text-[12px] text-white/70 leading-snug"><b>LTV : CAC.</b> {verdict.t}. Aim for 3:1 or better before you spend hard on growth.</div>
          </div>
        )}
      </div>

      {/* Wealth / money moves */}
      <div>
        <Eyebrow className="mb-2">Build wealth, not just revenue</Eyebrow>
        <p className="text-[11px] text-white/45 mb-2.5 leading-snug">A profitable business is the engine — these are how the money it makes builds lasting wealth. Track the moves you'll make.</p>
        <div className="space-y-2">
          {MONEY_MOVES.map(m => (
            <div key={m.key} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all ${moves[m.key] ? 'bg-[#ff8c00]/[0.06] border-[#ff8c00]/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <button onClick={() => toggle(m.key)} aria-pressed={!!moves[m.key]} className="w-6 h-6 rounded-lg border flex items-center justify-center shrink-0" style={moves[m.key] ? { background: '#ff8c00', borderColor: '#ff8c00' } : { borderColor: 'rgba(255,255,255,.25)' }}>{moves[m.key] && <Check size={13} className="text-black" />}</button>
              <div className="min-w-0 flex-1"><p className="text-[13px] font-bold">{m.t}</p><p className="text-[11px] text-white/45 leading-snug">{m.d}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Personal vs business credit */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-2.5">Two credit scores, kept separate</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="text-[12px] font-black text-[#00daf3] mb-1">Personal credit</div><p className="text-[11px] text-white/55 leading-snug">Tied to your SSN. Driven by payment history &amp; how much of your limit you use. It backs you early — protect it.</p></div>
          <div><div className="text-[12px] font-black text-[#ff8c00] mb-1">Business credit</div><p className="text-[11px] text-white/55 leading-snug">Tied to your EIN (and a D-U-N-S number). Built with vendors &amp; cards in the business's name — it's what lets the business borrow without risking you.</p></div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button onClick={() => askAria(`You are Aria, my Praxis coach on the Three P's (Prosper). Teach me the money side of growing "${venture.name}" — my unit economics (CAC $${cac || '?'}, LTV $${ltv || '?'}), then plain-English basics of investing my surplus, personal vs business credit, and what to actually understand about crypto & blockchain before touching it. Keep it honest about risk; I'm at a ${venture.band === 'pro' ? 'confident' : 'beginner'} level.`)}
          className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 flex items-center justify-center gap-2">
          <AriaMark size={16} petals={false} /> Teach me the money side
        </button>
        <button onClick={complete} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white hover:brightness-110 flex items-center justify-center gap-2">
          <Check size={13} /> Complete Grow
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#06d6a0] text-center flex items-center justify-center gap-1.5"><Check size={12} /> That's the whole walkthrough{uid ? ' · +15 points' : ''} — you just walked a business into being. Your Blueprint is complete.</p>}
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
    { k: 'Market size', v: [p.val_tam, p.val_sam, p.val_som].filter(Boolean).join('  →  ') },
    { k: 'Ideal customer', v: p.icp_who },
    { k: 'Starting price', v: p.price ? `$${p.price}${p.price_basis ? ` · ${p.price_basis.replace('_', '-')}` : ''}` : '' },
    { k: 'Legal structure', v: getEntity(p.form_entity)?.label },
    { k: 'Monthly net', v: p.books_net ? `$${Number(p.books_net).toLocaleString('en-US', { maximumFractionDigits: 0 })} · ${p.books_margin}% margin` : '' },
    { k: 'Business page', v: venture.orgId ? 'Launched ✓' : '' },
    { k: 'Compliance', v: p.comply_items ? `${p.comply_items.split(',').filter(Boolean).length} deadlines tracked` : '' },
    { k: 'Funding', v: p.fund_rungs ? `${p.fund_rungs.split(',').filter(Boolean).length} routes${p.fund_amount ? ` · $${p.fund_amount} target` : ''}` : '' },
    { k: 'Unit economics', v: (p.grow_cac && p.grow_ltv && bkNum(p.grow_cac) > 0) ? `LTV:CAC ${(bkNum(p.grow_ltv) / bkNum(p.grow_cac)).toFixed(1)}:1` : '' },
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
          <button onClick={() => exportBusinessPlan(venture)} title="Export as a printable business plan (Save as PDF)"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white hover:brightness-110">
            <Download size={12} /> Export plan
          </button>
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
