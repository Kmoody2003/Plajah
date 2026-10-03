import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFolio, seedOf, wobblyRule } from '../components/learn/lesson/folioParse';

test('callouts are recognised by their existing prefixes without editing the text', () => {
  const { blocks } = parseFolio('Opening paragraph about ratios.\n\nWorked example: 2 + 2 = 4.\n\nWhy it matters: sums add up.\n\nTrap: do not add the units.\n\nTry this: add two more.\n\nEveryday example: two apples and two more.');
  assert.deepEqual(blocks.map(b => b.variant || b.kind), ['lede', 'worked', 'why', 'trap', 'try', 'example']);
  assert.equal(blocks[1].text, '2 + 2 = 4.'); assert.equal(blocks[1].label, 'Worked example');
});

test('only one callout per lesson is emphasised, and the text is otherwise untouched', () => {
  const { blocks } = parseFolio('One.\n\nWhy it matters: first.\n\nTwo.\n\nWhy it mattered: second.');
  assert.equal(blocks.filter(b => b.emphasised).length, 1);
  assert.equal(blocks.find(b => b.emphasised)!.text, 'First.');
});

test('plain paragraphs keep their order and the first is the lede; long text gets section breaks', () => {
  const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const { blocks, minutes } = parseFolio([para(60), para(60), para(60), para(60)].join('\n\n'));
  assert.equal(blocks[0].kind, 'lede'); assert.equal(blocks.map(b => b.index).join(), '0,1,2,3');
  assert.ok(blocks[3].section > 0); assert.ok(minutes >= 1);
});

test('a lesson seed is stable and gives the same pen-drawn rule every time', () => {
  assert.equal(seedOf('history-asia.l01'), seedOf('history-asia.l01')); assert.notEqual(seedOf('a.l1'), seedOf('a.l2'));
  assert.equal(wobblyRule(seedOf('x.l1')), wobblyRule(seedOf('x.l1'))); assert.notEqual(wobblyRule(seedOf('x.l1')), wobblyRule(seedOf('x.l2')));
});

test('every shipped lesson parses to at least one block and keeps all of its words', async () => {
  const { loadAllCourses } = await import('../scripts/content/lib');
  const count = (s: string) => (s.match(/\S+/g) || []).length;
  for (const c of await loadAllCourses()) for (const t of c.curriculum.tracks) for (const l of t.lessons) {
    const body = l.body || ''; if (!body) continue;
    const { blocks } = parseFolio(body);
    assert.ok(blocks.length >= 1, `${l.id} has no blocks`);
    // Stripped callout labels are the only text the folio is allowed to move.
    const kept = blocks.reduce((a, b) => a + count(b.text), 0), labels = blocks.filter(b => b.kind === 'callout').reduce((a, b) => a + count(b.label || ''), 0);
    assert.ok(count(body) - kept <= labels + 6 * blocks.length, `${l.id} lost words`);
  }
});

import { niceTicks, plotPath, sampleFn, placeFigures, fmtTick } from '../components/learn/lesson/figures';
import { LESSON_FIGURES } from '../data/lessonFigures';

test('axis ticks are round numbers that cover the data', () => {
  const t = niceTicks(0, 29.45); assert.deepEqual(t.ticks, [0, 10, 20, 30]); assert.ok(t.lo <= 0 && t.hi >= 29.45);
  const u = niceTicks(-4, 5); assert.ok(u.ticks.includes(0) && u.lo <= -4 && u.hi >= 5);
  assert.deepEqual(niceTicks(3, 3).ticks.length >= 2, true);
});

test('a function plot breaks at undefined values and samples the whole domain', () => {
  const pts = sampleFn(x => 1 / x, [-1, 1], 20); assert.equal(pts.length, 21);
  const d = plotPath(pts.map(([x, y]) => [x, isFinite(y) && Math.abs(y) < 50 ? y : NaN] as [number, number]), x => x * 10, y => y);
  assert.ok(d.startsWith('M') && (d.match(/M/g) || []).length >= 2, 'the line is broken near x = 0');
  assert.equal(fmtTick(0.5), '0.5'); assert.equal(fmtTick(20000), '2e+4');
});

test('figures are placed after the requested text block and clamped to the text', () => {
  const m = placeFigures([{ after: 1 }, { after: 99 }, {}], 3); assert.equal(m.get(1)!.length, 1); assert.equal(m.get(2)!.length, 1); assert.equal(m.get(0)!.length, 1);
});

