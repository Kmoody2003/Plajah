// /api/gen-cloud end to end on fakes: Runware adapter, CAS ledger store (racing holds), monthly
// allowance, prompt moderation, and the Express router. Run: npx tsx --test tests/genCloudRoutes.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { memoryCasStore } from '../services/casCore';
import { runwareAdapter } from '../services/genCloud/providers';
import { ledgerStore, jobStore } from '../services/genCloud/store';
import { judgePrompt, promptModerator } from '../services/genCloud/moderation';
import { emptyLedger, grantBonus, hold, balance, LedgerError } from '../services/genCloud/ledger';
import { createGenCloudRouter, refreshAllowance, type GenCloudAccount } from '../routes/genCloud';
import type { ProviderAdapter } from '../services/genCloud/types';
import type { AccountFacts } from '../services/genCloud/tiers';

const T0 = Date.UTC(2026, 11, 3);
const UUID = '11111111-2222-3333-4444-555555555555';
const facts = (x: Partial<AccountFacts> = {}): AccountFacts => ({ plan: 'glow', packCredits: 0, verifiedAdult: false, restricted: false, ...x });

// ── Runware adapter ─────────────────────────────────────────────────────────────────────────────

test('runware: image task is one synchronous call with the key only in the header', async () => {
  const calls: any[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: [{ taskType: 'imageInference', taskUUID: UUID, imageURL: 'https://im.runware.ai/a.png' }] }));
  }) as any;
  const a = runwareAdapter('rw-key', f, () => UUID);
  const sub = await a.submit({ provider: 'runware', model: 'runware:100@1', costPerUnit: {}, verified: false }, { engine: 'spark-image', prompt: 'a fox', aspect: '16:9', count: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.runware.ai/v1');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer rw-key');
  const body = JSON.parse(calls[0].init.body);
  assert.ok(Array.isArray(body));
  assert.deepEqual([body[0].taskType, body[0].width, body[0].height, body[0].numberResults], ['imageInference', 1344, 768, 2]);
  assert.ok(!JSON.stringify(body).includes('rw-key'));
  assert.equal(sub.outputs?.[0].url, 'https://im.runware.ai/a.png');
});

test('runware: provider errors throw (so the gateway falls back), video polls via getResponse', async () => {
  const err = runwareAdapter('k', (async () => new Response(JSON.stringify({ errors: [{ code: 'x', message: 'insufficient credits' }] }))) as any, () => UUID);
  await assert.rejects(err.submit({ provider: 'runware', model: 'runware:100@1', costPerUnit: {}, verified: false }, { engine: 'spark-image', prompt: 'p' }), /insufficient credits/);

  let n = 0;
  const vid = runwareAdapter('k', (async (_u: string, init: any) => {
    const t = JSON.parse(init.body)[0];
    if (t.taskType === 'videoInference') return new Response(JSON.stringify({ data: [{ taskType: 'videoInference', taskUUID: UUID }] }));
    n++;
    return new Response(JSON.stringify({ data: [n === 1 ? { taskUUID: UUID, status: 'processing' } : { taskUUID: UUID, status: 'success', videoURL: 'https://vm.runware.ai/v.mp4' }] }));
  }) as any, () => UUID);
  const route = { provider: 'runware' as const, model: 'video:klingai:5@3', costPerUnit: {}, verified: false };
  const s = await vid.submit(route, { engine: 'motion-pro', prompt: 'p', seconds: 5, resolution: '1080p' });
  assert.equal(s.providerJobId, UUID);
  assert.equal((await vid.poll(route, UUID)).status, 'running');
  const done = await vid.poll(route, UUID);
  assert.equal(done.status, 'succeeded');
  assert.equal(done.outputs?.[0].mime, 'video/mp4');
  assert.equal((await vid.poll(route, '../../etc')).status, 'failed');
});

// ── CAS ledger store ────────────────────────────────────────────────────────────────────────────

