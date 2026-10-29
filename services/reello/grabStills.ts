// Auto thumbnails from the local file, before a byte is uploaded: seek a hidden <video> to a few
// points and draw each frame. Same idea as YouTube's three suggested thumbnails.

export async function grabStills(file: File, count = 3, width = 640): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('This video format can’t be previewed here.'));
      setTimeout(() => rej(new Error('timeout')), 15_000);
    });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur || !v.videoWidth) return [];
    const h = Math.round(width * (v.videoHeight / v.videoWidth));
    const c = document.createElement('canvas'); c.width = width; c.height = h;
    const g = c.getContext('2d');
    if (!g) return [];
    const out: Blob[] = [];
    for (let i = 1; i <= count; i++) {
      const t = Math.min(dur - 0.1, (dur * i) / (count + 1));
      await new Promise<void>(res => { v.onseeked = () => res(); v.currentTime = t; setTimeout(res, 4000); });
      g.drawImage(v, 0, 0, width, h);
      const b = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.86));
      if (b) out.push(b);
    }
    return out;
  } catch { return []; }
  finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}
