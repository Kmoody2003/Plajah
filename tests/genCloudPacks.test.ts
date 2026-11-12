// Credit packs: catalog margins, session validation, webhook grant (idempotent on redelivery),
// refund clawback, and the checkout route. Run: npx tsx --test tests/genCloudPacks.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { memoryCasStore } from '../services/casCore';
import { ledgerStore } from '../services/genCloud/store';
import { balance } from '../services/genCloud/ledger';
import { CREDIT_PACKS, getPack, packFromSession, packMarginCents, refundRevokeTarget } from '../services/genCloud/packs';
import { createGenCloudRouter, onPackCheckoutCompleted, onPackChargeRefunded, type PackWebhookDeps } from '../routes/genCloud';

const T0 = Date.UTC(2026, 11, 3);

const session = (over: Record<string, any> = {}, meta: Record<string, any> = {}) => ({
  id: 'sess_1', mode: 'payment', payment_status: 'paid', amount_total: 2500, payment_intent: 'pi_1',
  metadata: { type: 'gencloud_pack', uid: 'u1', owner: 'u1', packId: 'pack-2600', credits: '2600', ...meta },
  ...over,
});

function webhookDeps(): PackWebhookDeps & { purchasesMap: Map<string, any> } {
  const purchasesMap = new Map<string, any>();
  return {
    purchasesMap,
    ledger: ledgerStore(memoryCasStore(), () => T0),
    purchases: { get: async pi => purchasesMap.get(pi) ?? null, set: async (pi, d) => { purchasesMap.set(pi, d); return true; } },
    now: () => T0,
  };
}

test('packs: every pack stays profitable in the worst case (thinnest route + Stripe fee)', () => {
  for (const p of CREDIT_PACKS) assert.ok(packMarginCents(p) > 0, `${p.id} margin ${packMarginCents(p)}`);
  assert.equal(new Set(CREDIT_PACKS.map(p => p.id)).size, CREDIT_PACKS.length);
});

test('packs: only a paid session with the catalog price grants, credits come from the catalog', () => {
  assert.deepEqual(packFromSession(session()), { owner: 'u1', uid: 'u1', purchaseId: 'cs_sess_1', credits: 2600, paymentIntentId: 'pi_1' });
  assert.equal(packFromSession(session({ payment_status: 'unpaid' })), null);
  assert.equal(packFromSession(session({ amount_total: 100 })), null);                // amount must match the catalog
  assert.equal(packFromSession(session({}, { credits: '999999' }))?.credits, 2600);  // metadata credits ignored
  assert.equal(packFromSession(session({}, { packId: 'pack-free' })), null);
  assert.equal(packFromSession(session({}, { type: 'adpackage' })), null);
});

test('webhook: grant once even when Stripe redelivers; refund takes back unspent credits', async () => {
  const d = webhookDeps();
  assert.equal(await onPackCheckoutCompleted(session(), d), 'granted');
  assert.equal(await onPackCheckoutCompleted(session(), d), 'granted');             // redelivery
  assert.equal(balance(await d.ledger.read('u1'), T0).pack, 2600);
  assert.equal(d.purchasesMap.get('pi_1').purchaseId, 'cs_sess_1');
  assert.equal(await onPackCheckoutCompleted({ ...session(), metadata: { type: 'other' } }, d), 'skip');

  // half refund → 1300 back; same event again → nothing more; full refund → the rest
  assert.equal(await onPackChargeRefunded({ payment_intent: 'pi_1', amount: 2500, amount_refunded: 1250 }, d), 1300);
  assert.equal(await onPackChargeRefunded({ payment_intent: 'pi_1', amount: 2500, amount_refunded: 1250 }, d), 0);
  assert.equal(await onPackChargeRefunded({ payment_intent: 'pi_1', amount: 2500, amount_refunded: 2500 }, d), 1300);
  assert.equal(balance(await d.ledger.read('u1'), T0).pack, 0);
  assert.equal(await onPackChargeRefunded({ payment_intent: 'pi_unknown', amount: 1, amount_refunded: 1 }, d), 0);
});

test('webhook: refund after some credits were spent only takes what is left', async () => {
  const d = webhookDeps();
  await onPackCheckoutCompleted(session({ amount_total: 1000 }, { packId: 'pack-1000' }), d);
  const { hold, settle } = await import('../services/genCloud/ledger');
  await d.ledger.update('u1', l => settle(hold(l, 'job1', 700, T0), 'job1'));
  assert.equal(await onPackChargeRefunded({ payment_intent: 'pi_1', amount: 1000, amount_refunded: 1000 }, d), 300);
  assert.equal(balance(await d.ledger.read('u1'), T0).available, 0);
  assert.equal(refundRevokeTarget(1000, 0, 1000), 0);
});

test('route: GET /packs lists the catalog; checkout stamps metadata and refuses restricted accounts', async () => {
  const made: any[] = [];
  const mk = (restricted: boolean) => createGenCloudRouter({
    enabled: () => true,
    callerUid: async () => 'u1',
    isAdmin: async () => false,
    account: async uid => ({ plan: 'glow', verifiedAdult: false, restricted, owner: uid }),
    ledger: ledgerStore(memoryCasStore(), () => T0),
    jobs: { save: async () => {}, get: async () => null },
    adapters: {},
    moderate: async () => ({ ok: true }),
    persist: async () => '',
    now: () => T0,
    newId: () => 'x',
    origin: () => 'https://plajah.com',
    createCheckout: async a => { made.push(a); return 'https://checkout.stripe.com/c/pay/cs_test_1'; },
  });
  const app = express();
  app.use('/a', express.json(), mk(false));
  app.use('/kid', express.json(), mk(true));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const list = await (await fetch(`${base}/a/packs`, { headers: { Authorization: 'Bearer t' } })).json() as any;
    assert.equal(list.onSale, true);
    assert.equal(list.packs.length, CREDIT_PACKS.length);
    const ok = await post('/a/packs/checkout', { packId: 'pack-5400' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json() as any).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.deepEqual(made[0].metadata, { type: 'gencloud_pack', uid: 'u1', owner: 'u1', packId: 'pack-5400', credits: '5400' });
    assert.equal(made[0].pack, getPack('pack-5400'));
    assert.equal((await post('/a/packs/checkout', { packId: 'pack-huge' })).status, 400);
    assert.equal((await post('/kid/packs/checkout', { packId: 'pack-1000' })).status, 403);
  } finally { server.close(); }
});
