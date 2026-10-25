import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOpp, filterAndScore, requiredCert, holds, isOpen, parseNaicsList, searchContracts, pullState, BUSINESS_TYPES, type ContractOpp,
} from '../services/dataCommons/contracts';
import { recommendFinancing, PROGRAMS } from '../services/dataCommons/financing';
import { buildContractReadiness } from '../services/grants/readiness';
import { buildProfile, validateValue } from '../services/grants/profile';
import { clearDataCommonsCache } from '../services/dataCommons/core';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createDataCommonsRouter } from '../routes/dataCommons';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const raw = (o: Record<string, unknown>) => ({
  noticeId: 'n1', title: 'Catering for training events', fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.ARMY CONTRACTING', type: 'Solicitation',
  typeOfSetAside: 'SBA', typeOfSetAsideDescription: 'Total Small Business Set-Aside', responseDeadLine: day(10), naicsCode: '722320',
  placeOfPerformance: { city: { name: 'Detroit' }, state: { code: 'MI' } }, uiLink: 'https://sam.gov/opp/n1/view', ...o,
});
const opp = (o: Record<string, unknown> = {}) => normalizeOpp(raw(o))!;

test('a SAM.gov record normalizes: agency, place, deadline, safe link', () => {
  const o = opp();
  assert.equal(o.agency, 'DEPT OF DEFENSE · DEPT OF THE ARMY');
  assert.equal(o.place, 'Detroit, MI');
  assert.equal(o.naics, '722320');
  assert.equal(o.link, 'https://sam.gov/opp/n1/view');
  // A link that does not point at sam.gov is replaced, never followed.
  assert.equal(opp({ uiLink: 'https://evil.example/x' }).link, 'https://sam.gov/opp/n1/view');
  assert.equal(normalizeOpp({ title: 'no id' }), null);
});

test('set-aside codes map to the certification they require', () => {
  assert.equal(requiredCert('SBA'), 'small');
  assert.equal(requiredCert('WOSBSS'), 'wosb');
  assert.equal(requiredCert('HZC'), 'hubzone');
  assert.equal(requiredCert('SDVOSBC'), 'sdvosb');
  assert.equal(requiredCert('VSA'), 'vosb');
  assert.equal(requiredCert(''), null);
  assert.equal(requiredCert('LAS'), null);
  assert.equal(requiredCert('NEWCODE'), 'unknown');
});

test('certifications nest the right way round', () => {
  assert.ok(holds(['sdvosb'], 'vosb'));
  assert.ok(holds(['edwosb'], 'wosb'));
  assert.ok(!holds(['wosb'], 'edwosb'));
  assert.ok(!holds(['vosb'], 'sdvosb'));
  assert.ok(!holds(['small'], 'hubzone'));
});

test('open means a response type that has not closed', () => {
  assert.ok(isOpen(opp(), NOW));
  assert.ok(!isOpen(opp({ responseDeadLine: day(-1) }), NOW));
  assert.ok(!isOpen(opp({ type: 'Award Notice' }), NOW));
  assert.ok(isOpen(opp({ type: 'Sources Sought', responseDeadLine: undefined }), NOW));
});

test('filtering: NAICS match, hidden ineligible are counted, early notices are boosted', () => {
  const all: ContractOpp[] = [
    opp({ noticeId: 'a' }),
    opp({ noticeId: 'b', title: 'Janitorial services', typeOfSetAside: 'WOSB', naicsCode: '561720' }),
    opp({ noticeId: 'c', title: 'Meal prep sources sought', type: 'Sources Sought', typeOfSetAside: '', typeOfSetAsideDescription: '', naicsCode: '722310' }),
    opp({ noticeId: 'd', title: 'Paving', naicsCode: '237310' }),
    opp({ noticeId: 'e', title: 'Old award', type: 'Award Notice' }),
  ];
  const r = filterAndScore(all, { naics: ['722'], certs: ['small'] }, NOW);
  assert.deepEqual(r.opps.map(o => o.noticeId).sort(), ['a', 'c']);       // only the type of work asked for
  assert.equal(r.hiddenIneligible, 0);
  const withWosbOpp = filterAndScore(all, { naics: ['561'], certs: ['small'] }, NOW);
  assert.equal(withWosbOpp.opps.length, 0);
  assert.equal(withWosbOpp.hiddenIneligible, 1);                            // reserved for WOSB; we say so
  const holdsWosb = filterAndScore(all, { naics: ['561'], certs: ['small', 'wosb'] }, NOW);
  assert.equal(holdsWosb.opps[0].noticeId, 'b');
  assert.equal(holdsWosb.opps[0].competition, 'reserved');
  assert.ok(holdsWosb.opps[0].reasons.some(x => /you qualify/.test(x)));
  const open = r.opps.find(o => o.noticeId === 'c')!;
  assert.equal(open.competition, 'open');
  assert.ok(open.reasons.some(x => /Early notice/.test(x)));
  const shown = filterAndScore(all, { naics: ['561'], certs: ['small'], includeIneligible: true }, NOW);
  assert.equal(shown.opps.length, 1);
});

test('keywords alone can drive a search, and a near deadline is flagged', () => {
  const r = filterAndScore([opp({ responseDeadLine: day(2) })], { keywords: ['catering'] }, NOW);
  assert.equal(r.opps.length, 1);
  assert.ok(r.opps[0].reasons.some(x => /Closes in 2 days/.test(x)));
});

