// Build Studio blocks: our own block language for microcontrollers. A program is a tree of
// statements and expressions; it generates Arduino C++ and MicroPython, and a small interpreter
// runs it against simulated pins in virtual time, so circuits work in the browser.

import type { BoardKind } from './breadboard';

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'var'; name: string }
  | { t: 'math'; op: '+' | '-' | '*' | '/' | '%'; a: Expr; b: Expr }
  | { t: 'cmp'; op: '<' | '>' | '==' | '!=' | '<=' | '>='; a: Expr; b: Expr }
  | { t: 'logic'; op: 'and' | 'or'; a: Expr; b: Expr }
  | { t: 'not'; a: Expr }
  | { t: 'digitalRead'; pin: string }
  | { t: 'analogRead'; pin: string }
  | { t: 'random'; min: Expr; max: Expr }
  | { t: 'millis' }
  | { t: 'distance'; trig: string; echo: string }
  | { t: 'map'; v: Expr; inLo: number; inHi: number; outLo: number; outHi: number };

export type Stmt = { id: string } & (
  | { t: 'pinMode'; pin: string; mode: 'OUTPUT' | 'INPUT' | 'INPUT_PULLUP' }
  | { t: 'digitalWrite'; pin: string; value: 'HIGH' | 'LOW' }
  | { t: 'analogWrite'; pin: string; value: Expr }
  | { t: 'delay'; ms: Expr }
  | { t: 'tone'; pin: string; freq: Expr; ms: Expr | null }
  | { t: 'noTone'; pin: string }
  | { t: 'servo'; pin: string; angle: Expr }
  | { t: 'print'; value: Expr | { t: 'text'; v: string }; line: boolean }
  | { t: 'set'; name: string; value: Expr }
  | { t: 'change'; name: string; by: Expr }
  | { t: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] | null }
  | { t: 'repeat'; times: Expr; body: Stmt[] }
  | { t: 'while'; cond: Expr; body: Stmt[] }
  | { t: 'waitUntil'; cond: Expr }
  | { t: 'comment'; text: string }
);
export type StmtType = Stmt['t'];
/** A statement without its id (distributes over the union, so each kind keeps its own fields). */
export type StmtInput = Stmt extends infer S ? (S extends Stmt ? Omit<S, 'id'> : never) : never;
export interface Program { setup: Stmt[]; loop: Stmt[] }

let seq = 0;
export const sid = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export const num = (v: number): Expr => ({ t: 'num', v });

// ---------------------------------------------------------------- walking

export function walk(stmts: Stmt[], fn: (s: Stmt) => void) { for (const s of stmts) { fn(s); if (s.t === 'if') { walk(s.then, fn); if (s.else) walk(s.else, fn); } if (s.t === 'repeat' || s.t === 'while') walk(s.body, fn); } }
function walkExpr(e: Expr, fn: (e: Expr) => void) { fn(e); if ('a' in e && e.a) walkExpr(e.a, fn); if ('b' in e && e.b) walkExpr(e.b, fn); if (e.t === 'random') { walkExpr(e.min, fn); walkExpr(e.max, fn); } if (e.t === 'map') walkExpr(e.v, fn); }
function exprsOf(s: Stmt): Expr[] {
  switch (s.t) { case 'analogWrite': return [s.value]; case 'delay': return [s.ms]; case 'tone': return s.ms ? [s.freq, s.ms] : [s.freq]; case 'servo': return [s.angle]; case 'print': return s.value.t === 'text' ? [] : [s.value as Expr]; case 'set': return [s.value]; case 'change': return [s.by]; case 'if': case 'while': case 'waitUntil': return [s.cond]; case 'repeat': return [s.times]; default: return []; }
}
export function variables(p: Program): string[] { const v = new Set<string>(); for (const part of [p.setup, p.loop]) walk(part, s => { if (s.t === 'set' || s.t === 'change') v.add(s.name); for (const e of exprsOf(s)) walkExpr(e, x => { if (x.t === 'var') v.add(x.name); }); }); return [...v]; }
const usesAll = (p: Program) => { const st: Stmt[] = []; const ex: Expr[] = []; for (const part of [p.setup, p.loop]) walk(part, s => { st.push(s); for (const e of exprsOf(s)) walkExpr(e, x => ex.push(x)); }); return { st, ex }; };
const RESERVED = new Set('and as assert async await break case catch char class const continue def default del delay do double elif else except false finally float for from global if import in int is lambda long millis new none nonlocal not or pass pin print raise random return servo setup short signed sizeof static struct switch time tone true try unsigned void volatile while with yield loop map min max abs adc pwm'.split(' '));
export const safeName = (n: string) => { const s = n.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'v'; return RESERVED.has(s.toLowerCase()) ? `${s}_v` : s; };

