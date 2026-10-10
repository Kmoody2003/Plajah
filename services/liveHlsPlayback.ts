/**
 * attachLiveHls — play a Mux LIVE stream (Reello Live audience leg) into an existing <video>, so the
 * viewer keeps its lens overlay / emote layer / tap handlers bound to the same element it used for
 * the P2P stream. hls.js with low-latency tuning; native HLS on Safari/iOS.
 *
 * Returns a detach function. `onFatal` fires when playback can't continue (caller falls back to P2P).
 */
export function attachLiveHls(video: HTMLVideoElement, playbackId: string, onFatal?: () => void): () => void {
  const url = `https://stream.mux.com/${playbackId}.m3u8`;
  let hls: any = null;
  let disposed = false;
  video.srcObject = null;
  const play = () => video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });

  (async () => {
    try {
      const { default: Hls } = await import('hls.js');
      if (disposed) return;
      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 2,          // sit ~2 segments behind the live edge
          liveMaxLatencyDurationCount: 6,    // catch up if we drift further than that
          maxLiveSyncPlaybackRate: 1.2,
          backBufferLength: 30,
          manifestLoadingMaxRetry: 8,
          levelLoadingMaxRetry: 8,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        let recovered = 0;
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (!data?.fatal) return;
          if (recovered++ < 4) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { setTimeout(() => hls?.startLoad(), 1500); return; }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
          }
          onFatal?.();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        play();
      } else {
        onFatal?.();
      }
    } catch { onFatal?.(); }
  })();

  return () => {
    disposed = true;
    try { hls?.destroy(); } catch { /* */ }
    hls = null;
    if (video.src) { video.removeAttribute('src'); video.load(); }
  };
}
