// White-label cloud generation: catalog, pricing + margins, tier gates, credit ledger, provider
// adapters (fake fetch), and the gateway end to end with fakes. Run: npx tsx --test tests/genCloud.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { ENGINES, getEngine, publicEngine, withRouteOverrides } from '../services/genCloud/catalog';
import { quote, marginCheck, QuoteError } from '../services/genCloud/pricing';
import { canUseEngine, type AccountFacts } from '../services/genCloud/tiers';
import {
  emptyLedger, grantMonthly, grantPack, hold, settle, release, lapse, balance, prune, LedgerError, MONTH, DAY,
} from '../services/genCloud/ledger';
import { falAdapter, googleAdapter, minimaxAdapter, elevenlabsAdapter } from '../services/genCloud/providers';
import { submitJob, pollJob, GenError, type GatewayDeps, type GenJob } from '../services/genCloud/gateway';
import type { ProviderAdapter } from '../services/genCloud/types';

const T0 = Date.UTC(2026, 11, 1);
const acct = (plan: AccountFacts['plan'], extra: Partial<AccountFacts> = {}): AccountFacts =>
  ({ plan, packCredits: 0, verifiedAdult: true, restricted: false, ...extra });

// ── catalog + pricing ─────────────────────────────────────────────────────────────────────────

test('catalog: unique ids, every engine priced and routed, nothing provider-named in public view', () => {
  assert.equal(new Set(ENGINES.map(e => e.id)).size, ENGINES.length);
  for (const e of ENGINES) {
    assert.ok(e.routes.length, e.id);
    const pub = JSON.stringify(publicEngine(e));
    assert.ok(!/google|fal|minimax|eleven|veo|imagen|kling|seedance|hailuo|flux/i.test(pub), `${e.id} leaks a provider: ${pub}`);
  }
});

test('pricing: every route of every engine clears the 1.5× markup floor', () => {
  assert.deepEqual(marginCheck(ENGINES), []);
});

test('pricing: quotes match the plan (images, video seconds, voice minutes)', () => {
  assert.equal(quote(getEngine('spark-image')!, { engine: 'spark-image', prompt: 'x', count: 3 }).credits, 12);
  const cinema = quote(getEngine('cinema')!, { engine: 'cinema', prompt: 'x', seconds: 8, resolution: '1080p' });
  assert.equal(cinema.credits, 560);
  assert.equal(cinema.estCostUsd, 3.2);
  const voice = quote(getEngine('voice')!, { engine: 'voice', prompt: '', text: 'a'.repeat(1800) });
  assert.equal(voice.units, 2);
  assert.equal(voice.credits, 18);
  assert.throws(() => quote(getEngine('cinema')!, { engine: 'cinema', prompt: 'x', seconds: 30 }), QuoteError);
  assert.throws(() => quote(getEngine('pro-image')!, { engine: 'pro-image', prompt: 'x', count: 9 }), QuoteError);
});

test('catalog: route overrides swap a model without a deploy; bad JSON is ignored', () => {
  const o = withRouteOverrides(ENGINES, JSON.stringify({ 'motion-pro': [{ provider: 'minimax', model: 'X', costPerUnit: { '1080p': 0.1 } }] }));
  assert.equal(o.find(e => e.id === 'motion-pro')!.routes[0].model, 'X');
  assert.equal(withRouteOverrides(ENGINES, '{nope'), ENGINES);
});

// ── tiers ─────────────────────────────────────────────────────────────────────────────────────

test('tiers: standard needs Glow or packs; premium needs Nova; adult-only + restricted gates', () => {
  const motion = getEngine('motion')!, cinema = getEngine('cinema')!, multi = getEngine('motion-multi')!, img = getEngine('pro-image')!;
  assert.equal(canUseEngine(motion, acct('spark')).ok, false);
  assert.equal(canUseEngine(motion, acct('spark', { packCredits: 100 })).ok, true);
  assert.equal(canUseEngine(motion, acct('glow')).ok, true);
  const c = canUseEngine(cinema, acct('glow', { packCredits: 5000 }));
  assert.equal(c.ok, false);
  assert.equal(!c.ok && c.upgradeTo, 'nova');
  assert.equal(canUseEngine(cinema, acct('nova')).ok, true);
  assert.equal(canUseEngine(multi, acct('studio_max', { verifiedAdult: false })).ok, false);
  assert.equal(canUseEngine(motion, acct('nova', { restricted: true })).ok, false);
  assert.equal(canUseEngine(img, acct('nova', { restricted: true })).ok, true);
});

