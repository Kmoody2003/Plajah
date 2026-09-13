/**
 * NflPlayAnimator — Canvas2D interactive football field with animated play dots.
 *
 * Two modes:
 * 1. Procedural (live): Parses ESPN play-by-play text descriptions and generates
 *    approximate player positions/routes based on formation templates and play outcome.
 * 2. Sample replay: Uses pre-bundled tracking data (Big Data Bowl format) for
 *    authentic historical play replays.
 *
 * Rendering architecture follows ScoreBugCanvas.tsx: refs-based state with
 * requestAnimationFrame loop, lerp interpolation, zero React re-renders during animation.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Play, Pause, SkipBack, ChevronRight, Zap } from 'lucide-react';
import type { NflPlay, NflDrive, NflTeamInfo } from '../../services/nflGameService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerDot {
  x: number;          // 0–120 yards
  y: number;          // 0–53.33 yards
  targetX: number;
  targetY: number;
  team: 'offense' | 'defense';
  jerseyNumber: number;
  speed: number;      // yards per frame step
  label?: string;     // e.g. 'QB', 'WR1', 'RB'
}

interface AnimFrame {
  players: PlayerDot[];
  ballX: number;
  ballY: number;
  phase: 'pre-snap' | 'snap' | 'play' | 'result';
  elapsed: number;    // 0–1 progress through animation
}

interface Props {
  play: NflPlay | null;
  home: NflTeamInfo;
  away: NflTeamInfo;
  /** Which team has the ball on this play */
  possessionSide: 'home' | 'away' | null;
  /** All plays in the current drive — for the drive timeline */
  drivePlays?: NflPlay[];
  /** Callback when user taps a play in the timeline */
  onSelectPlay?: (play: NflPlay) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_YARDS_X = 120;
const FIELD_YARDS_Y = 53.33;

const COLORS = {
  field:       '#1B5E20',
  fieldDark:   '#1A5C1F',
  endzone:     '#0D3B0E',
  yardLine:    'rgba(255,255,255,0.25)',
  yardNumber:  'rgba(255,255,255,0.12)',
  hashMark:    'rgba(255,255,255,0.15)',
  scrimmage:   '#2196F3',
  firstDown:   '#FFC107',
  ball:        '#8B4513',
  ballTrail:   'rgba(139,69,19,0.3)',
  text:        '#FFFFFF',
  resultBg:    'rgba(8,8,16,0.85)',
};

// ─── Formation Templates ──────────────────────────────────────────────────────

function generateOffense(scrimmageX: number, side: number): PlayerDot[] {
  const dir = side;  // 1 = left to right, -1 = right to left
  const cx = scrimmageX;
  const my = FIELD_YARDS_Y / 2;

  return [
    // O-Line (5)
    { x: cx, y: my - 2, targetX: cx, targetY: my - 2, team: 'offense', jerseyNumber: 72, speed: 0, label: 'LT' },
    { x: cx, y: my - 1, targetX: cx, targetY: my - 1, team: 'offense', jerseyNumber: 66, speed: 0, label: 'LG' },
    { x: cx, y: my, targetX: cx, targetY: my, team: 'offense', jerseyNumber: 55, speed: 0, label: 'C' },
    { x: cx, y: my + 1, targetX: cx, targetY: my + 1, team: 'offense', jerseyNumber: 68, speed: 0, label: 'RG' },
    { x: cx, y: my + 2, targetX: cx, targetY: my + 2, team: 'offense', jerseyNumber: 74, speed: 0, label: 'RT' },
    // QB (shotgun — 5 yards back)
    { x: cx - 5 * dir, y: my, targetX: cx - 5 * dir, targetY: my, team: 'offense', jerseyNumber: 15, speed: 0.4, label: 'QB' },
    // RB
    { x: cx - 6 * dir, y: my + 2, targetX: cx - 6 * dir, targetY: my + 2, team: 'offense', jerseyNumber: 26, speed: 0.5, label: 'RB' },
    // TE
    { x: cx, y: my + 4, targetX: cx, targetY: my + 4, team: 'offense', jerseyNumber: 87, speed: 0.35, label: 'TE' },
    // WR1 (left)
    { x: cx, y: my - 18, targetX: cx, targetY: my - 18, team: 'offense', jerseyNumber: 1, speed: 0.5, label: 'WR' },
    // WR2 (right)
    { x: cx, y: my + 18, targetX: cx, targetY: my + 18, team: 'offense', jerseyNumber: 11, speed: 0.5, label: 'WR' },
    // Slot WR
    { x: cx, y: my - 8, targetX: cx, targetY: my - 8, team: 'offense', jerseyNumber: 17, speed: 0.45, label: 'SL' },
  ];
}

