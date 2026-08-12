// Client-side media duration probe — reads the REAL length of a media URL in the browser, for both
// direct files (mp4/webm via a bare <video>) AND HLS/Mux (.m3u8) via hls.js (LEVEL_LOADED gives the
// VOD total duration). Used to build accurate FAST schedules when the library carries no duration.

const isHlsUrl = (u: string) => /\.m3u8($|[?#])/i.test(u) || u.includes('stream.mux.com');

export async function probeDurationSec(url: string, timeoutMs = 9000): Promise<number> {
  if (!url) return 0;
  return new Promise<number>(resolve => {
    const el = document.createElement('video');
    el.preload = 'metadata'; el.muted = true; (el as any).playsInline = true;
    // Some engines only load metadata for an attached element — mount it hidden while probing.
    el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    try { document.body.appendChild(el); } catch { /* */ }
    let hls: any = null; let done = false;
    const finish = (d: number) => {
      if (done) return; done = true;
      try { hls?.destroy?.(); } catch { /* */ }
      try { el.removeAttribute('src'); el.load?.(); } catch { /* */ }
      try { el.remove(); } catch { /* */ }
      resolve(d > 0 ? Math.round(d) : 0);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    const fromEl = () => { if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(timer); finish(el.duration); } };
    el.addEventListener('loadedmetadata', fromEl, { once: true });
    el.addEventListener('durationchange', fromEl);
    el.onerror = () => { clearTimeout(timer); finish(0); };

    if (isHlsUrl(url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (done) return;
        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: true });
          hls.on(Hls.Events.LEVEL_LOADED, (_e: any, data: any) => {
            const d = data?.details?.totalduration;
            if (d > 0) { clearTimeout(timer); finish(d); }
          });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => { if (data?.fatal) finish(0); });
          hls.loadSource(url); hls.attachMedia(el);
        } else { el.src = url; }
      }).catch(() => finish(0));
    } else {
      el.src = url; // native HLS (Safari) or a direct file
    }
  });
}

/** Probe many urls with a small concurrency cap; returns a map url→seconds (0 when unknown). */
export async function probeDurations(urls: string[], concurrency = 5, timeoutMs = 9000): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(urls.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += concurrency) {
    const batch = uniq.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(u => probeDurationSec(u, timeoutMs).then(d => [u, d] as const)));
    results.forEach(([u, d]) => out.set(u, d));
  }
  return out;
}
