// STEM track: every lesson is complete and safe, every project opens a real Build room, every answer key checks out.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STEM_UNITS, STEM_LESSONS, STEM_PROJECTS, STEM_BANDS, unitsForBand, stemLessonsForCcss, type Check, type StemLesson,
} from '../data/stem';
import { validateLaunch, ADULT_ONLY_RECIPES } from '../services/stem/launch';
import { STEM_PROJECT_SEEDS, STEM_LESSON_SEEDS, stemLaunchForSeed, lessonWorksheet, projectSeed } from '../services/stem/classwork';
import { fretPosition } from '../services/elec/guitar';
import { worksheetToTela } from '../services/yearCurriculum/telaWorksheet';

// ── Independent formulas (deliberately not shared with the app) ────────────────
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const F: Record<Check['f'], (a: number[]) => number> = {
  ohmV: ([i, r]) => i * r,
  ohmI: ([v, r]) => v / r,
  ohmR: ([v, i]) => v / i,
  power: ([v, i]) => v * i,
  series: a => sum(a),
  parallel: a => 1 / sum(a.map(r => 1 / r)),
  product: a => a.reduce((p, x) => p * x, 1),
  sum: a => sum(a),
  quotient: ([a, b]) => a / b,
  difference: ([a, b]) => a - b,
  area: ([l, w]) => l * w,
  perimeter: ([l, w]) => 2 * (l + w),
  volume: ([l, w, h]) => l * w * h,
  rcCharge: ([vs, r, c, t]) => vs * (1 - Math.exp(-t / (r * c))),
  rcTau: ([r, c]) => r * c,
  fret: ([s, n]) => s - s / 2 ** (n / 12),
  db: ([p2, p1]) => 10 * Math.log10(p2 / p1),
  dbV: ([v2, v1]) => 20 * Math.log10(v2 / v1),
  sine: ([amp, f, t]) => amp * Math.sin(2 * Math.PI * f * t),
  rms: ([peak]) => peak / Math.SQRT2,
  mean: a => sum(a) / a.length,
  range: a => Math.max(...a) - Math.min(...a),
  vecMag: ([x, y]) => Math.hypot(x, y),
  vecAngle: ([x, y]) => (Math.atan2(y, x) * 180) / Math.PI,
  slope: ([x1, y1, x2, y2]) => (y2 - y1) / (x2 - x1),
  pct: ([part, whole]) => (100 * part) / whole,
  ledR: ([vs, vf, i]) => (vs - vf) / i,
  batteryHours: ([mah, ma]) => mah / ma,
  gear: ([driver, driven]) => driven / driver,
  ma: ([effort, load]) => effort / load,
  pow: ([b, e]) => b ** e,
  log2: ([x]) => Math.log2(x),
  log10: ([x]) => Math.log10(x),
  sqrt: ([x]) => Math.sqrt(x),
};
const close = (a: number, b: number, tol?: number) => Math.abs(a - b) <= (tol ?? Math.max(0.01, Math.abs(b) * 0.01));

test('ids are unique across units, lessons and projects', () => {
  const ids = [...STEM_UNITS.map(u => u.id), ...STEM_LESSONS.map(l => l.id), ...STEM_PROJECTS.map(p => p.id)];
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')}`);
});

test('every band has at least two complete units, including an electronics-math sequence', () => {
  for (const band of STEM_BANDS) {
    const units = unitsForBand(band);
    const complete = units.filter(u => u.status === 'complete');
    assert.ok(complete.length >= 2, `${band}: ${complete.length} complete units`);
    assert.ok(complete.some(u => u.kind === 'electronics-math'), `${band}: no complete electronics-math unit`);
    assert.ok(complete.some(u => u.kind !== 'electronics-math'), `${band}: no complete science/engineering/technology unit`);
    const strands = new Set(units.flatMap(u => u.strands));
    for (const s of ['science', 'technology', 'engineering', 'math']) assert.ok(strands.has(s as any), `${band}: scope misses ${s}`);
  }
});

