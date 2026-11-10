// The guided path from an idea to a set of drawings a builder could price, in the order architects
// actually work. Each step explains what we're doing, why it matters and how to do it, in plain
// words (Simple) and in the trade's own terms (Pro). Whether a step is done is read from the
// drawing itself, never ticked by hand, so the guide stays honest as people edit freely.

import type { CadModel, CadEntity2D } from '../model';
import { MM_PER_UNIT } from '../model';
import type { Room } from '../rooms';
import type { Finding } from '../codeCheck';
import { parseLibraryBlock } from '../schedules';
import { pointInPoly } from '../rooms';
import { openingsOfRoom, isExteriorAt, BEDROOM } from './homeChecks';
import { ROOM_KINDS, kindsOf, programRooms, type Program, type RoomKind } from './programs';
import { feelArea, sizeVerdict } from './sizeSense';
import { buildableArea, insideSetbacks } from './starters';

export type Level = 'simple' | 'pro';
type Two = { simple: string; pro: string };
export type GuideAction =
  | { kind: 'program' } | { kind: 'lot' } | { kind: 'shell' }
  | { kind: 'tool'; tool: 'wall' | 'roomtag' | 'dimension' | 'select' | 'measure'; label: Two }
  | { kind: 'place'; item: string; label: Two }
  | { kind: 'checks' } | { kind: 'view3d' } | { kind: 'ack'; label: Two };

export interface Word { term: string; simple: string }
export interface Step {
  id: StepId; title: Two; what: Two; why: Two; how: { simple: string[]; pro: string[] };
  words: Word[]; actions: GuideAction[]; optional?: boolean;
}
export type StepId = 'idea' | 'land' | 'shell' | 'rooms' | 'openings' | 'fixtures' | 'check' | 'see3d' | 'sheets' | 'realworld';

