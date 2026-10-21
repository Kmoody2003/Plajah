// Business staff seats — Test Suite
// Run with: npm run test:bizstaff
//
// Pins the pure seat contract (services/businessStaffCore.ts) and the server helpers the
// /api/business/staff router is built from (services/businessStaffServerCore.ts).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  accessFor, tabAllowed, can, registerPermsFor, normalizePerms, normalizeInviteCode, makeInviteCode,
  DEFAULT_PERMS, ALL_BIZ_PERMS, INVITE_TTL_MS, seatDefaultsForPackRole, type StaffSeat,
} from '../services/businessStaffCore';
import {
  validateInvite, inviteDocId, inviteSummary, withSeat, withoutSeat, unionPerms, ownerStaffIndex, staffActorInfo,
  seatPerms, asSeatRole, isSeated, type StaffInviteDoc, type SeatPageShape,
} from '../services/businessStaffServerCore';
import { casUpdate, memoryCasStore } from '../services/casCore';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const seat = (uid: string, perms = DEFAULT_PERMS.STAFF, extra: Partial<StaffSeat> = {}): StaffSeat =>
  ({ uid, name: `N-${uid}`, role: 'STAFF', perms, addedAt: NOW, addedBy: 'own', ...extra });
const invite = (o: Partial<StaffInviteDoc> = {}): StaffInviteDoc => ({
  pageId: 'p1', ownerUid: 'own', businessName: 'Corner Shop', role: 'STAFF', perms: DEFAULT_PERMS.STAFF,
  createdBy: 'own', createdAt: NOW, expiresAt: NOW + INVITE_TTL_MS, ...o,
});

