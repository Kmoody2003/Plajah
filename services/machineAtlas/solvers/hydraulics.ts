// S1/S2 hydraulic network: nodes (compliance), lines (resistance), orifices, pistons, gas accumulators.
// Fixed-step integrator with automatic sub-stepping. Volume is conserved by construction:
// every flow leaves one element and enters another in the same update.
export const TIER = 'S2' as const;
export const ASSUMPTIONS: string[] = [
  'Incompressible fluid lumped into pressure nodes with an EFFECTIVE compliance (fluid + hose expansion + caliper/pad deflection).',
  'Laminar line resistance and a regularised sharp-edge orifice (no cavitation, no fluid inertia, no viscosity change with temperature).',
  'Free air is modelled as an isothermal gas bubble. No dissolved gas; vapor from boiling is a flag set by the caller.',
  'Fixed-step semi-implicit integration, sub-stepped for stability. Illustrative magnitudes, not a calibrated vehicle model.',
];

export interface HNode { id: string; C: number; p: number; fixed?: boolean; /** extra inflow (m3/s) applied this step */ qExt?: number }
export interface HLine { id: string; a: string; b: string; R: number }
export interface HOrifice { id: string; a: string; b: string; Cd: number; area: number; rho: number; eps: number }
export interface HPiston {
  id: string; node: string; area: number; x: number; v: number; m: number; c: number; k: number; x0: number;
  xmin: number; xmax: number; /** external force on +x (N), set by the caller each step */ fExt: number;
  /** contact wall: beyond xc a stiff spring kc pushes back (pad on rotor). Infinity disables. */
  xc: number; kc: number;
}
export interface HAccum { id: string; node: string; V0: number; p0: number; vol: number; R: number }
export interface HNet {
  nodes: HNode[]; lines: HLine[]; orifices: HOrifice[]; pistons: HPiston[]; accums: HAccum[];
  /** cumulative volume (m3) that flowed INTO fixed-pressure nodes (left the circuit). */
  expelled: number;
  time: number;
}

export const newNet = (): HNet => ({ nodes: [], lines: [], orifices: [], pistons: [], accums: [], expelled: 0, time: 0 });

export const node = (net: HNet, id: string, C: number, p = 0, fixed = false): HNode => {
  const n: HNode = { id, C, p, fixed, qExt: 0 }; net.nodes.push(n); return n;
};
export const line = (net: HNet, id: string, a: string, b: string, R: number): HLine => {
  const l = { id, a, b, R }; net.lines.push(l); return l;
};
export const orifice = (net: HNet, id: string, a: string, b: string, area: number, Cd = 0.7, rho = 1050, eps = 1e4): HOrifice => {
  const o = { id, a, b, Cd, area, rho, eps }; net.orifices.push(o); return o;
};
export const piston = (net: HNet, o: Partial<HPiston> & { id: string; node: string; area: number }): HPiston => {
  const p: HPiston = { x: 0, v: 0, m: 0.2, c: 50, k: 0, x0: 0, xmin: -Infinity, xmax: Infinity, fExt: 0, xc: Infinity, kc: 0, ...o };
  net.pistons.push(p); return p;
};
export const accum = (net: HNet, id: string, nodeId: string, V0: number, p0: number, R = 1e6): HAccum => {
  const a = { id, node: nodeId, V0, p0, vol: 0, R }; net.accums.push(a); return a;
};

/** Gas pressure of an isothermal bubble that has been compressed by `vol` of liquid. */
export const accumPressure = (a: HAccum) => (a.p0 * a.V0) / Math.max(a.V0 - a.vol, a.V0 * 0.02);

export const orificeFlow = (o: HOrifice, dp: number) =>
  o.Cd * o.area * Math.sqrt(2 / o.rho) * dp / Math.sqrt(Math.abs(dp) + o.eps);

