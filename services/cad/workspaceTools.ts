// The Architecture workspace's drafting tools in the workspace tool registry
// (services/workspace/tools.ts). DraftView draws its rail from this: a beginner sees a short rail,
// and tools join it as the drawing calls for them. AutoCAD aliases always work from the command line.

import type { CadModel } from './model';
import type { Room } from './rooms';
import type { DraftTool } from './draft';
import { registry, type ToolDef } from '../workspace/tools';
import { HOME_PATH } from './guide/journey';

export const ARCH = 'architecture';
/** What the CAD tools look at: the drawing and the rooms its walls enclose. */
export interface CadToolDoc { model: CadModel; rooms: Room[] }

const count = (d: CadToolDoc, ...types: string[]) => d.model.entities.filter(e => types.includes(e.type)).length;
const tool = (t: Omit<ToolDef<CadToolDoc>, 'workspace' | 'actsOn'> & { id: DraftTool; actsOn?: string[] }): ToolDef<CadToolDoc> => ({ actsOn: ['DRAFT_2D'], ...t, workspace: ARCH });

export const CAD_TOOLS: ToolDef<CadToolDoc>[] = [
  tool({ id: 'select', label: 'Select', group: 'Pick', level: 'starter', alias: 'S', teach: { simple: 'Click a thing to pick it. Drag a box to pick lots.', pro: 'Window (left→right) or crossing (right→left) selection.' } }),
  tool({ id: 'pan', label: 'Pan', group: 'Pick', level: 'starter', alias: 'P', teach: { simple: 'Slide the paper around.', pro: 'Pan; middle mouse also pans, wheel zooms.' } }),
  tool({ id: 'wall', label: 'Wall', group: 'Building', level: 'starter', alias: 'W', actsOn: ['DRAFT_2D', 'wall'], teach: { simple: 'Click corner to corner to build walls. Press C to close the room.', pro: 'Chained walls by centreline; C closes, typed lengths and @dx,dy accepted.' } }),
  tool({ id: 'line', label: 'Line', group: 'Draw', level: 'starter', alias: 'L', teach: { simple: 'Draw a straight line.', pro: 'Line, chained; typed distance along the cursor or @dx,dy.' } }),
  tool({ id: 'rect', label: 'Rectangle', group: 'Draw', level: 'starter', alias: 'REC', teach: { simple: 'Draw a box from one corner to the other.', pro: 'Rectangle by opposite corners; @w,h for size.' } }),
  tool({ id: 'circle', label: 'Circle', group: 'Draw', level: 'starter', alias: 'C', teach: { simple: 'Click the middle, then how big.', pro: 'Circle by centre and radius.' } }),
  tool({ id: 'text', label: 'Text', group: 'Notes', level: 'starter', alias: 'T', teach: { simple: 'Write a word on the drawing.', pro: 'Single-line text at the current text height.' } }),
  tool({ id: 'measure', label: 'Measure', group: 'Notes', level: 'starter', alias: 'DI', teach: { simple: 'Find how far it is between two points.', pro: 'DIST: distance, Δx, Δy and angle.' } }),

  tool({ id: 'roomtag', label: 'Room tag', group: 'Building', level: 'core', alias: 'RT', actsOn: ['DRAFT_2D', 'room'],
    appearsWhen: c => c.doc.rooms.length > 0, because: { simple: 'you closed a room with walls', pro: 'an enclosed space was detected' },
    teach: { simple: 'Click inside a room to name it. Its size shows up by itself.', pro: 'Room tag: name, number and live net area from bounding walls.' } }),
  tool({ id: 'dimension', label: 'Dimension', group: 'Notes', level: 'core', alias: 'DIM',
    appearsWhen: c => count(c.doc, 'wall', 'line', 'polyline', 'rect') >= 2, because: { simple: 'there are things to measure now', pro: 'the drawing has geometry to dimension' },
    teach: { simple: 'Show how long something is, so a builder knows.', pro: 'Aligned dimension; pick two points, then place the line.' } }),
  tool({ id: 'move', label: 'Move', group: 'Change', level: 'core', alias: 'M',
    appearsWhen: c => c.selection.length > 0, because: { simple: 'you picked something', pro: 'there is a selection' },
    teach: { simple: 'Pick it up and put it somewhere else.', pro: 'Move by base point and second point.' } }),
  tool({ id: 'copy', label: 'Copy', group: 'Change', level: 'core', alias: 'CO',
    appearsWhen: c => c.selection.length > 0, because: { simple: 'you picked something', pro: 'there is a selection' },
    teach: { simple: 'Make another one just like it.', pro: 'Copy, multiple placements.' } }),
  tool({ id: 'rotate', label: 'Rotate', group: 'Change', level: 'core', alias: 'RO',
    appearsWhen: c => c.selection.length > 0, because: { simple: 'you picked something', pro: 'there is a selection' },
    teach: { simple: 'Turn it around a point.', pro: 'Rotate about a base point; typed angle.' } }),
  tool({ id: 'polyline', label: 'Polyline', group: 'Draw', level: 'core', alias: 'PL',
    appearsWhen: c => count(c.doc, 'line') >= 3, because: { simple: 'you drew lots of lines that join up', pro: 'several joined lines could be one polyline' },
    teach: { simple: 'Draw joined-up lines that stay together as one shape.', pro: 'Polyline; C closes.' } }),
  tool({ id: 'offset', label: 'Offset', group: 'Change', level: 'core', alias: 'O',
    appearsWhen: c => count(c.doc, 'line', 'polyline') > 0 && count(c.doc, 'wall') === 0, because: { simple: 'you can turn your lines into walls', pro: 'linework can be offset into walls' },
    teach: { simple: 'Make a copy a set distance away. It can turn lines into walls.', pro: 'Offset by distance; offsets lines into walls.' } }),
  tool({ id: 'fillet', label: 'Fillet', group: 'Change', level: 'core', alias: 'F',
    appearsWhen: c => count(c.doc, 'wall') >= 2, because: { simple: 'walls can be joined neatly at the corners', pro: 'walls can be cleaned up at corners' },
    teach: { simple: 'Join two walls so the corner meets neatly.', pro: 'Fillet; radius 0 joins corners and walls.' } }),
  tool({ id: 'hatch', label: 'Hatch', group: 'Notes', level: 'core', alias: 'H',
    appearsWhen: c => c.doc.rooms.length > 0 || c.doc.model.entities.some(e => e.type === 'polyline' && e.closed), because: { simple: 'you have a closed shape to fill', pro: 'there is a closed boundary' },
    teach: { simple: 'Fill a closed shape with a pattern, like tiles or grass.', pro: 'Hatch by picking inside a closed boundary.' } }),

  tool({ id: 'trim', label: 'Trim', group: 'Change', level: 'pro', alias: 'TR', after: ['line', 'wall'], teach: { simple: 'Cut off the bit of a line that sticks out.', pro: 'Trim to the nearest crossing edges.' } }),
  tool({ id: 'extend', label: 'Extend', group: 'Change', level: 'pro', alias: 'EX', after: ['line', 'wall'], teach: { simple: 'Stretch a line until it touches another.', pro: 'Extend to the nearest boundary.' } }),
  tool({ id: 'scale', label: 'Scale', group: 'Change', level: 'pro', alias: 'SC', after: ['move', 'copy'], teach: { simple: 'Make it bigger or smaller.', pro: 'Scale about a base point by factor.' } }),
  tool({ id: 'mirror', label: 'Mirror', group: 'Change', level: 'pro', alias: 'MI', after: ['move', 'copy', 'rotate'], teach: { simple: 'Flip it, like in a mirror.', pro: 'Mirror across a two-point line.' } }),
  tool({ id: 'arc', label: 'Arc', group: 'Draw', level: 'pro', alias: 'A', after: ['circle'], teach: { simple: 'Draw part of a circle.', pro: 'Arc by centre, start, end.' } }),
];

let done = false;
/** Register the Architecture tools once (safe to call from every module that needs them). */
export function registerCadTools(): void {
  if (done) return; done = true;
  registry.register(...CAD_TOOLS);
  // Finishing "Design a home" keeps the tools a home needs on the rail for good.
  registry.unlockOnPath(ARCH, HOME_PATH.id, HOME_PATH.unlocks ?? []);
}