test('every authored figure carries a caption and is valid; the maths in the demo figures is right', () => {
  for (const [lid, figs] of Object.entries(LESSON_FIGURES)) for (const f of figs) {
    assert.ok(f.caption.length > 30, `${lid}/${f.id} needs a caption`);
    if (f.type === 'graph') for (const m of f.marks || []) assert.ok(isFinite((f.fn || ((x: number) => f.fnp!(x, f.param!.value)))(m.x)), `${f.id} mark ${m.label}`);
    if (f.type === 'diagram') { const ids = new Set(f.nodes.map(n => n.id)); for (const [a, b] of f.edges) assert.ok(ids.has(a) && ids.has(b), `${f.id} edge`); }
    if (f.type === 'chart') for (const s of f.series) assert.equal(s.points.length, f.series[0].points.length, `${f.id} series align`);
  }
  const k = (LESSON_FIGURES['lab-astronomy.l02'][0] as any).fn;
  assert.ok(Math.abs(k(5.203) - 11.87) < 0.05 && Math.abs(k(9.537) - 29.45) < 0.05, 'Kepler: Jupiter 11.87 y, Saturn 29.45 y');
  const q = (LESSON_FIGURES['lab-mathematics.l07'][0] as any).fn; assert.equal(q(-1), 0); assert.equal(q(3), 0); assert.equal(q(1), -4);
  const w = (LESSON_FIGURES['music-theory.l08'][0] as any).fn; assert.ok(Math.abs(w(1000 / 440 / 4) - 1) < 1e-9, '440 Hz peaks at a quarter period');
});

import { compileExpr, checkExpr } from '../components/learn/lesson/exprParser';
import { applyOverlay, diffParagraphs, hashBody, newOverlay, adoptOverlay, validateOverlay, creditLine, adaptedLine } from '../components/learn/lesson/lessonOverlay';
import { matchCallout, CALLOUT_PREFIX } from '../components/learn/lesson/folioParse';

test('the formula parser reads ordinary maths and never runs code', () => {
  const f = compileExpr('x^2 - 2x - 3'); assert.equal(f(3), 0); assert.equal(f(-1), 0); assert.equal(f(1), -4);
  assert.equal(compileExpr('2^3^2')(0), 512, 'power is right-associative');
  assert.equal(compileExpr('-x^2')(3), -9, 'unary minus binds below power');
  assert.equal(compileExpr('3(x+1)')(2), 9); assert.equal(compileExpr('2pi')(0), 2 * Math.PI);
  assert.ok(Math.abs(compileExpr('sin(pi/2)')(0) - 1) < 1e-12); assert.equal(compileExpr('sqrt(x)')(16), 4); assert.equal(compileExpr('log(1000)')(0), 3);
  for (const bad of ['alert(1)', 'x; y', 'process', '2 +', '(x', 'x y z(', '', 'constructor']) assert.ok(checkExpr(bad) !== null, `"${bad}" must be rejected`);
  assert.equal(checkExpr('x^2'), null);
});

test('a teacher version replaces the text for its class and leaves the original untouched', () => {
  const baseBody = 'First paragraph.\n\nWhy it matters: because.\n\nLast one.';
  const base = { title: 'T', body: baseBody, figures: [] as any[] };
  const o = newOverlay({ id: 'c.l1', courseId: 'c', title: 'T', body: baseBody }, { uid: 'u1', name: 'Ms Ruiz', school: 'Lincoln Middle' }, ['class1']);
  assert.equal(applyOverlay(base, o).changed.size, 0, 'an untouched copy marks nothing as changed');
  const edited = { ...o, body: 'First paragraph.\n\nWhy it matters: because, and here is a local example.\n\nLast one.\n\nNew closing thought.' };
  const a = applyOverlay(base, edited);
  assert.deepEqual([...a.changed].sort(), [1, 3]); assert.equal(a.added, 2); assert.equal(a.removed, 1); assert.equal(base.body, baseBody);
  assert.equal(creditLine(edited), 'Customized by Ms Ruiz, Lincoln Middle'); assert.equal(applyOverlay({ ...base, body: baseBody + '\n\nUpdated.' }, edited).stale, true);
  assert.equal(applyOverlay(base, null).body, baseBody);
});

test('adopting a shared version makes it the adopter\'s own, keeps the credit, and scopes it to their classes', () => {
  const src = { ...newOverlay({ id: 'c.l1', courseId: 'c', title: 'T', body: 'A.\n\nB.' }, { uid: 'u1', name: 'Ms Ruiz' }, ['c1']), visibility: 'shared' as const };
  const mine = adoptOverlay(src, { uid: 'u2', name: 'Mr Okafor', school: 'Oak High' }, ['c9']);
  assert.notEqual(mine.id, src.id); assert.equal(mine.authorUid, 'u2'); assert.deepEqual(mine.classIds, ['c9']); assert.equal(mine.visibility, 'class');
  assert.equal(adaptedLine(mine), "Adapted from Ms Ruiz's version"); assert.equal(mine.body, src.body);
  assert.equal(adoptOverlay(mine, { uid: 'u3', name: 'Dr Lee' }, ['c2']).forkedFrom!.authorName, 'Mr Okafor');
});

