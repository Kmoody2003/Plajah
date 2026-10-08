// Part info panel: function, internals, wear, failure modes, diagnostics, repair (safety-gated), cost RANGE (estimate), ASE, lessons.
import React, { useEffect, useState } from 'react';
import type { PartArchetype, FaultDef } from '../../services/machineAtlas/types';
import { inspectionKeysForPart } from '../../services/machineAtlas/dviBridge';

export const DraftBadge = ({ status }: { status: string }) => {
  const draft = /ai-draft/i.test(status);
  return (
    <span title={status} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: draft ? 'var(--pj-warning-soft)' : 'var(--pj-success-soft)', color: draft ? 'var(--pj-warning)' : 'var(--pj-success)', border: `1px solid ${draft ? 'var(--pj-warning)' : 'var(--pj-success)'}` }}>
      {draft ? 'Draft: awaiting ASE master tech review' : status}
    </span>
  );
};

const H = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1 mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-white/55">{children}</h4>;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function PartPanel({ part, faults, activeFaults, onToggleFault, onHide, onIsolate, isolated, onClose, onOpenLesson }: {
  part: PartArchetype; faults: FaultDef[]; activeFaults: string[]; onToggleFault: (id: string) => void;
  onHide: () => void; onIsolate: () => void; isolated: boolean; onClose: () => void; onOpenLesson?: (id: string) => void;
}) {
  const c = part.content;
  const [safetyOk, setSafetyOk] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setSafetyOk(false); setOpen(null); }, [part.id]);
  const dvi = inspectionKeysForPart(part.id);
  const faultFor = (fmId: string) => faults.find(f => f.id === fmId);
  return (
    <div className="flex h-full flex-col text-[13px] leading-relaxed text-white/85">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <div className="font-display text-[22px] font-black italic leading-tight text-white" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>{part.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">{part.category}</span>
            <DraftBadge status={c.reviewStatus} />
          </div>
        </div>
        <button aria-label="Close part panel" onClick={onClose} className="h-8 w-8 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/20">×</button>
      </div>
      <div className="flex gap-2 px-4 pb-2">
        <button onClick={onIsolate} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: isolated ? 'var(--pj-grad-brand)' : 'rgba(255,255,255,0.1)' }}>{isolated ? 'Show all' : 'Isolate'}</button>
        <button onClick={onHide} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20">Hide part</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <H>What it does</H><p>{c.function}</p>
        <H>What happens inside</H><p>{c.whatHappensInside}</p>
        <H>Wear</H><ul className="list-disc space-y-0.5 pl-5">{c.wear.map(w => <li key={w}>{w}</li>)}</ul>

        <H>Failure modes</H>
        <div className="space-y-1.5">
          {c.failureModes.map(f => {
            const fault = faultFor(f.id), active = activeFaults.includes(f.id), isOpen = open === f.id;
            return (
              <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.04]">
                <button onClick={() => setOpen(isOpen ? null : f.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-semibold text-white" aria-expanded={isOpen}>
                  <span>{f.name}</span><span className="text-white/40">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="space-y-2 px-3 pb-3">
                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Symptoms</div><ul className="list-disc pl-5">{f.symptoms.map(x => <li key={x}>{x}</li>)}</ul></div>
                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Likely causes</div><ul className="list-disc pl-5">{f.causes.map(x => <li key={x}>{x}</li>)}</ul></div>
                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Tests that confirm it</div><ul className="list-disc pl-5">{f.tests.map(x => <li key={x}>{x}</li>)}</ul></div>
                    {fault && (
                      <button onClick={() => onToggleFault(f.id)} className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: active ? 'var(--pj-danger)' : 'var(--pj-grad-ember)' }}>
                        {active ? 'Remove this fault from the simulation' : 'Inject this fault into the simulation'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <H>Diagnostics</H><ul className="list-disc space-y-0.5 pl-5">{c.diagnostics.map(d => <li key={d}>{d}</li>)}</ul>

        <H>Generic repair overview</H>
        <p>{c.repair.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/70">
          <span aria-label={`Difficulty ${c.repair.difficulty} of 5`}>Difficulty {'●'.repeat(c.repair.difficulty)}{'○'.repeat(5 - c.repair.difficulty)}</span>
          <span>Time {c.repair.timeHoursRange[0]}–{c.repair.timeHoursRange[1]} h <em className="text-white/45">(estimate)</em></span>
        </div>
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--pj-warning)', background: 'var(--pj-warning-soft)' }}>
          <div className="mb-1 text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--pj-warning)' }}>Safety first</div>
          <ul className="list-disc space-y-1 pl-5 text-white/90">{c.repair.safety.map(s => <li key={s}>{s}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-white">
            <input type="checkbox" checked={safetyOk} onChange={e => setSafetyOk(e.target.checked)} /> I have read the safety notes
          </label>
        </div>
        {safetyOk ? (
          <>
            <ol className="mt-3 list-decimal space-y-1 pl-5">{c.repair.steps.map(s => <li key={s}>{s}</li>)}</ol>
            <div className="mt-2 text-xs text-white/65">Tools: {c.repair.tools.join(', ')}</div>
          </>
        ) : <p className="mt-3 text-xs text-white/50">Tick the box above to show the generic steps.</p>}
        <p className="mt-3 rounded-lg bg-white/5 p-2 text-[11px] text-white/65">{c.repair.disclaimer}</p>

        <H>Cost range <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-white/70">estimate</span></H>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/[0.06] p-3"><div className="text-[10px] uppercase tracking-wider text-white/45">Part</div><div className="text-base font-bold text-white">{money(c.cost.partsRangeUSD[0])} – {money(c.cost.partsRangeUSD[1])}</div></div>
          <div className="rounded-xl bg-white/[0.06] p-3"><div className="text-[10px] uppercase tracking-wider text-white/45">Labor</div><div className="text-base font-bold text-white">{c.cost.laborHoursRange[0]} – {c.cost.laborHoursRange[1]} h</div></div>
        </div>
        <p className="mt-1 text-[11px] text-white/50">Generic ranges for illustration only. Real prices vary by vehicle, region, parts quality and shop labor rate; the shop quote governs.</p>

        <H>Training alignment</H>
        <p className="text-xs text-white/70">{c.aseArea}. Alignment to the published task-list topic only; this is not an ASE certification.</p>
        <H>Related lessons</H>
        {c.lessonIds.length ? <div className="flex flex-wrap gap-1.5">{c.lessonIds.map(l => <button key={l} onClick={() => onOpenLesson?.(l)} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20">{l}</button>)}</div> : <p className="text-xs text-white/50">No lessons are linked to this part yet.</p>}
        {dvi.length > 0 && (<><H>Inspection items</H><p className="text-xs text-white/70">Appears on the multi-point inspection as: {dvi.join(', ')}</p></>)}
        <H>Model</H>
        <p className="text-[11px] text-white/45">{part.license.generated ? 'Procedurally generated generic archetype.' : part.license.attribution} License: {part.license.license}.</p>
      </div>
    </div>
  );
}
