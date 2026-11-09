// Build Studio starter projects: finished examples a class can open, change and print or run.
// STUDIO_STARTERS is the contract the Academia STEM track reads; buildStarter makes the project.

import { makeShape, groupShapes, type Shape } from './shapes';
import { holeKey, pinKey, type CircuitProject, type SPart, type SWire } from './breadboard';
import { sid, num, type Program, type Stmt, type StmtInput, type Expr } from './blocks';
import { blankProject, type StudioProject } from './project';

export interface StudioStarter { id: string; title: string; level: 'K-2' | '3-5' | '6-8' | '9-12'; mode: '3d' | 'circuit' | 'code'; about: string }
export const STUDIO_STARTERS: StudioStarter[] = [
  { id: 'name-tag', title: 'Name tag', level: 'K-2', mode: '3d', about: 'A plate with your name in raised letters and a heart.' },
  { id: 'keychain', title: 'Keychain', level: '3-5', mode: '3d', about: 'Your name on a tag with a hole for the key ring.' },
  { id: 'phone-stand', title: 'Phone stand', level: '6-8', mode: '3d', about: 'A ramp that holds a phone up, with a lip so it cannot slide.' },
  { id: 'blink', title: 'Blink an LED', level: 'K-2', mode: 'code', about: 'The first program everyone writes: on, wait, off, wait.' },
  { id: 'traffic-light', title: 'Traffic light', level: '3-5', mode: 'circuit', about: 'Red, green and yellow LEDs taking turns.' },
  { id: 'nightlight', title: 'Nightlight', level: '3-5', mode: 'circuit', about: 'A light sensor turns the LED on when it gets dark.' },
  { id: 'reaction-game', title: 'Reaction game', level: '6-8', mode: 'circuit', about: 'Wait for the light, hit the button: the serial monitor shows your time.' },
  { id: 'servo-sweep', title: 'Servo sweep', level: '6-8', mode: 'code', about: 'Turn a servo motor back and forth with a loop.' },
  { id: 'distance-alarm', title: 'Distance alarm', level: '9-12', mode: 'code', about: 'An ultrasonic sensor beeps faster as things get closer.' },
  { id: 'pico-blink', title: 'Pico blink (MicroPython)', level: '6-8', mode: 'code', about: 'Blink on a Raspberry Pi Pico and read the MicroPython it makes.' },
];

// ---------------------------------------------------------------- tiny builders

let w = 0;
const wire = (a: string, b: string, color = '#2b8a3e'): SWire => ({ id: `w${Date.now().toString(36)}${w++}`, a, b, color });
const H = holeKey; const PIN = pinKey;
const part = (kind: SPart['kind'], ref: string, col: number, y: number, rot = 0, params: SPart['params'] = {}): SPart => ({ id: `${ref.toLowerCase()}_${Date.now().toString(36)}${w++}`, kind, ref, col, y, rot, params });
const RED = '#e03131', BLACK = '#212529';
/** LED at column c with its 220 Ω resistor down to the ground rail, driven from a board pin. */
function ledOnPin(c: number, color: string, pin: string, n: number): { parts: SPart[]; wires: SWire[] } {
  return { parts: [part('led', `LED${n}`, c, 5, 0, { color }), part('resistor', `R${n}`, c + 1, 7, 1, { R: 220 })], wires: [wire(PIN(pin), H(c, 3), '#f08c00'), wire(H(c + 1, 13), H(c + 1, 16), BLACK)] };
}
const power = (): SWire[] => [wire(PIN('5V'), H(1, 15), RED), wire(PIN('GND'), H(1, 16), BLACK)];
const st = (s: StmtInput): Stmt => ({ id: sid(), ...s } as Stmt);
const out = (pin: string) => st({ t: 'pinMode', pin, mode: 'OUTPUT' });
const dw = (pin: string, high: boolean) => st({ t: 'digitalWrite', pin, value: high ? 'HIGH' : 'LOW' });
const wait = (ms: number | Expr) => st({ t: 'delay', ms: typeof ms === 'number' ? num(ms) : ms });
const v = (name: string): Expr => ({ t: 'var', name });
function merge(...xs: Array<{ parts: SPart[]; wires: SWire[] }>): CircuitProject { return { board: 'uno', parts: xs.flatMap(x => x.parts), wires: xs.flatMap(x => x.wires) }; }

