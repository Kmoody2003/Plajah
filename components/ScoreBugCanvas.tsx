/**
 * ScoreBugCanvas — broadcast-grade score overlay rendered on Canvas2D.
 *
 * Sits as an absolute-positioned, pointer-events-none layer on top of any
 * video element. Designed to look like a Fox/ESPN score bug.
 *
 * Features:
 * - Smooth lerp transitions between score changes
 * - Gold flash animation on score update
 * - Pulsing LIVE dot
 * - Sport-specific data rows (down & distance, half/period)
 * - Player tracking coordinate overlay (when showPlayerTracking = true)
 * - Replay banner
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { GameState } from '../services/sportscastService';
import type { TrackedPlayer } from '../hooks/usePlayerTracker';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  gameState: GameState | null;
  players?: TrackedPlayer[];
  showPlayerTracking?: boolean;
  /** Extra CSS class applied to the canvas element */
  className?: string;
}

// ─── Internal animated state (avoids React re-renders on every frame) ─────────

interface AnimState {
  homeScoreDisplay: number;
  awayScoreDisplay: number;
  homeFlash: number;   // 0–1, fades to 0
  awayFlash: number;
  replayAlpha: number; // 0–1, for replay banner
}

// ─── Broadcast palette ────────────────────────────────────────────────────────

const C = {
  bg:      'rgba(8, 8, 16, 0.88)',
  accent:  '#F59E0B',
  live:    '#EF4444',
  text:    '#FFFFFF',
  sub:     'rgba(255,255,255,0.45)',
  divider: 'rgba(255,255,255,0.12)',
  flash:   'rgba(251,191,36,0.55)',
  replay:  'rgba(239,68,68,0.85)',
  trackA:  '#3B82F6',
  trackB:  '#22C55E',
};

// ─── Component ────────────────────────────────────────────────────────────────

