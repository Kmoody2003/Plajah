// Starter models for the pathway room. Written here from the published equations (no
// copied files); each says where its numbers come from. Built with a compact helper, so
// they are ordinary BioModels that save to SBML like any imported model.

import type { BioModel, Reaction, Species } from './sbml';
import { parseInfix } from './math';

interface Spec {
  id: string; name: string; field: string; about: string; source: string;
  species: Array<[id: string, initial: number, name?: string]>;
  params: Array<[id: string, value: number, name?: string]>;
  reactions: Array<[id: string, equation: string, rate: string]>;
  tEnd: number; method?: 'auto' | 'stiff'; plot?: string[]; logTime?: boolean;
}

export interface Starter { id: string; name: string; field: string; about: string; source: string; tEnd: number; method: 'auto' | 'stiff'; plot?: string[]; model: BioModel }

/** "2 A + B -> C" / "A <-> B" / "-> m1" / "p1 ->" */
function parseEquation(eq: string) {
  const rev = eq.includes('<->'); const [l, r] = eq.split(rev ? '<->' : '->');
  const side = (s: string) => s.split('+').map(x => x.trim()).filter(Boolean).map(x => { const m = /^(\d+(?:\.\d+)?)\s+(\w+)$/.exec(x); return m ? { species: m[2], stoich: +m[1] } : { species: x, stoich: 1 }; });
  return { reversible: rev, reactants: side(l), products: side(r ?? '') };
}

function build(s: Spec): Starter {
  const species: Species[] = s.species.map(([id, initial, name]) => ({ id, name: name ?? id, compartment: 'cell', initial, initialIsAmount: false, boundary: false, constant: false, onlySubstance: false }));
  const reactions: Reaction[] = s.reactions.map(([id, eq, rate]) => {
    const e = parseEquation(eq); const law = parseInfix(rate);
    const mods = new Set<string>(); const ids = new Set(species.map(x => x.id)); const walk = (x: any) => { if (x.k === 'sym' && ids.has(x.name) && !e.reactants.some(r => r.species === x.name)) mods.add(x.name); x.args?.forEach(walk); };
    walk(law);
    return { id, name: id, ...e, modifiers: [...mods], law, local: {} };
  });
  const model: BioModel = { id: s.id, name: s.name, notes: `${s.about} Source: ${s.source}`, compartments: [{ id: 'cell', name: 'cell', size: 1, constant: true }], species, params: s.params.map(([id, value, name]) => ({ id, name: name ?? id, value, constant: true })), reactions, rules: [], initialAssignments: [], functions: {}, events: [], warnings: [] };
  return { id: s.id, name: s.name, field: s.field, about: s.about, source: s.source, tEnd: s.tEnd, method: s.method ?? 'auto', plot: s.plot, model };
}

