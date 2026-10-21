// crmCore — Test Suite
// Run with: npm run test:crm
//
// Pins the pure CRM rules: segments, pipeline math (weighted value + stale flags), merge-field
// fallbacks, template suggestions + consent gate, de-duplication, CSV round-trips and mailing rows.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DAY_MS, segmentMatches, applySegment, pipelineSummary, isStale, mergeFields, suggestedTemplates,
  dedupeKey, dedupeKeys, parseContactsCsv, parseCsvRows, toCsv, mailingRows, mailingCsv, planImport,
  gateRecipients, followUps, birthdaySoon, contactMatchesQuery, formatCents,
} from '../services/crm/crmCore';
import type { CrmContact } from '../types';
import type { CorrespondenceTemplate, CrmPipeline, CrmPreset } from '../services/opsPresets/types';

const NOW = Date.UTC(2026, 9, 20, 15, 0, 0);

function c(p: Partial<CrmContact> & { id: string }): CrmContact {
  return { businessId: 'b1', name: 'Pat Doe', tags: [], notes: '', rewardPoints: 0, totalSpend: 0, visitCount: 0, createdAt: NOW - 30 * DAY_MS, ...p };
}

const ADDR = { line1: '1 Main St', city: 'Austin', region: 'tx', postal: '78701' };

const pipeline: CrmPipeline = {
  id: 'sales', label: 'Sales', noun: 'deal',
  stages: [
    { id: 'lead', label: 'Lead', kind: 'open', probability: 10, slaDays: 2, templateId: 't_welcome' },
    { id: 'quote', label: 'Quote', kind: 'open', probability: 50, slaDays: 5 },
    { id: 'won', label: 'Won', kind: 'won', probability: 100 },
    { id: 'lost', label: 'Lost', kind: 'lost', probability: 0 },
  ],
};

const templates: CorrespondenceTemplate[] = [
  { id: 't_welcome', label: 'Welcome', channel: 'email', purpose: 'welcome', subject: 'Hi {{first_name}}', body: 'Welcome to {{business_name}}' },
  { id: 't_quote', label: 'Quote', channel: 'email', purpose: 'quote', body: 'Quote {{deal}}', trigger: { on: 'stage_enter', stageId: 'quote' } },
  { id: 't_wb30', label: 'Miss you', channel: 'postcard', purpose: 'winback', body: 'Come back', trigger: { on: 'inactive_days', days: 30 }, promotional: true },
  { id: 't_wb90', label: 'Long time', channel: 'email', purpose: 'winback', body: 'Long time', trigger: { on: 'inactive_days', days: 90 }, promotional: true },
  { id: 't_bday', label: 'Birthday', channel: 'push', purpose: 'birthday', body: 'HBD', trigger: { on: 'birthday' } },
];
const crm: CrmPreset = { pipelines: [pipeline], fields: [], segments: [], tags: [], contactNoun: 'customer' };
const preset = { crm, correspondence: templates };

