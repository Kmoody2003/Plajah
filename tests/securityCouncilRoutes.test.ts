// Security & IT Council routes — auth gates + ingest sanitising. Run: npx tsx --test tests/securityCouncilRoutes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSecurityCouncilRouter } from '../routes/securityCouncil';
import { registerCouncilStore } from '../services/securityCouncil/registry';
import { createMemoryStore } from '../services/securityCouncil/store';

test('cron key, ingest key and admin gate are enforced; ingest never stores secret values', async () => {
  process.env.CRON_SECRET = 'cron-test-secret';
  process.env.SECURITY_COUNCIL_INGEST_KEY = 'ingest-test-key';
  const store = createMemoryStore();
  registerCouncilStore(store);
  const app = express();
  app.use(express.json());
  const deny = (_req: any, res: any) => res.status(403).json({ error: 'Platform admin access required' });
  app.use('/api', createSecurityCouncilRouter({ authMiddleware: (_q: any, _s: any, n: any) => n(), requireVerifiedAdmin: deny }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const url = (p: string) => `http://127.0.0.1:${port}/api${p}`;
  try {
    assert.equal((await fetch(url('/cron/security-council'), { method: 'POST' })).status, 401);
    assert.equal((await fetch(url('/cron/security-council'), { method: 'POST', headers: { 'x-cron-key': 'wrong' } })).status, 401);
    assert.equal((await fetch(url('/security/council/ingest-audit'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(url('/security/council/findings'))).status, 403);
    assert.equal((await fetch(url('/security/council/mitigations/m_abc123_1/undo'), { method: 'POST' })).status, 403);

    const body = {
      event: 'schedule', ref: 'main', commit: 'abc',
      npmAudit: { counts: { critical: 0, high: 1, moderate: 0, low: 0 }, advisories: [{ name: 'pkg', severity: 'high', fixAvailable: true }] },
      secretScan: { findings: [{ rule: 'aws-access-key', file: 'x.ts', line: 3, value: 'AKIAABCDEFGHIJKLMNOP' }] },
    };
    const r = await fetch(url('/security/council/ingest-audit'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-council-ingest-key': 'ingest-test-key' }, body: JSON.stringify(body) });
    assert.equal(r.status, 200);
    const latest = await store.get('security_audit', 'latest');
    assert.equal(latest?.npmAudit.advisories[0].name, 'pkg');
    assert.ok(!JSON.stringify(latest).includes('AKIA'), 'secret values are dropped');

    const pr = await fetch(url('/security/council/ingest-audit'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-council-ingest-key': 'ingest-test-key' }, body: JSON.stringify({ ...body, event: 'pull_request', ref: 'feature/x', npmAudit: { counts: { high: 9 } } }) });
    assert.equal((await pr.json()).stored, 'pr_feature_x');
    assert.equal((await store.get('security_audit', 'latest'))?.npmAudit.counts.high, 1, 'PR runs never overwrite latest');
  } finally {
    server.close();
  }
});
