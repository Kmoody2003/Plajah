// textLayer.ts — the "text generator": draws a caption/title string to a canvas the
// GL compositor can sample as a layer. Renders bright text on BLACK so that, used
// with a screen/lighten blend, the black drops out and only the text overlays the
// video below (the classic title-key trick — works the same in Fabula's CSS monitor
// and in the GL offline render).

const cache = new Map<string, HTMLCanvasElement>();
const W = 1280, H = 720; // fixed authoring resolution; the compositor scales to output

/** A cached canvas with `text` drawn lower-third, word-wrapped, outlined. */
export function getTextCanvas(text: string, color = '#ffffff'): HTMLCanvasElement {
  const key = `${text}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); // black bg → drops out under screen blend

  const fontSize = Math.round(W * 0.046);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Word-wrap to ~86% width.
  const maxW = W * 0.86;
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);

  const lineH = fontSize * 1.25;
  let y = H * 0.84 - (lines.length - 1) * lineH; // lower third, growing upward
  ctx.lineWidth = Math.max(2, fontSize * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.fillStyle = color;
  for (const ln of lines) { ctx.strokeText(ln, W / 2, y); ctx.fillText(ln, W / 2, y); y += lineH; }

  cache.set(key, c);
  if (cache.size > 240) { const k = cache.keys().next().value; if (k) cache.delete(k); }
  return c;
}
