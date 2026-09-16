import { test } from 'node:test';
import assert from 'node:assert/strict';
import { favoriteStorageKey, loadFollowedTeams, normalizeFollowedTeams, selectSportsLanding, teamPlays, type FollowedGame } from '../services/sportsPersonalization';
import { parseFollowedSchedule, scheduleUrls } from '../services/followedTeamSchedule';

const now = new Date(2026, 8, 13, 14).getTime();
const favorites = normalizeFollowedTeams(['Green Bay Packers', 'New York Yankees']);
function game(id: string, league = 'NFL', state = 'pre', date = now, team = 'Green Bay Packers'): FollowedGame {
  return { id, league, fetchedAt: now, sourceUrl: 'https://example.com', event: { id, name: `${team} at Opponent`, date: new Date(date).toISOString(), status: { type: { state } }, competitions: [{ competitors: [
    { homeAway: 'away', team: { id: '9', displayName: team }, score: '0' },
    { homeAway: 'home', team: { id: '16', displayName: 'Opponent' }, score: { value: 7 } },
  ] }] } };
}
test('only followed teams playing locally today activate game day', () => {
  assert.equal(selectSportsLanding([game('1')], favorites, now).mode, 'gameday');
  assert.equal(selectSportsLanding([game('1')], [], now).mode, 'hub');
  assert.equal(selectSportsLanding([game('1', 'NFL', 'pre', now, 'Dallas Cowboys')], favorites, now).mode, 'hub');
  assert.equal(selectSportsLanding([game('1', 'MLB')], favorites, now).mode, 'hub');
});
test('future games stay in the hub and next matchup is found per team', () => {
  const games = [game('later', 'NFL', 'pre', now + 3 * 86400000), game('next', 'NFL', 'pre', now + 86400000)];
  const result = selectSportsLanding(games, favorites, now);
  assert.equal(result.mode, 'hub');
  assert.equal(result.next[0].game.id, 'next');
});
test('multiple leagues are featured together, live before upcoming before final', () => {
  const result = selectSportsLanding([game('final', 'NFL', 'post'), game('pre'), game('live', 'MLB', 'in', now, 'New York Yankees')], favorites, now);
  assert.deepEqual(result.today.map(g => g.id), ['live', 'pre', 'final']);
});
test('finals remain today but leave at midnight; ongoing games can cross midnight', () => {
  const end = new Date(2026, 8, 13, 23, 59).getTime();
  const next = new Date(2026, 8, 14, 0, 1).getTime();
  const final = game('1', 'NFL', 'post', end); final.fetchedAt = end;
  assert.equal(selectSportsLanding([final], favorites, end).mode, 'gameday');
  final.fetchedAt = next;
  assert.equal(selectSportsLanding([final], favorites, next).mode, 'hub');
  const live = game('2', 'NFL', 'in', end); live.fetchedAt = next;
  assert.equal(selectSportsLanding([live], favorites, next).mode, 'gameday');
});
test('stale, invalid-date, postponed, suspended and cancelled games never trigger game day', () => {
  const stale = game('stale'); stale.fetchedAt = now - 91000;
  assert.equal(selectSportsLanding([stale], favorites, now).mode, 'hub');
  const invalid = game('invalid'); invalid.event.date = 'bad';
  assert.equal(selectSportsLanding([invalid], favorites, now).mode, 'hub');
  for (const name of ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED']) {
    const postponed = game(name); postponed.event.status.type.name = name;
    assert.equal(selectSportsLanding([postponed], favorites, now).mode, 'hub');
  }
});
test('team matching uses league and exact identity rather than shared cities', () => {
  assert.equal(teamPlays(game('1'), { league: 'NFL', name: 'Green Bay' }), false);
  assert.equal(teamPlays(game('1'), { league: 'NFL', name: 'Packers', espnId: '9' }), true);
  assert.equal(teamPlays(game('1'), { league: 'MLB', name: 'Packers', espnId: '9' }), false);
});
test('account preferences are isolated, corrupt storage falls back, explicit empty follows stay empty', () => {
  const data = new Map<string, string>([['vibestream_favorite_teams_v2', JSON.stringify(['Green Bay Packers'])]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null };
  assert.equal(loadFollowedTeams(storage).length, 1);
  assert.equal(loadFollowedTeams(storage, 'other-user').length, 0);
  assert.equal(loadFollowedTeams(storage, 'other-user', ['New York Yankees'])[0].league, 'MLB');
  data.set(favoriteStorageKey('other-user'), '[]');
  assert.deepEqual(loadFollowedTeams(storage, 'other-user', ['New York Yankees']), []);
  data.set(favoriteStorageKey('other-user'), '{broken');
  assert.equal(loadFollowedTeams(storage, 'other-user', ['New York Yankees']).length, 1);
});
test('legacy follows are enriched with IDs and duplicates removed', () => {
  const result = normalizeFollowedTeams([{ name: 'Green Bay Packers', league: 'NFL' }, 'Green Bay Packers', null, 9]);
  assert.equal(result.length, 1);
  assert.ok(result[0].espnId);
  assert.equal(result[0].abbreviation, 'GB');
});
test('schedule projection preserves final status and rejects broken responses and unsafe links', () => {
  const event = game('1', 'NFL', 'post').event;
  event.links = [{ rel: ['summary'], href: 'javascript:alert(1)' }];
  const result = parseFollowedSchedule({ events: [event, event] }, 'NFL', 'source', now);
  assert.equal(result.length, 1);
  assert.equal(result[0].detailUrl, undefined);
  assert.equal(result[0].event.status.type.state, 'post');
  assert.throws(() => parseFollowedSchedule(null, 'NFL', 'source'));
  assert.throws(() => parseFollowedSchedule({ events: [{ id: 1 }] }, 'NFL', 'source'));
  assert.deepEqual(parseFollowedSchedule({ events: [] }, 'NFL', 'source'), []);
});
test('date range includes local yesterday and next fourteen days across year boundaries', () => {
  const urls = scheduleUrls('NFL', new Date(2026, 11, 31, 23));
  assert.match(urls[0], /dates=20261230-20270114/);
  assert.deepEqual(scheduleUrls('UNKNOWN'), []);
});
