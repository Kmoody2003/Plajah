// liveFeed — a playing <video> for any live feed, shared by visual fills,
// trackers and avatars so one camera isn't opened three times.
//
//   'camera' | 'camera:<deviceId>'   getUserMedia
//   any other id                     an app-bus channel (switcher:pgm, ambo:audience, …)
import { getAppOutputStream, onAppOutputStream } from '../mediaEngine/bridge';

interface Feed { video: HTMLVideoElement; stream: MediaStream | null; refs: number; own: boolean; stopBus?: () => void }
const feeds = new Map<string, Feed>();

export function liveFeedVideo(id: string): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  let f = feeds.get(id);
  if (!f) {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.autoplay = true;
    f = { video, stream: null, refs: 0, own: false };
    feeds.set(id, f);
    const attach = (s: MediaStream, own: boolean) => { f!.stream = s; f!.own = own; video.srcObject = s; void video.play().catch(() => undefined); };
    if (id === 'camera' || id.startsWith('camera:')) {
      const deviceId = id.slice(7) || undefined;
      navigator.mediaDevices?.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720 }, audio: false })
        .then(s => attach(s, true)).catch(() => undefined);
    } else {
      const s = getAppOutputStream(id);
      if (s) attach(s, false);
      f.stopBus = onAppOutputStream(id, (st) => attach(st, false));
    }
  }
  f.refs++;
  return f.video;
}

export function releaseLiveFeed(id: string) {
  const f = feeds.get(id); if (!f) return;
  if (--f.refs > 0) return;
  f.stopBus?.();
  if (f.own) f.stream?.getTracks().forEach(t => t.stop());
  f.video.srcObject = null;
  feeds.delete(id);
}

export const liveFeedReady = (v: HTMLVideoElement | null) => !!v && v.readyState >= 2 && v.videoWidth > 0;

/** Known channels for pickers. */
export const LIVE_FEED_CHOICES: { id: string; name: string }[] = [
  { id: 'camera', name: 'Camera (this device)' },
  { id: 'switcher:pgm', name: 'TV Studio · Program' },
  { id: 'ambo:audience', name: 'Stage · Audience output' },
  { id: 'fabula:graphics', name: 'Fabula CG · Graphics layer' },
];
