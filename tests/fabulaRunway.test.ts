// Runway adapter unit tests.
// Covers aspect ratio normalization, request payload building for image-to-video & video-to-video,
// task normalization, progress reporting, and error handling.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNWAY_ENDPOINT,
  parseAspect,
  runwayAspect,
  opForRunwayInput,
  buildImageToVideoBody,
  buildVideoToVideoBody,
  buildRunwayBody,
  normalizeRunwayTask,
} from '../services/fabula/runwayApi';

// ── aspect ratio ──────────────────────────────────────────────────────────────

test('runwayAspect parses standard ratios accurately', () => {
  const widescreen = runwayAspect('16:9');
  assert.equal(widescreen.value, '16:9');
  assert.equal(widescreen.exact, true);
  assert.equal(widescreen.note, undefined);

  const vertical = runwayAspect('9:16');
  assert.equal(vertical.value, '9:16');
  assert.equal(vertical.exact, true);
  assert.equal(vertical.note, undefined);

  const square = runwayAspect('1:1');
  assert.equal(square.value, '1:1');
  assert.equal(square.exact, true);
});

test('runwayAspect handles cinema scope ratios with advisory note', () => {
  const scope = runwayAspect('2.39:1');
  assert.equal(scope.value, '16:9');
  assert.equal(scope.exact, false);
  assert.match(scope.note || '', /Runway generates at 16:9/);
  assert.match(scope.note || '', /crop or letterbox/i);
  assert.match(scope.note || '', /2\.39:1/);
});

test('runwayAspect falls back gracefully for empty/missing aspect', () => {
  const def = runwayAspect(undefined);
  assert.equal(def.value, '16:9');
  assert.equal(def.exact, true);
});

// ── operation & request bodies ────────────────────────────────────────────────

test('opForRunwayInput selects video_to_video when videoUrl is present', () => {
  assert.equal(opForRunwayInput({ prompt: 'cinematic shot' }), 'image_to_video');
  assert.equal(
    opForRunwayInput({ prompt: 'stylize shot', videoUrl: 'https://example.com/clip.mp4' }),
    'video_to_video',
  );
});

test('buildImageToVideoBody builds correct payload with image refs & options', () => {
  const body = buildImageToVideoBody({
    prompt: '  A drone sweep over a glowing neon city  ',
    aspect: '16:9',
    duration: 10,
    seed: 42,
    refs: {
      first_frame: 'https://storage.googleapis.com/test-bucket/frame1.png',
      last_frame: 'https://storage.googleapis.com/test-bucket/frame2.png',
    },
  });

  assert.equal(body.promptText, 'A drone sweep over a glowing neon city');
  assert.equal(body.ratio, '16:9');
  assert.equal(body.duration, 10);
  assert.equal(body.seed, 42);
  assert.equal(body.promptImage, 'https://storage.googleapis.com/test-bucket/frame1.png');
  assert.equal(body.lastFrameImage, 'https://storage.googleapis.com/test-bucket/frame2.png');
  assert.equal(body.model, 'gen3a_turbo');
});

test('buildVideoToVideoBody builds video restyling payload', () => {
  const body = buildVideoToVideoBody({
    prompt: 'Turn into anime watercolor aesthetic',
    videoUrl: 'https://storage.googleapis.com/test-bucket/original.mp4',
    aspect: '16:9',
  });

  assert.equal(body.promptText, 'Turn into anime watercolor aesthetic');
  assert.equal(body.videoUrl, 'https://storage.googleapis.com/test-bucket/original.mp4');
  assert.equal(body.ratio, '16:9');
  assert.equal(body.model, 'gen3a_turbo');
});

test('buildRunwayBody routes correctly according to op', () => {
  const imgBody = buildRunwayBody('image_to_video', { prompt: 'Test text' });
  assert.equal(imgBody.duration, 5);

  const vidBody = buildRunwayBody('video_to_video', {
    prompt: 'Restyle',
    videoUrl: 'https://example.com/clip.mp4',
  });
  assert.equal(vidBody.videoUrl, 'https://example.com/clip.mp4');
});

// ── task normalization ────────────────────────────────────────────────────────

test('normalizeRunwayTask maps statuses to Fabula job lifecycle', () => {
  const pending = normalizeRunwayTask({ id: 'task-1', status: 'PENDING' });
  assert.equal(pending.taskId, 'task-1');
  assert.equal(pending.status, 'queued');

  const running = normalizeRunwayTask({ id: 'task-2', status: 'RUNNING', progress: 0.65 });
  assert.equal(running.status, 'running');
  assert.equal(running.progress, 0.65);

  const throttled = normalizeRunwayTask({ id: 'task-3', status: 'THROTTLED' });
  assert.equal(throttled.status, 'queued');

  const done = normalizeRunwayTask({
    id: 'task-4',
    status: 'SUCCEEDED',
    output: ['https://runway-cdn.com/take1.mp4'],
  });
  assert.equal(done.status, 'done');
  assert.equal(done.results.length, 1);
  assert.equal(done.results[0].url, 'https://runway-cdn.com/take1.mp4');
  assert.equal(done.results[0].mime, 'video/mp4');
});

test('normalizeRunwayTask handles SUCCEEDED with empty output as an error', () => {
  const emptyDone = normalizeRunwayTask({ id: 'task-5', status: 'SUCCEEDED', output: [] });
  assert.equal(emptyDone.status, 'error');
  assert.match(emptyDone.error || '', /no video output/i);
});

test('normalizeRunwayTask surfaces failure messages properly', () => {
  const failed = normalizeRunwayTask({
    id: 'task-6',
    status: 'FAILED',
    failure: 'Content moderation flagged prompt input.',
  });
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, 'Content moderation flagged prompt input.');
});

test('normalizeRunwayTask survives null or unexpected payloads without throwing', () => {
  const junk = normalizeRunwayTask(null);
  assert.equal(junk.status, 'running');
  assert.deepEqual(junk.results, []);
});
