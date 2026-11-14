import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCinemaMotionTask,
  CinemaMotionIntent,
} from '../services/localAi/plajahPipelineEngine';
import {
  wanVideoEngine,
  WanVideoResult,
  WanVideoUnavailableError,
} from '../services/video/wanVideoEngine';
import { executePlajahNativeTask } from '../services/localAi/plajahNativeRunner';
import { FabulaDialogueTake } from '../services/voice/plajahAudioCore';

test('Wan 2.1 Video Pipeline: Compiles single keyframe I2V task with camera kinematics', () => {
  const intent: CinemaMotionIntent = {
    startKeyframeUrl: 'blob:http://localhost/scene12_start.png',
    motionPrompt: 'Dr. Aria standing near the star-chart console, subtle breathing motion',
    cameraMovement: 'push_in',
    motionStrength: 6,
    durationSec: 3,
    resolution: '480p',
  };

  const task = compileCinemaMotionTask(intent);

  assert.equal(task.taskType, 'cinema_motion');
  assert.equal(task.modelId, 'wan_video_14b');
  assert.equal(task.dimensions.width, 832);
  assert.equal(task.dimensions.height, 480);
  assert.ok(task.prompt.includes('slow cinematic camera push-in dolly forward'));
  assert.ok(task.prompt.includes('Dr. Aria standing near the star-chart console'));
  assert.equal(task.motion?.startKeyframeUrl, 'blob:http://localhost/scene12_start.png');
  assert.equal(task.motion?.cameraMovement, 'push_in');
  assert.equal(task.motion?.durationSec, 3);
  assert.equal(task.motion?.fps, 24);
  assert.equal(task.motion?.resolution, '480p');
});

test('Wan 2.1 Video Pipeline: Compiles 720p HD profile within RTX 4070 allocation', () => {
  const intent: CinemaMotionIntent = {
    startKeyframeUrl: 'blob:http://localhost/dock_bay.png',
    motionPrompt: 'Massive transport bay doors slowly sliding open into vacuum',
    cameraMovement: 'crane_down',
    resolution: '720p',
    durationSec: 4,
  };

  const task = compileCinemaMotionTask(intent);

  assert.equal(task.dimensions.width, 1280);
  assert.equal(task.dimensions.height, 720);
  assert.ok(task.prompt.includes('crane shot descending'));
  assert.equal(task.motion?.resolution, '720p');
  assert.equal(task.motion?.durationSec, 4);
});

test('Wan 2.1 Video Pipeline: Compiles First & Last Frame Interpolation (FL-I2V)', () => {
  const intent: CinemaMotionIntent = {
    mode: 'first_and_last_frame',
    startKeyframeUrl: 'blob:http://localhost/frame_001.png',
    endKeyframeUrl: 'blob:http://localhost/frame_072.png',
    motionPrompt: 'Character transitions from seated at desk to standing before viewport',
    cameraMovement: 'orbit_360',
    durationSec: 3,
    resolution: '480p',
  };

  const task = compileCinemaMotionTask(intent);

  assert.equal(task.taskType, 'cinema_motion');
  assert.equal(task.modelId, 'wan_video_fl');
  assert.ok(task.prompt.includes('first and last frame interpolation, seamless physical transition'));
  assert.ok(task.prompt.includes('rotational arc orbit'));
  assert.equal(task.motion?.mode, 'first_and_last_frame');
  assert.equal(task.motion?.startKeyframeUrl, 'blob:http://localhost/frame_001.png');
  assert.equal(task.motion?.endKeyframeUrl, 'blob:http://localhost/frame_072.png');
});

test('Wan 2.1 Video Pipeline: Snaps video duration to dialogue duration (+0.6s editorial cradle)', () => {
  const intent: CinemaMotionIntent = {
    startKeyframeUrl: 'blob:http://localhost/marcus_closeup.png',
    motionPrompt: 'Marcus speaking intensely into the radio transmitter',
    cameraMovement: 'push_in',
    dialogueDurationSec: 2.4, // Raw speech duration = 2.4s
    dialogueAudioRef: 'take_marcus_02',
    resolution: '480p',
  };

  const task = compileCinemaMotionTask(intent);

  // Duration must be 2.4s + 0.6s (300ms pre-roll + 300ms post-roll) = 3.0s
  assert.equal(task.motion?.durationSec, 3.0);
  assert.equal(task.motion?.audioDurationSnapped, true);
  assert.equal(task.motion?.dialogueDurationSec, 2.4);
});

