// The Electronics workspace's tools in the workspace tool registry (services/workspace/tools.ts).
// A beginner starts with: pick, wire, simulate, checks and safety. Parts, Scope, Board and SPICE join
// as the circuit calls for them (in the order Aria suggests them). Safety and Checks are starters: safety is never hidden or paywalled.

import type { Circuit } from './circuit';
import type { SimResult } from './sim';
import { registry, type ToolDef } from '../workspace/tools';

export const ELEC = 'electronics';
/** What the Electronics tools look at: the circuit, the last simulation, and how the checks went. */
export interface ElecToolDoc { circuit: Circuit; sim: SimResult | null; mode: 'dc' | 'tran'; errors: number }
export type ElecToolId = 'select' | 'wire' | 'rotate' | 'delete' | 'undo' | 'simulate' | 'checks' | 'safety' | 'props' | 'bom' | 'overtime' | 'scope' | 'board' | 'spice';

/** Parts whose behaviour depends on time: a DC answer alone doesn't show what they do. */
export const TIMED_PARTS = ['capacitor', 'electrolytic', 'inductor', 'ne555'];
const real = (c: Circuit) => c.parts.filter(p => p.kind !== 'ground');
const tool = (t: Omit<ToolDef<ElecToolDoc>, 'workspace' | 'actsOn'> & { id: ElecToolId }): ToolDef<ElecToolDoc> => ({ actsOn: ['CIRCUIT'], ...t, workspace: ELEC });

export const ELEC_TOOLS: ToolDef<ElecToolDoc>[] = [
  tool({ id: 'select', label: 'Select', group: 'Edit', level: 'starter', alias: 'V', teach: { simple: 'Click a part to pick it, drag to move it.', pro: 'Select and move; drag empty sheet to pan.' } }),
  tool({ id: 'wire', label: 'Wire', group: 'Edit', level: 'starter', alias: 'W', teach: { simple: 'Join pins with a wire. Click to bend it, end on a pin.', pro: 'Orthogonal wires; click to bend, end on a pin or double-click.' } }),
  tool({ id: 'rotate', label: 'Rotate', group: 'Edit', level: 'starter', alias: 'R', teach: { simple: 'Turn the part a quarter turn.', pro: 'Rotate 90°.' } }),
  tool({ id: 'delete', label: 'Delete', group: 'Edit', level: 'starter', alias: 'Del', teach: { simple: 'Take it off the sheet.', pro: 'Delete selection.' } }),
  tool({ id: 'undo', label: 'Undo', group: 'Edit', level: 'starter', alias: 'Ctrl+Z', teach: { simple: 'Go back one step.', pro: 'Undo.' } }),
  tool({ id: 'simulate', label: 'Simulate', group: 'Test', level: 'starter', teach: { simple: 'See what the circuit does: lights glow, meters read.', pro: 'Run the solver (DC operating point or transient).' } }),
  tool({ id: 'checks', label: 'Checks', group: 'Test', level: 'starter', teach: { simple: 'Find mistakes before you build it.', pro: 'Electrical rule, rating and regulatory pre-checks.' } }),
  tool({ id: 'safety', label: 'Safety', group: 'Test', level: 'starter', teach: { simple: 'What could hurt someone, and how to stop it.', pro: 'Hazard review, advisories and recalls.' } }),

  tool({ id: 'props', label: 'Part', group: 'Edit', level: 'core',
    appearsWhen: c => c.selection.length > 0, because: { simple: 'you picked a part', pro: 'there is a selection' },
    teach: { simple: "Change the part's value, like how many ohms.", pro: 'Part parameters and live readings.' } }),
  tool({ id: 'overtime', label: 'Over time', group: 'Test', level: 'core',
    appearsWhen: c => c.doc.circuit.parts.some(p => TIMED_PARTS.includes(p.kind)), because: { simple: 'your circuit has parts that change over time', pro: 'reactive or timing parts are present' },
    teach: { simple: 'Watch the circuit second by second, like a slow-motion video.', pro: 'Transient analysis over a set duration.' } }),
  tool({ id: 'scope', label: 'Scope', group: 'Test', level: 'core',
    appearsWhen: c => c.doc.sim?.mode === 'tran', because: { simple: 'you simulated over time, so there are waves to see', pro: 'a transient result is available' },
    teach: { simple: 'Draw how a voltage goes up and down. Click a wire to watch it.', pro: 'Probe nets; traces over the transient run.' } }),
  tool({ id: 'bom', label: 'Parts list', group: 'Make', level: 'core',
    appearsWhen: c => real(c.doc.circuit).length >= 2, because: { simple: 'there are parts to buy now', pro: 'the sheet has a bill of materials' },
    teach: { simple: 'Everything you need to buy, and where to get it.', pro: 'BOM with sourcing; CSV or to the document.' } }),
  tool({ id: 'board', label: 'Board', group: 'Make', level: 'core',
    appearsWhen: c => !!c.doc.sim && c.doc.errors === 0 && real(c.doc.circuit).length >= 3, because: { simple: 'your circuit works and passes its checks, so it can become a real board', pro: 'the circuit simulates clean' },
    teach: { simple: 'Turn the drawing into a circuit board you can order.', pro: 'Two-layer layout, autoroute, DRC, Gerbers and KiCad.' } }),

  tool({ id: 'spice', label: 'SPICE', group: 'Make', level: 'pro', after: ['simulate', 'overtime'], teach: { simple: 'Save the circuit for other circuit programs.', pro: 'SPICE netlist for ngspice, LTspice, KiCad.' } }),
];

