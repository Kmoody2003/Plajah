// The Sewing & Plush workspace's tools in the workspace tool registry (services/workspace/tools.ts).
// A beginner picks a pattern and sees: the pieces, how to print them, the steps, materials and safety.
// Fabric layout and the 3D fit join once they've set their own measurements; size nesting and the
// tech pack join when they plan to sell; machine cutting is earned by making. Safety is always shown.

import type { SoftKind } from './patterns';
import { registry, type ToolDef } from '../workspace/tools';

export const SEW = 'sewing';
/** What the Sewing tools look at: the kind of pattern and what the person has decided so far. */
export interface SewToolDoc { kind: SoftKind; edited: boolean; selling: boolean; sizes: number }
export type SewToolId = 'pieces' | 'make' | 'steps' | 'materials' | 'safety' | 'layout' | 'fit3d' | 'grade' | 'techpack' | 'cutter';

const tool = (t: Omit<ToolDef<SewToolDoc>, 'workspace' | 'actsOn'> & { id: SewToolId }): ToolDef<SewToolDoc> => ({ actsOn: ['PATTERN'], ...t, workspace: SEW });

export const SEW_TOOLS: ToolDef<SewToolDoc>[] = [
  tool({ id: 'pieces', label: 'Pattern pieces', group: 'See', level: 'starter', teach: { simple: 'The shapes you cut out of fabric.', pro: 'Pattern pieces with seam allowance, grain and notches.' } }),
  tool({ id: 'make', label: 'Make', group: 'Make', level: 'starter', teach: { simple: 'Print the pattern at home and cut it out.', pro: 'Tiled PDF, DXF/SVG cut files, print-on-demand.' } }),
  tool({ id: 'steps', label: 'Steps', group: 'Make', level: 'starter', teach: { simple: 'How to sew it, one step at a time.', pro: 'Construction order.' } }),
  tool({ id: 'materials', label: 'Materials', group: 'Make', level: 'starter', teach: { simple: 'What fabric and bits to buy.', pro: 'Yardage, notions, finished measurements, labels.' } }),
  tool({ id: 'safety', label: 'Safety', group: 'Make', level: 'starter', teach: { simple: 'What could hurt someone, and how to stop it.', pro: 'Product hazards, process hazards and recalls.' } }),

  tool({ id: 'layout', label: 'Fabric layout', group: 'See', level: 'core',
    appearsWhen: c => c.doc.edited, because: { simple: 'you set your own measurements, so here is how much fabric to buy', pro: 'custom measurements change the marker' },
    teach: { simple: 'How the pieces fit on the fabric, and how much to buy.', pro: 'Marker per fabric, efficiency and yardage at your width.' } }),
  tool({ id: 'fit3d', label: '3D fit', group: 'See', level: 'core',
    appearsWhen: c => c.doc.edited && (c.doc.kind === 'apparel' || c.doc.kind === 'plush'), because: { simple: 'you changed the size, so you can see it on a body', pro: 'the draft changed; check drape and ease' },
    teach: { simple: 'See it sewn up in 3D before you cut.', pro: 'Cloth simulation with fit and strain maps.' } }),
  tool({ id: 'grade', label: 'Nest sizes', group: 'Sell', level: 'core',
    appearsWhen: c => c.doc.selling && c.doc.sizes > 1, because: { simple: 'you plan to sell it, so you will want every size', pro: 'selling across a size range' },
    teach: { simple: 'Put every size on one pattern, nested like shop patterns.', pro: 'Graded nest, per-size DXF layers and graded spec.' } }),
  tool({ id: 'techpack', label: 'Tech pack', group: 'Sell', level: 'core',
    appearsWhen: c => c.doc.selling, because: { simple: 'you plan to sell it, so a seamstress or factory needs the details', pro: 'production handoff' },
    teach: { simple: 'One PDF with everything a maker needs to sew it for you.', pro: 'Tech pack PDF: flats, specs, BOM, labels, hazards.' } }),

  tool({ id: 'cutter', label: 'Machine cutting', group: 'Make', level: 'pro', after: ['make'], teach: { simple: 'Cut with a cutting machine or laser instead of scissors.', pro: 'Drag-knife and CO₂ laser cut files and process hazards.' } }),
];

let done = false;
/** Registers the Sewing tools once. */
export function registerSewTools(): void {
  if (done) return; done = true;
  registry.register(...SEW_TOOLS);
}
