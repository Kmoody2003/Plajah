// Course calendar spreading (services/edu/courseSchedule), the Tela home Recents filter
// (services/tela/recentScope) and scheduled-work visibility (isOpenFor).
//   npx tsx --test tests/courseSchedule.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, monthGrid, opensBefore, spreadDates, scheduleWeekday } from '../services/edu/courseSchedule';
import { filterRecents, isMine, orgChoices, stampEditor } from '../services/tela/recentScope';
import type { TelaDocMeta } from '../types';

// Wednesday 2026-10-28
const WED = new Date(2026, 9, 28, 15);

test('one per class meeting lands on the class weekday, every week', () => {
  const d = spreadDates(3, WED, 'meetings', 'Sundays · 9:15 AM');
  assert.deepEqual(d.map(isoDay), ['2026-11-01', '2026-11-08', '2026-11-15']);
  assert.ok(d.every(x => x.getHours() === 9));
});

test('meeting day on the start day counts', () => {
  assert.deepEqual(spreadDates(2, WED, 'meetings', 'Wednesday Bible Study 7 PM').map(isoDay), ['2026-10-28', '2026-11-04']);
});

test('no weekday in the schedule falls back to weekly from the start', () => {
  assert.deepEqual(spreadDates(2, WED, 'meetings', 'Evenings').map(isoDay), ['2026-10-28', '2026-11-04']);
});

test('daily, weekly and same-day spreads', () => {
  assert.deepEqual(spreadDates(3, WED, 'daily').map(isoDay), ['2026-10-28', '2026-10-29', '2026-10-30']);
  assert.deepEqual(spreadDates(2, WED, 'weekly').map(isoDay), ['2026-10-28', '2026-11-04']);
  assert.deepEqual(spreadDates(3, WED, 'same').map(isoDay), ['2026-10-28', '2026-10-28', '2026-10-28']);
  assert.deepEqual(spreadDates(0, WED, 'daily'), []);
});

test('weekday parsing picks the first day named', () => {
  assert.equal(scheduleWeekday('Sun & Wed'), 0);
  assert.equal(scheduleWeekday('Wednesdays and Sundays'), 3);
  assert.equal(scheduleWeekday(''), -1);
});

test('students see it a set number of days before it is due', () => {
  const due = new Date(2026, 10, 8, 9);
  assert.equal(opensBefore(due, 0), null);
  assert.equal(isoDay(opensBefore(due, 3)!), '2026-11-05');
});

test('month grid: six Sunday-first weeks with meeting days and today marked', () => {
  const g = monthGrid(WED, 'Sundays', WED);
  assert.equal(g.length, 42);
  assert.equal(g[0].date.getDay(), 0);
  assert.equal(g.find(c => c.isToday)?.iso, '2026-10-28');
  assert.ok(g.filter(c => c.isMeeting).every(c => c.date.getDay() === 0));
  assert.equal(g.filter(c => c.inMonth).length, 31);
});

const meta = (id: string, ownerId: string, extra: Partial<TelaDocMeta> = {}): TelaDocMeta => ({ id, ownerId, title: id, createdAt: 1, updatedAt: 1, ...extra });
const docs: TelaDocMeta[] = [
  meta('mine', 'me'),
  meta('mineOrg', 'me', { orgId: 'grace', orgName: 'Grace' }),
  meta('otherAccount', 'someoneElse'),
  meta('touched', 'someoneElse', { editedBy: ['me'] }),
  meta('sharedOrg', 'pastor', { sharedBy: 'Pastor Ann', orgId: 'grace' }),
  meta('sharedOtherOrg', 'stranger', { sharedBy: 'Stranger', orgId: 'elsewhere' }),
  meta('localOnly', 'local'),
];

test('Mine = made or edited by me; never another account’s docs on this device', () => {
  assert.deepEqual(filterRecents(docs, { kind: 'mine' }, 'me').map(d => d.id), ['mine', 'mineOrg', 'touched']);
  assert.ok(!isMine(meta('x', 'local'), 'me'));
  assert.deepEqual(filterRecents(docs, { kind: 'mine' }, null).map(d => d.id), ['localOnly']);
});

test('org filter only lists orgs I belong to, and only docs I own or that were shared with me', () => {
  assert.deepEqual(filterRecents(docs, { kind: 'org', orgId: 'grace' }, 'me', ['grace']).map(d => d.id), ['mineOrg', 'sharedOrg']);
  assert.deepEqual(filterRecents(docs, { kind: 'org', orgId: 'elsewhere' }, 'me', ['grace']), []);
  // Not a member, but made a doc for it: own docs only show, shares from that org too.
  assert.deepEqual(filterRecents(docs, { kind: 'org', orgId: 'grace' }, 'me', []).map(d => d.id), ['mineOrg', 'sharedOrg']);
  assert.deepEqual(orgChoices(docs, 'me', ['grace']), [{ orgId: 'grace', orgName: 'Grace', count: 2 }]);
});

test('shared filter lists other people’s shares', () => {
  assert.deepEqual(filterRecents(docs, { kind: 'shared' }, 'me').map(d => d.id), ['sharedOrg', 'sharedOtherOrg']);
});

test('stampEditor adds me once', () => {
  const d = { editedBy: ['a'] };
  const s = stampEditor(d, 'me');
  assert.deepEqual(s.editedBy, ['a', 'me']);
  assert.equal(stampEditor(s, 'me'), s);
  assert.equal(stampEditor(d, null), d);
});
