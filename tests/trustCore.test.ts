import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTrust, TIER_LIMITS, tierAtLeast, hasOrganicGraph, BASIC_MIN_AGE_VERIFIED_MS, BASIC_MIN_AGE_UNVERIFIED_MS, TRUSTED_MIN_AGE_MS } from '../services/trust/trustCore';
import { limitFor, tierFor, tryConsume, registerTrustSignalProvider, NEW_ACCOUNT_LIMITS, ESTABLISHED_LIMITS, NEW_ACCOUNT_AGE_MS } from '../services/socialRateLimit';
import { serverSpamCheck, profileCreatedMs } from '../services/trust/serverSpamGate';

const DAY = 86_400_000;

test('brand-new unverified account is NEW with NEW limits', () => {
  const t = computeTrust({ accountAgeMs: 60_000, providers: ['password'] });
  assert.equal(t.tier, 'NEW');
  assert.deepEqual(t.limits, TIER_LIMITS.NEW);
  assert.equal(t.restricted, false);
});

test('verified email or OAuth reaches BASIC after 2 days; unverified after 7', () => {
  assert.equal(computeTrust({ accountAgeMs: BASIC_MIN_AGE_VERIFIED_MS + 1, emailVerified: true }).tier, 'BASIC');
  assert.equal(computeTrust({ accountAgeMs: BASIC_MIN_AGE_VERIFIED_MS + 1, providers: ['google.com'] }).tier, 'BASIC');
  assert.equal(computeTrust({ accountAgeMs: BASIC_MIN_AGE_VERIFIED_MS + 1, providers: ['password'] }).tier, 'NEW');
  assert.equal(computeTrust({ accountAgeMs: BASIC_MIN_AGE_UNVERIFIED_MS + 1, providers: ['password'] }).tier, 'BASIC');
});

test('TRUSTED needs tenure + identity + organic graph + clean record', () => {
  const base = { accountAgeMs: TRUSTED_MIN_AGE_MS + DAY, emailVerified: true, followerCount: 12, mutualFollowCount: 4 };
  assert.equal(computeTrust(base).tier, 'TRUSTED');
  assert.equal(computeTrust({ ...base, mutualFollowCount: 0, followerCount: 3 }).tier, 'BASIC'); // no graph
  assert.equal(computeTrust({ ...base, emailVerified: false }).tier, 'BASIC');                    // no identity
  assert.equal(computeTrust({ ...base, upheldReports: 1 }).tier, 'BASIC');                         // blemished
  assert.equal(computeTrust({ ...base, accountAgeMs: 10 * DAY }).tier, 'BASIC');                   // too young
});

test('follower graph: bought followers with no mutuals are not organic', () => {
  assert.equal(hasOrganicGraph({ followerCount: 5000, mutualFollowCount: 0 }), false);
  assert.equal(hasOrganicGraph({ followerCount: 30, mutualFollowCount: 1 }), true);
  assert.equal(hasOrganicGraph({ qualityFollowerCount: 5 }), true);
});

test('VERIFIED_CREATOR comes only from the server flag and loses to an active sanction', () => {
  assert.equal(computeTrust({ accountAgeMs: DAY, verifiedCreator: true }).tier, 'VERIFIED_CREATOR');
  const s = computeTrust({ accountAgeMs: 400 * DAY, verifiedCreator: true, activeSanction: true });
  assert.equal(s.tier, 'NEW');
  assert.equal(s.restricted, true);
  assert.equal(s.limits.canCreateGroups, false);
});

test('3+ upheld reports restrict an old account; anonymous is NEW but not restricted', () => {
  const r = computeTrust({ accountAgeMs: 400 * DAY, emailVerified: true, upheldReports: 3 });
  assert.equal(r.tier, 'NEW'); assert.equal(r.restricted, true);
  const a = computeTrust({ accountAgeMs: 400 * DAY, isAnonymous: true });
  assert.equal(a.tier, 'NEW'); assert.equal(a.restricted, false);
});

