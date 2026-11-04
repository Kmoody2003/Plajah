// routes/crew.ts over HTTP with fake auth + store: who may manage the crew, what Front Desk may say,
// and that HQ is platform-admin only.
//   npx tsx --test tests/crewRoutes.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createCrewRouter, type CrewDeps } from '../routes/crew';

type Doc = Record<string, any>;
const NOW = Date.UTC(2026, 10, 4, 15);

function world(model: CrewDeps['model'] = null) {
  const docs = new Map<string, Doc>([
    ['organizations/gf', {
      name: 'Great Faith', creatorId: 'owner', admins: ['admin'], staffUids: ['staff'], orgType: 'CHURCH', about: 'A family church.',
      location: { phone: '(937) 555-0142' }, hours: { sunday: { open: '9:00 AM', close: '1:00 PM' } },
      ministries: [{ id: 'f', name: 'Finance', kind: 'DEPARTMENT', description: 'Budget 480,000' }],
    }],
    ['organizations/priv', { name: 'Private', creatorId: 'owner', isPrivate: true }],
    ['security_findings/a', { status: 'open', severity: 'high' }],
    ['users/u1', { createdAt: NOW - 3600_000 }],
  ]);
  const deps: CrewDeps = {
    callerUid: async req => { const h = req.headers.authorization; return h ? h.slice(7) : null; },
    isAdmin: async req => req.headers.authorization === 'Bearer kenne',
    now: () => NOW,
    model,
    store: {
      get: async p => docs.get(p) || null,
      patch: async (p, d) => { docs.set(p, { ...(docs.get(p) || {}), ...d }); return true; },
      query: async (c, filters) => [...docs.entries()].filter(([k, v]) => k.startsWith(c + '/') && filters.every(f => f.op ? true : v[f.field] === f.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    },
  };
  return { deps, docs };
}

async function call(deps: CrewDeps, method: string, path: string, uid: string | null, body?: Doc) {
  const app = express();
  app.use('/api/crew', express.json(), createCrewRouter(deps));
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/crew/${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() as Doc };
  } finally { server.close(); }
}

test('only the owner and admins manage the crew', async () => {
  const { deps } = world();
  assert.equal((await call(deps, 'GET', 'org/gf', 'owner')).status, 200);
  assert.equal((await call(deps, 'GET', 'org/gf', 'admin')).status, 200);
  assert.equal((await call(deps, 'GET', 'org/gf', 'staff')).status, 403);
  assert.equal((await call(deps, 'GET', 'org/gf', null)).status, 401);
  assert.equal((await call(deps, 'GET', 'org/a.b', 'owner')).status, 400);
});

test('planned crew cannot be hired; Front Desk can', async () => {
  const { deps } = world();
  assert.equal((await call(deps, 'PUT', 'org/gf/hire', 'owner', { crewId: 'follow_up', on: true })).status, 400);
  assert.equal((await call(deps, 'PUT', 'org/gf/hire', 'owner', { crewId: 'growth_analyst', on: true })).status, 400);
  const r = await call(deps, 'PUT', 'org/gf/hire', 'owner', { crewId: 'front_desk', on: true });
  assert.equal(r.status, 200);
  assert.ok(r.body.offered.find((c: Doc) => c.id === 'front_desk').hired);
});

test('Front Desk is off until hired, and never on a private org', async () => {
  const { deps } = world();
  assert.equal((await call(deps, 'GET', 'desk/gf', null)).body.on, false);
  assert.equal((await call(deps, 'POST', 'desk/gf/ask', null, { question: 'When are you open?' })).status, 404);
  await call(deps, 'PUT', 'org/priv/hire', 'owner', { crewId: 'front_desk', on: true });
  assert.equal((await call(deps, 'GET', 'desk/priv', null)).body.on, false);
});

test('Front Desk answers from facts, logs what it could not answer, never leaks finance', async () => {
  const { deps, docs } = world();
  await call(deps, 'PUT', 'org/gf/hire', 'owner', { crewId: 'front_desk', on: true });
  await call(deps, 'PUT', 'org/gf/faq', 'owner', { faq: [{ q: 'Is there parking?', a: 'Yes, a free lot behind the building.' }] });
  const hours = await call(deps, 'POST', 'desk/gf/ask', null, { question: 'What time are you open Sunday?' });
  assert.equal(hours.status, 200);
  assert.ok(hours.body.answer.includes('9:00 AM') && hours.body.from.includes('Hours'));
  const budget = await call(deps, 'POST', 'desk/gf/ask', null, { question: 'What is the finance budget?' });
  assert.ok(!budget.body.answer.includes('480'));
  const pantry = await call(deps, 'POST', 'desk/gf/ask', null, { question: 'Do you run a food pantry?' });
  assert.equal(pantry.body.unknown, true);
  assert.ok(docs.get('orgCrew/gf')!.unanswered.some((u: Doc) => u.q.includes('food pantry')));
  // Teaching it removes it from the unanswered list.
  const taught = await call(deps, 'PUT', 'org/gf/faq', 'owner', { faq: [{ q: 'Do you run a food pantry?', a: 'Yes, Saturdays.' }] });
  assert.ok(!taught.body.unanswered.some((u: Doc) => u.q.includes('food pantry')));
});

test('a model answer that invents a time is thrown away for the facts', async () => {
  const { deps } = world(async () => JSON.stringify({ answer: 'We open at 10:30 AM on Sunday.', cites: ['f2'], known: true }));
  await call(deps, 'PUT', 'org/gf/hire', 'owner', { crewId: 'front_desk', on: true });
  const r = await call(deps, 'POST', 'desk/gf/ask', null, { question: 'What time are you open Sunday?' });
  assert.equal(r.body.by, 'rules');
  assert.ok(!r.body.answer.includes('10:30'));
});

test('HQ briefing is platform-admin only and reports counted figures', async () => {
  const { deps } = world();
  assert.equal((await call(deps, 'GET', 'hq/briefing', 'owner')).status, 403);
  const r = await call(deps, 'GET', 'hq/briefing', 'kenne');
  assert.equal(r.status, 200);
  assert.equal(r.body.briefing.sections[0].crew, 'Security Council');
  assert.ok(r.body.briefing.sections[0].headline.startsWith('1 urgent'));
  assert.ok(r.body.briefing.sections[1].lines[0].includes('1 new account'));
  const d = await call(deps, 'POST', 'hq/drifts', 'kenne', { principleId: 'direct_fee', note: 'Checkout copy says 10%.' });
  assert.equal(d.status, 200);
  assert.equal((await call(deps, 'POST', 'hq/drifts', 'kenne', { principleId: 'made_up', note: 'x' })).status, 400);
  assert.equal((await call(deps, 'POST', `hq/drifts/${d.body.drifts[0].id}/close`, 'kenne')).body.drifts[0].closedAt, NOW);
});
