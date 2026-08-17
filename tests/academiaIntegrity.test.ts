// Tests for the Plajah Academia licence wall and its seed data.
//
// The licence gate is the piece where a silent mistake is a legal problem rather than a bug, so
// it gets real assertions rather than a smoke test: the ordering of restrictiveness, the
// non-commercial block, share-alike propagation, and — the one that would actually bite — that
// every seed template's materials resolve to a real library item with a licence we can evaluate.
//
//   npx tsx --test tests/academiaIntegrity.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  commercialOk, requiresShareAlike, mostRestrictive, gateForCommercialUse,
  composeAttribution, LICENSE_RANK, type License,
} from '../services/oerLicenseGate';
import {
  OER_LIBRARY, libraryItemById, filterLibrary, describeStandard, suggestPisaOverlay,
  PISA_LEVELS, ledgerFrameworkFor,
} from '../data/oerLibrary';
import { TEMPLATE_SEEDS, type Rubric } from '../data/assignmentTemplates';
import { scoresToMastery, lessonLink } from '../services/assignmentTemplateService';
import { relativeDue, curiosityOfTheDay } from '../components/academia/TodayDueFirst';

// ── Licence classification ──────────────────────────────────────────────────────

test('only PD, CC-BY and CC-BY-SA may be sold', () => {
  assert.equal(commercialOk('PD'), true);
  assert.equal(commercialOk('CC-BY'), true);
  assert.equal(commercialOk('CC-BY-SA'), true);
  assert.equal(commercialOk('CC-BY-NC'), false);
  assert.equal(commercialOk('CC-BY-NC-SA'), false);
});

test('share-alike is detected on both SA variants', () => {
  assert.equal(requiresShareAlike('CC-BY-SA'), true);
  assert.equal(requiresShareAlike('CC-BY-NC-SA'), true);
  assert.equal(requiresShareAlike('CC-BY'), false);
  assert.equal(requiresShareAlike('PD'), false);
});

test('the most restrictive licence in a bundle wins', () => {
  assert.equal(mostRestrictive(['PD', 'CC-BY']), 'CC-BY');
  assert.equal(mostRestrictive(['CC-BY', 'CC-BY-NC']), 'CC-BY-NC');
  assert.equal(mostRestrictive(['CC-BY-NC', 'CC-BY-SA']), 'CC-BY-NC');
  assert.equal(mostRestrictive(['CC-BY-NC-SA', 'PD', 'CC-BY']), 'CC-BY-NC-SA');
  // An empty bundle is unrestricted — a template with no materials is the teacher's own work.
  assert.equal(mostRestrictive([]), 'PD');
});

test('every licence appears exactly once in the restrictiveness ranking', () => {
  assert.equal(new Set(LICENSE_RANK).size, LICENSE_RANK.length);
  // Ordering must be least → most restrictive, since indexOf is the comparison.
  assert.ok(LICENSE_RANK.indexOf('PD') < LICENSE_RANK.indexOf('CC-BY'));
  assert.ok(LICENSE_RANK.indexOf('CC-BY-SA') < LICENSE_RANK.indexOf('CC-BY-NC'));
});

// ── The gate ────────────────────────────────────────────────────────────────────

const item = (id: string, license: License) =>
  ({ id, title: id, license, attribution: `${id} (${license})` });

test('a bundle of commercial-safe material passes and reports no blockers', () => {
  const gate = gateForCommercialUse([item('a', 'PD'), item('b', 'CC-BY')]);
  assert.equal(gate.allowed, true);
  assert.equal(gate.blocking.length, 0);
  assert.equal(gate.effectiveLicense, 'CC-BY');
  assert.equal(gate.shareAlikeRequired, false);
  assert.equal(gate.attributions.length, 2);
});

test('one non-commercial item blocks the whole bundle and names itself', () => {
  const gate = gateForCommercialUse([item('openstax', 'CC-BY'), item('ck12', 'CC-BY-NC')]);
  assert.equal(gate.allowed, false);
  assert.deepEqual(gate.blocking.map(b => b.itemId), ['ck12']);
  assert.match(gate.blocking[0].reason, /free tier only/i);
  // The teacher needs to know WHICH item, or the error is unactionable.
  assert.equal(gate.blocking[0].license, 'CC-BY-NC');
});

