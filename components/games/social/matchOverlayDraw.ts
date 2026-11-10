// Live-stream overlay for a match: a neon scoreboard + board drawn onto every program frame by the live composer
// (services/liveComposer.ts setOverlayDrawer), so viewers of the Mux stream see the game, Twitch-style, over the
// streamer's camera. Reads a mutable snapshot each frame, so the drawer never needs replacing as the match moves.

export interface OverlaySnapshot {
  state: string;
  names: [string, string];
  status: string;
  clock?: number;
  /** winning line, if any */
  line?: readonly number[];
}

export type OverlayDrawer = (ctx: CanvasRenderingContext2D, W: number, H: number, dt: number) => void;

export function makeMatchOverlay(read: () => OverlaySnapshot | null): OverlayDrawer {
  return (ctx, W, H) => {
    const s = read(); if (!s) return;
    const size = Math.round(Math.min(W, H) * 0.34);
    const pad = Math.round(size * 0.06);
    const head = Math.round(size * 0.2);
    const x0 = W - size - Math.round(W * 0.03), y0 = H - size - head - Math.round(H * 0.04);
    // panel
    ctx.fillStyle = 'rgba(5,6,13,0.82)';
    roundRect(ctx, x0 - pad, y0 - pad, size + pad * 2, size + head + pad * 2, pad * 1.4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,240,255,0.55)'; ctx.lineWidth = Math.max(1, size * 0.006); ctx.stroke();
    // header: X name · status · O name
    const fs = Math.max(10, Math.round(head * 0.34));
    ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f0ff'; ctx.textAlign = 'left'; ctx.fillText(clip(ctx, `✕ ${s.names[0]}`, size * 0.42), x0, y0 + head * 0.3);
    ctx.fillStyle = '#ff2bd6'; ctx.textAlign = 'right'; ctx.fillText(clip(ctx, `${s.names[1]} ◯`, size * 0.42), x0 + size, y0 + head * 0.3);
    ctx.font = `800 ${Math.round(fs * 0.8)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center';
    ctx.fillText(s.clock ? `${s.status} · ${s.clock}s` : s.status, x0 + size / 2, y0 + head * 0.75);
    // board
    const by = y0 + head, cell = size / 3, gap = Math.max(2, size * 0.02);
    for (let i = 0; i < 9; i++) {
      const cx = x0 + (i % 3) * cell, cy = by + Math.floor(i / 3) * cell;
      const won = s.line?.includes(i);
      ctx.fillStyle = won ? 'rgba(255,209,102,0.22)' : 'rgba(255,255,255,0.05)';
      roundRect(ctx, cx + gap / 2, cy + gap / 2, cell - gap, cell - gap, gap * 2); ctx.fill();
      const m = s.state[i];
      const r = cell * 0.27, mx = cx + cell / 2, my = cy + cell / 2;
      ctx.lineWidth = Math.max(2, cell * 0.1); ctx.lineCap = 'round';
      if (m === 'X') {
        ctx.strokeStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = cell * 0.15;
        ctx.beginPath(); ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); ctx.stroke();
      } else if (m === 'O') {
        ctx.strokeStyle = '#ff2bd6'; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = cell * 0.15;
        ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