function scene(shapes: Shape[]) { return { shapes, grid: 1, units: 'mm' as const }; }

export function buildStarter(id: string, name = 'MAYA'): StudioProject | null {
  const s = STUDIO_STARTERS.find(x => x.id === id); if (!s) return null;
  const p = blankProject(s.mode === '3d' ? '3d' : 'circuit', s.title); p.starter = id;
  switch (id) {
    case 'keychain': {
      const plate = makeShape('box', [0, 0], { name: 'Tag', size: [56, 22, 3] });
      const ring = makeShape('cylinder', [-22, 0], { name: 'Key ring hole', size: [6, 6, 10], hole: true, sides: 32 });
      const letters = makeShape('text', [4, 0], { name: 'Name', text: name, size: [40, 12, 1.6], pos: [4, 0, 3 + 0.8] });
      p.scene = scene([{ ...groupShapes([plate, ring]), name: 'Tag with hole' }, letters]); break;
    }
    case 'name-tag': {
      const plate = makeShape('box', [0, 0], { name: 'Plate', size: [80, 30, 3], color: '#1c7ed6' });
      const letters = makeShape('text', [-6, 0], { name: 'Name', text: name, size: [52, 14, 2], pos: [-6, 0, 4] });
      const heart = makeShape('heart', [30, 0], { name: 'Heart', size: [12, 11, 2], pos: [30, 0, 4] });
      p.scene = scene([plate, letters, heart]); break;
    }
    case 'phone-stand': {
      const base = makeShape('box', [5, 0], { name: 'Base', size: [90, 70, 5], color: '#495057' });
      const ramp = makeShape('wedge', [-5, 0], { name: 'Back rest', size: [50, 70, 65], pos: [-5, 0, 5 + 32.5], color: '#1c7ed6' });
      const window = makeShape('cylinder', [-14, 0], { name: 'Save plastic', size: [22, 22, 80], rot: [90, 0, 0], pos: [-20, 0, 26], hole: true });
      const lip = makeShape('box', [44, 0], { name: 'Lip', size: [6, 70, 14], pos: [44, 0, 5 + 7], color: '#1c7ed6' });
      p.scene = scene([{ ...groupShapes([ramp, window]), name: 'Back rest' }, base, lip]); break;
    }
    case 'blink': {
      p.circuit = merge({ parts: [], wires: power() }, ledOnPin(6, 'red', '13', 1));
      p.program = { setup: [out('13')], loop: [dw('13', true), wait(500), dw('13', false), wait(500)] }; break;
    }
    case 'pico-blink': {
      const c = merge({ parts: [], wires: [wire(PIN('GND'), H(1, 16), BLACK)] }, ledOnPin(6, 'green', 'GP15', 1)); c.board = 'pico'; p.circuit = c; p.lang = 'py';
      p.program = { setup: [out('GP15')], loop: [dw('GP15', true), wait(300), dw('GP15', false), wait(300)] }; break;
    }
    case 'traffic-light': {
      p.circuit = merge({ parts: [], wires: power() }, ledOnPin(4, 'red', '13', 1), ledOnPin(9, 'yellow', '12', 2), ledOnPin(14, 'green', '11', 3));
      p.program = { setup: [out('13'), out('12'), out('11')], loop: [
        st({ t: 'comment', text: 'Red means stop' }), dw('13', true), wait(3000), dw('13', false),
        st({ t: 'comment', text: 'Green means go' }), dw('11', true), wait(3000), dw('11', false),
        st({ t: 'comment', text: 'Yellow means slow down' }), dw('12', true), wait(1000), dw('12', false)] }; break;
    }
    case 'nightlight': {
      const ldr = { parts: [part('ldr', 'LDR1', 20, 5, 0, { light: 0.8 }), part('resistor', 'R2', 22, 7, 1, { R: 10000 })], wires: [wire(H(20, 3), H(20, 15), RED), wire(H(22, 3), PIN('A0'), '#1971c2'), wire(H(22, 13), H(22, 16), BLACK)] };
      p.circuit = merge({ parts: [], wires: power() }, ledOnPin(4, 'yellow', '9', 1), ldr);
      p.program = { setup: [out('9')], loop: [
        st({ t: 'set', name: 'light', value: { t: 'analogRead', pin: 'A0' } }), st({ t: 'print', value: v('light'), line: true }),
        st({ t: 'if', cond: { t: 'cmp', op: '<', a: v('light'), b: num(400) }, then: [dw('9', true)], else: [dw('9', false)] }), wait(200)] }; break;
    }
    case 'reaction-game': {
      const btn = { parts: [part('button', 'BTN1', 12, 7)], wires: [wire(PIN('2'), H(12, 3), '#1971c2'), wire(H(14, 13), H(14, 16), BLACK)] };
      const buzz = { parts: [part('buzzer', 'BZ1', 20, 5)], wires: [wire(PIN('8'), H(20, 3), '#ae3ec9'), wire(H(23, 3), H(23, 16), BLACK)] };
      p.circuit = merge({ parts: [], wires: power() }, ledOnPin(4, 'green', '13', 1), btn, buzz);
      p.program = { setup: [out('13'), st({ t: 'pinMode', pin: '2', mode: 'INPUT_PULLUP' }), st({ t: 'print', value: { t: 'text', v: 'Reaction game! Press the button when the light comes on.' }, line: true })], loop: [
        st({ t: 'print', value: { t: 'text', v: 'Get ready...' }, line: true }), wait({ t: 'random', min: num(1000), max: num(4000) }),
        dw('13', true), st({ t: 'tone', pin: '8', freq: num(988), ms: num(120) }), st({ t: 'set', name: 'start', value: { t: 'millis' } }),
        st({ t: 'waitUntil', cond: { t: 'cmp', op: '==', a: { t: 'digitalRead', pin: '2' }, b: num(0) } }),
        st({ t: 'set', name: 'reaction', value: { t: 'math', op: '-', a: { t: 'millis' }, b: v('start') } }), dw('13', false),
        st({ t: 'print', value: { t: 'text', v: 'Your time in ms: ' }, line: false }), st({ t: 'print', value: v('reaction'), line: true }), wait(2000)] }; break;
    }
    case 'servo-sweep': {
      p.circuit = merge({ parts: [part('servo', 'SRV1', 10, 5)], wires: [...power(), wire(H(10, 3), H(10, 16), BLACK), wire(H(11, 3), H(11, 15), RED), wire(PIN('9'), H(12, 3), '#f08c00')] });
      p.program = { setup: [st({ t: 'set', name: 'angle', value: num(0) })], loop: [
        st({ t: 'repeat', times: num(18), body: [st({ t: 'servo', pin: '9', angle: v('angle') }), st({ t: 'change', name: 'angle', by: num(10) }), wait(60)] }),
        st({ t: 'repeat', times: num(18), body: [st({ t: 'servo', pin: '9', angle: v('angle') }), st({ t: 'change', name: 'angle', by: num(-10) }), wait(60)] })] }; break;
    }
    case 'distance-alarm': {
      const us = { parts: [part('ultrasonic', 'US1', 16, 5, 0, { cm: 60 }), part('buzzer', 'BZ1', 24, 5)], wires: [wire(H(16, 3), H(16, 15), RED), wire(PIN('7'), H(17, 3), '#1971c2'), wire(PIN('6'), H(18, 3), '#0c8599'), wire(H(19, 3), H(19, 16), BLACK), wire(PIN('8'), H(24, 3), '#ae3ec9'), wire(H(27, 3), H(27, 16), BLACK)] };
      p.circuit = merge({ parts: [], wires: power() }, ledOnPin(4, 'red', '13', 1), us);
      p.program = { setup: [out('13')], loop: [
        st({ t: 'set', name: 'cm', value: { t: 'distance', trig: '7', echo: '6' } }), st({ t: 'print', value: v('cm'), line: true }),
        st({ t: 'if', cond: { t: 'logic', op: 'and', a: { t: 'cmp', op: '<', a: v('cm'), b: num(30) }, b: { t: 'cmp', op: '>', a: v('cm'), b: num(0) } }, then: [dw('13', true), st({ t: 'tone', pin: '8', freq: num(880), ms: num(80) }), wait({ t: 'math', op: '*', a: v('cm'), b: num(10) }), dw('13', false)], else: [dw('13', false), wait(200)] })] }; break;
    }
  }
  return p;
}
