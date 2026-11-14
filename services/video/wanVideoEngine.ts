// wanVideoEngine.ts — On-device cinematic video generation and keyframe interpolation engine.
// Powered by Alibaba Wan 2.1 / Wan 2.2 open-weight diffusion models.
//
// 100% Native Plajah Architecture:
// - Runs natively on discrete NVIDIA RTX GPUs (optimized for RTX 4070 8GB VRAM at 480p/720p 24fps).
// - Supports:
//   1. Single Keyframe I2V (image-to-video with natural camera kinematics).
//   2. First & Last Frame Interpolation (FL-I2V: seamless physical transition between two storyboards).
//   3. Audio-Snapped Video Shots (video clip duration perfectly cradles dialogue takes from plajahAudioCore).

import { isWindowsApp, getNativeMediaEngine } from '../windowsBridgeService';
import {
  CinemaMotionIntent,
  compileCinemaMotionTask,
  PlajahNativeTask,
} from '../localAi/plajahPipelineEngine';
import { FabulaDialogueTake } from '../voice/plajahAudioCore';

export interface WanVideoResult {
  videoUrl: string;
  videoBlob: Blob;
  durationSeconds: number;
  dimensions: { width: number; height: number };
  fps: number;
  totalFrames: number;
  mode: 'single_keyframe' | 'first_and_last_frame' | 'text_to_video';
  modelUsed: string;
  cameraTrajectory: string;
  audioDurationSnapped: boolean;
  /**
   * True only for the explicit `{ simulate: true }` fixture mode: no model ran and
   * `videoBlob` is NOT a playable video. Real generations never set this — when no
   * backend produces output the engine throws `WanVideoUnavailableError` instead.
   */
  simulated?: boolean;
}

export interface WanGenerateOptions {
  /**
   * Skip every backend and return a placeholder result flagged `simulated: true`.
   * For unit tests / fixtures only — never pass this from product UI.
   */
  simulate?: boolean;
}

export const WAN_SIDECAR_URL = 'http://127.0.0.1:51122';

/** Thrown when no real backend (GPU sidecar or Windows native host) produced a video. */
export class WanVideoUnavailableError extends Error {
  /** `engine_offline`: nothing answered. `engine_error`: an engine answered but produced no video. */
  readonly code: 'engine_offline' | 'engine_error';
  constructor(code: 'engine_offline' | 'engine_error', message: string) {
    super(message);
    this.name = 'WanVideoUnavailableError';
    this.code = code;
  }
}

export interface WanProgressCallback {
  (progress: { status: string; percent: number; currentFrame?: number; totalFrames?: number }): void;
}

export class WanVideoEngine {
  private static instance: WanVideoEngine | null = null;

  static getInstance(): WanVideoEngine {
    if (!this.instance) {
      this.instance = new WanVideoEngine();
    }
    return this.instance;
  }

