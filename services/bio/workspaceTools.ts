// The Biology workspace's tools in the workspace tool registry (services/workspace/tools.ts).
// Molecules open as a cartoon coloured by structure; atom views join for small molecules or ones with
// something bound, chain colours for multi-chain structures. Pathways start with smooth (ODE) runs and
// rate sliders; starting amounts join once you've tuned a rate, and stochastic runs when only a few
// molecules are involved, which is when chance changes the answer.

import type { Structure } from './structure';
import type { BioModel } from './sbml';
import { registry, type ToolDef } from '../workspace/tools';

export const BIO = 'biology';
export interface BioToolDoc {
  tab: 'molecule' | 'pathway';
  /** Molecule tab. */
  residues?: number; ligands?: number; chains?: number;
  /** Pathway tab: a model counted in molecules (SBML amounts) with some species at 100 or fewer. */
  fewMolecules?: boolean; tuned?: boolean;
}
export type BioToolId = 'cartoon' | 'params' | 'ode' | 'atoms' | 'chains' | 'amounts' | 'stochastic' | 'water' | 'sbml';

const tool = (t: Omit<ToolDef<BioToolDoc>, 'workspace' | 'actsOn'> & { id: BioToolId }): ToolDef<BioToolDoc> => ({ actsOn: ['BIO'], ...t, workspace: BIO });

export const BIO_TOOLS: ToolDef<BioToolDoc>[] = [
  tool({ id: 'cartoon', label: 'Cartoon', group: 'Molecule', level: 'starter', teach: { simple: 'The shape of the protein as ribbons and arrows.', pro: 'Cartoon by secondary structure.' } }),
  tool({ id: 'params', label: 'Rates', group: 'Pathway', level: 'starter', teach: { simple: 'Slide to make each reaction faster or slower.', pro: 'Global parameters, log sliders.' } }),
  tool({ id: 'ode', label: 'Smooth run', group: 'Pathway', level: 'starter', teach: { simple: 'Watch the amounts change over time.', pro: 'Deterministic ODE (Dormand–Prince / Rosenbrock).' } }),

  tool({ id: 'atoms', label: 'Atom views', group: 'Molecule', level: 'core',
    appearsWhen: c => c.doc.tab === 'molecule' && ((c.doc.residues ?? Infinity) <= 150 || (c.doc.ligands ?? 0) > 0),
    because: { simple: 'this molecule is small enough, or has something bound to it, so its atoms are worth seeing', pro: 'small structure or bound ligands' },
    teach: { simple: 'See every atom as balls and sticks, or as solid spheres, coloured by element.', pro: 'Ball-and-stick, space-filling, CPK colours.' } }),
  tool({ id: 'chains', label: 'Colour by chain', group: 'Molecule', level: 'core',
    appearsWhen: c => c.doc.tab === 'molecule' && (c.doc.chains ?? 0) > 1, because: { simple: 'it is built from more than one chain', pro: 'multiple chains' },
    teach: { simple: 'Give each chain its own colour, to see how the pieces fit together.', pro: 'Per-chain colouring.' } }),
  tool({ id: 'stochastic', label: 'Stochastic run', group: 'Pathway', level: 'core',
    appearsWhen: c => c.doc.tab === 'pathway' && !!c.doc.fewMolecules, because: { simple: 'only a few molecules are involved, so chance matters', pro: 'low copy numbers' },
    teach: { simple: 'Run it one molecule at a time. Each run comes out a little different, like real cells.', pro: 'Gillespie SSA with a seed.' } }),
  tool({ id: 'amounts', label: 'Starting amounts', group: 'Pathway', level: 'core',
    appearsWhen: c => c.doc.tab === 'pathway' && !!c.doc.tuned, because: { simple: 'you changed a rate, so try changing what you start with too', pro: 'parameters tuned' },
    teach: { simple: 'Change how much of each thing there is at the start.', pro: 'Initial conditions per species.' } }),

  tool({ id: 'water', label: 'Show water', group: 'Molecule', level: 'pro', after: ['atoms'], teach: { simple: 'Show the water molecules stuck to it.', pro: 'Crystallographic waters.' } }),
  tool({ id: 'sbml', label: 'SBML export', group: 'Pathway', level: 'pro', after: ['params', 'amounts'], teach: { simple: 'Save the model for other biology programs.', pro: 'SBML L3 with your parameter changes.' } }),
];

/** Models that count molecules (SBML amounts, whole numbers) with some species at 100 or fewer copies.
 *  Concentrations that happen to be whole numbers (1 µM, 10 mM) don't count: chance only matters for counts. */
