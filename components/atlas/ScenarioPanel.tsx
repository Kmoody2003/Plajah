// Scenario panel: tier badge + assumptions drawer, play/scrub, healthy-vs-faulted, gauges, charts, events, S0 explainers.
import React, { useMemo, useState } from 'react';
import type { FaultDef, Scenario, SimTier, Trace } from '../../services/machineAtlas/types';
import { SIM_TIER_LABEL } from '../../services/machineAtlas/types';
import { CHARTS, GAUGES, sample, traceDuration, type RunResult } from '../../services/machineAtlas/sim/runner';
import { brakeFactors } from '../../services/machineAtlas/sim/brakeSim';
import type { LoadedSystem } from '../../services/machineAtlas/registry';

const TIER_COLOR: Record<SimTier, string> = { S0: '#06D6A0', S1: '#00DAF3', S2: '#FF8C00', S3: '#D0BCFF' };
export const TierBadge = ({ tier }: { tier: SimTier }) => (
  <span title={SIM_TIER_LABEL[tier]} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider"
    style={{ color: TIER_COLOR[tier], border: `1px solid ${TIER_COLOR[tier]}`, background: 'rgba(255,255,255,0.04)' }}>{tier} {SIM_TIER_LABEL[tier].split(' (')[0]}</span>
);

function Chart({ tr, def, t, alt }: { tr: Trace; def: { title: string; channels: { ch: string; label: string; color: string }[] }; t: number; alt?: Trace | null }) {
  const W = 300, Hh = 96, P = 4;
  const lines = useMemo(() => {
    let max = 0, min = 0;
    for (const c of def.channels) { const a = tr.channels[c.ch]; if (!a) continue; for (let i = 0; i < a.length; i += 3) { if (a[i] > max) max = a[i]; if (a[i] < min) min = a[i]; } }
    if (max === min) max = min + 1;
    const dur = traceDuration(tr), step = Math.max(1, Math.floor(tr.n / 150));
    return def.channels.map(c => {
      const a = tr.channels[c.ch]; if (!a) return { ...c, d: '' };
      let d = '';
      for (let i = 0; i < tr.n; i += step) d += `${i === 0 ? 'M' : 'L'}${(P + (i * tr.dt / dur) * (W - 2 * P)).toFixed(1)},${(Hh - P - ((a[i] - min) / (max - min)) * (Hh - 2 * P)).toFixed(1)}`;
      return { ...c, d };
    });
  }, [tr, def]);
  const dur = traceDuration(tr), x = P + (t / dur) * (W - 2 * P);
  void alt;
  return (
    <figure className="mb-2">
      <figcaption className="mb-0.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50"><span>{def.title}</span>
        <span className="flex gap-2 normal-case tracking-normal">{def.channels.map(c => <span key={c.ch} style={{ color: c.color }}>{c.label}</span>)}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="h-24 w-full rounded-lg bg-white/[0.04]" role="img" aria-label={def.title}>
        {lines.map(l => <path key={l.ch} d={l.d} fill="none" stroke={l.color} strokeWidth={1.6} strokeLinejoin="round" />)}
        <line x1={x} x2={x} y1={0} y2={Hh} stroke="#fff" strokeOpacity={0.6} strokeWidth={1} />
      </svg>
    </figure>
  );
}

