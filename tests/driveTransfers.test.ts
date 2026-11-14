// tests/driveTransfers.test.ts — Send Transfers API & service tests (plan limits, scrypt password lock,
// expiry, download limits, revoke cleanup). Run: npx tsx --test tests/driveTransfers.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginTransfer,
  completeTransfer,
  inspectTransferPublic,
  listMyTransfers,
  revokeTransfer,
  unlockTransferWithPassword,
  type TransferDeps,
} from '../services/drive/transfersService';
import type { DrivePlan } from '../services/drive/plans';

function makeFakeDeps(planMap: Record<string, DrivePlan> = { u_free: 'free', u_glow: 'glow' }) {
  const docs = new Map<string, Record<string, any>>();
  const storedSizes = new Map<string, number>();
  let nowMs = Date.UTC(2026, 10, 13, 10, 0, 0);
  let seq = 0;

  const s3Cfg = {
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    region: 'us-west-004',
    bucket: 'plajah-drive-test',
    keyId: 'testKeyId',
    appKey: 'testAppKey',
  };

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const u = new URL(url);
    const key = decodeURIComponent(u.pathname.replace(/^\/plajah-drive-test\//, ''));
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'HEAD') {
      const sz = storedSizes.get(key);
      if (sz === undefined) return new Response('', { status: 404 });
      return new Response('', { status: 200, headers: { 'content-length': String(sz) } });
    }
    if (method === 'DELETE') {
      storedSizes.delete(key);
      return new Response('', { status: 204 });
    }
    return new Response('', { status: 200 });
  };

  const deps: TransferDeps = {
    store: {
      async get(path) {
        return docs.get(path) ? structuredClone(docs.get(path)!) : null;
      },
      async set(path, data) {
        docs.set(path, structuredClone(data));
        return true;
      },
      async query(collection, field, value) {
        const prefix = `${collection}/`;
        const out: Array<{ id: string; data: Record<string, any> }> = [];
        for (const [k, v] of docs.entries()) {
          if (k.startsWith(prefix) && v[field] === value) {
            out.push({ id: k.slice(prefix.length), data: structuredClone(v) });
          }
        }
        return out;
      },
      async remove(path) {
        return docs.delete(path);
      },
    },
    s3: () => s3Cfg,
    fetch: fakeFetch,
    planOf: async uid => planMap[uid] || 'free',
    now: () => nowMs,
    newId: () => `id_${++seq}_abcdefgh`,
    tokenSecret: 'unit-test-secret-key',
  };

  return {
    deps,
    storedSizes,
    advanceMs: (ms: number) => { nowMs += ms; },
  };
}

test('transfers: free plan refuses password-protected send; glow plan creates scrypt-locked link & unlocks cleanly', async () => {
  const { deps, storedSizes } = makeFakeDeps();

  await assert.rejects(
    () => beginTransfer('u_free', { password: 'secret', files: [{ name: 'mix.wav', size: 1024, mime: 'audio/wav' }] }, deps),
    (err: any) => err.code === 'plan_limit' && err.status === 403,
  );

  const begun = await beginTransfer(
    'u_glow',
    {
      title: 'Studio Masters',
      days: 14,
      password: 'correct-horse-battery',
      maxDownloads: 2,
      files: [{ name: 'master.flac', size: 5_000_000, mime: 'audio/flac' }],
    },
    deps,
  );

  assert.equal(begun.folder, 30);
  assert.equal(begun.passwordProtected, true);
  assert.equal(begun.files[0].mode, 'single');
  assert.ok(begun.files[0].key.startsWith(`transfers/30d/${begun.transferId}/`));

  // Simulate browser PUT landing on B2 before completeTransfer HEADs it.
  storedSizes.set(begun.files[0].key, 5_000_000);
  await completeTransfer('u_glow', begun.transferId, {}, deps);

  const locked = await inspectTransferPublic(begun.transferId, {}, deps);
  assert.equal(locked.locked, true);
  assert.equal(locked.files[0].downloadUrl, undefined);

  await assert.rejects(
    () => unlockTransferWithPassword(begun.transferId, 'wrong-password', deps),
    (err: any) => err.code === 'bad_password' && err.status === 403,
  );

  const unlocked = await unlockTransferWithPassword(begun.transferId, 'correct-horse-battery', deps);
  assert.equal(unlocked.locked, false);
  assert.ok(typeof unlocked.unlockToken === 'string' && unlocked.unlockToken.length > 10);
  assert.ok(unlocked.files[0].downloadUrl?.includes('X-Amz-Signature'));

  const dl1 = await inspectTransferPublic(begun.transferId, { unlockToken: unlocked.unlockToken, countDownload: true }, deps);
  assert.equal(dl1.downloadCount, 1);
  const dl2 = await inspectTransferPublic(begun.transferId, { unlockToken: unlocked.unlockToken, countDownload: true }, deps);
  assert.equal(dl2.downloadCount, 2);

  await assert.rejects(
    () => inspectTransferPublic(begun.transferId, { unlockToken: unlocked.unlockToken, countDownload: true }, deps),
    (err: any) => err.code === 'limit_reached' && err.status === 410,
  );
});

test('transfers: expiry enforcement, listing without leaking passwordHash, and revoke removes B2 object', async () => {
  const { deps, storedSizes, advanceMs } = makeFakeDeps();
  const begun = await beginTransfer(
    'u_glow',
    { title: 'Deck', days: 7, password: 'secret', files: [{ name: 'deck.pdf', size: 2048 }] },
    deps,
  );
  storedSizes.set(begun.files[0].key, 2048);
  await completeTransfer('u_glow', begun.transferId, {}, deps);

  const mine = await listMyTransfers('u_glow', deps);
  assert.equal(mine.length, 1);
  assert.equal((mine[0] as any).passwordHash, undefined);
  assert.equal(mine[0].passwordProtected, true);

  advanceMs(8 * 86_400_000);
  await assert.rejects(
    () => inspectTransferPublic(begun.transferId, {}, deps),
    (err: any) => err.code === 'expired' && err.status === 410,
  );

  await revokeTransfer('u_glow', begun.transferId, deps);
  assert.equal(storedSizes.has(begun.files[0].key), false);
  assert.equal((await listMyTransfers('u_glow', deps)).length, 0);
});
