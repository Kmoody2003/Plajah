// Brakes pilot simulations. Each run precomputes a Trace (fixed dt) that the viewer scrubs.
// (a) apply  - S1 force chain + S2 hydraulic network     (b) heat - S2 thermal RC + friction fade
// (c) abs    - S1 quarter-car slip ODE + controller       (d) faults - parameter overrides on all three
// Fully deterministic (no random numbers). All magnitudes are illustrative.
import type { Trace, SimTier } from '../types';
import * as H from '../solvers/hydraulics';
import * as T from '../solvers/thermal';
import * as F from '../solvers/friction';
import * as TIRE from '../solvers/tire';
import { discFactor, leadingShoeFactor, trailingShoeFactor } from '../solvers/kinematics';

export const BRAKE_ASSUMPTIONS: Record<'apply' | 'heat' | 'abs', string[]> = {
  apply: [
    'Pedal lever ratio 4:1; vacuum booster = fixed gain with a vacuum-limited assist cap (first-order lag 40 ms).',
    'Tandem master cylinder bore 22.2 mm, floating caliper piston 57 mm, one faulted corner plus three lumped healthy corners.',
    ...H.ASSUMPTIONS,
    'Friction coefficient fixed at the cold-street value unless a fault changes it.',
  ],
  heat: [
    'Vehicle 1450 kg, repeated 110 to 30 km/h stops at constant line pressure (the driver does not add pedal as the brakes fade).',
    'The run starts with warm brakes (after a long descent: rotor 150 C, fluid 85 C).', 'DEMO COMPRESSION: pad-to-caliper-to-fluid conduction is exaggerated about 3x so fluid heating shows in a two-minute run (real fluid heats over many minutes).', '70/30 front/rear bias; rear brakes held at a constant mu so the car keeps some retardation.',
    ...T.ASSUMPTIONS, ...F.ASSUMPTIONS,
  ],
  abs: [
    'Quarter-car: 400 kg, wheel inertia 1.1 kg m2, tire radius 0.31 m, 25 m/s initial speed, panic pedal.',
    'ABS = rule-based apply / hold / release controller on wheel slip with pulsed re-apply (a teaching model, not a production algorithm).',
    ...TIRE.ASSUMPTIONS, ...H.ASSUMPTIONS,
  ],
};

export interface FaultSet { has(id: string): boolean }
export const faultSet = (ids: string[] = []): FaultSet => { const s = new Set(ids); return { has: id => s.has(id) }; };

/** Parameter overrides produced by the active faults. */
export interface BrakeParams {
  gapM: number; airM3: number; assistCapN: number; assistGain: number; muFactor: number;
  seized: boolean; clampFactor: number; dragN: number; dtvM: number; waterPct: number;
  wssFailed: boolean; drumGapM: number; worn: boolean; pinStuck: boolean;
}
export function paramsFor(faults: string[] = []): BrakeParams {
  const f = faultSet(faults);
  return {
    gapM: 1.5e-4 + (f.has('worn_pads') ? 1e-4 : 0) + (f.has('drum_adjuster_failure') ? 4e-4 : 0),
    airM3: f.has('air_in_lines') ? 3e-6 : 0,
    assistGain: 5, assistCapN: f.has('vacuum_loss') ? 0 : 2400,
    muFactor: f.has('glazed_pads') ? 0.62 : 1,
    seized: f.has('seized_piston'),
    clampFactor: f.has('stuck_slide_pin') ? 0.6 : 1,
    dragN: f.has('stuck_slide_pin') ? 150 : f.has('seized_piston') ? 300 : 0,
    dtvM: f.has('warped_rotor') ? 5e-5 : 0,
    waterPct: f.has('contaminated_fluid') ? 3.7 : 0.5,
    wssFailed: f.has('wheel_speed_sensor_failure'),
    drumGapM: f.has('drum_adjuster_failure') ? 4e-4 : 0,
    worn: f.has('worn_pads'), pinStuck: f.has('stuck_slide_pin'),
  };
}

