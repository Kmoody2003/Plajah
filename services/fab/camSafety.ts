// Safety for the machining operations: what can crash, fling or break, as hazards that cite the rule
// they come from. Critical ones must be acknowledged before preparing; `block` ones need a design or
// setup change (the Make tab will not prepare until they clear). Shown alongside processHazards.

import { type Hazard, sortHazards } from '../safety/hazards';

export interface MachiningContext {
  op: 'surface' | 'adaptive' | 'profile';
  /** Deepest cut below the top of stock, mm, and how far the tool reaches below its holder. */
  depth?: number; reach?: number; toolDia?: number;
  /** Finishing straight from stock, with nothing roughed out first. */
  finishFromStock?: boolean;
  /** Profile cuts: does the cut go right through the sheet, and what holds the parts. */
  throughCut?: boolean; tabs?: { count: number; height: number; width: number } | null; onionSkin?: number;
  /** Smallest part outline, mm² (small parts fling hardest when freed). */ smallestPart?: number;
  /** Radial engagement as a fraction of the tool diameter (adaptive). */ engagement?: number;
}

const GUARD = '29 CFR 1910.212(a)(1) (machine guarding against flying chips and parts)';
const MILL_STD = 'ANSI B11.8 (milling) / ANSI B11.23 (machining centres)';

export function machiningHazards(c: MachiningContext): Hazard[] {
  const out: Hazard[] = []; const add = (h: Omit<Hazard, 'stage'>) => out.push({ stage: 'make', ...h });
  if (c.reach && c.depth && c.depth > c.reach + 1e-6) add({ id: 'holder-crash', severity: 'critical', block: true, title: 'The tool holder would hit the stock',
    why: `The deepest surface is ${c.depth.toFixed(1)} mm down but the tool reaches only ${c.reach} mm below its holder. A holder crash breaks the cutter and throws pieces.`,
    mitigate: ['Use a longer-reach tool or extension holder.', 'Machine the part from both sides, or reduce the depth.'], cite: MILL_STD });
  if (c.toolDia && c.reach && c.reach > c.toolDia * 6) add({ id: 'long-stickout', severity: 'medium', title: `Stick-out ${(c.reach / c.toolDia).toFixed(1)}× the tool diameter`,
    why: 'Past about 4-6× diameter a cutter deflects and chatters; long slender tools snap.', mitigate: ['Cut feed and depth of cut; use a necked tool; keep stick-out as short as the depth allows.'], cite: MILL_STD });
  if (c.op === 'surface' && c.finishFromStock) add({ id: 'finish-from-stock', severity: 'high', ack: true, title: 'Finishing pass straight into uncut stock',
    why: 'Surfacing paths assume the bulk is already roughed away; a finishing ball buried at full depth overloads and breaks.', mitigate: ['Rough first with adaptive clearing and a stock-to-leave, then finish.', 'If the stock is already near-net, acknowledge this.'], cite: MILL_STD });
  if (c.op === 'adaptive' && c.engagement !== undefined && c.engagement > 0.5) add({ id: 'adaptive-load', severity: 'medium', title: `Radial engagement ${(c.engagement * 100).toFixed(0)}% of the tool`,
    why: 'Adaptive clearing is meant for light radial cuts at full flute depth; heavy engagement at that depth overloads the cutter.', mitigate: ['Keep the optimal load at 8-25% of the diameter for metals, up to 40% in wood and plastics.'], cite: MILL_STD });
  if (c.op === 'profile' && c.throughCut) {
    const held = (c.tabs && c.tabs.count > 0) || (c.onionSkin ?? 0) > 0;
    if (!held) add({ id: 'parts-fling', severity: 'critical', ack: true, title: 'Cut-out parts are not held',
      why: 'When a through-cut finishes, the freed part can catch the spinning bit and be thrown, or the bit snaps against it.',
      mitigate: ['Add tabs (2-4 per part) or an onion-skin final pass.', 'Or hold the sheet with vacuum or screws inside every part.'], cite: GUARD });
    if (c.tabs && c.tabs.count === 1) add({ id: 'one-tab', severity: 'high', title: 'One tab per part', why: 'A part on one tab pivots into the cutter as the cut closes.', mitigate: ['Use at least two tabs, spaced around the part.'], cite: GUARD });
    if (c.tabs && c.tabs.count > 0 && c.tabs.height < 1) add({ id: 'thin-tabs', severity: 'medium', title: `Tabs ${c.tabs.height} mm thick`, why: 'Very thin tabs break while the cut is still running and free the part early.', mitigate: ['Make tabs at least 1-3 mm thick, more for heavy parts.'], cite: GUARD });
    if (held && c.smallestPart !== undefined && c.smallestPart < 400 && !(c.tabs && c.tabs.count >= 2)) add({ id: 'small-parts', severity: 'high', title: 'Small parts held by the skin alone',
      why: 'Parts under about 20 × 20 mm tear free of a thin onion skin and get thrown.', mitigate: ['Give small parts two tabs as well.'], cite: GUARD });
  }
  return sortHazards(out);
}