describe('segments', () => {
  test('tags are case-insensitive any-of', () => {
    assert.equal(segmentMatches(c({ id: '1', tags: ['VIP'] }), { tagsAny: ['vip', 'x'] }, NOW), true);
    assert.equal(segmentMatches(c({ id: '1', tags: ['new'] }), { tagsAny: ['vip'] }, NOW), false);
  });
  test('spend, visits, inactivity, newness, consent, address', () => {
    const k = c({ id: '1', totalSpend: 500, visitCount: 6, lastVisit: NOW - 45 * DAY_MS, marketingOptIn: true, address: ADDR });
    assert.equal(segmentMatches(k, { minSpend: 400, minVisits: 5, inactiveDays: 30, optedIn: true, hasAddress: true }, NOW), true);
    assert.equal(segmentMatches(k, { inactiveDays: 60 }, NOW), false);
    assert.equal(segmentMatches(k, { newWithinDays: 7 }, NOW), false);
    assert.equal(segmentMatches(c({ id: '2', createdAt: NOW - DAY_MS }), { newWithinDays: 7 }, NOW), true);
    assert.equal(segmentMatches(c({ id: '3' }), { optedIn: true }, NOW), false);
  });
  test('lastContactAt counts as activity for win-back', () => {
    const k = c({ id: '1', lastVisit: NOW - 100 * DAY_MS, lastContactAt: NOW - 3 * DAY_MS });
    assert.equal(segmentMatches(k, { inactiveDays: 30 }, NOW), false);
  });
  test('stage + pipeline + source; applySegment filters', () => {
    const list = [c({ id: '1', pipelineId: 'sales', stageId: 'quote', source: 'website' }), c({ id: '2', pipelineId: 'sales', stageId: 'lead' })];
    assert.deepEqual(applySegment(list, { pipelineId: 'sales', stageIn: ['quote'], sourceIn: ['website'] }, NOW).map(x => x.id), ['1']);
  });
});

describe('pipeline', () => {
  const list = [
    c({ id: 'a', pipelineId: 'sales', stageId: 'lead', dealValueCents: 10_000, stageEnteredAt: NOW - 3 * DAY_MS }),
    c({ id: 'b', pipelineId: 'sales', stageId: 'quote', dealValueCents: 20_000, stageEnteredAt: NOW - DAY_MS }),
    c({ id: 'c', pipelineId: 'sales', stageId: 'won', dealValueCents: 50_000, stageEnteredAt: NOW - 90 * DAY_MS }),
    c({ id: 'd', pipelineId: 'sales', stageId: 'lost', dealValueCents: 7_000 }),
    c({ id: 'e', pipelineId: 'sales', stageId: 'gone', dealValueCents: 1_000, stageEnteredAt: NOW }),
    c({ id: 'f', dealValueCents: 99_999 }),
  ];
  const s = pipelineSummary(list, pipeline, NOW);
  test('counts, values and weighted values', () => {
    assert.equal(s.count, 5);
    assert.equal(s.openCount, 3);
    assert.equal(s.openValueCents, 31_000);
    assert.equal(s.weightedCents, 1_000 + 100 + 10_000);
    assert.equal(s.wonValueCents, 50_000);
    assert.equal(s.lostCount, 1);
    assert.equal(s.stages[0].count, 2, 'unknown stage falls into the first stage');
  });
  test('stale only on open stages past SLA', () => {
    assert.equal(s.staleCount, 1);
    assert.equal(s.stages[0].staleCount, 1);
    assert.equal(isStale(list[2], pipeline.stages[2], NOW), false);
  });
});

describe('merge fields', () => {
  test('fills known fields and falls back safely', () => {
    const r = mergeFields({ subject: 'Hi {{first_name}}', body: '{{name}} at {{ business_name }}: {{deal}} {{custom.car}} {{unknown}}|' },
      { contact: { name: 'Jo Smith', dealValueCents: 123_456, custom: { car: 'Civic' } }, business: { name: 'Acme' } });
    assert.equal(r.subject, 'Hi Jo');
    assert.equal(r.body, 'Jo Smith at Acme: $1,234.56 Civic |');
  });
  test('first_name falls back to "there", business to "our team"', () => {
    const r = mergeFields({ subject: '', body: 'Hi {{first_name}}, from {{business_name}} — {{sender_name}}' }, {});
    assert.equal(r.body, 'Hi there, from our team — The team');
  });
  test('stage label via pipeline, explicit firstName wins', () => {
    const r = mergeFields({ body: '{{first_name}} / {{stage}}' }, { contact: { name: 'Robert Lee', firstName: 'Bob', stageId: 'quote' }, pipeline });
    assert.equal(r.body, 'Bob / Quote');
  });
});

