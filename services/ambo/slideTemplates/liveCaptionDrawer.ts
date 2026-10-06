// liveCaptionDrawer — `live.caption`: the live transcript inside any slide object.
//
// Tag a box object `live: { drawer: 'live.caption', props: { lines, size, color, align, font } }`.
// It draws the newest `lines` (default 2) of what the room is saying, newest
// brightest, fitted to the object's box. With no live transcript it draws a
// quiet placeholder only when there is no host (gallery / editor), never on air.
import { registerLiveDrawer } from './live';
import { getCaption } from '../liveCaptionStore';

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

registerLiveDrawer('live.caption', (ctx, o, env) => {
  const p = (o.live?.props || {}) as Record<string, unknown>;
  const n = Math.max(1, Math.min(6, Math.round(num(p.lines, 2))));
  const size = num(p.size, Math.max(28, o.h / (n * 1.5)));
  const align = (str(p.align, 'center') as CanvasTextAlign);
  const color = str(p.color, env.th.c.ink);
  const family = str(p.font, 'Inter, system-ui, sans-serif');
  const cap = getCaption();
  let lines = cap.lines.slice(-n);
  if (!lines.length) {
    if (env.host) return;                       // on air: nothing to say, show nothing
    lines = ['Live words appear here as they are spoken'];
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${size}px ${family}`;
  const x = align === 'left' ? o.x : align === 'right' ? o.x + o.w : o.x + o.w / 2;
  const lh = size * 1.25;
  // Bottom-anchored: the newest line sits on the baseline and older ones rise above it.
  let y = o.y + o.h - size * 0.25;
  for (let i = lines.length - 1; i >= 0; i--) {
    const age = lines.length - 1 - i;
    ctx.globalAlpha = env.alpha * Math.max(0.25, 1 - age * 0.35);
    ctx.fillStyle = color;
    // shrink to fit the box width rather than overflow
    let text = lines[i];
    while (ctx.measureText(text).width > o.w && text.length > 8) text = text.slice(text.indexOf(' ') + 1 || 1);
    ctx.fillText(text, x, y);
    y -= lh;
  }
  ctx.restore();
});
