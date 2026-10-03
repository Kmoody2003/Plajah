// Set-to-Cut P3/P4 — capture a take proxy from the device camera, and the seam
// where professional-camera ingest adapters plug in.
//
// P3 (browser, works today): record a low-bitrate proxy from the device camera/mic
// via MediaRecorder — the on-set device IS the camera source for phone/indie shoots,
// and the fast-preview proxy for everything else.
//
// P4 (native/desktop): don't integrate cameras one at a time — integrate the
// TRANSPORT layer. Each tier below is a source that yields (scene/take metadata +
// a proxy). The device recorder is the one browser-native source; the pro tiers are
// declared as the seam their native (Capacitor) / desktop (Crossover) adapters fill.

// ─── P3: device-camera recorder ──────────────────────────────────────────────

export interface TakeRecording { blob: Blob; durationSec: number; mimeType: string; }
export interface TakeRecorderHandle {
  stream: MediaStream;
  stop: () => Promise<TakeRecording>;
  cancel: () => void;
}

function pickRecorderMime(): string {
  const prefs = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Safari — short-GOP H.264 proxy
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const m of prefs) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return 'video/webm';
}

/** Start recording a ~720p / ~5 Mbps proxy from the device camera + mic. */
export async function startTakeRecorder(opts: { deviceId?: string } = {}): Promise<TakeRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}) },
    audio: true,
  });
  const mimeType = pickRecorderMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
  const startedAt = Date.now();
  const stopTracks = () => stream.getTracks().forEach(track => { try { track.stop(); } catch { /* ignore */ } });
  rec.start(1000);
  const finalize = (): TakeRecording => ({ blob: new Blob(chunks, { type: mimeType }), durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)), mimeType });
  return {
    stream,
    stop: () => new Promise<TakeRecording>(resolve => {
      rec.onstop = () => { stopTracks(); resolve(finalize()); };
      try { rec.stop(); } catch { stopTracks(); resolve(finalize()); }
    }),
    cancel: () => { try { rec.stop(); } catch { /* ignore */ } stopTracks(); },
  };
}

/** Wrap a recording as a File the take-log's addTake() ingests unchanged. */
export function recordingToFile(rec: TakeRecording, sceneNum: string, takeNumber: number): File {
  const ext = rec.mimeType.includes('mp4') ? 'mp4' : 'webm';
  return new File([rec.blob], `sc${sceneNum || 'x'}_t${takeNumber}.${ext}`, { type: rec.mimeType });
}

// ─── P4: camera-ingest adapter seam ──────────────────────────────────────────

import { isWindowsApp } from './windowsBridgeService';
import { nativeCameraControl } from './mediaEngine/bridge';

export type CameraTierKind = 'device' | 'manual' | 'c2c' | 'blackmagic' | 'arri' | 'canon' | 'ndi_srt' | 'omt' | 'avb';
export interface CameraTier {
  kind: CameraTierKind;
  label: string;
  transport: string;
  runtime: 'browser' | 'native' | 'server';
  available: boolean;   // true = usable in current environment
  note: string;
}

/** The ingest transport table — the seam pro-camera adapters plug into.
 *  Pro camera tiers (Blackmagic, ARRI, Canon, NDI/SRT, OMT, AVB) are unlocked on Windows Native. */
export const getCameraTiers = (): CameraTier[] => {
  const isNative = isWindowsApp();
  return [
    { kind: 'device',     label: 'This device',      transport: 'getUserMedia · MediaRecorder',              runtime: 'browser', available: true,      note: 'Phone/laptop camera → low-bitrate proxy. Works today.' },
    { kind: 'manual',     label: 'Manual upload',    transport: 'file picker',                                runtime: 'browser', available: true,      note: 'Drop a proxy exported from any camera or card.' },
    { kind: 'c2c',        label: 'Camera-to-Cloud',  transport: 'Frame.io C2C API / webhooks',                runtime: 'server',  available: false,     note: 'Camera-agnostic: Teradek/Accsoon edge uploaders POST proxies + scene/take metadata. Needs a server webhook.' },
    { kind: 'blackmagic', label: 'Blackmagic',       transport: 'Camera Control protocol + BRAW SDK',         runtime: 'native',  available: isNative,  note: 'Slate metadata over the network; BRAW conform to masters on the desktop tier.' },
    { kind: 'arri',       label: 'ARRI',             transport: 'Camera Access Protocol (REST + WebSocket)',  runtime: 'native',  available: isNative,  note: 'The most-open pro API — scene/take + reel over the network.' },
    { kind: 'canon',      label: 'Canon',            transport: 'CCAPI (REST)',                               runtime: 'native',  available: isNative,  note: 'REST camera control + metadata on the native/desktop build.' },
    { kind: 'ndi_srt',    label: 'NDI / SRT',        transport: 'low-latency contribution stream',            runtime: 'native',  available: isNative,  note: 'Live video-village monitoring feed; proxies land as takes.' },
    { kind: 'omt',        label: 'OMT (Open Media Transport)', transport: 'ultra-low latency LAN feed',      runtime: 'native',  available: isNative,  note: 'Studio LAN contribution with alpha transparency and sub-frame latency.' },
    { kind: 'avb',        label: 'AVB / Milan Network Audio',  transport: 'IEEE 1722 AVTP deterministic audio', runtime: 'native', available: isNative,  note: 'Direct multi-track stage box & microphone audio capture synchronized via gPTP.' },
  ];
};

export const CAMERA_TIERS = getCameraTiers();

export const availableCameraTiers = () => getCameraTiers().filter(tier => tier.available);
export const pendingCameraTiers = () => getCameraTiers().filter(tier => !tier.available);

/** Dispatch command to a connected pro camera via the native bridge. */
export async function sendCameraCommand(
  kind: CameraTierKind,
  command: string,
  endpoint = '',
  params?: Record<string, unknown>,
): Promise<any> {
  const protoMap: Record<string, string> = {
    canon: 'canon_ccapi',
    arri: 'arri_cap',
    blackmagic: 'blackmagic_control',
  };
  const protocol = protoMap[kind] || 'canon_ccapi';
  return nativeCameraControl(kind, command, protocol, endpoint, params);
}
