import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, AlertTriangle, BookOpen, FlaskConical, Trash2 } from 'lucide-react';
import { THINKING_METHODS, methodById, coachText, type ThinkingMethod } from '../../data/thinkingMethods';
import { emptyInvestigation, listInvestigations, saveInvestigation, deleteLocal, type Investigation } from '../../services/investigationService';
import { experimentById } from '../../data/virtualExperiments';
import DataWorkbench from './DataWorkbench';

/**
 * Investigation Studio: guided science, engineering and statistics projects. A student picks a way of
 * working, then moves through its steps with plain guidance, common mistakes and gentle coaching. The
 * data step is built on the Plajah Labs tools (live Labs data, the Labs chart card), and finished work
 * is saved into the student's Labs Notebook as an EXPERIMENT entry.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; onBack?: () => void }

const ta = 'w-full rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-[13px] text-white placeholder:text-white/30';

const InvestigationStudio: React.FC<Props> = ({ user, profile, onNavigate, onBack }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [inv, setInv] = useState<Investigation | null>(null);
  const [saved, setSaved] = useState<Investigation[]>(() => listInvestigations(uid || 'anon'));
  const [msg, setMsg] = useState('');
  const method: ThinkingMethod | undefined = inv ? methodById(inv.methodId) : undefined;

  useEffect(() => { setSaved(listInvestigations(uid || 'anon')); }, [uid, inv]);

  const patch = (p: Partial<Investigation>) => setInv(i => (i ? { ...i, ...p } : i));
  const setField = (id: string, v: string) => patch({ fields: { ...inv!.fields, [id]: v } });

  const save = async (quiet = false) => {
    if (!inv || !method) return;
    const toNotebook = await saveInvestigation(inv, method, uid);
    if (!quiet) { setMsg(toNotebook ? 'Saved. A copy is in your Labs Notebook.' : 'Saved on this device. Sign in to also keep it in your Labs Notebook.'); setTimeout(() => setMsg(''), 4000); }
  };
  const goStep = async (i: number) => { patch({ stepIndex: i }); if (inv) await save(true); };

  const exp = experimentById(inv?.experimentId || '');
  const step = method?.steps[inv?.stepIndex ?? 0];
  const last = method ? inv!.stepIndex === method.steps.length - 1 : false;
  const progress = method ? Math.round(((inv!.stepIndex + 1) / method.steps.length) * 100) : 0;

  const header = useMemo(() => (
    <div className="flex items-center gap-3 mb-1">
      {onBack && <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full grid place-items-center bg-white/5 hover:bg-white/10"><ArrowLeft size={18} /></button>}
      <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#00DAF3]">Investigation Studio</p>
    </div>
  ), [onBack]);

  // ── Pick a method ───────────────────────────────────────────────────────
  if (!inv || !method || !step) {
    return (
      <div className="min-h-full bg-[#0a0a0f] text-white pb-24"><div className="max-w-4xl mx-auto px-5 py-7">
        {header}
        <h1 className="text-3xl font-black tracking-tight leading-[1.05]">Investigate like a scientist, an engineer, a statistician</h1>
        <p className="text-white/55 text-sm mt-1 mb-6">Pick a way of working. You will ask a real question, collect or load data, graph it with the Plajah Labs tools and reach a conclusion you can defend.</p>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {THINKING_METHODS.map(m => (
            <button key={m.id} type="button" onClick={() => setInv(emptyInvestigation(m.id))} className="text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] hover:-translate-y-0.5 transition-all p-5">
              <span className="text-3xl">{m.emoji}</span><p className="font-black text-[16px] mt-2 leading-tight">{m.title}</p>
              <p className="text-[12px] text-white/55 mt-1 leading-snug">{m.blurb}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#00DAF3] mt-3">{m.steps.length} steps · Start</p>
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <section aria-label="Your investigations"><h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">Continue an investigation</h2>
            <div className="grid gap-2">{saved.map(s => { const m = methodById(s.methodId); return (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <button type="button" onClick={() => setInv(s)} className="min-w-0 flex-1 text-left"><p className="text-[14px] font-black truncate">{s.title || s.fields.question || s.fields.problem || 'Untitled investigation'}</p>
                  <p className="text-[11px] text-white/45">{m?.title} · step {s.stepIndex + 1} of {m?.steps.length} · {new Date(s.updatedAt).toLocaleDateString()}</p></button>
                <button type="button" aria-label="Delete investigation" onClick={() => { deleteLocal(s.id, uid || 'anon'); setSaved(listInvestigations(uid || 'anon')); }} className="text-white/35 hover:text-rose-300"><Trash2 size={15} /></button>
              </div>); })}</div></section>
        )}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-wrap items-center gap-3">
          <FlaskConical size={18} className="text-[#06D6A0]" /><p className="text-[12px] text-white/65 flex-1 min-w-[200px]">Want to explore first? The Labs have simulators, pioneers, laws and a notebook for every science.</p>
          <button type="button" onClick={() => onNavigate('PLAJAH_LABS')} className="rounded-full border border-white/20 px-4 py-2 text-[11px] font-black uppercase tracking-wider hover:bg-white/10">Open the Labs</button>
        </div>
      </div></div>
    );
  }

  // ── Work through a method ───────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24"><div className="max-w-3xl mx-auto px-5 py-7">
      {header}
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-black tracking-tight flex-1 min-w-0">{method.emoji} {method.title}</h1>
        <button type="button" onClick={() => { void save(true); setInv(null); }} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10">All investigations</button>
      </div>
      <input value={inv.title} onChange={e => patch({ title: e.target.value })} aria-label="Investigation title" placeholder="Name your investigation" className={`${ta} mb-3 font-black`} />
      <p className="text-[11px] text-white/45 mb-3">{method.caveat}</p>

      <nav aria-label="Steps" className="flex gap-1.5 flex-wrap mb-2">
        {method.steps.map((s, i) => (
          <button key={s.id} type="button" onClick={() => goStep(i)} aria-current={i === inv.stepIndex ? 'step' : undefined}
            className={`px-3 py-1.5 rounded-full text-[11px] font-black ${i === inv.stepIndex ? 'bg-white text-black' : i < inv.stepIndex ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/5 text-white/55'}`}>{i < inv.stepIndex ? <Check size={11} className="inline mr-1" /> : null}{i + 1}. {s.title}</button>
        ))}
      </nav>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-5"><div className="h-full bg-[#00DAF3] transition-all" style={{ width: `${progress}%` }} /></div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00DAF3]">Step {inv.stepIndex + 1}: {step.title}</p>
        <p className="text-[15px] font-black mt-1">{step.goal}</p>
        <p className="text-[13px] text-white/70 leading-relaxed mt-1.5">{step.guide}</p>
        <details className="mt-3"><summary className="text-[11px] font-black text-amber-200/85 cursor-pointer inline-flex items-center gap-1.5"><AlertTriangle size={12} /> Common mistakes</summary>
          <ul className="list-disc pl-5 mt-1.5 text-[12px] text-white/60 grid gap-0.5">{step.mistakes.map(m => <li key={m}>{m}</li>)}</ul></details>
      </section>

      <div className="grid gap-5">
        {step.fields.map(f => (
          <div key={f.id}>
            {f.kind === 'text' && (<label className="grid gap-1.5 text-[12px] font-black text-white/70">{f.label}
              <textarea value={inv.fields[f.id] || ''} onChange={e => setField(f.id, e.target.value)} rows={3} placeholder={f.placeholder} className={`${ta} font-normal`} />
              {(() => { const tip = coachText(f.coach, inv.fields[f.id] || ''); return tip ? <span className="font-normal text-[12px] text-amber-200/90 flex gap-1.5"><Lightbulb size={13} className="shrink-0 mt-0.5" />{tip}</span> : null; })()}</label>)}
            {f.kind === 'variables' && (
              <div className="grid gap-2"><p className="text-[12px] font-black text-white/70">{f.label}</p>
                {([['independent', 'Change this (independent variable)', 'e.g. string length'], ['dependent', 'Measure this (dependent variable)', 'e.g. time for one swing, in seconds'], ['controlled', 'Keep these the same (controlled)', 'e.g. the mass, the starting angle']] as const).map(([k, l, ph]) => (
                  <label key={k} className="grid gap-1 text-[11px] font-black text-white/55">{l}<input value={inv.vars[k]} onChange={e => patch({ vars: { ...inv.vars, [k]: e.target.value } })} placeholder={ph} className={`${ta} font-normal`} /></label>))}
                {exp && <p className="text-[11px] text-white/45">Tip: your virtual experiment changes <b>{exp.independent.name.toLowerCase()}</b> and measures <b>{exp.dependent.name.toLowerCase()}</b>; keep the same: {exp.controls.join('; ')}.</p>}
              </div>)}
            {f.kind === 'data' && <DataWorkbench table={inv.table} onTable={t => patch({ table: t })} graph={inv.graph} onGraph={g => patch({ graph: g })} experimentId={inv.experimentId} onExperiment={id => patch({ experimentId: id })} />}
            {f.kind === 'cer' && (
              <div className="grid gap-2"><p className="text-[12px] font-black text-white/70">{f.label}</p>
                {([['claim', 'Claim: your answer to the question', 'The longer the string, the longer the swing takes.'], ['evidence', 'Evidence: specific numbers from your data', 'At 0.4 m the period was 1.27 s; at 1.6 m it was 2.53 s.'], ['reasoning', 'Reasoning: why the evidence supports the claim', 'The period roughly doubled when the length quadrupled, which fits a square-root relationship.']] as const).map(([k, l, ph]) => (
                  <label key={k} className="grid gap-1 text-[11px] font-black text-white/55">{l}<textarea rows={2} value={inv.cer[k]} onChange={e => patch({ cer: { ...inv.cer, [k]: e.target.value } })} placeholder={ph} className={`${ta} font-normal`} /></label>))}
                {inv.cer.evidence.trim() && !/\d/.test(inv.cer.evidence) && <p className="text-[12px] text-amber-200/90 flex gap-1.5"><Lightbulb size={13} className="shrink-0 mt-0.5" />Strong evidence quotes actual numbers from your table or graph.</p>}
                {/\b(prove|proves|proved|definitely)\b/i.test(inv.cer.claim + inv.cer.reasoning) && <p className="text-[12px] text-amber-200/90 flex gap-1.5"><Lightbulb size={13} className="shrink-0 mt-0.5" />Data can support or contradict a claim, but rarely prove it for certain. Try "the data suggest".</p>}
                {exp && inv.cer.claim.trim().length > 8 && (
                  <details className="rounded-xl border border-[#06D6A0]/30 bg-[#06D6A0]/[0.06] p-3"><summary className="text-[12px] font-black text-[#5ff0c6] cursor-pointer">Reveal what is really going on in this experiment</summary>
                    <p className="text-[13px] mt-2"><b>{exp.truth.law}</b></p><p className="text-[12px] text-white/70 mt-1">{exp.truth.explanation}</p>
                    {exp.truth.linearise && <p className="text-[12px] text-white/70 mt-1">{exp.truth.linearise.why}</p>}
                    <p className="text-[11px] text-white/45 mt-2">Compare this with your claim. If they differ, that is not failure: it is the most useful thing an investigation can show you.</p></details>)}
              </div>)}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-8">
        <button type="button" disabled={inv.stepIndex === 0} onClick={() => goStep(inv.stepIndex - 1)} className="rounded-full border border-white/15 px-4 py-2 text-[12px] font-black disabled:opacity-40 inline-flex items-center gap-1.5"><ArrowLeft size={14} /> Back</button>
        <button type="button" onClick={() => save()} className="rounded-full border border-white/15 px-4 py-2 text-[12px] font-black hover:bg-white/10">Save</button>
        <span className="flex-1" />
        {!last ? <button type="button" onClick={() => goStep(inv.stepIndex + 1)} className="rounded-full bg-white text-black px-5 py-2 text-[12px] font-black inline-flex items-center gap-1.5">Next <ArrowRight size={14} /></button>
          : <button type="button" onClick={async () => { await save(); }} className="rounded-full bg-[#06D6A0] text-black px-5 py-2 text-[12px] font-black inline-flex items-center gap-1.5"><Check size={14} /> Finish and save</button>}
      </div>
      {msg && <p role="status" className="text-[12px] text-[#06D6A0] mt-3">{msg}</p>}
      <p className="text-[11px] text-white/40 mt-4 flex items-center gap-1.5"><BookOpen size={12} /> Want the ideas behind this? Open <button type="button" onClick={() => onNavigate('LEARN')} className="underline underline-offset-2 hover:text-white">Thinking Like a Scientist and Engineer</button> in the Learn map.</p>
    </div></div>
  );
};

export default InvestigationStudio;
