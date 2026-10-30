/**
 * useLiveFx — the platform's live video effects (lenses, looks, cinematic LUTs, .cube LUTs) for ANY
 * rtcCore session: chat calls, huddles, collab calls, campus broadcasts, class lectures.
 *
 * Nothing runs until the first effect is picked. Then the LiveComposer adopts the session's live
 * camera track and its canvas is published in place of the camera (rtc.publishExternalVideo), so
 * every effect is baked into what the other side receives — and recorded — not just the preview.
 * "Off" disposes the composer and republishes a fresh camera track, so an idle call stays at zero
 * GPU cost. Camera switches while effects are on must go through switchCamera here: the session's
 * own switchVideoDevice would replace (and stop) the composer's canvas track.
 *
 * Go Live (MobileLiveStreamer) drives its composer directly because it also does camera modes,
 * VTubers and audience FX; this hook is the shared subset.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseRtcSession } from './useRtcSession';
import type { LiveComposer, LookId } from '../services/liveComposer';
import type { LensId } from '../services/lenses/lensEngine';

export type FxLook = LookId | 'custom' | `lut:${string}`;

export interface LiveFx {
  active: boolean;
  lens: LensId;
  look: FxLook;
  busy: boolean;
  error: string | null;
  lensStatus: string;
  setLens: (id: LensId) => Promise<void>;
  setLook: (id: LookId) => Promise<void>;
  /** One of services/color/cinematicLutLibrary's CINEMATIC_LUTS. */
  setLut: (id: string) => Promise<void>;
  loadCube: (file: File) => Promise<void>;
  /** Back to the raw camera; frees the GPU. */
  off: () => Promise<void>;
  /** Pick a camera — safe whether or not effects are on. */
  switchCamera: (deviceId: string) => Promise<void>;
  clearError: () => void;
}

type Rtc = Pick<UseRtcSession, 'localStream' | 'publishExternalVideo' | 'cameraStreamForDevice' | 'switchVideoDevice'>;

export function useLiveFx(rtc: Rtc): LiveFx {
  const compRef = useRef<LiveComposer | null>(null);
  const rtcRef = useRef(rtc);
  rtcRef.current = rtc;
  const [active, setActive] = useState(false);
  const [lens, setLensId] = useState<LensId>('none');
  const [look, setLookId] = useState<FxLook>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lensStatus, setLensStatus] = useState('');

  const engage = useCallback(async (): Promise<LiveComposer> => {
    if (compRef.current) return compRef.current;
    const cam = rtcRef.current.localStream?.getVideoTracks()[0];
    if (!cam || cam.readyState !== 'live') throw new Error('Turn your camera on to use lenses and looks.');
    const { LiveComposer } = await import('../services/liveComposer');
    const c = new LiveComposer();
    await c.adoptFrontTrack(cam);
    await c.setMode('front');
    await rtcRef.current.publishExternalVideo(c.getStream().getVideoTracks()[0]);
    compRef.current = c;
    setActive(true);
    return c;
  }, []);

  const run = useCallback(async (fn: (c: LiveComposer) => Promise<void> | void) => {
    setBusy(true);
    try { await fn(await engage()); setError(null); }
    catch (e: any) { setError(e?.message || "Couldn't apply that effect on this device."); }
    finally { setBusy(false); }
  }, [engage]);

  const setLens = useCallback((id: LensId) => run(async c => { await c.setLens(id); setLensId(id); }), [run]);
  const setLook = useCallback((id: LookId) => run(c => { c.setLook(id); setLookId(id); }), [run]);
  const setLut = useCallback((id: string) => run(async c => {
    const { CINEMATIC_LUTS, generate3dCubeText } = await import('../services/color/cinematicLutLibrary');
    const lut = CINEMATIC_LUTS.find(l => l.id === id);
    if (!lut) return;
    if (!c.setCubeLut(generate3dCubeText(lut, 17))) throw new Error('LUTs need WebGL on this device.');
    setLookId(`lut:${id}`);
  }), [run]);
  const loadCube = useCallback(async (file: File) => {
    const text = await file.text();
    await run(c => {
      if (!c.setCubeLut(text)) throw new Error("Couldn't load that LUT — it needs a 3D .cube file (LUT_3D_SIZE).");
      setLookId('custom');
    });
  }, [run]);

  const off = useCallback(async () => {
    const c = compRef.current;
    if (!c) return;
    setBusy(true);
    const deviceId = c.getFrontTrack()?.getSettings?.().deviceId;
    // Release the camera before reopening it — some phones can't open the same camera twice.
    c.dispose();
    compRef.current = null;
    try {
      const st = await rtcRef.current.cameraStreamForDevice(deviceId || '');
      await rtcRef.current.publishExternalVideo(st.getVideoTracks()[0]);
      setError(null);
    } catch (e: any) { setError(e?.message || "Couldn't reopen the camera."); }
    setActive(false); setLensId('none'); setLookId('none'); setLensStatus(''); setBusy(false);
  }, []);

  const switchCamera = useCallback(async (deviceId: string) => {
    const c = compRef.current;
    if (!c) { rtcRef.current.switchVideoDevice(deviceId); return; }
    try {
      const old = c.getFrontTrack();
      if (old) old.stop();                       // free it first (single-camera phones)
      const st = await rtcRef.current.cameraStreamForDevice(deviceId);
      await c.adoptFrontTrack(st.getVideoTracks()[0]);
    } catch (e: any) { setError(e?.message || "Couldn't switch to that camera."); }
  }, []);

  useEffect(() => {
    if (lens === 'none') { setLensStatus(''); return; }
    const t = setInterval(() => setLensStatus(compRef.current?.getLensStatus() ?? ''), 800);
    return () => clearInterval(t);
  }, [lens]);

  useEffect(() => () => { compRef.current?.dispose(); compRef.current = null; }, []);

  return { active, lens, look, busy, error, lensStatus, setLens, setLook, setLut, loadCube, off, switchCamera, clearError: () => setError(null) };
}
