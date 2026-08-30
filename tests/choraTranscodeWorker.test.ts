import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runChoraTranscodeWorker, needsTranscode, _resetChoraWorkerState,
  PROCESSING_STALE_MS,
  type ChoraTranscodeDeps, type ChoraStreamDoc, type TrackCandidate,
} from '../services/choraTranscodeWorker.ts';

// These pin the behaviours whose absence caused the outage: a doc pinned at 'processing' by an
// abandoned request, a stampede of concurrent jobs, and work claimed that the runner has no time
// to finish. The transcoding itself is faked — what broke was never ffmpeg, it was the scheduling.

interface Harness {
  deps: ChoraTranscodeDeps;
  streams: Map<string, ChoraStreamDoc>;
  transcoded: string[];
  clock: { t: number };
}

function harness(opts: {
  candidates: TrackCandidate[];
  streams?: Record<string, ChoraStreamDoc>;
  /** ms of simulated time each transcode consumes */
  costMs?: number;
  failOn?: Set<string>;
}): Harness {
  const clock = { t: 1_000_000 };
  const streams = new Map<string, ChoraStreamDoc>(Object.entries(opts.streams || {}));
  const transcoded: string[] = [];
  const cost = opts.costMs ?? 0;
  return {
    clock, streams, transcoded,
    deps: {
      now: () => clock.t,
      listCandidates: async () => opts.candidates,
      readStream: async (id) => streams.get(id) ?? null,
      writeStream: async (id, patch) => { streams.set(id, { ...(streams.get(id) || {}), ...patch } as ChoraStreamDoc); },
      transcodeOne: async ({ trackId }) => {
        clock.t += cost;                       // simulated wall time
        if (opts.failOn?.has(trackId)) throw new Error('ffmpeg exploded');
        transcoded.push(trackId);
        streams.set(trackId, { status: 'ready', updatedAt: clock.t });
      },
    },
  };
}

const tracks = (n: number): TrackCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ trackId: `t${i}`, srcUrl: `https://cdn/${i}.wav` }));

test.beforeEach(() => _resetChoraWorkerState());

// ── needsTranscode: the predicate that stranded 68 tracks ────────────────────

test('a missing stream doc needs work', () => {
  assert.equal(needsTranscode(null, 0), true);
  assert.equal(needsTranscode({}, 0), true);
});

test('ready is done; pending and failed are retried', () => {
  assert.equal(needsTranscode({ status: 'ready' }, 0), false);
  assert.equal(needsTranscode({ status: 'pending' }, 0), true);
  assert.equal(needsTranscode({ status: 'failed' }, 0), true);
});

test('a LIVE processing job is left alone, so two runners cannot race it', () => {
  const now = 5_000_000;
  assert.equal(needsTranscode({ status: 'processing', updatedAt: now - 60_000 }, now), false);
});

test('a STALE processing job is reclaimed — this is what un-pins the abandoned 68', () => {
  const now = 5_000_000;
  const dead = { status: 'processing' as const, updatedAt: now - (PROCESSING_STALE_MS + 1) };
  assert.equal(needsTranscode(dead, now), true);
});

test('a processing doc with no updatedAt is old by definition', () => {
  assert.equal(needsTranscode({ status: 'processing' }, 9_999_999), true);
});

// ── The run loop ─────────────────────────────────────────────────────────────

test('transcodes only what needs it, and reports what was already done', async () => {
  const h = harness({
    candidates: tracks(4),
    streams: { t0: { status: 'ready' }, t2: { status: 'ready' } },
  });
  const r = await runChoraTranscodeWorker(h.deps, {});
  assert.equal(r.status, 'ok');
  assert.deepEqual(h.transcoded, ['t1', 't3']);
  assert.equal(r.transcoded, 2);
  assert.equal(r.alreadyReady, 2);
});

test("claims a track by writing 'processing' BEFORE the work, not at enqueue time", async () => {
  const seen: (string | undefined)[] = [];
  const h = harness({ candidates: tracks(1) });
  const inner = h.deps.transcodeOne;
  h.deps.transcodeOne = async (job) => {
    seen.push(h.streams.get(job.trackId)?.status);   // status visible DURING the work
    return inner(job);
  };
  await runChoraTranscodeWorker(h.deps, {});
  assert.deepEqual(seen, ['processing'], 'the doc is claimed while the job actually runs');
  assert.equal(h.streams.get('t0')?.status, 'ready');
});

