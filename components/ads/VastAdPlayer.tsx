import React, { useEffect, useRef } from 'react';
import { playVast, type VastOutcome } from '../../services/ads/googleAds';
import { finalizeVastUrl } from '../../services/ads/networkAds';
import { reportAdEvent } from '../../services/adEvents';

/**
 * Plays one network VAST ad (video or audio) filling its parent, then calls onDone once with how it
 * ended. A no-fill or error ends at once, so the caller can put Plajah's own content in that time.
 */
const VastAdPlayer: React.FC<{
  tagUrl: string;
  /** Used in the ad event log, e.g. 'tv_break' or 'fm_tunein'. */
  placement: string;
  muted?: boolean;
  maxSec?: number;
  onDone: (o: VastOutcome) => void;
  className?: string;
}> = ({ tagUrl, placement, muted, maxSec, onDone, className }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const box = boxRef.current;
    const video = videoRef.current;
    if (!box || !video) return;
    const w = Math.max(320, box.clientWidth || 640);
    const h = Math.max(180, box.clientHeight || 360);
    const pb = playVast({
      tagUrl: finalizeVastUrl(tagUrl, { pageUrl: window.location.origin, width: w, height: h, maxAdSec: maxSec }),
      container: box, video, width: w, height: h, muted, maxSec,
      onStarted: () => reportAdEvent(`vast_${placement}`, 'impression', 'network'),
      onClick: () => reportAdEvent(`vast_${placement}`, 'click', 'network'),
    });
    let alive = true;
    pb.done.then(o => { if (alive) doneRef.current(o); });
    return () => { alive = false; pb.stop(); };
    // One ad per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className ?? 'absolute inset-0 bg-black'}>
      <video ref={videoRef} playsInline muted={muted} className="absolute inset-0 w-full h-full object-contain bg-black" />
      <div ref={boxRef} className="absolute inset-0" />
      <span className="absolute top-3 left-3 z-[2] pointer-events-none text-[9px] font-black uppercase tracking-[0.4em] text-white/60 bg-black/40 px-2 py-1 rounded">Advertisement</span>
    </div>
  );
};

export default VastAdPlayer;
