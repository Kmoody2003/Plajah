// mediaEngine/layers/scoreboardLayer.ts — the sportscast score bug, burned into program.
//
// A compositor overlay, so the scoreboard is IN the recording and IN the live stream —
// viewers on any player (Live Hub, a TV app, a WHIP destination) see it without a
// Plajah-specific overlay. Reads the shared sportscast GameState; the clock is derived
// from its anchor every frame, so it runs smoothly without Firestore writes.

import type { OverlayLayer } from '../programCompositor';
import { displayClock, type GameState } from '../../sportscastService';

export interface ScoreboardLayerOptions {
  /** Return the latest game state (or null to hide). Called every frame — keep it cheap. */
  getState: () => GameState | null;
  /** Small label above the bug — school / league name. */
  getTitle?: () => string | undefined;
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export function createScoreboardLayer(opts: ScoreboardLayerOptions): OverlayLayer {
  return {
    id: 'scoreboard',
    z: 50,
    draw(ctx, w, h) {
      const gs = opts.getState();
      if (!gs) return;
      const s = h / 720;                       // design at 720p, scale to the canvas
      const bh = 44 * s, pad = 24 * s;
      const teamW = 150 * s, scoreW = 52 * s, midW = 96 * s;
      const bw = teamW * 2 + scoreW * 2 + midW;
      const x = pad, y = h - pad - bh;         // lower-left, the broadcast convention

      ctx.font = `600 ${11 * s}px Outfit, Inter, sans-serif`;
      const title = opts.getTitle?.();
      if (title) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(title.toUpperCase(), x + 4 * s, y - 6 * s);
      }

      ctx.save();
      roundRect(ctx, x, y, bw, bh, 10 * s);
      ctx.fillStyle = 'rgba(10,10,12,0.86)';
      ctx.fill();
      ctx.clip();

      const team = (name: string, color: string, score: number, tx: number, poss: boolean) => {
        ctx.fillStyle = color || '#555';
        ctx.fillRect(tx, y, 6 * s, bh);
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${16 * s}px Outfit, Inter, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText((name || '').toUpperCase().slice(0, 12), tx + 16 * s, y + bh / 2, teamW - 28 * s);
        if (poss) { ctx.beginPath(); ctx.arc(tx + teamW - 10 * s, y + bh / 2, 3.5 * s, 0, Math.PI * 2); ctx.fillStyle = '#FF8C00'; ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(tx + teamW, y, scoreW, bh);
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${22 * s}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(score ?? 0), tx + teamW + scoreW / 2, y + bh / 2 + 1 * s);
      };
      team(gs.homeTeam, gs.homeColor, gs.homeScore, x, gs.possession === 'home');
      team(gs.awayTeam, gs.awayColor, gs.awayScore, x + teamW + scoreW, gs.possession === 'away');

      const mx = x + 2 * (teamW + scoreW);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `600 ${11 * s}px Outfit, Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(gs.periodLabel || '', mx + midW / 2, y + bh * 0.3);
      ctx.fillStyle = gs.clockRunning ? '#fff' : 'rgba(255,255,255,0.75)';
      ctx.font = `700 ${16 * s}px Inter, sans-serif`;
      ctx.fillText(displayClock(gs), mx + midW / 2, y + bh * 0.68);
      ctx.restore();

      if (gs.sport === 'FOOTBALL' && gs.down) {
        const sfx = ['st', 'nd', 'rd', 'th'][Math.min(gs.down - 1, 3)];
        const txt = `${gs.down}${sfx} & ${gs.distance ?? 10}`;
        ctx.font = `700 ${12 * s}px Outfit, Inter, sans-serif`;
        const tw = ctx.measureText(txt).width + 20 * s;
        roundRect(ctx, x + bw + 8 * s, y + 8 * s, tw, bh - 16 * s, 8 * s);
        ctx.fillStyle = '#FF8C00'; ctx.fill();
        ctx.fillStyle = '#1a0a00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + bw + 8 * s + tw / 2, y + bh / 2);
      }

      if (gs.replayActive) {
        const txt = 'REPLAY';
        ctx.font = `800 ${14 * s}px Outfit, Inter, sans-serif`;
        const tw = ctx.measureText(txt).width + 28 * s;
        roundRect(ctx, w - pad - tw, pad, tw, 32 * s, 16 * s);
        ctx.fillStyle = '#D40055'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, w - pad - tw / 2, pad + 16 * s);
      }
    },
  };
}
