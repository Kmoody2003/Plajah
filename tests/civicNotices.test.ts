import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDeliveries, deliverySummary, checkZoningHearingNotice, lawChangeNotice, followMatches, type Notice, type Subscriber } from '../services/terra/civic/notices/noticesCore';

const DAY = 86_400_000;
const HOME = { lat: 42.3314, lng: -83.0458 };
const NEAR = { lat: 42.3320, lng: -83.0460 };   // ~70 m away
const FAR = { lat: 42.40, lng: -83.20 };
const T = Date.UTC(2026, 10, 12, 15); // 15:00 UTC

const subs: Subscriber[] = [
  { userId: 'ana', jurisdictionId: 'det', follows: [{ kind: 'address', point: HOME, radiusM: 400, label: 'home' }], consent: { push: { at: 1, source: 'app' } }, language: 'es' },
  { userId: 'dee', jurisdictionId: 'det', follows: [{ kind: 'jurisdiction' }], consent: { email: { at: 1, source: 'web' } }, cadence: 'daily' },
  { userId: 'bo', jurisdictionId: 'det', follows: [{ kind: 'law', sectionId: 'mcl-125.3201' }, { kind: 'ward', ward: '6' }], consent: { push: { at: 1, source: 'app' }, sms: { at: 1, source: 'web' } }, quietHours: [14, 18] },
  { userId: 'cy', jurisdictionId: 'det', follows: [{ kind: 'case', caseId: 'case-9' }], consent: {} },
  { userId: 'zed', jurisdictionId: 'other', follows: [{ kind: 'jurisdiction' }], consent: { push: { at: 1, source: 'app' } } },
  { userId: 'mu', jurisdictionId: 'det', follows: [{ kind: 'address', point: NEAR, radiusM: 200, label: 'shop' }], consent: { push: { at: 1, source: 'app' } }, muted: ['service_disruption', 'emergency'] },
];

const closure: Notice = {
  id: 'n1', jurisdictionId: 'det', kind: 'service_disruption', title: 'Water shutoff on Vernor', body: 'Crews will shut off water 9am–1pm.', publishedAt: T,
  area: { point: NEAR, radiusM: 150, wards: ['6'] }, i18n: { es: { title: 'Corte de agua en Vernor', body: 'Cortarán el agua de 9am a 1pm.' } },
};

test('only people whose follows touch the notice get it, in their language', () => {
  const ds = planDeliveries(closure, subs, { tzOffsetMin: 0 });
  assert.deepEqual(ds.map((d) => d.userId).sort(), ['ana', 'bo']);
  const ana = ds.find((d) => d.userId === 'ana')!;
  assert.equal(ana.language, 'es');
  assert.equal(ana.title, 'Corte de agua en Vernor');
  assert.deepEqual(ana.channels, ['in_app', 'push']);
  assert.match(ana.why, /home/);
  // a citywide follower doesn't get hyper-local notices; another jurisdiction never does; muted topics stay quiet
  assert.ok(!ds.some((d) => ['dee', 'zed', 'mu'].includes(d.userId)));
});

test('quiet hours delay non-emergency push; emergencies go now to everyone in scope', () => {
  const bo = planDeliveries(closure, subs).find((d) => d.userId === 'bo')!;
  assert.equal(bo.mode, 'after_quiet_hours');
  assert.equal(new Date(bo.sendAt).getUTCHours(), 18);
  assert.ok(!bo.channels.includes('sms'), 'SMS stays off until the platform enables it');
  const storm: Notice = { ...closure, id: 'n2', kind: 'emergency', title: 'Flood warning', area: undefined, i18n: undefined };
  const ds = planDeliveries(storm, subs);
  assert.ok(ds.every((d) => d.mode === 'instant'));
  assert.ok(ds.some((d) => d.userId === 'dee'));
  assert.ok(!ds.some((d) => d.userId === 'mu'), 'muted follows only cover their own matches; mu has no citywide follow');
});

test('daily cadence digests routine notices but not your own case updates', () => {
  const program: Notice = { id: 'n3', jurisdictionId: 'det', kind: 'program_open', title: 'Home repair grants open', body: 'Apply by Dec 15.', publishedAt: T };
  const dee = planDeliveries(program, subs, { digestHour: 8 }).find((d) => d.userId === 'dee')!;
  assert.equal(dee.mode, 'digest');
  assert.equal(new Date(dee.sendAt).toISOString(), '2026-11-13T08:00:00.000Z');
  const update: Notice = { id: 'n4', jurisdictionId: 'det', kind: 'case_update', title: 'Your permit was approved', body: '…', publishedAt: T, caseIds: ['case-9'] };
  const ds = planDeliveries(update, subs);
  assert.deepEqual(ds.map((d) => d.userId), ['cy']);
  assert.deepEqual(ds[0].channels, ['in_app'], 'no consent → in-app only');
  assert.equal(deliverySummary(ds).inApp, 1);
});

test('law followers hear when a section changes', () => {
  const n = lawChangeNotice({ jurisdictionId: 'det', sectionId: 'mcl-125.3201', catchline: 'Regulation of land development', ordinance: '2027 PA 12', effectiveAt: Date.UTC(2027, 0, 1), publishedAt: T });
  const ds = planDeliveries(n, subs);
  assert.ok(ds.some((d) => d.userId === 'bo' && /MCL 125.3201/.test(d.why)));
  assert.equal(followMatches({ kind: 'law', sectionId: 'mcl-1.1' }, n), null);
  assert.ok(planDeliveries(n, subs).every((d) => d.userId !== 'ana'));
  assert.ok(FAR);
});

test('zoning hearing notice checker follows MCL 125.3103', () => {
  const hearing: Notice = {
    id: 'h', jurisdictionId: 'det', kind: 'hearing', title: 'Rezoning hearing', publishedAt: T, eventAt: T + 20 * DAY,
    body: 'The planning commission will consider the request at its public hearing. Send written comments to the clerk by Dec 1.',
    statutory: { rule: 'mi_zoning_hearing', newspaperAt: T, mailedAt: T + 7 * DAY, mailedToOwnersWithinFt: 300 },
  };
  const r = checkZoningHearingNotice(hearing);
  assert.equal(r.ok, false);
  assert.equal(r.items.find((i) => i.label.startsWith('Mailed'))!.ok, false, 'mailed only 13 days ahead');
  const fixed = checkZoningHearingNotice({ ...hearing, statutory: { ...hearing.statutory!, mailedAt: T } });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.cite, 'mcl-125.3103');
});