describe('suggestions + consent gate', () => {
  test('stage_enter: stage template first, then triggered ones; reach-filtered', () => {
    const k = c({ id: '1', email: 'a@b.co' });
    assert.deepEqual(suggestedTemplates(k, preset, { on: 'stage_enter', stageId: 'lead' }).map(t => t.id), ['t_welcome']);
    assert.deepEqual(suggestedTemplates(k, preset, { on: 'stage_enter', stageId: 'quote' }).map(t => t.id), ['t_quote']);
    assert.deepEqual(suggestedTemplates(c({ id: '2' }), preset, { on: 'stage_enter', stageId: 'quote' }), []);
  });
  test('inactive_days: promotional templates need opt-in; longest threshold first', () => {
    const k = c({ id: '1', email: 'a@b.co', address: ADDR, marketingOptIn: true });
    assert.deepEqual(suggestedTemplates(k, preset, { on: 'inactive_days', days: 120 }).map(t => t.id), ['t_wb90', 't_wb30']);
    assert.deepEqual(suggestedTemplates({ ...k, marketingOptIn: false }, preset, { on: 'inactive_days', days: 120 }), []);
  });
  test('birthday needs an app account for push', () => {
    assert.equal(suggestedTemplates(c({ id: '1', userId: 'u1' }), preset, { on: 'birthday' }).length, 1);
    assert.equal(suggestedTemplates(c({ id: '1' }), preset, { on: 'birthday' }).length, 0);
  });
  test('gateRecipients splits consent from reach', () => {
    const g = gateRecipients([
      c({ id: '1', address: ADDR, marketingOptIn: true }),
      c({ id: '2', address: ADDR }),
      c({ id: '3', marketingOptIn: true }),
      c({ id: '4', address: ADDR, marketingOptIn: true, mailOptOut: true }),
    ], { channel: 'postcard', promotional: true });
    assert.deepEqual([g.ok.map(x => x.id), g.noConsent.map(x => x.id), g.unreachable.map(x => x.id)], [['1'], ['2'], ['3', '4']]);
  });
});

describe('follow-ups + birthdays', () => {
  test('birthdaySoon handles MM-DD and YYYY-MM-DD windows', () => {
    const now = new Date(2026, 9, 20, 12).getTime();
    assert.equal(birthdaySoon('10-20', now), true);
    assert.equal(birthdaySoon('1990-10-25', now, 6), true);
    assert.equal(birthdaySoon('1990-10-27', now, 6), false);
    assert.equal(birthdaySoon(undefined, now), false);
  });
  test('overdue ranks before stale', () => {
    const list = [
      c({ id: 's', pipelineId: 'sales', stageId: 'lead', stageEnteredAt: NOW - 10 * DAY_MS }),
      c({ id: 'o', nextActionAt: NOW - 3 * DAY_MS, nextAction: 'Call back' }),
    ];
    const f = followUps(list, crm, NOW);
    assert.deepEqual(f.map(x => [x.contact.id, x.reason]), [['o', 'overdue'], ['s', 'stale']]);
  });
});

describe('dedupe + import plan', () => {
  test('keys: email lowercased, then phone digits (US 1-prefix stripped)', () => {
    assert.equal(dedupeKey({ email: ' Pat@X.com ' }), 'e:pat@x.com');
    assert.equal(dedupeKey({ phone: '+1 (512) 555-0100' }), 'p:5125550100');
    assert.deepEqual(dedupeKeys({ email: 'a@b.co', phone: '512-555-0100' }), ['e:a@b.co', 'p:5125550100']);
    assert.equal(dedupeKey({ name: 'Only name' }), null);
  });
  test('planImport fills blanks on matches, never overwrites, collapses in-file dupes', () => {
    const existing = [c({ id: 'x', email: 'pat@x.com', phone: '', tags: ['vip'], company: 'Old Co' })];
    const plan = planImport(existing, [
      { name: 'Pat', email: 'PAT@x.com', phone: '5125550100', company: 'New Co', tags: ['import'] },
      { name: 'Sam', phone: '512 555 0199' },
      { name: 'Sam Dup', phone: '(512) 555-0199', email: 'sam@y.com' },
      { name: 'No key' },
    ]);
    assert.equal(plan.updates.length, 1);
    assert.deepEqual(plan.updates[0].patch, { phone: '5125550100', tags: ['vip', 'import'] });
    assert.equal(plan.creates.length, 2);
    assert.equal(plan.duplicatesInFile, 1);
    assert.equal(plan.creates[0].email, 'sam@y.com', 'in-file dupe filled the blank email');
  });
});

