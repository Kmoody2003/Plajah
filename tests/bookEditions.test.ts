// Edition/update policy + licence ledger (services/bookEditions/policy.ts, services/ledger/licenseLedger.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVersion, emptyRegistry, entitledEditions, readRegistry, stampVersion, type BookVersionStamp, type EditionRegistry } from '../services/bookEditions/policy';
import { GENESIS, makeEntry, verifyChain, type LedgerEntry } from '../services/ledger/licenseLedger';

/** Publish a sequence of releases the way the server does, returning the stamps + final registry. */
function publish(steps: Array<Parameters<typeof stampVersion>[4]>): { versions: BookVersionStamp[]; registry: EditionRegistry } {
  let registry = emptyRegistry(0);
  const versions: BookVersionStamp[] = [];
  steps.forEach((u, i) => {
    const r = stampVersion(registry, versions, `v${i + 1}`, (i + 1) * 100, u);
    versions.push(r.stamp); registry = r.registry;
  });
  return { versions, registry };
}
const ids = (vs: BookVersionStamp[]) => vs.map(v => v.versionId);

test('stamping: first release is INITIAL/edition 1; updates stay in the edition; a new edition bumps it', () => {
  const { versions, registry } = publish([null, { kind: 'CORRECTION', notes: 'typos' }, { kind: 'NEW_EDITION', upgrade: 'PAID', upgradePrice: 2.5, editionLabel: 'Revised' }, { kind: 'MINOR' }]);
  assert.deepEqual(versions.map(v => [v.versionId, v.edition, v.kind]), [['v1', 1, 'INITIAL'], ['v2', 1, 'CORRECTION'], ['v3', 2, 'NEW_EDITION'], ['v4', 2, 'MINOR']]);
  assert.equal(registry.current, 2);
  assert.deepEqual(registry.freeEditions, [1], 'a paid edition is not in freeEditions');
  assert.equal(registry.list[1].upgradePrice, 2.5);
  // A "paid" edition without a price is free.
  assert.deepEqual(publish([null, { kind: 'NEW_EDITION', upgrade: 'PAID' }]).registry.freeEditions, [1, 2]);
});

test('buyer of edition 1 follows corrections, stops at a PAID edition 2, and is offered the upgrade', () => {
  const { versions, registry } = publish([null, { kind: 'CORRECTION' }, { kind: 'NEW_EDITION', upgrade: 'PAID', upgradePrice: 3 }, { kind: 'MINOR' }]);
  const lic = { issuedAt: 150, editions: [1], versionAtPurchase: 'v1' };
  const c = chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: lic });
  assert.equal(c.version?.versionId, 'v2', 'latest correction within their edition');
  assert.deepEqual(ids(c.readable), ['v2', 'v1']);
  assert.equal(c.purchased?.versionId, 'v1', 'the version they bought');
  assert.equal(c.upgradeOffer?.number, 2);
  // After buying the upgrade they follow edition 2 and keep edition 1 for rollback.
  const up = chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: { ...lic, editions: [1, 2] } });
  assert.equal(up.version?.versionId, 'v4');
  assert.equal(up.upgradeOffer, null);
  assert.deepEqual(ids(up.readable), ['v4', 'v3', 'v2', 'v1']);
});

test('a FREE new edition reaches every owner; rollback is honoured only for versions they may read', () => {
  const { versions, registry } = publish([null, { kind: 'NEW_EDITION', upgrade: 'FREE' }, { kind: 'CORRECTION' }]);
  const lic = { issuedAt: 120, editions: [1] };
  const c = chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: lic });
  assert.equal(c.version?.versionId, 'v3');
  assert.equal(c.followLatest, true);
  const back = chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: lic, preferredVersionId: 'v1' });
  assert.deepEqual([back.version?.versionId, back.followLatest], ['v1', false]);
  // A preference for a version outside their editions is ignored.
  const paid = publish([null, { kind: 'NEW_EDITION', upgrade: 'PAID', upgradePrice: 1 }]);
  const sneaky = chooseVersion({ ...paid, isOwner: false, isPaid: true, license: lic, preferredVersionId: 'v2' });
  assert.deepEqual([sneaky.version?.versionId, sneaky.followLatest], ['v1', true]);
});

test('owners and free books follow the newest of any edition; revoked, expired or missing licences read nothing', () => {
  const { versions, registry } = publish([null, { kind: 'NEW_EDITION', upgrade: 'PAID', upgradePrice: 2 }]);
  assert.equal(chooseVersion({ versions, registry, isOwner: true, isPaid: true }).version?.versionId, 'v2');
  assert.equal(chooseVersion({ versions, registry, isOwner: false, isPaid: false }).version?.versionId, 'v2');
  assert.equal(chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: null }).version, null);
  assert.equal(chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: { issuedAt: 1, revokedAt: 5 } }).version, null);
  assert.equal(chooseVersion({ versions, registry, isOwner: false, isPaid: true, license: { issuedAt: 1, expiresAt: 5 }, now: 10 }).version, null);
  // Legacy licence (no editions list) = edition 1.
  assert.deepEqual([...entitledEditions({ issuedAt: 1 }, registry)].sort(), [1]);
});

test('readRegistry tolerates missing and partial data', () => {
  assert.deepEqual(readRegistry(undefined), { current: 1, list: [{ number: 1, publishedAt: 0, upgrade: 'FREE' }], freeEditions: [1] });
  const r = readRegistry({ list: [{ number: 2, publishedAt: 5, upgrade: 'PAID', upgradePrice: 1 }] });
  assert.equal(r.current, 2);
  assert.deepEqual(r.freeEditions, [1]);
});

test('ledger: a chain verifies, and any edit, deletion or reorder is detected', () => {
  const chain: LedgerEntry[] = [];
  let prev = GENESIS;
  const bodies = [
    { event: 'VERSION_PUBLISHED' as const, workKind: 'book', workId: 'b1', at: 1, actorUid: 'author', edition: 1, versionId: 'v1' },
    { event: 'MINT' as const, workKind: 'book', workId: 'b1', at: 2, subjectUid: 'reader', editions: [1], priceCents: 499, paymentRef: 'pi_1' },
    { event: 'EDITION_UPGRADE' as const, workKind: 'book', workId: 'b1', at: 3, subjectUid: 'reader', edition: 2, editions: [1, 2] },
  ];
  bodies.forEach((b, i) => { const e = makeEntry(b, i + 1, prev); chain.push(e); prev = e.hash; });
  assert.deepEqual(verifyChain(chain), { ok: true, length: 3, head: prev });
  assert.equal(verifyChain([...chain].reverse()).ok, true, 'order of the input does not matter');
  assert.match(verifyChain([chain[0], { ...chain[1], priceCents: 1 }, chain[2]]).problem!, /#2 was altered/);
  assert.match(verifyChain([chain[0], chain[2]]).problem!, /missing entry/);
  const forged = makeEntry(bodies[1], 2, 'f'.repeat(64));
  assert.match(verifyChain([chain[0], forged, chain[2]]).problem!, /does not follow/);
  assert.equal(makeEntry({ ...bodies[0], note: '' }, 1, GENESIS).hash, chain[0].hash, 'empty fields do not change the hash');
});
