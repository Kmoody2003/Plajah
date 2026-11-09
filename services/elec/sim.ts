// Our own circuit simulator: nodal analysis with Newton-Raphson for nonlinear parts and
// backward-Euler companion models for capacitors and inductors. Sources are Norton equivalents
// (voltage behind internal resistance), so every unknown is a node voltage.
//   DC operating point: capacitors open, inductors shorted.
//   Transient: power-up from rest (capacitors discharged), fixed time step.
// Models are generic and behavioural (555 thresholds, 7805 regulation and dropout); they are
// for design decisions and checks, not sign-off.

import { compByKind, ledColor, parseSi } from './components';
import { type Circuit, type CPart, netlist, type Netlist } from './circuit';
import { BOARD_INFO, PI_MODELS } from './boards';
import { MODULES, num as mnum } from './modules';

const VT = 0.025852; // thermal voltage at 27 °C
const GMIN = 1e-12;

export interface PartTrace { i: number[]; p: number[]; extra: Record<string, number[]> }
export interface SimResult {
  mode: 'dc' | 'tran'; time: number[]; nets: number[][]; netlist: Netlist;
  parts: Record<string, PartTrace>; warnings: string[]; converged: boolean;
  /** Measured switching frequency of each 555, Hz (transient only). */
  freq: Record<string, number>;
}
export interface SimOptions { mode: 'dc' | 'tran'; tEnd?: number; steps?: number; ambient?: number }

interface Ctx { A: Float64Array; b: Float64Array; n: number; v: Float64Array }
const idx = (node: number) => node - 1; // ground (0) is not an unknown

function stampG(c: Ctx, a: number, b: number, g: number) {
  if (a) c.A[idx(a) * c.n + idx(a)] += g; if (b) c.A[idx(b) * c.n + idx(b)] += g;
  if (a && b) { c.A[idx(a) * c.n + idx(b)] -= g; c.A[idx(b) * c.n + idx(a)] -= g; }
}
/** Current source pushing `i` amps from node a, through the source, into node b. */
function stampI(c: Ctx, a: number, b: number, i: number) { if (a) c.b[idx(a)] -= i; if (b) c.b[idx(b)] += i; }
/** Generic nonlinear device: currents I[t] flowing into the device at terminal nodes[t], with Jacobian J[t][u] = dI_t/dV_u. */
function stampDevice(c: Ctx, nodes: number[], I: number[], J: number[][]) {
  const V = nodes.map(nd => (nd ? c.v[idx(nd)] : 0));
  nodes.forEach((t, ti) => {
    if (!t) return; let rhs = I[ti];
    nodes.forEach((u, ui) => { rhs -= J[ti][ui] * V[ui]; if (u) c.A[idx(t) * c.n + idx(u)] += J[ti][ui]; });
    c.b[idx(t)] -= rhs;
  });
}

/** SPICE-style junction voltage limiting, so exponentials do not overflow between iterations. */
let limited = false;
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number) {
  const v0 = vnew;
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) { const arg = 1 + (vnew - vold) / vt; vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit; }
    else vnew = vt * Math.log(vnew / vt);
  }
  if (Math.abs(vnew - v0) > 1e-9) limited = true;
  return vnew;
}

function luSolve(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const a = A.slice(), x = b.slice(); const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(a[k * n + k]); for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (mx < 1e-30) return null; piv[k] = p;
    if (p !== k) { for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; } const t = x[k]; x[k] = x[p]; x[p] = t; }
    for (let i = k + 1; i < n; i++) { const m = (a[i * n + k] /= a[k * n + k]); if (m) { for (let j = k + 1; j < n; j++) a[i * n + j] -= m * a[k * n + j]; x[i] -= m * x[k]; } }
  }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j]; x[i] = s / a[i * n + i]; }
  return x;
}

interface PartState { kind: string; part: CPart; nodes: Record<string, number>; internal: number[]; ctl?: number[]; regMode?: string; vPrev?: number; iPrev?: number; q?: number; vd?: number[]; lastQ?: number; edges?: number[]; lag?: number; on?: number }

