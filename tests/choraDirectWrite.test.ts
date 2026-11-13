// Pure TypeScript HTTP tests for G4 (`routes/choraDirect.ts` — `POST /api/chora/direct/write`).
// Uses an injected stub `LaneFn` so zero cloud API calls or model runs occur.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createChoraDirectRouter } from '../routes/choraDirect';
import { briefGrounding, compileSongBrief } from '../services/melos/direct/songBrief';
import { parseSongPrompt } from '../services/melos/direct/songPrompt';
import type { LaneFn } from '../services/ai/geminiLane';

async function withServer(
  router: express.Router,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use('/api/chora/direct', router);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}/api/chora/direct`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('POST /api/chora/direct/write: answers 428 without cloudConsent: true and never calls the lane', async () => {
  let laneCalls = 0;
  const stubLane: LaneFn = async () => {
    laneCalls++;
    return '1 1 1 C3';
  };
  const router = createChoraDirectRouter({
    authenticate: (req: any, _res, next) => {
      req.uid = 'user-1';
      next();
    },
    lane: stubLane,
  });

  await withServer(router, async (base) => {
    for (const badConsent of [undefined, false, 'true', 1]) {
      const res = await fetch(`${base}/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'deep house, 122 bpm',
          chair: 'bass',
          section: 's1',
          bars: 4,
          cloudConsent: badConsent,
        }),
      });
      assert.equal(res.status, 428);
      const payload = (await res.json()) as { code?: string; error?: string };
      assert.equal(payload.code, 'CLOUD_CONSENT_REQUIRED');
    }
    assert.equal(laneCalls, 0);
  });
});

test('POST /api/chora/direct/write: builds prompt from briefGrounding(brief, { chair, sectionId }) and validates via parseNoteLines', async () => {
  const brief = compileSongBrief(
    parseSongPrompt(
      [
        'deep house, warm Rhodes, 122 bpm, A minor',
        '[Intro | 4 bars | mp]',
        '[Verse 1 | 8 bars | mf]',
        'Late night city lights',
      ].join('\n'),
    ),
  );
  const grooveSection = brief.sections[1];
  assert.equal(grooveSection.id, 's2');
  assert.equal(grooveSection.startBar, 4); // bars 5–12 (1-based)

  let capturedSystem = '';
  let capturedUser = '';
  const stubLane: LaneFn = async (system, user) => {
    capturedSystem = system;
    capturedUser = user;
    return [
      '```',
      'Here is the bass line:', // prose — skipped by parseNoteLines
      '4 1 1 A2', // out of region (bar 4 < bar 5) — skipped by parseNoteLines
      '5 1 1 A2',
      '5 2.5 0.5 E2',
      '5 3 1 A2',
      '6 1 2 F2',
      '6 3 2 G2',
      '99 1 1 C3', // out of region — skipped by parseNoteLines
      '```',
    ].join('\n');
  };

  const router = createChoraDirectRouter({ lane: stubLane });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brief,
        chair: 'bass',
        section: 's2',
        bars: 4,
        cloudConsent: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      chair: string;
      role: string;
      sectionId: string;
      bars: { startBar: number; endBar: number; count: number; beatsPerBar: number };
      lines: string[];
      text: string;
      notes: { start: number; length: number; pitch: number; velocity: number }[];
    };

    // Prompt must use `briefGrounding(brief, { chair, sectionId })` verbatim + line-format instructions.
    const expectedGrounding = briefGrounding(brief, { chair: 'bass', sectionId: 's2' });
    assert.ok(capturedUser.startsWith(expectedGrounding));
    assert.match(capturedSystem, /bar beat length pitch/);

    assert.equal(body.chair, 'bass');
    assert.equal(body.role, 'bass');
    assert.equal(body.sectionId, 's2');
    assert.deepEqual(body.bars, { startBar: 5, endBar: 8, count: 4, beatsPerBar: 4 });

    // Only the 5 in-region valid note lines survive `parseNoteLines`.
    assert.equal(body.notes.length, 5);
    assert.deepEqual(body.lines, [
      '5 1 1 A2',
      '5 2.5 0.5 E2',
      '5 3 1 A2',
      '6 1 2 F2',
      '6 3 2 G2',
    ]);
    assert.equal(body.notes[0].start, 0);
    assert.equal(body.notes[0].pitch, 45); // A2
    assert.equal(body.notes[3].start, 4); // bar 6 beat 1 = 4 beats from region start
    assert.equal(body.notes[3].pitch, 41); // F2
  });
});

test('POST /api/chora/direct/write: accepts pre-rendered briefGrounding text in 3/4 waltz meter and rejects empty model output with 422', async () => {
  const waltzBrief = compileSongBrief(parseSongPrompt('Viennese waltz, strings, 3/4, D major'));
  const preRendered = briefGrounding(waltzBrief, { chair: 'violin', sectionId: 's1' });

  let mode: 'valid' | 'garbage' = 'valid';
  let seenUser = '';
  const stubLane: LaneFn = async (_sys, user) => {
    seenUser = user;
    if (mode === 'garbage') return 'I cannot write notes right now.';
    return [
      '1 1 2 A4',
      '1 3 1 F#4',
      '1 5 1 D5', // invalid in 3/4 (`beat - 1 >= 3`) -> dropped by parseNoteLines!
      '2 1 3 D5',
    ].join('\n');
  };

  const router = createChoraDirectRouter({ lane: stubLane });
  await withServer(router, async (base) => {
    const okRes = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grounding: preRendered,
        chair: 'violin',
        section: 's1',
        bars: 4,
        cloudConsent: true,
      }),
    });
    assert.equal(okRes.status, 200);
    const okBody = (await okRes.json()) as {
      bars: { beatsPerBar: number; startBar: number; endBar: number };
      lines: string[];
    };
    assert.ok(seenUser.startsWith(preRendered.trim()));
    assert.equal(okBody.bars.beatsPerBar, 3);
    assert.deepEqual(okBody.lines, ['1 1 2 A4', '1 3 1 F#4', '2 1 3 D5']);

    mode = 'garbage';
    const badRes = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grounding: preRendered,
        chair: 'violin',
        section: 's1',
        bars: 4,
        cloudConsent: true,
      }),
    });
    assert.equal(badRes.status, 422);
  });
});