test('search: no key reports unconfigured; bad state is refused before any request', async () => {
  const none = await searchContracts('MI', { naics: ['722'] }, { apiKey: undefined });
  assert.equal(none.status, 'unconfigured');
  assert.match(none.message!, /being set up/);
  const bad = await searchContracts('Michigan', {}, { apiKey: 'k' });
  assert.equal(bad.status, 'unavailable');
});

test('search: one upstream pull per state, cached; the key never appears in results', async () => {
  clearDataCommonsCache();
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: any) => {
    urls.push(String(u));
    return new Response(JSON.stringify({ totalRecords: 2, opportunitiesData: [raw({}), raw({ noticeId: 'n2', title: 'Other' })] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const a = await searchContracts('MI', { naics: ['722'] }, { apiKey: 'SECRETKEY123' });
    const b = await searchContracts('MI', { keywords: ['other'] }, { apiKey: 'SECRETKEY123' });
    assert.equal(a.status, 'ok'); assert.equal(b.status, 'ok');
    assert.equal(urls.length, 1, 'second search must reuse the cached state pull');
    assert.match(urls[0], /state=MI/);
    assert.match(urls[0], /limit=1000/);
    assert.ok(!JSON.stringify(a).includes('SECRETKEY123') && !JSON.stringify(b).includes('SECRETKEY123'));
    assert.equal(a.pulled, 2);
  } finally { globalThis.fetch = realFetch; clearDataCommonsCache(); }
});

test('search: SAM.gov rate limiting and outages are reported honestly', async () => {
  const realFetch = globalThis.fetch;
  try {
    clearDataCommonsCache();
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    assert.equal((await searchContracts('MI', {}, { apiKey: 'k' })).status, 'rate-limited');
    clearDataCommonsCache();
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    assert.equal((await searchContracts('MI', {}, { apiKey: 'k' })).status, 'unavailable');
  } finally { globalThis.fetch = realFetch; clearDataCommonsCache(); }
  assert.ok(typeof pullState === 'function');
});

test('NAICS lists parse and business types carry codes', () => {
  assert.deepEqual(parseNaicsList('722320, 722330; abc 11'), ['722320', '722330', '11']);
  assert.deepEqual(parseNaicsList('1234567'), []);
  assert.ok(BUSINESS_TYPES.every(t => t.naics.length > 0));
});

test('financing: the right program leads for each need, with reasons', () => {
  const lead = (purpose: any, amount?: number) => recommendFinancing({ purpose, amount })[0];
  assert.equal(lead('equipment', 400_000).program.id, '504');
  assert.equal(lead('working-capital', 200_000).program.id, '7a');
  assert.equal(lead('startup', 30_000).program.id, 'microloan');
  const wc = recommendFinancing({ purpose: 'working-capital', amount: 200_000 });
  assert.equal(wc.find(r => r.program.id === '504')!.fit, 'poor');           // 504 cannot fund working capital
  assert.match(wc.find(r => r.program.id === '504')!.why, /cannot be used for working capital/);
  assert.equal(wc.find(r => r.program.id === 'microloan')!.fit, 'poor');     // above the $50,000 cap
  assert.ok(!recommendFinancing({ purpose: 'startup' }).some(r => r.program.id === 'disaster'));
  assert.equal(recommendFinancing({ purpose: 'startup', disaster: true }).find(r => r.program.id === 'disaster')!.fit, 'strong');
  const big = recommendFinancing({ purpose: 'real-estate', amount: 9_000_000 });
  assert.equal(big.length, 1);
  assert.equal(big[0].fit, 'poor');
  assert.ok(PROGRAMS.every(p => p.links.every(l => l.url.startsWith('https://'))));
});

test('contract readiness: SAM blocks, NAICS and certifications are validated and asked for', () => {
  const org = { name: 'Riverside Catering LLC', ein: '38-7654321', orgType: 'RESTAURANT', location: { address: '4200 Cass Ave, Detroit, MI 48201' } };
  const r = buildContractReadiness(buildProfile(org, {}, {}));
  assert.ok(r.blockingMissing >= 3);
  assert.ok(r.gaps.find(g => g.key === 'naics')!.status === 'missing');
  assert.ok(r.documents.some(d => d.id === 'capability' && d.weCanDraft));
  assert.equal(validateValue('naics', '722320, 722330').ok, true);
  assert.equal(validateValue('naics', 'catering').ok, false);
  assert.deepEqual(validateValue('certifications', 'WOSB, hubzone'), { ok: true, value: 'wosb, hubzone' });
  assert.equal(validateValue('certifications', 'minority').ok, false);
  const expired = buildContractReadiness(buildProfile(org, { samStatus: { value: 'expired', at: 1 } }, {}));
  assert.ok(expired.warnings.some(w => /not active/.test(w)));
});

test('financing route validates input and returns ranked programs with the disclaimer', async () => {
  const app = express(); app.use(createDataCommonsRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/api/data/financing?purpose=lottery`)).status, 400);
    assert.equal((await fetch(`${base}/api/data/financing?purpose=equipment&amount=-5`)).status, 400);
    const ok: any = await (await fetch(`${base}/api/data/financing?purpose=equipment&amount=400000`)).json();
    assert.equal(ok.recommendations[0].program.id, '504');
    assert.match(ok.disclaimer, /not a credit decision/);
    assert.ok(ok.help.length >= 2);
    const opts: any = await (await fetch(`${base}/api/data/contracts/options`)).json();
    assert.ok(opts.businessTypes.length > 5 && opts.certifications.some((c: any) => c.key === 'hubzone'));
  } finally { server.close(); }
});
