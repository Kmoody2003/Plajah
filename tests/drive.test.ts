// Plajah Drive: plan allowances, add-on margins, org pool split, upload quota checks, transfers,
// B2 key layout + lifecycle, multipart planning. Run: npx tsx --test tests/drive.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { ADD_ONS, GiB, TiB, monthlyCostUsd, afterStripe, INCLUDED_BYTES } from '../services/drive/plans';
import {
  personalAllowance, orgPoolBytes, orgExtraCostUsd, reviewAllocation, quotaState, checkUpload, trashPurgeAt,
} from '../services/drive/allocation';
import {
  checkTransfer, driveKey, transferKey, parseDriveOrTransferKey, transferLifecycleRules, planUpload, MAX_PARTS,
} from '../services/drive/transfers';

const NOW = Date.UTC(2026, 11, 1);
const DAY = 86_400_000;

test('add-ons: every SKU keeps a margin at the fill its buyers typically reach', () => {
  for (const a of ADD_ONS) {
    const fill = a.scope === 'personal' ? 0.6 : 0.5;
    const cost = monthlyCostUsd(a.bytes, fill);
    assert.ok(afterStripe(a.priceUsd) > cost, `${a.sku}: keeps ${afterStripe(a.priceUsd)} vs cost ${cost}`);
  }
  assert.ok(monthlyCostUsd(TiB, 1) < 10, 'a full TB on B2 + Bunny stays under $10/month');
});

test('allowance: plan + personal add-ons; org SKUs never count personally', () => {
  assert.equal(personalAllowance({ plan: 'free', addOnSkus: [] }), 5 * GiB);
  assert.equal(personalAllowance({ plan: 'nova', addOnSkus: ['drive_1t', 'pool_5t', 'nope'] }), 100 * GiB + TiB);
});

test('org pool: team plan + pool SKUs + extra TB; allocation review warns, never refuses', () => {
  const o = { plan: 'studio_team' as const, poolSkus: ['pool_5t'], extraTb: 2, departmentCaps: { worship: 6 * TiB, youth: 6 * TiB }, memberCaps: { pastor: 7 * TiB } };
  assert.equal(orgPoolBytes(o), INCLUDED_BYTES.studio_team + 5 * TiB + 2 * TiB);
  assert.equal(orgExtraCostUsd(o), 13);
  const w = reviewAllocation(o, { pastor: 'worship' });
  assert.ok(w.some(x => x.kind === 'departments_over_pool'));
  assert.ok(w.some(x => x.kind === 'member_over_department'));
});

test('quota state: ok → warn at 90% → grace (≤10% over, 14 days) → blocked; trash counts', () => {
  const A = 100 * GiB;
  assert.equal(quotaState({ liveBytes: 80 * GiB, trashBytes: 0 }, A, NOW), 'ok');
  assert.equal(quotaState({ liveBytes: 80 * GiB, trashBytes: 15 * GiB }, A, NOW), 'warn');
  assert.equal(quotaState({ liveBytes: 105 * GiB, trashBytes: 0, overSince: NOW - DAY }, A, NOW), 'grace');
  assert.equal(quotaState({ liveBytes: 105 * GiB, trashBytes: 0, overSince: NOW - 15 * DAY }, A, NOW), 'blocked');
  assert.equal(quotaState({ liveBytes: 120 * GiB, trashBytes: 0, overSince: NOW }, A, NOW), 'blocked');
  assert.equal(trashPurgeAt(NOW), NOW + 30 * DAY);
});

test('upload check: size limit, quota with grace, department and member caps', () => {
  const base = { plan: 'nova' as const, allowance: 100 * GiB, now: NOW };
  assert.equal(checkUpload({ ...base, size: 60 * GiB, usage: { liveBytes: 0, trashBytes: 0 } }).ok, false); // > 50 GB file limit
  assert.equal(checkUpload({ ...base, size: 5 * GiB, usage: { liveBytes: 90 * GiB, trashBytes: 0 } }).ok, true);
  const graceOk = checkUpload({ ...base, size: 8 * GiB, usage: { liveBytes: 99 * GiB, trashBytes: 0 } });
  assert.deepEqual([graceOk.ok, graceOk.state], [true, 'grace']);
  const tooFar = checkUpload({ ...base, size: 20 * GiB, usage: { liveBytes: 99 * GiB, trashBytes: 0 } });
  assert.equal(!tooFar.ok && tooFar.reason, 'over_quota');
  const dept = checkUpload({ ...base, size: 2 * GiB, usage: { liveBytes: 0, trashBytes: 0 }, department: { used: 9 * GiB, cap: 10 * GiB } });
  assert.equal(!dept.ok && dept.reason, 'department_cap');
  const mem = checkUpload({ ...base, size: 2 * GiB, usage: { liveBytes: 0, trashBytes: 0 }, member: { used: 1 * GiB, cap: 2 * GiB } });
  assert.equal(!mem.ok && mem.reason, 'member_cap');
});

test('transfers: per-plan limits and retention folder', () => {
  assert.deepEqual(checkTransfer('free', { totalBytes: 2 * GiB, days: 7 }), { ok: true, folder: 7 });
  assert.equal(checkTransfer('free', { totalBytes: 4 * GiB, days: 7 }).ok, false);
  assert.equal(checkTransfer('free', { totalBytes: GiB, days: 7, password: true }).ok, false);
  assert.deepEqual(checkTransfer('glow', { totalBytes: 40 * GiB, days: 14, password: true }), { ok: true, folder: 30 });
  assert.equal(checkTransfer('glow', { totalBytes: GiB, days: 60 }).ok, false);
  assert.deepEqual(checkTransfer('studio_max', { totalBytes: 200 * GiB, days: 200 }), { ok: true, folder: 365 });
});

test('keys: no names in keys, round-trip parse, bad ids refused, lifecycle per folder', () => {
  const k = driveKey({ kind: 'o', id: 'org_12345678' }, 'file_abcdefgh', 3);
  assert.equal(k, 'drive/o/org_12345678/file_abcdefgh/v3');
  assert.deepEqual(parseDriveOrTransferKey(k), { area: 'drive', kind: 'o', ownerId: 'org_12345678', fileId: 'file_abcdefgh', version: 3 });
  const t = transferKey(30, 'tr_abcdefgh', 'f_12345678');
  assert.deepEqual(parseDriveOrTransferKey(t), { area: 'transfers', folder: 30, transferId: 'tr_abcdefgh', fileId: 'f_12345678' });
  assert.throws(() => driveKey({ kind: 'u', id: '../x' }, 'file_abcdefgh', 1));
  assert.equal(parseDriveOrTransferKey('drive/u/../../etc'), null);
  const rules = transferLifecycleRules();
  assert.equal(rules.length, 4);
  assert.ok(rules.every(r => r.fileNamePrefix.startsWith('transfers/') && r.daysFromUploadingToHiding > 7 - 1));
  assert.ok(!rules.some(r => r.fileNamePrefix.startsWith('drive/')), 'Drive is never auto-deleted');
});

test('multipart: small files single PUT, big files resumable parts under 10,000', () => {
  assert.deepEqual(planUpload(10 * 1024 ** 2), { mode: 'single' });
  const p = planUpload(200 * GiB);
  assert.equal(p.mode, 'multipart');
  if (p.mode === 'multipart') {
    assert.ok(p.parts <= MAX_PARTS);
    assert.ok(p.partSize * p.parts >= 200 * GiB);
  }
  assert.throws(() => planUpload(0));
});
