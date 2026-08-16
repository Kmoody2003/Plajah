// serviceNotes — Test Suite
// Run with: npm run test:serviceNotes
//
// The contract: notes the platform generated live apart from the notes the
// member wrote. They must coexist on the same verse, never overwrite each
// other, and group by the day they were heard.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage for node — the store is deliberately local-first.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

const {
  recordServiceNote, serviceNotesFor, serviceNotesForSession, serviceNotesByDay,
  allServiceNotes, migrateLegacyReceipts, forgetSession, verseKeyOf, formatTC,
  mergeNotes, syncServiceNotes, pushSession, pushAllSessions,
} = await import('../services/serviceNotes');

const LEGACY = 'plajah_bible_notes_v1';
const MIGRATED = 'plajah_lectio_service_notes_migrated_v1';

const DAY1 = Date.parse('2026-08-09T10:20:00Z');
const DAY2 = Date.parse('2026-08-14T10:20:00Z');

const note = (refId: string, label: string, tc: number, sessionId: string, at: number) => ({
  verseKey: refId.split('.').slice(0, 3).join(':'),
  refId, label, sessionId, serviceTitle: 'All Things', programTC: tc, at,
});

beforeEach(() => mem.clear());

describe('recording', () => {
  test('stores a passage with its moment', () => {
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY2));
    const [n] = serviceNotesFor('45:8:28');
    assert.equal(n.label, 'Romans 8:28');
    assert.equal(n.programTC, 1453);
    assert.equal(n.serviceTitle, 'All Things');
  });

  test('re-taking the same slide is not a second occasion', () => {
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY2));
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1600, 'svc1', DAY2));
    assert.equal(serviceNotesFor('45:8:28').length, 1);
  });

  test('the same verse in a different service IS a second occasion', () => {
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY1));
    recordServiceNote(note('45.8.28', 'Romans 8:28', 900, 'svc2', DAY2));
    assert.equal(serviceNotesFor('45:8:28').length, 2);
  });
});

describe('THE POINT: generated notes never touch the ones you wrote', () => {
  test('a service note does not overwrite or block an authored note', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ '45:8:28': 'works together WITH — not everything is good' }));
    localStorage.setItem(MIGRATED, '1');   // nothing to migrate here

    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY2));

    const authored = JSON.parse(localStorage.getItem(LEGACY)!);
    assert.equal(authored['45:8:28'], 'works together WITH — not everything is good');
    assert.equal(serviceNotesFor('45:8:28').length, 1, 'both coexist on the same verse');
  });

  test('forgetting a service leaves authored notes alone', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ '45:8:28': 'my own thought' }));
    localStorage.setItem(MIGRATED, '1');
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY2));

    forgetSession('svc1');
    assert.deepEqual(serviceNotesFor('45:8:28'), []);
    assert.equal(JSON.parse(localStorage.getItem(LEGACY)!)['45:8:28'], 'my own thought');
  });
});

describe('migration of receipts an earlier build mixed in', () => {
  test('moves them out of the authored map and keeps real notes there', () => {
    localStorage.setItem(LEGACY, JSON.stringify({
      '45:8:28': 'Heard at 24:13 — All Things',
      '19:23:1': 'Heard at 14:05 — All Things',
      '43:3:16': 'the verb tense here matters',
    }));

    const moved = migrateLegacyReceipts();
    assert.equal(moved, 2);

    const authored = JSON.parse(localStorage.getItem(LEGACY)!);
    assert.deepEqual(Object.keys(authored), ['43:3:16'], 'only the real note remains');

    const moved828 = serviceNotesFor('45:8:28')[0];
    assert.equal(moved828.programTC, 1453, '24:13 parsed back to seconds');
    assert.equal(moved828.serviceTitle, 'All Things');
    assert.equal(moved828.label, 'Romans 8:28');
  });

  test('runs only once', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ '45:8:28': 'Heard at 24:13 — All Things' }));
    assert.equal(migrateLegacyReceipts(), 1);
    assert.equal(migrateLegacyReceipts(), 0);
  });

  test('a note that merely mentions hearing something is not a receipt', () => {
    localStorage.setItem(LEGACY, JSON.stringify({ '45:8:28': 'Heard at church that this means…' }));
    assert.equal(migrateLegacyReceipts(), 0);
    assert.ok(JSON.parse(localStorage.getItem(LEGACY)!)['45:8:28']);
  });
});

