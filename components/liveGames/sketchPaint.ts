// Paints Sketch Rush strokes (1000 × 750 canvas units) into any rectangle of a 2D context. Shared by the on-screen
// board and the live-stream program overlay, so the picture in the video matches the one in the feed card.
import { CANVAS_H, CANVAS_W } from '../../services/liveGames/core';

export type Stroke = { id: number; c: string; w: number; p: number[] };

export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: ReadonlyArray<Stroke>, x: number, y: number, w: number, h: number, bg = '#ffffff') {
  ctx.save();
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const sx = w / CANVAS_W, sy = h / CANVAS_H, s = Math.min(sx, sy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of strokes) {
    const p = st.p; if (p.length < 2) continue;
    ctx.strokeStyle = st.c; ctx.fillStyle = st.c; ctx.lineWidth = Math.max(1, st.w * s);
    if (p.length === 2) { ctx.beginPath(); ctx.arc(x + p[0] * sx, y + p[1] * sy, Math.max(0.5, (st.w * s) / 2), 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(x + p[0] * sx, y + p[1] * sy);
    // Midpoint quadratic smoothing: steady lines from coarse pointer samples.
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(x + p[i] * sx, y + p[i + 1] * sy, x + mx * sx, y + my * sy);
    }
    ctx.lineTo(x + p[p.length - 2] * sx, y + p[p.length - 1] * sy);
    ctx.stroke();
  }
  ctx.restore();
}