/** Stopping-distance comparison for the ABS scenario: speed vs distance, with and without ABS. */
function AbsCompare({ a, b }: { a: Trace; b: Trace }) {
  const W = 300, Hh = 110, P = 6;
  const maxD = Math.max(Number(a.summary.stoppingDistanceM), Number(b.summary.stoppingDistanceM)) * 1.05 || 1;
  const path = (tr: Trace) => { let d = ''; for (let i = 0; i < tr.n; i += 4) { const x = P + (tr.channels.dist[i] / maxD) * (W - 2 * P), y = Hh - P - (tr.channels.v[i] / 26) * (Hh - 2 * P); d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`; } return d; };
  const da = Number(a.summary.stoppingDistanceM), db = Number(b.summary.stoppingDistanceM);
  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Stopping distance comparison</div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="h-28 w-full" role="img" aria-label="Speed versus distance with and without ABS">
        <path d={path(a)} fill="none" stroke="#06D6A0" strokeWidth={2} /><path d={path(b)} fill="none" stroke="#EF4444" strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-xs"><span style={{ color: '#06D6A0' }}>With ABS: {da} m</span><span style={{ color: '#EF4444' }}>Without: {db} m</span></div>
      <div className="mt-0.5 text-[11px] text-white/60">{db > da ? `ABS stops ${(db - da).toFixed(1)} m shorter here, and the driver can still steer.` : 'On this surface and fault set ABS offers no distance benefit; steering control is the main gain.'}</div>
    </div>
  );
}

export interface ScenarioPanelProps {
  loaded: LoadedSystem; scenario: Scenario; onScenario: (id: string) => void; run: RunResult | null; running: boolean;
  t: number; playing: boolean; onPlay: () => void; onSeek: (t: number) => void; speed: number; onSpeed: (s: number) => void;
  faulted: boolean; onFaulted: (b: boolean) => void; activeFaults: string[]; onToggleFault: (id: string) => void; faultOptions: FaultDef[];
  onClose: () => void;
}

export function ScenarioPanel(p: ScenarioPanelProps) {
  const { loaded, scenario, run } = p;
  const [assume, setAssume] = useState(false);
  const tr = run?.trace || null;
  const dur = tr ? traceDuration(tr) : 0;
  const kind = run?.kind;
  const gauges = kind === 'apply' || kind === 'heat' || kind === 'abs' ? GAUGES[kind] : [];
  const charts = kind === 'apply' || kind === 'heat' || kind === 'abs' ? CHARTS[kind] : [];
  const groups = useMemo(() => ({
    sim: loaded.scenarios.filter(s => !s.id.startsWith('fault_') && s.tier !== 'S0'),
    drills: loaded.scenarios.filter(s => s.id.startsWith('fault_')),
    s0: loaded.scenarios.filter(s => s.tier === 'S0'),
  }), [loaded]);
  const sevColor = { info: '#00DAF3', warn: '#F59E0B', alert: '#EF4444' } as const;
  const upcoming = tr ? tr.events.filter(e => e.t <= p.t + 1e-6) : [];
  return (
    <div className="flex h-full flex-col text-[13px] text-white/85">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="font-display text-xl font-black italic text-white" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>Simulate</div>
        <button aria-label="Close simulation panel" onClick={p.onClose} className="h-8 w-8 rounded-full bg-white/10 text-white hover:bg-white/20">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50" htmlFor="atlas-scn">Scenario</label>
        <select id="atlas-scn" value={scenario.id} onChange={e => p.onScenario(e.target.value)} className="mb-2 w-full rounded-lg border border-white/15 bg-[#17122a] px-2 py-2 text-sm text-white">
          <optgroup label="Simulations">{groups.sim.map(s => <option key={s.id} value={s.id}>{s.tier} · {s.name}</option>)}</optgroup>
          <optgroup label="Fault drills (diagnose it)">{groups.drills.map(s => <option key={s.id} value={s.id}>{s.name.replace('Fault drill: ', '')}</option>)}</optgroup>
          <optgroup label="Explainers">{groups.s0.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
        </select>
        <div className="mb-2 flex items-center gap-2"><TierBadge tier={scenario.tier} />
          <button onClick={() => setAssume(a => !a)} className="text-xs font-semibold text-[var(--pj-orange)] underline-offset-2 hover:underline" aria-expanded={assume}>{assume ? 'Hide' : 'Show'} assumptions</button></div>
        <p className="mb-2 text-white/70">{scenario.description}</p>
        {assume && tr && (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs text-white/75">
            <div className="mb-1 font-bold text-white">What this simulation assumes</div>
            <ul className="list-disc space-y-1 pl-5">{tr.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
          </div>
        )}

        {tr && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <button onClick={p.onPlay} className="h-9 min-w-[84px] rounded-full px-4 text-sm font-bold text-white" style={{ background: 'var(--pj-grad-brand)' }}>{p.playing ? 'Pause' : p.t >= dur - 1e-3 ? 'Replay' : 'Play'}</button>
              <input aria-label="Scrub simulation time" type="range" min={0} max={dur} step={dur / 400} value={p.t} onChange={e => p.onSeek(Number(e.target.value))} className="min-w-0 flex-1 accent-[#FF8C00]" />
              <span className="w-14 text-right tabular-nums text-xs text-white/60">{p.t.toFixed(1)}s</span>
            </div>
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className="text-white/50">Speed</span>
              {[0.5, 1, 2, 4].map(s => <button key={s} onClick={() => p.onSpeed(s)} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: p.speed === s ? 'var(--pj-orange)' : 'rgba(255,255,255,0.1)', color: p.speed === s ? '#000' : '#fff' }}>{s}x</button>)}
            </div>
            <div className="mb-2 flex rounded-full bg-white/10 p-0.5 text-xs font-bold" role="group" aria-label="Healthy or faulted">
              <button onClick={() => p.onFaulted(false)} className="flex-1 rounded-full py-1.5" style={{ background: !p.faulted ? 'var(--pj-success)' : 'transparent', color: !p.faulted ? '#00110a' : '#fff' }}>Healthy</button>
              <button onClick={() => p.onFaulted(true)} className="flex-1 rounded-full py-1.5" style={{ background: p.faulted ? 'var(--pj-danger)' : 'transparent', color: '#fff' }}>Faulted</button>
            </div>
            {p.faulted && (
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Inject faults</div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {p.faultOptions.map(f => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white/5">
                      <input type="checkbox" checked={p.activeFaults.includes(f.id)} onChange={() => p.onToggleFault(f.id)} />{f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {p.running && <div className="mb-2 text-xs text-white/50">Computing...</div>}

            <div className="mb-3 grid grid-cols-2 gap-2">
              {gauges.map(g => {
                const v = sample(tr, g.ch, p.t), k = Math.max(0, Math.min(1, v / g.max)), warn = g.warnAt !== undefined && v >= g.warnAt;
                return (
                  <div key={g.ch} className="rounded-xl bg-white/[0.06] p-2">
                    <div className="flex items-baseline justify-between"><span className="text-[10px] uppercase tracking-wider text-white/50">{g.label}</span>
                      <span className="tabular-nums text-sm font-bold" style={{ color: warn ? 'var(--pj-danger)' : '#fff' }}>{Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0)}<span className="ml-0.5 text-[10px] font-normal text-white/50">{g.unit}</span></span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${k * 100}%`, background: warn ? 'var(--pj-danger)' : 'var(--pj-grad-ember)' }} /></div>
                  </div>
                );
              })}
            </div>
            {kind === 'abs' && run?.alt && <AbsCompare a={tr} b={run.alt} />}
            {charts.map(c => <Chart key={c.title} tr={tr} def={c} t={p.t} />)}
            <div className="mb-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">What you would notice</div>
              {tr.events.length === 0 && <p className="text-xs text-white/50">Nothing unusual: this is the healthy baseline.</p>}
              <ul className="space-y-1">{tr.events.map(e => (
                <li key={e.label} className="flex gap-2 rounded-lg px-2 py-1 text-xs" style={{ background: upcoming.includes(e) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', opacity: upcoming.includes(e) ? 1 : 0.55 }}>
                  <span style={{ color: sevColor[e.severity] }}>●</span><span>{e.label}</span></li>))}</ul>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-2 text-[11px] text-white/60">
              {Object.entries(tr.summary).filter(([k]) => k !== 'tierNote').map(([k, v]) => <span key={k} className="mr-3 inline-block"><span className="text-white/40">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span> {String(v)}</span>)}
            </div>
            {p.faulted && p.activeFaults.length > 0 && <FaultTests loaded={loaded} faults={p.activeFaults} />}
          </>
        )}
        {kind === 's0-compare' && <CompareS0 />}
        {kind === 's0-parking' && <ol className="mt-2 list-decimal space-y-1.5 pl-5">{loaded.s0.parkingSteps.map(s => <li key={s}>{s}</li>)}</ol>}
      </div>
    </div>
  );
}

