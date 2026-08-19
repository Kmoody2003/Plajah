import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentHqEntitlements } from '../services/contentHqEntitlements';

test('all Content HQ tiers keep unlimited projects', () => {
  const free = resolveContentHqEntitlements({});
  const plus = resolveContentHqEntitlements({ subscription: { status: 'active', storageLimitGb: 75 } });
  const org = resolveContentHqEntitlements({ organization: { id: 'org', orgType: 'NONPROFIT' } as any });
  assert.equal(free.unlimitedProjects, true);
  assert.equal(plus.unlimitedProjects, true);
  assert.equal(org.unlimitedProjects, true);
});

test('active Plajah+ gets Pro collaboration while retaining subscription storage and user branding', () => {
  const result = resolveContentHqEntitlements({ subscription: { status: 'active', storageLimitGb: 50 } });
  assert.equal(result.plan, 'PLAJAH_PLUS_PRO');
  assert.equal(result.storageLimitGb, 50);
  assert.equal(result.approvals, true);
  assert.equal(result.customBranding, false);
  assert.equal(result.organizationControls, false);
  assert.equal(result.brandSource, 'USER_PROFILE');
});

test('organization identities receive Pro collaboration and org controls by default', () => {
  const result = resolveContentHqEntitlements({ organization: { id: 'org', orgType: 'BUSINESS' } as any });
  assert.equal(result.plan, 'ORGANIZATION_PRO');
  assert.equal(result.collaboration, true);
  assert.equal(result.organizationControls, true);
  assert.equal(result.brandSource, 'ORGANIZATION');
  assert.equal(result.customBranding, false);
});

test('inactive Plajah+ does not grant Pro collaboration', () => {
  const result = resolveContentHqEntitlements({ subscription: { status: 'canceled', storageLimitGb: 100 } });
  assert.equal(result.plan, 'FREE');
  assert.equal(result.collaboration, false);
});
