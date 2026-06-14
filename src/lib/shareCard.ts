/**
 * generateShareCard — paints a gorgeous share image: the cover art with a
 * caption (title · artist · "Listen on Plajah") laid over a bottom gradient.
 * Used for native image sharing and as the preview in the share menu.
 *
 * Returns null if the canvas is tainted (cross-origin cover without CORS) so the
 * caller can fall back to the plain cover.
 */

export interface ShareCardInput {
  coverUrl?: string;
  title: string;
  artist?: string;
  size?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; }
  else { dw = w; dh = w / ir; dy = (h - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): number {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  let trimmed = lines.slice(0, maxLines);
  if (trimmed.length === maxLines && words.length > trimmed.join(' ').split(' ').length) {
    let last = trimmed[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    trimmed[maxLines - 1] = last + '…';
  }
  // Draw bottom-up so y is the baseline of the LAST line.
  trimmed.forEach((ln, i) => {
    ctx.fillText(ln, x, y - (trimmed.length - 1 - i) * lh);
  });
  return trimmed.length;
}

export async function generateShareCard(input: ShareCardInput): Promise<{ dataUrl: string; blob: Blob | null } | null> {
  try {
    const size = input.size || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Base
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    if (input.coverUrl) {
      try { drawCover(ctx, await loadImage(input.coverUrl), size, size); } catch { /* keep base */ }
    }

    // Bottom-to-top darkening so the caption reads
    const g = ctx.createLinearGradient(0, size * 0.4, 0, size);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0.94)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // Subtle brand wash (orange · magenta · purple) in the lower-left
    const bg = ctx.createRadialGradient(size * 0.1, size, size * 0.1, size * 0.1, size, size * 0.9);
    bg.addColorStop(0, 'rgba(255,140,0,0.18)');
    bg.addColorStop(0.5, 'rgba(212,0,85,0.10)');
    bg.addColorStop(1, 'rgba(107,0,153,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const pad = size * 0.075;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Eyebrow
    ctx.fillStyle = '#ff8c00';
    ctx.font = `900 ${Math.round(size * 0.024)}px Inter, system-ui, sans-serif`;
    ctx.fillText('▶  LISTEN ON PLAJAH', pad, size - pad - size * 0.155);

    // Title (up to 2 lines, bottom-anchored)
    ctx.fillStyle = '#ffffff';
    const titleSize = Math.round(size * 0.062);
    ctx.font = `900 ${titleSize}px Inter, system-ui, sans-serif`;
    wrapText(ctx, (input.title || 'Untitled').toUpperCase(), pad, size - pad - size * 0.055, size - pad * 2, titleSize * 1.05, 2);

    // Artist
    if (input.artist) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `700 ${Math.round(size * 0.03)}px Inter, system-ui, sans-serif`;
      ctx.fillText(input.artist.toUpperCase(), pad, size - pad * 0.7);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    return { dataUrl, blob };
  } catch {
    return null; // tainted canvas / failure → caller falls back to plain cover
  }
}