  /**
   * Generates a cinematic motion shot from an intent specification.
   */
  async generateMotionShot(
    intent: CinemaMotionIntent,
    onProgress?: WanProgressCallback,
    options: WanGenerateOptions = {}
  ): Promise<WanVideoResult> {
    const task = compileCinemaMotionTask(intent);
    const motionMeta = task.motion || {
      mode: 'single_keyframe',
      cameraMovement: 'push_in',
      motionStrength: 5,
      durationSec: 3,
      fps: 24,
      resolution: '480p',
      audioDurationSnapped: false,
    };

    const totalFrames = motionMeta.durationSec * motionMeta.fps;
    onProgress?.({
      status: `Compiling Wan 2.1/2.2 tensor graph (${task.dimensions.width}x${task.dimensions.height} @ 24fps)...`,
      percent: 10,
      currentFrame: 0,
      totalFrames,
    });

    // Explicit fixture mode (unit tests): no backend is contacted and the result is flagged.
    if (options.simulate) {
      const videoBlob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], { type: 'video/mp4' });
      onProgress?.({ status: 'Simulated result (no model was run).', percent: 100, currentFrame: totalFrames, totalFrames });
      return {
        videoUrl: 'mock://wan_video.mp4',
        videoBlob,
        durationSeconds: motionMeta.durationSec,
        dimensions: task.dimensions,
        fps: motionMeta.fps,
        totalFrames,
        mode: motionMeta.mode,
        modelUsed: task.modelId,
        cameraTrajectory: motionMeta.cameraMovement,
        audioDurationSnapped: !!motionMeta.audioDurationSnapped,
        simulated: true,
      };
    }

    // Why no backend produced output — reported to the caller if every path fails.
    let engineReached = false;
    let engineError = '';

    // 1. Plajah Local RTX GPU Sidecar on port 51122
    if (typeof fetch === 'function') {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 90000);
      try {
        onProgress?.({
          status: `Executing Wan 2.1/2.2 GPU trajectory (${motionMeta.wanLatentFrames || totalFrames} frames, shift=${motionMeta.flowShift ?? 3.0})...`,
          percent: 35,
          currentFrame: Math.floor(totalFrames * 0.35),
          totalFrames,
        });

        const resp = await fetch(`${WAN_SIDECAR_URL}/generate-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task }),
          signal: ctrl.signal,
        });
        engineReached = true;

        const data = await resp.json().catch(() => null);
        const videoDataUrl: string | undefined = data?.videoUrl || data?.mediaUrl;
        if (resp.ok && data?.success && videoDataUrl) {
          let videoBlob: Blob | null = null;
          if (videoDataUrl.startsWith('data:') && videoDataUrl.includes(',')) {
            const b64 = videoDataUrl.split(',', 2)[1];
            const bin = typeof Buffer !== 'undefined'
              ? Uint8Array.from(Buffer.from(b64, 'base64'))
              : Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            videoBlob = new Blob([bin], { type: 'video/mp4' });
          } else {
            // File/HTTP URL from the engine: load the real bytes rather than inventing an empty blob.
            try {
              const fileResp = await fetch(videoDataUrl, { signal: ctrl.signal });
              if (fileResp.ok) videoBlob = await fileResp.blob();
            } catch {
              videoBlob = null;
            }
          }

          if (videoBlob && videoBlob.size > 0) {
            const playableUrl =
              typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
                ? URL.createObjectURL(videoBlob)
                : videoDataUrl;

            onProgress?.({
              status: 'Video generation complete.',
              percent: 100,
              currentFrame: totalFrames,
              totalFrames,
            });

            return {
              videoUrl: playableUrl,
              videoBlob,
              durationSeconds: motionMeta.durationSec,
              dimensions: task.dimensions,
              fps: motionMeta.fps,
              totalFrames,
              mode: motionMeta.mode,
              modelUsed: data.modelUsed || task.modelId,
              cameraTrajectory: motionMeta.cameraMovement,
              audioDurationSnapped: !!motionMeta.audioDurationSnapped,
            };
          }
          engineError = 'the engine reported success but returned no video data';
        } else {
          engineError = String(data?.error || data?.message || data?.detail || `HTTP ${resp.status}`);
        }
      } catch (e: any) {
        if (engineReached || e?.name === 'AbortError') {
          engineReached = true;
          engineError = e?.name === 'AbortError'
            ? 'the engine did not finish within 90 seconds'
            : String(e?.message || e);
        }
        // Otherwise: connection refused — sidecar offline. Try the Windows native host next.
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 2. Native Windows Host (DirectML / TensorRT on discrete RTX 4070)
    if (isWindowsApp() && typeof window !== 'undefined') {
      const mediaEngine = getNativeMediaEngine();
      if (mediaEngine && typeof mediaEngine.invokeNative === 'function') {
        try {
          onProgress?.({
            status: 'Executing Wan 2.1/2.2 diffusion steps on RTX GPU...',
            percent: 35,
            currentFrame: Math.floor(totalFrames * 0.35),
            totalFrames,
          });

          const res = await mediaEngine.invokeNative('ai_generate_video', {
            taskId: task.id,
            modelId: task.modelId,
            prompt: task.prompt,
            startKeyframeUrl: motionMeta.startKeyframeUrl,
            endKeyframeUrl: motionMeta.endKeyframeUrl,
            mode: motionMeta.mode,
            durationSec: motionMeta.durationSec,
            width: task.dimensions.width,
            height: task.dimensions.height,
            fps: motionMeta.fps,
            steps: task.steps,
            cfgScale: task.cfgScale,
          });

          if (res && res.success && res.videoUrl) {
            onProgress?.({
              status: 'Assembling 24fps cinema stream...',
              percent: 100,
              currentFrame: totalFrames,
              totalFrames,
            });

            return {
              videoUrl: res.videoUrl,
              videoBlob: res.videoBlob || new Blob(),
              durationSeconds: motionMeta.durationSec,
              dimensions: task.dimensions,
              fps: motionMeta.fps,
              totalFrames,
              mode: motionMeta.mode,
              modelUsed: task.modelId,
              cameraTrajectory: motionMeta.cameraMovement,
              audioDurationSnapped: !!motionMeta.audioDurationSnapped,
            };
          }
          engineReached = true;
          engineError = String(res?.error || engineError || 'the Windows native engine returned no video');
        } catch (e: any) {
          console.warn('[WanVideoEngine] Native execution error:', e);
          engineReached = true;
          engineError = String(e?.message || e);
        }
      }
    }

    // 3. No backend produced a video. Fail honestly — never hand back a placeholder clip.
    const failure = engineReached
      ? new WanVideoUnavailableError(
          'engine_error',
          `The local video engine could not generate this shot: ${engineError || 'unknown error'}. ` +
            `Check that the Wan video model (${task.modelId}) is installed in the Plajah local engine, then try again.`
        )
      : new WanVideoUnavailableError(
          'engine_offline',
          `The Plajah local GPU engine is not running (no response from ${WAN_SIDECAR_URL}). ` +
            'Start the local engine and try again — no video was generated.'
        );
    onProgress?.({ status: failure.message, percent: 0, currentFrame: 0, totalFrames });
    throw failure;
  }

  /**
   * Dedicated First & Last Frame Interpolation between two keyframes.
   */
  async generateFirstAndLastFrameInterpolation(spec: {
    startKeyframeUrl: string;
    endKeyframeUrl: string;
    prompt: string;
    cameraMovement?: CinemaMotionIntent['cameraMovement'];
    durationSec?: number;
    resolution?: '480p' | '720p';
    dialogueDurationSec?: number;
  }, onProgress?: WanProgressCallback, options?: WanGenerateOptions): Promise<WanVideoResult> {
    return this.generateMotionShot({
      mode: 'first_and_last_frame',
      startKeyframeUrl: spec.startKeyframeUrl,
      endKeyframeUrl: spec.endKeyframeUrl,
      motionPrompt: spec.prompt,
      cameraMovement: spec.cameraMovement || 'push_in',
      durationSec: spec.durationSec || 3,
      resolution: spec.resolution || '480p',
      dialogueDurationSec: spec.dialogueDurationSec,
    }, onProgress, options);
  }

  /**
   * Generates a video shot snapped precisely to a dialogue take's vocal duration.
   */
  async generateDialogueSnappedShot(spec: {
    keyframeUrl: string;
    prompt: string;
    dialogueTake: FabulaDialogueTake;
    cameraMovement?: CinemaMotionIntent['cameraMovement'];
    resolution?: '480p' | '720p';
  }, onProgress?: WanProgressCallback, options?: WanGenerateOptions): Promise<WanVideoResult> {
    return this.generateMotionShot({
      mode: 'single_keyframe',
      startKeyframeUrl: spec.keyframeUrl,
      motionPrompt: `${spec.prompt}, dialogue: "${spec.dialogueTake.text}"`,
      cameraMovement: spec.cameraMovement || 'push_in',
      dialogueDurationSec: spec.dialogueTake.durationSeconds,
      dialogueAudioRef: spec.dialogueTake.takeId,
      resolution: spec.resolution || '480p',
    }, onProgress, options);
  }
}

export const wanVideoEngine = WanVideoEngine.getInstance();