/** Largest stable sub-step (s), with a safety factor on each node's local time constant. */
export function stableDt(net: HNet): number {
  let dt = 1e-3;
  const acc = new Map<string, number>();
  const add = (id: string, g: number) => acc.set(id, (acc.get(id) || 0) + g);
  for (const l of net.lines) { const g = 1 / Math.max(l.R, 1e-9); add(l.a, g); add(l.b, g); }
  for (const o of net.orifices) {
    const g = (o.Cd * o.area * Math.sqrt(2 / o.rho)) / Math.sqrt(o.eps); add(o.a, g); add(o.b, g);
  }
  for (const a of net.accums) add(a.node, 1 / Math.max(a.R, 1e-9));
  for (const n of net.nodes) {
    if (n.fixed) continue;
    const g = acc.get(n.id) || 0;
    if (g > 0) dt = Math.min(dt, 0.4 * n.C / g);
  }
  for (const p of net.pistons) {
    const n = net.nodes.find(q => q.id === p.node);
    const C = n ? n.C : 1e-12;
    const kEff = p.k + (isFinite(p.kc) ? p.kc : 0);
    const w = Math.sqrt((p.area * p.area / C + kEff) / p.m);
    dt = Math.min(dt, 0.5 / Math.max(w, 1));
    if (p.c > 0) dt = Math.min(dt, 0.4 * p.m / p.c);
  }
  return dt;
}

/** Total fluid volume bookkeeping (m3). Constant in a closed network (expelled accounts for fixed nodes). */
export function storedVolume(net: HNet): number {
  let v = 0;
  for (const n of net.nodes) if (!n.fixed) v += n.C * n.p;
  for (const p of net.pistons) v += p.area * p.x;
  for (const a of net.accums) v += a.vol;
  return v + net.expelled;
}

/** Advance by dt seconds (sub-stepped). Piston fExt / orifice area / fixed-node p may be changed between calls. */
export function step(net: HNet, dt: number, maxSub = 20000): void {
  const h0 = stableDt(net);
  let nsub = Math.ceil(dt / h0); if (nsub > maxSub) nsub = maxSub; if (nsub < 1) nsub = 1;
  const h = dt / nsub;
  const idx = new Map<string, number>(); net.nodes.forEach((n, i) => idx.set(n.id, i));
  const N = net.nodes.length, q = new Float64Array(N);
  const la = net.lines.map(l => idx.get(l.a)!), lb = net.lines.map(l => idx.get(l.b)!);
  const oa = net.orifices.map(o => idx.get(o.a)!), ob = net.orifices.map(o => idx.get(o.b)!);
  const ai = net.accums.map(a => idx.get(a.node)!), pi_ = net.pistons.map(p => idx.get(p.node)!);
  const nodes = net.nodes;
  for (let s = 0; s < nsub; s++) {
    q.fill(0);
    for (let i = 0; i < la.length; i++) {
      const f = (nodes[la[i]].p - nodes[lb[i]].p) / net.lines[i].R; q[la[i]] -= f; q[lb[i]] += f;
    }
    for (let i = 0; i < oa.length; i++) {
      const f = orificeFlow(net.orifices[i], nodes[oa[i]].p - nodes[ob[i]].p); q[oa[i]] -= f; q[ob[i]] += f;
    }
    for (let i = 0; i < ai.length; i++) {
      const ac = net.accums[i];
      const f = (nodes[ai[i]].p - accumPressure(ac)) / ac.R; // liquid into the gas chamber
      let dv = f * h;
      if (ac.vol + dv < 0) dv = -ac.vol; // bubble cannot expand past its free volume
      q[ai[i]] -= dv / h; ac.vol += dv;
    }
    for (let i = 0; i < pi_.length; i++) {
      const pi = net.pistons[i];
      // positive area: chamber grows when x grows (fluid pushes the piston out). Negative area: driven piston that compresses.
      let F = nodes[pi_[i]].p * pi.area + pi.fExt - pi.k * (pi.x - pi.x0) - pi.c * pi.v;
      if (pi.x > pi.xc) F -= pi.kc * (pi.x - pi.xc);
      pi.v += (F / pi.m) * h;
      let nx = pi.x + pi.v * h;
      if (nx < pi.xmin) { nx = pi.xmin; if (pi.v < 0) pi.v = 0; }
      if (nx > pi.xmax) { nx = pi.xmax; if (pi.v > 0) pi.v = 0; }
      q[pi_[i]] -= pi.area * (nx - pi.x) / h;
      pi.x = nx;
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i]; const qi = q[i] + (n.qExt || 0);
      if (n.fixed) { net.expelled += qi * h; continue; }
      n.p += (qi * h) / n.C;
    }
    net.time += h;
  }
}
