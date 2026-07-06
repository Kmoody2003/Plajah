// videoPoster — grab a poster frame from a local video File entirely client-side.
// Used by the Taleo personal video locker so uploaded movies/shows show a real
// thumbnail instead of a placeholder. Local blob → canvas is not CORS-tainted,
// so toBlob() works without a server round-trip.

export interface PosterOptions {
  /** Preferred capture time (seconds). Actual time = min(this, ~10% of duration). */
  atSeconds?: number;
  /** Max poster width in px (height scales to aspect). */
  maxWidth?: number;
  quality?: number;
}

/** Capture a JPEG poster frame from a video File. Resolves null on any failure. */
export function captureVideoPoster(file: File, opts: PosterOptions = {}): Promise<Blob | null> {
  const { atSeconds = 8, maxWidth = 640, quality = 0.82 } = opts;
  return new Promise((resolve) => {
    let settled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), 15000); // don't hang uploads

    video.onerror = () => finish(null);

    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      // ~10% in avoids black intros/logos; never past the preferred cap.
      const t = dur ? Math.min(dur * 0.1, atSeconds) : atSeconds;
      try { video.currentTime = Math.max(0.1, t); } catch { finish(null); }
    };

    video.onseeked = () => {
      if (settled) return;
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) { finish(null); return; }
      try {
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { finish(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', quality);
      } catch {
        finish(null);
      }
    };

    video.src = url;
  });
}
