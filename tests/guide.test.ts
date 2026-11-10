// Build guide: home pre-checks, the guided steps read from a real plan, size sense and starters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDrawing, addEntities, wallsFrom } from '../services/cad/draft';
import { detectRooms } from '../services/cad/rooms';
import type { CadModel } from '../services/cad/model';
import { runHomeChecks, minWidth } from '../services/cad/guide/homeChecks';
import { evaluate, currentStep, STEPS } from '../services/cad/guide/journey';
import { PROGRAMS, kindsOf, programRooms } from '../services/cad/guide/programs';
import { feelArea, feelLength } from '../services/cad/guide/sizeSense';
import { addLot, addShell, insideSetbacks, placeLibraryItem } from '../services/cad/guide/starters';

const cottage = PROGRAMS.find(p => p.id === 'cottage')!;
const tag = (m: CadModel, name: string, at: [number, number], n: number): CadModel => addEntities(m, [{ type: 'room', layer: 'A-ANNO-TEXT', at: [at[0], at[1], 0], name, number: String(n), height: 250, unitsPerMm: 1 }]);
const wall = (m: CadModel, a: [number, number], b: [number, number], t = 120) => addEntities(m, wallsFrom([a, b], t, 2700, 'A-WALL', 1));

/** A 10 × 8 m cottage: living/kitchen on the left over a bathroom, two bedrooms on the right. */
function cottagePlan(opts: { windows?: boolean; smoke?: boolean } = {}): CadModel {
  let m = addShell(newDrawing('Cottage.dxf', 'mm'), 10000, 8000);
  m = wall(m, [5000, 125], [5000, 7875]); m = wall(m, [5000, 4000], [9875, 4000]); m = wall(m, [125, 2500], [5000, 2500]);
  m = tag(m, 'Living / Kitchen', [2500, 5200], 1); m = tag(m, 'Bathroom', [2500, 1300], 2); m = tag(m, 'Bedroom 1', [7500, 2000], 3); m = tag(m, 'Bedroom 2', [7500, 6000], 4);
  m = placeLibraryItem(m, 'door-single', [125, 5200], { width: 900 });
  m = placeLibraryItem(m, 'door-single', [2500, 2500]); m = placeLibraryItem(m, 'door-single', [5000, 2000]); m = placeLibraryItem(m, 'door-single', [5000, 6000]);
  if (opts.windows !== false) { m = placeLibraryItem(m, 'window-casement', [7500, 125]); m = placeLibraryItem(m, 'window-casement', [7500, 7875]); }
  for (const [id, at] of [['sink-kitchen', [1200, 7300]], ['range', [2600, 7300]], ['fridge', [3900, 7300]], ['wc', [1000, 900]], ['basin', [2200, 700]], ['shower', [4000, 1000]]] as const) m = placeLibraryItem(m, id, at as unknown as [number, number]);
  if (opts.smoke !== false) { m = placeLibraryItem(m, 'smoke', [7500, 2200]); m = placeLibraryItem(m, 'smoke', [7500, 6200]); }
  return m;
}

test('programs: rooms are numbered and a room name can cover two kinds', () => {
  assert.deepEqual(programRooms(cottage).map(r => r.name), ['Living room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2']);
  assert.deepEqual(kindsOf('Living / Kitchen'), ['kitchen', 'living']);
  assert.deepEqual(kindsOf('Master bath'), ['bath']);
  assert.deepEqual(kindsOf('Primary bedroom'), ['bedroom']);
});

test('size sense: plain comparisons', () => {
  assert.match(feelArea(12.5), /parking space/);
  assert.match(feelLength(4500), /family car/);
  assert.match(feelArea(25), /bigger than|classroom/);
  assert.equal(feelArea(0), '');
});

test('starters: lot, shell inside the setbacks, and an oversized shell crossing them', () => {
  const lot = addLot(newDrawing('Lot.dxf', 'mm'), { width: 15000, depth: 30000, front: 6000, side: 1500, rear: 6000 });
  const ok = addShell(lot, 10000, 8000); assert.equal(insideSetbacks(ok), true); assert.equal(detectRooms(ok.entities).length, 1);
  const big = addShell(lot, 14000, 8000); assert.equal(insideSetbacks(big), false);
  assert.equal(insideSetbacks(newDrawing()), null);
});

