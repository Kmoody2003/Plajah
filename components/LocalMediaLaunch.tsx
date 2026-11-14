// components/LocalMediaLaunch.tsx — Lightweight OS "Open With" launch shell (?open=media).
// Zero top-level Firebase/App imports so Photos, Video, Audio, and Docs open instantaneously,
// rendered through the unified PlajahMediaStage with instant handoff into Plajah Files or Cinema.

import React, { useEffect, useState } from 'react';
import { getLaunchMedia, onLaunchMedia, type LaunchMediaPayload } from '../services/launchService';
import {
  closeWindow,
  isWindowsApp,
  onMediaFileActivated,
  type WindowsPickedFile,
} from '../services/windowsBridgeService';
import { handOffToFullApp } from '../src/lib/launchTarget';
import type { StageMediaItem } from '../services/files/unifiedVfs';
import { PlajahMediaStage } from './media/PlajahMediaStage';

const LazyReelloPlayer = React.lazy(() => import('./reello/ReelloUniversalVideoPlayer'));

function pickedToStageItem(f: WindowsPickedFile): StageMediaItem {
  return {
    name: f.name,
    fullPath: f.fullPath,
    folderPath: f.folderPath,
    url: f.url,
    size: f.size,
    lastModified: f.lastModified,
    mediaKind: f.mediaKind || (f.kind as any),
    isLocal: true,
    locationKind: 'local',
  };
}

export const LocalMediaLaunch: React.FC = () => {
  const [payload, setPayload] = useState<LaunchMediaPayload | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [cinemaState, setCinemaState] = useState<{ item: StageMediaItem; siblings: StageMediaItem[] } | null>(null);

  useEffect(() => {
    let alive = true;
    getLaunchMedia().then(p => {
      if (!alive) return;
      if (p) setPayload(p);
      else setTimedOut(true);
    });
    const offAndroid = onLaunchMedia(p => setPayload(p));
    const offWin = onMediaFileActivated(p => setPayload(p));
    return () => {
      alive = false;
      offAndroid();
      offWin();
    };
  }, []);

  if (!payload) {
    return (
      <div className="fixed inset-0 bg-[#07080b] text-white flex flex-col items-center justify-center gap-3 p-6 select-none">
        {!timedOut ? (
          <>
            <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            <p className="text-xs text-white/60">Opening file in Plajah Media Stage…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/85">No local file was handed to Plajah.</p>
            <button
              onClick={() => handOffToFullApp('files')}
              className="px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 cursor-pointer"
            >
              Open Plajah Files
            </button>
          </>
        )}
      </div>
    );
  }

  const folderItems = (payload.folderFiles?.length ? payload.folderFiles : [payload.activeFile]).map(pickedToStageItem);
  const activeStageItem = pickedToStageItem(payload.activeFile);

  if (cinemaState) {
    return (
      <React.Suspense
        fallback={
          <div className="fixed inset-0 bg-black text-white flex items-center justify-center text-sm">
            Loading Reello Cinema…
          </div>
        }
      >
        <LazyReelloPlayer
          file={{
            name: cinemaState.item.name,
            fullPath: cinemaState.item.fullPath || '',
            folderPath: cinemaState.item.folderPath,
            size: cinemaState.item.size || 0,
            lastModified: cinemaState.item.lastModified,
            url: cinemaState.item.url,
            mediaKind: 'VIDEO',
          }}
          folderFiles={payload.folderFiles}
          context="LOCAL"
          title={cinemaState.item.name}
          onClose={() => setCinemaState(null)}
        />
      </React.Suspense>
    );
  }

  const handleClose = () => {
    if (isWindowsApp()) {
      closeWindow();
      return;
    }
    handOffToFullApp('files');
  };

  const handleRevealInPlajahFiles = (item: StageMediaItem) => {
    try {
      if (item.folderPath || item.fullPath) {
        sessionStorage.setItem(
          'plajah:pending-files-target',
          JSON.stringify({ folderPath: item.folderPath || '', fullPath: item.fullPath || '' }),
        );
      }
    } catch { /* ignore */ }
    handOffToFullApp('files');
  };

  return (
    <PlajahMediaStage
      activeItem={activeStageItem}
      playlist={folderItems}
      mode="standalone"
      onSelectItem={next => {
        const picked =
          payload.folderFiles.find(
            f => (f.fullPath && next.fullPath ? f.fullPath === next.fullPath : f.name === next.name && f.url === next.url),
          ) || {
            name: next.name,
            fullPath: next.fullPath || '',
            folderPath: next.folderPath,
            size: next.size || 0,
            lastModified: next.lastModified,
            url: next.url,
            mediaKind: (next.mediaKind === 'IMAGE' || next.mediaKind === 'VIDEO' || next.mediaKind === 'AUDIO' ? next.mediaKind : 'UNKNOWN') as any,
          };
        setPayload({ ...payload, activeFile: picked });
      }}
      onClose={handleClose}
      onRevealInExplorer={handleRevealInPlajahFiles}
      onOpenCinemaPlayer={(item, siblings) => setCinemaState({ item, siblings })}
      onSendToChora={() => handOffToFullApp('chora')}
    />
  );
};

export default LocalMediaLaunch;
