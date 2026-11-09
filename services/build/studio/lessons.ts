// Build Studio lessons: step-by-step builds with checkpoints that tick themselves off as the
// student works. Each check reads the project (and what has happened while running), never the
// screen, so a teacher can trust a finished lesson.

import type { StudioProject } from './project';
import { BOARDS, connect, legNet, pinKey, type CircuitProject } from './breadboard';
import { walk, type Stmt } from './blocks';
import { shapeBounds, type Shape } from './shapes';

export interface LessonCtx { exported: boolean; ran: boolean; litLeds: Set<string>; sentToMake: boolean }
export interface LessonStep { title: string; body: string; hint?: string; check?: (p: StudioProject, ctx: LessonCtx) => boolean }
export interface Lesson { id: string; title: string; level: 'K-2' | '3-5' | '6-8' | '9-12'; mode: '3d' | 'circuit'; minutes: number; goal: string; starter?: string; steps: LessonStep[] }

const flat = (ss: Shape[]): Shape[] => ss.flatMap(s => (s.kind === 'group' ? [s, ...flat(s.children ?? [])] : [s]));
const all = (p: StudioProject) => flat(p.scene.shapes);
const stmts = (p: StudioProject) => { const out: Stmt[] = []; walk(p.program.setup, s => out.push(s)); walk(p.program.loop, s => out.push(s)); return out; };
/** LEDs wired properly: anode to a board pin, cathode through a resistor to GND. */
export function wiredLeds(c: CircuitProject): string[] {
  if (!c.board) return []; const n = connect(c); const gnd = n.find(pinKey('GND'));
  const io = BOARDS[c.board].pins.filter(p => p.kind === 'io').map(p => n.find(pinKey(p.id)));
  return c.parts.filter(p => p.kind === 'led').filter(led => {
    const a = legNet(n, led, 'A'), k = legNet(n, led, 'K'); if (!io.includes(a)) return false;
    return c.parts.some(r => r.kind === 'resistor' && ((legNet(n, r, '1') === k && legNet(n, r, '2') === gnd) || (legNet(n, r, '2') === k && legNet(n, r, '1') === gnd)))
      || c.parts.some(r => r.kind === 'resistor' && legNet(n, r, '1') !== legNet(n, r, '2') && [legNet(n, r, '1'), legNet(n, r, '2')].includes(a) && k === gnd);
  }).map(p => p.id);
}

