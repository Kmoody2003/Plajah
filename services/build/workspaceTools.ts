// Build Studio's 3D tools in the workspace tool registry (services/workspace/tools.ts).
// A first-timer sees: undo/redo, move, turn, stretch, duplicate, delete and the home view.
// Group arrives when there's a hole to cut or two shapes picked, Align with two picked, Drop when a
// shape floats above the plate, Top view once the plate is busy; Mirror and the snap grid are earned.

import { registry, type ToolDef } from '../workspace/tools';

export const STUDIO = 'studio';
/** What the Studio tools look at: the plate and what's picked. */
export interface StudioToolDoc { shapes: number; holes: number; groups: number; picked: number; floating: boolean }
export type StudioToolId = 'undo' | 'redo' | 'move' | 'turn' | 'stretch' | 'duplicate' | 'delete' | 'home' | 'group' | 'ungroup' | 'align' | 'drop' | 'top' | 'mirror' | 'snap';

const tool = (t: Omit<ToolDef<StudioToolDoc>, 'workspace' | 'actsOn' | 'group'> & { id: StudioToolId; group?: string }): ToolDef<StudioToolDoc> => ({ actsOn: ['SCENE_3D'], group: '3D', ...t, workspace: STUDIO });

export const STUDIO_TOOLS: ToolDef<StudioToolDoc>[] = [
  tool({ id: 'undo', label: 'Undo', level: 'starter', alias: 'Ctrl+Z', teach: { simple: 'Go back one step.', pro: 'Undo.' } }),
  tool({ id: 'redo', label: 'Redo', level: 'starter', alias: 'Ctrl+Y', teach: { simple: 'Bring it back.', pro: 'Redo.' } }),
  tool({ id: 'move', label: 'Move', level: 'starter', alias: 'W', teach: { simple: 'Slide the shape around the plate.', pro: 'Translate gizmo.' } }),
  tool({ id: 'turn', label: 'Turn', level: 'starter', alias: 'E', teach: { simple: 'Spin the shape.', pro: 'Rotate gizmo.' } }),
  tool({ id: 'stretch', label: 'Stretch', level: 'starter', alias: 'R', teach: { simple: 'Make it longer, wider or taller.', pro: 'Scale gizmo.' } }),
  tool({ id: 'duplicate', label: 'Duplicate', level: 'starter', alias: 'Ctrl+D', teach: { simple: 'Make another one.', pro: 'Duplicate selection.' } }),
  tool({ id: 'delete', label: 'Delete', level: 'starter', alias: 'Del', teach: { simple: 'Take it off the plate.', pro: 'Delete selection.' } }),
  tool({ id: 'home', label: 'Home view', level: 'starter', teach: { simple: 'Put the camera back where it started.', pro: 'Reset view.' } }),

  tool({ id: 'group', label: 'Group', level: 'core', alias: 'Ctrl+G',
    appearsWhen: c => c.doc.picked >= 2 || (c.doc.holes > 0 && c.doc.shapes > c.doc.holes),
    because: { simple: 'you have a hole ready to cut into a solid, or shapes to join into one', pro: 'boolean union / subtract by grouping' },
    teach: { simple: 'Pick a solid and a hole, then Group: the hole cuts the solid. Solids join into one.', pro: 'Group: union solids, subtract holes.' } }),
  tool({ id: 'align', label: 'Align', level: 'core',
    appearsWhen: c => c.doc.picked >= 2, because: { simple: 'you picked more than one shape', pro: 'multi-selection' },
    teach: { simple: 'Line shapes up, or put one in the middle of another.', pro: 'Align min / centre / max per axis.' } }),
  tool({ id: 'ungroup', label: 'Ungroup', level: 'core', alias: 'Ctrl+Shift+G',
    appearsWhen: c => c.doc.groups > 0, because: { simple: 'you made a group, and you can take it apart again', pro: 'groups present' },
    teach: { simple: 'Split a group back into its shapes.', pro: 'Ungroup.' } }),
  tool({ id: 'drop', label: 'Drop', level: 'core', alias: 'D',
    appearsWhen: c => c.doc.floating, because: { simple: 'a shape is floating above the plate, and printers need it to sit down', pro: 'selection is off the bed' },
    teach: { simple: 'Drop the shape down so it sits on the plate.', pro: 'Drop to bed.' } }),
  tool({ id: 'top', label: 'Top view', level: 'core',
    appearsWhen: c => c.doc.shapes >= 3, because: { simple: 'there are lots of shapes, and looking from above helps line them up', pro: 'busy plate' },
    teach: { simple: 'Look straight down from above.', pro: 'Top orthographic-style view.' } }),

  tool({ id: 'mirror', label: 'Mirror', level: 'pro', after: ['turn', 'duplicate'], teach: { simple: 'Flip it, like in a mirror.', pro: 'Mirror across X.' } }),
  tool({ id: 'snap', label: 'Snap grid', level: 'pro', after: ['move', 'stretch'], teach: { simple: 'Choose how far shapes jump when you move them.', pro: 'Snap increment.' } }),
];

let done = false;
/** Registers the Studio tools once. */
export function registerStudioTools(): void {
  if (done) return; done = true;
  registry.register(...STUDIO_TOOLS);
}

// ---------------------------------------------------------------- what Aria knows about the plate
import type { RoomState } from '../workspace/askAria';
import type { Shape, PrintReport, Audience } from './studio/shapes';

const mm = (v: number) => `${Math.round(v * 10) / 10}`;
const dims = (v: number[]) => `${v.map(mm).join(' × ')} mm`;
const FOR: Record<Audience, string> = { under3: 'a child under 3', kids: 'kids', teens: 'teens', adults: 'adults' };
const named = (s: Shape) => s.kind === 'group' ? `a group of ${s.children?.length ?? 0} (${(s.children ?? []).map(c => c.name).slice(0, 4).join(', ')})` : `${s.name}${s.hole ? ' (a hole)' : ''}`;

/** The plate in words: what's on it, what's picked, how big it prints, and the print check's warnings. */
export function studioRoomState(o: { title: string; shapes: Shape[]; picked: Shape[]; report: PrintReport | null; audience: Audience }): RoomState {
  const { shapes, picked, report } = o;
  if (!shapes.length) return { building: `${o.title || 'A new design'}: the plate is empty so far.`, lines: [`It is for ${FOR[o.audience]}.`] };
  const list = shapes.slice(0, 8).map(named);
  const building = `${o.title || 'A design'} with ${shapes.length} shape${shapes.length > 1 ? 's' : ''} on the plate: ${list.join(', ')}${shapes.length > 8 ? ', and more' : ''}.`;
  const lines: string[] = [`It is for ${FOR[o.audience]}.`];
  lines.push(picked.length ? `Picked: ${picked.slice(0, 4).map(s => `${named(s)}, ${dims(s.size)}`).join('; ')}.` : 'Nothing is picked right now.');
  if (report && report.volume > 0) lines.push(`It prints ${dims(report.size)}, about ${Math.max(1, Math.round(report.grams))} g of PLA, about ${report.minutes < 90 ? `${report.minutes} minutes` : `${Math.round(report.minutes / 6) / 10} hours`}.`);
  const issues = (report?.findings ?? []).filter(f => f.level !== 'info').map(f => f.text);
  return { building, lines, issues };
}
