// localThumbs — small poster images for library grids, made ONCE per file and shared.
//
// The grids used to decode the full file for every tile: a full-resolution photo per image
// card and a live <video> element per video card. A folder of a few hundred clips meant a few
// hundred decoders fighting each other, which is what made the Media tab crawl and kept tiles
// blank. Here every file gets one ~320px JPEG, produced through a short queue (videos one or two
// at a time), cached by URL for the session. In the Windows app callers skip all of this and use
// Windows' own shell thumbnails (windowsBridgeService.shellThumbUrl), which are instant.

const WIDTH = 320;
const cache = new Map<string, Promise<string | null>>();

type Job = () => Promise<void>;
function makeQueue(limit: number) {
  let running = 0;
  const waiting: Job[] = [];
  const pump = () => {
    while (running < limit && waiting.length) {
      const job = waiting.shift()!;
      running++;
      job().finally(() => { running--; pump(); });
    }
  };
  return <T>(work: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    waiting.push(() => work().then(resolve, reject));
    pump();
  });
}
const videoQueue = makeQueue(2);
const imageQueue = makeQueue(4);

function canvasToUrl(c: HTMLCanvasElement): Promise<string | null> {
  return new Promise(res => c.toBlob(b => res(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.82));
}

async function imageThumb(src: string): Promise<string | null> {
  const blob = await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob, { resizeWidth: WIDTH, resizeQuality: 'medium' } as ImageBitmapOptions);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close?.();
  return canvasToUrl(c);
}

function videoThumb(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    let done = false;
    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      try { v.load(); } catch { /* releases the decoder */ }
      resolve(url);
    };
    const timer = setTimeout(() => finish(null), 10000);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      try { v.currentTime = d > 0 ? Math.min(Math.max(d * 0.1, 0.1), Math.max(d - 0.05, 0)) : 0.1; } catch { finish(null); }
    };
    v.onseeked = async () => {
      try {
        const w = v.videoWidth || 16, h = v.videoHeight || 9;
        const c = document.createElement('canvas');
        c.width = WIDTH; c.height = Math.max(1, Math.round(WIDTH * h / w));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        finish(await canvasToUrl(c));
      } catch { finish(null); } // tainted canvas (cross-origin without CORS) or decode failure
    };
    v.onerror = () => finish(null);
    v.src = src;
  });
}

/** A small JPEG of a photo or a video's early frame (object URL), or null when it can't be made. */
export function thumbFor(src: string, kind: 'image' | 'video'): Promise<string | null> {
  const key = `${kind}:${src}`;
  let p = cache.get(key);
  if (!p) {
    p = (kind === 'video' ? videoQueue(() => videoThumb(src)) : imageQueue(() => imageThumb(src))).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Forget a URL's thumbnails (e.g. its blob URL was revoked). */
export function dropThumb(src: string): void {
  for (const kind of ['image', 'video'] as const) {
    const key = `${kind}:${src}`;
    const p = cache.get(key);
    if (p) { cache.delete(key); void p.then(u => { if (u) URL.revokeObjectURL(u); }); }
  }
}
