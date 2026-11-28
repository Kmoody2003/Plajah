// amboCinematic.test.ts — the Cinematic slide family and the Story Verse scripture look.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboCinematic.test.ts --bundle --platform=node --format=esm --packages=external --outfile=<tmp>/cine.test.mjs
//   node --test <tmp>/cine.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_TEMPLATES, buildSlideObjects, defaultFields, templateById } from '../services/ambo/slideTemplates/registry';
import { parseFigure } from '../services/ambo/slideTemplates/cinematicDrawers';
import { scriptureLayoutById } from '../services/ambo/scriptureLayouts';

const WALL: [number, number] = [3712, 1080];
const IDS = ['cine-title', 'cine-story', 'cine-overview', 'cine-teach', 'cine-case'];

describe('Cinematic slide family', () => {
  test('all five templates are in the catalogue', () => {
    for (const id of IDS) assert.ok(templateById(id), id);
    assert.equal(SLIDE_TEMPLATES.filter(t => t.id.startsWith('cine-')).length, IDS.length);
  });

  test('art sits on a live, breathing scene drawer under the type', () => {
    for (const id of ['cine-title', 'cine-story']) {
      const objs = buildSlideObjects(id, 'sanctuary', { ...defaultFields(templateById(id)!), image: 'data:image/png;base64,AAAA' }, ...WALL)!;
      assert.equal(objs[0].live?.drawer, 'cine.scene', id);
      assert.equal(objs[0].templateRole, 'GROUND');
      // Every readable word is a static TEXT object (words never move while held).
      for (const o of objs) if (o.kind === 'TEXT') assert.equal(o.amb, undefined, `${id} ${o.objectLabel}`);
    }
  });

  test('on the 3712×1080 wall the story heading sits on the brief centreline (x 1856, y 220)', () => {
    const objs = buildSlideObjects('cine-story', 'sanctuary', { heading: 'The steward prays for direction', image: '' }, ...WALL)!;
    const h = objs.find(o => o.objectLabel === 'Heading')!;
    assert.ok(Math.abs(h.x + h.w / 2 - 1856) < 1);
    assert.ok(Math.abs(h.y + h.h / 2 - 220) < 1);
  });

  test('case studies are facts only — no lesson line, even if one is supplied', () => {
    const f = { ...defaultFields(templateById('cine-case')!), lesson: 'Set spending limits while income is strong.',
      blocks: 'EARNINGS | ≈$300M | estimated boxing earnings\nFINANCIAL DECISIONS | - | Lavish spending / Poor financial advice\nRECORDED OUTCOME | 2003 | Filed for Chapter 11' };
    const objs = buildSlideObjects('cine-case', 'airy', f, ...WALL)!;
    assert.ok(!objs.some(o => /lesson/i.test(o.objectLabel || '') || /spending limits/i.test(o.text || '')));
    assert.equal(objs.filter(o => o.live?.drawer === 'cine.figure').length, 2, 'two counted figures; the statement block has none');
    assert.ok(objs.some(o => o.text === 'Lavish spending\nPoor financial advice'));
  });

  test('teaching layouts: points, contrast and tally', () => {
    const base = defaultFields(templateById('cine-teach')!);
    const pts = buildSlideObjects('cine-teach', 'airy', { ...base, items: 'A | Genesis 1:1\nB | Genesis 1:2\nC | Genesis 1:3', lesson: 'L' }, ...WALL)!;
    assert.equal(pts.filter(o => o.objectLabel === 'Point').length, 3);
    const con = buildSlideObjects('cine-teach', 'airy', { ...base, mode: 'contrast', items: '7 YEARS | Abundance\n7 YEARS | Famine' }, ...WALL)!;
    assert.equal(con.filter(o => o.live?.drawer === 'cine.figure').length, 2);
    const tal = buildSlideObjects('cine-teach', 'airy', { ...base, mode: 'tally', items: '5 | Talents\n2 | Talents\n1 | Talent' }, ...WALL)!;
    assert.equal(tal.filter(o => o.objectLabel === 'Coin').length, 8);
  });

  test('figures: currency and units count up; bare years do not', () => {
    assert.deepEqual(parseFigure('≈$300M'), { pre: '≈$', num: 300, dec: 0, suf: 'M' });
    assert.deepEqual(parseFigure('$12.7M'), { pre: '$', num: 12.7, dec: 1, suf: 'M' });
    assert.deepEqual(parseFigure('>$50M'), { pre: '>$', num: 50, dec: 0, suf: 'M' });
    assert.deepEqual(parseFigure('25 YEARS'), { pre: '', num: 25, dec: 0, suf: ' YEARS' });
    assert.equal(parseFigure('2003'), null);
    assert.equal(parseFigure('Abundance'), null);
  });
});

describe('Story Verse scripture look', () => {
  test('registered as a transparent Art Council look', () => {
    const l = scriptureLayoutById('story-verse');
    assert.equal(l.id, 'story-verse');
    assert.equal(l.background, 'transparent');
    assert.equal(l.family, 'Art Council');
  });
});