test('share-alike propagates from a single BY-SA material', () => {
  const gate = gateForCommercialUse([item('a', 'PD'), item('b', 'CC-BY-SA')]);
  assert.equal(gate.allowed, true);
  assert.equal(gate.shareAlikeRequired, true);
});

test('attribution is composed differently for public-domain material', () => {
  const pd = composeAttribution('Project Gutenberg', 'Frankenstein', 'PD', 'https://x');
  assert.match(pd, /public domain/);
  const by = composeAttribution('OpenStax', 'Physics', 'CC-BY', 'https://x');
  assert.match(by, /CC BY/);
  assert.match(by, /OpenStax/);
});

// ── Catalogue integrity ─────────────────────────────────────────────────────────

test('commercialOk is consistent with the licence on every catalogue item', () => {
  for (const i of OER_LIBRARY) {
    assert.equal(i.commercialOk, commercialOk(i.license), `${i.id} has a mismatched commercialOk`);
    assert.equal(i.shareAlike, requiresShareAlike(i.license), `${i.id} has a mismatched shareAlike`);
  }
});

test('non-commercial material can never be commercially usable, mirrored or not', () => {
  // The invariant that actually carries the legal weight. NonCommercial restricts commercial
  // USE, not hosting — so Plajah may mirror an NC textbook for free reading (see the textbook
  // policy: never sold, never in Plajah+), while attaching it to a PAID course stays closed.
  // Those two questions are separate, and only this one is about exposure.
  for (const i of OER_LIBRARY) {
    const nonCommercialLicence = i.license === 'CC-BY-NC' || i.license === 'CC-BY-NC-SA';
    assert.equal(
      i.commercialOk, !nonCommercialLicence,
      `${i.id} (${i.license}) has the wrong commercialOk flag`,
    );
  }
});

test('anything Plajah mirrors names the hosted copy it will open', () => {
  // A mirrored item with no readerBookId has nowhere to send the reader, and would silently
  // fall back to the publisher's site while claiming to be hosted.
  for (const i of OER_LIBRARY.filter(x => !x.linkOutOnly && x.format === 'textbook')) {
    assert.ok(i.readerBookId, `${i.id} is mirrored but names no hosted book`);
  }
});

test('CK-12 stays link-out and is never given a hosted copy', () => {
  // Not a licence question — CK-12's material is interactive and platform-bound, so mirroring
  // it would produce a worse artifact than the original even where it is permitted.
  for (const i of OER_LIBRARY.filter(x => x.source.startsWith('CK-12'))) {
    assert.equal(i.linkOutOnly, true, `${i.id} should be link-out only`);
    assert.equal(i.readerBookId, undefined, `${i.id} should have no hosted copy`);
  }
});

test('catalogue ids are unique and every item carries attribution', () => {
  const ids = OER_LIBRARY.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const i of OER_LIBRARY) {
    assert.ok(i.attribution.length > 10, `${i.id} has no usable attribution`);
    assert.match(i.sourceUrl, /^https:\/\//, `${i.id} has a non-https source URL`);
  }
});

test('filterLibrary(commercialOnly) never returns a non-commercial item', () => {
  const paid = filterLibrary({ commercialOnly: true });
  assert.ok(paid.length > 0);
  assert.equal(paid.every(i => i.commercialOk), true);
  assert.ok(paid.length < OER_LIBRARY.length, 'the fixture should contain some NC items to exclude');
});

// ── Seed templates ──────────────────────────────────────────────────────────────

test('every seed template material resolves to a real catalogue item', () => {
  for (const seed of TEMPLATE_SEEDS) {
    for (const id of seed.structure.materials) {
      assert.ok(libraryItemById(id), `${seed.id} references unknown material "${id}"`);
    }
  }
});

test('seed templates are well formed', () => {
  assert.equal(new Set(TEMPLATE_SEEDS.map(t => t.id)).size, TEMPLATE_SEEDS.length);
  for (const seed of TEMPLATE_SEEDS) {
    const s = seed.structure;
    assert.ok(s.title.length > 0, `${seed.id} has no title`);
    assert.ok(s.objective.length > 20, `${seed.id} has no real objective`);
    assert.ok(s.steps.length >= 3, `${seed.id} has too few steps`);
    assert.ok(s.standardsAlignment.length > 0, `${seed.id} aligns to nothing`);
    assert.ok(s.rubric.criteria.length > 0, `${seed.id} has no rubric`);
    assert.ok(s.differentiation.support.length > 0 && s.differentiation.extension.length > 0,
      `${seed.id} is missing differentiation`);
    assert.ok(s.estimatedMinutes > 0);
    for (const c of s.rubric.criteria) {
      assert.equal(c.levels.length, 4, `${seed.id} rubric "${c.name}" is not a 4-level scale`);
      assert.deepEqual(c.levels.map(l => l.points), [1, 2, 3, 4]);
    }
  }
});

