import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNflScoreboard } from '../services/nflScoreboard';
import { slimScheduleEvent } from '../services/sportsSlim';
import { scoreText } from '../src/lib/scoreText';

function event(id: string, state = 'pre') {
  return { id, date: '2026-09-13T17:00:00Z', status: { displayClock: '3:12', period: 4, type: { name: 'STATUS_IN_PROGRESS', state, shortDetail: '3:12 - 4th Quarter' } }, competitions: [{ competitors: [
    { homeAway: 'home', team: { id: '1', displayName: 'Home' }, score: { value: 0 } },
    { homeAway: 'away', team: { id: '2', displayName: 'Away' }, score: '7' },
  ] }] };
}

test('uses provider season and postseason week across the January boundary', () => {
  const board = parseNflScoreboard({ season: { year: 2025, type: 3 }, week: { number: 2 }, events: [event('1')] }, Date.parse('2026-01-18'));
  assert.equal(board.season, 2025);
  assert.equal(board.seasonLabel, 'Postseason');
  assert.equal(board.week, 2);
});
test('distinguishes a valid empty schedule from a broken provider response', () => {
  assert.deepEqual(parseNflScoreboard({ events: [] }).events, []);
  for (const value of [null, {}, { events: {} }]) assert.throws(() => parseNflScoreboard(value));
  assert.throws(() => parseNflScoreboard({ events: [{ id: 'broken' }] }));
});
test('preserves postponed status and unconfirmed kickoff times', () => {
  const game = event('postponed');
  game.status.type.name = 'STATUS_POSTPONED';
  game.status.type.shortDetail = 'Postponed';
  Object.assign(game.competitions[0], { timeValid: false, neutralSite: true });
  const result = parseNflScoreboard({ events: [game] }).events[0];
  assert.equal(result.status.type.name, 'STATUS_POSTPONED');
  assert.equal(result.competitions[0].timeValid, false);
  assert.equal(result.competitions[0].neutralSite, true);
});
test('rejects incomplete matchups, deduplicates IDs, and puts live games first', () => {
  const board = parseNflScoreboard({ events: [event('1'), event('2', 'in'), event('1'), { id: '3' }, null] });
  assert.deepEqual(board.events.map(e => e.id), ['2', '1']);
});
test('keeps zero scores, status names, clock and period through repeated projection', () => {
  const slim = slimScheduleEvent(event('1', 'in'));
  assert.deepEqual(slimScheduleEvent(slim), slim);
  assert.equal(scoreText(slim.competitions[0].competitors[0].score), '0');
  assert.equal(slim.status.displayClock, '3:12');
  assert.equal(slim.status.period, 4);
  assert.equal(slim.status.type.name, 'STATUS_IN_PROGRESS');
});