// ── ledger ────────────────────────────────────────────────────────────────────────────────────

test('ledger: monthly grant is idempotent, spends monthly before packs, holds/settles/releases', () => {
  let l = grantMonthly(emptyLedger('u1'), 'nova', '2026-12', T0, T0);
  l = grantMonthly(l, 'nova', '2026-12', T0, T0);
  l = grantPack(l, 'pi_1', 1000, T0);
  l = grantPack(l, 'pi_1', 1000, T0);
  assert.deepEqual([balance(l, T0).monthly, balance(l, T0).pack], [200, 1000]);
  l = hold(l, 'job1', 250, T0);
  assert.deepEqual([balance(l, T0).monthly, balance(l, T0).pack, balance(l, T0).held], [0, 950, 250]);
  const failed = release(l, 'job1');
  assert.deepEqual([balance(failed, T0).monthly, balance(failed, T0).pack], [200, 1000]);
  l = settle(l, 'job1');
  assert.equal(balance(l, T0).held, 0);
  assert.equal(settle(l, 'job1'), l, 'duplicate settle is a no-op');
  assert.equal(hold(l, 'job1', 5, T0), l, 'a settled job cannot hold again');
  assert.throws(() => hold(l, 'job2', 99999, T0), LedgerError);
});

test('ledger: rollover window, 3-month cap, pack expiry', () => {
  let l = emptyLedger('u1');
  for (let m = 0; m < 6; m++) l = grantMonthly(l, 'studio_max', `p${m}`, T0 + m * MONTH, T0 + m * MONTH);
  const now = T0 + 5 * MONTH + DAY;
  assert.ok(balance(l, now).monthly <= 18000, `cap: ${balance(l, now).monthly}`);
  let g = grantMonthly(emptyLedger('u2'), 'glow', 'a', T0, T0);           // 1-month rollover
  assert.equal(balance(g, T0 + MONTH + DAY).monthly, 80);
  assert.equal(balance(g, T0 + 2 * MONTH + DAY).monthly, 0);
  g = grantPack(g, 'pi', 500, T0);
  assert.equal(balance(g, T0 + 364 * DAY).pack, 500);
  assert.equal(balance(g, T0 + 366 * DAY).pack, 0);
  assert.equal(prune(g, T0 + 400 * DAY).buckets.length, 0);
});

test('ledger: lapse freezes monthly credits, resubscribing restores them, 30 days later they expire', () => {
  let l = grantMonthly(emptyLedger('u'), 'all_access', 'a', T0, T0);
  l = grantPack(l, 'pi', 100, T0);
  l = lapse(l, T0 + DAY);
  assert.deepEqual([balance(l, T0 + 2 * DAY).monthly, balance(l, T0 + 2 * DAY).frozen, balance(l, T0 + 2 * DAY).pack], [0, 800, 100]);
  const back = grantMonthly(l, 'all_access', 'b', T0 + 20 * DAY, T0 + 20 * DAY);
  assert.equal(balance(back, T0 + 20 * DAY).monthly, 1600);
  const gone = prune(l, T0 + 32 * DAY);
  assert.equal(balance(gone, T0 + 32 * DAY).frozen, 0);
  assert.equal(balance(gone, T0 + 32 * DAY).pack, 100);
});

// ── adapters (fake fetch) ─────────────────────────────────────────────────────────────────────

