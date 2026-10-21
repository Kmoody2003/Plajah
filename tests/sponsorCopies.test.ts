// Sponsored + gift copies — pure rules (services/sponsorCopies/model.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { checkPoolRequest, codeFromBytes, normalizeCode, seatsLeft, sponsorLine, unclaimedRefundCents, MAX_COPIES } from '../services/sponsorCopies/model';

test('pool requests: modes, quantities, and DIRECT recipients (deduped, quantity = people)', () => {
  assert.equal(checkPoolRequest({ bookId: 'b', mode: 'OPEN', quantity: 0 }).ok, false);
  assert.equal(checkPoolRequest({ bookId: 'b', mode: 'OPEN', quantity: MAX_COPIES + 1 }).ok, false);
  assert.equal(checkPoolRequest({ bookId: 'b', mode: 'NOPE', quantity: 3 }).ok, false);
  assert.equal(checkPoolRequest({ bookId: 'a/b', mode: 'OPEN', quantity: 3 }).ok, false, 'no path tricks in ids');
  const open = checkPoolRequest({ bookId: 'b', mode: 'OPEN', quantity: 12 });
  assert.ok(open.ok && open.value.quantity === 12 && open.value.showOnBookPage === true);
  const direct = checkPoolRequest({ bookId: 'b', mode: 'DIRECT', quantity: 99, recipients: [
    { uid: 'user_abc123' }, { email: 'A@Example.com ' }, { email: 'a@example.com' }, { email: 'not-an-email' }, { uid: 'user_abc123' },
  ] });
  assert.ok(direct.ok);
  if (direct.ok) {
    assert.equal(direct.value.quantity, 2);
    assert.deepEqual(direct.value.recipients, [{ uid: 'user_abc123' }, { email: 'a@example.com' }]);
    assert.equal(direct.value.showOnBookPage, false, 'only OPEN pools are listed');
  }
  assert.equal(checkPoolRequest({ bookId: 'b', mode: 'DIRECT', recipients: [] }).ok, false);
  assert.equal(checkPoolRequest({ bookId: 'b', mode: 'CODES', quantity: 5, as: { kind: 'org' } }).ok, false, 'org purchase needs the org id');
});

test('claim codes: readable alphabet, forgiving input, strict validation', () => {
  for (let i = 0; i < 200; i++) {
    const c = codeFromBytes(randomBytes(10));
    assert.match(c, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(normalizeCode(c.toLowerCase().replace('-', ' ')), c);
  }
  assert.equal(normalizeCode('ABCDE-FGHJ'), null, 'too short');
  assert.equal(normalizeCode('ABCDE-FGHJ0'), null, '0 is not in the alphabet');
  assert.equal(normalizeCode(undefined), null);
});

test('seats, refunds and the public line', () => {
  const p = { quantity: 10, claimed: 3, refundedSeats: 0, unitPriceCents: 499, mode: 'OPEN' as const, sponsorName: 'Acme Library' };
  assert.equal(seatsLeft(p), 7);
  assert.equal(unclaimedRefundCents(p), 7 * 499);
  assert.equal(sponsorLine(p), 'Acme Library is giving away 7 free copies');
  assert.equal(seatsLeft({ ...p, refundedSeats: 7 }), 0, 'refunded seats are gone');
  assert.equal(sponsorLine({ ...p, claimed: 10 }), 'Acme Library gave away 10 copies');
  assert.equal(sponsorLine({ ...p, mode: 'DIRECT' }), 'Acme Library sent you this book');
});
