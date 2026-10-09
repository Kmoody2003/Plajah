import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capabilitiesFor, checkDM, canDecide, applyOutcome, validateAppealInput, durationLabel, allows,
  needsSecondReviewer, appealSlaDueAt, LEVELS, MATRIX, CRIMINAL_REVIEW_DM_PER_HOUR, type SanctionsDoc,
} from '../services/enforcement/standingCore';

const NOW = 1_800_000_000_000;
const H = 3_600_000;
const act = (id: string, level: any, extra: any = {}) => ({ id, level, rule: 'r', ruleText: 'Rule text', status: 'ACTIVE', createdAt: NOW - H, expiresAt: NOW + 24 * H, ...extra });

test('empty / missing doc is GOOD with full capabilities', () => {
  for (const s of [null, undefined, {} as SanctionsDoc]) {
    const c = capabilitiesFor(s, NOW);
    assert.equal(c.level, 'GOOD');
    assert.ok(c.canPost && c.canComment && c.canGoLive && c.canUpload);
    assert.equal(c.reachMultiplier, 1);
    assert.equal(c.reasons.length, 0);
    assert.equal(c.expiresAt, null);
  }
});

test('never locked out: every level keeps sign-in, read, DM and appeal', () => {
  for (const level of LEVELS) {
    const c = capabilitiesFor({ actions: { a1: act('a1', level) as any } }, NOW);
    assert.equal(c.canSignIn, true);
    assert.equal(c.canRead, true);
    assert.equal(c.canDM.allowed, true, level);
    assert.equal(c.canAppeal, true);
    assert.equal(allows(c, 'canDM'), true);
  }
});

test('ladder is monotone: higher levels never grant more than lower ones', () => {
  const keys = ['canPost', 'canComment', 'canGoLive', 'canUpload'] as const;
  for (let i = 1; i < LEVELS.length; i++) {
    const lo = MATRIX[LEVELS[i - 1]], hi = MATRIX[LEVELS[i]];
    for (const k of keys) assert.ok(!(hi[k] && !lo[k]), `${LEVELS[i]}.${k}`);
    assert.ok(hi.reach <= lo.reach);
  }
});

test('matrix specifics', () => {
  const lr = capabilitiesFor({ actions: { a: act('a', 'LIMITED_REACH') as any } }, NOW);
  assert.ok(lr.canPost && lr.reachMultiplier < 1);
  const rp = capabilitiesFor({ actions: { a: act('a', 'RESTRICTED_PUBLIC') as any } }, NOW);
  assert.ok(!rp.canPost && !rp.canComment && !rp.canGoLive && rp.canUpload);
  const rm = capabilitiesFor({ actions: { a: act('a', 'RESTRICTED_MEDIA') as any } }, NOW);
  assert.ok(!rm.canUpload && rm.canDM.textOnly && rm.canDM.maxPerHour === null);
  const cr = capabilitiesFor({ actions: { a: act('a', 'CRIMINAL_REVIEW') as any } }, NOW);
  assert.deepEqual(cr.canDM, { allowed: true, maxPerHour: CRIMINAL_REVIEW_DM_PER_HOUR, existingThreadsOnly: true, textOnly: true, noMinors: true });
  assert.equal(cr.reachMultiplier, 0);
});

test('worst in-force action wins; expired / overturned ignored', () => {
  const s: SanctionsDoc = { actions: {
    a: act('a', 'LIMITED_REACH') as any,
    b: act('b', 'RESTRICTED_MEDIA', { expiresAt: NOW - 1 }) as any,      // expired
    c: act('c', 'CRIMINAL_REVIEW', { status: 'OVERTURNED' }) as any,       // overturned
    d: act('d', 'RESTRICTED_PUBLIC', { status: 'APPEALED' }) as any,       // appealed stays in force
  } };
  const c = capabilitiesFor(s, NOW);
  assert.equal(c.level, 'RESTRICTED_PUBLIC');
  assert.deepEqual(c.reasons.map(r => r.actionId).sort(), ['a', 'd']);
});

test('expiry: expiresAt = latest end, nextChangeAt = earliest; indefinite → null', () => {
  const s: SanctionsDoc = { actions: { a: act('a', 'LIMITED_REACH', { expiresAt: NOW + 2 * H }) as any, b: act('b', 'RESTRICTED_PUBLIC', { expiresAt: NOW + 5 * H }) as any } };
  const c = capabilitiesFor(s, NOW);
  assert.equal(c.expiresAt, NOW + 5 * H);
  assert.equal(c.nextChangeAt, NOW + 2 * H);
  assert.equal(capabilitiesFor(s, NOW + 3 * H).level, 'RESTRICTED_PUBLIC');
  assert.equal(capabilitiesFor(s, NOW + 6 * H).level, 'GOOD');
  const ind = capabilitiesFor({ actions: { a: act('a', 'LIMITED_REACH', { expiresAt: null }) as any } }, NOW);
  assert.equal(ind.expiresAt, null);
});

