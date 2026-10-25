import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createGrantsRouter } from '../routes/grants';

const org = {
  name: 'Grace Chapel', legalName: 'Grace Chapel of Detroit Inc.', ein: '38-1234567', orgType: 'CHURCH',
  tagline: 'A neighborhood church feeding and mentoring families.',
  location: { address: '1600 W Lafayette Blvd, Detroit, MI 48216', phone: '313-555-0100', email: 'office@grace.example', website: 'https://grace.example' },
};

/** Run a request flow against the real router with fakes for auth, storage, geocoder, Grants.gov and the model. */
async function withRouter(run: (base: string, db: Map<string, any>, calls: { model: string[]; contracts: { state: string; filter: any }[] }) => Promise<void>) {
  const db = new Map<string, any>([
    ['organizations/o1', { ...org, creatorId: 'owner', admins: ['admin1'] }],
    ['organizations/o2', { name: 'Other', creatorId: 'someone' }],
  ]);
  const calls = { model: [] as string[], contracts: [] as { state: string; filter: any }[] };
  const app = express();
  app.use(createGrantsRouter({
    verify: async t => (t === 'owner-token' ? 'owner' : t === 'stranger-token' ? 'stranger' : null),
    get: async p => db.get(p) ?? null,
    set: async (p, d) => { db.set(p, d); return true; },
    geocode: async () => ({
      matchedAddress: '1600 W LAFAYETTE BLVD, DETROIT, MI, 48216', lat: 42.3, lng: -83,
      geography: { stateAbbr: 'MI', county: 'Wayne County', congressionalDistrict: 'MI-013', place: 'Detroit city' },
    }),
    opportunity: async id => id === '1'
      ? { id: '1', number: 'N-1', title: 'Community Food Grant', agency: 'USDA', summary: 'Feeds people.', eligibilityText: 'Nonprofits with 501(c)(3) status', closeDate: '2027-01-15', costSharing: false, link: 'x' }
      : null,
    contracts: async (state, filter) => { calls.contracts.push({ state, filter }); return { status: 'ok', opportunities: [], hiddenIneligible: 2, pulled: 40, state, source: { agency: 'x', dataset: 'x', url: 'https://sam.gov', retrievedAt: 1, license: 'x' } }; },
    model: async (system, user) => {
      calls.model.push(`${system}\n${user}`);
      if (/chairing/.test(system)) return JSON.stringify({ readiness: 'revise', headline: 'h', topFixes: [], limits: '' });
      if (/Reply with ONLY JSON/.test(system)) return JSON.stringify({ score: 3, verdict: 'v', strengths: [], concerns: [], fixes: ['f'] });
      return 'Draft [NEEDS YOUR FACT: x]';
    },
  }));
  const server = app.listen(0);
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, db, calls); } finally { server.close(); }
}
const authed = { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' };
const post = (base: string, path: string, body: unknown, method = 'POST') => fetch(`${base}${path}`, { method, headers: authed, body: JSON.stringify(body) });

test('router: requires sign-in and org leadership; strangers and other orgs are refused', async () => {
  await withRouter(async base => {
    assert.equal((await fetch(`${base}/api/grants/orgs/o1/workspace`)).status, 401);
    assert.equal((await fetch(`${base}/api/grants/orgs/o1/workspace`, { headers: { Authorization: 'Bearer stranger-token' } })).status, 403);
    assert.equal((await fetch(`${base}/api/grants/orgs/o2/workspace`, { headers: authed })).status, 403);
    assert.equal((await fetch(`${base}/api/grants/orgs/nope/workspace`, { headers: authed })).status, 404);
    assert.equal((await fetch(`${base}/api/grants/orgs/a.b/workspace`, { headers: authed })).status, 400);
    assert.equal((await fetch(`${base}/api/grants/orgs/o1/workspace`, { headers: authed })).status, 200);
  });
});

test('router: workspace prefills from the org, and saved answers never land on the org document', async () => {
  await withRouter(async (base, db) => {
    const w: any = await (await fetch(`${base}/api/grants/orgs/o1/workspace`, { headers: authed })).json();
    assert.equal(w.kind, 'church');
    assert.equal(w.profile.congressionalDistrict.value, 'MI-013');
    assert.equal((await post(base, '/api/grants/orgs/o1/profile', { key: 'ein', value: '12' }, 'PUT')).status, 422);
    assert.equal((await post(base, '/api/grants/orgs/o1/profile', { key: 'nonsense', value: 'x' }, 'PUT')).status, 400);
    const ok: any = await (await post(base, '/api/grants/orgs/o1/profile', { key: 'annualBudget', value: '$300k' }, 'PUT')).json();
    assert.equal(ok.profile.annualBudget.value, '300000');
    assert.equal(ok.profile.annualBudget.confirmed, true);
    assert.equal(db.get('grantWorkspaces/o1').profile.annualBudget.value, '300000');
    assert.equal(db.get('organizations/o1').annualBudget, undefined);
  });
});

test("router: readiness returns Aria's next question, the SF-424 sheet and the notice", async () => {
  await withRouter(async base => {
    const r: any = await (await post(base, '/api/grants/orgs/o1/readiness', { opportunityId: '1' })).json();
    assert.equal(r.notice.title, 'Community Food Grant');
    assert.ok(r.report.gaps.some((g: any) => g.key === 'determinationLetter'), 'the notice mentions 501(c)(3)');
    assert.ok(r.next && typeof r.next.text === 'string');
    assert.equal(r.sf424.find((x: any) => x.item === '8a').value, 'Grace Chapel of Detroit Inc.');
    assert.equal((await post(base, '/api/grants/orgs/o1/readiness', { opportunityId: '999' })).status, 404);
    assert.equal((await post(base, '/api/grants/orgs/o1/readiness', { opportunityId: 'abc' })).status, 404);
  });
});

test('router: the model never sees EIN, UEI or personal contacts', async () => {
  await withRouter(async (base, _db, calls) => {
    await post(base, '/api/grants/orgs/o1/profile', { key: 'repEmail', value: 'boss@secret.example' }, 'PUT');
    const d: any = await (await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'need', facts: ['We fed 450 families.'], cloudConsent: true })).json();
    assert.equal(d.placeholders.length, 1);
    await post(base, '/api/grants/orgs/o1/council', { opportunityId: '1', draft: 'We fed 450 families.', cloudConsent: true });
    const sent = calls.model.join('\n');
    assert.ok(sent.length > 0);
    assert.ok(!sent.includes('38-1234567'), 'EIN leaked');
    assert.ok(!sent.includes('boss@secret.example'), 'rep email leaked');
    assert.ok(!sent.includes('office@grace.example'), 'contact email leaked');
    assert.ok(sent.includes('We fed 450 families.'));
  });
});

