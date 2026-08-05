/**
 * usePlayerTracker — real-time player coordinate + speed tracking via TF.js MoveNet.
 *
 * Dynamically imports @tensorflow/tfjs + @tensorflow-models/pose-detection at runtime.
 * If the packages aren't installed the hook silently returns empty state — zero impact on
 * the rest of the app if a project doesn't have TF.js.
 *
 * Usage:
 *   const { players, fps, active } = usePlayerTracker(videoRef, enabled);
 *   // Draw player dots on ScoreBugCanvas via the `players` array
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export interface TrackedPlayer {
  id: number;
  x: number;        // 0–1 normalised (fraction of video width)
  y: number;        // 0–1 normalised (fraction of video height)
  confidence: number;
  speed: number;    // rough mph estimate
}

interface TrackerState {
  players: TrackedPlayer[];
  fps: number;
  active: boolean;
}

export function usePlayerTracker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
): TrackerState {
  const [state, setState] = useState<TrackerState>({ players: [], fps: 0, active: false });
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const prevPosRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const fpsRef = useRef({ count: 0, ts: Date.now() });
  const mountedRef = useRef(true);

  const loadDetector = useCallback(async (): Promise<boolean> => {
    if (detectorRef.current) return true;
    try {
      // Dynamic — won't crash if TF.js isn't installed
      const tf = await import('@tensorflow/tfjs' as any).catch(() => null);
      if (!tf) return false;
      await import('@tensorflow/tfjs-backend-webgl' as any).catch(() => null);
      await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
      const poseDetection = await import('@tensorflow-models/pose-detection' as any).catch(() => null);
      if (!poseDetection) return false;

      detectorRef.current = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
          enableSmoothing: true,
          minPoseScore: 0.25,
        }
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const runLoop = useCallback(async () => {
    const video = videoRef.current;
    if (!mountedRef.current) return;
    if (!video || !detectorRef.current || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    try {
      const poses: any[] = await detectorRef.current.estimatePoses(video, {
        maxPoses: 6,
        flipHorizontal: false,
      });

      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;

      const players: TrackedPlayer[] = poses.map((pose, idx) => {
        const kps: any[] = pose.keypoints ?? [];
        const find = (name: string) => kps.find((k: any) => k.name === name);

        // Prefer nose; fall back to hip midpoint for positional centre
        const nose = find('nose');
        const lHip = find('left_hip');
        const rHip = find('right_hip');

        const rawX = (nose?.score ?? 0) > 0.3
          ? nose.x
          : ((lHip?.x ?? 0) + (rHip?.x ?? 0)) / 2;
        const rawY = (nose?.score ?? 0) > 0.3
          ? nose.y
          : ((lHip?.y ?? 0) + (rHip?.y ?? 0)) / 2;

        const nx = rawX / vw;
        const ny = rawY / vh;

        // Speed from frame delta (pixels/frame → rough mph)
        const prev = prevPosRef.current.get(idx);
        const dpx = prev ? (nx - prev.x) * vw : 0;
        const dpy = prev ? (ny - prev.y) * vh : 0;
        const speed = Math.min(Math.sqrt(dpx * dpx + dpy * dpy) * 30 * 0.022, 35);
        prevPosRef.current.set(idx, { x: nx, y: ny });

        return { id: idx, x: nx, y: ny, confidence: pose.score ?? 0, speed };
      });

      // FPS counter
      fpsRef.current.count++;
      const elapsed = (Date.now() - fpsRef.current.ts) / 1000;
      let fps = state.fps;
      if (elapsed >= 1) {
        fps = Math.round(fpsRef.current.count / elapsed);
        fpsRef.current = { count: 0, ts: Date.now() };
      }

      if (mountedRef.current) setState({ players, fps, active: true });
    } catch {
      // silently skip bad frames
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [videoRef, state.fps]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      setState({ players: [], fps: 0, active: false });
      return;
    }

    let cancelled = false;
    loadDetector().then(ok => {
      if (ok && !cancelled) {
        setState(s => ({ ...s, active: true }));
        runLoop();
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
