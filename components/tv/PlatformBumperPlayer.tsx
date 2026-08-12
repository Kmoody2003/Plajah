import React, { useEffect, useRef, useState } from 'react';
import type { PlatformMediaKind, PlatformMediaAsset } from '../../types';
import { fetchRandomPlatformAsset, precachePlatformIdents, localIdentUrl } from '../../services/platformMediaService';

/**
 * PlatformBumperPlayer — plays ONE platform-owned bumper full-screen, then calls onDone. Used for the
 * Plajah TV-app opening ident (random per launch, replacing the static splash) and the Taleo pre-roll
 * (studio ta-dum before content). If the library has no active asset of the kind, it calls onDone
 * immediately so it never blocks. A safety timeout + onError/onEnded all resolve to onDone exactly once.
 */

interface Props {
  kind: PlatformMediaKind;
  onDone: () => void;
  allowSkip?: boolean;     // show a Skip button after a moment (Taleo pre-roll)
  skipAfterSec?: number;
  /** Pass a preloaded asset to skip the fetch (e.g. picked at app boot). */
  asset?: PlatformMediaAsset | null;
}

const PlatformBumperPlayer: React.FC<Props> = ({ kind, onDone, allowSkip = false, skipAfterSec = 2, asset: presetAsset }) => {
  const [asset, setAsset] = useState<PlatformMediaAsset | null>(presetAsset ?? null);
  const [showSkip, setShowSkip] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const finish = () => { if (doneRef.current) return; doneRef.current = true; onDone(); };

  // Resolve the asset (unless preloaded). No asset → resolve immediately.
  useEffect(() => {
    if (presetAsset !== undefined) { if (!presetAsset) finish(); return; }
    // BUNDLED FIRST: launch idents ship inside the app bundle (public/tv-bumpers/…), so the TV plays
    // one instantly off local storage instead of waiting on a network fetch + stream. Drop any number
    // of files in that folder and list them in tv-bumpers/manifest.json — one is picked at random per
    // launch. Falls back to the streamed platform library when no bundle is present.
    let alive = true;
    if (kind === 'TV_OPEN_BUMPER') {
      fetch('/tv-bumpers/manifest.json', { cache: 'force-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then((list: any) => {
          if (!alive) return;
          const files: string[] = Array.isArray(list) ? list : (list?.files || []);
          if (files.length) {
            const pick = files[Math.floor(Math.random() * files.length)];
            setAsset({ id: 'bundled', kind, title: 'Plajah', url: pick.startsWith('http') || pick.startsWith('/') ? pick : `/tv-bumpers/${pick}`, isActive: true, createdAt: 0, updatedAt: 0 } as PlatformMediaAsset);
            return;
          }
          throw new Error('no bundled bumpers');
        })
        .catch(() => {
          if (!alive) return;
          fetchRandomPlatformAsset(kind).then(a => { if (!alive) return; if (a) setAsset(a); else finish(); }).catch(finish);
        });
      return () => { alive = false; };
    }
    fetchRandomPlatformAsset(kind).then(a => { if (!alive) return; if (a) setAsset(a); else finish(); }).catch(finish);
    return () => { alive = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play + safety timeout once we have an asset.
  useEffect(() => {
    if (!asset) return;
    const v = videoRef.current;
    const maxMs = ((asset.durationSeconds && asset.durationSeconds > 0 ? asset.durationSeconds : 15) + 3) * 1000;
    const t = setTimeout(finish, maxMs);
    const skipT = allowSkip ? setTimeout(() => setShowSkip(true), skipAfterSec * 1000) : undefined;
    if (v) {
      v.play().catch(() => { try { v.muted = true; v.play().catch(() => {}); } catch { /* */ } });
    }
    return () => { clearTimeout(t); if (skipT) clearTimeout(skipT); };
  }, [asset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the device-local copy when we have one (instant), and copy the platform's idents down in the
  // background so every later launch is local. Never blocks the ident that's playing now.
  const [playUrl, setPlayUrl] = useState<string>('');
  useEffect(() => {
    if (!asset?.url) return;
    let alive = true;
    localIdentUrl(asset.url).then(u => { if (alive) setPlayUrl(u); }).catch(() => { if (alive) setPlayUrl(asset.url); });
    const t = setTimeout(() => { precachePlatformIdents(); }, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [asset?.url]);

  if (!asset) return null;

  return (
    <div className="fixed inset-0 z-[3000] bg-black grid place-items-center">
      <video
        ref={videoRef}
        src={playUrl || asset.url}
        className="w-full h-full object-contain bg-black"
        autoPlay
        playsInline
        onEnded={finish}
        onError={finish}
        poster={asset.thumbnailUrl}
      />
      {allowSkip && showSkip && (
        <button onClick={finish} className="absolute bottom-8 right-8 px-5 py-2.5 rounded-full bg-white/15 backdrop-blur border border-white/20 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/25">
          Skip
        </button>
      )}
    </div>
  );
};

export default PlatformBumperPlayer;
