// Chora Session Band live characters: the character sheets, the SOMA lens (what Amara notices about
// your playing) and the director (when she speaks, waits, demos and answers). Pure — fake clock, fake
// voice, fake mind — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND } from '../services/melos/beats/band/roster';
import { CHARACTER_SHEETS, sheetById } from '../services/melos/beats/band/character/sheets';
import { validateSheet } from '../services/melos/beats/band/character/schema';
import { SomaLens, somaZone } from '../services/melos/beats/band/live/observations';
import { LiveDirector } from '../services/melos/beats/band/live/director';
import type { LiveEvent } from '../services/melos/beats/band/live/events';

const strike = (at: number, velocity = 0.7, pos = 0.6, striker = 1): LiveEvent => ({ kind: 'strike', instrument: 'soma', trackId: 't', at, note: 48, velocity, pos, striker });
const ids = (lens: SomaLens, at: number) => lens.observe(at).map((o) => o.id);

test('sheets: one valid sheet per roster player, portrait + voice, names from the roster', () => {
  assert.equal(CHARACTER_SHEETS.length, BAND.length);
  for (const p of BAND) {
    const s = sheetById(p.id);
    assert.ok(s, `sheet for ${p.id}`);
    assert.deepEqual(validateSheet(s), [], p.id);
    assert.ok(s!.displayName.startsWith(p.name));
    assert.equal(s!.look.color, p.color);
    assert.equal(s!.look.portrait, `/band/${p.id}.webp`);
    assert.ok(s!.reactions.some((r) => r.on === 'preset.changed'));
  }
  assert.ok(sheetById('amara')!.demos.length >= 3, 'Amara can demonstrate on SOMA');
});

test('lens: SOMA zones by radius and striker', () => {
  assert.equal(somaZone(0.08, 1), 'bass');
  assert.equal(somaZone(0.6, 1), 'tone');
  assert.equal(somaZone(0.8, 2), 'slap');
  assert.equal(somaZone(0.5, 3), 'muted');
});

test('lens: stuck in one zone, flat dynamics, steady time', () => {
  const lens = new SomaLens();
  for (let i = 0; i < 12; i++) lens.feed(strike(1000 + i * 500, 0.7, 0.08));
  const o = ids(lens, 6600);
  assert.ok(o.includes('strike.zone.stuck'));
  assert.ok(o.includes('strike.velocity.flat'));
  assert.ok(o.includes('groove.steady'));
  assert.equal(lens.observe(6600).find((x) => x.id === 'groove.steady')!.data.bpm, 120);
});

test('lens: speeding up is rushing, varied strokes and dynamics are noticed', () => {
  const lens = new SomaLens();
  let t = 0;
  const zones = [0.08, 0.6, 0.8];
  for (let i = 0; i < 14; i++) { t += 600 - i * 25; lens.feed(strike(t, 0.2 + (i % 4) * 0.25, zones[i % 3], i % 3 === 2 ? 2 : 1)); }
  const o = ids(lens, t + 100);
  assert.ok(o.includes('groove.rushing'), o.join());
  assert.ok(o.includes('strike.variety'));
  assert.ok(o.includes('strike.velocity.wide'));
});

function rig(chattiness: 1 | 2 | 3 = 2) {
  let clock = 0;
  const said: string[] = [];
  const demos: string[] = [];
  const asked: string[] = [];
  const lens = new SomaLens();
  const d = new LiveDirector({
    sheet: sheetById('amara')!, lens, clock: () => clock, random: () => 0,
    speak: async (text, onWord) => { said.push(text); text.split(' ').forEach((_, i) => onWord(i)); },
    ask: async (history, screen) => { asked.push(`${history[history.length - 1].content} | ${screen}`); return { text: 'Keep your wrist loose.', lane: 'built-in' }; },
    perform: async (demo) => { demos.push(demo.id); },
    enrich: () => ({ intro: 'This is the djembe.', drum: 'Djembe' }),
    screen: () => 'SOMA open on a djembe.',
  });
  d.chattiness = chattiness;
  const at = (ms: number) => { clock = ms; };
  return { d, said, demos, asked, at, lens };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('director: says hello with the drum intro, then introduces a new preset', async () => {
  const { d, said, at } = rig();
  at(100); d.feed({ kind: 'open', instrument: 'soma', trackId: 't', at: 100 });
  d.tick(); await settle();
  assert.match(said[0], /^I'm Amara\. This is the djembe\./);
  at(5000); d.feed({ kind: 'preset', instrument: 'soma', trackId: 't', at: 5000, presetId: 'x', presetName: 'X' });
  d.tick(); await settle();
  assert.equal(said[1], 'This is the djembe.');
});

test('director: never talks over the player — waits for a pause, then gives feedback and a demo', async () => {
  const { d, said, demos, at } = rig(2);
  for (let i = 0; i < 12; i++) { at(20_000 + i * 400); d.feed(strike(20_000 + i * 400, 0.7, 0.08)); d.tick(); await settle(); }
  assert.equal(said.length, 0, 'quiet while they play');
  at(20_000 + 11 * 400 + 1500); d.tick(); await settle();
  assert.equal(said.length, 1);
  assert.match(said[0], /centre bass/);
  assert.deepEqual(demos, ['three-voices']);
});

test('director: quiet mode skips coaching but still greets', async () => {
  const { d, said, at } = rig(1);
  for (let i = 0; i < 12; i++) d.feed(strike(20_000 + i * 400, 0.7, 0.08));
  at(30_000); d.tick(); await settle();
  assert.equal(said.length, 0);
  d.feed({ kind: 'open', instrument: 'soma', trackId: 't', at: 30_000 }); d.tick(); await settle();
  assert.equal(said.length, 1);
});

test('director: cooldowns stop repeats', async () => {
  const { d, said, at } = rig(3);
  for (let i = 0; i < 12; i++) d.feed(strike(20_000 + i * 400, 0.7, 0.08));
  at(30_000); d.tick(); await settle();
  at(40_000); d.tick(); await settle();
  const stuck = said.filter((s) => /centre bass/.test(s));
  assert.equal(stuck.length, 1);
});

test('director: answers questions with what is on screen and what they played; "show me" plays the demo', async () => {
  const { d, said, asked, demos, at } = rig();
  for (let i = 0; i < 5; i++) d.feed(strike(1000 + i * 500, 0.6, 0.6));
  at(5000);
  await d.hear('Can you show me the basic tumbao?');
  assert.match(asked[0], /basic tumbao\? \| SOMA open on a djembe\. What they're playing: .*5 strokes/);
  assert.equal(said[said.length - 1], 'Keep your wrist loose.');
  assert.deepEqual(demos, ['tumbao']);
  assert.equal(d.snapshot.history.length, 2);
});

test('director: their own demo hits are not counted as the learner playing', async () => {
  const { d, lens, at } = rig();
  let release!: () => void;
  (d as any).deps.perform = () => new Promise<void>((r) => { release = r; });
  const p = d.demo('tumbao');
  for (let i = 0; i < 12; i++) d.feed(strike(1000 + i * 300, 0.7, 0.08));
  at(10_000);
  assert.equal(lens.observe(10_000).length, 0);
  release(); await p;
  assert.equal(d.snapshot.state, 'idle');
});
