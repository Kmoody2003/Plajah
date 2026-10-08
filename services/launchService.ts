// Native launch plumbing shared by the Windows (WinUI/WebView2) and Android (Capacitor) shells.
//
//  - getLaunchMedia(): the file the OS opened Plajah with (cold start). Pulled, not pushed, so it
//    can never be lost to a "posted before the listener existed" race.
//  - onLaunchMedia(): a file opened while Plajah is ALREADY running (Android singleTask re-entry;
//    Windows posts OPEN_MEDIA_FILE to a live window).
//  - onLaunchExperience(): an experience icon tapped while Plajah is already running.
//
// Deliberately free of Firebase/App imports — LocalMediaLaunch depends on it and must stay light.
import { registerPlugin, Capacitor } from '@capacitor/core';
import { isWindowsApp, onNativeMessage, postToNative, type WindowsPickedFile } from './windowsBridgeService';

export interface LaunchMediaPayload {
  mediaKind?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'UNKNOWN';
  activeFile: WindowsPickedFile;
  folderFiles: WindowsPickedFile[];
}

interface PlajahLaunchPlugin {
  getLaunchMedia(): Promise<{ payload?: string }>;
  addListener(event: 'launchMedia' | 'launchExperience', cb: (data: { payload?: string; experience?: string }) => void): Promise<{ remove: () => void }>;
}

const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const PlajahLaunch = registerPlugin<PlajahLaunchPlugin>('PlajahLaunch');

function parsePayload(raw: unknown): LaunchMediaPayload | null {
  try {
    const msg: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!msg?.activeFile) return null;
    return {
      mediaKind: msg.mediaKind || msg.activeFile.mediaKind,
      activeFile: msg.activeFile,
      folderFiles: msg.folderFiles?.length ? msg.folderFiles : [msg.activeFile],
    };
  } catch {
    return null;
  }
}

export function getLaunchMedia(timeoutMs = 4000): Promise<LaunchMediaPayload | null> {
  if (isAndroidNative()) {
    return PlajahLaunch.getLaunchMedia()
      .then(r => parsePayload(r?.payload))
      .catch(() => null);
  }
  if (isWindowsApp()) {
    return new Promise(resolve => {
      let done = false;
      const finish = (p: LaunchMediaPayload | null) => {
        if (done) return;
        done = true;
        unsub();
        clearTimeout(timer);
        resolve(p);
      };
      // Native also pushes OPEN_MEDIA_FILE on NavigationCompleted; accept whichever lands first.
      const unsub = onNativeMessage(msg => {
        if (msg.type === 'OPEN_MEDIA_FILE') finish(parsePayload(msg));
      });
      const timer = setTimeout(() => finish(null), timeoutMs);
      postToNative({ type: 'GET_LAUNCH_MEDIA' });
    });
  }
  return Promise.resolve(null);
}

/** Android only — Windows already routes live-window opens through onMediaFileActivated. */
export function onLaunchMedia(cb: (p: LaunchMediaPayload) => void): () => void {
  if (!isAndroidNative()) return () => {};
  let handle: { remove: () => void } | null = null;
  let cancelled = false;
  PlajahLaunch.addListener('launchMedia', d => {
    const p = parsePayload(d?.payload);
    if (p) cb(p);
  }).then(h => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
  return () => { cancelled = true; handle?.remove(); };
}

export function onLaunchExperience(cb: (slug: string) => void): () => void {
  const offs: Array<() => void> = [];
  if (isWindowsApp()) {
    offs.push(onNativeMessage(msg => {
      const slug = msg.experience;
      if (msg.type === 'LAUNCH_EXPERIENCE' && typeof slug === 'string') cb(slug);
    }));
  }
  if (isAndroidNative()) {
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    PlajahLaunch.addListener('launchExperience', d => {
      if (d?.experience) cb(d.experience);
    }).then(h => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
    offs.push(() => { cancelled = true; handle?.remove(); });
  }
  return () => offs.forEach(off => off());
}
