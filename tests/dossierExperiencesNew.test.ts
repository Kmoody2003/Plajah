import test from 'node:test';
import assert from 'node:assert/strict';
import { STICK_LINES, STICK_SORTS, STICK_MAX, asSorts, matchedPrefix, setSort, sortForKey, stickMatches, takeOut } from '../services/dossier/composingStick';
import { BOT, START_POINTS, TOP, TOWNS, classify, clampPt, eastOfLine, keyStep, toMap } from '../services/dossier/partitionPen';
import { DOSSIERS } from '../data/dossier/registry';
import { douglassDossier } from '../data/dossier/douglass';
import { partitionDossier } from '../data/dossier/partition';

test('Composing stick: three verified lines, each settable from the case alone', () => {
  assert.equal(STICK_LINES.length, 3);
  assert.equal(STICK_LINES[0].text, 'This Fourth July is yours, not mine.', 'the 1852 pamphlet reads "Fourth July", not "Fourth of July"');
  assert.equal(STICK_LINES[1].text, 'You may rejoice, I must mourn.');
  assert.equal(STICK_LINES[2].text, 'I am not included within the pale of this glorious anniversary!');
  for (const l of STICK_LINES) {
    assert.ok(l.text.length <= STICK_MAX);
    for (const ch of asSorts(l.text)) assert.ok(ch === ' ' || STICK_SORTS.includes(ch), `${l.id} needs ${ch}`);
  }
});

test('Composing stick: keys, spacing, capacity, matching', () => {
  assert.equal(sortForKey('a'), 'A');
  assert.equal(sortForKey(' '), ' ');
  assert.equal(sortForKey('Enter'), null);
  assert.equal(sortForKey('7'), null);
  assert.equal(setSort('', ' '), '', 'no leading space');
  assert.equal(setSort('A ', ' '), 'A ', 'no double space');
  assert.equal(setSort('A'.repeat(STICK_MAX), 'B'), 'A'.repeat(STICK_MAX), 'a full stick refuses type');
  assert.equal(takeOut('ABC'), 'AB');
  const l = STICK_LINES[1];
  assert.equal(stickMatches(asSorts(l.text), l), true);
  assert.equal(stickMatches('YOU MAY', l), false);
  assert.equal(matchedPrefix('YOU MAZ', l), 6);
});

test('Partition pen: the starting line scores, a line through the gap scores 11/11, a line far west puts every town east except one above the top end', () => {
  assert.equal(TOWNS.length, 11);
  const start = classify(START_POINTS);
  assert.equal(start.total, 11);
  assert.equal(start.west.length + start.east.length, 11);
  const good = classify([{ x: 860, y: 330 }, { x: 800, y: 420 }, { x: 760, y: 500 }]);
  assert.equal(good.match, 11);
  assert.match(good.verdict, /Every place sits on the same side/);
  const farWest = classify([{ x: 60, y: 330 }, { x: 60, y: 420 }, { x: 60, y: 500 }]);
  assert.equal(farWest.east.length, 10, 'Sialkot lies above the top end, so it stays west of the straight end leg');
  assert.equal(farWest.west[0].town.n, 'Sialkot');
  assert.equal(farWest.match, TOWNS.filter(t => t.a === 'I').length + 1, 'all six Indian towns plus Sialkot agree');
  assert.equal(eastOfLine({ x: 1000, y: 100 }, START_POINTS), true, 'the end legs run straight up off the map');
  assert.ok(TOP.y < BOT.y);
});

test('Partition pen: clamping, pointer mapping and arrow keys', () => {
  assert.deepEqual(clampPt({ x: -5, y: 5000 }), { x: 40, y: 920 });
  assert.deepEqual(clampPt({ x: NaN, y: NaN }), { x: 40, y: 30 });
  assert.deepEqual(toMap(150, 100, { left: 50, top: 0, width: 200, height: 200 }), { x: 640, y: 474.5 });
  assert.deepEqual(keyStep('ArrowLeft', false), { x: -6, y: 0 });
  assert.deepEqual(keyStep('ArrowDown', true), { x: 0, y: 20 });
  assert.equal(keyStep('a', false), null);
});

test('Wiring: both experiences sit on the nodes that carry their story, and the Ford card no longer leads with the hard truth', () => {
  const node = (d: typeof douglassDossier, id: string) => d.rooms.flatMap(r => r.nodes).find(n => n.id === id)!;
  assert.equal(node(douglassDossier, 'n-r3-story').experience, 'douglass-composing-stick');
  assert.equal(node(partitionDossier, 'n-r5-story').experience, 'partition-pen');
  const ford = DOSSIERS.find(d => d.id === 'henry-ford')!;
  assert.ok(!/hatred/i.test(ford.tagline) && /Detroit/.test(ford.tagline), ford.tagline);
});
