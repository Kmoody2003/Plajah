import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runLyricSyncWorker, needsLyricSync, syncAndRecord, lyricJobId,
  LYRIC_RUNNING_STALE_MS, LYRIC_MAX_ATTEMPTS,
  type LyricSyncDeps, type LyricJobDoc, type LyricCandidate,
} from '../services/lyricSyncWorker.ts';

const cand = (trackId: string, hasTimedLyrics = false): LyricCandidate => ({
  albumId: 'alb', collection: 'albums', trackId, srcUrl: `https://x/${trackId}.wav`, hasTimedLyrics,
});

function harness(cands: LyricCandidate[], result: (c: LyricCandidate) => number | Error, stepMs = 1000) {
  const jobs = new Map<string, LyricJobDoc>();
  const clock = { t: 1_000_000 };
  const synced: string[] = [];
  const deps: LyricSyncDeps = {
    listCandidates: async () => cands,
    readJob: async id => jobs.get(id) ?? null,
    writeJob: async (id, patch) => { jobs.set(id, { ...(jobs.get(id) || {}), ...patch }); },
    syncOne: async c => { clock.t += stepMs; synced.push(c.trackId); const r = result(c); if (r instanceof Error) throw r; return r; },
    now: () => clock.t,
  };
  return { deps, jobs, clock, synced };
}

test('tracks that already have timed lyrics are never re-sent', async () => {
  const h = harness([cand('a', true), cand('b')], () => 12);
  const s = await runLyricSyncWorker(h.deps);
  assert.deepEqual(h.synced, ['b']);
  assert.equal(s.alreadySynced, 1);
  assert.equal(s.synced, 1);
  assert.equal(h.jobs.get(lyricJobId('alb', 'b'))?.status, 'done');
});

test('an instrumental is recorded once and then left alone', async () => {
  const h = harness([cand('inst')], () => 0);
  await runLyricSyncWorker(h.deps);
  assert.equal(h.jobs.get(lyricJobId('alb', 'inst'))?.status, 'empty');
  await runLyricSyncWorker(h.deps);
  assert.deepEqual(h.synced, ['inst']);
});

test('failures back off and finally stop', () => {
  const c = cand('f');
  const now = 10_000_000_000;
  assert.equal(needsLyricSync(c, { status: 'failed', attempts: 1, updatedAt: now - 60_000 }, now), false);
  assert.equal(needsLyricSync(c, { status: 'failed', attempts: 1, updatedAt: now - 4 * 3600_000 }, now), true);
  assert.equal(needsLyricSync(c, { status: 'failed', attempts: LYRIC_MAX_ATTEMPTS, updatedAt: 0 }, now), false);
});

test('a dead running claim is reclaimed, a live one is not', () => {
  const c = cand('r');
  const now = 50_000_000;
  assert.equal(needsLyricSync(c, { status: 'running', updatedAt: now - 1000 }, now), false);
  assert.equal(needsLyricSync(c, { status: 'running', updatedAt: now - LYRIC_RUNNING_STALE_MS - 1 }, now), true);
});

test('the run stops claiming once its budget is spent and reports the rest', async () => {
  const h = harness([cand('1'), cand('2'), cand('3'), cand('4')], () => 5, 100_000);
  const s = await runLyricSyncWorker(h.deps, { budgetMs: 150_000 });
  assert.equal(s.synced, 2);
  assert.equal(s.remaining, 2);
  assert.equal(h.jobs.get(lyricJobId('alb', '3')), undefined, 'unstarted work is not claimed');
});

test('failure is recorded with an attempt count', async () => {
  const h = harness([cand('x')], () => new Error('audio fetch 404'));
  const r = await syncAndRecord(h.deps, cand('x'), null);
  assert.equal(r.status, 'failed');
  const job = h.jobs.get(lyricJobId('alb', 'x'))!;
  assert.equal(job.status, 'failed');
  assert.equal(job.attempts, 1);
  const r2 = await syncAndRecord(h.deps, cand('x'), job);
  assert.equal(h.jobs.get(lyricJobId('alb', 'x'))!.attempts, 2);
  assert.equal(r2.status, 'failed');
});

test('overlapping runs are single-flight', async () => {
  const h = harness([cand('a')], () => 3);
  const [a, b] = await Promise.all([runLyricSyncWorker(h.deps), runLyricSyncWorker(h.deps)]);
  assert.deepEqual([a.status, b.status].sort(), ['ok', 'skipped']);
  assert.deepEqual(h.synced, ['a']);
});
