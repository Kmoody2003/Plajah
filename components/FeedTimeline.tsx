import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Post } from '../types';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const CLUSTER_BUCKET_MS = 90 * 60 * 1000; // 90 min buckets

interface TimelinePost {
  authorPhoto: string;
  authorName: string;
  timestamp: number;
  id: string;
}

interface FeedTimelineProps {
  posts: Post[];
  onScrub: (timestamp: number | null) => void;
  onScrubbing: (scrubbing: boolean) => void;
}

interface Cluster {
  bucketStart: number;
  xPct: number;
  photos: { photo: string; name: string; id: string }[];
}

const FeedTimeline: React.FC<FeedTimelineProps> = ({ posts, onScrub, onScrubbing }) => {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const [playheadPct, setPlayheadPct] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastXRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);

  const recentPosts: TimelinePost[] = posts
    .filter(p => p.timestamp >= windowStart && p.timestamp <= now)
    .map(p => ({ authorPhoto: p.authorPhoto, authorName: p.authorName, timestamp: p.timestamp, id: p.id }));

  // Build clusters: group nearby posts into 90-min buckets
  const bucketMap = new Map<number, TimelinePost[]>();
  for (const p of recentPosts) {
    const bucket = Math.floor((p.timestamp - windowStart) / CLUSTER_BUCKET_MS);
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
    bucketMap.get(bucket)!.push(p);
  }

  const clusters: Cluster[] = Array.from(bucketMap.entries()).map(([bucket, ps]) => {
    const bucketStart = windowStart + bucket * CLUSTER_BUCKET_MS;
    const midTime = bucketStart + CLUSTER_BUCKET_MS / 2;
    const xPct = ((midTime - windowStart) / WINDOW_MS) * 100;
    const unique = new Map<string, { photo: string; name: string; id: string }>();
    for (const p of ps) {
      if (!unique.has(p.authorPhoto)) unique.set(p.authorPhoto, { photo: p.authorPhoto, name: p.authorName, id: p.id });
    }
    return { bucketStart, xPct, photos: Array.from(unique.values()).slice(0, 4) };
  });

  const pctToTimestamp = (pct: number) => windowStart + (pct / 100) * WINDOW_MS;

  const clampPct = (v: number) => Math.max(0, Math.min(100, v));

  const trackPct = useCallback((clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return clampPct(((clientX - rect.left) / rect.width) * 100);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pct = trackPct(e.clientX);
    setIsDragging(true);
    setPlayheadPct(pct);
    onScrubbing(true);
    onScrub(pctToTimestamp(pct));
    lastXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
  }, [trackPct, onScrub, onScrubbing]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const now = performance.now();
    const dt = now - lastTimeRef.current;
    const dx = e.clientX - lastXRef.current;
    if (dt > 0) velocityRef.current = dx / dt; // px/ms

    lastXRef.current = e.clientX;
    lastTimeRef.current = now;

    const pct = trackPct(e.clientX);
    setPlayheadPct(pct);
    onScrub(pctToTimestamp(pct));
  }, [isDragging, trackPct, onScrub]);

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
    // keep playhead visible for 2s then release
    setTimeout(() => {
      setPlayheadPct(null);
      onScrubbing(false);
      onScrub(null);
    }, 2000);
  }, [onScrub, onScrubbing]);

  // Cancel on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m} ${ampm}`;
  };

  const timeLabels = [0, 12, 24, 36, 48].map(h => ({
    pct: (h / 48) * 100,
    label: h === 0 ? '48h ago' : h === 48 ? 'Now' : `${48 - h}h ago`,
  }));

  return (
    <div className="w-full px-0 py-3 select-none">
      {/* Track area */}
      <div
        ref={trackRef}
        className="relative h-14 cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Base rail */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-white/10" />

        {/* Tick marks every 6 hours */}
        {[6, 12, 18, 24, 30, 36, 42].map(h => (
          <div
            key={h}
            className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-white/10"
            style={{ left: `${(h / 48) * 100}%` }}
          />
        ))}

        {/* Avatar clusters */}
        {clusters.map(cluster => (
          <div
            key={cluster.bucketStart}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center z-10"
            style={{ left: `${cluster.xPct}%` }}
            onMouseEnter={() => setHoveredCluster(String(cluster.bucketStart))}
            onMouseLeave={() => setHoveredCluster(null)}
          >
            {cluster.photos.length === 1 ? (
              <div className="relative">
                <img
                  src={cluster.photos[0].photo || undefined}
                  alt={cluster.photos[0].name}
                  className="w-7 h-7 rounded-full object-cover border-2 border-black ring-1 ring-white/20 shadow-lg"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="flex -space-x-2">
                {cluster.photos.slice(0, 3).map((ph, i) => (
                  <img
                    key={ph.id + i}
                    src={ph.photo || undefined}
                    alt={ph.name}
                    className="w-6 h-6 rounded-full object-cover border-2 border-black ring-1 ring-white/10 shadow-md"
                    style={{ zIndex: cluster.photos.length - i }}
                    loading="lazy"
                  />
                ))}
                {cluster.photos.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-white/10 border-2 border-black flex items-center justify-center z-0">
                    <span className="text-[7px] font-black text-white/60">+{cluster.photos.length - 3}</span>
                  </div>
                )}
              </div>
            )}

            {/* Tooltip on hover */}
            {hoveredCluster === String(cluster.bucketStart) && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 rounded-xl px-3 py-1.5 pointer-events-none z-50 whitespace-nowrap">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/60">{formatTime(cluster.bucketStart)}</p>
                <p className="text-[8px] text-white/40 mt-0.5">
                  {cluster.photos.map(p => p.name).join(', ')}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Playhead */}
        {playheadPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-0.5 h-10 bg-white/80 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 bg-black/90 border border-white/20 rounded-lg px-2 py-1 whitespace-nowrap">
              <span className="text-[9px] font-black text-white/80 tracking-widest">
                {formatTime(pctToTimestamp(playheadPct))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Time labels */}
      <div className="relative h-4">
        {timeLabels.map(tl => (
          <div
            key={tl.pct}
            className="absolute -translate-x-1/2 text-[8px] font-black uppercase tracking-widest text-white/20"
            style={{ left: `${tl.pct}%` }}
          >
            {tl.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeedTimeline;
