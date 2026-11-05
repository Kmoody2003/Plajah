// The Desk's player: the real video (Mux HLS), seekable from any finding's moment. Plays nothing until
// asked; clicking a moment jumps there (and keeps playing if it was already playing).

import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { hlsTuning, capLevelsToPanel } from '../../../services/hlsTuning';

export default function DeskPlayer({ playbackId, poster, seek, onTime }: {
  playbackId: string;
  poster?: string;
  /** Change n to jump to t again (the same moment twice). */
  seek: { t: number; n: number };
  onTime?: (t: number) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [attached, setAttached] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !playbackId) return;
    let hls: any = null;
    let disposed = false;
    const src = `https://stream.mux.com/${playbackId}.m3u8`;
    setAttached(false); setFailed(false);
    (async () => {
      try {
        if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; setAttached(true); return; }
        const { default: Hls } = await import('hls.js');
        if (disposed) return;
        if (!Hls.isSupported()) { setFailed(true); return; }
        hls = new Hls(hlsTuning());
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls); setAttached(true); });
        hls.on(Hls.Events.ERROR, (_: unknown, d: any) => { if (d?.fatal) setFailed(true); });
      } catch { setFailed(true); }
    })();
    return () => { disposed = true; try { hls?.destroy(); } catch { /* */ } };
  }, [playbackId]);

  // Jump to the asked-for moment, once the stream can take it.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    pending.current = seek.t;
    const go = () => { if (pending.current == null) return; try { video.currentTime = pending.current; } catch { /* */ } pending.current = null; };
    if (attached && video.readyState >= 1) go(); else video.addEventListener('loadedmetadata', go, { once: true });
    return () => video.removeEventListener('loadedmetadata', go);
  }, [seek.t, seek.n, attached]);

  return (
    <div className="relative aspect-video max-h-[300px] w-full rounded-lg overflow-hidden bg-black">
      <video ref={ref} poster={poster} controls playsInline preload="metadata" className="w-full h-full object-contain"
        onTimeUpdate={e => onTime?.((e.target as HTMLVideoElement).currentTime)} />
      {!attached && !failed && <span className="absolute inset-0 grid place-items-center pointer-events-none text-white/40"><Play size={28} /></span>}
      {failed && <span className="absolute inset-x-0 bottom-0 p-2 text-[11.5px] text-amber-100 bg-black/70">This video can't play here. Use "Open" to watch it.</span>}
    </div>
  );
}