test('home checks: a complete cottage passes every rule', () => {
  const m = cottagePlan(); const rooms = detectRooms(m.entities);
  assert.equal(rooms.length, 4, 'four rooms found');
  const f = runHomeChecks(m, rooms);
  const bad = f.filter(x => x.status !== 'pass'); assert.deepEqual(bad.map(x => x.detail), []);
  for (const id of ['room-area', 'room-width', 'bedroom-escape', 'smoke-alarm', 'egress-door']) assert.ok(f.some(x => x.rule === id), `${id} ran`);
  assert.ok(f.every(x => /2021 IRC §R3\d\d/.test(x.citation)));
});

test('home checks: missing windows, missing alarms, a tiny bedroom and low walls are flagged', () => {
  const m = cottagePlan({ windows: false, smoke: false }); const f = runHomeChecks(m);
  assert.equal(f.filter(x => x.rule === 'bedroom-escape' && x.status === 'fail').length, 2);
  assert.equal(f.filter(x => x.rule === 'smoke-alarm' && x.status === 'warn').length, 2);
  let s = addShell(newDrawing('Box.dxf', 'mm'), 2200, 2200, 250, 2000); s = tag(s, 'Bedroom', [1100, 1100], 1);
  const g = runHomeChecks(s);
  assert.equal(g.find(x => x.rule === 'room-area')!.status, 'fail');
  assert.equal(g.find(x => x.rule === 'room-width')!.status, 'fail');
  assert.equal(g.find(x => x.rule === 'ceiling-height')!.status, 'fail');
  assert.equal(g.find(x => x.rule === 'egress-door')!.status, 'fail');
  assert.ok(Math.abs(minWidth([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]) - 2000) < 1e-9);
});

test('journey: steps follow the drawing from blank to a checked plan', () => {
  const blank = newDrawing('x.dxf', 'mm');
  let st = evaluate(blank, [], [], {}); assert.equal(currentStep(st), 'idea');
  st = evaluate(blank, [], [], { program: cottage }); assert.equal(currentStep(st), 'land', 'optional land is offered next');

  const shell = addShell(blank, 10000, 8000); let rooms = detectRooms(shell.entities);
  st = evaluate(shell, rooms, runHomeChecks(shell, rooms), { program: cottage });
  assert.equal(st.find(s => s.id === 'shell')!.done, true); assert.equal(currentStep(st), 'rooms', 'land is skipped once the shell exists');
  assert.match(st.find(s => s.id === 'shell')!.lines[0].text, /m²/);

  const m = cottagePlan(); rooms = detectRooms(m.entities); const f = runHomeChecks(m, rooms);
  st = evaluate(m, rooms, f, { program: cottage });
  const done = Object.fromEntries(st.map(s => [s.id, s.done]));
  assert.deepEqual({ rooms: done.rooms, openings: done.openings, fixtures: done.fixtures, check: done.check }, { rooms: true, openings: true, fixtures: true, check: true }, JSON.stringify(st.filter(s => !s.done).map(s => [s.id, s.lines])));
  assert.equal(currentStep(st), 'see3d');
  st = evaluate(m, rooms, f, { program: cottage, seen3d: true }); assert.equal(currentStep(st), 'sheets');
  assert.equal(st.find(s => s.id === 'sheets')!.lines.filter(l => !l.ok).length, 4);
});

test('journey: missing pieces are named in plain words, and Pro uses trade terms', () => {
  const m = cottagePlan({ windows: false }); const rooms = detectRooms(m.entities);
  const simple = evaluate(m, rooms, runHomeChecks(m, rooms), { program: cottage }, 'simple').find(s => s.id === 'openings')!;
  const pro = evaluate(m, rooms, runHomeChecks(m, rooms), { program: cottage }, 'pro').find(s => s.id === 'openings')!;
  assert.equal(simple.done, false); assert.ok(simple.lines.some(l => /climb out/.test(l.text))); assert.ok(pro.lines.some(l => /R310/.test(l.text)));
  const short = evaluate(m, rooms.slice(0, 2), [], { program: cottage }).find(s => s.id === 'rooms')!;
  assert.equal(short.done, false); assert.ok(short.lines.some(l => /Still need/.test(l.text)));
});

test('journey: every step has both voices, a reason and something to do', () => {
  for (const s of STEPS) {
    assert.ok(s.title.simple && s.title.pro && s.what.simple && s.why.simple && s.why.pro, s.id);
    assert.ok(s.how.simple.length && s.how.pro.length && s.actions.length, s.id);
    for (const w of s.words) assert.ok(w.simple.split(' ').length <= 16, `${w.term} is short`);
  }
});