function generateDefense(scrimmageX: number, side: number): PlayerDot[] {
  const dir = side;
  const cx = scrimmageX + 1.5 * dir;
  const my = FIELD_YARDS_Y / 2;

  return [
    // D-Line (4)
    { x: cx, y: my - 3, targetX: cx, targetY: my - 3, team: 'defense', jerseyNumber: 97, speed: 0.3, label: 'DE' },
    { x: cx, y: my - 1, targetX: cx, targetY: my - 1, team: 'defense', jerseyNumber: 93, speed: 0.25, label: 'DT' },
    { x: cx, y: my + 1, targetX: cx, targetY: my + 1, team: 'defense', jerseyNumber: 95, speed: 0.25, label: 'DT' },
    { x: cx, y: my + 3, targetX: cx, targetY: my + 3, team: 'defense', jerseyNumber: 91, speed: 0.3, label: 'DE' },
    // LBs (3)
    { x: cx + 4 * dir, y: my - 5, targetX: cx + 4 * dir, targetY: my - 5, team: 'defense', jerseyNumber: 52, speed: 0.35, label: 'LB' },
    { x: cx + 4 * dir, y: my, targetX: cx + 4 * dir, targetY: my, team: 'defense', jerseyNumber: 54, speed: 0.35, label: 'MLB' },
    { x: cx + 4 * dir, y: my + 5, targetX: cx + 4 * dir, targetY: my + 5, team: 'defense', jerseyNumber: 56, speed: 0.35, label: 'LB' },
    // CBs (2)
    { x: cx + 2 * dir, y: my - 17, targetX: cx + 2 * dir, targetY: my - 17, team: 'defense', jerseyNumber: 24, speed: 0.45, label: 'CB' },
    { x: cx + 2 * dir, y: my + 17, targetX: cx + 2 * dir, targetY: my + 17, team: 'defense', jerseyNumber: 21, speed: 0.45, label: 'CB' },
    // Safeties (2)
    { x: cx + 14 * dir, y: my - 8, targetX: cx + 14 * dir, targetY: my - 8, team: 'defense', jerseyNumber: 33, speed: 0.4, label: 'SS' },
    { x: cx + 14 * dir, y: my + 8, targetX: cx + 14 * dir, targetY: my + 8, team: 'defense', jerseyNumber: 32, speed: 0.4, label: 'FS' },
  ];
}

// ─── Play text parser → animation targets ─────────────────────────────────────

