import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { processDueElevateRunsServer, dueRuns, type ElevateServerIo } from '../services/elevateLiveServer';
import type { FastChannelSlot } from '../types';

// No real model calls in tests: without a key the Gemini helpers return null and
// the pipeline still produces a (thin) briefing from the transcript.
before(() => { delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_AI_API_KEY; });

const video = (id: string, title: string, sec: number, url: string): FastChannelSlot =>
  ({ id, type: 'VIDEO', order: 0, videoTitle: title, videoUrl: url, videoDurationSeconds: sec } as FastChannelSlot);

const start = Date.parse('2026-11-03T19:00:00-05:00');
const end = Date.parse('2026-11-03T20:05:00-05:00');
const now = end + 10 * 60 * 1000;

function fakeIo(seed: Record<string, Record<string, any>>) {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed));
  const created: string[] = [];
  const io: ElevateServerIo = {
    get: async p => docs.get(p) ?? null,
    set: async (p, d) => { docs.set(p, { ...d }); return true; },
    patch: async (p, d) => { docs.set(p, { ...(docs.get(p) || {}), ...d }); return true; },
    query: async (c, filters) => [...docs.entries()]
      .filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === 2)
      .filter(([, d]) => filters.every(f => d[f.field] === f.value))
      .map(([k, d]) => ({ id: k.split('/')[1], data: d })),
    createOnce: async (c, id, d) => { const k = `${c}/${id}`; if (docs.has(k)) return 'exists'; docs.set(k, d); return 'created'; },
    create: async (c, d) => { const id = `auto${created.length}`; created.push(id); docs.set(`${c}/${id}`, d); return id; },
    captions: async () => [
      { time: 0, text: 'Welcome to Great Faith. Today we read from the book of Ruth, chapter one.' },
      { time: 30, text: 'Where you go I will go, and your people shall be my people. That is covenant love.' },
    ],
  };
  return { io, docs };
}

const seed = () => ({
  'elevateLiveRuns/run1': {
    id: 'run1', orgId: 'org1', orgName: 'Great Faith', sourceKind: 'FAST_CHANNEL', channelOrdinal: 2,
    windowStart: start, windowEnd: end, timezone: 'America/New_York', status: 'SCHEDULED', createdAt: 1,
  },
  'organizations/org1': { name: 'Great Faith', creatorId: 'pastorUid', admins: ['adminUid'] },
  'fast_channel_schedules/pastorUid': {
    timezone: 'America/New_York',
    slots: [
      video('a', 'Morning shows', 68400, 'https://stream.mux.com/morningId.m3u8'),
      { id: 'ad', type: 'AD_BREAK', order: 1, adDurationSeconds: 120 },
      video('svc', 'Sunday Service', 4500, 'https://stream.mux.com/serviceId.m3u8'),
      video('b', 'Late night', 13380, 'https://cdn.example.com/late.mp4'),
    ],
  },
});

describe('Event Intelligence server job', () => {
  it('only picks runs whose window ended 5+ minutes ago', () => {
    const r = { id: 'x', windowEnd: end, status: 'SCHEDULED' } as any;
    assert.equal(dueRuns([r], end + 4 * 60 * 1000).length, 0);
    assert.equal(dueRuns([r], end + 5 * 60 * 1000).length, 1);
    assert.equal(dueRuns([{ ...r, status: 'READY' }], now).length, 0);
  });

  it('processes a due TV-channel run once, as the church', async () => {
    const { io, docs } = fakeIo(seed());
    const first = await processDueElevateRunsServer(io, now);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.processed, ['run1']);

    const run = docs.get('elevateLiveRuns/run1')!;
    assert.equal(run.status, 'READY');
    assert.equal(run.processedBy, 'server');
    const briefing = docs.get(`elevateBriefings/${run.briefingId}`)!;
    assert.equal(briefing.sourceTitle, 'Sunday Service');
    assert.match(briefing.transcript.text, /covenant love/);

    const post = docs.get('posts/elevate_run1')!;
    assert.equal(post.authorId, 'pastorUid');
    assert.equal(post.authorOrgId, 'org1');
    assert.deepEqual(post.editableUids, ['pastorUid', 'adminUid']);

    // A second sweep (or a second server instance) does nothing.
    docs.set('elevateLiveRuns/run1', { ...run, status: 'SCHEDULED' });
    const again = await processDueElevateRunsServer(io, now);
    assert.deepEqual(again.processed, []);
    assert.equal(again.skipped, 1);
  });

  it('marks the run ERROR with a code when the channel has no schedule', async () => {
    const s: Record<string, any> = seed();
    delete s['fast_channel_schedules/pastorUid'];
    const { io, docs } = fakeIo(s);
    const r = await processDueElevateRunsServer(io, now);
    assert.deepEqual(r.errors, [{ runId: 'run1', error: 'channel-schedule-not-found' }]);
    assert.equal(docs.get('elevateLiveRuns/run1')!.status, 'ERROR');
  });

  it('leaves runs that are not due yet alone', async () => {
    const { io, docs } = fakeIo(seed());
    const r = await processDueElevateRunsServer(io, end);
    assert.deepEqual(r.processed, []);
    assert.equal(docs.get('elevateLiveRuns/run1')!.status, 'SCHEDULED');
  });
});