test('WanVideoEngine: Executes First & Last Frame Interpolation generation', async () => {
  const progressLogs: string[] = [];
  const result: WanVideoResult = await wanVideoEngine.generateFirstAndLastFrameInterpolation(
    {
      startKeyframeUrl: 'blob:http://localhost/take_a.png',
      endKeyframeUrl: 'blob:http://localhost/take_b.png',
      prompt: 'Character lowers binoculars and gazes into horizon',
      cameraMovement: 'pan_right',
      durationSec: 2.5,
      resolution: '480p',
    },
    (prog) => {
      progressLogs.push(prog.status);
    },
    { simulate: true } // fixture mode: no backend contacted, result flagged `simulated`
  );

  assert.equal(result.simulated, true, 'Fixture results must be flagged as simulated');
  assert.ok(result.videoUrl, 'Video URL must be returned');
  assert.equal(result.mode, 'first_and_last_frame');
  assert.equal(result.durationSeconds, 2.5);
  assert.equal(result.fps, 24);
  assert.equal(result.totalFrames, 2.5 * 24); // 60 frames
  assert.equal(result.dimensions.width, 832);
  assert.equal(result.dimensions.height, 480);
  assert.ok(progressLogs.length > 0, 'Progress callback must have reported status updates');
});

test('WanVideoEngine: Generates Dialogue-Snapped Shot directly from FabulaDialogueTake', async () => {
  const mockTake: FabulaDialogueTake = {
    takeId: 'take_aria_obs_01',
    lineText: 'If the transmitter goes down tonight, none of our signals reach the orbital dock.',
    speakerName: 'Aria',
    emotion: 'urgent',
    audioBlob: new Blob(['RIFF....WAVE'], { type: 'audio/wav' }),
    durationSeconds: 2.4,
    sceneSnapSeconds: 3.0,
    text: 'If the transmitter goes down tonight, none of our signals reach the orbital dock.',
    createdAt: Date.now(),
  };

  const result: WanVideoResult = await wanVideoEngine.generateDialogueSnappedShot({
    keyframeUrl: 'blob:http://localhost/aria_obs.png',
    prompt: 'Aria communicating urgently in the observatory',
    dialogueTake: mockTake,
    cameraMovement: 'push_in',
    resolution: '480p',
  }, undefined, { simulate: true });

  assert.equal(result.simulated, true);
  // Snapped duration must be 2.4 + 0.6 = 3.0s
  assert.equal(result.durationSeconds, 3.0);
  assert.equal(result.audioDurationSnapped, true);
  assert.equal(result.fps, 24);
  assert.equal(result.totalFrames, 72); // 3.0 * 24
  assert.equal(result.cameraTrajectory, 'push_in');
});

// ── Honest failure: no placeholder clip when no backend produced a video ──────────────────

const realFetch = globalThis.fetch;
const offlineSpec = {
  startKeyframeUrl: 'https://example.invalid/a.png',
  endKeyframeUrl: 'https://example.invalid/b.png',
  prompt: 'Slow push in',
  durationSec: 2,
  resolution: '480p' as const,
};

test('WanVideoEngine: throws engine_offline when the GPU sidecar is unreachable', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => wanVideoEngine.generateFirstAndLastFrameInterpolation(offlineSpec),
      (err: unknown) => {
        assert.ok(err instanceof WanVideoUnavailableError);
        assert.equal(err.code, 'engine_offline');
        assert.match(err.message, /not running/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('WanVideoEngine: throws engine_error with the sidecar reason when it returns no video', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false, error: 'Wan weights not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => wanVideoEngine.generateFirstAndLastFrameInterpolation(offlineSpec),
      (err: unknown) => {
        assert.ok(err instanceof WanVideoUnavailableError);
        assert.equal(err.code, 'engine_error');
        assert.match(err.message, /Wan weights not found/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('WanVideoEngine: returns real bytes (not simulated) when the sidecar succeeds', async () => {
  const payload = Buffer.from('real-mp4-bytes').toString('base64');
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, videoUrl: `data:video/mp4;base64,${payload}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  try {
    const result = await wanVideoEngine.generateFirstAndLastFrameInterpolation(offlineSpec);
    assert.notEqual(result.simulated, true);
    assert.equal(result.videoBlob.size, 'real-mp4-bytes'.length);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('PlajahNativeRunner: reports failure, not a procedural placeholder, when the sidecar is offline', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  try {
    const res = await executePlajahNativeTask({
      id: 'task_offline',
      taskType: 'cinema_still',
      modelId: 'flux3_klein',
      prompt: 'a lighthouse at dusk',
      negativePrompt: '',
      dimensions: { width: 1024, height: 1024 },
      steps: 4,
      cfgScale: 1,
      seed: 1,
    } as any);
    assert.equal(res.success, false);
    assert.equal(res.mediaUrl, '');
    assert.equal(res.errorCode, 'engine_offline');
    assert.equal(res.hardwareBackend, 'FALLBACK');
    assert.match(res.error || '', /not running/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