test('complete units have lessons; outline units list planned lessons and standards', () => {
  for (const u of STEM_UNITS) {
    const std = (u.standards.ngss?.length || 0) + (u.standards.ccss?.length || 0) + (u.standards.csta?.length || 0);
    assert.ok(std > 0, `${u.id}: no standards`);
    if (u.status === 'complete') assert.ok(u.lessons.length >= 3, `${u.id}: complete unit with ${u.lessons.length} lessons`);
    else assert.ok((u.outline?.length || 0) >= 2, `${u.id}: outline unit without planned lessons`);
  }
});

const lessonProblems = (l: StemLesson): string[] => {
  const e: string[] = [];
  if (l.objectives.length < 1 || !l.objectives.every(o => /^I can /.test(o))) e.push('objectives must be "I can …"');
  const std = (l.standards.ngss?.length || 0) + (l.standards.ccss?.length || 0) + (l.standards.csta?.length || 0);
  if (!std) e.push('no standards');
  if (l.vocab.length < 2) e.push('fewer than 2 vocab terms');
  if (!l.hook) e.push('no hook');
  if (l.build.steps.length < 2) e.push('build activity has fewer than 2 steps');
  if (l.worked.length < 1 || l.worked.some(w => w.steps.length < 2 || !w.answer)) e.push('worked example missing or thin');
  if (l.practice.length < 3) e.push('fewer than 3 practice items');
  if (l.practice.some(p => !p.answer.trim())) e.push('practice item without an answer key');
  if (!l.exitTicket.q || !l.exitTicket.answer) e.push('exit ticket incomplete');
  if (!l.differentiation.support.length || !l.differentiation.extension.length) e.push('differentiation incomplete');
  if (!l.safety.note) e.push('no safety note');
  return e;
};

test('every lesson has objectives, standards, a Build activity, worked examples, keyed practice, exit ticket, supports and safety', () => {
  const bad = STEM_LESSONS.map(l => [l.id, lessonProblems(l)] as const).filter(([, e]) => e.length);
  assert.deepEqual(bad, []);
});

test('electronics-math lessons are math-first: CCSS-tagged with a math focus and numeric practice', () => {
  for (const u of STEM_UNITS.filter(x => x.kind === 'electronics-math' && x.status === 'complete')) {
    for (const l of u.lessons) {
      assert.ok(l.standards.ccss?.length, `${l.id}: no CCSS-M code`);
      assert.ok(l.mathFocus, `${l.id}: no mathFocus`);
      assert.ok(l.practice.filter(p => typeof p.value === 'number').length >= 2, `${l.id}: fewer than 2 numeric practice items`);
    }
  }
});

test('CCSS codes use the full CCSS.MATH.CONTENT form', () => {
  for (const l of STEM_LESSONS) for (const c of l.standards.ccss || []) assert.match(c, /^CCSS\.MATH\.(CONTENT|PRACTICE)\./, `${l.id}: ${c}`);
});

