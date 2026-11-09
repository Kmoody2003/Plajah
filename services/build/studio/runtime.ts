// Runs a block program against a breadboard: the interpreter's pin writes become pin drivers in
// the circuit, pin reads come back from the simulator. The circuit is re-solved only when a pin,
// a button, a knob or a sensor changes, so tight loops stay fast.

import { Vm, type Program, type Io } from './blocks';
import { BOARDS, evaluate, type CircuitProject, type Inputs, type PinIO, type Readout } from './breadboard';

export class Runtime implements Io {
  io: PinIO = {}; serial = ''; hints = new Set<string>(); vm: Vm;
  private cache: Readout | null = null; private dirty = true;
  constructor(public project: CircuitProject, program: Program, public inputs: Inputs = { pressed: new Set() }, rand?: () => number) { this.vm = new Vm(program, this, rand); }

  get logic() { return this.project.board ? BOARDS[this.project.board].logic : 5; }
  /** Call after the breadboard or an input (button, knob, light, distance) changes. */
  touch() { this.dirty = true; }
  readout(): Readout { if (this.dirty || !this.cache) { this.cache = evaluate(this.project, this.io, this.inputs); this.dirty = false; } return this.cache; }
  step(untilMs: number) { this.vm.runUntil(untilMs); }

  private set(pin: string, v: PinIO[string]) { const o = this.io[pin]; if (o && o.mode === v.mode && o.level === v.level && o.tone === v.tone && o.servo === v.servo) return; this.io[pin] = v; this.dirty = true; }
  private label(pin: string) { return this.project.board ? BOARDS[this.project.board].pins.find(p => p.id === pin)?.label ?? pin : pin; }
  private known(pin: string) { if (!this.project.board) { this.hints.add('Add a board (Arduino Uno, Nano or Pico) so the program has pins to use.'); return false; } if (!BOARDS[this.project.board].pins.some(p => p.id === pin && p.kind === 'io')) { this.hints.add(`The ${BOARDS[this.project.board].name} has no pin ${pin}. Pick one of its pins in the block.`); return false; } return true; }

  pinMode(pin: string, mode: 'OUTPUT' | 'INPUT' | 'INPUT_PULLUP') { if (!this.known(pin)) return; this.set(pin, { mode: mode === 'OUTPUT' ? 'out' : mode === 'INPUT_PULLUP' ? 'pullup' : 'in', level: 0 }); }
  digitalWrite(pin: string, high: boolean) {
    if (!this.known(pin)) return; const cur = this.io[pin];
    if (!cur || cur.mode !== 'out') {
      // Like a real Arduino: writing HIGH to a pin left as an input only turns on its weak pull-up, so an LED glows faintly.
      this.hints.add(`Pin ${this.label(pin)} was never set as an OUTPUT, so it can only glow faintly. Add a "set pin ${this.label(pin)} to OUTPUT" block in "when it starts".`);
      this.set(pin, high ? { mode: 'pullup', level: 1 } : { mode: 'in', level: 0 }); return;
    }
    this.set(pin, { mode: 'out', level: high ? 1 : 0 });
  }
  analogWrite(pin: string, value: number) {
    if (!this.known(pin)) return; const def = BOARDS[this.project.board!].pins.find(p => p.id === pin);
    if (!def?.pwm) { this.hints.add(`Pin ${this.label(pin)} cannot dim (no PWM); it switches fully on at 128 and above. PWM pins: ${BOARDS[this.project.board!].pins.filter(p => p.pwm).map(p => p.label).slice(0, 8).join(', ')}.`); this.set(pin, { mode: 'out', level: value >= 128 ? 1 : 0 }); return; }
    this.set(pin, { mode: 'out', level: value / 255 });
  }
  digitalRead(pin: string) {
    if (!this.known(pin)) return 0; const v = this.readout().pinV[pin];
    if (v === null || v === undefined) { this.hints.add(`Pin ${this.label(pin)} is not connected to anything, so it reads randomly on a real board. Use INPUT_PULLUP or a pull-down resistor.`); return 0; }
    return v > this.logic / 2 ? 1 : 0;
  }
  analogRead(pin: string) {
    if (!this.known(pin)) return 0; const def = BOARDS[this.project.board!].pins.find(p => p.id === pin);
    if (!def?.adc) this.hints.add(`Pin ${this.label(pin)} cannot measure voltage. Use an analog pin (${BOARDS[this.project.board!].pins.filter(p => p.adc).map(p => p.label).join(', ')}).`);
    const v = this.readout().pinV[pin] ?? 0; return Math.max(0, Math.min(1023, (v / this.logic) * 1023));
  }
  tone(pin: string, freq: number, _ms: number | null) { if (!this.known(pin)) return; this.set(pin, { mode: 'out', level: 0.5, tone: Math.max(31, Math.round(freq)) }); }
  noTone(pin: string) { if (!this.known(pin)) return; const cur = this.io[pin]; if (cur?.tone) this.set(pin, { mode: 'out', level: 0 }); }
  servo(pin: string, angle: number) { if (!this.known(pin)) return; this.set(pin, { mode: 'out', level: (0.5 + (angle / 180) * 2) / 20, servo: Math.round(angle) }); }
  print(text: string, line: boolean) { this.serial += text + (line ? '\n' : ''); if (this.serial.length > 20000) this.serial = this.serial.slice(-15000); }
  distance(trig: string, echo: string) { const d = this.readout().distance(trig, echo); if (!d) this.hints.add('The distance sensor does not answer: VCC to 5 V, GND to GND, and TRIG/ECHO to the pins in the block.'); return d; }

}