function parsePlayText(text: string): { type: 'pass' | 'rush' | 'punt' | 'kickoff' | 'fg' | 'other'; yardsGained: number; direction: 'left' | 'right' | 'middle' | 'deep left' | 'deep right' | 'deep middle' | 'unknown'; isTouchdown: boolean; isInterception: boolean; } {
  const lower = text.toLowerCase();
  const isTouchdown = lower.includes('touchdown') || lower.includes(' td');
  const isInterception = lower.includes('intercept');

  let yardsGained = 0;
  const yardMatch = lower.match(/for\s+(-?\d+)\s+yard/);
  if (yardMatch) yardsGained = parseInt(yardMatch[1]);
  const noGainMatch = lower.match(/for no gain/);
  if (noGainMatch) yardsGained = 0;
  const lossMatch = lower.match(/for a loss of\s+(\d+)/);
  if (lossMatch) yardsGained = -parseInt(lossMatch[1]);

  let direction: 'left' | 'right' | 'middle' | 'deep left' | 'deep right' | 'deep middle' | 'unknown' = 'unknown';
  if (lower.includes('deep left')) direction = 'deep left';
  else if (lower.includes('deep right')) direction = 'deep right';
  else if (lower.includes('deep middle') || lower.includes('deep center')) direction = 'deep middle';
  else if (lower.includes(' left')) direction = 'left';
  else if (lower.includes(' right')) direction = 'right';
  else if (lower.includes(' middle') || lower.includes('up the middle') || lower.includes(' center')) direction = 'middle';

  let type: 'pass' | 'rush' | 'punt' | 'kickoff' | 'fg' | 'other' = 'other';
  if (lower.includes('pass') || lower.includes('sacked') || lower.includes('incomplete')) type = 'pass';
  else if (lower.includes('rush') || lower.includes('run') || lower.includes('scramble') || lower.includes('up the middle') || lower.includes('left end') || lower.includes('right end') || lower.includes('left guard') || lower.includes('right guard') || lower.includes('left tackle') || lower.includes('right tackle')) type = 'rush';
  else if (lower.includes('punt')) type = 'punt';
  else if (lower.includes('kickoff') || lower.includes('kick off')) type = 'kickoff';
  else if (lower.includes('field goal') || lower.includes('extra point')) type = 'fg';

  return { type, yardsGained, direction, isTouchdown, isInterception };
}

function computeTargets(
  players: PlayerDot[],
  parsed: ReturnType<typeof parsePlayText>,
  scrimmageX: number,
  offenseDir: number,
): PlayerDot[] {
  const yards = parsed.yardsGained;
  const my = FIELD_YARDS_Y / 2;
  const dir = offenseDir;

  return players.map(p => {
    const copy = { ...p };
    if (p.team === 'offense') {
      if (p.label === 'QB') {
        if (parsed.type === 'pass') {
          // QB drops back then throws
          copy.targetX = scrimmageX - 3 * dir;
          copy.targetY = my + (parsed.direction.includes('left') ? -2 : parsed.direction.includes('right') ? 2 : 0);
        } else if (parsed.type === 'rush' && (parsed.direction === 'unknown' || p.jerseyNumber === 15)) {
          // QB scramble
          copy.targetX = scrimmageX + yards * dir;
          copy.targetY = my;
        } else {
          copy.targetX = scrimmageX - 2 * dir;
          copy.targetY = my;
        }
      } else if (p.label === 'RB') {
        if (parsed.type === 'rush') {
          const yOff = parsed.direction.includes('left') ? -4 : parsed.direction.includes('right') ? 4 : 0;
          copy.targetX = scrimmageX + yards * dir;
          copy.targetY = my + yOff;
          copy.speed = 0.6;
        } else {
          // Pass protection → checkdown route
          copy.targetX = scrimmageX + 3 * dir;
          copy.targetY = my + 5;
        }
      } else if (p.label === 'WR' || p.label === 'SL') {
        if (parsed.type === 'pass') {
          const routeDepth = Math.max(5, Math.abs(yards));
          const lateralShift = p.y < my ? -3 : 3;
          copy.targetX = scrimmageX + routeDepth * dir;
          copy.targetY = p.y + lateralShift;
          copy.speed = 0.6;
        } else {
          // Block on rush plays
          copy.targetX = scrimmageX + 3 * dir;
          copy.targetY = p.y;
        }
      } else if (p.label === 'TE') {
        if (parsed.type === 'pass' && (parsed.direction.includes('right') || parsed.direction === 'middle')) {
          copy.targetX = scrimmageX + Math.min(Math.abs(yards), 15) * dir;
          copy.targetY = my + 8;
          copy.speed = 0.5;
        } else {
          copy.targetX = scrimmageX + 2 * dir;
          copy.targetY = p.y;
        }
      }
      // O-Line blocks in place
    } else {
      // Defense reacts
      if (p.label === 'DE' || p.label === 'DT') {
        // Rush toward QB
        copy.targetX = scrimmageX - 2 * dir;
        copy.targetY = p.y + (Math.random() - 0.5) * 2;
        copy.speed = 0.3;
      } else if (p.label === 'LB' || p.label === 'MLB') {
        if (parsed.type === 'rush') {
          copy.targetX = scrimmageX + Math.min(yards, 3) * dir;
          copy.targetY = p.y + (my - p.y) * 0.3;
          copy.speed = 0.35;
        } else {
          copy.targetX = p.x + 2 * dir;
          copy.targetY = p.y;
        }
      } else if (p.label === 'CB') {
        // Mirror nearest WR
        copy.targetX = p.x + Math.abs(yards) * 0.6 * dir;
        copy.targetY = p.y;
        copy.speed = 0.55;
      } else if (p.label === 'SS' || p.label === 'FS') {
        copy.targetX = p.x + Math.abs(yards) * 0.3 * dir;
        copy.targetY = p.y + (my - p.y) * 0.2;
        copy.speed = 0.4;
      }
    }
    return copy;
  });
}