test('math answer keys check numerically against independent formulas', () => {
  let checked = 0;
  for (const l of STEM_LESSONS) {
    for (const p of [...l.practice]) {
      if (p.check) {
        assert.equal(typeof p.value, 'number', `${l.id}: "${p.q}" has a check but no value`);
        const got = F[p.check.f](p.check.args);
        assert.ok(Number.isFinite(got), `${l.id}: check ${p.check.f}(${p.check.args}) is not finite`);
        assert.ok(close(p.value!, got, p.tol), `${l.id}: "${p.q}" key says ${p.value}, ${p.check.f}(${p.check.args}) = ${got}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 60, `only ${checked} machine-checked answers`);
});

test('the fret formula in the lessons matches the guitar designer in Electronics Lab', () => {
  for (const n of [1, 5, 7, 12, 19, 24]) assert.ok(Math.abs(F.fret([648, n]) - fretPosition(648, n)) < 1e-9);
  assert.ok(Math.abs(fretPosition(648, 12) - 324) < 1e-9, 'the 12th fret sits at half the scale');
  const fretItems = STEM_LESSONS.flatMap(l => l.practice).filter(p => p.check?.f === 'fret');
  assert.ok(fretItems.length >= 2, 'the 9-12 logarithm lesson should check fret positions');
});

test('Ohm and RC keys exist across the bands that teach them', () => {
  const fs = new Set(STEM_LESSONS.flatMap(l => l.practice.map(p => p.check?.f)).filter(Boolean));
  for (const f of ['ohmI', 'ohmR', 'series', 'parallel', 'rcCharge', 'db', 'sine', 'mean']) assert.ok(fs.has(f as any), `no practice item checks ${f}`);
});

test('every lesson and project launches a Build room whose starter resolves', () => {
  const bad: string[] = [];
  for (const l of STEM_LESSONS) for (const e of validateLaunch(l.build.launch)) bad.push(`${l.id}: ${e}`);
  for (const p of STEM_PROJECTS) for (const e of validateLaunch(p.launch)) bad.push(`${p.id}: ${e}`);
  assert.deepEqual(bad, []);
});

test('projects cover the Build rooms and every unit project id exists', () => {
  const rooms = new Set(STEM_PROJECTS.map(p => p.launch.room));
  for (const r of ['elec', 'studio', 'sew', 'bio']) assert.ok(rooms.has(r as any), `no project opens ${r}`);
  const ids = new Set(STEM_PROJECTS.map(p => p.id));
  for (const u of STEM_UNITS) for (const id of u.projectIds) assert.ok(ids.has(id), `${u.id} names missing project ${id}`);
  for (const p of STEM_PROJECTS) assert.ok(STEM_UNITS.some(u => u.id === p.unitId), `${p.id}: unknown unit ${p.unitId}`);
  for (const band of STEM_BANDS) assert.ok(STEM_PROJECTS.some(p => p.band === band), `${band}: no project`);
});

test('safety: K-5 never solders or touches mains; no student launch uses a mains recipe', () => {
  for (const l of STEM_LESSONS) {
    if (l.band === 'K-2' || l.band === '3-5') {
      const text = `${l.build.steps.join(' ')} ${(l.build.materials || []).join(' ')}`.toLowerCase();
      assert.ok(!/solder|mains|wall outlet|120 ?v|230 ?v|lithium|li-?ion/.test(text), `${l.id}: unsafe step for ${l.band}`);
    }
    assert.ok(!ADULT_ONLY_RECIPES.has(l.build.launch.template || ''), l.id);
  }
  for (const p of STEM_PROJECTS) {
    assert.ok(p.safety.note, `${p.id}: no safety note`);
    if (p.band === 'K-2' || p.band === '3-5') assert.ok(!/solder|mains|wall outlet/i.test(p.steps.join(' ')), `${p.id}: unsafe step`);
  }
});

test('projects become ordinary assignment-template seeds with a gradeable rubric and carry their Build launch', () => {
  assert.equal(STEM_PROJECT_SEEDS.length, STEM_PROJECTS.length);
  for (const seed of [...STEM_PROJECT_SEEDS, ...STEM_LESSON_SEEDS]) {
    assert.ok(seed.structure.rubric.criteria.length >= 2, `${seed.id}: rubric too thin`);
    for (const c of seed.structure.rubric.criteria) assert.deepEqual(c.levels.map(lv => lv.points), [1, 2, 3, 4], `${seed.id}/${c.name}`);
    assert.ok(seed.structure.standardsAlignment.length > 0 || seed.subject === 'science', `${seed.id}: nothing for the ledger`);
    assert.ok(stemLaunchForSeed(seed.id), `${seed.id}: no launch`);
  }
  const p = STEM_PROJECTS[0];
  assert.equal(stemLaunchForSeed(projectSeed(p).id)?.lesson, p.id);
  assert.equal(stemLaunchForSeed('seed-math-68-ratios'), null);
});

test('lesson practice lays out as a Tela worksheet with an answer key', () => {
  for (const l of STEM_LESSONS.slice(0, 6)) {
    const ws = lessonWorksheet(l);
    const { doc, pages } = worksheetToTela(ws, { includeKey: true, now: 0 });
    assert.ok(pages.length >= 1 && doc.frames.length >= 1, `${l.id}: no pages`);
  }
});

test('year-curriculum math units find their Build lessons by CCSS', () => {
  assert.ok(stemLessonsForCcss(['CCSS.MATH.CONTENT.6.RP.A.3']).length > 0, 'grade 6 ratios should link to an Ohm’s-law lesson');
  assert.ok(stemLessonsForCcss(['CCSS.MATH.CONTENT.3.MD.D.8']).length > 0, 'grade 3 perimeter should link to the enclosure lesson');
});
