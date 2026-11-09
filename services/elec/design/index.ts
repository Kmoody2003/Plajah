// "Describe it, we design it" for anything the block library covers: spec -> plan -> routed
// schematic -> proof of wiring -> simulation -> checks -> firmware, enclosure, BOM, review, hazards.
// Returns the same Build the fixed recipes return, so the Electronics Lab shows it unchanged.
// Released by Plajah as public domain (CC0).
import { verifyDesign } from '../designs';
import { simulate } from '../sim';
import { checkCircuit } from '../checks';
import { PHYSICAL, designEnclosure, type Item } from '../enclosure';
import { designHazards } from '../../safety/hazards';
import type { Build } from '../recipes';
import type { Circuit } from '../circuit';
import { blockById } from './blocks';
import { plan, type Plan } from './planner';
import { assemble } from './assemble';
import { firmware } from './firmware';
import { review, bomLines, extrasFor, stepsFor } from './outputs';
import type { Spec } from './types';

export interface DesignResult { build: Build | null; plan: Plan; errors: string[] }
const items = (c: Circuit): Item[] => c.parts.filter(p => PHYSICAL[p.kind]).map(p => ({ name: p.ref, ref: p.ref, ...PHYSICAL[p.kind](p.params) }));
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export function describeNeeds(spec: Spec): string[] {
  return spec.needs.map(nd => { const b = blockById(nd.block)!; const c = nd.count || 1; return nd.block === 'lamp' ? `${c} lamp LED${c > 1 ? 's' : ''}` : nd.block === 'neopixel' ? `${c} RGB pixels` : nd.block === 'strip12' ? `a ${nd.opt?.watts ?? 6} W LED strip` : c > 1 ? `${c} ${b.plural}` : `${/^[A-Z]{2}/.test(b.label) ? b.label : b.label[0].toLowerCase() + b.label.slice(1)}`; });
}

export function designFromSpec(spec: Spec): DesignResult {
  const p = plan(spec); if (p.errors.length) return { build: null, plan: p, errors: p.errors };
  const title = spec.name.trim() || 'Custom design';
  let a: ReturnType<typeof assemble>;
  let lastErr = '';
  for (const spread of [1, 1.6, 2.4]) { try { a = assemble(plan(spec), title, spec.market, spread); lastErr = ''; break; } catch (e) { lastErr = (e as Error).message; } }
  if (lastErr) return { build: null, plan: p, errors: [`Could not lay out the schematic: ${lastErr}`] };
  const c = a!.circuit; const simOpts = { mode: 'dc' as const };
  const verify = verifyDesign({ id: 'design', title, about: '', circuit: c, sim: simOpts, licence: 'CC0-1.0', tags: [], pairs: a!.pairs });
  const sim = simulate(c, simOpts); const findings = checkCircuit(c, sim, { market: spec.market });
  const hazards = designHazards({ circuit: c, recipe: 'design' });
  const rev = review(p, c, verify, sim, findings, hazards);
  const fw = firmware(p, title);
  const conn = spec.conn.map(x => ({ wifi: 'Wi-Fi', bluetooth: 'Bluetooth', homeassistant: 'Home Assistant', 'usb-midi': 'USB MIDI', 'usb-hid': 'USB keyboard/HID' })[x]);
  const summary = `${p.mcu ? `${p.mcu.label} with ` : ''}${list(describeNeeds(spec))}${conn.length ? ` (${conn.join(', ')})` : ''}; ${p.power.summary}.`;
  const build: Build = {
    recipe: 'design', title, summary, circuit: c, sim: simOpts, pairs: a!.pairs, values: { spec: JSON.stringify(spec) }, market: spec.market,
    enclosure: designEnclosure(items(c), { name: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), wall: spec.power === 'mains' ? 3 : 2.4 }), firmware: fw,
    extras: extrasFor(p), steps: stepsFor(p), notes: [...p.power.notes, ...p.notes],
    design: { spec, board: p.mcu?.label ?? 'No controller', framework: p.mcu?.framework, pins: p.pins, power: p.power, review: rev, bom: bomLines(c), counts: { errors: rev.filter(r => r.level === 'error').length, warnings: rev.filter(r => r.level === 'warn').length } },
  };
  return { build, plan: p, errors: [] };
}
export type { Spec } from './types';
