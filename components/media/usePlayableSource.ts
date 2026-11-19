// usePlayableSource — wide-format playback for the media stage.
//
// WebView2/Chromium plays H.264/VP9/AV1 video and AAC/MP3/Opus/FLAC/WAV audio. For anything else the
// Windows app converts the file with its local ffmpeg (remux when it can, transcode when it must) via
// https://localmedia.plajah/__playable and we swap the <video>/<audio> src to the cached result.
// Formats Chromium never decodes go straight to conversion; ambiguous containers (MKV/MOV/MP4 with
// HEVC, AC-3 …) are tried directly first and converted only if the element reports an error.

import { useCallback, useEffect, useRef, useState } from 'react';
import { isWindowsApp } from '../../services/windowsBridgeService';

// Containers/codecs Chromium cannot play at all — skip the doomed first attempt.
const ALWAYS_CONVERT = new Set([
  'avi', 'wmv', 'asf', 'flv', 'f4v', 'mpg', 'mpeg', 'm2v', 'vob', 'ts', 'mts', 'm2ts', 'tod', 'mod',
  'divx', 'xvid', 'rm', 'rmvb', 'dv', 'mxf', 'y4m', '3g2',
  'wma', 'aif', 'aiff', 'aifc', 'ape', 'ac3', 'eac3', 'dts', 'wv', 'tta', 'mka', 'amr', 'au', 'ra', 'mpc',
]);

export interface PlayableState {
  src: string;
  converting: boolean;
  progress: number;
  mode?: 'remux' | 'transcode';
  error: string | null;
  /** Wire to the media element's onError. */
  onMediaError: (e: React.SyntheticEvent<HTMLMediaElement>) => void;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function usePlayableSource(
  item: { url?: string; name: string; fullPath?: string },
  enabled: boolean,
): PlayableState {
  const original = item.url || '';
  const canConvert = isWindowsApp() && !!item.fullPath;
  const [src, setSrc] = useState(original);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<'remux' | 'transcode' | undefined>();
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const convert = useCallback(async () => {
    if (!canConvert || !item.fullPath) return false;
    const run = ++runRef.current;
    setConverting(true);
    setProgress(0);
    setError(null);
    const statusUrl = `https://localmedia.plajah/__playable?path=${encodeURIComponent(item.fullPath)}`;
    try {
      // Poll quickly at first (remuxes finish in a second or two), then back off.
      for (let i = 0; run === runRef.current; i++) {
        const r = await fetch(statusUrl, { cache: 'no-store' });
        const s = await r.json();
        if (run !== runRef.current) return false;
        if (s.state === 'ready' && s.url) {
          setSrc(s.url);
          setConverting(false);
          setProgress(1);
          return true;
        }
        if (s.state === 'failed') {
          setConverting(false);
          setError(s.error || 'This format could not be converted for playback.');
          return false;
        }
        setProgress(typeof s.progress === 'number' ? s.progress : 0);
        if (s.mode) setMode(s.mode);
        await new Promise(res => window.setTimeout(res, i < 10 ? 250 : 700));
      }
    } catch (err: any) {
      if (run === runRef.current) {
        setConverting(false);
        setError(err?.message || 'Conversion failed');
      }
    }
    return false;
  }, [canConvert, item.fullPath]);

  useEffect(() => {
    runRef.current++; // cancel any poll for the previous item
    setError(null);
    setConverting(false);
    setProgress(0);
    setMode(undefined);
    if (enabled && canConvert && ALWAYS_CONVERT.has(extOf(item.name))) {
      setSrc('');
      void convert();
    } else {
      setSrc(original);
    }
    return () => {
      runRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, item.fullPath, item.name, enabled]);

  const onMediaError = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (!enabled || converting) return;
      const code = e.currentTarget.error?.code;
      // 1 = aborted by us (src swap) — not a format problem.
      if (code === 1) return;
      if (src === original && canConvert) {
        void convert();
      } else if (!canConvert) {
        setError(
          code === 4
            ? 'This format isn’t supported in the browser. Open it in Plajah for Windows to play it.'
            : 'This file could not be played.',
        );
      } else {
        setError('This file could not be played, even after conversion.');
      }
    },
    [enabled, converting, src, original, canConvert, convert],
  );

  return { src, converting, progress, mode, error, onMediaError };
}