function FaultTests({ loaded, faults }: { loaded: LoadedSystem; faults: string[] }) {
  const rows = faults.map(id => {
    for (const part of loaded.parts.values()) { const f = part.content.failureModes.find(x => x.id === id); if (f) return { part, f }; }
    return null;
  }).filter(Boolean) as { part: { id: string; name: string }; f: { id: string; name: string; tests: string[]; symptoms: string[] } }[];
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Tests that confirm it</div>
      {rows.map(r => (
        <div key={r.f.id} className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-xs">
          <div className="font-bold text-white">{r.f.name} <span className="font-normal text-white/50">({r.part.name})</span></div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.f.tests.map(t => <li key={t}>{t}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function CompareS0() {
  const rows = brakeFactors(0.4);
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-white/70">Brake factor = brake torque per unit of applied force (higher means more output for the same push). Computed at pad friction 0.40.</p>
      {rows.map(r => (
        <div key={r.id} className="rounded-xl bg-white/[0.06] p-3">
          <div className="flex items-baseline justify-between"><span className="font-bold text-white">{r.label}</span><span className="tabular-nums text-lg font-black text-[var(--pj-orange)]">{isFinite(r.factor) ? r.factor.toFixed(2) : 'self-locking'}</span></div>
          <p className="mt-1 text-xs text-white/65">{r.note}</p>
        </div>
      ))}
      <ul className="list-disc space-y-1 pl-5 text-xs text-white/75">
        <li>Discs shed heat to the air much better, so they resist fade; drums keep their parts clean and dry and make a simple parking brake.</li>
        <li>Self-energising drums give strong braking from a small hydraulic push, but their output swings if friction changes (wet, hot).</li>
        <li>Most cars use discs at the front, where most of the braking happens, and drums or discs at the rear.</li>
      </ul>
    </div>
  );
}