describe('businessStaffCore', () => {
  test('accessFor: owner gets everything, seated staff get seat perms, others nothing', () => {
    const page = { ownerId: 'own', staffUids: ['s1'], staffSeats: { s1: seat('s1', ['ORDERS', 'BOGUS' as any, 'CRM']) } };
    assert.deepEqual(accessFor(page, 'own'), { kind: 'owner', perms: ALL_BIZ_PERMS });
    const s = accessFor(page, 's1');
    assert.equal(s.kind, 'staff');
    assert.deepEqual(s.perms, ['ORDERS', 'CRM']);
    assert.equal(accessFor(page, 'x').kind, 'none');
    assert.equal(accessFor(null, 'own').kind, 'none');
    assert.equal(accessFor(page, null).kind, 'none');
  });
  test('accessFor: a seat without staffUids membership does not count', () => {
    const page = { ownerId: 'own', staffUids: [], staffSeats: { s1: seat('s1') } };
    assert.equal(accessFor(page, 's1').kind, 'none');
  });
  test('tabAllowed: owner-only tabs stay closed, TODAY is open to any staff', () => {
    const page = { ownerId: 'own', staffUids: ['s1'], staffSeats: { s1: seat('s1', ['ORDERS']) } };
    const a = accessFor(page, 's1');
    assert.ok(tabAllowed('TODAY', a));
    assert.ok(tabAllowed('TICKETS', a));
    assert.ok(!tabAllowed('INVENTORY', a));
    assert.ok(!tabAllowed('BILLING', a));
    assert.ok(tabAllowed('BILLING', accessFor(page, 'own')));
    assert.ok(!tabAllowed('TODAY', accessFor(page, 'nobody')));
    assert.ok(can(a, 'ORDERS') && !can(a, 'CRM'));
  });
  test('registerPermsFor maps seat perms onto register names', () => {
    assert.deepEqual(registerPermsFor(['REGISTER']), ['RING_SALES']);
    assert.deepEqual(registerPermsFor(['ORDERS', 'CRM']), []);
    assert.deepEqual(new Set(registerPermsFor(['REFUNDS'])), new Set(['REFUND', 'CLOSE_DRAWER']));
    assert.deepEqual(new Set(registerPermsFor(['REPORTS', 'INVENTORY', 'REFUNDS'])), new Set(['VIEW_REPORTS', 'REFUND', 'CLOSE_DRAWER', 'DISCOUNT_OVERRIDE']));
    assert.ok(!registerPermsFor(['INVENTORY']).includes('DISCOUNT_OVERRIDE'));
    assert.deepEqual(new Set(registerPermsFor(DEFAULT_PERMS.MANAGER)), new Set(['RING_SALES', 'REFUND', 'CLOSE_DRAWER', 'VIEW_REPORTS', 'DISCOUNT_OVERRIDE']));
  });
  test('normalizePerms drops unknowns and duplicates, keeps canonical order', () => {
    assert.deepEqual(normalizePerms(['TEAM', 'REGISTER', 'TEAM', 'nope']), ['REGISTER', 'TEAM']);
    assert.deepEqual(normalizePerms('REGISTER'), []);
  });
  test('normalizeInviteCode folds case, separators and ambiguous letters', () => {
    assert.equal(normalizeInviteCode('abcde-fghjk'), 'ABCDEFGHJK');
    assert.equal(normalizeInviteCode(' o0 il-1 '), '00111');
    assert.equal(normalizeInviteCode(''), '');
    assert.equal(normalizeInviteCode(undefined as any), '');
  });
  test('makeInviteCode: 5-5 grouped, unambiguous alphabet, deterministic for given bytes', () => {
    const code = makeInviteCode(n => new Uint8Array(Array.from({ length: n }, (_, i) => i * 37)));
    assert.match(code, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    assert.equal(code, makeInviteCode(n => new Uint8Array(Array.from({ length: n }, (_, i) => i * 37))));
    assert.equal(normalizeInviteCode(code).length, 10);
    // a code survives normalize (no O/I/L in the alphabet to fold)
    assert.equal(normalizeInviteCode(code), code.replace('-', ''));
  });
  test('seatDefaultsForPackRole: ADMIN/OWNER pack roles become managers', () => {
    assert.equal(seatDefaultsForPackRole({ key: 'GM', label: 'GM', baseRole: 'ADMIN' }).role, 'MANAGER');
    assert.equal(seatDefaultsForPackRole({ key: 'TECH', label: 'Tech', baseRole: 'STAFF' }).role, 'STAFF');
    assert.equal(seatDefaultsForPackRole(null).role, 'STAFF');
  });
});

describe('businessStaffServerCore', () => {
  test('validateInvite states', () => {
    assert.equal(validateInvite(invite(), NOW, 'u1'), 'ok');
    assert.equal(validateInvite(null, NOW, 'u1'), 'missing');
    assert.equal(validateInvite({} as any, NOW, 'u1'), 'missing');
    assert.equal(validateInvite(invite({ expiresAt: NOW - 1 }), NOW, 'u1'), 'expired');
    assert.equal(validateInvite(invite({ expiresAt: NOW }), NOW, 'u1'), 'expired');
    assert.equal(validateInvite(invite({ usedBy: 'u2' }), NOW, 'u1'), 'used');
    assert.equal(validateInvite(invite({ revoked: true }), NOW, 'u1'), 'revoked');
    assert.equal(validateInvite(invite(), NOW, 'own'), 'owner');
    // the same account re-redeeming (repair after a half-failed seat write) is fine, even after expiry
    assert.equal(validateInvite(invite({ usedBy: 'u1', expiresAt: NOW - 1 }), NOW, 'u1'), 'ok');
  });
  test('inviteDocId hashes the canonical code (case/separator/ambiguity-insensitive)', () => {
    assert.equal(inviteDocId('ABCDE-FGH2K'), inviteDocId(' abcde fgh2k '));
    assert.match(inviteDocId('ABCDE-FGH2K'), /^[0-9a-f]{64}$/);
    assert.notEqual(inviteDocId('ABCDE-FGH2K'), inviteDocId('ABCDE-FGH2M'));
  });
  test('inviteSummary carries no creator/owner identifiers', () => {
    const s = inviteSummary(invite({ roleLabel: 'Barista', staffMemberId: 'st1' }));
    assert.deepEqual(Object.keys(s).sort(), ['businessName', 'expiresAt', 'pageId', 'perms', 'role', 'roleLabel']);
  });
  test('seatPerms / asSeatRole', () => {
    assert.deepEqual(seatPerms('MANAGER'), DEFAULT_PERMS.MANAGER);
    assert.deepEqual(seatPerms('STAFF', ['TEAM', 'x']), ['TEAM']);
    assert.deepEqual(seatPerms('STAFF', []), []);
    assert.equal(asSeatRole('MANAGER'), 'MANAGER');
    assert.equal(asSeatRole('OWNER'), 'STAFF');
  });
  test('withSeat / withoutSeat keep staffUids and staffSeats in step', () => {
    const p0: SeatPageShape = { ownerId: 'own', staffUids: ['a'], staffSeats: { a: seat('a') } };
    const p1 = withSeat(p0, seat('b'));
    assert.deepEqual(p1.staffUids, ['a', 'b']);
    assert.ok(isSeated({ ...p0, ...p1 }, 'b'));
    const p2 = withSeat({ ...p0, ...p1 }, seat('a', ['TEAM']));
    assert.deepEqual(p2.staffUids, ['b', 'a']);
    assert.deepEqual(p2.staffSeats.a.perms, ['TEAM']);
    const p3 = withoutSeat({ ...p0, ...p2 }, 'a');
    assert.deepEqual(p3.staffUids, ['b']);
    assert.equal(p3.staffSeats.a, undefined);
    assert.ok(p0.staffSeats!.a, 'input not mutated');
  });
  test('unionPerms / ownerStaffIndex union across the owner pages, ignoring half-seats', () => {
    const pages: SeatPageShape[] = [
      { ownerId: 'own', staffUids: ['a', 'b'], staffSeats: { a: seat('a', ['REGISTER']), b: seat('b', ['CRM']) } },
      { ownerId: 'own', staffUids: ['a'], staffSeats: { a: seat('a', ['TEAM', 'REGISTER']), c: seat('c', ['EVENTS']) } },
    ];
    assert.deepEqual(unionPerms(pages, 'a'), ['REGISTER', 'TEAM']);
    assert.deepEqual(unionPerms(pages, 'c'), []);
    const idx = ownerStaffIndex(pages);
    assert.deepEqual(idx.staffUids, ['a', 'b']);
    assert.deepEqual(idx.staffPerms, { a: ['REGISTER', 'TEAM'], b: ['CRM'] });
    assert.deepEqual(ownerStaffIndex([]), { staffPerms: {}, staffUids: [] });
  });
  test('staffActorInfo: manager anywhere wins, linked roster id surfaces', () => {
    const pages: SeatPageShape[] = [
      { ownerId: 'own', staffUids: ['a'], staffSeats: { a: seat('a', ['REGISTER']) } },
      { ownerId: 'own', staffUids: ['a'], staffSeats: { a: seat('a', ['REGISTER'], { role: 'MANAGER', staffMemberId: 'st9' }) } },
    ];
    assert.deepEqual(staffActorInfo(pages, 'a'), { name: 'N-a', role: 'MANAGER', staffMemberId: 'st9' });
    assert.equal(staffActorInfo(pages, 'zz'), null);
  });
  test('invite claim under CAS: two accounts racing for one code -> exactly one wins', async () => {
    const store = memoryCasStore({ inv: invite() as any });
    const claim = (uid: string) => casUpdate(store, 'inv', cur => {
      const st = validateInvite(cur as any, NOW, uid);
      return st === 'ok' ? { patch: { usedBy: uid, usedAt: NOW }, result: st } : { abort: true, result: st };
    });
    const [a, b] = await Promise.all([claim('u1'), claim('u2')]);
    assert.equal([a, b].filter(x => x.ok).length, 1);
    assert.equal([a, b].find(x => !x.ok)!.result, 'used');
  });
});