test('all six subjects are covered by the seed set', () => {
  const subjects = new Set(TEMPLATE_SEEDS.map(t => t.subject));
  for (const s of ['math', 'ela', 'science', 'socialStudies', 'worldLang', 'arts']) {
    assert.ok(subjects.has(s as any), `no seed template for ${s}`);
  }
});

// ── Standards ───────────────────────────────────────────────────────────────────

test('every standard code in the seeds renders to a human label', () => {
  for (const seed of TEMPLATE_SEEDS) {
    for (const ref of seed.structure.standardsAlignment) {
      const d = describeStandard(ref);
      assert.ok(d.display.length > 0, `${ref.code} renders empty`);
      // A PISA ref that doesn't resolve to a descriptor means a malformed code.
      if (ref.framework === 'PISA') {
        assert.ok(d.detail && d.detail.length > 20, `${ref.code} has no PISA descriptor`);
      }
    }
  }
});

test('PISA descriptors exist for all three domains at all six levels', () => {
  for (const domain of ['MATH', 'READ', 'SCI'] as const) {
    for (let level = 1; level <= 6; level++) {
      const d = PISA_LEVELS[domain][level as 1 | 2 | 3 | 4 | 5 | 6];
      assert.ok(d && d.length > 20, `missing PISA ${domain} level ${level}`);
    }
  }
});

test('CCSS codes crosswalk to the right ledger framework', () => {
  assert.equal(ledgerFrameworkFor({ framework: 'CCSS', code: 'CCSS.MATH.6.RP.A.1' }), 'CCSS_MATH');
  assert.equal(ledgerFrameworkFor({ framework: 'CCSS', code: 'CCSS.ELA.RI.9-10.8' }), 'CCSS_ELA');
  assert.equal(ledgerFrameworkFor({ framework: 'NGSS', code: 'MS-PS1-4' }), 'NGSS');
  // PISA is an overlay, not a ledger framework — it must not masquerade as one.
  assert.equal(ledgerFrameworkFor({ framework: 'PISA', code: 'PISA.MATH.L4' }), null);
});

test('the PISA overlay suggestion prefers the longest matching CCSS prefix', () => {
  assert.equal(suggestPisaOverlay('CCSS.MATH.6.RP.A.1')?.code, 'PISA.MATH.L2');
  assert.equal(suggestPisaOverlay('CCSS.MATH.8.F.B.4')?.code, 'PISA.MATH.L4');
  assert.equal(suggestPisaOverlay('CCSS.ELA.RI.9-10.8')?.code, 'PISA.READ.L4');
  assert.equal(suggestPisaOverlay('CCSS.MATH.2.OA.1'), null);
});

// ── Rubric → ledger mastery ─────────────────────────────────────────────────────
// This conversion is what a graded lesson writes into the Learner Ledger, so an error here
// silently corrupts a student's longitudinal record rather than throwing anywhere visible.

const twoCriteria: Rubric = {
  criteria: [
    { name: 'A', levels: [1, 2, 3, 4].map(p => ({ label: `L${p}`, descriptor: '', points: p })) },
    { name: 'B', levels: [1, 2, 3, 4].map(p => ({ label: `L${p}`, descriptor: '', points: p })) },
  ],
};

test('a full-marks rubric is 100% mastery', () => {
  const out = scoresToMastery({ A: 4, B: 4 }, twoCriteria);
  assert.deepEqual(out, { total: 8, max: 8, masteryPercent: 100 });
});

test('mastery is the proportion of the maximum, rounded', () => {
  assert.equal(scoresToMastery({ A: 3, B: 4 }, twoCriteria).masteryPercent, 88); // 7/8 = 87.5
  assert.equal(scoresToMastery({ A: 2, B: 2 }, twoCriteria).masteryPercent, 50);
  assert.equal(scoresToMastery({ A: 1, B: 1 }, twoCriteria).masteryPercent, 25);
});

