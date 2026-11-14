// Copyright notices: § 512(c)(3)/(g)(3) completeness, URL → item matching, strikes, the restore clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNotice, missingElements, targetsFromUrls, parseTargets, addStrike, clearStrike, activeStrikes,
  isRepeatInfringer, addBusinessDays, restoreWindow, STRIKE_WINDOW_MS,
} from '../services/legal/copyrightCore';

const takedown = {
  kind: 'takedown', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+1 555 010 0199',
  address: '12 Analytical Way, London', country: 'UK', description: 'My song "Engine" (2024).',
  urls: ['https://plajah.com/album/abc123XYZ'], goodFaith: true, perjury: true, signature: 'Ada Lovelace',
};

test('a complete takedown has nothing missing', () => {
  assert.deepEqual(missingElements(parseNotice(takedown)), []);
});

test('each required takedown element is reported when absent', () => {
  for (const [k, v] of [['phone', ''], ['address', ''], ['urls', []], ['goodFaith', false], ['perjury', false], ['signature', '']] as const) {
    assert.equal(missingElements(parseNotice({ ...takedown, [k]: v })).length, 1, k);
  }
});

test('a signature unrelated to the name is rejected', () => {
  assert.match(missingElements(parseNotice({ ...takedown, signature: 'x' })).join(), /matches your legal name/);
});

test('a counter-notice needs jurisdiction consent and service acceptance', () => {
  const c = parseNotice({ ...takedown, kind: 'counter', goodFaith: false });
  const miss = missingElements(c);
  assert.equal(miss.length, 2);
  assert.deepEqual(missingElements(parseNotice({ ...takedown, kind: 'counter', consentJurisdiction: true, acceptService: true })), []);
});

test('a licensing dispute needs no address or statutory statements', () => {
  assert.deepEqual(missingElements(parseNotice({ kind: 'dispute', name: 'Ada', email: 'a@b.co', description: 'Credit is wrong on track 3', signature: 'Ada' })), []);
});

test('Plajah links map to items; other sites do not', () => {
  const t = targetsFromUrls([
    'https://plajah.com/album/abc123XYZ', 'https://www.plajah.com/?video=vid_99999', 'https://plajah.com/album/abc123XYZ',
    'https://evil.example/album/abc123XYZ', 'not a url',
  ]);
  assert.deepEqual(t, [{ kind: 'album', id: 'abc123XYZ' }, { kind: 'video', id: 'vid_99999' }]);
  assert.deepEqual(parseTargets([{ kind: 'album', id: 'abc123' }, { kind: 'users', id: 'abc123' }, { kind: 'post', id: '../x' }]), [{ kind: 'album', id: 'abc123' }]);
});

test('strikes: one per notice, three in a year closes uploads, restore clears', () => {
  const now = 10 * STRIKE_WINDOW_MS;
  let s = addStrike([], { noticeId: 'a', at: now - 1000, status: 'active' });
  s = addStrike(s, { noticeId: 'a', at: now, status: 'active' });
  assert.equal(s.length, 1);
  s = addStrike(s, { noticeId: 'old', at: now - STRIKE_WINDOW_MS - 1, status: 'active' });
  s = addStrike(s, { noticeId: 'b', at: now, status: 'active' });
  assert.equal(isRepeatInfringer(s, now), false, 'expired strike does not count');
  s = addStrike(s, { noticeId: 'c', at: now, status: 'active' });
  assert.equal(isRepeatInfringer(s, now), true);
  s = clearStrike(s, 'b', 'restored');
  assert.equal(activeStrikes(s, now).length, 2);
  assert.equal(isRepeatInfringer(s, now), false);
});

test('restore window lands between 10 and 14 business days, skipping weekends', () => {
  const fri = Date.UTC(2026, 9, 30, 12); // Friday 30 Oct 2026
  assert.equal(new Date(addBusinessDays(fri, 1)).getUTCDay(), 1, 'next business day after Friday is Monday');
  const w = restoreWindow(fri);
  const days = (t: number) => Math.round((t - fri) / 86_400_000);
  assert.ok(days(w.earliest) >= 14, `earliest ${days(w.earliest)} calendar days`);
  assert.ok(w.latest > w.earliest);
  assert.equal(days(w.latest), 20); // 14 business days from Fri 30 Oct = Thu 19 Nov
});
