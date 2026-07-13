// titleLayer.ts — the unified TITLE engine (#8). One model + renderer for
// lower-third titles (title + subtitle + style), drawn to a canvas the GL
// compositor samples — so the SAME titles render in Pixels, in Fabula's monitor,
// and in the offline export. It generalizes the plain subtitle (textLayer.ts) and
// folds in TV Studio's GraphicOverlay concept (MODERN / CLASSIC / MINIMAL). Drawn
// bright-on-black so a screen/lighten blend keys out the background — consistent
// with how captions already composite.

export type TitleStyle = 'modern' | 'classic' | 'minimal';

const cache = new Map<string, HTMLCanvasElement>();
const W = 1280, H = 720;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Custom overrides from the titler UI — font family, fill color, size (% of frame width),
 *  and anchor position (% of frame). Everything optional; defaults match the style presets. */
export interface TitleOpts { font?: string; color?: string; subColor?: string; size?: number; x?: number; y?: number }

/** A cached lower-third title canvas. `accent` is the brand/accent color. */
export function getTitleCanvas(title: string, subtitle = '', style: TitleStyle = 'modern', accent = '#FF8C00', opts: TitleOpts = {}): HTMLCanvasElement {
  const key = `${title}|${subtitle}|${style}|${accent}|${opts.font || ''}|${opts.color || ''}|${opts.subColor || ''}|${opts.size ?? ''}|${opts.x ?? ''}|${opts.y ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); // keyed out by screen blend

  const cx = W * 0.5;
  const titleSize = Math.round(W * ((opts.size != null ? opts.size / 100 : (style === 'minimal' ? 0.05 : 0.058))));
  const subSize = Math.round(titleSize * 0.5);
  const serif = style === 'classic';
  const font = opts.font
    ? `"${opts.font}", system-ui, sans-serif`
    : serif ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  ctx.textAlign = style === 'classic' ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  const anchorX = opts.x != null ? W * (opts.x / 100) : (style === 'classic' ? cx : W * 0.12);
  const leftX = style === 'classic' ? anchorX : anchorX;
  const baseY = opts.y != null ? H * (opts.y / 100) : H * 0.80;

  ctx.font = `700 ${titleSize}px ${font}`;
  const titleLines = wrap(ctx, title, W * 0.76);
  const lineH = titleSize * 1.16;
  let y = baseY - (titleLines.length - 1) * lineH - (subtitle ? subSize * 1.4 : 0);

  // accent element
  ctx.fillStyle = accent;
  if (style === 'modern') ctx.fillRect(leftX - 14, y - titleSize * 0.85, 7, titleLines.length * lineH + (subtitle ? subSize * 1.6 : 0)); // left bar
  else if (style === 'classic') { ctx.fillRect(leftX - 60, y - titleSize, 120, 3); } // rule above

  // title
  ctx.lineWidth = Math.max(2, titleSize * 0.12); ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.fillStyle = opts.color || '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = titleSize * 0.25;
  const tx = leftX;
  for (const ln of titleLines) { ctx.strokeText(ln, tx, y); ctx.fillText(ln, tx, y); y += lineH; }
  ctx.shadowBlur = 0;

  // subtitle
  if (subtitle) {
    y += subSize * 0.4;
    ctx.font = `500 ${subSize}px ${font}`;
    ctx.fillStyle = opts.subColor || (style === 'minimal' ? 'rgba(255,255,255,0.85)' : accent);
    const subLines = wrap(ctx, subtitle, W * 0.76);
    for (const ln of subLines) { ctx.strokeText(ln, tx, y); ctx.fillText(ln, tx, y); y += subSize * 1.25; }
    if (style === 'classic') { ctx.fillStyle = accent; ctx.fillRect(leftX - 60, y - subSize * 0.4, 120, 3); } // rule below
  }

  cache.set(key, c);
  if (cache.size > 160) { const k = cache.keys().next().value; if (k) cache.delete(k); }
  return c;
}