test('a failed transcode is marked failed, not left pinned at processing', async () => {
  const h = harness({ candidates: tracks(2), failOn: new Set(['t0']) });
  const r = await runChoraTranscodeWorker(h.deps, {});
  assert.equal(h.streams.get('t0')?.status, 'failed', 'never left as processing');
  assert.equal(h.streams.get('t1')?.status, 'ready', 'one failure does not stop the run');
  assert.equal(r.failed, 1);
  assert.equal(r.transcoded, 1);
  assert.ok(r.errors.some(e => e.includes('t0')));
});

// ── The budget: why a run can't be killed mid-flight like the browser was ────

test('stops claiming work at the time budget instead of starting what it cannot finish', async () => {
  // 10 tracks at 100s each against a 250s budget: 3 start (0s, 100s, 200s), the 4th is past it.
  const h = harness({ candidates: tracks(10), costMs: 100_000 });
  const r = await runChoraTranscodeWorker(h.deps, { budgetMs: 250_000 });
  assert.equal(r.transcoded, 3, `expected 3 within budget, got ${r.transcoded}`);
  assert.equal(r.remaining, 7, 'the rest are reported as remaining, not started');
  // Nothing left mid-flight: every untouched track still has no doc at all.
  assert.equal(h.streams.get('t9'), undefined, 'unstarted work was never claimed');
});

test('the leftover backlog is picked up by the next run', async () => {
  const h = harness({ candidates: tracks(6), costMs: 100_000 });
  const first = await runChoraTranscodeWorker(h.deps, { budgetMs: 150_000 });
  _resetChoraWorkerState();
  const second = await runChoraTranscodeWorker(h.deps, { budgetMs: 150_000 });
  assert.ok(first.transcoded > 0 && second.transcoded > 0, 'both runs made progress');
  assert.equal(
    h.transcoded.length, new Set(h.transcoded).size,
    'no track was transcoded twice across runs',
  );
});

test('maxTracks caps a run even when transcodes are instant', async () => {
  const h = harness({ candidates: tracks(50), costMs: 0 });
  const r = await runChoraTranscodeWorker(h.deps, { maxTracks: 5 });
  assert.equal(r.transcoded, 5);
  assert.equal(h.transcoded.length, 5);
});

// ── Single-flight: the guard against the original stampede ───────────────────

test('a concurrent run is skipped rather than doubling the load', async () => {
  const h = harness({ candidates: tracks(3), costMs: 10_000 });
  const a = runChoraTranscodeWorker(h.deps, {});
  const b = await runChoraTranscodeWorker(h.deps, {});   // while a is in flight
  assert.equal(b.status, 'skipped');
  assert.equal(b.reason, 'already_running');
  const ra = await a;
  assert.equal(ra.status, 'ok');
  assert.equal(h.transcoded.length, new Set(h.transcoded).size, 'nothing transcoded twice');
});

test('the latch releases after a run, including when it throws', async () => {
  const h = harness({ candidates: tracks(1) });
  h.deps.listCandidates = async () => { throw new Error('firestore down'); };
  const r = await runChoraTranscodeWorker(h.deps, {});
  assert.ok(r.errors.some(e => e.includes('listCandidates')));
  // A second run must not be permanently skipped by a latch left set.
  const h2 = harness({ candidates: tracks(1) });
  const r2 = await runChoraTranscodeWorker(h2.deps, {});
  assert.equal(r2.status, 'ok');
  assert.equal(r2.transcoded, 1);
});

// ── Input hygiene ────────────────────────────────────────────────────────────

test('candidates without an id or url are ignored', async () => {
  const h = harness({
    candidates: [
      { trackId: '', srcUrl: 'https://cdn/a.wav' },
      { trackId: 't1', srcUrl: '' },
      { trackId: 't2', srcUrl: 'https://cdn/c.wav' },
    ] as TrackCandidate[],
  });
  const r = await runChoraTranscodeWorker(h.deps, {});
  assert.deepEqual(h.transcoded, ['t2']);
  assert.equal(r.transcoded, 1);
});