function fakeFetch(routes: Array<[RegExp, (init?: RequestInit) => any]>, seen: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response('nope', { status: 404 });
    const body = hit[1](init);
    return body instanceof Uint8Array ? new Response(body) : new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

test('fal: queue submit → status → result, key only in header', async () => {
  const seen: any[] = [];
  const f = fakeFetch([
    [/queue\.fal\.run\/fal-ai\/flux\/schnell$/, () => ({ request_id: 'r1', status_url: 'https://queue.fal.run/s/r1', response_url: 'https://queue.fal.run/r/r1' })],
    [/\/s\/r1$/, () => ({ status: 'COMPLETED' })],
    [/\/r\/r1$/, () => ({ images: [{ url: 'https://cdn.fal/x.png', content_type: 'image/png', width: 1024, height: 1024 }] })],
  ], seen);
  const a = falAdapter('KEY', f);
  const route = getEngine('spark-image')!.routes.find(r => r.provider === 'fal')!;
  const sub = await a.submit(route, { engine: 'spark-image', prompt: 'cat' });
  const p = await a.poll(route, sub.providerJobId);
  assert.equal(p.status, 'succeeded');
  assert.equal(p.outputs![0].url, 'https://cdn.fal/x.png');
  assert.equal((seen[0].init.headers as any).Authorization, 'Key KEY');
  assert.ok(seen.every(s => !s.url.includes('KEY')));
});

test('google: Imagen returns bytes synchronously; Veo long-running op polls to a video', async () => {
  const f = fakeFetch([
    [/imagen-4\.0-generate-001:predict$/, () => ({ predictions: [{ bytesBase64Encoded: Buffer.from('png').toString('base64'), mimeType: 'image/png' }] })],
    [/veo-3\.1-generate-preview:predictLongRunning$/, () => ({ name: 'models/veo-3.1-generate-preview/operations/op1' })],
    [/operations\/op1$/, () => ({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1:download?alt=media' } }] } } })],
  ]);
  const g = googleAdapter('GKEY', f);
  const img = await g.submit(getEngine('pro-image')!.routes[0], { engine: 'pro-image', prompt: 'x' });
  assert.equal(Buffer.from(img.outputs![0].bytes!).toString(), 'png');
  const vid = await g.submit(getEngine('cinema')!.routes[0], { engine: 'cinema', prompt: 'x', seconds: 8, resolution: '1080p' });
  const p = await g.poll(getEngine('cinema')!.routes[0], vid.providerJobId);
  assert.equal(p.status, 'succeeded');
  assert.ok(!p.outputs![0].url!.includes('GKEY'));
  assert.equal((await g.poll(getEngine('cinema')!.routes[0], '../../evil')).status, 'failed');
});

test('minimax + elevenlabs adapters', async () => {
  const f = fakeFetch([
    [/video_generation$/, () => ({ task_id: 't1', base_resp: { status_code: 0 } })],
    [/query\/video_generation\?task_id=t1$/, () => ({ status: 'Success', file_id: 'f1' })],
    [/files\/retrieve\?file_id=f1$/, () => ({ file: { download_url: 'https://mm/v.mp4' } })],
    [/text-to-speech\/abcdefgh123/, () => new Uint8Array([1, 2, 3])],
  ]);
  const m = minimaxAdapter('M', f);
  const route = getEngine('motion')!.routes[1];
  const p = await m.poll(route, (await m.submit(route, { engine: 'motion', prompt: 'x', seconds: 6, resolution: '720p' })).providerJobId);
  assert.equal(p.outputs![0].url, 'https://mm/v.mp4');
  const e = elevenlabsAdapter('E', f);
  const v = await e.submit(getEngine('voice')!.routes[0], { engine: 'voice', prompt: '', text: 'hi', voiceId: 'abcdefgh123' });
  assert.deepEqual([...v.outputs![0].bytes!], [1, 2, 3]);
});

// ── gateway end to end ────────────────────────────────────────────────────────────────────────

function harness(adapters: GatewayDeps['adapters'], startCredits = 1000) {
  let ledger = grantPack(grantMonthly(emptyLedger('u1'), 'nova', 'p', T0, T0), 'pi', startCredits, T0);
  const jobs = new Map<string, GenJob>();
  const stored: string[] = [];
  let n = 0;
  const deps: GatewayDeps = {
    adapters,
    updateLedger: async (_o, fn) => (ledger = fn(ledger)),
    saveJob: async j => { jobs.set(j.id, j); },
    persist: async (_b, o, { job, index }) => { const u = `gs://genCloud/u1/${job.id}/${index}.${o.mime.split('/')[1]}`; stored.push(u); return u; },
    moderate: async req => (/forbidden/.test(req.prompt) ? { ok: false, reason: 'not allowed' } : { ok: true }),
    now: () => T0,
    newId: () => `job${++n}`,
  };
  return { deps, jobs, stored, ledger: () => ledger };
}

const fakeAdapter = (id: any, behave: Partial<ProviderAdapter>): ProviderAdapter => ({
  id, configured: () => true,
  submit: async () => ({ providerJobId: 'p1' }),
  poll: async () => ({ status: 'running' }),
  download: async () => new Uint8Array([9]),
  ...behave,
});

test('gateway: sync engine succeeds, credits settle, output stored and labelled', async () => {
  const h = harness({ google: fakeAdapter('google', { submit: async () => ({ providerJobId: 's', outputs: [{ bytes: new Uint8Array([1]), mime: 'image/png' }] }) }) });
  const job = await submitJob('u1', 'u1', acct('nova'), { engine: 'pro-image', prompt: 'poster', count: 2 }, h.deps);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.credits, 20);
  assert.equal(job.aiGenerated, true);
  assert.equal(h.stored.length, 1);
  assert.equal(balance(h.ledger(), T0).available, 1200 - 20);
  assert.equal(balance(h.ledger(), T0).held, 0);
});

test('gateway: first route errors → falls back to the second; async poll completes', async () => {
  const h = harness({
    google: fakeAdapter('google', { submit: async () => { throw new Error('503 overloaded'); } }),
    minimax: fakeAdapter('minimax', { poll: async () => ({ status: 'succeeded', outputs: [{ url: 'https://mm/v.mp4', mime: 'video/mp4' }] }) }),
  });
  let job = await submitJob('u1', 'u1', acct('nova'), { engine: 'motion', prompt: 'waves', seconds: 6, resolution: '1080p' }, h.deps);
  assert.equal(job.status, 'running');
  assert.equal(job.routeIndex, 1);
  assert.equal(balance(h.ledger(), T0).held, 150);
  job = await pollJob(job, h.deps);
  assert.equal(job.status, 'succeeded');
  assert.equal(balance(h.ledger(), T0).available, 1200 - 150);
});

test('gateway: every route fails → credits come back, user sees no provider detail', async () => {
  const h = harness({ google: fakeAdapter('google', { submit: async () => { throw new Error('quota exceeded for project 123'); } }) });
  const job = await submitJob('u1', 'u1', acct('nova'), { engine: 'cinema', prompt: 'x', seconds: 8, resolution: '1080p' }, h.deps);
  assert.equal(job.status, 'failed');
  assert.ok(!/project|quota|google/i.test(job.error!));
  assert.equal(balance(h.ledger(), T0).available, 1200);
});

test('gateway: a route that fails mid-job hands off to the next route, hold kept', async () => {
  const h = harness({
    fal: fakeAdapter('fal', { poll: async () => ({ status: 'failed', error: 'nsfw filter' }) }),
    minimax: fakeAdapter('minimax', { submit: async () => ({ providerJobId: 'm', outputs: [{ url: 'https://mm/x.mp4', mime: 'video/mp4' }] }) }),
  });
  let job = await submitJob('u1', 'u1', acct('nova'), { engine: 'motion-pro', prompt: 'x', seconds: 5, resolution: '1080p' }, h.deps);
  assert.equal(job.routeIndex, 0);
  job = await pollJob(job, h.deps);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.routeIndex, 1);
  assert.equal(balance(h.ledger(), T0).available, 1200 - 150);
});

test('gateway: plan, moderation and balance are checked before any provider call', async () => {
  let called = 0;
  const h = harness({ google: fakeAdapter('google', { submit: async () => { called++; return { providerJobId: 'x' }; } }) }, 0);
  await assert.rejects(submitJob('u1', 'u1', acct('glow'), { engine: 'cinema', prompt: 'x', seconds: 8 }, h.deps), (e: any) => e instanceof GenError && e.code === 'lane_locked');
  await assert.rejects(submitJob('u1', 'u1', acct('nova'), { engine: 'motion', prompt: 'forbidden thing', seconds: 6 }, h.deps), (e: any) => e.code === 'blocked');
  await assert.rejects(submitJob('u1', 'u1', acct('nova'), { engine: 'cinema', prompt: 'x', seconds: 8 }, h.deps), (e: any) => e instanceof LedgerError);
  assert.equal(called, 0);
});
