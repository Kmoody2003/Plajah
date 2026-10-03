// Fast path for "Plajah opened a local file" — Explorer double-click / "Open with" on Windows,
// "Open with" from a file manager or gallery on Android.
//
// index.tsx mounts THIS instead of <App/> when the start URL carries ?open=media, so opening a
// photo never waits on: the main App bundle, Firebase/auth, the Firestore connectivity probe,
// public-album loading, or the "Synchronizing Front Row" gate. It renders the same viewers the
// full app uses (NativePhotoViewer / MediaPlajahPlayer) and nothing else.
//
// Every "go somewhere in Plajah" action hands off to the full app in place (no reload) via
// handOffToFullApp — that is the first moment the platform proper boots.
import React, { Suspense, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { getLaunchMedia, onLaunchMedia, type LaunchMediaPayload } from '../services/launchService';
import { closeWindow, isWindowsApp } from '../services/windowsBridgeService';
import { handOffToFullApp } from '../src/lib/launchTarget';
import { MediaPlajahPlayer } from './player/MediaPlajahPlayer';

const NativePhotoViewer = React.lazy(() => import('./photo/NativePhotoViewer'));

// Start fetching the photo viewer chunk in parallel with asking native for the file.
void import('./photo/NativePhotoViewer');

const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts|m2ts|vob|ogv|3gp)$/i;
const AUDIO_RE = /\.(mp3|wav|flac|aac|m4a|ogg|wma|aiff|aif|opus|alac)$/i;

function exitViewer(): void {
  if (isWindowsApp()) closeWindow();
  else CapApp.exitApp().catch(() => handOffToFullApp());
}

const Blank = () => <div style={{ position: 'fixed', inset: 0, background: '#07080b' }} />;

export default function LocalMediaLaunch() {
  const [payload, setPayload] = useState<LaunchMediaPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getLaunchMedia().then(p => {
      if (!alive) return;
      if (p) setPayload(p);
      else setFailed(true);
    });
    // Android: another file opened while this viewer is up (singleTask re-entry) — show it here.
    const off = onLaunchMedia(p => { setFailed(false); setPayload(p); });
    return () => { alive = false; off(); };
  }, []);

  // Nothing to show (launched with ?open=media but native had no file) — boot the normal app.
  useEffect(() => {
    if (failed) handOffToFullApp();
  }, [failed]);

  if (!payload) return <Blank />;

  const { activeFile, folderFiles, mediaKind } = payload;
  const kind = mediaKind || activeFile.mediaKind || activeFile.kind;
  const isVideo = kind === 'VIDEO' || VIDEO_RE.test(activeFile.name);
  const isAudio = kind === 'AUDIO' || AUDIO_RE.test(activeFile.name);

  if (isVideo || isAudio) {
    return (
      <MediaPlajahPlayer
        file={activeFile}
        folderFiles={folderFiles}
        onExitToFrontRow={() => handOffToFullApp()}
        onUploadToReello={() => handOffToFullApp('reello')}
        onAddToFabula={() => handOffToFullApp('fabula')}
        onSendToPixels={() => handOffToFullApp('pixels')}
        onSendToMelos={() => handOffToFullApp('chora_studio')}
      />
    );
  }

  return (
    <Suspense fallback={<Blank />}>
      <NativePhotoViewer
        initialFile={activeFile}
        files={folderFiles}
        onClose={exitViewer}
        onBackToCatalog={() => handOffToFullApp('photos')}
        onSendToFabula={() => handOffToFullApp('fabula')}
        onSendToPixels={() => handOffToFullApp('pixels')}
        onSendToCrossover={() => handOffToFullApp('crossover')}
      />
    </Suspense>
  );
}