export function fewMolecules(m: Pick<BioModel, 'species'>): boolean {
  const live = m.species.filter(s => !s.constant && !s.boundary);
  return live.length > 0 && live.every(s => (s.initialIsAmount || s.onlySubstance) && Number.isInteger(s.initial)) && live.some(s => s.initial > 0 && s.initial <= 100);
}
/** The molecule tab's facts for the rail. */
export function moleculeFacts(s: Pick<Structure, 'chains'>): Pick<BioToolDoc, 'residues' | 'ligands' | 'chains'> {
  const polymer = s.chains.filter(c => c.residues > 0);
  return { residues: s.chains.reduce((n, c) => n + c.residues, 0), ligands: s.chains.reduce((n, c) => n + c.ligands.length, 0), chains: polymer.length };
}

let done = false;
/** Registers the Biology tools once. */
export function registerBioTools(): void {
  if (done) return; done = true;
  registry.register(...BIO_TOOLS);
}

// ---------------------------------------------------------------- what Aria knows about the molecule or model
import type { RoomState } from '../workspace/askAria';
import type { SimResult } from './sbml';

const g3 = (x: number) => (Math.abs(x) >= 1000 || (x !== 0 && Math.abs(x) < 0.01) ? x.toExponential(2) : `${+x.toPrecision(3)}`);

/** The Molecule tab in words: which structure, its chains and ligands, and how it's drawn. */
export function moleculeRoomState(o: { structure: Structure | null; style: string; color: string; hiddenChains: string[]; water: boolean }): RoomState {
  const st = o.structure;
  if (!st) return { building: 'The Molecule tab is open with no structure loaded yet.', lines: ['Load one by PDB code or UniProt accession, or open a file.'] };
  const chains = st.chains.slice(0, 6).map(c => `chain ${c.id} (${c.kind}, ${c.residues} residues${c.ligands.length ? `, with ${c.ligands.slice(0, 3).join(', ')}` : ''})`);
  const building = `Looking at ${st.title || st.id} (${st.id}${st.predicted ? ', an AlphaFold prediction' : `, ${st.method}${st.resolution ? ` at ${st.resolution} Å` : ''}`}): ${st.atoms.length} atoms, ${st.chains.length} chain${st.chains.length === 1 ? '' : 's'}.`;
  const lines = [`Chains: ${chains.join('; ')}${st.chains.length > 6 ? '; …' : ''}.`, `Drawn as ${o.style}, coloured by ${o.color}${o.water ? ', with water shown' : ''}.`];
  if (o.hiddenChains.length) lines.push(`Hidden chains: ${o.hiddenChains.join(', ')}.`);
  return { building, lines, issues: st.warnings.slice(0, 3) };
}

/** The Pathway tab in words: which model, what you changed, how it was run and where it ended up. */
export function pathwayRoomState(o: { model: BioModel; changedParams: Record<string, number>; changedInitial: Record<string, number>; mode: string; tEnd: number; result: SimResult | null; error?: string; shown: string[] }): RoomState {
  const m = o.model;
  const name = (id: string) => m.species.find(s => s.id === id)?.name || m.params.find(p => p.id === id)?.name || id;
  const building = `The ${m.name || m.id} model: ${m.species.length} species and ${m.reactions.length} reactions, run ${o.mode === 'stochastic' ? 'stochastically (one molecule at a time)' : 'smoothly (ODE)'} to time ${g3(o.tEnd)}.`;
  const lines: string[] = [];
  const ps = Object.entries(o.changedParams).slice(0, 6), is = Object.entries(o.changedInitial).slice(0, 6);
  lines.push(ps.length ? `Rates changed: ${ps.map(([k, v]) => `${name(k)} = ${g3(v)}`).join(', ')}.` : 'No rates changed from the model.');
  if (is.length) lines.push(`Starting amounts changed: ${is.map(([k, v]) => `${name(k)} = ${g3(v)}`).join(', ')}.`);
  if (o.result) {
    const end = o.shown.filter(id => o.result!.series[id]).slice(0, 6).map(id => { const s = o.result!.series[id]; const mx = s.reduce((a, b) => Math.max(a, b), -Infinity); return `${name(id)} ends at ${g3(s[s.length - 1])} (peak ${g3(mx)})`; });
    if (end.length) lines.push(`On the chart: ${end.join('; ')}.`);
  }
  const issues = [...(o.error ? [`The run failed: ${o.error}`] : []), ...m.warnings.slice(0, 3)];
  return { building, lines, issues };
}