const bar = 1e-5;
function mkTrace(tier: SimTier, dt: number, n: number, ch: Record<string, [string, string]>, assumptions: string[]): Trace {
  const channels: Record<string, Float32Array> = {}; const units: Record<string, string> = {}; const labels: Record<string, string> = {};
  for (const k of Object.keys(ch)) { channels[k] = new Float32Array(n); labels[k] = ch[k][0]; units[k] = ch[k][1]; }
  return { tier, dt, n, channels, units, labels, events: [], assumptions, summary: {} };
}

// ---------- (a) brake apply: pedal -> booster -> master cylinder -> line -> caliper -> pad -> rotor ----------
export interface ApplyOpts { pedalN?: number }
export function runApply(faults: string[] = [], opts: ApplyOpts = {}): Trace {
  const P = paramsFor(faults);
  const peakPedal = opts.pedalN ?? 180;
  const dtOut = 0.01, dur = 2.0, n = Math.round(dur / dtOut);
  const tr = mkTrace('S1', dtOut, n, {
    pedal_force: ['Pedal force', 'N'], booster_out: ['Booster output force', 'N'], p_mc: ['Master cylinder pressure', 'bar'],
    p_line: ['Caliper pressure', 'bar'], clamp: ['Clamp force (faulted corner)', 'kN'], torque: ['Rotor torque (faulted corner)', 'N m'],
    pedal_travel: ['Pedal travel', 'mm'], piston_x: ['Caliper piston travel', 'mm'], pull: ['Brake imbalance (pull)', '%'],
  }, BRAKE_ASSUMPTIONS.apply);
  const Amc = Math.PI * 0.0111 ** 2, Acal = Math.PI * 0.02856 ** 2, reff = 0.115, mu0 = 0.42 * P.muFactor;
  const net = H.newNet();
  H.node(net, 'mc', 5e-14, 0); H.node(net, 'cal', 1e-13, 0); H.node(net, 'oth', 3e-13, 0);
  H.line(net, 'l1', 'mc', 'cal', 2e9); H.line(net, 'l2', 'mc', 'oth', 6e8);
  if (P.airM3 > 0) H.accum(net, 'air', 'cal', P.airM3, 1.01e5, 5e7);
  const mc = H.piston(net, { id: 'mcp', node: 'mc', area: -Amc, m: 0.3, c: 80, k: 3000, xmin: 0, xmax: 0.03 });
  const kc = 6e7;
  const cal = H.piston(net, { id: 'cal', node: 'cal', area: Acal, m: 0.15, c: 120, xmin: 0, xmax: 0.02, xc: P.gapM, kc });
  const oth = H.piston(net, { id: 'oth', node: 'oth', area: 3 * Acal, m: 0.45, c: 360, xmin: 0, xmax: 0.02, xc: 1.5e-4, kc: 3 * kc });
  if (P.seized) cal.xmax = P.gapM + 1e-5; // piston cannot move: no response to pressure
  let boost = 0; const hOut = 0.0025; let k = 0;
  const peakAt = (t: number) => (t < 0.3 ? peakPedal * (t / 0.3) : t < 1.4 ? peakPedal : t < 1.7 ? peakPedal * (1 - (t - 1.4) / 0.3) : 0);
  let pk = { p: 0, clamp: 0, travel: 0 };
  for (let i = 0; i < n * 4; i++) {
    const t = i * hOut, fp = peakAt(t), rod = fp * 4;
    const target = rod + Math.min(P.assistGain * rod, P.assistCapN);
    boost += (target - boost) * (1 - Math.exp(-hOut / 0.04));
    mc.fExt = boost;
    cal.xc = P.gapM + (P.dtvM > 0 ? P.dtvM * Math.sin(2 * Math.PI * 14 * t) : 0);
    H.step(net, hOut);
    if (i % 4 === 0) {
      const j = i / 4; if (j >= n) break;
      const nmc = net.nodes[0], ncal = net.nodes[1];
      const clampThis = (cal.x > cal.xc ? kc * (cal.x - cal.xc) : 0) * P.clampFactor;
      const clampOth = oth.x > 1.5e-4 ? kc * (oth.x - 1.5e-4) : 0;
      const travel = 5 + (mc.x * 1000) * 4 + (fp > 0 ? (fp / peakPedal) * 3 : 0);
      tr.channels.pedal_force[j] = fp; tr.channels.booster_out[j] = boost; tr.channels.p_mc[j] = nmc.p * bar; tr.channels.p_line[j] = ncal.p * bar;
      tr.channels.clamp[j] = clampThis / 1000; tr.channels.torque[j] = F.rotorTorque(clampThis, mu0, reff);
      tr.channels.pedal_travel[j] = fp > 0 || boost > 50 ? travel : 5; tr.channels.piston_x[j] = cal.x * 1000;
      tr.channels.pull[j] = clampOth > 100 ? ((clampOth - clampThis) / clampOth) * 100 : 0;
      if (nmc.p * bar > pk.p) pk.p = nmc.p * bar; if (clampThis > pk.clamp) pk.clamp = clampThis; if (tr.channels.pedal_travel[j] > pk.travel) pk.travel = tr.channels.pedal_travel[j];
      k = j;
    }
  }
  const hold = Array.from(tr.channels.pull.slice(70, 130)); const pull = hold.reduce((a, b) => a + b, 0) / hold.length; void k;
  tr.summary = { peakLinePressureBar: +pk.p.toFixed(1), peakClampKN: +(pk.clamp / 1000).toFixed(2), peakPedalTravelMm: +pk.travel.toFixed(1), peakPullPct: +pull.toFixed(1), tierNote: 'S1 force chain on an S2 hydraulic network' };
  if (P.worn) tr.events.push({ t: 0.1, label: 'Wear indicator contacts rotor: squeal', severity: 'warn' });
  if (P.assistCapN === 0) tr.events.push({ t: 0.2, label: 'No vacuum assist: pedal effort about 4x higher for the same pressure', severity: 'alert' });
  if (P.airM3 > 0) tr.events.push({ t: 0.3, label: 'Air bubble compresses: pedal sinks, pressure builds late', severity: 'warn' });
  if (P.seized) tr.events.push({ t: 0.3, label: 'Seized piston: this corner cannot clamp, vehicle pulls to the opposite side', severity: 'alert' });
  if (P.pinStuck) tr.events.push({ t: 0.3, label: 'Stuck slide pin: only one pad clamps, caliper cannot float', severity: 'warn' });
  if (P.dtvM > 0) tr.events.push({ t: 0.5, label: 'Thickness variation pushes the piston back each wheel turn: pedal pulsation', severity: 'warn' });
  return tr;
}