test('ledger store: two racing holds on 10 credits — exactly one wins, nothing is double-spent', async () => {
  const cas = memoryCasStore();
  const store = ledgerStore(cas, () => T0);
  await store.update('u1', l => grantBonus(l, 'g1', 10, T0));
  const results = await Promise.allSettled([
    store.update('u1', l => hold(l, 'job-a', 8, T0)),
    store.update('u1', l => hold(l, 'job-b', 8, T0)),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const lost = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  assert.ok(lost.reason instanceof LedgerError && lost.reason.code === 'insufficient');
  assert.equal(balance(await store.read('u1'), T0).available, 2);
});

test('ledger store: a no-op update does not write', async () => {
  const cas = memoryCasStore();
  const store = ledgerStore(cas, () => T0);
  await store.update('u2', l => l);
  assert.equal(cas.docs.has('u2'), false);
});

test('allowance: granted once per month, frozen when the plan has none', () => {
  let l = refreshAllowance(emptyLedger('u'), 'glow', T0);
  assert.equal(balance(l, T0).monthly, 80);
  assert.equal(refreshAllowance(l, 'glow', T0 + 1000), l); // same month → same object, no write
  l = refreshAllowance(l, 'free', T0 + 2000);
  assert.equal(balance(l, T0 + 2000).monthly, 0);
  assert.equal(balance(l, T0 + 2000).frozen, 80);
});

// ── moderation ──────────────────────────────────────────────────────────────────────────────────

test('moderation: minors always blocked, explicit only for verified adults, outage allows', async () => {
  assert.equal(judgePrompt({ 'sexual/minors': 0.2 }, facts({ verifiedAdult: true })).ok, false);
  assert.equal(judgePrompt({ sexual: 0.6 }, facts()).ok, false);
  assert.equal(judgePrompt({ sexual: 0.6 }, facts({ verifiedAdult: true })).ok, true);
  assert.equal(judgePrompt({ 'violence/graphic': 0.7 }, facts({ restricted: true })).ok, false);
  assert.equal(judgePrompt({ 'violence/graphic': 0.7 }, facts()).ok, true);
  const down = promptModerator(async () => ({ error: 'openai:not_configured' }));
  assert.equal((await down({ engine: 'spark-image', prompt: 'x' }, facts())).ok, true);
});

// ── router ──────────────────────────────────────────────────────────────────────────────────────

function fakeAdapter(id: ProviderAdapter['id'], behave: 'ok' | 'fail'): ProviderAdapter & { submits: number } {
  const a = {
    id, submits: 0,
    configured: () => true,
    async submit() { a.submits++; if (behave === 'fail') throw new Error('provider down'); return { providerJobId: 'sync:x', outputs: [{ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' }] }; },
    async poll() { return { status: 'failed' as const }; },
    async download() { return new Uint8Array(); },
  };
  return a;
}

async function harness(opts: { account?: Partial<GenCloudAccount>; enabled?: boolean; runware?: 'ok' | 'fail' } = {}) {
  const docs = new Map<string, Record<string, any>>();
  const runware = fakeAdapter('runware', opts.runware ?? 'ok');
  const google = fakeAdapter('google', 'ok');
  const app = express();
  app.use('/api/gen-cloud', express.json(), createGenCloudRouter({
    enabled: () => opts.enabled ?? true,
    callerUid: async req => (req.headers.authorization === 'Bearer good' ? 'u1' : req.headers.authorization === 'Bearer admin' ? 'boss' : null),
    isAdmin: async (_req, uid) => uid === 'boss',
    account: async uid => ({ plan: 'glow', verifiedAdult: false, restricted: false, owner: uid, ...opts.account }),
    ledger: ledgerStore(memoryCasStore(), () => T0),
    jobs: jobStore({ get: async p => docs.get(p) ?? null, set: async (p, d) => { docs.set(p, d); return true; } }),
    adapters: { runware, google },
    moderate: async () => ({ ok: true }),
    persist: async (_b, _o, { job, index }) => `https://firebasestorage.googleapis.com/v0/b/x/o/${job.id}-${index}`,
    now: () => T0,
    newId: (() => { let i = 0; return () => `job${String(++i).padStart(6, '0')}`; })(),
  }));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gen-cloud`;
  const call = async (method: string, path: string, body?: unknown, token = 'good') => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() as any };
  };
  return { call, close: () => server.close(), runware, google };
}

test('router: off by default, sign-in required', async () => {
  const h = await harness({ enabled: false });
  try {
    assert.equal((await h.call('GET', '/balance')).body.code, 'gencloud_off');
  } finally { h.close(); }
  const h2 = await harness();
  try { assert.equal((await h2.call('GET', '/balance', undefined, 'bad')).status, 401); } finally { h2.close(); }
});

test('router: Glow sees its allowance, engines carry no provider names, premium is locked', async () => {
  const h = await harness();
  try {
    const bal = await h.call('GET', '/balance');
    assert.equal(bal.body.available, 80);
    const eng = await h.call('GET', '/engines');
    assert.ok(!/runware|\bfal\b|google|imagen|veo|kling|flux|costPerUnit|"routes"/i.test(JSON.stringify(eng.body)));
    const cinema = eng.body.engines.find((e: any) => e.id === 'cinema');
    assert.deepEqual([cinema.allowed, cinema.upgradeTo], [false, 'nova']);
  } finally { h.close(); }
});

test('router: a Spark image job charges 4 credits and stores the result; failover never double-charges', async () => {
  const h = await harness();
  try {
    const r = await h.call('POST', '/jobs', { engine: 'spark-image', prompt: 'a lighthouse at dusk', providerSecret: 'ignored' });
    assert.equal(r.status, 200);
    assert.equal(r.body.job.status, 'succeeded');
    assert.equal(r.body.job.credits, 4);
    assert.equal(r.body.job.aiGenerated, true);
    assert.ok(!('providerJobId' in r.body.job) && !('routeIndex' in r.body.job));
    assert.equal(h.runware.submits, 1);
    assert.equal((await h.call('GET', '/balance')).body.available, 76);
    const again = await h.call('GET', `/jobs/${r.body.job.id}`);
    assert.equal(again.body.job.status, 'succeeded');
  } finally { h.close(); }

  const h2 = await harness({ runware: 'fail' });
  try {
    const r = await h2.call('POST', '/jobs', { engine: 'spark-image', prompt: 'a lighthouse' });
    assert.equal(r.body.job.status, 'succeeded');               // Runware down → Imagen route took it
    assert.equal(h2.google.submits, 1);
    assert.equal((await h2.call('GET', '/balance')).body.available, 76);
  } finally { h2.close(); }
});

test('router: locked lane 403, out of credits 402, foreign image URL 400, other users’ jobs 404', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call('POST', '/jobs', { engine: 'cinema', prompt: 'x', seconds: 8, resolution: '1080p' })).status, 403);
    assert.equal((await h.call('POST', '/jobs', { engine: 'motion', prompt: 'x', seconds: 8, resolution: '1080p' })).status, 402); // 200 credits > 80
    assert.equal((await h.call('POST', '/jobs', { engine: 'edit-image', prompt: 'x', imageUrl: 'https://evil.example/a.png' })).status, 400);
    const r = await h.call('POST', '/jobs', { engine: 'spark-image', prompt: 'x' });
    assert.equal((await h.call('GET', `/jobs/${r.body.job.id}`, undefined, 'admin')).status, 404);
  } finally { h.close(); }
});

test('router: admin bonus grant is admin-only and idempotent', async () => {
  const h = await harness({ account: { plan: 'free' } });
  try {
    assert.equal((await h.call('POST', '/admin/grant', { uid: 'u1abcd', credits: 50, grantId: 'launch' })).status, 403);
    const g = await h.call('POST', '/admin/grant', { uid: 'u1abcd', credits: 50, grantId: 'launch' }, 'admin');
    assert.equal(g.body.balance.available, 50);
    const g2 = await h.call('POST', '/admin/grant', { uid: 'u1abcd', credits: 50, grantId: 'launch' }, 'admin');
    assert.equal(g2.body.balance.available, 50);
  } finally { h.close(); }
});