// ─── Field drawing ────────────────────────────────────────────────────────────

function drawField(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const xScale = w / FIELD_YARDS_X;
  const yScale = h / FIELD_YARDS_Y;

  // Field green
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(0, 0, w, h);

  // Alternate field stripe every 5 yards
  for (let yd = 0; yd < 120; yd += 10) {
    if ((yd / 10) % 2 === 0) {
      ctx.fillStyle = COLORS.fieldDark;
      ctx.fillRect(yd * xScale, 0, 10 * xScale, h);
    }
  }

  // End zones
  ctx.fillStyle = COLORS.endzone;
  ctx.fillRect(0, 0, 10 * xScale, h);
  ctx.fillRect(110 * xScale, 0, 10 * xScale, h);

  // Yard lines
  ctx.strokeStyle = COLORS.yardLine;
  ctx.lineWidth = 1;
  for (let yd = 10; yd <= 110; yd += 5) {
    ctx.beginPath();
    ctx.moveTo(yd * xScale, 0);
    ctx.lineTo(yd * xScale, h);
    ctx.stroke();
  }

  // Yard numbers
  ctx.font = `bold ${Math.max(10, h * 0.06)}px -apple-system, sans-serif`;
  ctx.fillStyle = COLORS.yardNumber;
  ctx.textAlign = 'center';
  const numbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  numbers.forEach((num, i) => {
    const yd = (i + 1) * 10 + 10;
    ctx.fillText(String(num), yd * xScale, h * 0.18);
    ctx.fillText(String(num), yd * xScale, h * 0.88);
  });

  // Hash marks
  ctx.strokeStyle = COLORS.hashMark;
  ctx.lineWidth = 0.5;
  for (let yd = 11; yd <= 109; yd++) {
    if (yd % 5 === 0) continue;
    [h * 0.33, h * 0.67].forEach(hashY => {
      ctx.beginPath();
      ctx.moveTo(yd * xScale, hashY - 2);
      ctx.lineTo(yd * xScale, hashY + 2);
      ctx.stroke();
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NflPlayAnimator({ play, home, away, possessionSide, drivePlays, onSelectPlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const playersRef = useRef<PlayerDot[]>([]);
  const progressRef = useRef(0);
  const ballPosRef = useRef({ x: 60, y: FIELD_YARDS_Y / 2 });
  const phaseRef = useRef<'idle' | 'pre-snap' | 'play' | 'result'>('idle');

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [resultText, setResultText] = useState('');

  // Determine offense direction and scrimmage
  const scrimmageX = play ? Math.max(10, Math.min(110, 110 - (play.yardLine || 30))) : 60;
  const offenseDir = 1; // offense always goes left→right in our view
  const offenseColor = possessionSide === 'home' ? home.color : possessionSide === 'away' ? away.color : '#3B82F6';
  const defenseColor = possessionSide === 'home' ? away.color : possessionSide === 'away' ? home.color : '#EF4444';

  // Setup play animation
  const setupPlay = useCallback(() => {
    if (!play) return;

    const parsed = parsePlayText(play.text);
    const offense = generateOffense(scrimmageX, offenseDir);
    const defense = generateDefense(scrimmageX, offenseDir);
    const allPlayers = [...offense, ...defense];
    const withTargets = computeTargets(allPlayers, parsed, scrimmageX, offenseDir);

    playersRef.current = withTargets;
    progressRef.current = 0;
    ballPosRef.current = { x: scrimmageX, y: FIELD_YARDS_Y / 2 };
    phaseRef.current = 'pre-snap';
    setResultText('');
  }, [play, scrimmageX, offenseDir]);

  useEffect(() => {
    setupPlay();
  }, [setupPlay]);

  // Start/stop animation
  const startAnimation = useCallback(() => {
    if (!play) return;
    setupPlay();
    phaseRef.current = 'play';
    progressRef.current = 0;
    setIsPlaying(true);
    setResultText('');
  }, [play, setupPlay]);

  const stopAnimation = useCallback(() => {
    setIsPlaying(false);
    phaseRef.current = 'idle';
  }, []);

  const resetAnimation = useCallback(() => {
    stopAnimation();
    setupPlay();
    progressRef.current = 0;
  }, [stopAnimation, setupPlay]);

  // ─── Draw loop ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const W = canvas.width;
    const H = canvas.height;
    const xScale = W / FIELD_YARDS_X;
    const yScale = H / FIELD_YARDS_Y;

    ctx.clearRect(0, 0, W, H);

    // Draw field
    drawField(ctx, W, H);

    // Scrimmage line (blue)
    ctx.strokeStyle = COLORS.scrimmage;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(scrimmageX * xScale, 0);
    ctx.lineTo(scrimmageX * xScale, H);
    ctx.stroke();

    // First down line (yellow)
    if (play?.distance) {
      const fdLine = scrimmageX + play.distance * offenseDir;
      ctx.strokeStyle = COLORS.firstDown;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fdLine * xScale, 0);
      ctx.lineTo(fdLine * xScale, H);
      ctx.stroke();
    }

    // Animate players
    const players = playersRef.current;
    if (phaseRef.current === 'play' && isPlaying) {
      progressRef.current += 0.008 * playbackSpeed;
      if (progressRef.current >= 1) {
        progressRef.current = 1;
        phaseRef.current = 'result';
        setIsPlaying(false);
        if (play) {
          const parsed = parsePlayText(play.text);
          setResultText(
            parsed.isTouchdown ? '🏈 TOUCHDOWN!' :
            parsed.isInterception ? '🔵 INTERCEPTED!' :
            play.shortText || play.text
          );
        }
      }
    }

    const t = Math.min(progressRef.current, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out

    // Draw players
    players.forEach(p => {
      const currentX = p.x + (p.targetX - p.x) * eased;
      const currentY = p.y + (p.targetY - p.y) * eased;
      const px = currentX * xScale;
      const py = currentY * yScale;
      const color = p.team === 'offense' ? offenseColor : defenseColor;
      const radius = Math.max(6, Math.min(12, W * 0.012));

      // Trail line (for offense players that moved significantly)
      if (t > 0.1 && p.team === 'offense' && Math.abs(p.targetX - p.x) > 3) {
        ctx.beginPath();
        ctx.moveTo(p.x * xScale, p.y * yScale);
        ctx.lineTo(px, py);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Player dot with shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // White border
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Jersey number
      ctx.font = `bold ${Math.max(7, radius * 0.8)}px -apple-system, sans-serif`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.jerseyNumber), px, py);
      ctx.textBaseline = 'alphabetic';
    });

    // Ball
    const ballX = ballPosRef.current.x + (
      phaseRef.current === 'play' || phaseRef.current === 'result'
        ? (play?.yardsGained ?? 0) * offenseDir * eased
        : 0
    );
    const ballPx = ballX * xScale;
    const ballPy = (FIELD_YARDS_Y / 2) * yScale;
    ctx.beginPath();
    ctx.ellipse(ballPx, ballPy, radius_ball(W), radius_ball(W) * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ball;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Down & distance label
    if (play) {
      const sfx = ['st', 'nd', 'rd', 'th'][Math.min((play.down || 1) - 1, 3)];
      const label = `${play.down || '—'}${sfx} & ${play.distance || '—'}`;
      const labelW = ctx.measureText(label).width + 20;

      ctx.fillStyle = COLORS.resultBg;
      const lx = scrimmageX * xScale - labelW / 2;
      const ly = H - 28;
      roundRect(ctx, lx, ly, labelW, 22, 6);
      ctx.fill();

      ctx.font = `bold ${Math.max(9, W * 0.014)}px -apple-system, sans-serif`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.fillText(label, scrimmageX * xScale, H - 14);
    }

    // Result overlay
    if (phaseRef.current === 'result' && resultText) {
      ctx.fillStyle = COLORS.resultBg;
      const tw = ctx.measureText(resultText).width + 40;
      roundRect(ctx, W / 2 - tw / 2, H / 2 - 20, tw, 40, 10);
      ctx.fill();

      ctx.font = `bold ${Math.max(12, W * 0.02)}px -apple-system, sans-serif`;
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.fillText(resultText, W / 2, H / 2 + 6);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [play, scrimmageX, offenseDir, offenseColor, defenseColor, isPlaying, playbackSpeed, resultText]);

  // Canvas lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const ratio = FIELD_YARDS_Y / FIELD_YARDS_X;
      canvas.width = w * (window.devicePixelRatio ?? 1);
      canvas.height = w * ratio * (window.devicePixelRatio ?? 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${w * ratio}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <div className="space-y-3">
      {/* Canvas field */}
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={resetAnimation}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/8 text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <SkipBack size={12} /> Reset
        </button>
        <button
          onClick={isPlaying ? stopAnimation : startAnimation}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={{
            background: isPlaying ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
            border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            color: isPlaying ? '#EF4444' : '#F59E0B',
          }}
        >
          {isPlaying ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run Play</>}
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-1 ml-auto">
          {[0.5, 1, 2].map(speed => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
              style={{
                background: playbackSpeed === speed ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${playbackSpeed === speed ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: playbackSpeed === speed ? '#F59E0B' : 'rgba(255,255,255,0.4)',
              }}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      {/* Play description */}
      {play && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px' }}>
          <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
            {play.clock && `${play.clock} · `}Q{play.period}
          </p>
          <p className="type-body-sm" style={{ color: '#fff', marginTop: 2 }}>{play.text}</p>
        </div>
      )}

      {/* Drive timeline */}
      {drivePlays && drivePlays.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {drivePlays.map((dp, i) => (
            <button
              key={dp.id}
              onClick={() => onSelectPlay?.(dp)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: dp.id === play?.id ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${dp.id === play?.id ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.05)'}`,
                color: dp.id === play?.id ? '#F59E0B' : 'rgba(255,255,255,0.35)',
              }}
            >
              {dp.scoringPlay && <Zap size={8} />}
              {i + 1}
              {dp.scoringPlay && <span style={{ color: '#22C55E' }}>★</span>}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!play && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: '32px 16px',
          textAlign: 'center',
        }}>
          <p className="type-label-md" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Select a play from the Play-by-Play tab to animate it here
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function radius_ball(canvasW: number): number {
  return Math.max(4, Math.min(8, canvasW * 0.008));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  (ctx as any).roundRect?.(x, y, w, h, r);
}