/** Board current: the parameter, or the Raspberry Pi model's typical draw when 'auto'. */
export function boardDraw(p: CPart): number {
  const raw = String(p.params.draw ?? 'auto');
  if (raw !== 'auto' && raw !== '') return parseSi(raw);
  if (p.kind === 'rpi') return PI_MODELS[String(p.params.model ?? 'Pi 5')]?.draw ?? 0.8;
  return BOARD_INFO[p.kind]?.draw ?? 0.05;
}
/** 0..1: how far a board's regulator is up, ramping over 0.4 V below its minimum supply. */
const boardOn = (kind: string, vsup: number) => { const vmin = kind === 'pico' ? 1.8 : kind === 'nano' ? 4 : 4.3; return Math.max(0, Math.min(1, (vsup - vmin + 0.4) / 0.4)); };
const highPins = (p: CPart) => new Set(String(p.params.high ?? '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean));

export function simulate(c: Circuit, o: SimOptions): SimResult {
  const nl = netlist(c); const warnings: string[] = [];
  if (!nl.hasGround) warnings.push('No ground symbol: node voltages are relative to an arbitrary node.');
  let nodeCount = nl.netCount; // nets 0..netCount-1; internal nodes appended
  const states: PartState[] = [];
  for (const p of c.parts) {
    const def = compByKind(p.kind); if (!def || p.kind === 'ground') continue;
    const nodes = nl.pinNet[p.id] ?? {}; const st: PartState = { kind: p.kind, part: p, nodes, internal: [] };
    if (p.kind === 'speaker') st.internal.push(nodeCount++);
    if (p.kind === 'pickup') { st.internal.push(nodeCount++); st.iPrev = 0; }
    if (p.kind === 'jack') st.vPrev = 0;
    if (BOARD_INFO[p.kind] || p.kind === 'amp' || p.kind === 'acdc' || MODULES[p.kind]?.model.reg) st.lag = 0;
    if (MODULES[p.kind]?.model.drives) st.ctl = MODULES[p.kind].model.drives!.map(() => 0);
    if (p.kind === 'ne555') { st.internal.push(nodeCount++); st.q = 1; st.lastQ = 1; st.edges = []; }
    if (p.kind === 'led' || p.kind === 'diode') st.vd = [0];
    if (p.kind === 'npn') st.vd = [0, 0];
    if (p.kind === 'capacitor' || p.kind === 'electrolytic') st.vPrev = 0;
    if (p.kind === 'inductor' || p.kind === 'speaker') st.iPrev = 0;
    states.push(st);
  }
  const n = Math.max(1, nodeCount - 1);
  const tran = o.mode === 'tran'; const tEnd = o.tEnd ?? 0.01; const steps = Math.max(1, Math.round(o.steps ?? 2000)); const dt = tran ? tEnd / steps : 0;
  const v = new Float64Array(n);
  const P = (p: CPart, k: string) => parseSi(p.params[k] ?? compByKind(p.kind)!.params.find(x => x.key === k)?.default ?? 0);
  const node = (st: PartState, pin: string) => st.nodes[pin] ?? 0;
  const V = (nd: number) => (nd ? v[idx(nd)] : 0);

  const diodeParams = (st: PartState) => {
    if (st.kind === 'led') { const vf = ledColor(String(st.part.params.color ?? 'red')).vf; const nn = 2; return { Is: 0.02 / (Math.exp(vf / (nn * VT)) - 1), nn }; }
    const rect = st.part.params.type === 'rectifier'; return rect ? { Is: 1e-9, nn: 1.8 } : { Is: 2.5e-9, nn: 1.75 };
  };

  // Assemble and solve one Newton iteration at time t.
  const assemble = (t: number, ctx: Ctx) => {
    ctx.A.fill(0); ctx.b.fill(0);
    for (let i = 0; i < n; i++) ctx.A[i * n + i] += GMIN;
    for (const st of states) {
      const p = st.part; const a = node(st, '1') || node(st, 'A') || node(st, '+'), bN = node(st, '2') || node(st, 'K') || node(st, '-');
      switch (st.kind) {
        case 'resistor': stampG(ctx, node(st, '1'), node(st, '2'), 1 / Math.max(1e-3, P(p, 'R'))); break;
        case 'potentiometer': { const R = Math.max(1e-3, P(p, 'R')), pos = Math.min(1, Math.max(0, Number(p.params.pos ?? 0.5))); stampG(ctx, node(st, '1'), node(st, 'W'), 1 / Math.max(0.1, R * pos)); stampG(ctx, node(st, 'W'), node(st, '2'), 1 / Math.max(0.1, R * (1 - pos))); break; }
        case 'switch': stampG(ctx, node(st, '1'), node(st, '2'), p.params.state === 'open' ? 1e-9 : 20); break;
        case 'fuse': stampG(ctx, node(st, '1'), node(st, '2'), 100); break;
        case 'capacitor': case 'electrolytic': {
          if (!tran) { stampG(ctx, a, bN, 1e-12); break; }
          const g = P(p, 'C') / dt; stampG(ctx, a, bN, g); stampI(ctx, bN, a, g * (st.vPrev ?? 0)); break;
        }
        case 'inductor': { if (!tran) { stampG(ctx, a, bN, 1e3); break; } const g = dt / P(p, 'L'); stampG(ctx, a, bN, g); stampI(ctx, a, bN, st.iPrev ?? 0); break; }
        case 'speaker': {
          const mid = st.internal[0]; stampG(ctx, node(st, '+'), mid, 1 / Math.max(0.1, P(p, 'R')));
          if (!tran) stampG(ctx, mid, node(st, '-'), 1e3); else { const g = dt / 1e-4; stampG(ctx, mid, node(st, '-'), g); stampI(ctx, mid, node(st, '-'), st.iPrev ?? 0); }
          break;
        }
        case 'battery': case 'coincell': case 'liion': case 'usb5v': case 'dcsupply': {
          const Rint = st.kind === 'usb5v' || st.kind === 'dcsupply' ? 0.05 : Math.max(0.01, P(p, 'Rint'));
          const plus = node(st, '+') || node(st, 'VBUS'), minus = node(st, '-') || node(st, 'GND');
          stampG(ctx, plus, minus, 1 / Rint); stampI(ctx, minus, plus, P(p, 'V') / Rint); break;
        }
        case 'mains': { const vr = P(p, 'Vrms'), f = P(p, 'f'); const vs = tran ? vr * Math.SQRT2 * Math.sin(2 * Math.PI * f * t) : 0; stampG(ctx, node(st, 'L'), node(st, 'N'), 10); stampI(ctx, node(st, 'N'), node(st, 'L'), vs * 10); break; }
        case 'led': case 'diode': {
          const { Is, nn } = diodeParams(st); const vt = nn * VT; const vcrit = vt * Math.log(vt / (Math.SQRT2 * Is));
          const vd = pnjlim(V(a) - V(bN), st.vd![0], vt, vcrit); st.vd![0] = vd;
          const e = Math.exp(Math.min(vd / vt, 80)); const id = Is * (e - 1), gd = Is / vt * e + GMIN;
          // Linearised at the limited voltage: I(V) = id + gd (V - vd).
          stampDevice(ctx, [a, bN], [id - gd * vd + gd * (V(a) - V(bN)), -(id - gd * vd + gd * (V(a) - V(bN)))], [[gd, -gd], [-gd, gd]]);
          break;
        }
        case 'npn': {
          const C = node(st, 'C'), B = node(st, 'B'), E = node(st, 'E'); const Is = 1e-14, bf = Math.max(1, Number(p.params.beta ?? 100)), br = 1;
          const vcrit = VT * Math.log(VT / (Math.SQRT2 * Is));
          const vbe = pnjlim(V(B) - V(E), st.vd![0], VT, vcrit), vbc = pnjlim(V(B) - V(C), st.vd![1], VT, vcrit); st.vd![0] = vbe; st.vd![1] = vbc;
          const e1 = Math.exp(Math.min(vbe / VT, 80)), e2 = Math.exp(Math.min(vbc / VT, 80));
          const ict = Is * (e1 - e2), ibe = Is / bf * (e1 - 1), ibc = Is / br * (e2 - 1);
          const gmf = Is / VT * e1, gmr = Is / VT * e2, gbe = Is / bf / VT * e1 + GMIN, gbc = Is / br / VT * e2 + GMIN;
          const Ic = ict - ibc, Ib = ibe + ibc;
          // Jacobian in (C, B, E) order, evaluated at the limited junction voltages.
          const J = [[gmr + gbc, gmf - gmr - gbc, -gmf], [-gbc, gbe + gbc, -gbe], [-(gmr + gbc) + gbc, -(gmf - gmr - gbc) - (gbe + gbc), gmf + gbe]];
          // Expand about the limited junction voltages, evaluated at the actual node voltages.
          const Vn = [V(C), V(B), V(E)]; const Vl = [V(B) - vbc, V(B), V(B) - vbe];
          const Ival = [Ic, Ib, -(Ic + Ib)].map((I0, ti) => I0 + J[ti].reduce((s, g, ui) => s + g * (Vn[ui] - Vl[ui]), 0));
          stampDevice(ctx, [C, B, E], Ival, J);
          break;
        }
        case 'nmos': {
          let D = node(st, 'D'), S = node(st, 'S'); const G = node(st, 'G');
          if (V(D) < V(S)) [D, S] = [S, D]; // symmetric device
          const vth = Number(p.params.vth ?? 2), K = 0.5, lam = 0.01; const vgs = V(G) - V(S), vds = V(D) - V(S); const vov = vgs - vth;
          let id = 0, gm = 0, gds = GMIN;
          if (vov > 0) { if (vds < vov) { id = K * (vov * vds - vds * vds / 2) * (1 + lam * vds); gm = K * vds * (1 + lam * vds); gds = K * (vov - vds) * (1 + lam * vds) + K * (vov * vds - vds * vds / 2) * lam + GMIN; } else { id = K / 2 * vov * vov * (1 + lam * vds); gm = K * vov * (1 + lam * vds); gds = K / 2 * vov * vov * lam + GMIN; } }
          stampDevice(ctx, [D, G, S], [id, 0, -id], [[gds, gm, -(gm + gds)], [0, 0, 0], [-gds, -gm, gm + gds]]);
          break;
        }
        case 'ne555': {
          const vcc = node(st, 'VCC'), gnd = node(st, 'GND'), out = node(st, 'OUT'), dis = node(st, 'DIS'), ctrl = node(st, 'CTRL'), x = st.internal[0];
          stampG(ctx, vcc, ctrl, 1 / 5000); stampG(ctx, ctrl, x, 1 / 5000); stampG(ctx, x, gnd, 1 / 5000); stampG(ctx, vcc, gnd, 1 / 3000); // divider and quiescent draw
          const G = 1 / 10; // output stage
          if (st.q) { stampG(ctx, vcc, out, G); stampI(ctx, out, vcc, 1.5 * G); } else { stampG(ctx, gnd, out, G); stampI(ctx, gnd, out, 0.1 * G); }
          stampG(ctx, dis, gnd, st.q ? 1e-9 : 1 / 10);
          break;
        }
        case 'signal': { const vs = tran ? P(p, 'Vpk') * Math.sin(2 * Math.PI * P(p, 'f') * t) : 0; const g = 1 / Math.max(1, P(p, 'Rout')); stampG(ctx, node(st, '+'), node(st, '-'), g); stampI(ctx, node(st, '-'), node(st, '+'), vs * g); break; }
        case 'pickup': {
          // EMF behind the coil resistance, then the coil inductance.
          const hum = p.params.type !== 'single'; const R = hum ? 8000 : 6000, Lh = hum ? 4 : 2.5; const mid = st.internal[0];
          const vs = tran ? P(p, 'Vpk') * Math.sin(2 * Math.PI * P(p, 'f') * t) : 0; stampG(ctx, node(st, '-'), mid, 1 / R); stampI(ctx, node(st, '-'), mid, vs / R);
          if (!tran) stampG(ctx, mid, node(st, '+'), 1e3); else { const g = dt / Lh; stampG(ctx, mid, node(st, '+'), g); stampI(ctx, mid, node(st, '+'), st.iPrev ?? 0); }
          break;
        }
        case 'jack': { stampG(ctx, node(st, 'T'), node(st, 'S'), 1 / Math.max(1, P(p, 'Rin'))); if (tran) { const g = P(p, 'Cc') / dt; stampG(ctx, node(st, 'T'), node(st, 'S'), g); stampI(ctx, node(st, 'S'), node(st, 'T'), g * (st.vPrev ?? 0)); } break; }
        case 'usbload': { const nV = node(st, 'VBUS'), nG = node(st, 'GND'); stampG(ctx, nV, nG, P(p, 'I') / 5); break; }
        case 'ledstrip': { const Vs = P(p, 'V'); stampG(ctx, node(st, '+'), node(st, '-'), P(p, 'W') / (Vs * Vs)); break; }
        case 'acdc': {
          const plus = node(st, '+'), minus = node(st, '-'); const G = 1 / 0.05; stampG(ctx, plus, minus, G); stampI(ctx, minus, plus, P(p, 'V') * G);
          stampG(ctx, node(st, 'L'), node(st, 'N'), 1e-5); break;
        }
        case 'amp': {
          const VCC = node(st, 'VCC'), GN = node(st, 'GND'), IN = node(st, 'IN'), OP = node(st, 'OUT+'), OM = node(st, 'OUT-');
          stampG(ctx, IN, GN, 1e-4); stampI(ctx, VCC, GN, 0.004 + (st.lag ?? 0));
          const k = P(p, 'gain') / 2; const G = 1 / 0.3; const vcc = V(VCC) - V(GN);
          for (const [out, sgn] of [[OP, 1], [OM, -1]] as Array<[number, number]>) {
            const target = V(GN) + vcc / 2 + sgn * k * (V(IN) - V(GN)); const lo = V(GN) + 0.05, hi = V(GN) + Math.max(0.1, vcc - 0.05);
            const nodes = [out, IN, VCC, GN];
            if (target > lo && target < hi) {
              // Current into the device at OUT = G (V_out - target); returned through GND.
              const row = [G, -G * sgn * k, -G / 2, -G / 2 + G * sgn * k];
              const I0 = G * (V(out) - target);
              stampDevice(ctx, nodes, [I0, 0, 0, -I0], [row, [0, 0, 0, 0], [0, 0, 0, 0], row.map(x => -x)]);
            } else {
              const clampV = target <= lo ? 0.05 : Math.max(0.1, vcc - 0.05); const I0 = G * (V(out) - V(GN) - clampV);
              stampDevice(ctx, nodes, [I0, 0, 0, -I0], [[G, 0, 0, -G], [0, 0, 0, 0], [0, 0, 0, 0], [-G, 0, 0, G]]);
            }
          }
          break;
        }
        case 'pico': case 'esp32': case 'esp32s3': case 'nano': case 'rpi': {
          const info = BOARD_INFO[st.kind]; const GN = node(st, 'GND'); let PW = node(st, info.power);
          if (st.kind === 'pico') { stampG(ctx, node(st, 'VBUS'), node(st, 'VSYS'), 2); if (!PW) PW = node(st, 'VBUS'); }
          const vsup = V(PW) - V(GN); const on = boardOn(st.kind, vsup); st.on = on; // ramps on, so Newton sees a continuous source
          // Board draw (soft-started so an unpowered board is not a current source) plus regulator load, lagged.
          stampI(ctx, PW, GN, boardDraw(p) * Math.tanh(Math.max(0, vsup)) + (st.lag ?? 0));
          const r33 = node(st, '3V3');
          if (r33) { stampG(ctx, r33, GN, 10); stampI(ctx, GN, r33, 3.3 * 10 * on); }
          const hi = highPins(p); const vlogic = info.logic;
          for (const g of info.gpio) { const nd = node(st, g); if (!nd) continue; if (hi.has(g.toUpperCase())) { stampG(ctx, nd, GN, 1 / 40); stampI(ctx, GN, nd, vlogic / 40 * on); } else stampG(ctx, nd, GN, 1e-6); }
          break;
        }
        case 'reg7805': {
          const IN = node(st, 'IN'), GN = node(st, 'GND'), OUT = node(st, 'OUT'); const G = 1 / 0.05;
          const headroom = V(IN) - V(GN);
          // Regulating: OUT follows GND + 5 V; in dropout: OUT follows IN - 2 V. It sources current only.
          const target = headroom >= 7 ? { from: GN, off: 5 } : { from: IN, off: -2 };
          const iOut = G * (V(target.from) + target.off - V(OUT));
          if (iOut > 0 || Math.abs(iOut) < 1e-9) {
            // I = G (V_from + off - V_out), drawn from IN, delivered to OUT.
            const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // rows: IN, GND, OUT (current into device)
            const col = (nd: number) => (nd === IN ? 0 : nd === GN ? 1 : 2);
            J[0][col(target.from)] += G; J[0][2] -= G; J[2][col(target.from)] -= G; J[2][2] += G;
            stampDevice(ctx, [IN, GN, OUT], [iOut, 0, -iOut], J);
          }
          stampI(ctx, IN, GN, 0.005); // quiescent current
          break;
        }
        default: if (MODULES[st.kind]) stampModule(st, ctx);
      }
    }
  };

  // Breakout modules (modules.ts): data-driven draw, rails, pull-ups, links and driven outputs.
  const stampModule = (st: PartState, ctx: Ctx) => {
    const m = MODULES[st.kind].model; const pp = st.part.params; const nd = (pin: string) => node(st, pin);
    if (m.draw) { const a = nd(m.draw.pwr), g = nd(m.draw.gnd); stampI(ctx, a, g, m.draw.A(pp) * Math.tanh(Math.max(0, V(a) - V(g)))); }
    for (const l of m.links ?? []) stampG(ctx, nd(l.a), nd(l.b), 1 / Math.max(1e-3, l.R(pp)));
    for (const u of m.pullups ?? []) stampG(ctx, nd(u.pin), nd(u.to), 1 / u.R);
    for (const u of m.inputs ?? []) stampG(ctx, nd(u.pin), nd(u.gnd), 1 / u.R);
    (m.drives ?? []).forEach((d, k) => {
      const out = nd(d.pin), sup = nd(d.sup), g = nd(d.gnd); if (!out) return; const G = 1 / d.R;
      const f = d.ctrl ? st.ctl![k] : (d.frac?.(pp) ?? 1);
      // Current into the device at `out` = G (Vout − Vg − f (Vsup − Vg)); it returns through the supply when driving high, ground when low.
      const row = [G, -G * f, -G * (1 - f)]; const I0 = G * (V(out) - V(g) - f * (V(sup) - V(g)));
      const back = f > 0.5 ? 1 : 2; const rows = [row, [0, 0, 0], [0, 0, 0]]; rows[back] = row.map(x => -x); const I = [I0, 0, 0]; I[back] = -I0;
      stampDevice(ctx, [out, sup, g], I, rows);
    });
    if (m.reg) {
      const r = m.reg; const vi = nd(r.vin), vo = nd(r.vout), g = nd(r.gnd); const G = 20; const vset = r.V(pp), drop = r.dropout(pp); const vin = V(vi) - V(g);
      const mode = r.boost ? (vin < (r.vinMin ?? 0) ? 'off' : vin - drop > vset ? 'drop' : 'reg') : (vin - drop >= vset ? 'reg' : vin - drop > 0 ? 'drop' : 'off'); st.regMode = mode;
      if (mode === 'reg') { const I0 = G * (V(vo) - V(g) - vset); stampDevice(ctx, [vo, g], [I0, -I0], [[G, -G], [-G, G]]); stampI(ctx, vi, g, st.lag ?? 0); }
      else if (mode === 'drop') { const I0 = G * (V(vo) - V(vi) + drop); stampDevice(ctx, [vo, vi], [I0, -I0], [[G, -G], [-G, G]]); }
      else stampG(ctx, vo, g, 1e-3);
    }
  };
  const moduleLag = (st: PartState) => {
    const m = MODULES[st.kind].model; const pp = st.part.params; const nd = (pin: string) => node(st, pin);
    (m.drives ?? []).forEach((d, k) => { if (d.ctrl) { const vc = V(nd(d.ctrl)) - V(nd(d.gnd)); st.ctl![k] = 1 / (1 + Math.exp(-(vc - 1.5) / 0.1)); } });
    if (m.reg) {
      const r = m.reg; const vi = nd(r.vin), vo = nd(r.vout), g = nd(r.gnd); const vset = r.V(pp); const vin = V(vi) - V(g);
      const iout = st.regMode === 'reg' ? Math.max(0, -20 * (V(vo) - V(g) - vset)) : 0;
      const want = st.regMode !== 'reg' ? 0 : r.eff ? iout * vset / (r.eff(pp) * Math.max(vin, r.boost ? 2 : 3)) : iout + 0.0001;
      st.lag = 0.5 * (st.lag ?? 0) + 0.5 * want;
    }
  };

  // Lagged supply currents: power a module delivers is drawn from its supply pin (fixed-point updated).
  const updateLags = () => {
    for (const st of states) {
      if (MODULES[st.kind]) { moduleLag(st); continue; }
      if (st.lag === undefined) continue; const p = st.part;
      if (st.kind === 'amp') {
        const GN = node(st, 'GND'), IN = node(st, 'IN'), VCC = node(st, 'VCC'); const vcc = V(VCC) - V(GN); const k = P(p, 'gain') / 2; let pout = 0;
        for (const [out, sgn] of [[node(st, 'OUT+'), 1], [node(st, 'OUT-'), -1]] as Array<[number, number]>) { const tgt = Math.min(Math.max(vcc / 2 + sgn * k * (V(IN) - V(GN)), 0.05), Math.max(0.1, vcc - 0.05)); const iOut = -(V(out) - V(GN) - tgt) / 0.3; pout += Math.max(0, iOut * (V(out) - V(GN))); }
        st.lag = 0.5 * (st.lag ?? 0) + 0.5 * (vcc > 0.5 ? pout / (0.85 * Math.max(vcc, 2.5)) : 0);
      } else if (BOARD_INFO[st.kind]) {
        const info = BOARD_INFO[st.kind]; const GN = node(st, 'GND'); let PW = node(st, info.power); if (st.kind === 'pico' && !PW) PW = node(st, 'VBUS');
        const vsup = V(PW) - V(GN); if (vsup < 1) { st.lag = 0; continue; }
        const on = st.on ?? 0; // the source strength this solve actually used
        // Current the board's own sources deliver (the source is scaled by `on`, so is this).
        const r33 = node(st, '3V3'); let pw = r33 ? Math.max(0, (3.3 * on - (V(r33) - V(GN))) * 10) * 3.3 : 0;
        const hi = highPins(p); for (const g of info.gpio) { const nd = node(st, g); if (nd && hi.has(g.toUpperCase())) pw += Math.max(0, (info.logic * on - (V(nd) - V(GN))) / 40) * info.logic; }
        // Divide by at least the minimum operating voltage: dividing by a collapsing supply diverges.
        st.lag = 0.5 * (st.lag ?? 0) + 0.5 * pw / (0.85 * Math.max(vsup, st.kind === 'pico' ? 3 : 4.5));
      }
    }
  };
  const ctx: Ctx = { A: new Float64Array(n * n), b: new Float64Array(n), n, v };
  const solveAt = (t: number): boolean => {
    for (let it = 0; it < 150; it++) {
      limited = false; assemble(t, ctx); const x = luSolve(ctx.A, ctx.b, n); if (!x) return false;
      let delta = 0; for (let i = 0; i < n; i++) { const d = Math.abs(x[i] - v[i]); if (d > delta) delta = d; }
      // Damp very large jumps; junction limiting handles the exponentials.
      const k = delta > 50 ? 50 / delta : 1; for (let i = 0; i < n; i++) v[i] += (x[i] - v[i]) * k;
      updateLags();
      if (delta < 1e-7 + 1e-6 * Math.max(...Array.from(v, Math.abs), 1) && it > 0 && !limited) return true;
    }
    return false;
  };

  const time: number[] = []; const nets: number[][] = Array.from({ length: nl.netCount }, () => []);
  const traces: Record<string, PartTrace> = {}; for (const st of states) traces[st.part.id] = { i: [], p: [], extra: {} };
  let converged = true;
  const record = (t: number) => {
    time.push(t); for (let k = 0; k < nl.netCount; k++) nets[k].push(V(k));
    for (const st of states) {
      const tr = traces[st.part.id]; const p = st.part; let i = 0, pw = 0;
      const a = node(st, '1') || node(st, 'A') || node(st, '+'), bN = node(st, '2') || node(st, 'K') || node(st, '-'); const vab = V(a) - V(bN);
      const ex = (k: string, val: number) => { (tr.extra[k] ??= []).push(val); };
      switch (st.kind) {
        case 'resistor': { const R = Math.max(1e-3, P(p, 'R')); i = vab / R; pw = i * i * R; break; }
        case 'potentiometer': { const R = Math.max(1e-3, P(p, 'R')), pos = Number(p.params.pos ?? 0.5); const i1 = (V(node(st, '1')) - V(node(st, 'W'))) / Math.max(0.1, R * pos), i2 = (V(node(st, 'W')) - V(node(st, '2'))) / Math.max(0.1, R * (1 - pos)); i = Math.max(Math.abs(i1), Math.abs(i2)); pw = i1 * i1 * R * pos + i2 * i2 * R * (1 - pos); break; }
        case 'switch': i = vab * (p.params.state === 'open' ? 1e-9 : 20); pw = i * vab; break;
        case 'fuse': i = vab * 100; pw = i * vab; break;
        case 'capacitor': case 'electrolytic': i = tran ? P(p, 'C') / dt * (vab - (st.vPrev ?? 0)) : 0; ex('v', vab); break;
        case 'inductor': i = tran ? (st.iPrev ?? 0) + dt / P(p, 'L') * vab : vab * 1e3; break;
        case 'speaker': { const mid = st.internal[0]; i = (V(node(st, '+')) - V(mid)) / Math.max(0.1, P(p, 'R')); pw = i * i * P(p, 'R'); break; }
        case 'battery': case 'coincell': case 'liion': case 'usb5v': case 'dcsupply': { const Rint = st.kind === 'usb5v' || st.kind === 'dcsupply' ? 0.05 : Math.max(0.01, P(p, 'Rint')); const plus = node(st, '+') || node(st, 'VBUS'), minus = node(st, '-') || node(st, 'GND'); const vt = V(plus) - V(minus); i = (P(p, 'V') - vt) / Rint; pw = vt * i; ex('v', vt); break; }
        case 'mains': { i = 0; break; }
        case 'led': case 'diode': { const { Is, nn } = diodeParams(st); i = Is * (Math.exp(Math.min(vab / (nn * VT), 80)) - 1); pw = i * vab; ex('vr', -vab); break; }
        case 'npn': { const C = node(st, 'C'), B = node(st, 'B'), E = node(st, 'E'); const Is = 1e-14, bf = Number(p.params.beta ?? 100); const e1 = Math.exp(Math.min((V(B) - V(E)) / VT, 80)), e2 = Math.exp(Math.min((V(B) - V(C)) / VT, 80)); const ic = Is * (e1 - e2) - Is * (e2 - 1), ib = Is / bf * (e1 - 1) + Is * (e2 - 1); i = ic; pw = ic * (V(C) - V(E)) + ib * (V(B) - V(E)); ex('vce', V(C) - V(E)); ex('ib', ib); break; }
        case 'nmos': { const D = node(st, 'D'), S = node(st, 'S'), G = node(st, 'G'); const vth = Number(p.params.vth ?? 2); const vgs = V(G) - V(S), vds = V(D) - V(S), vov = vgs - vth; const K = 0.5; i = vov <= 0 ? 0 : vds < vov ? K * (vov * vds - vds * vds / 2) : K / 2 * vov * vov; pw = i * vds; ex('vds', vds); break; }
        case 'ne555': { ex('q', st.q ?? 0); i = (V(node(st, 'VCC')) - V(node(st, 'GND'))) / 3000; pw = i * (V(node(st, 'VCC')) - V(node(st, 'GND'))); break; }
        case 'reg7805': { const IN = node(st, 'IN'), GN = node(st, 'GND'), OUT = node(st, 'OUT'); const headroom = V(IN) - V(GN); const tgt = headroom >= 7 ? V(GN) + 5 : V(IN) - 2; i = Math.max(0, (tgt - V(OUT)) / 0.05); pw = i * (V(IN) - V(OUT)) + 0.005 * headroom; ex('vin', headroom); ex('vout', V(OUT) - V(GN)); break; }
        case 'signal': i = 0; break;
        case 'pickup': i = st.iPrev ?? 0; break;
        case 'jack': { const vt = V(node(st, 'T')) - V(node(st, 'S')); i = vt / Math.max(1, P(p, 'Rin')); ex('v', vt); break; }
        case 'usbload': { const vv = V(node(st, 'VBUS')) - V(node(st, 'GND')); i = vv * P(p, 'I') / 5; pw = vv * i; ex('v', vv); break; }
        case 'ledstrip': { const Vs = P(p, 'V'); i = vab * P(p, 'W') / (Vs * Vs); pw = i * vab; break; }
        case 'acdc': { const plus = node(st, '+'), minus = node(st, '-'); const vo = V(plus) - V(minus); i = (P(p, 'V') - vo) / 0.05; pw = vo * i; ex('v', vo); ex('pin', pw / Math.max(0.3, P(p, 'eff'))); break; }
        case 'amp': { const OP = node(st, 'OUT+'), OM = node(st, 'OUT-'), GN = node(st, 'GND'); const vd = V(OP) - V(OM); ex('vout', vd); ex('vcc', V(node(st, 'VCC')) - V(GN)); i = 0.004 + (st.lag ?? 0); pw = i * (V(node(st, 'VCC')) - V(GN)); break; }
        case 'pico': case 'esp32': case 'esp32s3': case 'nano': case 'rpi': {
          const info = BOARD_INFO[st.kind]; const GN = node(st, 'GND'); let PW = node(st, info.power); if (st.kind === 'pico' && !PW) PW = node(st, 'VBUS');
          const vsup = V(PW) - V(GN); i = boardDraw(p) * Math.tanh(Math.max(0, vsup)) + (st.lag ?? 0); pw = i * vsup; ex('vsup', vsup);
          const on = boardOn(st.kind, vsup); const r33 = node(st, '3V3'); ex('i3v3', r33 ? Math.max(0, (3.3 * on - (V(r33) - V(GN))) * 10) : 0);
          for (const g of info.gpio) { const nd = node(st, g); if (!nd) continue; const hi = highPins(p).has(g.toUpperCase()); ex(`gpio:${g}`, hi ? (info.logic * on - (V(nd) - V(GN))) / 40 : (V(nd) - V(GN)) * 1e-6); }
          break;
        }
        default: {
          const info = MODULES[st.kind]; if (!info) break; const m = info.model; const nd = (pin: string) => node(st, pin); const pp = p.params;
          if (info.supply) { const vs = V(nd(info.supply.pin)) - V(nd(info.supply.gnd)); ex('vsup', vs); }
          if (m.draw) { const vs = V(nd(m.draw.pwr)) - V(nd(m.draw.gnd)); i += m.draw.A(pp) * Math.tanh(Math.max(0, vs)); pw += i * vs; }
          for (const l of m.links ?? []) { const vl = V(nd(l.a)) - V(nd(l.b)); const il = vl / Math.max(1e-3, l.R(pp)); ex(`link:${l.a}`, il); if (st.kind === 'dcmotor' || st.kind === 'relay') { i += Math.abs(il); pw += Math.abs(il * vl); } }
          (m.drives ?? []).forEach((d, k) => { const f = d.ctrl ? st.ctl![k] : (d.frac?.(pp) ?? 1); ex(`out:${d.pin}`, -(V(nd(d.pin)) - V(nd(d.gnd)) - f * (V(nd(d.sup)) - V(nd(d.gnd)))) / d.R); });
          if (m.reg) {
            const r = m.reg; const vin = V(nd(r.vin)) - V(nd(r.gnd)), vout = V(nd(r.vout)) - V(nd(r.gnd)); const vset = r.V(pp);
            const iout = st.regMode === 'reg' ? Math.max(0, -20 * (vout - vset)) : st.regMode === 'drop' ? Math.max(0, -20 * (V(nd(r.vout)) - V(nd(r.vin)) + r.dropout(pp))) : 0;
            const iin = st.regMode === 'reg' ? (st.lag ?? 0) : iout; ex('vin', vin); ex('vout', vout); ex('iout', iout); ex('iin', iin);
            i = iout; pw = Math.max(0, vin * iin - vout * iout);
          }
          void mnum;
          break;
        }
      }
      tr.i.push(i); tr.p.push(pw);
    }
  };

  // Accept a step: update capacitor/inductor memory and 555 flip-flops.
  const accept = (t: number) => {
    for (const st of states) {
      const p = st.part; const a = node(st, '1') || node(st, 'A') || node(st, '+'), bN = node(st, '2') || node(st, 'K') || node(st, '-');
      if (st.kind === 'capacitor' || st.kind === 'electrolytic') st.vPrev = V(a) - V(bN);
      if (st.kind === 'inductor') st.iPrev = (st.iPrev ?? 0) + dt / P(p, 'L') * (V(a) - V(bN));
      if (st.kind === 'speaker') { const mid = st.internal[0]; st.iPrev = (st.iPrev ?? 0) + dt / 1e-4 * (V(mid) - V(node(st, '-'))); }
      if (st.kind === 'pickup') { const mid = st.internal[0]; st.iPrev = (st.iPrev ?? 0) + dt / (p.params.type !== 'single' ? 4 : 2.5) * (V(mid) - V(node(st, '+'))); }
      if (st.kind === 'jack') st.vPrev = V(node(st, 'T')) - V(node(st, 'S'));
      if (st.kind === 'ne555') {
        const gnd = V(node(st, 'GND')); const upper = V(node(st, 'CTRL')) - gnd, lower = V(st.internal[0]) - gnd;
        const trig = V(node(st, 'TRIG')) - gnd, thr = V(node(st, 'THR')) - gnd; const reset = node(st, 'RESET') ? V(node(st, 'RESET')) - gnd : 99;
        const prev = st.q ?? 1;
        if (reset < 0.7) st.q = 0; else if (trig < lower) st.q = 1; else if (thr > upper) st.q = 0;
        if (prev === 0 && st.q === 1) st.edges!.push(t);
      }
    }
  };

  if (!tran) {
    converged = solveAt(0); record(0);
  } else {
    for (let s = 0; s <= steps; s++) {
      const t = s * dt;
      if (s > 0 && !solveAt(t)) { converged = false; warnings.push(`Did not converge at t = ${t.toPrecision(3)} s; results stop there.`); break; }
      if (s === 0) solveAt(0);
      record(t); accept(t);
    }
  }
  if (!converged && !tran) warnings.push('The DC operating point did not converge.');
  const freq: Record<string, number> = {};
  for (const st of states) if (st.kind === 'ne555' && st.edges && st.edges.length >= 3) { const e = st.edges; const k = Math.min(e.length - 1, 6); freq[st.part.id] = k / (e[e.length - 1] - e[e.length - 1 - k]); }
  return { mode: o.mode, time, nets, netlist: nl, parts: traces, warnings, converged, freq };
}
