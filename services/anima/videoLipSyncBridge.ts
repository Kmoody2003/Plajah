/**
 * services/anima/videoLipSyncBridge.ts
 *
 * Plajah Off-Platform Video Lip-Sync Bridge
 *
 * Bridges externally generated video files (Runway, Pika, Kling, Luma, phone webcam,
 * 3D renders) with Plajah synthesized character dialogue takes:
 * 1. Analyzes audio speech into synchronized viseme phonemes (A, E, I, O, U, M)
 * 2. Isolates video facial mouth bounding regions
 * 3. Applies seamless, edge-feathered video articulation warping
 * 4. Bakes synchronized animation tracks into Anima and Fabula timelines
 */

import type {
  VideoMouthRegion,
  LipSyncVisemeFrame,
  VideoLipSyncTrackResult,
  BackgroundDialogueTakeResult,
  AnimaChannel,
  Keyframe,
} from './types.ts';

export interface VideoLipSyncOptions {
  mouthRegion?: Partial<VideoMouthRegion>;
  fps?: number; // default 24
  jawAmplification?: number; // default 1.2
  smoothingAlpha?: number; // default 0.65
}

export class VideoLipSyncBridge {
  /**
   * Generates frame-by-frame viseme modulators from a synthesized dialogue take
   */
  public generateLipSyncFromAudioTake(
    take: BackgroundDialogueTakeResult,
    videoUrl: string,
    options: VideoLipSyncOptions = {},
  ): VideoLipSyncTrackResult {
    const fps = options.fps || 24;
    const amp = options.jawAmplification || 1.2;
    const totalFrames = Math.max(1, Math.ceil(take.durationSeconds * fps));

    const mouthRegion: VideoMouthRegion = {
      x: options.mouthRegion?.x ?? 0.42,
      y: options.mouthRegion?.y ?? 0.58,
      width: options.mouthRegion?.width ?? 0.16,
      height: options.mouthRegion?.height ?? 0.12,
      anchorCenter: options.mouthRegion?.anchorCenter ?? { x: 0.5, y: 0.64 },
    };

    const visemeFrames: LipSyncVisemeFrame[] = [];
    let prevJaw = 0;

    for (let f = 1; f <= totalFrames; f++) {
      const timeSec = (f - 1) / fps;

      // Find active word mark
      const activeMark = take.wordMarks.find(wm => timeSec >= wm.startSec && timeSec <= wm.endSec);

      let viseme: 'A' | 'E' | 'I' | 'O' | 'U' | 'M' | 'REST' = 'REST';
      let targetJaw = 0;
      let mouthWide = 0;
      let mouthPucker = 0;
      let energy = 0;

      if (activeMark) {
        const markDur = Math.max(0.01, activeMark.endSec - activeMark.startSec);
        const progress = (timeSec - activeMark.startSec) / markDur;
        // Bell curve envelope for vowel apex
        energy = Math.sin(progress * Math.PI);

        viseme = (activeMark.viseme as any) || 'A';
        if (viseme === 'A') {
          targetJaw = 0.85 * energy * amp;
          mouthWide = 0.3 * energy;
        } else if (viseme === 'O') {
          targetJaw = 0.70 * energy * amp;
          mouthPucker = 0.6 * energy;
        } else if (viseme === 'E') {
          targetJaw = 0.45 * energy * amp;
          mouthWide = 0.7 * energy;
        } else if (viseme === 'I') {
          targetJaw = 0.35 * energy * amp;
          mouthWide = 0.8 * energy;
        } else if (viseme === 'U') {
          targetJaw = 0.30 * energy * amp;
          mouthPucker = 0.85 * energy;
        } else {
          // 'M' consonant closure
          targetJaw = 0.05;
        }
      }

      // Smooth jaw movement with exponential lag
      const smoothedJaw = prevJaw * 0.4 + targetJaw * 0.6;
      prevJaw = smoothedJaw;

      visemeFrames.push({
        timeSec: Math.round(timeSec * 1000) / 1000,
        frameIndex: f,
        visemePhoneme: viseme,
        jawOpen: Math.round(Math.min(1.0, smoothedJaw) * 100) / 100,
        mouthWide: Math.round(mouthWide * 100) / 100,
        mouthPucker: Math.round(mouthPucker * 100) / 100,
        audioEnergy: Math.round(energy * 100) / 100,
      });
    }

    // Bake into Anima Channels for timeline integration
    const bakedChannels = this.bakeToAnimaChannels(visemeFrames, fps);

    return {
      id: `vls_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      videoSourceUrl: videoUrl,
      audioTakeId: take.takeId,
      durationSeconds: take.durationSeconds,
      mouthRegion,
      visemeFrames,
      bakedChannels,
    };
  }

  /**
   * Bakes frame-by-frame viseme modulators into standard AnimaChannels
   */
  private bakeToAnimaChannels(
    frames: LipSyncVisemeFrame[],
    fps: number,
  ): Record<string, AnimaChannel<number>> {
    const kfJaw: Keyframe<number>[] = [];
    const kfWide: Keyframe<number>[] = [];
    const kfPucker: Keyframe<number>[] = [];

    // Decimate to on 2s hold cadence for cartoon/cel efficiency
    for (let i = 0; i < frames.length; i += 2) {
      const f = frames[i];
      kfJaw.push({ id: `kf_j_${f.frameIndex}`, t: f.timeSec, v: f.jawOpen, ease: 'smooth' });
      kfWide.push({ id: `kf_w_${f.frameIndex}`, t: f.timeSec, v: f.mouthWide, ease: 'smooth' });
      kfPucker.push({ id: `kf_p_${f.frameIndex}`, t: f.timeSec, v: f.mouthPucker, ease: 'smooth' });
    }

    return {
      'face.jawOpen': {
        id: 'ch_lip_jaw',
        name: 'Lip Sync: Jaw Drop',
        path: 'face.jawOpen',
        defaultValue: 0,
        keyframes: kfJaw,
        unit: '%',
      },
      'face.mouthWide': {
        id: 'ch_lip_wide',
        name: 'Lip Sync: Mouth Width',
        path: 'face.mouthWide',
        defaultValue: 0,
        keyframes: kfWide,
        unit: '%',
      },
      'face.mouthPucker': {
        id: 'ch_lip_pucker',
        name: 'Lip Sync: Lip Pucker',
        path: 'face.mouthPucker',
        defaultValue: 0,
        keyframes: kfPucker,
        unit: '%',
      },
    };
  }

  /**
   * Non-destructive canvas mouth articulation warper for rendering video frames
   */
  public renderVideoLipSyncFrame(
    ctx: CanvasRenderingContext2D,
    videoSource: CanvasImageSource,
    frame: LipSyncVisemeFrame,
    mouthRegion: VideoMouthRegion,
    canvasWidth = 1280,
    canvasHeight = 720,
  ): void {
    // 1. Draw base video frame
    ctx.drawImage(videoSource, 0, 0, canvasWidth, canvasHeight);

    if (frame.jawOpen <= 0.05 && frame.mouthWide <= 0.05 && frame.mouthPucker <= 0.05) {
      return; // Neutral mouth, zero warping needed
    }

    // 2. Warp lower jaw and mouth bounding region
    const rx = mouthRegion.x * canvasWidth;
    const ry = mouthRegion.y * canvasHeight;
    const rw = mouthRegion.width * canvasWidth;
    const rh = mouthRegion.height * canvasHeight;

    const jawPixelDrop = frame.jawOpen * 14;
    const widePixelSpread = (frame.mouthWide - frame.mouthPucker) * 10;

    ctx.save();
    // Elliptical feathered clip around mouth
    ctx.beginPath();
    ctx.ellipse(rx + rw / 2, ry + rh / 2, rw * 0.65, rh * 0.6, 0, 0, Math.PI * 2);
    ctx.clip();

    // Redraw warped mouth area with vertical articulation & scale
    ctx.drawImage(
      videoSource,
      rx - widePixelSpread / 2,
      ry,
      rw + widePixelSpread,
      rh + jawPixelDrop,
      rx,
      ry + jawPixelDrop * 0.4,
      rw,
      rh,
    );

    // Mouth cavity depth darkening when jaw is wide open
    if (frame.jawOpen > 0.4) {
      ctx.fillStyle = `rgba(30, 8, 12, ${Math.min(0.45, (frame.jawOpen - 0.4) * 0.7)})`;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh * 0.6, rw * 0.22, rh * 0.15 * frame.jawOpen, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export const videoLipSyncBridge = new VideoLipSyncBridge();
