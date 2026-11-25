// Lexicon kit: playkit adventure + learning modules, and the starter project's rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { arithChallenge, letterChallenge, makeSumTarget, subsetReaching, valueChallenge, wordValue, type LexEntry } from '../playkit/learning/challenges';
import { Instrument, noteFrequency } from '../playkit/adventure/instrument';
import { cycleTarget, keepLock, pickTarget } from '../playkit/adventure/lockOn';
import { DialogueRunner } from '../playkit/adventure/dialogue';
import { lexiconProject, LEXICON_NAMES } from '../services/gamestudio/projects/lexicon';
import { RulePlayer, type RuleHost } from '../services/gamestudio/rulePlayer';
import { ruleSentence } from '../services/gamestudio/rules';
import { validateProject } from '../services/gamestudio/validate';

const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const BANK: LexEntry[] = [
  { w: 'LIGHT', def: 'what chases the dark', tier: 1 },
  { w: 'HOME', def: 'where you are known', tier: 1 },
  { w: 'COURAGE', def: 'fear that kept walking', tier: 3 },
];

test('word values use A=1 … Z=26', () => {
  assert.equal(wordValue('CAT'), 24);
  assert.equal(wordValue('light'), 56);
});

test('every challenge has four distinct choices and the right answer', () => {
  const rng = seeded();
  for (let i = 0; i < 300; i++) {
    for (const c of [letterChallenge(BANK, 3, undefined, rng), arithChallenge(1 + (i % 3), rng), valueChallenge(BANK, 3, undefined, rng)]) {
      assert.equal(c.choices.length, 4);
      assert.equal(new Set(c.choices).size, 4);
      const pick = c.choices[c.answer];
      if (c.kind === 'letter') assert.equal(c.prompt.replace(/ /g, '').replace('_', pick), c.entry!.w);
      if (c.kind === 'value') assert.equal(Number(pick), wordValue(c.entry!.w));
      if (c.kind === 'arith') {
        const expr = c.prompt.replace('?', pick).replace('×', '*').replace('−', '-').replace('÷', '/');
        const [lhs, rhs] = expr.split('=').map((s) => s.trim());
        // eslint-disable-next-line no-new-func
        assert.equal(Function(`return ${lhs}`)(), Number(rhs), c.prompt);
      }
    }
  }
});

test('letter challenges prefer the words the game asks for', () => {
  const rng = seeded(3);
  for (let i = 0; i < 40; i++) assert.equal(letterChallenge(BANK, 3, (e) => e.w === 'HOME', rng).entry!.w, 'HOME');
});

test('sum gates are always solvable', () => {
  const rng = seeded(11);
  for (let i = 0; i < 200; i++) {
    const vals = Array.from({ length: 2 + (i % 6) }, () => 5 + Math.floor(rng() * 90));
    const t = makeSumTarget(vals, rng);
    const idx = subsetReaching(vals, t)!;
    assert.ok(idx, `target ${t} from ${vals}`);
    assert.equal(idx.reduce((s, k) => s + vals[k], 0), t);
  }
  assert.equal(subsetReaching([4, 9], 5), null);
});

test('the instrument plays songs from notes and forgets after a pause', () => {
  const inst = new Instrument([{ id: 'TIME', notes: [...'TIME'] }, { id: 'LIGHT', notes: [...'LIGHT'] }]);
  let t = 0;
  const playWord = (w: string) => [...w].map((c) => inst.play(c, (t += 0.2))).pop()!;
  assert.equal(playWord('XLIGHT').song?.id, 'LIGHT');
  assert.equal(playWord('TIM').song, undefined);
  t += 5; // long pause: phrase restarts
  assert.equal(inst.play('E', t).song, undefined);
  assert.equal(playWord('TIME').song?.id, 'TIME');
  assert.ok(noteFrequency('B') > noteFrequency('A'));
});

test('lock-on picks the centred target, cycles, and lets go out of range', () => {
  const list = [
    { id: 'front', x: 0, z: 6, alive: true },
    { id: 'side', x: 7, z: 1, alive: true },
    { id: 'behind', x: 0, z: -6, alive: true },
    { id: 'dead', x: 0, z: 3, alive: false },
  ];
  assert.equal(pickTarget(0, 0, 0, list)?.id, 'front');
  const next = cycleTarget(list[0], 0, 0, list);
  assert.ok(next && next.id !== 'front');
  assert.equal(keepLock(list[0], 0, 100), false);
});

test('dialogue follows conditions, choices and actions', () => {
  const have = new Set<string>();
  const acts: string[] = [];
  const d = new DialogueRunner({
    start: { text: 'Hello', if: 'has:HOME', else: 'ask' },
    ask: { text: 'I lost a word.', choices: [{ label: 'Give HOME', if: 'has:HOME', do: 'give:HOME' }, { label: 'Bye' }] },
  }, { test: (c) => have.has(c.slice(4)), act: (a) => acts.push(a) });
  assert.equal(d.start()?.text, 'I lost a word.');
  assert.equal(d.current()?.choices?.length, 1);
  have.add('HOME');
  assert.equal(d.start()?.text, 'Hello');
  d.next();
  assert.ok(d.done);
});

test('the Lexicon project validates and its rules run', () => {
  const p = lexiconProject(1000);
  const v = validateProject(p);
  assert.ok(v.ok, JSON.stringify(v));
  const glossa = p.levels.find((l) => l.id === 'glossa')!;
  const calls: string[] = [];
  const host: RuleHost = {
    showText: (t) => calls.push(`text:${t.slice(0, 12)}`), spawnWave: () => {}, spawnBoss: () => {}, giveItem: () => {},
    setTimer: () => {}, win: (n) => calls.push(`win:${n}`), lose: () => {}, restartFromCheckpoint: () => {},
    unlockLevel: (l) => calls.push(`unlock:${l}`), openGate: (g) => calls.push(`gate:${g}`),
  };
  const rp = new RulePlayer(glossa.rules, glossa.zones, host, (k, id) => LEXICON_NAMES[`${k}:${id}`]);
  rp.start();
  for (let i = 0; i < 5; i++) rp.collected('words');
  rp.emit('gateOpened', { gate: 'cipher' });
  rp.tick(0.1, { player: [0, 0, -77] });
  assert.deepEqual(calls.filter((c) => !c.startsWith('text')), ['unlock:temple', 'win:temple']);
  assert.equal(calls.filter((c) => c.startsWith('text')).length, 3);
  const sentence = ruleSentence(glossa.rules.find((r) => r.id === 'g-open')!, (k, id) => LEXICON_NAMES[`${k}:${id}`]);
  assert.match(sentence, /When cipher opens, unlock Temple of Numerals/);
});
