// S2 lumped RC thermal network: capacitances (J/K), conductances (W/K), heat sources (W), ambient sinks.
export const TIER = 'S2' as const;
export const ASSUMPTIONS: string[] = [
  'Each part is one isothermal lump (no gradients inside a rotor or pad).',
  'Conductances are constants chosen for a generic vented front rotor; convection scales with airflow speed.',
  'Radiation is folded into the convection term. No phase change, no hot-spotting.',
];

/** Q is external heat input (W), set by the caller each step. */
export interface TNode { id: string; C: number; T: number; Q: number }
export interface TLink { a: string; b: string; G: number }
/** Link from a node to ambient with a (possibly time-varying) conductance. */
export interface TAmb { node: string; G: number }
export interface TNet { nodes: TNode[]; links: TLink[]; amb: TAmb[]; Tamb: number; time: number }

export const newTNet = (Tamb = 25): TNet => ({ nodes: [], links: [], amb: [], Tamb, time: 0 });
export const tnode = (n: TNet, id: string, C: number, T = n.Tamb): TNode => { const x = { id, C, T, Q: 0 }; n.nodes.push(x); return x; };
export const tlink = (n: TNet, a: string, b: string, G: number): TLink => { const l = { a, b, G }; n.links.push(l); return l; };
export const tamb = (n: TNet, node: string, G: number): TAmb => { const l = { node, G }; n.amb.push(l); return l; };

export function stableDt(n: TNet): number {
  const g = new Map<string, number>();
  const add = (id: string, v: number) => g.set(id, (g.get(id) || 0) + v);
  for (const l of n.links) { add(l.a, l.G); add(l.b, l.G); }
  for (const a of n.amb) add(a.node, a.G);
  let dt = 1;
  for (const x of n.nodes) { const s = g.get(x.id) || 0; if (s > 0) dt = Math.min(dt, 0.25 * x.C / s); }
  return dt;
}

/** Advance dt (s) with Heun (RK2) sub-steps. */
export function tstep(n: TNet, dt: number): void {
  const h0 = stableDt(n); const nsub = Math.max(1, Math.ceil(dt / h0)); const h = dt / nsub;
  const idx = new Map<string, number>(); n.nodes.forEach((x, i) => idx.set(x.id, i));
  const N = n.nodes.length; const k1 = new Float64Array(N), k2 = new Float64Array(N), T0 = new Float64Array(N);
  const deriv = (out: Float64Array) => {
    for (let i = 0; i < N; i++) out[i] = n.nodes[i].Q;
    for (const l of n.links) {
      const i = idx.get(l.a)!, j = idx.get(l.b)!; const f = l.G * (n.nodes[j].T - n.nodes[i].T);
      out[i] += f; out[j] -= f;
    }
    for (const a of n.amb) { const i = idx.get(a.node)!; out[i] += a.G * (n.Tamb - n.nodes[i].T); }
    for (let i = 0; i < N; i++) out[i] /= n.nodes[i].C;
  };
  for (let s = 0; s < nsub; s++) {
    for (let i = 0; i < N; i++) T0[i] = n.nodes[i].T;
    deriv(k1);
    for (let i = 0; i < N; i++) n.nodes[i].T = T0[i] + h * k1[i];
    deriv(k2);
    for (let i = 0; i < N; i++) n.nodes[i].T = T0[i] + 0.5 * h * (k1[i] + k2[i]);
    n.time += h;
  }
}

/** Thermal energy above ambient (J), for energy-balance tests. */
export const storedEnergy = (n: TNet) => n.nodes.reduce((s, x) => s + x.C * (x.T - n.Tamb), 0);