export const LESSONS: Lesson[] = [
  { id: 'keychain-101', title: 'Make your own keychain', level: '3-5', mode: '3d', minutes: 30, goal: 'A keychain with your name and a hole for the ring, ready to print.', steps: [
    { title: 'Drop a box', body: 'Drag a Box from the shapes on the left onto the workplane (or click it). This will be the tag.', check: p => all(p).some(s => s.kind === 'box' && !s.hole) },
    { title: 'Make it tag-sized', body: 'With the box selected, type its size: about 50 mm long, 25 mm wide and 3 mm tall.', hint: 'Use the Size boxes in the panel on the right: W 50, D 25, H 3.', check: p => all(p).some(s => s.kind === 'box' && !s.hole && s.size[0] >= 40 && s.size[1] >= 18 && s.size[2] <= 5 && s.size[2] >= 2) },
    { title: 'Add your name', body: 'Drag in Letters, type your name, and lift them so they sit on top of the tag (Lift = 3 mm).', hint: 'Set the letters\' height to about 1.5 mm and Lift to 3 so they stand on the tag.', check: p => all(p).some(s => s.kind === 'text' && !s.hole && (s.text ?? '').trim().length > 0 && shapeBounds(s).min[2] >= 2.4) },
    { title: 'Make a hole for the ring', body: 'Drag in a Cylinder, make it about 5 mm wide, turn it into a Hole and move it near one end of the tag.', check: p => all(p).some(s => (s.kind === 'cylinder' || s.kind === 'box') && s.hole) },
    { title: 'Group to cut the hole', body: 'Select the tag and the hole together (Shift-click) and press Group. The hole cuts through the tag.', check: p => p.scene.shapes.some(s => s.kind === 'group' && (s.children ?? []).some(k => k.hole)) },
    { title: 'Check and export', body: 'Open Print check: no red problems. Then Export STL (or Send to Make) to print it.', check: (_p, c) => c.exported || c.sentToMake },
  ] },
  { id: 'name-tag-101', title: 'My name tag', level: 'K-2', mode: '3d', minutes: 20, goal: 'A plate with your name on it.', steps: [
    { title: 'Put down a plate', body: 'Click Box. Make it long and flat: 80 wide, 30 deep, 3 tall.', check: p => all(p).some(s => s.kind === 'box' && s.size[0] >= 60 && s.size[2] <= 5) },
    { title: 'Write your name', body: 'Click Letters and type your name in the box on the right.', check: p => all(p).some(s => s.kind === 'text' && (s.text ?? '').trim().length > 1 && s.text !== 'PLAJAH') },
    { title: 'Stand it on the plate', body: 'Set Lift to 3 so your name sits on top of the plate.', check: p => all(p).some(s => s.kind === 'text' && shapeBounds(s).min[2] >= 2.4) },
    { title: 'Add a heart or a star', body: 'Add a Heart or a Star and put it on the plate too.', check: p => all(p).some(s => s.kind === 'heart' || s.kind === 'star') },
  ] },
  { id: 'blink-101', title: 'Blink an LED', level: 'K-2', mode: 'circuit', minutes: 20, goal: 'An LED that blinks on and off, written in blocks.', steps: [
    { title: 'Pick a board', body: 'Choose Arduino Uno in the board menu.', check: p => !!p.circuit.board },
    { title: 'Place an LED and a resistor', body: 'Click LED, then click a hole in the breadboard. Do the same with a Resistor in the next column so its leg shares a strip with the LED\'s short leg.', check: p => p.circuit.parts.some(x => x.kind === 'led') && p.circuit.parts.some(x => x.kind === 'resistor') },
    { title: 'Wire it up', body: 'Click a board pin (13), then a hole in the LED\'s long-leg column. Wire the resistor\'s other end to GND.', hint: 'Every hole in a column of five is joined. The blue rail is GND once a wire joins it to the board\'s GND.', check: p => wiredLeds(p.circuit).length >= 1 },
    { title: 'Write the program', body: 'In blocks: "when it starts" set pin 13 to OUTPUT. "Forever": turn pin 13 on, wait 500 ms, turn it off, wait 500 ms.', check: p => stmts(p).some(s => s.t === 'digitalWrite' && s.value === 'HIGH') && stmts(p).some(s => s.t === 'digitalWrite' && s.value === 'LOW') && stmts(p).some(s => s.t === 'delay') },
    { title: 'Run it', body: 'Press Run and watch it blink.', check: (_p, c) => c.ran && c.litLeds.size >= 1 },
  ] },
  { id: 'traffic-light-101', title: 'Build a traffic light', level: '3-5', mode: 'circuit', minutes: 45, goal: 'Three lights taking turns, built on a breadboard and coded in blocks.', steps: [
    { title: 'Pick a board', body: 'Choose Arduino Uno. Wire its GND to the blue (−) rail at the bottom.', check: p => !!p.circuit.board && p.circuit.wires.some(w => w.a === pinKey('GND') || w.b === pinKey('GND')) },
    { title: 'Three LEDs', body: 'Place a red, a yellow and a green LED on the breadboard, a few columns apart.', hint: 'Select an LED to change its colour in the panel.', check: p => ['red', 'yellow', 'green'].every(c => p.circuit.parts.some(x => x.kind === 'led' && x.params.color === c)) },
    { title: 'A resistor for each', body: 'Each LED needs its own 220 Ω resistor from its short leg (−) to the GND rail. Without one, the LED burns out.', check: p => p.circuit.parts.filter(x => x.kind === 'resistor').length >= 3 },
    { title: 'Wire each LED to a pin', body: 'Wire red to pin 13, yellow to 12 and green to 11 (long legs).', check: p => wiredLeds(p.circuit).length >= 3 },
    { title: 'Code the light sequence', body: 'Set the three pins to OUTPUT. Forever: red on, wait 3 s, red off; green on, wait 3 s, green off; yellow on, wait 1 s, yellow off.', check: p => new Set(stmts(p).filter(s => s.t === 'digitalWrite').map(s => (s as { pin: string }).pin)).size >= 3 && stmts(p).filter(s => s.t === 'delay').length >= 2 },
    { title: 'Run it', body: 'Press Run. Every light should take its turn.', check: (p, c) => c.ran && p.circuit.parts.filter(x => x.kind === 'led').every(l => c.litLeds.has(l.id)) },
  ] },
];
export const lessonById = (id?: string) => LESSONS.find(l => l.id === id);