export const STARTERS: Starter[] = [
  build({
    id: 'michaelis_menten', name: 'Enzyme kinetics', field: 'Biochemistry',
    about: 'An enzyme E binds substrate S, forms the complex ES and releases product P. The textbook mass-action scheme behind the Michaelis–Menten equation.',
    source: 'Michaelis & Menten (1913); mass-action form as in any biochemistry text.',
    species: [['S', 10, 'Substrate'], ['E', 1, 'Enzyme'], ['ES', 0, 'Complex'], ['P', 0, 'Product']],
    params: [['kon', 1, 'binding rate'], ['koff', 0.5, 'unbinding rate'], ['kcat', 0.8, 'turnover rate']],
    reactions: [['bind', 'S + E <-> ES', 'kon*S*E - koff*ES'], ['catalyse', 'ES -> E + P', 'kcat*ES']],
    tEnd: 40,
  }),
  build({
    id: 'repressilator', name: 'Repressilator', field: 'Synthetic biology',
    about: 'Three genes, each repressing the next in a ring. The first engineered genetic clock: protein levels oscillate on their own.',
    source: 'Elowitz & Leibler, Nature 403:335 (2000); dimensionless model with alpha=216, alpha0=0.216, beta=5, n=2.',
    species: [['m1', 0.2, 'lacI mRNA'], ['m2', 0.1, 'tetR mRNA'], ['m3', 0.3, 'cI mRNA'], ['p1', 5, 'LacI'], ['p2', 0, 'TetR'], ['p3', 15, 'CI']],
    params: [['alpha', 216, 'max transcription'], ['alpha0', 0.216, 'leaky transcription'], ['beta', 5, 'protein/mRNA decay ratio'], ['n', 2, 'Hill coefficient']],
    reactions: [
      ['tx1', '-> m1', 'alpha/(1+p3^n) + alpha0'], ['tx2', '-> m2', 'alpha/(1+p1^n) + alpha0'], ['tx3', '-> m3', 'alpha/(1+p2^n) + alpha0'],
      ['dm1', 'm1 ->', 'm1'], ['dm2', 'm2 ->', 'm2'], ['dm3', 'm3 ->', 'm3'],
      ['tl1', '-> p1', 'beta*m1'], ['tl2', '-> p2', 'beta*m2'], ['tl3', '-> p3', 'beta*m3'],
      ['dp1', 'p1 ->', 'beta*p1'], ['dp2', 'p2 ->', 'beta*p2'], ['dp3', 'p3 ->', 'beta*p3'],
    ],
    tEnd: 60, plot: ['p1', 'p2', 'p3'],
  }),
  build({
    id: 'lotka_volterra', name: 'Predator and prey', field: 'Ecology',
    about: 'Rabbits grow, foxes eat rabbits and grow, foxes die. Populations cycle out of step with each other.',
    source: 'Lotka (1925), Volterra (1926); classic parameters a=1.1, b=0.4, c=0.4, d=0.1.',
    species: [['prey', 10, 'Prey'], ['pred', 10, 'Predators']],
    params: [['a', 1.1, 'prey birth'], ['b', 0.4, 'predation'], ['c', 0.4, 'predator death'], ['d', 0.1, 'predator gain']],
    reactions: [['birth', '-> prey', 'a*prey'], ['eaten', 'prey ->', 'b*prey*pred'], ['grow', '-> pred', 'd*prey*pred'], ['die', 'pred ->', 'c*pred']],
    tEnd: 50,
  }),
  build({
    id: 'sir', name: 'Epidemic (SIR)', field: 'Public health',
    about: 'People move from susceptible to infected to recovered. R0 = beta/gamma decides whether an outbreak takes off.',
    source: 'Kermack & McKendrick (1927); fractions of a population, beta=0.3/day, gamma=0.1/day (R0=3).',
    species: [['S', 0.999, 'Susceptible'], ['I', 0.001, 'Infected'], ['R', 0, 'Recovered']],
    params: [['beta', 0.3, 'contact rate'], ['gamma', 0.1, 'recovery rate']],
    reactions: [['infect', 'S -> I', 'beta*S*I'], ['recover', 'I -> R', 'gamma*I']],
    tEnd: 160,
  }),
  build({
    id: 'robertson', name: 'Robertson (stiff chemistry)', field: 'Chemistry',
    about: 'Three reactions running at wildly different speeds (rates from 0.04 to 30 million). The standard test that ordinary solvers choke on; the stiff solver takes it in stride.',
    source: 'Robertson (1966); the benchmark from Hairer & Wanner, Solving ODEs II.',
    species: [['A', 1], ['B', 0], ['C', 0]],
    params: [['k1', 0.04], ['k2', 3e7], ['k3', 1e4]],
    reactions: [['r1', 'A -> B', 'k1*A'], ['r2', '2 B -> B + C', 'k2*B^2'], ['r3', 'B + C -> A + C', 'k3*B*C']],
    tEnd: 40, method: 'stiff',
  }),
];
