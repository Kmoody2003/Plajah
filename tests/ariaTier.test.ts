import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { decideVerifiedAgentTier, isVerifiedAdmin, OWNER_EMAIL } from '../services/aria/ariaTier';
import { decideAriaVoiceAccess } from '../routes/ariaSpeak';
import { createCouncil } from '../services/council/councilRoutes';

const none = { isAdminDoc: false, hasActiveSubscription: false };

test('free by default; subscription → PLAJAH_PLUS; admin → PRO', () => {
  assert.equal(decideVerifiedAgentTier(none), 'FREE');
  assert.equal(decideVerifiedAgentTier({ ...none, hasActiveSubscription: true }), 'PLAJAH_PLUS');
  assert.equal(decideVerifiedAgentTier({ ...none, isAdminDoc: true }), 'PRO');
  assert.equal(decideVerifiedAgentTier({ ...none, isAdminDoc: true, hasActiveSubscription: true }), 'PRO');
});

test('owner email counts only when the token says it is VERIFIED', () => {
  assert.equal(OWNER_EMAIL, 'kmoody2003@gmail.com');
  assert.equal(decideVerifiedAgentTier({ ...none, email: 'KMoody2003@Gmail.com', emailVerified: true }), 'PRO');
  assert.equal(decideVerifiedAgentTier({ ...none, email: OWNER_EMAIL, emailVerified: false }), 'FREE');
  assert.equal(decideVerifiedAgentTier({ ...none, email: 'someone@else.com', emailVerified: true }), 'FREE');
  assert.equal(isVerifiedAdmin({ isAdminDoc: false, email: 'a@b.com', emailVerified: true, extraAdminEmails: 'x@y.com, a@b.com' }), true);
});

test('there is no way to pass a self-asserted role/tier — the facts have no such field', () => {
  // The decision function takes ONLY verified facts; extra properties (role, tier, accountType) are inert.
  const spoof: any = { ...none, role: 'admin', tier: 'PRO', accountType: 'WRITER' };
  assert.equal(decideVerifiedAgentTier(spoof), 'FREE');
  assert.equal(decideAriaVoiceAccess(spoof), null);
});

test('voice access mirrors the same facts', () => {
  assert.equal(decideAriaVoiceAccess({ ...none, hasActiveSubscription: true }), 'paid');
  assert.equal(decideAriaVoiceAccess({ ...none, isAdminDoc: true }), 'admin');
  assert.equal(decideAriaVoiceAccess({ ...none, email: OWNER_EMAIL, emailVerified: true }), 'admin');
  assert.equal(decideAriaVoiceAccess(none), null);
});

// ── Council route: a client-sent tier must not raise the daily cap ───────────────────────────
async function councilStatuses(resolveTier: (() => Promise<string>) | undefined, bodyTier: string, calls = 4) {
  const mem = new Map<string, any>();
  const council = createCouncil({
    authMiddleware: (req: any, _s: any, n: any) => { req.uid = 'tester'; n(); },
    apiLimiter: (_q: any, _s: any, n: any) => n(),
    firestoreAuthHeaders: async () => ({}),
    resolveTier,
    model: async () => { throw new Error('stub model: no network in tests'); },
    grounded: async () => '',
    store: {
      get: async p => mem.get(p) ?? null,
      set: async (p, o) => { mem.set(p, o); return true; },
      list: async () => [],
    },
  } as any);
  const app = express(); app.use(express.json()); council.register(app);
  const server: http.Server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const out: number[] = [];
  try {
    for (let i = 0; i < calls; i++) {
      const res = await fetch(`${base}/api/council/deliberate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief: { ask: 'Design a poster for the spring concert' }, depth: 'QUICK', tier: bodyTier }),
      });
      out.push(res.status);
    }
  } finally { server.close(); }
  return out;
}

test('council: body tier:"PRO" is ignored — a FREE caller still hits the FREE cap (3)', async () => {
  const s = await councilStatuses(async () => 'FREE', 'PRO');
  assert.equal(s[3], 429, `statuses were ${s}`);
  assert.notEqual(s[2], 429, `statuses were ${s}`);
});

test('council: with no resolver wired, everyone is FREE regardless of the body', async () => {
  const s = await councilStatuses(undefined, 'PRO');
  assert.equal(s[3], 429, `statuses were ${s}`);
});

test('council: a verified PLAJAH_PLUS caller gets the larger cap', async () => {
  const s = await councilStatuses(async () => 'PLAJAH_PLUS', 'FREE');
  assert.ok(!s.includes(429), `statuses were ${s}`);
});