// ---------- (b) repeated hard stops: heat, fade, fluid boil ----------
export interface HeatOpts { stops?: number; fluid?: F.FluidType }
export function runHeat(faults: string[] = [], opts: HeatOpts = {}): Trace {
  const P = paramsFor(faults);
  const stops = opts.stops ?? 10, fluidType = opts.fluid ?? 'DOT4';
  const m = 1450, R = 0.31, reff = 0.115, Acal = Math.PI * 0.02856 ** 2;
  const dtOut = 0.1, hSim = 0.025;
  const vHi = 33.3, vLo = 6.9, accel = 3.0, pLine = 52e5;
  const boil = F.fluidBoilC(fluidType, P.waterPct);
  const perStop = (vHi - vLo) / 8 + (vHi - vLo) / accel;
  const dur = Math.ceil(stops * (perStop + 3));
  const n = Math.round(dur / dtOut);
  const tr = mkTrace('S2', dtOut, n, {
    speed: ['Vehicle speed', 'm/s'], decel: ['Deceleration', 'g'], p_line: ['Line pressure', 'bar'], mu: ['Pad friction coefficient', ''],
    T_rotor: ['Rotor', 'C'], T_pad: ['Pad', 'C'], T_caliper: ['Caliper', 'C'], T_fluid: ['Brake fluid', 'C'], boil: ['Fluid boiling point', 'C'],
    vapor: ['Vapor in caliper', ''], power: ['Friction power (corner)', 'kW'], braking: ['Braking', ''],
  }, BRAKE_ASSUMPTIONS.heat);
  const net = T.newTNet(25);
  const rotor = T.tnode(net, 'rotor', 8 * 460, 150), pad = T.tnode(net, 'pad', 600, 130), cal = T.tnode(net, 'cal', 1500, 95), fluid = T.tnode(net, 'fluid', 260, 85);
  T.tlink(net, 'rotor', 'pad', 45); T.tlink(net, 'pad', 'cal', 15); T.tlink(net, 'cal', 'fluid', 4);
  const aR = T.tamb(net, 'rotor', 7), aP = T.tamb(net, 'pad', 0.6), aC = T.tamb(net, 'cal', 2.5), aF = T.tamb(net, 'fluid', 0.2);
  const muRear = 0.38, tfCold = 2 * muRear; void tfCold;
  let v = vHi, braking = true, stopNo = 0, work = 0, boiled = false, lastDecel = 0, firstDecel = 0, peakR = 25, peakF = 25, fadeAt = -1;
  const decels: number[] = [];
  let sampleAcc = 0, j = 0, vapor = 0, peakStopT = 0;
  for (let t = 0; t < dur && j < n; t += hSim) {
    const airflow = 1 + v / 20;
    aR.G = 4 * airflow; aP.G = 0.6 * airflow; aC.G = 3.2 * (0.6 + 0.4 * airflow); aF.G = 0.2;
    vapor = Math.min(1, Math.max(0, (fluid.T - (boil - 5)) / 15));
    if (vapor > 0.5 && !boiled) { boiled = true; tr.events.push({ t, label: 'Fluid boils: vapor in the caliper, pedal goes long and soft', severity: 'alert' }); }
    const mu = F.muOfTemp(pad.T) * P.muFactor;
    if (fadeAt < 0 && mu < 0.8 * 0.42) { fadeAt = t; tr.events.push({ t, label: 'Pad fade: friction down 20 percent', severity: 'warn' }); }
    let tf = 0, drag = 0, aDec = 0;
    const omega = v / R;
    if (braking) {
      const eff = (1 - vapor * 0.85);
      const clamp = pLine * Acal * eff * P.clampFactor;
      tf = F.rotorTorque(clamp, mu, reff);
      const tr_ = F.rotorTorque(pLine * Acal * 0.45 * eff, muRear * P.muFactor, reff);
      const Fx = (2 * tf + 2 * tr_) / R;
      aDec = Fx / m + 0.3;
    }
    if (P.dragN > 0) drag = F.rotorTorque(P.dragN, mu, reff);
    const pw = (tf + drag) * omega;
    rotor.Q = 0.92 * pw; pad.Q = 0.08 * pw; work += pw * hSim;
    T.tstep(net, hSim);
    if (braking) { v -= aDec * hSim; lastDecel = aDec / 9.81; if (v <= vLo) { braking = false; stopNo++; decels.push(lastDecel); } }
    else { v += accel * hSim; if (v >= vHi) { if (stopNo >= stops) { v = vHi; } braking = stopNo < stops; } }
    if (rotor.T > peakR) peakR = rotor.T; if (fluid.T > peakF) peakF = fluid.T;
    if (stopNo === 1 && firstDecel === 0 && !braking) firstDecel = decels[0];
    sampleAcc += hSim;
    if (sampleAcc >= dtOut - 1e-9) {
      sampleAcc = 0; const c = tr.channels;
      c.speed[j] = v; c.decel[j] = braking ? lastDecel : 0; c.p_line[j] = braking ? pLine * bar : 0; c.mu[j] = mu;
      c.T_rotor[j] = rotor.T; c.T_pad[j] = pad.T; c.T_caliper[j] = cal.T; c.T_fluid[j] = fluid.T; c.boil[j] = boil; c.vapor[j] = vapor;
      c.power[j] = pw / 1000; c.braking[j] = braking ? 1 : 0; j++;
    }
    peakStopT = t;
  }
  // pad out the remainder with the final sample
  for (const k of Object.keys(tr.channels)) for (let q = j; q < n; q++) tr.channels[k][q] = tr.channels[k][Math.max(0, j - 1)];
  void peakStopT;
  const firstD = decels[0] ?? 0, lastD = decels[decels.length - 1] ?? 0;
  tr.summary = {
    stops: decels.length, firstStopDecelG: +firstD.toFixed(2), lastStopDecelG: +lastD.toFixed(2),
    decelLossPct: firstD > 0 ? +(((firstD - lastD) / firstD) * 100).toFixed(0) : 0,
    peakRotorC: +peakR.toFixed(0), peakFluidC: +peakF.toFixed(0), fluidBoilC: +boil.toFixed(0), fluidBoiled: boiled ? 'yes' : 'no',
    frictionEnergyKJ: +(work / 1000).toFixed(0),
  };
  tr.n = n; void firstDecel;
  if (peakF > boil - 15 && !boiled) tr.events.push({ t: dur * 0.9, label: 'Fluid within 15 C of boiling', severity: 'warn' });
  if (P.dragN > 0) tr.events.push({ t: 1, label: 'Dragging pad adds heat even when the pedal is up', severity: 'warn' });
  return tr;
}

