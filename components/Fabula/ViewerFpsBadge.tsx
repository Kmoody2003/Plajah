import React, { useEffect, useRef, useState } from 'react';

interface ViewerFpsBadgeProps {
  targetFps?: number;
  playing: boolean;
  videoRef?: React.MutableRefObject<HTMLVideoElement | HTMLCanvasElement | null>;
  className?: string;
  style?: React.CSSProperties;
}

export default function ViewerFpsBadge({
  targetFps = 24,
  playing,
  videoRef,
  className = '',
  style = {},
}: ViewerFpsBadgeProps) {
  const [fps, setFps] = useState<number>(targetFps);
  const [droppedFrames, setDroppedFrames] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(true);

  const statsRef = useRef({
    frames: 0,
    lastTime: performance.now(),
    lastDropped: 0,
    rollingFps: targetFps,
  });

  useEffect(() => {
    if (!playing) {
      setFps(targetFps);
      setIsLocked(true);
      return undefined;
    }

    // Poll the CURRENT element (the live clip's <video> changes at every cut, so a per-element
    // requestVideoFrameCallback would go stale after the first edit). Measure real presented frames
    // from getVideoPlaybackQuality deltas; fall back to the display rAF rate for canvas/GPU surfaces.
    let alive = true;
    let animId = 0;
    let lastEl: HTMLVideoElement | null = null;
    let lastTotal = 0;
    let lastDroppedTotal = 0;
    let lastT = performance.now();
    let rafFrames = 0;
    const tick = (now: DOMHighResTimeStamp) => {
      if (!alive) return;
      rafFrames++;
      const dt = now - lastT;
      if (dt >= 500) {
        const v = videoRef?.current;
        let measured = (rafFrames * 1000) / dt;
        let drops = 0;
        if (v instanceof HTMLVideoElement && typeof v.getVideoPlaybackQuality === 'function' && !v.paused) {
          const q = v.getVideoPlaybackQuality();
          if (v === lastEl && q.totalVideoFrames >= lastTotal) {
            measured = ((q.totalVideoFrames - lastTotal) * 1000) / dt;
            drops = Math.max(0, (q.droppedVideoFrames || 0) - lastDroppedTotal);
          } else {
            measured = targetFps || 24;                 // element just changed (a cut) — no baseline yet
          }
          lastEl = v; lastTotal = q.totalVideoFrames; lastDroppedTotal = q.droppedVideoFrames || 0;
        } else {
          lastEl = null;
        }
        const rounded = Math.round(measured * 10) / 10;
        const target = targetFps || 24;
        setFps(rounded);
        setIsLocked(rounded >= target - 1.5 && drops === 0);
        setDroppedFrames(drops);
        rafFrames = 0;
        lastT = now;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      if (animId) cancelAnimationFrame(animId);
    };
  }, [playing, targetFps, videoRef]);

  const target = targetFps || 24;
  const dotColor = !playing ? '#64748b' : isLocked ? '#22c55e' : '#ef4444';
  const textColor = !playing ? '#94a3b8' : isLocked ? '#4ade80' : '#f87171';

  return (
    <div
      className={`viewer-fps-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 4,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: textColor,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 50,
        ...style,
      }}
      title={
        playing
          ? isLocked
            ? `Playback locked at ${fps.toFixed(1)} FPS (${target} FPS timeline target)`
            : `Playback dropped below target: ${fps.toFixed(1)} / ${target} FPS (${droppedFrames} dropped)`
          : `Timeline format: ${target.toFixed(1)} FPS`
      }
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: playing ? `0 0 6px ${dotColor}` : 'none',
          display: 'inline-block',
          transition: 'background-color 0.2s, box-shadow 0.2s',
        }}
      />
      <span>
        {playing ? fps.toFixed(1) : target.toFixed(1)} FPS
        {droppedFrames > 0 && playing && (
          <span style={{ marginLeft: 3, color: '#fca5a5', fontSize: 9 }}>
            ({droppedFrames} drop)
          </span>
        )}
      </span>
    </div>
  );
}
