import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_CREATIVE_STORAGE_BYTES,
  GiB,
  creativeLimitBytes,
  creativePrefixes,
  evaluateCreativeQuota,
  quotaClassOf,
  tallyUsage,
} from '../services/creativeCloud/policy';
import { DAY, HOUR, MIN, shouldCheckpoint, versionsToPrune, type VersionStub } from '../services/creativeCloud/history';

test('free accounts get 5 GB; Plajah+ gets its tier storage', () => {
  assert.equal(creativeLimitBytes(null), 5 * GiB);
  assert.equal(creativeLimitBytes({ active: false, tier: 3 }), FREE_CREATIVE_STORAGE_BYTES);
  assert.equal(creativeLimitBytes({ active: true, tier: 2 }), 75 * GiB);
  assert.equal(creativeLimitBytes({ active: true, storageLimitGb: 100 }), 100 * GiB);
});

test('music projects and film are exempt; on-platform creative work counts', () => {
  assert.equal(quotaClassOf('melos'), 'exempt');
  assert.equal(quotaClassOf('fabula'), 'exempt');
  for (const k of ['tela', 'comic', 'anima', 'script', 'design', 'something-new']) assert.equal(quotaClassOf(k), 'counted');
  const t = tallyUsage([
    { kind: 'tela', size: 100 },
    { kind: 'comic', size: 50 },
    { kind: 'melos', size: 1000 },
    { kind: 'fabula', size: 7 },
  ]);
  assert.deepEqual(t, { countedBytes: 150, exemptBytes: 1007, byKind: { tela: 100, comic: 50, melos: 1000, fabula: 7 } });
});

test('releases live outside measured prefixes', () => {
  const prefixes = creativePrefixes('u1').map((p) => p.prefix);
  for (const releasePath of ['albums/a1/track.mp3', 'videos/v1/master.mp4', 'personal/u1/music/x.flac']) {
    assert.ok(!prefixes.some((p) => releasePath.startsWith(p)), releasePath);
  }
  const creative = creativePrefixes('u1')[0];
  assert.equal(creative.kindFromPath('personal/u1/creative/comic/showcase-x/r3.json.gz'), 'comic');
});

test('quota is measured but never blocks while enforcement is off', () => {
  const over = { kind: 'tela', usedBytes: 5 * GiB, incomingBytes: 10, limitBytes: 5 * GiB };
  assert.deepEqual(
    { ...evaluateCreativeQuota({ ...over, enforced: false }), percentAfter: 0 },
    { allowed: true, wouldExceed: true, usedAfterBytes: 5 * GiB + 10, limitBytes: 5 * GiB, percentAfter: 0 }
  );
  assert.equal(evaluateCreativeQuota({ ...over, enforced: true }).allowed, false);
  // Exempt kinds never move the needle, enforced or not.
  const music = evaluateCreativeQuota({ ...over, kind: 'melos', enforced: true });
  assert.equal(music.allowed, true);
  assert.equal(music.wouldExceed, false);
});

test('autosave checkpoints at most every 10 minutes', () => {
  assert.equal(shouldCheckpoint(undefined, 1000), true);
  assert.equal(shouldCheckpoint(0, 9 * MIN), false);
  assert.equal(shouldCheckpoint(0, 10 * MIN), true);
});

test('retention thins checkpoints by age and never prunes pinned versions', () => {
  const now = 100 * DAY;
  const v = (id: string, ago: number, reason: VersionStub['reason'] = 'checkpoint'): VersionStub => ({ id, createdAt: now - ago, reason });
  const versions = [
    v('recent1', 10 * MIN),
    v('recent2', 70 * MIN),
    v('h-a', 5 * HOUR + 10 * MIN),
    v('h-b', 5 * HOUR + 40 * MIN), // same hour as h-a → pruned
    v('d-a', 5 * DAY + 2 * HOUR),
    v('d-b', 5 * DAY + 6 * HOUR), // same day → pruned
    v('old-a', 60 * DAY),
    v('old-b', 60 * DAY + HOUR), // same week → pruned
    v('named', 61 * DAY, 'named'),
    v('device', 5 * HOUR + 45 * MIN, 'other-device'),
  ];
  assert.deepEqual(versionsToPrune(versions, now).sort(), ['d-b', 'h-b', 'old-b']);
});
