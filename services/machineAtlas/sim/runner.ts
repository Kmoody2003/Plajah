// Maps a scenario (+ active faults) to a precomputed trace, plus the gauge/chart definitions the viewer shows.
import type { Scenario, Trace } from '../types';
import { runApply, runAbs, runHeat } from './brakeSim';

export type RunKind = 'apply' | 'heat' | 'abs' | 's0-compare' | 's0-parking';
export interface Gauge { ch: string; label: string; unit: string; max: number; warnAt?: number }
export interface ChartDef { title: string; channels: { ch: string; label: string; color: string }[]; xLabel?: string }
export interface RunResult { kind: RunKind; trace: Trace | null; /** ABS: the same stop with ABS disabled (for the comparison chart). */ alt: Trace | null; faults: string[] }

export const GAUGES: Record<'apply' | 'heat' | 'abs', Gauge[]> = {
  apply: [
    { ch: 'pedal_force', label: 'Pedal force', unit: 'N', max: 250 }, { ch: 'booster_out', label: 'Booster output', unit: 'N', max: 3500 },
    { ch: 'p_mc', label: 'Master cylinder', unit: 'bar', max: 100 }, { ch: 'p_line', label: 'Caliper pressure', unit: 'bar', max: 100 },
    { ch: 'clamp', label: 'Clamp force', unit: 'kN', max: 24 }, { ch: 'torque', label: 'Rotor torque', unit: 'N m', max: 1100 },
    { ch: 'pedal_travel', label: 'Pedal travel', unit: 'mm', max: 130, warnAt: 100 },
  ],
  heat: [
    { ch: 'speed', label: 'Speed', unit: 'm/s', max: 35 }, { ch: 'decel', label: 'Deceleration', unit: 'g', max: 1 },
    { ch: 'mu', label: 'Pad friction', unit: '', max: 0.5 }, { ch: 'T_rotor', label: 'Rotor', unit: 'C', max: 700, warnAt: 500 },
    { ch: 'T_pad', label: 'Pad', unit: 'C', max: 700, warnAt: 300 }, { ch: 'T_caliper', label: 'Caliper', unit: 'C', max: 300 },
    { ch: 'T_fluid', label: 'Brake fluid', unit: 'C', max: 250, warnAt: 150 },
  ],
  abs: [
    { ch: 'v', label: 'Vehicle speed', unit: 'm/s', max: 26 }, { ch: 'wheel', label: 'Wheel speed', unit: 'm/s', max: 26 },
    { ch: 'slip', label: 'Slip ratio', unit: '', max: 1, warnAt: 0.5 }, { ch: 'p_wheel', label: 'Wheel pressure', unit: 'bar', max: 100 },
    { ch: 'fx', label: 'Tire force', unit: 'kN', max: 1.5 }, { ch: 'dist', label: 'Distance', unit: 'm', max: 140 },
  ],
};

export const CHARTS: Record<'apply' | 'heat' | 'abs', ChartDef[]> = {
  apply: [
    { title: 'Pressure (bar)', channels: [{ ch: 'p_mc', label: 'Master cylinder', color: '#FF8C00' }, { ch: 'p_line', label: 'Caliper', color: '#00DAF3' }] },
    { title: 'Pedal travel (mm)', channels: [{ ch: 'pedal_travel', label: 'Pedal', color: '#D40055' }] },
  ],
  heat: [
    { title: 'Temperature (C)', channels: [{ ch: 'T_rotor', label: 'Rotor', color: '#FF8C00' }, { ch: 'T_pad', label: 'Pad', color: '#D40055' }, { ch: 'T_fluid', label: 'Fluid', color: '#00DAF3' }, { ch: 'boil', label: 'Fluid boils', color: '#EF4444' }] },
    { title: 'Deceleration (g)', channels: [{ ch: 'decel', label: 'Decel', color: '#06D6A0' }] },
  ],
  abs: [
    { title: 'Speed (m/s)', channels: [{ ch: 'v', label: 'Vehicle', color: '#FF8C00' }, { ch: 'wheel', label: 'Wheel', color: '#00DAF3' }] },
    { title: 'Wheel pressure (bar)', channels: [{ ch: 'p_wheel', label: 'Caliper', color: '#D40055' }, { ch: 'p_driver', label: 'Driver', color: '#9aa0aa' }] },
  ],
};

export function runKindOf(sc: Scenario): RunKind {
  const r = String(sc.setup.run || 'apply');
  return (['apply', 'heat', 'abs', 's0-compare', 's0-parking'].includes(r) ? r : 'apply') as RunKind;
}

/** Faults that apply for this run: the scenario's drill fault(s) when `faulted`, or the user's picked set. */
export function runScenario(sc: Scenario, faults: string[]): RunResult {
  const kind = runKindOf(sc);
  if (kind === 's0-compare' || kind === 's0-parking') return { kind, trace: null, alt: null, faults: [] };
  if (kind === 'apply') return { kind, trace: runApply(faults, { pedalN: Number(sc.setup.pedalN) || 180 }), alt: null, faults };
  if (kind === 'heat') return { kind, trace: runHeat(faults, { stops: Number(sc.setup.stops) || 10 }), alt: null, faults };
  const surface = String(sc.setup.surface || 'snow');
  return { kind, trace: runAbs(faults, { abs: true, surface }), alt: runAbs(faults, { abs: false, surface }), faults };
}

/** Linear sample of a channel at time t (s). */
export function sample(tr: Trace, ch: string, t: number): number {
  const a = tr.channels[ch]; if (!a) return 0;
  const f = Math.min(Math.max(t / tr.dt, 0), tr.n - 1), i = Math.floor(f), j = Math.min(i + 1, tr.n - 1);
  return a[i] + (a[j] - a[i]) * (f - i);
}
export const traceDuration = (tr: Trace) => (tr.n - 1) * tr.dt;