let done = false;
/** Registers the Electronics tools once (safe to call from every module that needs them). */
export function registerElecTools(): void {
  if (done) return; done = true;
  registry.register(...ELEC_TOOLS);
}

// ---------------------------------------------------------------- what Aria knows about the circuit
import type { RoomState } from '../workspace/askAria';
import { bom } from './circuit';
import type { Finding } from './checks';
import type { Hazard } from '../safety/hazards';

const si = (v: number, unit: string) => { const a = Math.abs(v); return a >= 1 ? `${+v.toPrecision(3)} ${unit}` : a >= 1e-3 ? `${+(v * 1e3).toPrecision(3)} m${unit}` : a >= 1e-6 ? `${+(v * 1e6).toPrecision(3)} µ${unit}` : `0 ${unit}`; };
const last = (a: number[] | undefined) => a?.length ? a[a.length - 1] : 0;

/** The sheet in words: the parts list, what's picked, what the simulation measured, and open checks and hazards. */
export function elecRoomState(o: { circuit: Circuit; selectedRef?: string | null; sim: SimResult | null; findings: Finding[]; openHazards: Hazard[]; panel?: string }): RoomState {
  const c = o.circuit;
  const rows = bom(c).slice(1);
  if (!c.parts.length) return { building: `${c.name || 'A new circuit'}: the sheet is empty so far.` };
  const parts = rows.map(([qty, refs, name, value]) => `${qty === '1' ? '' : `${qty} × `}${name}${value ? ` ${value}` : ''} (${refs})`);
  const building = `${c.name || 'A circuit'}${c.about ? ` (${c.about.slice(0, 120)})` : ''}: ${parts.slice(0, 8).join(', ')}${parts.length > 8 ? ', and more' : ''}. ${c.wires.length} wire${c.wires.length === 1 ? '' : 's'}.`;
  const lines: string[] = [];
  if (o.selectedRef) lines.push(`Picked: ${o.selectedRef}.`);
  if (o.panel) lines.push(`The ${o.panel} panel is open.`);
  if (!o.sim) lines.push('It has not been simulated yet.');
  else {
    lines.push(o.sim.converged ? `Simulated (${o.sim.mode === 'tran' ? 'over time' : 'steady'}).` : 'The last simulation did not settle on an answer.');
    const reads = c.parts.filter(p => o.sim!.parts[p.id] && p.kind !== 'ground' && p.kind !== 'wire').slice(0, 6)
      .map(p => { const t = o.sim!.parts[p.id]; return `${p.ref} ${si(last(t.i), 'A')}, ${si(last(t.p), 'W')}`; });
    if (reads.length) lines.push(`Readings: ${reads.join('; ')}.`);
    for (const [id, hz] of Object.entries(o.sim.freq ?? {})) { const p = c.parts.find(x => x.id === id); if (p) lines.push(`${p.ref} switches at ${si(hz, 'Hz')}.`); }
    for (const w of o.sim.warnings.slice(0, 2)) lines.push(`Simulator: ${w}`);
  }
  const issues = [
    ...o.openHazards.slice(0, 3).map(h => `Safety (${h.severity}): ${h.title}. ${h.why}`),
    ...o.findings.filter(f => f.level === 'error' || f.level === 'warn').slice(0, 5).map(f => `${f.level === 'error' ? 'Check failed' : 'Warning'}: ${f.title}. ${f.detail}${f.refs?.length ? ` (${f.refs.join(', ')})` : ''}`),
  ];
  return { building, lines, issues };
}
