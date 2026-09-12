// lowerThirdLayer.ts — the ONE renderer for motion lower thirds.
//
// Draws a resolved LowerThird (services/fabula/lowerThirds.ts) onto a 2D
// canvas. Fabula's monitor draws it live onto an overlay canvas; the offline
// export asks getLowerThirdCanvas() for a keyed frame the GL compositor samples
// (bright-on-transparent, so it composites with 'normal' blend — unlike the
// legacy titles, plates here can be dark). Same code path → identical pixels.
import { evaluateLowerThird, applyGraphicRef, type LowerThirdSpec, type LTGraphicRef, type ResolvedLowerThird, type ResolvedText, LT_W, LT_H } from '../../../../services/fabula/lowerThirds';
import { fontCss } from '../../../../services/tela/telaFonts';

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean); let line = '';
    for (const w of words) { const probe = line ? line + ' ' + w : w; if (line && ctx.measureText(probe).width > maxW) { out.push(line); line = w; } else line = probe; }
    out.push(line);
  }
  return out.length ? out : [''];
}

function pathScaled(ctx: CanvasRenderingContext2D, d: string, x: number, y: number, w: number, h: number) {
  const p = new Path2D(d);
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 100, h / 100); ctx.fill(p, 'evenodd'); ctx.restore(); // evenodd = parity with the SVG renderer
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, tx: ResolvedText, s: number) {
  const r = tx.role; if (!tx.text) return;
  let size = r.size * s;
  const family = fontCss(r.font);
  const font = (sz: number) => `${r.italic ? 'italic ' : ''}${r.weight} ${sz}px ${family}`;
  ctx.font = font(size);
  ctx.textBaseline = 'alphabetic';
  const maxW = tx.w * s, maxLines = r.maxLines ?? 2;
  let lines = wrapWords(ctx, tx.text, maxW);
  // Shrink to fit the allowed line count (real templates never let a name run to three lines).
  let guard = 0;
  while (lines.length > maxLines && guard++ < 12) { size *= .92; ctx.font = font(size); lines = wrapWords(ctx, tx.text, maxW); }
  const lineH = size * (r.lineHeight ?? 1.12);
  const tracking = (r.tracking || 0) * size;
  ctx.fillStyle = tx.color;
  if (r.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .18; ctx.shadowOffsetY = size * .04; } else { ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  const x0 = tx.x * s, y0 = tx.y * s + size * .92;
  if (r.rotation) { ctx.save(); ctx.translate(x0, y0); ctx.rotate(r.rotation * Math.PI / 180); ctx.translate(-x0, -y0); }
  let gi = 0;
  for (let li = 0; li < lines.length; li++) {
    const chars = Array.from(lines[li]);
    const adv = chars.map((ch, k) => ctx.measureText(ch).width + tracking + (tx.glyphs[gi + k]?.spacing || 0) * size);
    const lineW = adv.reduce((a, b) => a + b, 0) - (chars.length ? tracking : 0);
    let x = r.align === 'center' ? x0 + maxW / 2 - lineW / 2 : r.align === 'right' ? x0 + maxW - lineW : x0;
    const y = y0 + li * lineH;
    for (let k = 0; k < chars.length; k++) {
      const g = tx.glyphs[gi + k];
      const ch = g?.char ?? chars[k];
      const op = (g?.opacity ?? 1) * tx.opacity;
      if (op > .002) {
        ctx.save(); ctx.globalAlpha *= Math.min(1, op);
        if (g && (g.dx || g.dy || g.scale !== 1)) { const cx = x + adv[k] / 2, cy = y - size * .35; ctx.translate(cx + g.dx * size, cy + g.dy * size); ctx.scale(g.scale, g.scale); ctx.translate(-cx, -cy); }
        if (g && g.blur > .01 && 'filter' in ctx) (ctx as any).filter = `blur(${(g.blur * size).toFixed(1)}px)`;
        ctx.fillText(ch, x, y);
        ctx.restore();
      }
      x += adv[k];
    }
    gi += chars.length + 1;
  }
  if (r.rotation) ctx.restore();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

/** Draw a resolved lower third into a W×H canvas context (design space is 1920×1080). */
export function drawLowerThird(ctx: CanvasRenderingContext2D, resolved: ResolvedLowerThird, W: number, H: number) {
  const s = W / LT_W; // uniform scale; height follows the design's aspect (frame is letterboxed by the caller if needed)
  const sy = H / LT_H;
  ctx.save();
  ctx.scale(1, sy / s); // stretch to the actual frame aspect so % anchors stay where the editor put them
  for (const l of resolved.layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity;
    if (l.layer.blend && l.layer.blend !== 'normal') ctx.globalCompositeOperation = l.layer.blend as GlobalCompositeOperation;
    if (l.clip) { ctx.beginPath(); ctx.rect(l.clip.x * s, l.clip.y * s, l.clip.w * s, l.clip.h * s); ctx.clip(); }
    if (l.rotation || l.scaleX !== 1 || l.scaleY !== 1) { ctx.translate(l.px * s, l.py * s); ctx.rotate(l.rotation * Math.PI / 180); ctx.scale(l.scaleX, l.scaleY); ctx.translate(-l.px * s, -l.py * s); }
    if (l.gradient) {
      const a = l.gradient.angle * Math.PI / 180, cx = (l.x + l.w / 2) * s, cy = (l.y + l.h / 2) * s, hx = Math.cos(a) * l.w * s / 2, hy = Math.sin(a) * l.h * s / 2;
      const g = ctx.createLinearGradient(cx - hx, cy - hy, cx + hx, cy + hy); g.addColorStop(0, l.gradient.from); g.addColorStop(1, l.gradient.to); ctx.fillStyle = g;
    } else ctx.fillStyle = l.fill;
    const x = l.x * s, y = l.y * s, w = l.w * s, h = l.h * s;
    if (l.layer.kind === 'rect') { roundRect(ctx, x, y, w, h, (l.layer.rx || 0) * s); if (l.fill !== 'none') ctx.fill(); if (l.stroke && l.layer.strokeWidth) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.layer.strokeWidth * s; if (l.layer.dash) ctx.setLineDash(l.layer.dash.map(d => d * s)); ctx.stroke(); } }
    else if (l.layer.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2); if (l.fill !== 'none') ctx.fill(); if (l.stroke && l.layer.strokeWidth) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.layer.strokeWidth * s; ctx.stroke(); } }
    else if (l.layer.kind === 'line') { ctx.strokeStyle = l.stroke || l.fill; ctx.lineWidth = (l.layer.strokeWidth || 2) * s; ctx.lineCap = 'round'; if (l.layer.dash) ctx.setLineDash(l.layer.dash.map(d => d * s)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke(); }
    else if (l.layer.kind === 'path' && l.layer.path) { if (l.fill !== 'none') pathScaled(ctx, l.layer.path, x, y, w, h); if (l.stroke && l.layer.strokeWidth) { const p = new Path2D(l.layer.path); ctx.save(); ctx.translate(x, y); ctx.scale(w / 100, h / 100); ctx.strokeStyle = l.stroke; ctx.lineWidth = l.layer.strokeWidth * s / Math.max(.001, Math.sqrt((w / 100) * (h / 100))); ctx.stroke(p); ctx.restore(); } }
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const tx of [resolved.tag, resolved.title, resolved.subtitle]) if (tx) drawText(ctx, tx, s);
  ctx.restore();
}

