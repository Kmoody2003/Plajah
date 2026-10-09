// Tests for the generated chalkboard art. Pure string output, so the checks are structural:
// every kind yields well-formed XML, unknown kinds fall back, and covers carry the chalk layer.
//
//   npx tsx --test tests/creatorArt.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALK_KINDS, chalkBoard, chalkOverlay } from '../services/creatorArt';
import { generatedCover, COURSE_CATEGORIES, COURSE_TEMPLATES } from '../services/creatorCourses';

const decode = (u: string) => decodeURIComponent(u.slice(u.indexOf(',') + 1));
const balanced = (svg: string) => {
  // every open tag has a close or is self-closing; cheap well-formedness check without a parser
  const opens = (svg.match(/<(?!\/|\?|!)[a-zA-Z][^>]*[^/]>/g) || []).length;
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
  return opens === closes;
};

test('every category, template and step has a scene, and it is well-formed', () => {
  for (const k of [...COURSE_CATEGORIES.map(c => c.id), ...COURSE_TEMPLATES.map(t => t.id), 'idea', 'outline', 'page', 'format', 'launch']) {
    assert.ok(CHALK_KINDS.includes(k), `scene for ${k}`);
    for (const u of [chalkBoard(k), chalkOverlay(k)]) {
      assert.ok(u.startsWith('data:image/svg+xml'));
      assert.ok(balanced(decode(u)), `balanced svg for ${k}`);
    }
  }
});

test('unknown kind falls back instead of throwing', () => {
  assert.ok(decode(chalkBoard('nope')).includes('<path'));
  assert.ok(decode(chalkOverlay(undefined)).includes('filter'));
});

test('a cover carries the chalk layer behind the title and stays valid', () => {
  const svg = decode(generatedCover('Beat-making', '🎵', 'ember', 'Music'));
  assert.ok(svg.includes('filter="url(#ch)"'));
  assert.ok(svg.indexOf('url(#ch)') < svg.indexOf('Beat-making'), 'chalk sits under the title');
  assert.ok(balanced(svg));
});

test('overlay opacity is clamped to something faint by default', () => {
  const svg = decode(chalkOverlay('Music'));
  assert.ok(/opacity="0\.2"/.test(svg));
});

test('boards and overlays animate by default; saved covers stay static and light', () => {
  const board = decode(chalkBoard('Music'));
  assert.ok(board.includes('@keyframes draw'));
  assert.ok(board.includes('pathLength="1"'));
  assert.ok(board.includes('prefers-reduced-motion'), 'reduced motion is honoured inside the image');
  assert.ok(balanced(board));
  assert.ok(!decode(chalkBoard('Music', { animated: false })).includes('@keyframes'));
  const saved = decode(generatedCover('T', '🎵', 'ember', 'Music'));
  assert.ok(!saved.includes('@keyframes'), 'default cover is static');
  const live = decode(generatedCover('T', '🎵', 'ember', 'Music', true));
  assert.ok(live.includes('@keyframes') && balanced(live));
});

test('every drawn stroke gets a staggered delay', () => {
  const delays = [...decode(chalkBoard('Business')).matchAll(/class="s" pathLength="1" style="animation-delay:([\d.]+)s"/g)].map(m => Number(m[1]));
  assert.ok(delays.length > 5);
  const strokes = delays.slice(0, 6);
  assert.deepEqual(strokes, [...strokes].sort((a, b) => a - b));
});

test('animated art avoids per-frame filters (perf on phones); static art keeps the chalk roughness', () => {
  const live = decode(chalkBoard('Music'));
  assert.ok(!/<g opacity="[\d.]+" filter=/.test(live), 'no filter on the animated scene');
  assert.ok(!live.includes('feGaussianBlur'));
  assert.ok(decode(chalkBoard('Music', { animated: false })).includes('filter="url(#ch)"'));
});

test('each subject has its own motion, hooked to a rule that exists', () => {
  const expect: Record<string, string[]> = {
    Music: ['wv', 'bob'], Film: ['clap', 'spin', 'slide'], Business: ['grow'], Science: ['bub', 'orb'], Health: ['beat'],
    Technology: ['blink', 'pulse'], Other: ['glow', 'tw'], Language: ['pop'], Art: ['dot'], Writing: ['tilt'],
    masterclass: ['swing'], challenge: ['flick'], 'live-series': ['arc'], mini: ['hand'], launch: ['flame'],
  };
  for (const [kind, classes] of Object.entries(expect)) {
    const svg = decode(chalkBoard(kind));
    for (const c of classes) {
      assert.ok(new RegExp(`class="${c}[ "]`).test(svg), `${kind} uses .${c}`);
      assert.ok(svg.includes(`.${c}{`) || svg.includes(`.${c}.`), `.${c} has a CSS rule`);
    }
    assert.ok(balanced(svg), `${kind} stays well-formed`);
    assert.ok(!/class="[^"]*"[^>]*\sclass="/.test(svg), `${kind} has no duplicate class attribute`);
  }
});

test('reduced motion silences every subject class', () => {
  const svg = decode(chalkBoard('Business'));
  const calm = svg.slice(svg.indexOf('prefers-reduced-motion'));
  for (const c of ['clap', 'grow', 'beat', 'bub', 'orb', 'flame', 'wv', 'hand']) assert.ok(calm.includes(`.${c}`), c);
});

test('static art carries no motion hooks styling', () => {
  assert.ok(!decode(chalkBoard('Business', { animated: false })).includes('@keyframes'));
});

test('chalk can be tinted so it stays distinct from white text; the default stays white', () => {
  const warm = decode(chalkBoard('Music', { ink: '#ffd98a' }));
  assert.ok(warm.includes('stroke="#ffd98a"'));
  assert.ok((warm.match(/stroke="#fff"/g) || []).length <= 1, 'only the frame stays white; scene strokes are re-inked');
  assert.ok(decode(chalkBoard('Music')).includes('stroke="#fff"'));
  assert.notEqual(chalkBoard('Music', { ink: '#ffd98a' }), chalkBoard('Music'), 'cache keys by ink');
  assert.ok(decode(chalkOverlay('Art', 0.3, true, '#ffd98a')).includes('#ffd98a'));
  assert.ok(balanced(warm));
});
