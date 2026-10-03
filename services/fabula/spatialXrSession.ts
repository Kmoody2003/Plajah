// spatialXrSession.ts — Native WebXR Dual-Eye Stereoscopic Session Manager
//
// Drives immersive 3D spatial photo and video playback in VR headsets (Meta Quest 2/3/Pro,
// Android XR devices, Apple Vision Pro) directly from the browser.
// Uses WebXR 'immersive-vr' with independent Left Eye and Right Eye rendering passes,
// placing the media in front of the viewer as a stereoscopic spatial window with 6DoF head comfort.

import { SpatialDibrRenderer } from './spatialDibrShader';
import type { LayeredDepthImage, SpatialLayerConfig } from './spatialEngine';
import { DEFAULT_SPATIAL_CONFIG } from './spatialEngine';

export interface XrSessionState {
  active: boolean;
  session: XRSession | null;
  error: string | null;
}

let activeXrSession: XRSession | null = null;
let activeRenderer: SpatialDibrRenderer | null = null;

/**
 * Checks whether the current browser/device supports WebXR immersive VR.
 */
export async function checkWebXrSupport(): Promise<boolean> {
  const xr = (typeof navigator !== 'undefined' ? (navigator as any).xr : null);
  if (!xr || typeof xr.isSessionSupported !== 'function') return false;
  try {
    return await xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}

/**
 * Launches an immersive stereoscopic WebXR session for the given LayeredDepthImage.
 */
export async function launchStereoXrSession(
  ldi: LayeredDepthImage,
  cfg: SpatialLayerConfig = DEFAULT_SPATIAL_CONFIG,
  onEnd?: () => void
): Promise<XRSession | null> {
  const xr = (navigator as any).xr;
  if (!xr) {
    throw new Error('WebXR is not available in this browser');
  }

  // End any existing session
  if (activeXrSession) {
    try { await activeXrSession.end(); } catch { /* */ }
    activeXrSession = null;
  }

  const session: XRSession = await xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
  });

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { xrCompatible: true } as any) as WebGL2RenderingContext;
  if (!gl) {
    session.end();
    throw new Error('Could not create xrCompatible WebGL2 context');
  }

  await (gl as any).makeXRCompatible?.();

  const baseLayer = new (window as any).XRWebGLLayer(session, gl, {
    antialias: true,
    depth: false,
    alpha: false,
  });

  await session.updateRenderState({ baseLayer });

  // Reference space: local-floor anchors to physical ground, viewer anchors to head
  let refSpace: XRReferenceSpace;
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
  } catch {
    refSpace = await session.requestReferenceSpace('local');
  }

  // Instantiate shader renderer
  const renderer = new SpatialDibrRenderer(canvas);
  renderer.uploadTextures(
    ldi.sourceCanvas,
    ldi.depthCanvas,
    ldi.foregroundMatte,
    ldi.backgroundPlate
  );

  activeXrSession = session;
  activeRenderer = renderer;

  const onSessionEnded = () => {
    renderer.dispose();
    activeRenderer = null;
    activeXrSession = null;
    if (onEnd) onEnd();
  };

  session.addEventListener('end', onSessionEnded);

  // Frame animation loop
  const onXRFrame = (time: DOMHighResTimeStamp, frame: XRFrame) => {
    if (!activeXrSession || activeXrSession !== session) return;

    session.requestAnimationFrame(onXRFrame);

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);

    for (const view of pose.views) {
      const viewport = baseLayer.getViewport(view);
      if (!viewport) continue;

      // Mode: 0 = Left eye (-1.0 disparity), 1 = Right eye (+1.0 disparity)
      const eyeMode = view.eye === 'right' ? 1 : 0;

      renderer.render({
        mode: eyeMode,
        disparity: 0.025 * cfg.baseline,
        convergence: cfg.convergence,
        relief: cfg.depthRelief,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
    }
  };

  session.requestAnimationFrame(onXRFrame);
  return session;
}

/**
 * Terminates the active WebXR stereoscopic session if one is running.
 */
export async function exitStereoXrSession(): Promise<void> {
  if (activeXrSession) {
    try {
      await activeXrSession.end();
    } catch (e) {
      console.warn('[spatialXrSession] Error ending session:', e);
    }
    activeXrSession = null;
  }
}
