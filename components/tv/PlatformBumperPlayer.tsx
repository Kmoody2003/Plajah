import React, { useEffect, useRef, useState } from 'react';
import type { PlatformMediaKind, PlatformMediaAsset } from '../../types';
import { fetchRandomPlatformAsset } from '../../services/platformMediaService';

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
    let alive = true;
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

  if (!asset) return null;

  return (
    <div className="fixed inset-0 z-[3000] bg-black grid place-items-center">
      <video
        ref={videoRef}
        src={asset.url}
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