// ── Export path: keyed, cached frames ─────────────────────────────────────────
const cache = new Map<string, HTMLCanvasElement>();
export interface LowerThirdFrameOpts { spec: LowerThirdSpec; ref?: LTGraphicRef | null; title: string; subtitle?: string; tag?: string; t: number; duration: number; origin?: { x: number; y: number }; width?: number; height?: number }
export function getLowerThirdCanvas(o: LowerThirdFrameOpts): HTMLCanvasElement {
  const spec = applyGraphicRef(o.spec, o.ref);
  const resolved = evaluateLowerThird(spec, o.t, o.duration, { title: o.title, subtitle: o.subtitle, tag: o.tag }, o.origin);
  const tq = resolved.animating ? Math.round(o.t * 120) / 120 : -1;
  const W = o.width || 1920, H = o.height || 1080;
  const key = `${spec.id}|${JSON.stringify(o.ref || null)}|${o.title}|${o.subtitle || ''}|${o.tag || ''}|${o.origin ? o.origin.x + ',' + o.origin.y : ''}|${W}x${H}|${tq}`;
  const hit = cache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  drawLowerThird(ctx, resolved, W, H);
  cache.set(key, c);
  if (cache.size > 240) { const k = cache.keys().next().value; if (k) cache.delete(k); }
  return c;
}