describe('csv', () => {
  test('parser handles quotes, commas, newlines and CRLF', () => {
    const rows = parseCsvRows('a,b\r\n"x, y","he said ""hi""\nthen left"\r\n\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"\nthen left']]);
  });
  test('parseContactsCsv maps header aliases and builds addresses', () => {
    const r = parseContactsCsv('First Name,Last Name,E-mail,Mobile,Tags,Street Address,City,State,Zip Code,Accepts Marketing\nJo,Smith,jo@x.com,555-0100,"vip; regular",1 Main,Austin,TX,78701,yes\n,,,,,,,,,\n');
    assert.equal(r.rows.length, 1);
    const [jo] = r.rows;
    assert.equal(jo.name, 'Jo Smith');
    assert.deepEqual(jo.tags, ['vip', 'regular']);
    assert.deepEqual(jo.address, { line1: '1 Main', city: 'Austin', region: 'TX', postal: '78701' });
    assert.equal(jo.marketingOptIn, true);
    assert.equal(jo.source, 'import');
  });
  test('rows without name/email/phone are reported', () => {
    const r = parseContactsCsv('name,notes\n,just a note\n');
    assert.equal(r.rows.length, 0);
    assert.match(r.errors[0], /Row 2/);
  });
  test('toCsv round-trips through the parser', () => {
    const k = c({ id: '1', name: 'Jo "JJ" Smith', email: 'jo@x.com', tags: ['a', 'b'], notes: 'line1\nline2, more', address: ADDR, marketingOptIn: true });
    const back = parseContactsCsv(toCsv([k])).rows[0];
    assert.equal(back.name, 'Jo "JJ" Smith');
    assert.equal(back.notes, 'line1\nline2, more');
    assert.deepEqual(back.tags, ['a', 'b']);
    assert.equal(back.address?.postal, '78701');
    assert.equal(back.marketingOptIn, true);
  });
});

describe('mailing rows', () => {
  test('skips opt-outs and incomplete addresses; collapses exact duplicates; uppercases state', () => {
    const rows = mailingRows([
      c({ id: '1', name: 'A', address: ADDR }),
      c({ id: '2', name: 'A', address: ADDR }),
      c({ id: '3', name: 'B', address: ADDR, mailOptOut: true }),
      c({ id: '4', name: 'C', address: { line1: '2 Elm', city: 'Austin' } }),
    ]);
    assert.deepEqual(rows.map(r => r.contactId), ['1']);
    assert.equal(rows[0].state, 'TX');
    assert.equal(mailingCsv(rows).split('\r\n')[1], 'A,1 Main St,,Austin,TX,78701');
  });
});

describe('misc', () => {
  test('search matches name, tags and phone digits', () => {
    const k = c({ id: '1', name: 'Jo Smith', tags: ['VIP'], phone: '(512) 555-0100' });
    assert.equal(contactMatchesQuery(k, 'smi'), true);
    assert.equal(contactMatchesQuery(k, 'vip'), true);
    assert.equal(contactMatchesQuery(k, '555-01'), true);
    assert.equal(contactMatchesQuery(k, 'zzz'), false);
  });
  test('formatCents', () => {
    assert.equal(formatCents(123_456), '$1,234.56');
    assert.equal(formatCents(500_000), '$5,000');
    assert.equal(formatCents(2_500_000, { compact: true }), '$25k');
  });
});