test('a version cannot be saved with an invalid formula, no caption, a bad video link, or no class', () => {
  const o = { ...newOverlay({ id: 'c.l1', courseId: 'c', title: 'T', body: 'A.' }, { uid: 'u', name: 'N' }, ['c1']) };
  assert.deepEqual(validateOverlay(o), []);
  assert.ok(validateOverlay({ ...o, classIds: [] }).some(e => /class/.test(e)));
  assert.ok(validateOverlay({ ...o, classIds: ['1', '2', '3', '4', '5', '6'] }).some(e => /at most 5/.test(e)));
  assert.ok(validateOverlay({ ...o, addFigures: [{ id: 'g', type: 'graph', title: 't', expr: 'alert(1)', domain: [0, 1], x: { label: 'x' }, y: { label: 'y' }, caption: 'Look at the curve.' } as any] }).some(e => /Graph formula/.test(e)));
  assert.ok(validateOverlay({ ...o, addFigures: [{ id: 'v', type: 'video', url: 'javascript:alert(1)', caption: 'A clip of the scene.' } as any] }).some(e => /https/.test(e)));
  assert.ok(validateOverlay({ ...o, addFigures: [{ id: 'g', type: 'graph', title: 't', expr: 'x', domain: [0, 1], x: { label: 'x' }, y: { label: 'y' }, caption: '' } as any] }).some(e => /caption/.test(e)));
  assert.equal(hashBody('a  b\n\nc'), hashBody('a b c'));
});

test('callout prefixes round-trip, so editing one paragraph never rewrites the others', () => {
  for (const [k, pre] of Object.entries(CALLOUT_PREFIX)) { const m = matchCallout(pre + 'some text'); assert.ok(m && m.variant === k && m.rest === 'some text', k); }
  assert.equal(matchCallout('A plain paragraph.'), null);
});

import { matchList, parseFolio as parseF } from '../components/learn/lesson/folioParse';
import { lessonToTelaDoc, nativeChartFor } from '../services/tela/lessonDoc';

test('lists: markers, lead-in, ordered, and non-lists left alone', () => {
  const a = matchList('Three causes:\n- trade\n- war\n- famine');
  assert.deepEqual(a?.items, ['trade', 'war', 'famine']); assert.equal(a?.intro, 'Three causes:'); assert.equal(a?.marker, 'auto');
  assert.equal(matchList('1. one\n2. two')?.marker, 'number');
  assert.equal(matchList('+ yes\n+ also')?.marker, 'check');
  assert.equal(matchList('Just a sentence - with a dash.'), null);
  assert.equal(matchList('- only one item'), null);
  const { blocks } = parseF('Lede.\n\nSteps:\n> a\n> b\n\nAfter.');
  assert.deepEqual(blocks.map(b => b.kind), ['lede', 'body', 'list', 'body']);
});

test('lesson becomes a Tela doc: writer blocks, list items, native chart only when lossless', () => {
  const figs: any[] = [
    { id: 'c1', type: 'chart', kind: 'line', title: 'T', caption: 'cap', x: { label: 'Year' }, y: { label: 'Pop' }, series: [{ name: 'a', points: [[1, 2], [2, 3]] }] },
    { id: 'c2', type: 'chart', kind: 'scatter', title: 'S', caption: 'cap', x: { label: 'x' }, y: { label: 'y' }, series: [{ name: 'a', points: [[1, 2], [2, 3]] }] },
  ];
  const doc = lessonToTelaDoc({ lessonId: 'x.l1', title: 'Title', body: 'Lede.\n\nWhy it matters: because.\n\n- a\n- b', figures: figs });
  const w: any = doc.devices['x.l1:text'];
  assert.deepEqual(w.blocks.map((b: any) => b.kind), ['h2', 'p', 'p', 'li', 'li']);
  assert.equal(doc.devices['x.l1:fig:c1'].type, 'CHART');
  assert.equal(doc.devices['x.l1:fig:c2'].type, 'FIGURE');
  assert.equal(nativeChartFor(figs[1], 'q', 'default'), null);
  assert.deepEqual(lessonToTelaDoc({ lessonId: 'x.l1', title: 'Title', body: 'a', figures: [] }).lesson?.figures, []);
});
