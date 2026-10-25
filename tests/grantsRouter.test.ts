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
async function withRouter(run: (base: string, db: Map<string, any>, calls: { model: string[] }) => Promise<void>) {
  const db = new Map<string, any>([
    ['organizations/o1', { ...org, creatorId: 'owner', admins: ['admin1'] }],
    ['organizations/o2', { name: 'Other', creatorId: 'someone' }],
  ]);
  const calls = { model: [] as string[] };
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
    const d: any = await (await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'need', facts: ['We fed 450 families.'] })).json();
    assert.equal(d.placeholders.length, 1);
    await post(base, '/api/grants/orgs/o1/council', { opportunityId: '1', draft: 'We fed 450 families.' });
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
    assert.equal((await post(base, '/api/grants/orgs/o1/draft', { opportunityId: '1', section: 'bogus' })).status, 400);
  });
});
