import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Volume2 } from 'lucide-react';

// Reusable poster thumbnail that, on hover, plays a short muted preview of the
// asset (first N seconds) — video for videos, audio for music — and navigates on
// click. Used for the "More From This World" and character/asset rails in the
// Taleo and Chora pages so every thumbnail is a live, clickable link.

export type PreviewSource = { kind: 'hls' | 'video' | 'audio'; src: string } | null;

/** Resolve a playable preview source from a Video or Album-like object. */
export function previewSourceFor(item: any): PreviewSource {
  if (!item) return null;
  // Video: prefer Mux HLS, then a direct video file. (YouTube/Vimeo embeds are skipped.)
  if (item.muxPlaybackId) return { kind: 'hls', src: `https://stream.mux.com/${item.muxPlaybackId}.m3u8` };
  const directVideo = item.verticalVideoUrl || item.videoUrl ||
    (typeof item.url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url) ? item.url : '');
  if (directVideo) return { kind: 'video', src: directVideo };
  // Music: first playable audio track.
  const tracks: any[] = item.tracks || [];
  const audioUrl = tracks.find(t => t?.url && t.mediaKind !== 'VIDEO')?.url || tracks.find(t => t?.url)?.url;
  if (audioUrl) return { kind: 'audio', src: audioUrl };
  if (typeof item.url === 'string' && /\.(mp3|wav|m4a|ogg|flac|aac)(\?|$)/i.test(item.url)) return { kind: 'audio', src: item.url };
  return null;
}

interface Props {
  poster?: string;
  title: string;
  subtitle?: string;
  preview: PreviewSource;
  accent?: string;
  aspectClass?: string;   // e.g. 'aspect-[2/3]'
  roundClass?: string;    // e.g. 'rounded-xl'
  previewSeconds?: number;
  onClick?: () => void;
  fallbackIcon?: React.ReactNode;
  hideCaption?: boolean;   // suppress the internal title overlay (compact rails)
}

const HOVER_DELAY_MS = 320;

const HoverPreviewThumb: React.FC<Props> = ({
  poster, title, subtitle, preview, accent = '#FFB68D',
  aspectClass = 'aspect-[2/3]', roundClass = 'rounded-xl', previewSeconds = 30,
  onClick, fallbackIcon, hideCaption,
}) => {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<any>(null);
  const hoverTimer = useRef<any>(null);
  const capTimer = useRef<any>(null);

  const stop = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (capTimer.current) { clearTimeout(capTimer.current); capTimer.current = null; }
    try { hlsRef.current?.destroy?.(); } catch {}
    hlsRef.current = null;
    const v = videoRef.current;
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} }
    const a = audioRef.current;
    if (a) { try { a.pause(); } catch {} a.src = ''; audioRef.current = null; }
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (!preview) return;
    const cap = () => { capTimer.current = setTimeout(stop, previewSeconds * 1000); };

    if (preview.kind === 'audio') {
      const a = new Audio(preview.src);
      a.volume = 0; a.preload = 'auto';
      audioRef.current = a;
      try { await a.play(); } catch { return; }
      // gentle fade-in
      let v = 0; const fade = setInterval(() => { v = Math.min(0.7, v + 0.07); a.volume = v; if (v >= 0.7) clearInterval(fade); }, 40);
      setPlaying(true); cap();
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.muted = true; video.playsInline = true; (video as any).currentTime = 0;

    if (preview.kind === 'hls') {
      const canNative = video.canPlayType('application/vnd.apple.mpegurl');
      if (canNative) {
        video.src = preview.src;
      } else {
        try {
          const mod: any = await import('hls.js');
          const Hls = mod.default;
          if (Hls?.isSupported()) {
            const hls = new Hls({ maxBufferLength: 12, capLevelToPlayerSize: true });
            hlsRef.current = hls;
            hls.loadSource(preview.src);
            hls.attachMedia(video);
          } else { video.src = preview.src; }
        } catch { return; }
      }
    } else {
      video.src = preview.src;
    }
    try { await video.play(); setPlaying(true); cap(); } catch { /* autoplay blocked */ }
  }, [preview, previewSeconds, stop]);

  const onEnter = () => {
    if (!preview) return;
    hoverTimer.current = setTimeout(start, HOVER_DELAY_MS);
  };

  const isVideo = preview && preview.kind !== 'audio';

  return (
    <button
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={stop}
      className={`group relative ${aspectClass} ${roundClass} overflow-hidden bg-white/[0.04] border border-white/[0.08] cursor-pointer shadow-lg text-left w-full transition-transform hover:-translate-y-1`}
      style={{ ['--accent' as any]: accent }}
    >
      {poster
        ? <img src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div className="absolute inset-0 flex items-center justify-center text-white/20">{fallbackIcon}</div>}

      {isVideo && (
        <video ref={videoRef} muted playsInline preload="none"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playing ? 'opacity-100' : 'opacity-0'}`} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />

      {/* Hover affordance / now-previewing badge */}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${playing ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="w-10 h-10 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
          {preview?.kind === 'audio' ? <Volume2 size={16} className="text-white" /> : <Play size={16} fill="white" className="text-white ml-0.5" />}
        </div>
      </div>
      {playing && (
        <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-[7px] font-black uppercase tracking-widest" style={{ color: accent }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} /> Preview
        </span>
      )}

      {!hideCaption && (
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-[11px] font-black text-white leading-tight line-clamp-2">{title}</p>
          {subtitle && <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1 line-clamp-1">{subtitle}</p>}
        </div>
      )}
    </button>
  );
};

export default HoverPreviewThumb;