test('a prior sanction delays BASIC until 30 days of tenure', () => {
  assert.equal(computeTrust({ accountAgeMs: 10 * DAY, emailVerified: true, priorSanctions: 1 }).tier, 'NEW');
  assert.equal(computeTrust({ accountAgeMs: 31 * DAY, emailVerified: true, priorSanctions: 1 }).tier, 'BASIC');
});

test('limits grow monotonically with tier', () => {
  const order = ['NEW', 'BASIC', 'TRUSTED', 'VERIFIED_CREATOR'] as const;
  for (let i = 1; i < order.length; i++) {
    const a = TIER_LIMITS[order[i - 1]], b = TIER_LIMITS[order[i]];
    assert.ok(b.linksPerPost >= a.linksPerPost && b.dmsToNonFollowersPerDay >= a.dmsToNonFollowersPerDay && b.followsPerHour >= a.followsPerHour && b.maxGroupSize >= a.maxGroupSize);
  }
  assert.ok(tierAtLeast('TRUSTED', 'BASIC'));
  assert.ok(!tierAtLeast('NEW', 'BASIC'));
});

test('socialRateLimit uses trust tiers (age-only fallback preserves the old 7-day rule)', () => {
  registerTrustSignalProvider(null);
  assert.equal(NEW_ACCOUNT_AGE_MS, 7 * DAY);
  assert.deepEqual(limitFor('post', 3 * DAY), NEW_ACCOUNT_LIMITS.post);
  assert.deepEqual(limitFor('post', 3 * DAY, { emailVerified: true }), ESTABLISHED_LIMITS.post); // verified human leaves NEW sooner
  assert.equal(tierFor(Infinity), 'BASIC');           // unknown creation → never punished
  assert.equal(tierFor(NaN), 'NEW');
  const trusted = { emailVerified: true, followerCount: 20, mutualFollowCount: 5 };
  assert.equal(limitFor('follow', 60 * DAY, trusted).max, TIER_LIMITS.TRUSTED.followsPerHour);
  assert.equal(limitFor('dm_cold', 1000).max, NEW_ACCOUNT_LIMITS.dm_cold.max);
  assert.equal(limitFor('follow', 60 * DAY, { activeSanction: true }).max, 10);
});

test('tryConsume consults the registered signal provider', () => {
  const mem: Record<string, string> = {};
  const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const now = 10 * DAY;
  const created = now - 3 * DAY; // 3 days old: NEW unverified, BASIC verified
  registerTrustSignalProvider(() => ({ emailVerified: true }));
  let ok = 0;
  for (let i = 0; i < 25; i++) if (tryConsume('verified', 'dm_cold', created, now + i * 3_000, store).ok) ok++;
  assert.equal(ok, ESTABLISHED_LIMITS.dm_cold.max);
  registerTrustSignalProvider(null);
  ok = 0;
  for (let i = 0; i < 25; i++) if (tryConsume('unverified', 'dm_cold', created, now + i * 11_000, store).ok) ok++;
  assert.equal(ok, NEW_ACCOUNT_LIMITS.dm_cold.max);
});

test('server spam gate blocks floods/dupes and NEW-tier link spam, allows normal posts', () => {
  const now = 100 * DAY;
  assert.equal(serverSpamCheck('Great show last night, thanks everyone!', { now }).block, false);
  assert.equal(serverSpamCheck('aaaaaaaaaaaaaaaaaaaaaaaa', { now }).block, true);
  const links = 'x https://a.com y https://b.com';
  assert.equal(serverSpamCheck(links, { accountCreatedMs: now - 60_000, now }).block, true);  // NEW: 1 link max, blocks
  assert.equal(serverSpamCheck(links, { accountCreatedMs: now - 30 * DAY, now }).block, false); // BASIC: allowed
  assert.equal(serverSpamCheck('buy now cheap', { recentTexts: ['Buy now, cheap!'], now }).block, true);
  assert.equal(profileCreatedMs({ createdAt: 1_700_000_000 }), 1_700_000_000_000);
  assert.equal(profileCreatedMs({ joinedAt: '2026-01-01T00:00:00Z' }), Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(profileCreatedMs({ createdAt: { seconds: 5 } }), 5000);
  assert.equal(profileCreatedMs(null), null);
});