// ---------- (c) ABS panic stop on a low-mu surface ----------
export interface AbsOpts { abs: boolean; surface?: string }
export const ABS_STATE = { APPLY: 0, HOLD: 1, RELEASE: 2 } as const;
export function runAbs(faults: string[] = [], opts: AbsOpts = { abs: true }): Trace {
  const P = paramsFor(faults);
  const sf = TIRE.SURFACES[opts.surface || 'snow'];
  const absOn = opts.abs && !P.wssFailed;
  const m = 400, J = 1.1, R = 0.31, Fz = m * 9.81, v0 = 25;
  const dtOut = 0.01, dur = 12, n = Math.round(dur / dtOut), h = 0.001;
  const tr = mkTrace('S1', dtOut, n, {
    v: ['Vehicle speed', 'm/s'], wheel: ['Wheel speed', 'm/s'], slip: ['Slip ratio', ''], p_wheel: ['Wheel caliper pressure', 'bar'],
    p_driver: ['Driver pressure', 'bar'], fx: ['Tire force', 'kN'], dist: ['Distance', 'm'], abs_state: ['ABS modulator state', ''], decel: ['Deceleration', 'g'],
  }, BRAKE_ASSUMPTIONS.abs);
  const Kb = 2 * 0.42 * P.muFactor * Math.PI * 0.02856 ** 2 * 0.115;
  const net = H.newNet();
  const drv = H.node(net, 'drv', 1, 0, true), whl = H.node(net, 'whl', 4e-13, 0), acc = H.node(net, 'acc', 1, 3e5, true);
  const inlet = H.orifice(net, 'in', 'drv', 'whl', 0.9e-6), outlet = H.orifice(net, 'out', 'whl', 'acc', 0.9e-6);
  void acc;
  let v = v0, w = v0 / R, x = 0, state: number = ABS_STATE.APPLY, tState = 0, pulseT = 0, stopT = -1;
  const sHi = 0.16, sLo = 0.08;
  const pDrv = (t: number) => 90e5 * Math.min(1, t / 0.15);
  let j = 0, sampleAcc = 0, cycles = 0;
  for (let t = 0; t < dur && j < n; t += h) {
    drv.p = pDrv(t);
    const s = Math.max(0, (v - w * R) / Math.max(v, 1.5));
    if (absOn) {
      tState += h;
      if (state === ABS_STATE.APPLY && s > sHi) { state = ABS_STATE.RELEASE; tState = 0; cycles++; }
      else if (state === ABS_STATE.RELEASE && s < sHi - 0.04 * 0.5 && tState > 0.015) { state = ABS_STATE.HOLD; tState = 0; }
      else if (state === ABS_STATE.HOLD && s < sLo && tState > 0.02) { state = ABS_STATE.APPLY; tState = 0; pulseT = 0; }
      else if (state === ABS_STATE.HOLD && s > sHi) { state = ABS_STATE.RELEASE; tState = 0; }
      if (state === ABS_STATE.APPLY) { pulseT += h; inlet.area = pulseT % 0.016 < 0.004 ? 0.9e-6 : 0; if (tState > 0.12 && s < sLo) inlet.area = 0.9e-6; }
      else inlet.area = 0;
      outlet.area = state === ABS_STATE.RELEASE ? 0.9e-6 : 0;
    } else { inlet.area = 0.9e-6; outlet.area = 0; state = ABS_STATE.APPLY; }
    H.step(net, h);
    const Tb = Kb * Math.max(0, whl.p);
    const mu = TIRE.mu(s, sf);
    const Fx = v > 0.3 ? mu * Fz : 0;
    w += ((Fx * R - Tb * (w > 0.05 ? 1 : 0) - (w <= 0.05 && Fx * R < Tb ? 0 : 0)) / J) * h;
    if (w < 0) w = 0;
    v -= (Fx / m) * h; if (v < 0) v = 0;
    x += v * h;
    if (v <= 0.3 && stopT < 0) { stopT = t; v = 0; w = 0; }
    sampleAcc += h;
    if (sampleAcc >= dtOut - 1e-9) {
      sampleAcc = 0; const c = tr.channels;
      c.v[j] = v; c.wheel[j] = w * R; c.slip[j] = v > 0.5 ? Math.max(0, 1 - (w * R) / v) : (j > 0 ? c.slip[j - 1] : 0);
      c.p_wheel[j] = whl.p * bar; c.p_driver[j] = drv.p * bar; c.fx[j] = Fx / 1000; c.dist[j] = x; c.abs_state[j] = absOn ? state : -1;
      c.decel[j] = Fx / m / 9.81; j++;
    }
  }
  for (const k of Object.keys(tr.channels)) for (let q = j; q < n; q++) tr.channels[k][q] = k === 'abs_state' ? -1 : tr.channels[k][Math.max(0, j - 1)];
  const sat = Math.max(...Array.from(tr.channels.decel).filter(d => isFinite(d)));
  tr.summary = {
    surface: sf.label, abs: absOn ? 'on' : (opts.abs && P.wssFailed ? 'off (sensor fault)' : 'off'),
    stoppingDistanceM: +x.toFixed(1), stopTimeS: +(stopT < 0 ? dur : stopT).toFixed(2), peakDecelG: +sat.toFixed(2), absCycles: cycles,
  };
  if (opts.abs && P.wssFailed) tr.events.push({ t: 0, label: 'ABS warning light: wheel speed signal lost, ABS disabled, brakes behave as conventional', severity: 'alert' });
  if (!absOn) tr.events.push({ t: 0.3, label: 'Wheel locks: steering authority lost, tire slides at reduced friction', severity: 'alert' });
  else tr.events.push({ t: 0.3, label: 'ABS holds slip near the tire peak and cycles the modulator valves', severity: 'info' });
  return tr;
}

export function runAbsCompare(faults: string[] = [], surface = 'snow') {
  return { withAbs: runAbs(faults, { abs: true, surface }), withoutAbs: runAbs(faults, { abs: false, surface }) };
}

// ---------- S0 disc vs drum comparison numbers ----------
export function brakeFactors(mu = 0.4) {
  return [
    { id: 'disc', label: 'Disc (pad pair)', factor: discFactor(mu), note: 'Not self-energising: output scales linearly with clamp force, stable and easy to modulate.' },
    { id: 'leading', label: 'Drum leading shoe', factor: leadingShoeFactor(mu), note: 'Self-energising: rotation wedges the shoe in. High gain, but sensitive to mu changes.' },
    { id: 'trailing', label: 'Drum trailing shoe', factor: trailingShoeFactor(mu), note: 'Self-de-energising: lower gain, more stable.' },
  ];
}