test('router: application state saves and comes back; unknown section is refused', async () => {
  await withRouter(async base => {
    const put = await post(base, '/api/grants/orgs/o1/applications/1', { notes: 'call USDA', docs: { irs: true }, facts: ['We fed 450 families.'], sections: { need: 'Text', bogus: 'ignored' } }, 'PUT');
    assert.equal(put.status, 200);
    const w: any = await (await fetch(`${base}/api/grants/orgs/o1/workspace`, { headers: authed })).json();
    assert.equal(w.applications['1'].notes, 'call USDA');
    assert.deepEqual(Object.keys(w.applications['1'].sections), ['need']);
    assert.equal((await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'bogus', cloudConsent: true })).status, 400);
  });
});

test('router: contracts search falls back to what the business already told us, and returns readiness', async () => {
  await withRouter(async (base, _db, calls) => {
    await post(base, '/api/grants/orgs/o1/profile', { key: 'naics', value: '722320, 722330' }, 'PUT');
    await post(base, '/api/grants/orgs/o1/profile', { key: 'certifications', value: 'small, wosb' }, 'PUT');
    const r: any = await (await post(base, '/api/grants/orgs/o1/contracts', {})).json();
    assert.equal(r.status, 'ok');
    assert.equal(r.hiddenIneligible, 2);
    assert.deepEqual(calls.contracts[0].filter.naics, ['722320', '722330']);
    assert.deepEqual(calls.contracts[0].filter.certs, ['small', 'wosb']);
    assert.equal(calls.contracts[0].state, 'MI');                  // from the profile address
    assert.ok(r.report.gaps.some((g: any) => g.key === 'uei'));
    assert.ok(r.next && r.next.text);
    // Explicit request values win, junk is dropped.
    await post(base, '/api/grants/orgs/o1/contracts', { naics: ['561720', 'abc'], certs: ['hubzone', 'minority'], keywords: ['janitorial'], state: 'oh' });
    assert.deepEqual(calls.contracts[1].filter.naics, ['561720']);
    assert.deepEqual(calls.contracts[1].filter.certs, ['hubzone']);
    assert.equal(calls.contracts[1].state, 'OH');
    assert.equal((await fetch(`${base}/api/grants/orgs/o1/contracts`, { method: 'POST' })).status, 401);
  });
});

test('router: cloud model runs need explicit consent; ai-info describes the lane', async () => {
  await withRouter(async (base, _db, calls) => {
    const before = calls.model.length;
    const d = await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'need' });
    assert.equal(d.status, 428);
    assert.equal(((await d.json()) as any).code, 'CLOUD_CONSENT_REQUIRED');
    assert.equal((await post(base, '/api/grants/orgs/o1/council', { opportunityId: '1', draft: 'x' })).status, 428);
    assert.equal(calls.model.length, before, 'nothing reaches a model without consent');
    const ok: any = await (await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'need', cloudConsent: true })).json();
    assert.ok(ok.usage && typeof ok.usage.seconds === 'number');
    const info: any = await (await fetch(`${base}/api/grants/ai-info`)).json();
    assert.equal(info.provider, 'Google Gemini');
    assert.ok(info.price && info.price.in > 0);
    assert.match(info.sent, /never your EIN/);
  });
});
