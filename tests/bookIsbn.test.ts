// ISBN validation for the author submission flow (services/bookmeta/isbn.ts).
//
//   npx tsx --test tests/bookIsbn.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIsbn, isbn10To13, isbn10CheckDigit, normalizeIsbn } from '../services/bookmeta/isbn';

test('valid ISBN-13s pass, with or without hyphens and the ISBN prefix', () => {
  for (const v of ['9780306406157', '978-0-306-40615-7', 'ISBN 978-0-306-40615-7', 'isbn-13: 978 0 306 40615 7', '9781861972712', '9791090636071']) {
    const r = checkIsbn(v);
    assert.equal(r.valid, true, v);
    assert.equal(r.kind, 'ISBN-13');
  }
});

test('a wrong check digit or a transposition is caught with a useful reason', () => {
  const bad = checkIsbn('9780306406158');
  assert.equal(bad.valid, false);
  assert.match(bad.reason!, /expected 7/);
  assert.equal(checkIsbn('9780306406517').valid, false); // two digits swapped
});

test('prefix and length rules', () => {
  assert.match(checkIsbn('9770306406152').reason!, /978 or 979/);
  assert.equal(checkIsbn('978030640615').valid, false);
  assert.equal(checkIsbn('').valid, false);
  assert.equal(checkIsbn('abc').valid, false);
});

test('ISBN-10 (including an X check character) is accepted and converted to ISBN-13', () => {
  const a = checkIsbn('0-306-40615-2');
  assert.equal(a.valid, true);
  assert.equal(a.kind, 'ISBN-10');
  assert.equal(a.isbn13, '9780306406157');
  const x = checkIsbn('080442957X');
  assert.equal(x.valid, true);
  assert.equal(x.isbn13, '9780804429573');
  assert.equal(checkIsbn('0306406153').valid, false);
});

test('helpers', () => {
  assert.equal(isbn10CheckDigit('080442957'), 'X');
  assert.equal(isbn10To13('0306406152'), '9780306406157');
  assert.equal(isbn10To13('0306406153'), null);
  assert.equal(normalizeIsbn('ISBN: 978-0-306-40615-7 '), '9780306406157');
});