export const STEPS: Step[] = [
  { id: 'idea', title: { simple: 'Your idea', pro: 'Program' },
    what: { simple: 'Decide who will live here and what rooms they need.', pro: 'Set the program: the spaces, counts and target areas the design must hold.' },
    why: { simple: 'Builders can\'t start until everyone agrees what the house is for. A list of rooms is the plan for the plan.', pro: 'The program drives area, cost and code path. Changing it after walls are drawn costs far more than changing it now.' },
    how: { simple: ['Pick a starting idea below, like a cottage or a tiny house.', 'You can rename or add rooms later.'], pro: ['Choose a starter program or define your own spaces.', 'Target areas are typical ranges, not code minimums.'] },
    words: [{ term: 'Program', simple: 'The list of rooms a building needs.' }, { term: 'Client', simple: 'The person the building is for.' }],
    actions: [{ kind: 'program' }] },
  { id: 'land', optional: true, title: { simple: 'Your land', pro: 'Site and setbacks' },
    what: { simple: 'Draw the land the house sits on, and the line it has to stay inside.', pro: 'Lay out the property line and zoning setbacks to find the buildable envelope.' },
    why: { simple: 'Towns keep space between houses and the street so there\'s light, air, and room for fire trucks. Building over the line isn\'t allowed.', pro: 'Setbacks come from the local zoning code; they cap the footprint before any other rule. Confirm them with a survey and the zoning office.' },
    how: { simple: ['Type how big the land is and press "Draw my land".', 'The orange line is where you\'re allowed to build.'], pro: ['Enter lot dimensions and front/side/rear setbacks.', 'Layers C-PROP and C-SETB. Typical residential setbacks are 6 m front, 1.5 m side, 6 m rear; yours will differ.'] },
    words: [{ term: 'Property line', simple: 'The edge of the land you own.' }, { term: 'Setback', simple: 'How far a house must stay from the edge of the land.' }, { term: 'Zoning', simple: 'The town\'s rules for what can be built where.' }],
    actions: [{ kind: 'lot' }] },
  { id: 'shell', title: { simple: 'Outside walls', pro: 'Building shell' },
    what: { simple: 'Draw the outside walls: the shape of the house from above.', pro: 'Draft the exterior wall footprint as a closed loop.' },
    why: { simple: 'The outside walls hold up the roof and keep the weather out. Everything else goes inside them.', pro: 'A closed shell defines the conditioned envelope; rooms are detected from enclosed wall loops, so the loop has to close.' },
    how: { simple: ['Press "Make the walls for me", or pick the Wall tool and click each corner.', 'Click back on the first corner (or type C) to close the shape.'], pro: ['Wall tool (W): click corners, C to close, type a number first to set thickness.', 'Exterior walls default to 250 mm, 2700 mm high.'] },
    words: [{ term: 'Floor plan', simple: 'A drawing of a building seen from above, like the roof was lifted off.' }, { term: 'Footprint', simple: 'The shape the house makes on the ground.' }],
    actions: [{ kind: 'shell' }, { kind: 'tool', tool: 'wall', label: { simple: 'Draw walls myself', pro: 'Wall tool (W)' } }] },
  { id: 'rooms', title: { simple: 'Rooms inside', pro: 'Interior partitions and rooms' },
    what: { simple: 'Split the inside into rooms with walls, then give each room its name.', pro: 'Add interior partitions and tag every space against the program.' },
    why: { simple: 'Naming rooms lets Plajah check each one: is the bedroom big enough? Does it have a window?', pro: 'Room tags drive areas, schedules and the code checks for each space.' },
    how: { simple: ['Use the Wall tool to draw walls inside, wall to wall.', 'Then pick Name a room, click inside it and type its name.', 'One room can be two things: name it "Living / Kitchen".'], pro: ['Interior partitions: type 120 before drawing for a 120 mm wall.', 'Room tag (RT): click inside, type the name; area updates live.'] },
    words: [{ term: 'Partition', simple: 'An inside wall that splits rooms.' }, { term: 'Square metres / feet', simple: 'How much floor a room has.' }],
    actions: [{ kind: 'tool', tool: 'wall', label: { simple: 'Draw inside walls', pro: 'Wall tool (W)' } }, { kind: 'tool', tool: 'roomtag', label: { simple: 'Name a room', pro: 'Room tag (RT)' } }] },
  { id: 'openings', title: { simple: 'Doors and windows', pro: 'Openings' },
    what: { simple: 'Put a door into every room and windows where you want light.', pro: 'Place doors for circulation and egress, and windows for light, ventilation and escape.' },
    why: { simple: 'You need to get into every room, and out of the house fast in an emergency. Bedrooms need a window big enough to climb out of.', pro: 'Egress door (R311.2), bedroom emergency escape openings (R310), natural light and ventilation (R303).' },
    how: { simple: ['Pick a door, then click on a wall where it goes.', 'Press R to turn it, F to flip which way it opens.'], pro: ['Openings host into the nearest wall; R rotates 90°, F flips the swing.', 'Door and window schedules fill in from what you place.'] },
    words: [{ term: 'Swing', simple: 'Which way a door opens.' }, { term: 'Egress', simple: 'A way out of the building.' }],
    actions: [{ kind: 'place', item: 'door-single', label: { simple: 'Add a door', pro: 'Single swing door' } }, { kind: 'place', item: 'window-casement', label: { simple: 'Add a window', pro: 'Casement window' } }] },
  { id: 'fixtures', title: { simple: 'Kitchen and bathroom', pro: 'Fixtures and equipment' },
    what: { simple: 'Add the sink, stove and fridge to the kitchen, and the toilet, sink and shower to the bathroom.', pro: 'Lay out plumbing fixtures and kitchen appliances.' },
    why: { simple: 'Pipes and wires are planned around these. Bathrooms and kitchens next to each other share pipes, which saves money.', pro: 'Fixture locations set the plumbing stacks and electrical circuits; stacking wet walls cuts cost.' },
    how: { simple: ['Pick each item below and click it into place.', 'Turn things with R so they face into the room.'], pro: ['Insert from the library; parameters set real sizes.', 'Check the work triangle and fixture clearances.'] },
    words: [{ term: 'Fixture', simple: 'Something fixed in place that uses water, like a sink or toilet.' }, { term: 'Work triangle', simple: 'The path between sink, stove and fridge.' }],
    actions: [{ kind: 'place', item: 'sink-kitchen', label: { simple: 'Kitchen sink', pro: 'Kitchen sink' } }, { kind: 'place', item: 'range', label: { simple: 'Stove', pro: 'Range' } }, { kind: 'place', item: 'fridge', label: { simple: 'Fridge', pro: 'Refrigerator' } }, { kind: 'place', item: 'wc', label: { simple: 'Toilet', pro: 'WC' } }, { kind: 'place', item: 'basin', label: { simple: 'Bathroom sink', pro: 'Lavatory' } }, { kind: 'place', item: 'shower', label: { simple: 'Shower', pro: 'Shower' } }, { kind: 'place', item: 'smoke', label: { simple: 'Smoke alarm', pro: 'Smoke alarm' } }] },
  { id: 'check', title: { simple: 'Safety check', pro: 'Code pre-check' },
    what: { simple: 'Let Plajah check your house for safety and comfort problems.', pro: 'Resolve the residential (IRC) and accessibility (ADA) pre-check findings.' },
    why: { simple: 'Building rules exist because people got hurt when houses were built without them. Fixing problems on paper is free; fixing them after building is not.', pro: 'Clearing pre-check findings now cuts plan-review comments. It doesn\'t replace review by the authority having jurisdiction.' },
    how: { simple: ['Red marks on the plan show problems. Click one to see what\'s wrong.', 'Fix it, and the mark turns green by itself.'], pro: ['Findings are recomputed on every edit and listed under Schedules with citations.', 'Accessibility checks apply to toilet rooms and doors where ADA applies.'] },
    words: [{ term: 'Building code', simple: 'The safety rules every new building has to follow.' }, { term: 'Inspector', simple: 'The person who checks the building is safe.' }],
    actions: [{ kind: 'checks' }] },
  { id: 'see3d', title: { simple: 'See it in 3D', pro: '3D model' },
    what: { simple: 'Turn your flat drawing into a 3D house you can spin around.', pro: 'Review the BIM model generated from the plan.' },
    why: { simple: 'It\'s easier to spot a strange room when you can see it. Builders and families understand 3D faster than plans.', pro: 'The same model exports to IFC for consultants; checking massing and openings in 3D catches plan errors.' },
    how: { simple: ['Press "Show 3D". Drag to spin it, scroll to zoom.'], pro: ['3D toggle in the top bar; IFC export from the same model.'] },
    words: [{ term: 'BIM', simple: 'A 3D model where every wall and door knows what it is.' }],
    actions: [{ kind: 'view3d' }] },
  { id: 'sheets', title: { simple: 'Make the drawings', pro: 'Drawing set' },
    what: { simple: 'Add the things every real plan has: measurements, a north arrow, a scale bar and a title box.', pro: 'Annotate for issue: dimensions, north arrow, scale bar and title block.' },
    why: { simple: 'Builders build exactly what the drawing says, so the drawing has to show sizes and which way is north.', pro: 'Dimensioned, titled sheets are what contractors price and what the building office reviews.' },
    how: { simple: ['Use Measure line to label the outside walls.', 'Add the north arrow, scale bar and title box from the buttons below.'], pro: ['DIM for overall and room dimensions; overall first, then openings.', 'Title block carries project, sheet, scale and date.'] },
    words: [{ term: 'Scale', simple: 'How much smaller the drawing is than the real thing, like 1:100.' }, { term: 'Title block', simple: 'The box that says what the drawing is and who made it.' }],
    actions: [{ kind: 'tool', tool: 'dimension', label: { simple: 'Measure line', pro: 'Dimension (DIM)' } }, { kind: 'place', item: 'north-arrow', label: { simple: 'North arrow', pro: 'North arrow' } }, { kind: 'place', item: 'scale-bar', label: { simple: 'Scale bar', pro: 'Scale bar' } }, { kind: 'place', item: 'title-block', label: { simple: 'Title box', pro: 'Title block' } }] },
  { id: 'realworld', title: { simple: 'Who builds it', pro: 'From drawings to building' },
    what: { simple: 'Learn who helps turn your drawing into a real house.', pro: 'The path from design to permit to construction, and who signs off at each stage.' },
    why: { simple: 'Almost nobody builds a house alone. Your drawing is how you explain your idea to the people who do.', pro: 'Most jurisdictions need stamped structural (and sometimes architectural) drawings, a permit and inspections. Plajah output is a design starting point.' },
    how: { simple: ['An architect or designer turns your idea into full plans.', 'An engineer makes sure it won\'t fall down.', 'The town checks the plans and gives a permit.', 'A builder and tradespeople build it, and inspectors check their work.'], pro: ['Design development, then construction documents by a licensed professional where required.', 'Structural engineering: foundations, framing, lateral and loads.', 'Permit submission to the authority having jurisdiction; inspections at footing, framing, MEP rough-in and final.', 'Bid and build with a licensed general contractor.'] },
    words: [{ term: 'Architect', simple: 'A licensed person who designs buildings.' }, { term: 'Engineer', simple: 'Makes sure the building is strong enough.' }, { term: 'Permit', simple: 'Permission from the town to build.' }, { term: 'Contractor', simple: 'The company that builds it.' }],
    actions: [{ kind: 'ack', label: { simple: 'Got it', pro: 'Understood' } }] },
];