const ScoreBugCanvas: React.FC<Props> = ({
  gameState,
  players = [],
  showPlayerTracking = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<AnimState>({
    homeScoreDisplay: 0,
    awayScoreDisplay: 0,
    homeFlash: 0,
    awayFlash: 0,
    replayAlpha: 0,
  });
  const rafIdRef       = useRef<number>(0);
  const prevStateRef   = useRef<GameState | null>(null);
  const gameStateRef   = useRef<GameState | null>(gameState);
  const playersRef     = useRef<TrackedPlayer[]>(players);
  const showTrackRef   = useRef(showPlayerTracking);

  // Keep refs in sync so the rAF loop always sees latest values without needing
  // to re-register the loop on every prop change
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { showTrackRef.current = showPlayerTracking; }, [showPlayerTracking]);

  // Detect score changes → trigger flash
  useEffect(() => {
    if (!gameState) { prevStateRef.current = null; return; }
    const prev = prevStateRef.current;
    if (prev) {
      if (gameState.homeScore > prev.homeScore) animRef.current.homeFlash = 1;
      if (gameState.awayScore > prev.awayScore) animRef.current.awayFlash = 1;
    }
    prevStateRef.current = gameState;
  }, [gameState?.homeScore, gameState?.awayScore]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Detect replay state
  useEffect(() => {
    if (gameState?.replayActive) animRef.current.replayAlpha = 1;
  }, [gameState?.replayActive]);

  // ─── Draw loop ────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafIdRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafIdRef.current = requestAnimationFrame(draw); return; }

    const W  = canvas.width;
    const H  = canvas.height;
    const gs = gameStateRef.current;
    const am = animRef.current;
    const t  = Date.now();

    ctx.clearRect(0, 0, W, H);

    if (gs) {
      // Lerp animated score displays toward actual values
      am.homeScoreDisplay += (gs.homeScore - am.homeScoreDisplay) * 0.25;
      am.awayScoreDisplay += (gs.awayScore - am.awayScoreDisplay) * 0.25;
      am.homeFlash = Math.max(0, am.homeFlash - 0.018);
      am.awayFlash = Math.max(0, am.awayFlash - 0.018);
      am.replayAlpha = gs.replayActive
        ? Math.min(1, am.replayAlpha + 0.04)
        : Math.max(0, am.replayAlpha - 0.04);

      drawScoreBug(ctx, gs, am, t);
    }

    // ── Player tracking overlay ──────────────────────────────────────────────
    if (showTrackRef.current) {
      playersRef.current.forEach((p, i) => {
        const px = p.x * W;
        const py = p.y * H;
        const color = i === 0 ? gs?.homeColor ?? C.trackA : i === 1 ? gs?.awayColor ?? C.trackB : C.trackB;
        const spdTxt = p.speed > 0.8 ? `${p.speed.toFixed(1)} mph` : '';

        // Outer ring
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        // Inner dot
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (spdTxt) {
          ctx.font = 'bold 10px -apple-system, sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
          ctx.fillText(spdTxt, px, py - 20);
          ctx.shadowBlur = 0;
        }
      });
    }

    // ── Replay banner ────────────────────────────────────────────────────────
    if (am.replayAlpha > 0.01) {
      const bH = 52;
      ctx.globalAlpha = am.replayAlpha;
      ctx.fillStyle = C.replay;
      ctx.fillRect(0, H / 2 - bH / 2, W, bH);
      ctx.font = 'black 28px -apple-system, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '6px';
      ctx.fillText('⚡  INSTANT REPLAY', W / 2, H / 2 + 10);
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }

    rafIdRef.current = requestAnimationFrame(draw);
  }, []);

  // ─── Score bug painter ────────────────────────────────────────────────────

  function drawScoreBug(
    ctx: CanvasRenderingContext2D,
    gs: GameState,
    am: AnimState,
    t: number,
  ) {
    const BX = 20, BY_BASE = 20;
    const BW = 340, BH = 74;
    const R  = 10;

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = 24;
    ctx.shadowOffsetY = 6;

    // ── Background ─────────────────────────────────────────────────────────
    ctx.beginPath();
    (ctx as any).roundRect?.(BX, BY_BASE, BW, BH, R);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.restore();

    // ── Left accent bar ─────────────────────────────────────────────────────
    ctx.beginPath();
    (ctx as any).roundRect?.(BX, BY_BASE, 5, BH, [R, 0, 0, R]);
    ctx.fillStyle = C.accent;
    ctx.fill();

    // ── Home team flash ─────────────────────────────────────────────────────
    if (am.homeFlash > 0.01) {
      ctx.beginPath();
      (ctx as any).roundRect?.(BX + 5, BY_BASE, BW / 2 - 15, BH, 0);
      ctx.fillStyle = `rgba(251,191,36,${am.homeFlash * 0.45})`;
      ctx.fill();
    }

    // ── Away team flash ─────────────────────────────────────────────────────
    if (am.awayFlash > 0.01) {
      ctx.beginPath();
      (ctx as any).roundRect?.(BX + BW / 2 + 15, BY_BASE, BW / 2 - 20, BH, [0, R, R, 0]);
      ctx.fillStyle = `rgba(251,191,36,${am.awayFlash * 0.45})`;
      ctx.fill();
    }

    const MID = BX + BW / 2;

    // ── Home ────────────────────────────────────────────────────────────────
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = C.sub;
    ctx.textAlign = 'left';
    ctx.fillText(gs.homeTeam.slice(0, 10).toUpperCase(), BX + 14, BY_BASE + 19);

    ctx.font = 'bold 34px -apple-system, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(Math.round(am.homeScoreDisplay)), BX + 14, BY_BASE + 58);

    // ── Divider ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MID, BY_BASE + 10);
    ctx.lineTo(MID, BY_BASE + BH - 10);
    ctx.stroke();

    // ── Centre: period label + clock ─────────────────────────────────────────
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText(gs.periodLabel, MID, BY_BASE + 21);

    ctx.font = `${gs.clockRunning ? 'bold' : 'normal'} 13px "SF Mono", "Courier New", monospace`;
    ctx.fillStyle = C.text;
    ctx.fillText(gs.timeRemaining, MID, BY_BASE + 37);

    // Football down & distance row
    if (gs.sport === 'FOOTBALL' && gs.down != null) {
      const sfx = ['st', 'nd', 'rd', 'th'][Math.min((gs.down ?? 1) - 1, 3)];
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillStyle = C.sub;
      ctx.fillText(`${gs.down}${sfx} & ${gs.distance ?? '—'}`, MID, BY_BASE + 52);
    }

    // Soccer running clock
    if (gs.sport === 'SOCCER') {
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillStyle = C.sub;
      ctx.fillText(gs.periodLabel, MID, BY_BASE + 52);
    }

    // ── Away ─────────────────────────────────────────────────────────────────
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = C.sub;
    ctx.textAlign = 'right';
    ctx.fillText(gs.awayTeam.slice(0, 10).toUpperCase(), BX + BW - 12, BY_BASE + 19);

    ctx.font = 'bold 34px -apple-system, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(Math.round(am.awayScoreDisplay)), BX + BW - 12, BY_BASE + 58);

    // ── LIVE dot ─────────────────────────────────────────────────────────────
    const LX = BX + BW + 14;
    const LY = BY_BASE + BH / 2;
    const pulse = 0.65 + 0.35 * Math.sin(t / 480);

    // Glow ring
    ctx.beginPath();
    ctx.arc(LX, LY - 7, 8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239,68,68,${0.25 * pulse})`;
    ctx.fill();
    // Core dot
    ctx.beginPath();
    ctx.arc(LX, LY - 7, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.live;
    ctx.fill();

    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = C.live;
    ctx.textAlign = 'left';
    ctx.fillText('LIVE', LX + 10, LY - 3);
  }

  // ─── Canvas sizing & loop lifecycle ──────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    fit();
    const ro = new ResizeObserver(fit);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    rafIdRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        zIndex:        10,
      }}
    />
  );
};

export default ScoreBugCanvas;