describe('grouping by the day they were heard', () => {
  beforeEach(() => {
    recordServiceNote(note('43.1.1', 'John 1:1', 380, 'svc2', DAY2));
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc2', DAY2));
    recordServiceNote(note('19.23.1', 'Psalms 23:1', 845, 'svc1', DAY1));
  });

  test('newest day first, each naming its service', () => {
    const days = serviceNotesByDay();
    assert.equal(days.length, 2);
    assert.equal(days[0].day, '2026-08-14');
    assert.equal(days[1].day, '2026-08-09');
    assert.equal(days[0].serviceTitle, 'All Things');
  });

  test('within a day, passages are in the order they were taught', () => {
    const [today] = serviceNotesByDay();
    assert.deepEqual(today.notes.map(n => n.label), ['John 1:1', 'Romans 8:28']);
  });

  test('one service’s notes are retrievable on their own, in service order', () => {
    assert.deepEqual(serviceNotesForSession('svc2').map(n => n.programTC), [380, 1453]);
    assert.equal(serviceNotesForSession('nope').length, 0);
  });

  test('allServiceNotes spans every service', () => {
    assert.equal(allServiceNotes().length, 3);
  });
});

describe('mergeNotes — the multi-device case', () => {
  const phone = [note('45.8.28', 'Romans 8:28', 1453, 'svc2', DAY2)];
  const tablet = [note('43.1.1', 'John 1:1', 380, 'svc2', DAY2)];

  test('unions rather than overwriting — following on two devices loses nothing', () => {
    const merged = mergeNotes(phone, tablet);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map(n => n.label).sort(), ['John 1:1', 'Romans 8:28']);
  });

  test('the same passage from two devices collapses to one', () => {
    const merged = mergeNotes(phone, [note('45.8.28', 'Romans 8:28', 1453, 'svc2', DAY2 + 5000)]);
    assert.equal(merged.length, 1);
  });

  test('keeps the EARLIEST timestamp — when they first heard it is what is true', () => {
    const later = [note('45.8.28', 'Romans 8:28', 1453, 'svc2', DAY2 + 90_000)];
    assert.equal(mergeNotes(later, phone)[0].at, DAY2);
    assert.equal(mergeNotes(phone, later)[0].at, DAY2);
  });

  test('is order-independent', () => {
    const a = mergeNotes(phone, tablet).map(n => n.refId).sort();
    const b = mergeNotes(tablet, phone).map(n => n.refId).sort();
    assert.deepEqual(a, b);
  });

  test('the same verse across different services stays two records', () => {
    const merged = mergeNotes(
      [note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY1)],
      [note('45.8.28', 'Romans 8:28', 900, 'svc2', DAY2)],
    );
    assert.equal(merged.length, 2);
  });

  test('empty sides are not an error', () => {
    assert.deepEqual(mergeNotes([], []), []);
    assert.equal(mergeNotes(phone, []).length, 1);
    assert.equal(mergeNotes([], phone).length, 1);
  });
});

describe('cloud calls degrade to local-only', () => {
  test('no uid is a no-op, never a throw', async () => {
    recordServiceNote(note('45.8.28', 'Romans 8:28', 1453, 'svc1', DAY2));
    assert.equal(await syncServiceNotes(''), 0);
    await pushSession('', 'svc1');
    assert.equal(await pushAllSessions(''), 0);
    assert.equal(serviceNotesFor('45:8:28').length, 1, 'local is untouched');
  });

  test('migrated legacy records are not pushed — they have no real session', async () => {
    localStorage.setItem(LEGACY, JSON.stringify({ '45:8:28': 'Heard at 24:13 — All Things' }));
    migrateLegacyReceipts();
    assert.equal(serviceNotesFor('45:8:28')[0].sessionId, 'legacy');
    assert.equal(await pushAllSessions('uid1'), 0, 'legacy is skipped');
  });
});

describe('helpers', () => {
  test('verseKeyOf matches the key the reader and highlights use', () => {
    assert.equal(verseKeyOf({ book: 45, bookName: 'Romans', chapter: 8, verse: 28 }), '45:8:28');
    assert.equal(verseKeyOf({ book: 19, bookName: 'Psalms', chapter: 23 }), '19:23:1');
  });

  test('formatTC', () => {
    assert.equal(formatTC(1453), '24:13');
    assert.equal(formatTC(380), '6:20');
  });

  test('empty store is not an error', () => {
    assert.deepEqual(serviceNotesFor('45:8:28'), []);
    assert.deepEqual(serviceNotesByDay(), []);
  });
});