export interface GuideFlags { program?: Program | null; seen3d?: boolean; ack?: boolean }
export interface Line { ok: boolean | null; text: string }
export interface StepState { id: StepId; done: boolean; lines: Line[] }

const kindsIn = (rooms: Room[]) => rooms.map(r => { const kinds = r.name ? kindsOf(r.name) : []; return { r, kinds, kind: kinds[0] ?? null }; });
const libIds = (m: CadModel) => m.entities.map(e => (e.type === 'insert' ? { e, id: parseLibraryBlock(e.block)?.item.id } : null)).filter((x): x is { e: Extract<CadEntity2D, { type: 'insert' }>; id: string | undefined } => !!x);

/** Live state of every step, read from the drawing. */
export function evaluate(m: CadModel, rooms: Room[], findings: Finding[], f: GuideFlags, level: Level = 'simple'): StepState[] {
  const k = MM_PER_UNIT[m.units] || 1; const imp = m.units === 'in' || m.units === 'ft';
  const showArea = (m2: number) => (imp ? `${Math.round(m2 * 10.764)} sq ft` : `${m2.toFixed(1)} m²`);
  const S = (simple: string, pro: string) => (level === 'simple' ? simple : pro);
  const walls = m.entities.filter(e => e.type === 'wall'); const lib = libIds(m); const tagged = kindsIn(rooms);
  const out: StepState[] = [];

  // Idea
  const want = f.program ? programRooms(f.program) : [];
  out.push({ id: 'idea', done: !!f.program, lines: f.program ? [{ ok: true, text: `${f.program.name}: ${want.map(r => r.name).join(', ')}.` }] : [{ ok: null, text: S('Pick an idea to start.', 'No program set.') }] });

  // Land
  const lot = buildableArea(m); const inside = insideSetbacks(m);
  out.push({ id: 'land', done: !!lot, lines: !lot ? [{ ok: null, text: S('Optional: skip this if you just want to try ideas.', 'Optional. No lot drawn.') }]
    : [{ ok: true, text: S(`You can build on ${feelArea((lot.x1 - lot.x0) * (lot.y1 - lot.y0) / 1e6)}.`, `Buildable envelope ${showArea((lot.x1 - lot.x0) * (lot.y1 - lot.y0) / 1e6)}.`) },
       ...(walls.length ? [{ ok: inside, text: inside ? S('The house is inside the line.', 'Footprint within setbacks.') : S('Part of the house crosses the orange line. Move it inside.', 'Footprint encroaches on a setback.') }] : [])] });

  // Shell
  const shellOk = rooms.length > 0;
  const gross = rooms.reduce((s, r) => s + r.grossArea * k * k / 1e6, 0);
  out.push({ id: 'shell', done: shellOk, lines: shellOk ? [{ ok: true, text: S(`Your house covers ${showArea(gross)}: ${feelArea(gross)}.`, `Enclosed: ${showArea(gross)} gross (centreline).`) }]
    : walls.length ? [{ ok: false, text: S('The walls don\'t make a closed shape yet. Join the last wall back to the first corner.', 'Walls drawn but no enclosed loop yet.') }] : [{ ok: null, text: S('No walls yet.', 'No walls.') }] });

  // Rooms
  const roomLines: Line[] = []; let roomsDone = rooms.length > 0 && rooms.every(r => !!r.name);
  const named = rooms.filter(r => r.name);
  for (const { r, kind } of tagged) {
    if (!r.name) continue; const m2 = r.area * k * k / 1e6; const info = kind ? ROOM_KINDS[kind] : null;
    const v = info ? sizeVerdict(m2, info.typical) : null;
    roomLines.push({ ok: v === 'small' ? false : true, text: S(`${r.name}: ${showArea(m2)}, ${feelArea(m2)}${v === 'small' ? '. That\'s small for a ' + info!.label.toLowerCase() : v === 'roomy' ? '. Roomy!' : ''}.`, `${r.name}: ${showArea(m2)}${info ? ` (typical ${showArea(info.typical[0])}–${showArea(info.typical[1])})` : ''}`) });
  }
  const untagged = rooms.length - named.length;
  if (untagged > 0) roomLines.push({ ok: false, text: S(`${untagged} room${untagged > 1 ? 's have' : ' has'} no name yet.`, `${untagged} untagged space${untagged > 1 ? 's' : ''}.`) });
  if (want.length) {
    const have = new Map<RoomKind, number>(); for (const { kinds } of tagged) for (const kd of kinds) have.set(kd, (have.get(kd) ?? 0) + 1);
    const need = new Map<RoomKind, number>(); for (const r of want) need.set(r.kind, (need.get(r.kind) ?? 0) + 1);
    for (const [kind, n] of need) { const h = have.get(kind) ?? 0; if (h < n) { roomsDone = false; roomLines.push({ ok: false, text: S(`Still need ${n - h} more: ${ROOM_KINDS[kind].label.toLowerCase()}${n - h > 1 ? 's' : ''}.`, `Program short: ${ROOM_KINDS[kind].label} ${h}/${n}.`) }); } }
  }
  if (!rooms.length) roomLines.push({ ok: null, text: S('Finish the outside walls first.', 'Needs a closed shell.') });
  out.push({ id: 'rooms', done: roomsDone, lines: roomLines });

  // Openings
  const openLines: Line[] = []; let openDone = rooms.length > 0;
  for (const r of named) {
    const ops = openingsOfRoom(r, m.entities); const doors = ops.filter(o => o.opening.kind !== 'window'); const wins = ops.filter(o => o.opening.kind === 'window');
    if (!doors.length) { openDone = false; openLines.push({ ok: false, text: S(`${r.name} has no door. How would you get in?`, `${r.name}: no door or opening.`) }); }
    if (BEDROOM.test(r.name!) && !wins.some(o => isExteriorAt(o.wall, o.centre, rooms))) { openDone = false; openLines.push({ ok: false, text: S(`${r.name} needs a window in an outside wall to climb out of in a fire.`, `${r.name}: no emergency escape opening (R310).`) }); }
  }
  const outsideDoor = walls.some(w => w.type === 'wall' && w.openings.some(o => o.kind === 'door' && isExteriorAt(w, centreOf(w, o), rooms)));
  if (rooms.length && !outsideDoor) { openDone = false; openLines.push({ ok: false, text: S('The house needs a front door in an outside wall.', 'No exterior door.') }); }
  if (openDone) openLines.push({ ok: true, text: S('Every room has a way in, and every bedroom has a way out.', 'Circulation and egress openings in place.') });
  out.push({ id: 'openings', done: openDone && named.length > 0, lines: openLines });

  // Fixtures
  const fixLines: Line[] = []; let fixDone = false;
  let anyWet = false;
  for (const { r, kinds } of tagged) {
    const wet = kinds.filter(x => x === 'kitchen' || x === 'bath' || x === 'studio'); if (!wet.length) continue; if (!anyWet) fixDone = true; anyWet = true;
    const needs = [...new Set(wet.flatMap(x => ROOM_KINDS[x].needs))];
    const inRoom = lib.filter(x => pointInPoly([x.e.at[0], x.e.at[1]], r.outline)).map(x => x.id);
    const missing = needs.filter(n => !n.split('|').some(id => inRoom.includes(id)));
    if (missing.length) { fixDone = false; fixLines.push({ ok: false, text: S(`${r.name} still needs: ${missing.map(nice).join(', ')}.`, `${r.name}: missing ${missing.join(', ')}.`) }); }
    else fixLines.push({ ok: true, text: S(`${r.name} has everything it needs.`, `${r.name}: fixtures complete.`) });
  }
  if (!fixLines.length) fixLines.push({ ok: null, text: S('Name a room "Kitchen" or "Bathroom" first.', 'No kitchen or bath tagged.') });
  out.push({ id: 'fixtures', done: fixDone, lines: fixLines });

  // Check
  const fails = findings.filter(x => x.status === 'fail'); const warns = findings.filter(x => x.status === 'warn');
  out.push({ id: 'check', done: rooms.length > 0 && findings.length > 0 && fails.length === 0, lines: findings.length
    ? [{ ok: fails.length === 0, text: fails.length ? S(`${fails.length} thing${fails.length > 1 ? 's' : ''} to fix. Tap one to see where.`, `${fails.length} failing, ${warns.length} warnings, ${findings.length - fails.length - warns.length} passing.`) : S(`All ${findings.length} checks pass${warns.length ? `, with ${warns.length} reminder${warns.length > 1 ? 's' : ''}` : ''}.`, `0 failing, ${warns.length} warnings.`) }]
    : [{ ok: null, text: S('Checks start once there are rooms, doors and windows.', 'Nothing to check yet.') }] });

  // 3D
  out.push({ id: 'see3d', done: !!f.seen3d, lines: [{ ok: f.seen3d ? true : null, text: f.seen3d ? S('You\'ve seen it in 3D.', '3D reviewed.') : S('Not looked at in 3D yet.', 'Not reviewed in 3D.') }] });

  // Sheets
  const dims = m.entities.filter(e => e.type === 'dimension').length; const has = (id: string) => lib.some(x => x.id === id);
  const sheetItems: Array<[boolean, string, string]> = [[dims > 0, 'measurements', 'dimensions'], [has('north-arrow'), 'a north arrow', 'north arrow'], [has('scale-bar'), 'a scale bar', 'scale bar'], [has('title-block'), 'a title box', 'title block']];
  out.push({ id: 'sheets', done: sheetItems.every(x => x[0]), lines: sheetItems.map(([ok, s, p]) => ({ ok, text: S(ok ? `Has ${s}.` : `Needs ${s}.`, `${p}: ${ok ? 'yes' : 'missing'}`) })) });

  out.push({ id: 'realworld', done: !!f.ack, lines: [] });
  return out;
}

function centreOf(w: Extract<CadEntity2D, { type: 'wall' }>, o: { at: number; width: number }): [number, number] {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; const t = (o.at + o.width / 2) / L;
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
}
const NICE: Record<string, string> = { wc: 'a toilet', basin: 'a sink', 'bathtub|shower': 'a bath or shower', 'sink-kitchen': 'a sink', range: 'a stove', fridge: 'a fridge', bed: 'a bed', wardrobe: 'a wardrobe', sofa: 'a sofa', desk: 'a desk', car: 'a car space', 'table-dining|table-round': 'a table' };
const nice = (id: string) => NICE[id] ?? id;

/** First step that still needs doing (optional steps are skipped once anything later is done). */
export function currentStep(states: StepState[]): StepId {
  const later = (i: number) => states.slice(i + 1).some(s => s.done);
  const s = states.find((x, i) => !x.done && !(STEPS[i].optional && later(i)));
  return (s ?? states[states.length - 1]).id;
}