// ---------------------------------------------------------------- Arduino C++

const cPin = (pin: string) => (/^GP\d+$/.test(pin) ? pin.slice(2) : pin);
function cExpr(e: Expr): string {
  switch (e.t) {
    case 'num': return String(e.v);
    case 'bool': return e.v ? 'true' : 'false';
    case 'var': return safeName(e.name);
    case 'math': return `(${cExpr(e.a)} ${e.op} ${cExpr(e.b)})`;
    case 'cmp': return `(${cExpr(e.a)} ${e.op} ${cExpr(e.b)})`;
    case 'logic': return `(${cExpr(e.a)} ${e.op === 'and' ? '&&' : '||'} ${cExpr(e.b)})`;
    case 'not': return `!(${cExpr(e.a)})`;
    case 'digitalRead': return `digitalRead(${cPin(e.pin)})`;
    case 'analogRead': return `analogRead(${cPin(e.pin)})`;
    case 'random': return `random(${cExpr(e.min)}, ${cExpr(e.max)})`;
    case 'millis': return 'millis()';
    case 'distance': return `readDistanceCm(${cPin(e.trig)}, ${cPin(e.echo)})`;
    case 'map': return `map(${cExpr(e.v)}, ${e.inLo}, ${e.inHi}, ${e.outLo}, ${e.outHi})`;
  }
}
function cStmts(ss: Stmt[], ind: string): string[] {
  const out: string[] = [];
  for (const s of ss) switch (s.t) {
    case 'pinMode': out.push(`${ind}pinMode(${cPin(s.pin)}, ${s.mode});`); break;
    case 'digitalWrite': out.push(`${ind}digitalWrite(${cPin(s.pin)}, ${s.value});`); break;
    case 'analogWrite': out.push(`${ind}analogWrite(${cPin(s.pin)}, ${cExpr(s.value)});`); break;
    case 'delay': out.push(`${ind}delay(${cExpr(s.ms)});`); break;
    case 'tone': out.push(`${ind}tone(${cPin(s.pin)}, ${cExpr(s.freq)}${s.ms ? `, ${cExpr(s.ms)}` : ''});`); break;
    case 'noTone': out.push(`${ind}noTone(${cPin(s.pin)});`); break;
    case 'servo': out.push(`${ind}servo_${cPin(s.pin)}.write(${cExpr(s.angle)});`); break;
    case 'print': out.push(`${ind}Serial.${s.line ? 'println' : 'print'}(${s.value.t === 'text' ? JSON.stringify(s.value.v) : cExpr(s.value as Expr)});`); break;
    case 'set': out.push(`${ind}${safeName(s.name)} = ${cExpr(s.value)};`); break;
    case 'change': out.push(`${ind}${safeName(s.name)} += ${cExpr(s.by)};`); break;
    case 'if': out.push(`${ind}if (${cExpr(s.cond)}) {`, ...cStmts(s.then, ind + '  '), ...(s.else ? [`${ind}} else {`, ...cStmts(s.else, ind + '  ')] : []), `${ind}}`); break;
    case 'repeat': out.push(`${ind}for (int i_${s.id.slice(-4)} = 0; i_${s.id.slice(-4)} < ${cExpr(s.times)}; i_${s.id.slice(-4)}++) {`, ...cStmts(s.body, ind + '  '), `${ind}}`); break;
    case 'while': out.push(`${ind}while (${cExpr(s.cond)}) {`, ...cStmts(s.body, ind + '  '), `${ind}}`); break;
    case 'waitUntil': out.push(`${ind}while (!(${cExpr(s.cond)})) { delay(1); }`); break;
    case 'comment': out.push(`${ind}// ${s.text.replace(/\n/g, ' ')}`); break;
  }
  return out;
}
export function toArduino(p: Program, title = 'My project'): string {
  const { st, ex } = usesAll(p); const vars = variables(p);
  const servos = [...new Set(st.filter(s => s.t === 'servo').map(s => cPin((s as { pin: string }).pin)))];
  const serial = st.some(s => s.t === 'print'); const dist = ex.some(e => e.t === 'distance');
  const head = [`// ${title}: made with Plajah Build Studio`, ...(servos.length ? ['#include <Servo.h>'] : []), '', ...servos.map(s => `Servo servo_${s};`), ...vars.map(v => `long ${safeName(v)} = 0;`)];
  const helper = dist ? ['', '// Distance in centimetres from an ultrasonic sensor (0 when nothing echoes back).', 'long readDistanceCm(int trig, int echo) {', '  pinMode(trig, OUTPUT); pinMode(echo, INPUT);', '  digitalWrite(trig, LOW); delayMicroseconds(2);', '  digitalWrite(trig, HIGH); delayMicroseconds(10); digitalWrite(trig, LOW);', '  long us = pulseIn(echo, HIGH, 30000);', '  return us / 58;', '}'] : [];
  const setup = ['', 'void setup() {', ...(serial ? ['  Serial.begin(9600);'] : []), ...servos.map(s => `  servo_${s}.attach(${s});`), ...(ex.some(e => e.t === 'random') ? ['  randomSeed(analogRead(A5));'] : []), ...cStmts(p.setup, '  '), '}'];
  const loop = ['', 'void loop() {', ...cStmts(p.loop, '  '), '}', ''];
  return [...head.filter((l, i) => l || i), ...helper, ...setup, ...loop].join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------- MicroPython (Raspberry Pi Pico)

const pyNum = (pin: string) => (/^GP(\d+)$/.exec(pin)?.[1] ?? (/^A(\d)$/.exec(pin) ? String(26 + Number(pin.slice(1))) : pin));
function pyExpr(e: Expr): string {
  switch (e.t) {
    case 'num': return String(e.v);
    case 'bool': return e.v ? 'True' : 'False';
    case 'var': return safeName(e.name);
    case 'math': return e.op === '/' ? `(${pyExpr(e.a)} // ${pyExpr(e.b)})` : `(${pyExpr(e.a)} ${e.op} ${pyExpr(e.b)})`;
    case 'cmp': return `(${pyExpr(e.a)} ${e.op} ${pyExpr(e.b)})`;
    case 'logic': return `(${pyExpr(e.a)} ${e.op} ${pyExpr(e.b)})`;
    case 'not': return `(not ${pyExpr(e.a)})`;
    case 'digitalRead': return `pin_${pyNum(e.pin)}.value()`;
    case 'analogRead': return `(adc_${pyNum(e.pin)}.read_u16() >> 6)`;
    case 'random': return `random.randint(${pyExpr(e.min)}, ${pyExpr(e.max)} - 1)`;
    case 'millis': return 'time.ticks_ms()';
    case 'distance': return `read_distance_cm(${pyNum(e.trig)}, ${pyNum(e.echo)})`;
    case 'map': return `((${pyExpr(e.v)} - ${e.inLo}) * (${e.outHi} - ${e.outLo}) // (${e.inHi} - ${e.inLo}) + ${e.outLo})`;
  }
}
function pyStmts(ss: Stmt[], ind: string, globals: string[]): string[] {
  const out: string[] = [];
  for (const s of ss) switch (s.t) {
    case 'pinMode': out.push(`${ind}pin_${pyNum(s.pin)} = Pin(${pyNum(s.pin)}, ${s.mode === 'OUTPUT' ? 'Pin.OUT' : s.mode === 'INPUT_PULLUP' ? 'Pin.IN, Pin.PULL_UP' : 'Pin.IN'})`); break;
    case 'digitalWrite': out.push(`${ind}pin_${pyNum(s.pin)}.value(${s.value === 'HIGH' ? 1 : 0})`); break;
    case 'analogWrite': out.push(`${ind}PWM(Pin(${pyNum(s.pin)}), freq=1000, duty_u16=min(65535, int(${pyExpr(s.value)}) * 257))`); break;
    case 'delay': out.push(`${ind}time.sleep_ms(int(${pyExpr(s.ms)}))`); break;
    case 'tone': out.push(`${ind}tone(${pyNum(s.pin)}, ${pyExpr(s.freq)}${s.ms ? `, ${pyExpr(s.ms)}` : ''})`); break;
    case 'noTone': out.push(`${ind}no_tone(${pyNum(s.pin)})`); break;
    case 'servo': out.push(`${ind}servo_write(${pyNum(s.pin)}, ${pyExpr(s.angle)})`); break;
    case 'print': out.push(`${ind}print(${s.value.t === 'text' ? JSON.stringify(s.value.v) : pyExpr(s.value as Expr)}${s.line ? '' : ", end=''"})`); break;
    case 'set': out.push(`${ind}${safeName(s.name)} = ${pyExpr(s.value)}`); break;
    case 'change': out.push(`${ind}${safeName(s.name)} += ${pyExpr(s.by)}`); break;
    case 'if': out.push(`${ind}if ${pyExpr(s.cond)}:`, ...body(s.then), ...(s.else ? [`${ind}else:`, ...body(s.else)] : [])); break;
    case 'repeat': out.push(`${ind}for _ in range(int(${pyExpr(s.times)})):`, ...body(s.body)); break;
    case 'while': out.push(`${ind}while ${pyExpr(s.cond)}:`, ...body(s.body)); break;
    case 'waitUntil': out.push(`${ind}while not ${pyExpr(s.cond)}:`, `${ind}    time.sleep_ms(1)`); break;
    case 'comment': out.push(`${ind}# ${s.text.replace(/\n/g, ' ')}`); break;
  }
  function body(b: Stmt[]) { const x = pyStmts(b, ind + '    ', globals); return x.length ? x : [`${ind}    pass`]; }
  return out;
}
export function toMicroPython(p: Program, title = 'My project'): string {
  const { st, ex } = usesAll(p); const vars = variables(p).map(safeName);
  const adcs = [...new Set(ex.filter(e => e.t === 'analogRead').map(e => pyNum((e as { pin: string }).pin)))];
  const pinsUsed = new Set<string>(); for (const s of st) if (s.t === 'digitalWrite') pinsUsed.add(pyNum(s.pin)); for (const e of ex) if (e.t === 'digitalRead') pinsUsed.add(pyNum(e.pin));
  const declared = new Set(st.filter(s => s.t === 'pinMode').map(s => pyNum((s as { pin: string }).pin)));
  const lines = [`# ${title}: made with Plajah Build Studio (MicroPython for Raspberry Pi Pico)`, 'from machine import Pin, PWM, ADC, time_pulse_us', 'import time', ...(ex.some(e => e.t === 'random') ? ['import random'] : []), ''];
  for (const n of pinsUsed) if (!declared.has(n)) lines.push(`pin_${n} = Pin(${n}, Pin.OUT)`);
  for (const n of adcs) lines.push(`adc_${n} = ADC(${n})`);
  if (st.some(s => s.t === 'tone' || s.t === 'noTone')) lines.push('', 'def tone(pin, freq, ms=None):', '    p = PWM(Pin(pin)); p.freq(int(freq)); p.duty_u16(32768)', '    if ms:', '        time.sleep_ms(int(ms)); p.duty_u16(0)', '', 'def no_tone(pin):', '    PWM(Pin(pin)).duty_u16(0)');
  if (st.some(s => s.t === 'servo')) lines.push('', 'def servo_write(pin, angle):', '    p = PWM(Pin(pin)); p.freq(50)', '    p.duty_ns(int(500000 + max(0, min(180, angle)) * 2000000 / 180))');
  if (ex.some(e => e.t === 'distance')) lines.push('', 'def read_distance_cm(trig, echo):', '    t = Pin(trig, Pin.OUT); e = Pin(echo, Pin.IN)', '    t.value(0); time.sleep_us(2); t.value(1); time.sleep_us(10); t.value(0)', '    us = time_pulse_us(e, 1, 30000)', '    return max(0, us) // 58');
  for (const v of vars) lines.push(`${v} = 0`);
  const g = vars.length ? [`    global ${vars.join(', ')}`] : [];
  const setup = pyStmts(p.setup, '    ', vars), loop = pyStmts(p.loop, '    ', vars);
  // Pins set up in setup() are used by loop(): make them module-level.
  const pinGlobals = [...declared].map(n => `pin_${n}`);
  const gs = [...vars, ...pinGlobals]; const gSetup = gs.length ? [`    global ${gs.join(', ')}`] : [];
  lines.push('', 'def setup():', ...gSetup, ...(setup.length ? setup : ['    pass']), '', 'def loop():', ...g, ...(loop.length ? loop : ['    pass']), '', 'setup()', 'while True:', '    loop()', '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
export const codeFor = (p: Program, board: BoardKind | null, lang: 'cpp' | 'py', title?: string) => (lang === 'py' ? toMicroPython(p, title) : toArduino(p, title));

// ---------------------------------------------------------------- interpreter

/** What the running program can touch: the simulated board. */
export interface Io {
  pinMode(pin: string, mode: 'OUTPUT' | 'INPUT' | 'INPUT_PULLUP'): void;
  digitalWrite(pin: string, high: boolean): void;
  analogWrite(pin: string, value: number): void;
  digitalRead(pin: string): number;
  analogRead(pin: string): number;
  tone(pin: string, freq: number, ms: number | null): void;
  noTone(pin: string): void;
  servo(pin: string, angle: number): void;
  print(text: string, line: boolean): void;
  distance(trig: string, echo: string): number;
}
type Step = { wait: number; at: string };

export class Vm {
  /** Virtual time, ms since reset. */
  t = 0; vars: Record<string, number> = {}; current: string | null = null; error: string | null = null; done = false;
  private gen: Generator<Step, void, void>; private wakeAt = 0; private toneEnds: Record<string, number> = {};
  constructor(private prog: Program, private io: Io, private rand: () => number = Math.random) { this.gen = this.main(); }

  private val(e: Expr): number {
    switch (e.t) {
      case 'num': return e.v; case 'bool': return e.v ? 1 : 0; case 'var': return this.vars[e.name] ?? 0;
      case 'math': { const a = this.val(e.a), b = this.val(e.b); switch (e.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : Math.trunc(a / b); case '%': return b === 0 ? 0 : a % b; } return 0; }
      case 'cmp': { const a = this.val(e.a), b = this.val(e.b); switch (e.op) { case '<': return +(a < b); case '>': return +(a > b); case '==': return +(a === b); case '!=': return +(a !== b); case '<=': return +(a <= b); case '>=': return +(a >= b); } return 0; }
      case 'logic': return e.op === 'and' ? +(!!this.val(e.a) && !!this.val(e.b)) : +(!!this.val(e.a) || !!this.val(e.b));
      case 'not': return +!this.val(e.a);
      case 'digitalRead': return this.io.digitalRead(e.pin);
      case 'analogRead': return Math.round(this.io.analogRead(e.pin));
      case 'random': { const lo = Math.ceil(this.val(e.min)), hi = Math.floor(this.val(e.max)); return hi <= lo ? lo : lo + Math.floor(this.rand() * (hi - lo)); }
      case 'millis': return Math.floor(this.t);
      case 'distance': return this.io.distance(e.trig, e.echo);
      case 'map': return Math.trunc(((this.val(e.v) - e.inLo) * (e.outHi - e.outLo)) / (e.inHi - e.inLo || 1) + e.outLo);
    }
  }
  private *block(ss: Stmt[]): Generator<Step, void, void> {
    for (const s of ss) {
      this.current = s.id; yield { wait: 0, at: s.id };
      switch (s.t) {
        case 'pinMode': this.io.pinMode(s.pin, s.mode); break;
        case 'digitalWrite': this.io.digitalWrite(s.pin, s.value === 'HIGH'); break;
        case 'analogWrite': this.io.analogWrite(s.pin, Math.max(0, Math.min(255, this.val(s.value)))); break;
        case 'delay': { const ms = Math.max(0, this.val(s.ms)); if (ms > 0) yield { wait: ms, at: s.id }; break; }
        case 'tone': { const ms = s.ms ? this.val(s.ms) : null; this.io.tone(s.pin, this.val(s.freq), ms); if (ms) this.toneEnds[s.pin] = this.t + ms; else delete this.toneEnds[s.pin]; break; }
        case 'noTone': this.io.noTone(s.pin); delete this.toneEnds[s.pin]; break;
        case 'servo': this.io.servo(s.pin, Math.max(0, Math.min(180, this.val(s.angle)))); break;
        case 'print': this.io.print(s.value.t === 'text' ? s.value.v : String(this.val(s.value as Expr)), s.line); break;
        case 'set': this.vars[s.name] = this.val(s.value); break;
        case 'change': this.vars[s.name] = (this.vars[s.name] ?? 0) + this.val(s.by); break;
        case 'if': if (this.val(s.cond)) yield* this.block(s.then); else if (s.else) yield* this.block(s.else); break;
        case 'repeat': { const n = Math.min(100000, Math.max(0, Math.floor(this.val(s.times)))); for (let i = 0; i < n; i++) yield* this.block(s.body); break; }
        case 'while': while (this.val(s.cond)) { yield* this.block(s.body); yield { wait: 0.01, at: s.id }; } break;
        case 'waitUntil': while (!this.val(s.cond)) yield { wait: 1, at: s.id }; break;
        case 'comment': break;
      }
    }
  }
  private *main(): Generator<Step, void, void> {
    yield* this.block(this.prog.setup);
    for (;;) { yield* this.block(this.prog.loop); yield { wait: this.prog.loop.length ? 0.01 : 1, at: 'loop' }; } // loop() itself takes a few microseconds
  }
  /** Run until virtual time reaches `until` ms (or a step budget runs out, so the page stays responsive). */
  runUntil(until: number, budget = 200000): void {
    let steps = 0;
    while (!this.done && !this.error) {
      if (this.wakeAt > this.t) { if (this.wakeAt > until) { this.t = until; this.endTones(); return; } this.t = this.wakeAt; this.endTones(); }
      if (++steps > budget) { this.t = Math.min(until, this.t + 0.01); return; }
      let r: IteratorResult<Step, void>;
      try { r = this.gen.next(); } catch (e) { this.error = e instanceof Error ? e.message : String(e); return; }
      if (r.done) { this.done = true; return; }
      const step = r.value as Step; if (step.wait > 0) this.wakeAt = this.t + step.wait;
    }
  }
  private endTones() { for (const [pin, end] of Object.entries(this.toneEnds)) if (this.t >= end) { this.io.noTone(pin); delete this.toneEnds[pin]; } }
}
