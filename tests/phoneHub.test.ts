import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDial, phoneKey, samePhone, formatPhone, keypadMatches, t9Digits } from '../services/phone/phoneNumber';
import { mergeContacts, matchPlajah, nameForNumber, dedupePhones, sectionLetter, type DeviceContact } from '../services/phone/contactsMerge';

test('cleanDial keeps + digits * #', () => {
  assert.equal(cleanDial(' +1 (313) 555-0142 '), '+13135550142');
  assert.equal(cleanDial('*#06#'), '*#06#');
});

test('phoneKey canonicalises NANP, intl and short codes', () => {
  assert.equal(phoneKey('(313) 555-0142'), '+13135550142');
  assert.equal(phoneKey('1-313-555-0142'), '+13135550142');
  assert.equal(phoneKey('+44 20 7946 0958'), '+442079460958');
  assert.equal(phoneKey('0044 20 7946 0958'), '+442079460958');
  assert.equal(phoneKey('011 44 20 7946 0958'), '+442079460958');
  assert.equal(phoneKey('22000'), '22000');
});

test('samePhone matches format variants, not different lines', () => {
  assert.ok(samePhone('313.555.0142', '+1 313 555 0142'));
  assert.ok(samePhone('3135550142', '13135550142'));
  assert.ok(!samePhone('3135550142', '3135550143'));
  assert.ok(!samePhone('', '3135550142'));
});

test('formatPhone formats as typed', () => {
  assert.equal(formatPhone('313'), '313');
  assert.equal(formatPhone('3135'), '(313) 5');
  assert.equal(formatPhone('3135550142'), '(313) 555-0142');
  assert.equal(formatPhone('+13135550142'), '+1 (313) 555-0142');
  assert.equal(formatPhone('+442079460958'), '+442 079 460 958');
});

test('T9 keypad search hits names and numbers', () => {
  assert.equal(t9Digits('Ann B'), '266 2');
  assert.ok(keypadMatches('266', 'Ann Brown', []));
  assert.ok(keypadMatches('27696', 'Ann Brown', []));   // second word "Brown"
  assert.ok(keypadMatches('5550', 'Zed', ['313-555-0142']));
  assert.ok(!keypadMatches('9', 'Ann', ['111']));
});

const contact = (id: string, name: string, phones: string[], emails: string[] = [], starred = false): DeviceContact => ({
  id, displayName: name, starred, phones: phones.map(number => ({ number })), emails: emails.map(address => ({ address })),
});

test('matchPlajah prefers email, falls back to phone', () => {
  const people = [
    { uid: 'u1', displayName: 'Phone Match', phone: '+1 313 555 0142' },
    { uid: 'u2', displayName: 'Email Match', email: 'Ann@Example.com' },
  ];
  assert.equal(matchPlajah(contact('1', 'Ann', ['3135550142'], ['ann@example.com']), people)?.uid, 'u2');
  assert.equal(matchPlajah(contact('2', 'Bo', ['(313) 555-0142']), people)?.uid, 'u1');
  assert.equal(matchPlajah(contact('3', 'Cy', ['999']), people), undefined);
});

test('mergeContacts joins, keeps unmatched people, sorts favourites first', () => {
  const merged = mergeContacts(
    [contact('1', 'zoe', ['3135550142']), contact('2', 'Al', ['3135550100'], [], true)],
    [{ uid: 'u1', displayName: 'Zoe P', phone: '+13135550142', photoURL: 'p.png' }, { uid: 'u9', displayName: 'Bea' }],
  );
  assert.deepEqual(merged.map(m => m.key), ['d:2', 'p:u9', 'd:1']);
  const zoe = merged.find(m => m.key === 'd:1')!;
  assert.equal(zoe.plajah?.uid, 'u1');
  assert.equal(zoe.photoUrl, 'p.png');
  assert.deepEqual(zoe.phones, ['3135550142']); // same line not duplicated
  assert.equal(sectionLetter(merged[0]), '★');
  assert.equal(sectionLetter(zoe), 'Z');
  assert.equal(nameForNumber('+1 313-555-0100', merged)?.name, 'Al');
});

test('a Plajah person is matched to at most one contact', () => {
  const merged = mergeContacts(
    [contact('1', 'A', ['3135550142']), contact('2', 'B', ['313 555 0142'])],
    [{ uid: 'u1', phone: '3135550142' }],
  );
  assert.equal(merged.filter(m => m.plajah?.uid === 'u1').length, 1);
});

test('dedupePhones', () => {
  assert.deepEqual(dedupePhones(['313-555-0142', '+13135550142', '', '22000']), ['313-555-0142', '22000']);
});

test('displayPhone keeps short codes raw', async () => {
  const { displayPhone } = await import('../services/phone/phoneNumber');
  assert.equal(displayPhone('22395'), '22395');
  assert.equal(displayPhone('3135550142'), '(313) 555-0142');
});