test('legacy suspendedUntil maps to RESTRICTED_PUBLIC until it passes', () => {
  assert.equal(capabilitiesFor({ suspendedUntil: NOW + H }, NOW).level, 'RESTRICTED_PUBLIC');
  assert.equal(capabilitiesFor({ suspendedUntil: NOW - H }, NOW).level, 'GOOD');
});

test('criminalReview from the safety pipeline → CRIMINAL_REVIEW, details withheld', () => {
  const c = capabilitiesFor({ criminalReview: { active: true, since: NOW, caseId: 'case1' } }, NOW);
  assert.equal(c.level, 'CRIMINAL_REVIEW');
  assert.equal(c.reasons[0].withheld, true);
  assert.equal(c.expiresAt, null);
  assert.equal(capabilitiesFor({ criminalReview: { active: false } }, NOW).level, 'GOOD');
});

test('csam action withholds content snapshot', () => {
  const c = capabilitiesFor({ actions: { a: act('a', 'CRIMINAL_REVIEW', { csam: true, contentRef: { kind: 'post', id: 'p1', snapshot: 'x', path: 'posts/p1' } }) as any } }, NOW);
  assert.deepEqual(c.reasons[0].contentRef, { kind: 'post', id: 'p1' });
});

test('garbage entries are ignored', () => {
  const c = capabilitiesFor({ actions: { a: { level: 'NUKE' } as any, b: null as any } }, NOW);
  assert.equal(c.level, 'GOOD');
});

test('checkDM: minors first, then new threads, media, rate', () => {
  const cr = capabilitiesFor({ criminalReview: { active: true } }, NOW);
  const base = { hasMedia: false, isExistingThread: true, recipientIsMinor: false, sentInLastHour: 0 };
  assert.deepEqual(checkDM(cr, base), { ok: true });
  assert.equal((checkDM(cr, { ...base, recipientIsMinor: true, isExistingThread: false }) as any).code, 'DM_NO_MINORS');
  assert.equal((checkDM(cr, { ...base, isExistingThread: false }) as any).code, 'DM_EXISTING_ONLY');
  assert.equal((checkDM(cr, { ...base, hasMedia: true }) as any).code, 'DM_TEXT_ONLY');
  assert.equal((checkDM(cr, { ...base, sentInLastHour: CRIMINAL_REVIEW_DM_PER_HOUR }) as any).code, 'DM_RATE');
  const good = capabilitiesFor(null, NOW);
  assert.deepEqual(checkDM(good, { hasMedia: true, isExistingThread: false, recipientIsMinor: true, sentInLastHour: 999 }), { ok: true });
});

test('second reviewer rule', () => {
  assert.equal(needsSecondReviewer('LIMITED_REACH'), false);
  assert.equal(needsSecondReviewer('RESTRICTED_PUBLIC'), true);
  assert.equal(canDecide('LIMITED_REACH', 'm1', 'm1').ok, true);
  assert.equal(canDecide('RESTRICTED_PUBLIC', 'm1', 'm1').ok, false);
  assert.equal(canDecide('RESTRICTED_PUBLIC', 'm1', 'm2').ok, true);
});

test('applyOutcome', () => {
  const a = { level: 'RESTRICTED_MEDIA' as const, expiresAt: NOW + H, csam: false };
  assert.equal(applyOutcome(a, 'overturn').status, 'OVERTURNED');
  assert.equal(applyOutcome(a, 'uphold').status, 'ACTIVE');
  const m = applyOutcome(a, 'modify', { level: 'LIMITED_REACH', expiresAt: NOW + 2 * H });
  assert.deepEqual([m.status, m.level, m.expiresAt], ['ACTIVE', 'LIMITED_REACH', NOW + 2 * H]);
  assert.equal(applyOutcome(a, 'modify', { level: 'GOOD' }).status, 'RESTORED');
  assert.equal(applyOutcome({ ...a, csam: true }, 'overturn').contentRestorable, false);
});

test('validateAppealInput', () => {
  assert.equal(validateAppealInput({}).ok, false);
  assert.equal(validateAppealInput({ actionId: 'ea_abc123', statement: '' }).ok, false);
  const v = validateAppealInput({ actionId: 'ea_abc123', statement: ' I was quoting the rule ', evidence: ['https://x.y/z', 'javascript:alert(1)', 5], correctionTaken: 'removed' });
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.statement, 'I was quoting the rule'); assert.deepEqual(v.evidence, ['https://x.y/z']); assert.equal(v.correctionTaken, 'removed'); }
  assert.equal(validateAppealInput({ actionId: '../x', statement: 'hi' }).ok, false);
});

test('labels + SLA', () => {
  assert.equal(durationLabel(null, NOW), 'until a reviewer decides');
  assert.equal(durationLabel(NOW + 3 * H, NOW), 'for about 3 more hours');
  assert.equal(durationLabel(NOW + 72 * H, NOW), 'for 3 more days');
  assert.equal(appealSlaDueAt('RESTRICTED_PUBLIC', NOW), NOW + 48 * H);
});