test('an unscored criterion counts as zero rather than throwing', () => {
  // The UI blocks saving until every criterion is scored; this is the safety net behind it.
  const out = scoresToMastery({ A: 4 }, twoCriteria);
  assert.equal(out.total, 4);
  assert.equal(out.max, 8);
  assert.equal(out.masteryPercent, 50);
});

test('an empty rubric does not divide by zero', () => {
  const out = scoresToMastery({}, { criteria: [] });
  assert.equal(out.max, 0);
  assert.equal(out.masteryPercent, 0);
  assert.ok(Number.isFinite(out.masteryPercent));
});

test('max is derived from each criterion\'s own top level, not assumed to be 4', () => {
  // A criterion with a non-standard scale must still contribute its real maximum, or every
  // mastery figure that includes it is inflated.
  const mixed: Rubric = {
    criteria: [
      { name: 'A', levels: [{ label: 'x', descriptor: '', points: 1 }, { label: 'y', descriptor: '', points: 2 }] },
      { name: 'B', levels: [1, 2, 3, 4].map(p => ({ label: `L${p}`, descriptor: '', points: p })) },
    ],
  };
  assert.equal(scoresToMastery({ A: 2, B: 4 }, mixed).max, 6);
  assert.equal(scoresToMastery({ A: 2, B: 4 }, mixed).masteryPercent, 100);
});

test('every seed rubric scores to a sane 0-100 range at full and minimum marks', () => {
  for (const seed of TEMPLATE_SEEDS) {
    const rubric = seed.structure.rubric;
    const top: Record<string, number> = {};
    const bottom: Record<string, number> = {};
    for (const c of rubric.criteria) {
      top[c.name] = Math.max(...c.levels.map(l => l.points));
      bottom[c.name] = Math.min(...c.levels.map(l => l.points));
    }
    assert.equal(scoresToMastery(top, rubric).masteryPercent, 100, `${seed.id} full marks is not 100%`);
    const low = scoresToMastery(bottom, rubric).masteryPercent;
    assert.ok(low > 0 && low < 100, `${seed.id} minimum marks (${low}%) should be above zero but below full`);
  }
});

// ── Deep links ──────────────────────────────────────────────────────────────────

test('a lesson link does not collide with the worksheet assignment route', () => {
  const link = lessonLink('abc123');
  assert.equal(link, '?view=lesson&id=abc123');
  // ?view=assignment belongs to StudentAssignmentView, whose `id` is a worksheetId — sending a
  // templateAssignment there would look up a worksheet that does not exist.
  assert.ok(!link.includes('view=assignment'));
});

// ── "Due first" date labelling ──────────────────────────────────────────────────
// This is the copy a student reads to decide what to do tonight. An off-by-one here
// doesn't throw — it just quietly tells someone their homework is due a day later
// than it is, which is the worst kind of bug this feature could have.

const DAY = 86_400_000;

test('the near deadlines read as urgent, in plain words', () => {
  assert.deepEqual(relativeDue(Date.now() + DAY * 0.2), { label: 'Due today', urgent: true });
  assert.deepEqual(relativeDue(Date.now() + DAY), { label: 'Due tomorrow', urgent: true });
});

test('overdue work says so, and stays urgent', () => {
  const yesterday = relativeDue(Date.now() - DAY);
  assert.equal(yesterday.label, 'Due yesterday');
  assert.equal(yesterday.urgent, true);

  const late = relativeDue(Date.now() - DAY * 4);
  assert.match(late.label, /4 days late/);
  assert.equal(late.urgent, true);
});

test('this week reads as a weekday, next week as a date', () => {
  const soon = relativeDue(Date.now() + DAY * 3);
  assert.match(soon.label, /^Due \w+day$/, `expected a weekday, got "${soon.label}"`);
  assert.equal(soon.urgent, false, 'three days out is not urgent');

  const later = relativeDue(Date.now() + DAY * 20);
  assert.match(later.label, /^Due \w{3} \d+$/, `expected a date, got "${later.label}"`);
});

test('undated work is never presented as a deadline', () => {
  assert.deepEqual(relativeDue(null), { label: 'No date set', urgent: false });
});

test('the curiosity is stable within a day and drawn from the set', () => {
  // It must not change on every render — a prompt that flickers reads as noise, not as "today's".
  assert.equal(curiosityOfTheDay(), curiosityOfTheDay());
  assert.ok(curiosityOfTheDay().length > 20);
  assert.ok(curiosityOfTheDay().includes('?'), 'a curiosity should ask something');
});
