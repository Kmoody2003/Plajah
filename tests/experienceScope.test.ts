import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNavScope, scopeAllowedNav, starterDay, orgAdsOnly, STARTER_DAYS, ORG_ADS_ONLY_DAYS } from '../services/experienceScope';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 23);

describe('experience scope', () => {
  it('existing accounts without a choice keep the full rail', () => {
    assert.equal(resolveNavScope({}, { now }), 'full');
    assert.equal(resolveNavScope(null, { now }), 'full');
  });

  it('Elevate-door accounts are scoped to their org until they choose', () => {
    assert.equal(resolveNavScope({ elevateHome: true }, { now }), 'elevate');
    assert.equal(resolveNavScope({ navScope: 'elevate' }, { now }), 'elevate');
    assert.equal(resolveNavScope({ elevateHome: true, navScope: 'full' }, { now }), 'full');
  });

  it('starter lasts the first week, then opens up', () => {
    const p = { navScope: 'starter' as const, navScopeSince: now - 2 * DAY };
    assert.equal(resolveNavScope(p, { now }), 'starter');
    assert.deepEqual(starterDay(p, now), { day: 3, of: STARTER_DAYS });
    const old = { navScope: 'starter' as const, navScopeSince: now - (STARTER_DAYS + 1) * DAY };
    assert.equal(resolveNavScope(old, { now }), 'full');
    assert.equal(starterDay(old, now), null);
  });

  it('children are never scoped here', () => {
    assert.equal(resolveNavScope({ elevateHome: true, isChild: true }, { now }), 'full');
  });

  it('scopes list only their spaces — no creative tools', () => {
    const starter = scopeAllowedNav('starter')!;
    for (const id of ['FEED', 'MUSIC', 'VIDEOS', 'MOVIES_TV', 'BOOKS', 'PLAJAH_LABS']) assert.ok(starter.has(id), id);
    const elevate = scopeAllowedNav('elevate')!;
    assert.ok(elevate.has('FEED') && elevate.has('USER_PROFILE'));
    for (const id of ['FABULA', 'TV_STUDIO', 'CREATOR', 'PLAJAH_BUILD', 'GAMES']) {
      assert.ok(!starter.has(id) && !elevate.has(id), id);
    }
    assert.equal(scopeAllowedNav('full'), null);
  });

  it('org pages show only org news for the first month', () => {
    assert.equal(orgAdsOnly({ createdAt: now - 3 * DAY }, undefined, now), true);
    assert.equal(orgAdsOnly({ createdAt: now - (ORG_ADS_ONLY_DAYS + 1) * DAY }, undefined, now), false);
    assert.equal(orgAdsOnly({}, now - 40 * DAY, now), false); // falls back to the auth account's creation time
    assert.equal(orgAdsOnly({}, undefined, now), true);       // unknown age → stay quiet
  });
});
