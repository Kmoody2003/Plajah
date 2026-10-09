/**
 * EvitePlayGate — the kids "play gate": before a kids invite resolves its details, the child plays a 10–15 s
 * mini-game (pop, catch, memory, hunt, candles) or scratches a foil to reveal, the card celebrates, then onWin().
 *
 *   • sits absolutely over its parent (the 2:3 card, usually as a child of EviteStage) so the plate stays visible
 *   • canvas 2D, vector-drawn sprites (cached per colour/size), touch + mouse, ≤24 particles, 60 fps on a 375 px phone
 *   • Motion Council kids: ONE spring(320,28) for every interaction; hits = 2-frame squish + 1-frame flash + 3-frame
 *     shard burst with a 2-frame hit-pause; celebration = ≤24 particles with a 45-frame life
 *   • a parent can ALWAYS skip with one visible tap (top-right, 44 px+, focused for keyboard users; Esc also skips)
 *   • no child gets stuck: visible play time is capped at 15 s, after 7 s the game starts helping
 *   • reduced motion: no flying sprites — the same goal as tap-to-reveal tiles (opacity only), or one "Open" tap
 *   • pauses while the tab is hidden
 *
 * All game logic that can be pure lives in services/evite/playGames.ts (tested in tests/evitePlay.test.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { springStep } from '../../services/evite/motionRecipes';
import {
  type PlaySpec, type SpriteKind, type ShardKind,
  FRAME_MS, PLAY_SPRING, HIT, WIN, WIN_FADE_MS, WIN_DONE_MS, REVEAL_AT,
  spawnSchedule, memoryDeck, memoryFaces, memoryGrid, huntSpots, tapRadius, pickNearest, hitRect,
  scratchGrid, scratchAt, scratchLine, coverage, createClock, tickClock, pauseClock, assistLevel,
  springAt, hitPhase, shardFor, progressLabel, spriteNoun, type ScratchGrid, type SpawnEvent,
} from '../../services/evite/playGames';

export interface EvitePlayGateProps {
  spec: PlaySpec;
  accent: string;
  reducedMotion?: boolean;
  onWin(): void;
  onSkip(): void;
}

// ── colour ───────────────────────────────────────────────────────────────────────────────────────────────────────
const P2 = Math.PI * 2;
type C2D = CanvasRenderingContext2D;
function rgbOf(h: string): [number, number, number] {
  let m = (h || '#FF8C00').replace('#', ''); if (m.length === 3) m = m.split('').map(c => c + c).join('');
  const n = parseInt(m.slice(0, 6), 16); return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 140, 0];
}
/** amt > 0 mixes toward white, < 0 toward black */
const shade = (h: string, amt: number) => { const [r, g, b] = rgbOf(h); const t = amt > 0 ? 255 : 0, k = Math.min(1, Math.abs(amt)); return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`; };
const rgba = (h: string, a: number) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function rrect(c: C2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + k, y); c.arcTo(x + w, y, x + w, y + h, k); c.arcTo(x + w, y + h, x, y + h, k); c.arcTo(x, y + h, x, y, k); c.arcTo(x, y, x + w, y, k); c.closePath();
}
function radial(c: C2D, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]) {
  const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, s] of stops) g.addColorStop(o, s); return g;
}
function starPath(c: C2D, r: number, inner = 0.46, n = 5) {
  c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
}
function heartPath(c: C2D, r: number) {
  c.beginPath(); c.moveTo(0, r * 0.85); c.bezierCurveTo(-r * 1.15, r * 0.05, -r * 0.7, -r * 1.0, 0, -r * 0.42); c.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.15, r * 0.05, 0, r * 0.85); c.closePath();
}

// ── sprites: vector, drawn centred at the origin with radius r ───────────────────────────────────────────────────
function drawSprite(c: C2D, kind: SpriteKind, r: number, col: string) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch (kind) {
    case 'balloon': {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = Math.max(1, r * 0.05);
      c.beginPath(); c.moveTo(0, r * 0.86); c.bezierCurveTo(r * 0.25, r * 1.2, -r * 0.25, r * 1.45, r * 0.05, r * 1.85); c.stroke();
      c.fillStyle = radial(c, -r * 0.3, -r * 0.5, r * 0.08, 0, -r * 0.1, r * 1.05, [[0, shade(col, 0.55)], [0.55, col], [1, shade(col, -0.35)]]);
      c.beginPath(); c.ellipse(0, -r * 0.12, r * 0.8, r * 0.95, 0, 0, P2); c.fill();
      c.fillStyle = shade(col, -0.2); c.beginPath(); c.moveTo(-r * 0.13, r * 0.9); c.lineTo(r * 0.13, r * 0.9); c.lineTo(0, r * 0.78); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-r * 0.34, -r * 0.5, r * 0.13, r * 0.26, -0.5, 0, P2); c.fill();
      break;
    }
    case 'bubble': {
      c.fillStyle = radial(c, 0, 0, r * 0.2, 0, 0, r, [[0, rgba(col, 0.05)], [0.72, rgba(col, 0.18)], [1, rgba(col, 0.55)]]);
      c.beginPath(); c.arc(0, 0, r * 0.95, 0, P2); c.fill();
      const s = c.createLinearGradient(-r, -r, r, r); s.addColorStop(0, 'rgba(255,255,255,.95)'); s.addColorStop(0.5, rgba(col, 0.95)); s.addColorStop(1, 'rgba(255,190,240,.95)');
      c.strokeStyle = s; c.lineWidth = r * 0.08; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = r * 0.11; c.beginPath(); c.arc(0, 0, r * 0.66, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(r * 0.42, r * 0.42, r * 0.07, 0, P2); c.fill();
      break;
    }
    case 'star': {
      starPath(c, r * 0.98);
      c.fillStyle = radial(c, -r * 0.2, -r * 0.3, r * 0.05, 0, 0, r, [[0, shade(col, 0.65)], [0.5, col], [1, shade(col, -0.3)]]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = r * 0.07; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-r * 0.16, -r * 0.3, r * 0.08, r * 0.16, -0.5, 0, P2); c.fill();
      break;
    }
    case 'egg': {
      const egg = () => { c.beginPath(); c.moveTo(0, -r * 0.98); c.bezierCurveTo(r * 0.55, -r * 0.98, r * 0.78, r * 0.05, r * 0.74, r * 0.35); c.bezierCurveTo(r * 0.7, r * 0.78, r * 0.35, r * 0.98, 0, r * 0.98); c.bezierCurveTo(-r * 0.35, r * 0.98, -r * 0.7, r * 0.78, -r * 0.74, r * 0.35); c.bezierCurveTo(-r * 0.78, r * 0.05, -r * 0.55, -r * 0.98, 0, -r * 0.98); c.closePath(); };
      egg(); c.fillStyle = radial(c, -r * 0.25, -r * 0.4, r * 0.05, 0, 0, r * 1.05, [[0, shade(col, 0.75)], [0.55, shade(col, 0.2)], [1, shade(col, -0.25)]]); c.fill();
      c.save(); egg(); c.clip(); c.fillStyle = shade(col, -0.32);
      for (const [x, y, s] of [[-0.3, -0.2, 0.13], [0.3, 0.1, 0.16], [-0.12, 0.52, 0.11], [0.36, -0.52, 0.08], [-0.55, 0.3, 0.09]]) { c.beginPath(); c.arc(x * r, y * r, s * r, 0, P2); c.fill(); }
      c.restore();
      egg(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = r * 0.06; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.5, r * 0.1, r * 0.2, -0.4, 0, P2); c.fill();
      break;
    }
    case 'coin': {
      c.fillStyle = radial(c, -r * 0.3, -r * 0.35, r * 0.05, 0, 0, r, [[0, shade(col, 0.6)], [0.6, col], [1, shade(col, -0.35)]]);
      c.beginPath(); c.arc(0, 0, r * 0.95, 0, P2); c.fill();
      c.strokeStyle = shade(col, -0.3); c.lineWidth = r * 0.07; c.beginPath(); c.arc(0, 0, r * 0.72, 0, P2); c.stroke();
      starPath(c, r * 0.38); c.fillStyle = shade(col, 0.4); c.fill(); c.strokeStyle = shade(col, -0.25); c.lineWidth = r * 0.05; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = r * 0.08; c.beginPath(); c.arc(0, 0, r * 0.86, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
      break;
    }
    case 'gem': {
      const pts: [number, number][] = [[-0.55, -0.6], [0.55, -0.6], [0.95, -0.15], [0, 0.95], [-0.95, -0.15]];
      c.beginPath(); pts.forEach(([x, y]) => c.lineTo(x * r, y * r)); c.closePath();
      const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, shade(col, 0.55)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.4)); c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = r * 0.07; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = r * 0.045; c.beginPath();
      c.moveTo(-0.95 * r, -0.15 * r); c.lineTo(0.95 * r, -0.15 * r);
      c.moveTo(-0.55 * r, -0.6 * r); c.lineTo(-0.3 * r, -0.15 * r); c.lineTo(0, -0.6 * r); c.lineTo(0.3 * r, -0.15 * r); c.lineTo(0.55 * r, -0.6 * r);
      c.moveTo(-0.3 * r, -0.15 * r); c.lineTo(0, 0.95 * r); c.lineTo(0.3 * r, -0.15 * r); c.stroke();
      break;
    }
    case 'paw': {
      const shapes = () => { c.beginPath(); c.ellipse(0, r * 0.32, r * 0.5, r * 0.4, 0, 0, P2); for (const [x, y, a] of [[-0.62, -0.12, -0.35], [-0.24, -0.55, -0.12], [0.24, -0.55, 0.12], [0.62, -0.12, 0.35]]) { c.moveTo(x * r + r * 0.19, y * r); c.ellipse(x * r, y * r, r * 0.19, r * 0.25, a, 0, P2); } };
      shapes(); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = r * 0.16; c.stroke();
      shapes(); c.fillStyle = radial(c, -r * 0.2, -r * 0.2, r * 0.05, 0, 0, r, [[0, shade(col, 0.3)], [1, shade(col, -0.25)]]); c.fill();
      break;
    }
    case 'note': {
      const shapes = () => {
        c.beginPath();
        c.ellipse(-r * 0.42, r * 0.6, r * 0.28, r * 0.2, -0.35, 0, P2); c.moveTo(r * 0.78, r * 0.45); c.ellipse(r * 0.5, r * 0.45, r * 0.28, r * 0.2, -0.35, 0, P2);
        c.rect(-r * 0.2, -r * 0.7, r * 0.09, r * 1.28); c.rect(r * 0.72, -r * 0.85, r * 0.09, r * 1.28);
        c.moveTo(-r * 0.2, -r * 0.72); c.lineTo(r * 0.81, -r * 0.88); c.lineTo(r * 0.81, -r * 0.6); c.lineTo(-r * 0.2, -r * 0.44); c.closePath();
      };
      shapes(); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = r * 0.16; c.stroke();
      shapes(); c.fillStyle = col; c.fill();
      break;
    }
    case 'ball': {
      c.fillStyle = radial(c, -r * 0.3, -r * 0.35, r * 0.05, 0, 0, r, [[0, '#ffffff'], [0.7, '#eef0f6'], [1, '#b9bdcc']]);
      c.beginPath(); c.arc(0, 0, r * 0.95, 0, P2); c.fill();
      c.save(); c.beginPath(); c.arc(0, 0, r * 0.95, 0, P2); c.clip();
      const pent = (cx: number, cy: number, rr: number, rot: number) => { c.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + (i * P2) / 5; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); c.fill(); };
      c.fillStyle = '#1d1b2b'; pent(0, 0, r * 0.32, -Math.PI / 2);
      c.strokeStyle = '#1d1b2b'; c.lineWidth = r * 0.05;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * P2) / 5; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32); c.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72); c.stroke(); pent(Math.cos(a + Math.PI / 5) * r * 1.0, Math.sin(a + Math.PI / 5) * r * 1.0, r * 0.3, a); }
      c.restore();
      c.strokeStyle = col; c.lineWidth = r * 0.07; c.beginPath(); c.arc(0, 0, r * 0.95, 0, P2); c.stroke();
      break;
    }
    case 'flag': {
      c.fillStyle = '#ece8f5'; rrect(c, -r * 0.74, -r * 0.92, r * 0.1, r * 1.85, r * 0.05); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(-r * 0.69, -r * 0.95, r * 0.11, 0, P2); c.fill();
      const x0 = -r * 0.64, cw = r * 0.38, ch = r * 0.32, y0 = -r * 0.88;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const dy = Math.sin(i * 1.3) * r * 0.07;
        c.fillStyle = (i + j) % 2 ? '#1d1b2b' : '#ffffff'; c.fillRect(x0 + i * cw, y0 + j * ch + dy, cw + 0.5, ch + 0.5);
      }
      for (let i = 0; i < 4; i++) { const dy = Math.sin(i * 1.3) * r * 0.07; c.fillStyle = col; c.fillRect(x0 + i * cw, y0 + dy - r * 0.06, cw + 0.5, r * 0.06); c.fillRect(x0 + i * cw, y0 + 3 * ch + dy, cw + 0.5, r * 0.06); }
      break;
    }
    case 'shuriken': {
      c.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 4, rr = i % 2 ? r * 0.3 : r * 0.98; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.45)); c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = r * 0.06; c.stroke();
      c.fillStyle = '#1d1b2b'; c.beginPath(); c.arc(0, 0, r * 0.13, 0, P2); c.fill();
      break;
    }
    case 'heart': {
      heartPath(c, r); c.fillStyle = radial(c, -r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.05, [[0, shade(col, 0.55)], [0.55, col], [1, shade(col, -0.3)]]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = r * 0.07; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-r * 0.42, -r * 0.38, r * 0.1, r * 0.18, -0.7, 0, P2); c.fill();
      break;
    }
    case 'candle': {
      rrect(c, -r * 0.2, -r * 0.4, r * 0.4, r * 1.35, r * 0.08);
      c.fillStyle = '#fff7fb'; c.fill(); c.save(); c.clip();
      c.strokeStyle = col; c.lineWidth = r * 0.12; for (let k = -2; k < 8; k++) { c.beginPath(); c.moveTo(-r * 0.3, -r * 0.4 + k * r * 0.3); c.lineTo(r * 0.3, -r * 0.4 + k * r * 0.3 - r * 0.3); c.stroke(); }
      c.restore();
      rrect(c, -r * 0.2, -r * 0.4, r * 0.4, r * 1.35, r * 0.08); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = r * 0.05; c.stroke();
      c.strokeStyle = '#3b2a20'; c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(0, -r * 0.4); c.lineTo(0, -r * 0.58); c.stroke();
      break;
    }
    case 'butterfly': {
      const c2 = shade(col, 0.4);
      for (const s of [-1, 1]) {
        c.beginPath(); c.ellipse(s * r * 0.45, -r * 0.22, r * 0.5, r * 0.4, s * 0.55, 0, P2); c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = r * 0.06; c.stroke();
        c.beginPath(); c.ellipse(s * r * 0.36, r * 0.36, r * 0.32, r * 0.28, -s * 0.5, 0, P2); c.fillStyle = c2; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(s * r * 0.55, -r * 0.3, r * 0.1, 0, P2); c.fill();
        c.strokeStyle = '#2a1a3a'; c.lineWidth = r * 0.05; c.beginPath(); c.moveTo(0, -r * 0.5); c.quadraticCurveTo(s * r * 0.15, -r * 0.95, s * r * 0.32, -r * 0.92); c.stroke();
      }
      c.fillStyle = '#2a1a3a'; c.beginPath(); c.ellipse(0, 0, r * 0.09, r * 0.6, 0, 0, P2); c.fill();
      break;
    }
    case 'ghost': {
      c.beginPath(); c.moveTo(-r * 0.72, r * 0.8); c.lineTo(-r * 0.72, -r * 0.1); c.arc(0, -r * 0.1, r * 0.72, Math.PI, 0); c.lineTo(r * 0.72, r * 0.8);
      for (let i = 0; i < 3; i++) { const cx = r * 0.72 - (i + 0.5) * r * 0.48, ex = r * 0.72 - (i + 1) * r * 0.48; c.quadraticCurveTo(cx, r * 0.5, ex, r * 0.8); }
      c.closePath();
      const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(col, 0.72)); c.fillStyle = g; c.fill();
      c.strokeStyle = rgba(col, 0.9); c.lineWidth = r * 0.07; c.stroke();
      c.fillStyle = '#2a1a3a';
      c.beginPath(); c.ellipse(-r * 0.25, -r * 0.15, r * 0.1, r * 0.15, 0, 0, P2); c.ellipse(r * 0.25, -r * 0.15, r * 0.1, r * 0.15, 0, 0, P2); c.fill();
      c.beginPath(); c.ellipse(0, r * 0.2, r * 0.09, r * 0.12, 0, 0, P2); c.fill();
      break;
    }
    case 'apple': {
      c.beginPath(); c.moveTo(0, -r * 0.5); c.bezierCurveTo(r * 0.5, -r * 0.95, r * 1.05, -r * 0.35, r * 0.8, r * 0.3); c.bezierCurveTo(r * 0.6, r * 0.95, r * 0.2, r * 0.95, 0, r * 0.82);
      c.bezierCurveTo(-r * 0.2, r * 0.95, -r * 0.6, r * 0.95, -r * 0.8, r * 0.3); c.bezierCurveTo(-r * 1.05, -r * 0.35, -r * 0.5, -r * 0.95, 0, -r * 0.5); c.closePath();
      c.fillStyle = radial(c, -r * 0.3, -r * 0.25, r * 0.05, 0, 0, r, [[0, shade(col, 0.5)], [0.6, col], [1, shade(col, -0.35)]]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = r * 0.06; c.stroke();
      c.strokeStyle = '#6b3e1e'; c.lineWidth = r * 0.09; c.beginPath(); c.moveTo(0, -r * 0.5); c.quadraticCurveTo(r * 0.05, -r * 0.8, r * 0.18, -r * 0.95); c.stroke();
      c.fillStyle = '#52D681'; c.beginPath(); c.ellipse(r * 0.34, -r * 0.76, r * 0.22, r * 0.1, -0.5, 0, P2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-r * 0.4, -r * 0.2, r * 0.09, r * 0.18, -0.3, 0, P2); c.fill();
      break;
    }
    case 'snowflake': {
      const arms = (lw: number, style: string) => {
        c.strokeStyle = style; c.lineWidth = lw;
        for (let i = 0; i < 6; i++) {
          c.save(); c.rotate((i * Math.PI) / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 0.95);
          for (const y of [0.45, 0.7]) { c.moveTo(0, -r * y); c.lineTo(-r * 0.22, -r * (y + 0.2)); c.moveTo(0, -r * y); c.lineTo(r * 0.22, -r * (y + 0.2)); }
          c.stroke(); c.restore();
        }
      };
      arms(r * 0.24, rgba(col === '#FFFFFF' ? '#9AD0FF' : col, 0.9)); arms(r * 0.1, '#ffffff');
      break;
    }
    case 'gift': {
      const rib = /^#FF?D/i.test(col) || /^#FFF/i.test(col) ? '#D40055' : '#FFD23F';
      const g = c.createLinearGradient(0, -r * 0.2, 0, r * 0.9); g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.3));
      c.fillStyle = g; rrect(c, -r * 0.7, -r * 0.2, r * 1.4, r * 1.1, r * 0.08); c.fill();
      c.fillStyle = shade(col, 0.2); rrect(c, -r * 0.82, -r * 0.48, r * 1.64, r * 0.32, r * 0.08); c.fill();
      c.fillStyle = rib; c.fillRect(-r * 0.12, -r * 0.48, r * 0.24, r * 1.38);
      c.strokeStyle = rib; c.lineWidth = r * 0.11;
      c.beginPath(); c.ellipse(-r * 0.27, -r * 0.64, r * 0.26, r * 0.14, 0.45, 0, P2); c.stroke();
      c.beginPath(); c.ellipse(r * 0.27, -r * 0.64, r * 0.26, r * 0.14, -0.45, 0, P2); c.stroke();
      c.fillStyle = rib; c.beginPath(); c.arc(0, -r * 0.55, r * 0.11, 0, P2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = r * 0.05; rrect(c, -r * 0.7, -r * 0.2, r * 1.4, r * 1.1, r * 0.08); c.stroke();
      break;
    }
  }
}

/** a candle flame (wick top at x,y), animated by t seconds; s = spring scale 0..1 */
function drawFlame(c: C2D, x: number, y: number, h: number, t: number, s: number) {
  if (s <= 0.01) return;
  const fl = 1 + 0.08 * Math.sin(t * 23) + 0.05 * Math.sin(t * 37 + 1), w = h * 0.42;
  c.save(); c.translate(x, y); c.scale(s, s * fl);
  c.fillStyle = radial(c, 0, -h * 0.45, 0, 0, -h * 0.45, h * 1.4, [[0, 'rgba(255,205,90,.55)'], [1, 'rgba(255,160,40,0)']]);
  c.beginPath(); c.arc(0, -h * 0.45, h * 1.4, 0, P2); c.fill();
  const tear = (k: number) => { c.beginPath(); c.moveTo(0, -h * k); c.bezierCurveTo(w * 0.9 * k, -h * 0.45 * k, w * k, -h * 0.05 * k, 0, 0); c.bezierCurveTo(-w * k, -h * 0.05 * k, -w * 0.9 * k, -h * 0.45 * k, 0, -h * k); c.closePath(); };
  const g = c.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, '#FFF7C2'); g.addColorStop(0.5, '#FFB21F'); g.addColorStop(1, '#FF6A00');
  tear(1); c.fillStyle = g; c.fill();
  tear(0.5); c.fillStyle = 'rgba(255,253,230,.95)'; c.fill();
  c.restore();
}

function drawShard(c: C2D, kind: ShardKind, s: number) {
  switch (kind) {
    case 'angular': c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.7, s * 0.6); c.lineTo(-s * 0.5, s * 0.4); c.closePath(); c.fill(); break;
    case 'star': starPath(c, s * 1.2, 0.45); c.fill(); break;
    case 'heart': heartPath(c, s); c.fill(); break;
    case 'arc': c.lineWidth = s * 0.5; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, s, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = c.fillStyle; c.stroke(); break;
    case 'rect': c.fillRect(-s, -s * 0.5, s * 2, s); break;
    case 'blob': c.beginPath(); c.arc(0, 0, s * 0.8, 0, P2); c.fill(); break;
  }
}

// ── sprite cache: each (sprite, colour, size) is drawn once, with its drop shadow, then blitted ──────────────────
const CACHE = new Map<string, HTMLCanvasElement>();
function spriteImage(kind: SpriteKind, col: string, d: number, dpr: number, white = false): HTMLCanvasElement {
  const dd = Math.max(8, Math.round(d / 2) * 2);
  const key = `${kind}|${col}|${dd}|${dpr}|${white ? 1 : 0}`;
  const hit = CACHE.get(key); if (hit) return hit;
  if (CACHE.size > 240) CACHE.clear();
  const box = dd * 2, px = Math.ceil(box * dpr);
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = px;
  const t = tmp.getContext('2d')!; t.scale(dpr, dpr); t.translate(box / 2, box / 2);
  drawSprite(t, kind, dd / 2, col);
  const out = document.createElement('canvas'); out.width = out.height = px;
  const o = out.getContext('2d')!;
  const glow = kind === 'ghost' || kind === 'snowflake' || kind === 'bubble';
  o.shadowColor = glow ? rgba(col === '#FFFFFF' ? '#9AD0FF' : col, 0.85) : 'rgba(12,4,28,.5)';
  o.shadowBlur = (glow ? dd * 0.22 : dd * 0.12) * dpr; o.shadowOffsetY = glow ? 0 : dd * 0.05 * dpr;
  o.drawImage(tmp, 0, 0);
  if (white) { o.shadowColor = 'transparent'; o.globalCompositeOperation = 'source-atop'; o.fillStyle = '#fff'; o.fillRect(0, 0, px, px); }
  CACHE.set(key, out); return out;
}

/** small static sprite for DOM (progress pill, reduced-motion tiles) */
function SpriteIcon({ kind, color, size, lit = false }: { kind: SpriteKind; color: string; size: number; lit?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d'); if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
    const d = kind === 'candle' ? size * 0.62 : kind === 'balloon' ? size * 0.6 : size * 0.78;
    const cx = size / 2, cy = kind === 'candle' ? size * 0.6 : kind === 'balloon' ? size * 0.42 : size / 2;
    c.drawImage(spriteImage(kind, color, d, dpr), cx - d, cy - d, d * 2, d * 2);
    if (lit) drawFlame(c, cx, cy - d * 0.29, d * 0.45, 0.4, 1);
  }, [kind, color, size, lit]);
  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size, display: 'block' }} />;
}

// ── the canvas engine ────────────────────────────────────────────────────────────────────────────────────────────
interface Engine { dispose(): void; key(k: 'hit' | 'left' | 'right'): void; celebrate(): void }
interface EngineOpts { canvas: HTMLCanvasElement; cover: HTMLCanvasElement | null; spec: PlaySpec; accent: string; seed: number; elapsed(): number; onScore(v: number): void; onGoal(): void }
interface Item { x: number; y: number; baseX: number; fx: number; fy: number; d: number; speed: number; drift: number; phase: number; spin: number; rot: number; color: string; born: number; hitAt: number; off: number }
interface Shard { x: number; y: number; dx: number; dy: number; size: number; color: string; t0: number; rot: number; kind: ShardKind }
interface Spark { x: number; y: number; vx: number; vy: number; size: number; color: string; t0: number; rot: number; vr: number; kind: ShardKind }
interface Card { id: number; up: boolean; flip: number; fv: number; matched: boolean; matchedAt: number }

const TOP = 112;

function startEngine(o: EngineOpts): Engine {
  const { canvas, cover, spec, accent, seed } = o;
  const ctx0 = canvas.getContext('2d');
  if (!ctx0) { o.onGoal(); return { dispose() {}, key() {}, celebrate() {} }; }
  const ctx: C2D = ctx0;
  const cctx = cover ? cover.getContext('2d') : null;
  const host = canvas.parentElement || canvas;
  const shardKind = shardFor(spec.sprite);
  const colors = spec.colors.length ? spec.colors : ['#FFD23F'];
  let W = 1, H = 1, dpr = 1;
  let disposed = false, raf = 0, last = performance.now();
  let score = 0, goalHit = false, winning = false, winAt = 0, holdUntil = 0;
  let lastHit = { x: 0, y: 0 };
  let items: Item[] = [];
  let shards: Shard[] = [];
  let sparks: Spark[] = [];
  const ripples: { x: number; y: number; t0: number }[] = [];
  let touched = false;

  const addShards = (x: number, y: number, color: string, now: number, n = HIT.shards) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * P2 + Math.random() * 0.6, k = HIT.travel * (0.8 + Math.random() * 0.5);
      shards.push({ x, y, dx: Math.cos(a) * k, dy: Math.sin(a) * k, size: 4 + Math.random() * 2.5, color: i % 2 ? color : '#ffffff', t0: now, rot: Math.random() * P2, kind: shardKind });
    }
    const over = shards.length + sparks.length - WIN.particles; if (over > 0) shards.splice(0, over);
  };
  const scoreUp = (x: number, y: number, now: number) => {
    score++; lastHit = { x, y }; holdUntil = now + 2 * FRAME_MS;   // 2-frame hit-pause
    o.onScore(score);
    if (score >= spec.goal && !goalHit) { goalHit = true; o.onGoal(); }
  };
  const hitItem = (it: Item, now: number) => { if (it.hitAt) return; it.hitAt = now; addShards(it.x, it.y, it.color, now); scoreUp(it.x, it.y, now); };
  const ripple = (x: number, y: number, now: number) => { ripples.push({ x, y, t0: now }); if (ripples.length > 6) ripples.shift(); };

  // ── per-kind state ──
  let sched: SpawnEvent[] = [], si = 0, cycle = 0, base = 0;
  const spawnFrom = (ev: SpawnEvent, now: number, y?: number) => {
    const assist = assistLevel(o.elapsed());
    const d = Math.max(44, Math.min(84, ev.size * W * (1 + 0.25 * assist)));
    const rise = spec.kind === 'pop';
    // falling items spring in just under the prompt (council: 6-frame spring-in) rather than hiding behind it
    items.push({ x: ev.x * W, y: y ?? (rise ? H + d * 0.6 : TOP - 8), baseX: ev.x * W, fx: ev.x, fy: 0, d, speed: ev.speed, drift: ev.drift, phase: ev.phase, spin: ev.spin, rot: 0, color: colors[ev.color % colors.length], born: now, hitAt: 0, off: Number.NaN });
  };
  // catch
  let cx = 0, cvx = 0, tx = 0, moved = false;
  // memory
  let cards: Card[] = [], open: number[] = [], lockUntil = 0, peekUntil = 0, assistPeeked = false;
  const faces = spec.kind === 'memory' ? memoryFaces(spec) : [];
  let cardLayout = { x0: 0, y0: 0, cw: 0, ch: 0, gap: 10, cols: 3, rows: 4 };
  let cardBack: HTMLCanvasElement | null = null; let cardFaces: HTMLCanvasElement[] = [];
  // candles
  const lit: number[] = spec.kind === 'candles' ? Array.from({ length: spec.goal }, () => 0) : [];
  // scratch
  let grid: ScratchGrid | null = null, revealAt = 0, scratching = false, lastP = { x: 0, y: 0 }, keyRow = 0, lastSparkle = 0;
  const trail: { x: number; y: number; t0: number }[] = [];

  function layoutMemory() {
    const n = spec.goal * 2, { cols, rows } = memoryGrid(n), gap = 10;
    const aw = W - 28, ah = H - TOP - 22;
    const cw = (aw - gap * (cols - 1)) / cols, ch = Math.min((ah - gap * (rows - 1)) / rows, cw * 1.3);
    const gh = ch * rows + gap * (rows - 1);
    cardLayout = { x0: 14, y0: TOP + Math.max(0, (ah - gh) / 2), cw, ch, gap, cols, rows };
    const mk = (draw: (c: C2D) => void) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(cw * dpr); cv.height = Math.ceil(ch * dpr); const c = cv.getContext('2d')!; c.scale(dpr, dpr); draw(c); return cv; };
    cardBack = mk(c => {
      rrect(c, 1, 1, cw - 2, ch - 2, 14);
      const g = c.createLinearGradient(0, 0, cw, ch); g.addColorStop(0, shade(accent, 0.15)); g.addColorStop(1, shade(accent, -0.45)); c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.stroke();
      c.save(); rrect(c, 1, 1, cw - 2, ch - 2, 14); c.clip();
      c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(cw * 0.55, 0); c.lineTo(0, ch * 0.55); c.closePath(); c.fill();
      c.restore();
      const d = Math.min(cw, ch) * 0.42; c.globalAlpha = 0.5; c.drawImage(spriteImage(spec.sprite, '#FFFFFF', d, dpr, true), cw / 2 - d, ch / 2 - d, d * 2, d * 2); c.globalAlpha = 1;
    });
    cardFaces = faces.map(f => mk(c => {
      rrect(c, 1, 1, cw - 2, ch - 2, 14); c.fillStyle = '#FFF8FE'; c.fill(); c.strokeStyle = f.color; c.lineWidth = 3; c.stroke();
      const d = Math.min(cw, ch) * 0.6; c.drawImage(spriteImage(f.sprite, f.color, d, dpr), cw / 2 - d, ch / 2 - d * 0.95, d * 2, d * 2);
    }));
  }
  const cardRect = (i: number) => { const L = cardLayout, col = i % L.cols, row = Math.floor(i / L.cols); return { x: L.x0 + col * (L.cw + L.gap), y: L.y0 + row * (L.ch + L.gap), w: L.cw, h: L.ch }; };

  function paintFoil() {
    if (!cctx || !cover) return;
    const c = cctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, shade(accent, -0.3)); g.addColorStop(0.3, shade(accent, 0.2)); g.addColorStop(0.48, shade(accent, 0.6)); g.addColorStop(0.62, shade(accent, 0.1)); g.addColorStop(1, shade(accent, -0.35));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // brushed-metal noise
    const n = document.createElement('canvas'); n.width = n.height = 96; const nc = n.getContext('2d')!; const id = nc.createImageData(96, 96);
    for (let i = 0; i < id.data.length; i += 4) { const v = 110 + Math.random() * 145; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    nc.putImageData(id, 0, 0);
    const pat = c.createPattern(n, 'repeat'); if (pat) { c.globalAlpha = 0.13; c.globalCompositeOperation = 'overlay'; c.fillStyle = pat; c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    // diagonal shine bands
    c.save(); c.translate(W / 2, H / 2); c.rotate(-0.55);
    for (const [x, w, a] of [[-W * 0.35, 40, 0.28], [-W * 0.18, 14, 0.2], [W * 0.25, 70, 0.18]]) { const s = c.createLinearGradient(x - w, 0, x + w, 0); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, `rgba(255,255,255,${a})`); s.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = s; c.fillRect(x - w, -H, w * 2, H * 2); }
    c.restore();
    // embossed motif
    const d = 22, img = spriteImage(spec.sprite, '#FFFFFF', d, dpr, true); c.globalAlpha = 0.14;
    for (let y = TOP + 6, row = 0; y < H + d; y += 58, row++) for (let x = (row % 2) * 29 + 10; x < W + d; x += 58) c.drawImage(img, x - d, y - d, d * 2, d * 2);
    c.globalAlpha = 1;
    // centre emblem
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(W / 2, H * 0.55, 58, 0, P2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]);
    const e = 62; c.drawImage(spriteImage(spec.sprite, colors[0], e, dpr), W / 2 - e, H * 0.55 - e, e * 2, e * 2);
    rrect(c, 6, 6, W - 12, H - 12, 18); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; c.stroke();
    grid = scratchGrid(W, H, 12);
  }
  const brush = () => 26 + 16 * assistLevel(o.elapsed());
  function erase(x0: number, y0: number, x1: number, y1: number, r: number, now: number) {
    if (!cctx || !grid || revealAt) return;
    const c = cctx; c.globalCompositeOperation = 'destination-out'; c.lineCap = 'round'; c.lineWidth = r * 2; c.strokeStyle = '#000'; c.fillStyle = '#000';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.beginPath(); c.arc(x1, y1, r, 0, P2); c.fill();
    c.globalCompositeOperation = 'source-over';
    scratchLine(grid, x0, y0, x1, y1, r);
    const cov = coverage(grid); o.onScore(cov);
    if (now - lastSparkle > 40) { lastSparkle = now; trail.push({ x: x1 + (Math.random() - 0.5) * 16, y: y1 + (Math.random() - 0.5) * 16, t0: now }); if (trail.length > 10) trail.shift(); }
    if (cov >= REVEAL_AT && !revealAt) { revealAt = now; lastHit = { x: x1, y: y1 }; if (!goalHit) { goalHit = true; o.onGoal(); } }
  }

  // ── sizing ──
  function resize() {
    const r = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    const nw = Math.max(1, r.width), nh = Math.max(1, r.height);
    if (nw === W && nh === H && canvas.width === Math.round(W * dpr)) return;   // resizing a canvas clears it: only when the size really changed
    const changed = nw !== W || nh !== H; W = nw; H = nh;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (cover) { cover.width = canvas.width; cover.height = canvas.height; if (!revealAt) paintFoil(); }
    if (spec.kind === 'memory') layoutMemory();
    if (spec.kind === 'hunt') for (const it of items) { it.x = it.fx * W; it.y = it.fy * H; }
    if (spec.kind === 'catch' && changed) { tx = Math.min(Math.max(tx || W / 2, 40), W - 40); if (!cx) cx = tx; }
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  // ── setup per kind ──
  const t0 = performance.now();
  if (spec.kind === 'pop' || spec.kind === 'catch') {
    sched = spawnSchedule(spec.kind, spec.goal, seed);
    if (spec.kind === 'pop') { spawnFrom(sched[0], t0, H * 0.62); spawnFrom(sched[1], t0, H * 0.86); si = 2; }
    cx = tx = W / 2;
  } else if (spec.kind === 'hunt') {
    const spots = huntSpots(spec.goal, seed, W, H, { top: TOP + 24, bottom: 70, margin: 40 });
    items = spots.map((p, i) => ({ x: p.x, y: p.y, baseX: p.x, fx: p.x / W, fy: p.y / H, d: 46, speed: 0, drift: 0, phase: i * 2.1, spin: 0, rot: 0, color: colors[i % colors.length], born: t0 + 150 + i * 140, hitAt: 0, off: 0 }));
  } else if (spec.kind === 'memory') {
    cards = memoryDeck(spec.goal, seed).map(id => ({ id, up: false, flip: 0, fv: 0, matched: false, matchedAt: 0 }));
    // a short peek at every face to start, so the youngest players have a chance
    setTimeout(() => { if (!disposed) cards.forEach(c => { c.up = true; }); }, 250);
    peekUntil = t0 + 1500;
    setTimeout(() => { if (!disposed) cards.forEach(c => { if (!c.matched) c.up = false; }); }, 1500);
  }

  // ── input ──
  const pt = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / Math.max(1, r.width)), y: (e.clientY - r.top) * (H / Math.max(1, r.height)) }; };
  function tapAt(x: number, y: number, now: number) {
    if (winning) return;
    touched = true;
    switch (spec.kind) {
      case 'pop': case 'catch': {
        const live = items.filter(it => !it.hitAt);
        const i = pickNearest(x, y, live.map(it => ({ x: it.x, y: it.y, r: tapRadius(it.d) })));
        if (i >= 0) hitItem(live[i], now);
        else if (spec.kind === 'pop') ripple(x, y, now);
        if (spec.kind === 'catch') { tx = Math.min(Math.max(x, 30), W - 30); moved = true; }
        break;
      }
      case 'hunt': {
        const live = items.filter(it => !it.hitAt);
        const i = pickNearest(x, y, live.map(it => ({ x: it.x, y: it.y, r: tapRadius(it.d) + 6 })));
        if (i >= 0) hitItem(live[i], now); else ripple(x, y, now);
        break;
      }
      case 'candles': {
        const { xs, baseY, r, spacing } = candleLayout();
        let best = -1, bd = Infinity;
        xs.forEach((cxx, i) => { const dx = Math.abs(x - cxx); if (dx < spacing / 2 + 8 && dx < bd && !lit[i]) { bd = dx; best = i; } });
        if (best >= 0 && y > baseY - r * 2.6 && y < baseY + r * 2.2) lightCandle(best, now); else ripple(x, y, now);
        break;
      }
      case 'memory': {
        if (now < lockUntil || now < peekUntil) return;
        for (let i = 0; i < cards.length; i++) {
          const R = cardRect(i), c = cards[i];
          if (!hitRect(x, y, R.x, R.y, R.w, R.h)) continue;
          if (c.matched || c.up || open.length >= 2) return;
          c.up = true; open.push(i);
          if (open.length === 2) {
            const [a, b] = open; lockUntil = now + 760;
            if (cards[a].id === cards[b].id) {
              setTimeout(() => {
                if (disposed) return; const t = performance.now();
                for (const k of [a, b]) { cards[k].matched = true; cards[k].matchedAt = t; const R2 = cardRect(k); addShards(R2.x + R2.w / 2, R2.y + R2.h / 2, faces[cards[k].id].color, t, 3); }
                const R2 = cardRect(b); open = []; lockUntil = 0; scoreUp(R2.x + R2.w / 2, R2.y + R2.h / 2, t);
              }, 240);
            } else {
              setTimeout(() => { if (disposed) return; cards[a].up = false; cards[b].up = false; open = []; lockUntil = 0; }, 760);
            }
          }
          return;
        }
        break;
      }
      case 'scratch': break;
    }
  }
  const onDown = (e: PointerEvent) => {
    const p = pt(e), now = performance.now();
    if (spec.kind === 'scratch' || spec.kind === 'catch') { try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
    if (spec.kind === 'scratch') { touched = true; scratching = true; lastP = p; erase(p.x, p.y, p.x + 0.1, p.y, brush(), now); return; }
    tapAt(p.x, p.y, now);
  };
  const onMove = (e: PointerEvent) => {
    const p = pt(e);
    if (spec.kind === 'scratch' && scratching) { erase(lastP.x, lastP.y, p.x, p.y, brush(), performance.now()); lastP = p; return; }
    if (spec.kind === 'catch' && (e.buttons || e.pointerType === 'mouse') && !winning) { tx = Math.min(Math.max(p.x, 30), W - 30); moved = true; }
  };
  const onUp = () => { scratching = false; };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('lostpointercapture', onUp);

  // ── candles ──
  function candleLayout() {
    const n = spec.goal, spacing = Math.min(76, (W - 70) / n), d = Math.min(58, spacing * 0.86), r = d / 2;
    const baseY = H * 0.72, xs = Array.from({ length: n }, (_, i) => W / 2 + (i - (n - 1) / 2) * spacing);
    return { xs, baseY, r, d, spacing };
  }
  function lightCandle(i: number, now: number) {
    if (lit[i]) return; lit[i] = now;
    const { xs, baseY, r } = candleLayout(); const y = baseY - r * 0.75;
    addShards(xs[i], y, '#FFD23F', now); scoreUp(xs[i], y, now);
  }

  // ── keyboard ──
  function key(k: 'hit' | 'left' | 'right') {
    const now = performance.now(); if (winning) return; touched = true;
    if (k !== 'hit') { if (spec.kind === 'catch') { tx = Math.min(Math.max(tx + (k === 'left' ? -60 : 60), 30), W - 30); moved = true; } return; }
    switch (spec.kind) {
      case 'pop': case 'catch': case 'hunt': {
        const live = items.filter(it => !it.hitAt && it.y > -it.d && it.y < H + it.d); live.sort((a, b) => (spec.kind === 'pop' ? a.y - b.y : b.y - a.y));
        if (live[0]) hitItem(live[0], now); break;
      }
      case 'candles': { const i = lit.findIndex(v => !v); if (i >= 0) lightCandle(i, now); break; }
      case 'memory': {
        if (now < lockUntil || now < peekUntil) return;
        const i = cards.findIndex(c => !c.matched && !c.up); if (i < 0) return;
        const j = cards.findIndex((c, k) => k !== i && !c.matched && c.id === cards[i].id);
        const R = cardRect(i), R2 = cardRect(j);
        tapAt(R.x + R.w / 2, R.y + R.h / 2, now); tapAt(R2.x + R2.w / 2, R2.y + R2.h / 2, now);
        break;
      }
      case 'scratch': { const band = H / 10, y = band * (keyRow + 0.5) + 6; keyRow++; erase(0, y, W, y, band * 0.62, now); break; }
    }
  }

  // ── update + render ──
  function update(now: number, dt: number, el: number, assist: number) {
    const t = now / 1000;
    if (spec.kind === 'pop' || spec.kind === 'catch') {
      if (!winning) {
        while (si < sched.length && base + sched[si].at <= el) spawnFrom(sched[si++], now);
        if (si >= sched.length) { cycle++; sched = spawnSchedule(spec.kind, spec.goal, seed + cycle); si = 0; base = el; }
      }
      const cw = catcherW(assist), cy = H - 58;
      if (spec.kind === 'catch') [cx, cvx] = springStep(cx, cvx, tx, dt, PLAY_SPRING);
      for (const it of items) {
        if (it.hitAt) { if (spec.kind === 'catch' && !Number.isNaN(it.off)) it.x = cx + it.off; continue; }
        const slow = spec.kind === 'pop' ? 1 - 0.35 * assist : 1 - 0.3 * assist;
        it.y += (spec.kind === 'pop' ? -1 : 1) * it.speed * H * dt * slow;
        it.x = it.baseX + Math.sin(it.phase + t * 1.4) * it.drift * W;
        it.rot = spec.sprite === 'shuriken' || spec.sprite === 'snowflake' ? it.rot + it.spin * 2.4 * dt : Math.sin(t * 1.8 + it.phase) * 0.14;
        if (spec.kind === 'catch' && !winning && it.y >= cy - 22 && it.y <= cy + 12 && Math.abs(it.x - cx) <= cw / 2 + it.d * 0.15) { it.off = it.x - cx; hitItem(it, now); }
      }
      items = items.filter(it => it.hitAt ? now - it.hitAt < (HIT.anticipation + HIT.impact) * FRAME_MS + 1 : spec.kind === 'pop' ? it.y > -it.d * 1.3 : it.y < H + it.d);
    } else if (spec.kind === 'hunt') {
      for (const it of items) { if (it.hitAt) continue; it.x = it.fx * W + Math.sin(t * 1.3 + it.phase) * 2; it.y = it.fy * H + Math.sin(t * 2 + it.phase) * 3; it.rot = Math.sin(t * 1.5 + it.phase) * 0.18; }
      items = items.filter(it => !it.hitAt || now - it.hitAt < (HIT.anticipation + HIT.impact) * FRAME_MS + 1);
    } else if (spec.kind === 'memory') {
      if (assist >= 0.5 && !assistPeeked && !winning && open.length === 0) {
        assistPeeked = true; peekUntil = now + 900; cards.forEach(c => { c.up = true; });
        setTimeout(() => { if (!disposed) cards.forEach(c => { if (!c.matched) c.up = false; }); }, 900);
      }
      for (const c of cards) [c.flip, c.fv] = springStep(c.flip, c.fv, c.up || c.matched ? 1 : 0, dt, PLAY_SPRING);
    }
  }
  const catcherW = (assist: number) => Math.min(W * 0.46, 104 + 46 * assist);

  function drawItem(it: Item, now: number, alpha: number) {
    let sx = 1, sy = 1, flash = 0;
    if (it.hitAt) { const hp = hitPhase(now - it.hitAt); if (hp.phase === 'dissipation' || hp.phase === 'done') return; sx = hp.sx; sy = hp.sy; flash = hp.flash; }
    else { const s = springAt(now - it.born); sx = sy = s; if (s <= 0.01) return; }
    if (spec.sprite === 'butterfly') sx *= 0.35 + 0.65 * Math.abs(Math.sin(now / 1000 * 9 + it.phase));
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.scale(sx, sy);
    ctx.drawImage(spriteImage(spec.sprite, it.color, it.d, dpr), -it.d, -it.d, it.d * 2, it.d * 2);
    if (flash) { ctx.globalAlpha = alpha * flash; ctx.drawImage(spriteImage(spec.sprite, it.color, it.d, dpr, true), -it.d, -it.d, it.d * 2, it.d * 2); }
    ctx.restore();
  }
  function drawBasket(x: number, y: number, w: number) {
    const h = 32;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = rgba(accent, 0.75); ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w * 0.38, h / 2); ctx.quadraticCurveTo(0, h / 2 + 8, -w * 0.38, h / 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, shade(accent, 0.1)); g.addColorStop(1, shade(accent, -0.45)); ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
    for (let k = -w; k < w; k += 12) { ctx.beginPath(); ctx.moveTo(k, -h / 2); ctx.lineTo(k + h, h / 2); ctx.moveTo(k + h, -h / 2); ctx.lineTo(k, h / 2); ctx.stroke(); }
    ctx.restore();
    rrect(ctx, -w / 2 - 4, -h / 2 - 6, w + 8, 11, 5.5); ctx.fillStyle = shade(accent, 0.4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  function drawChevrons(x: number, y: number, w: number, now: number) {
    const a = 0.55 + 0.45 * Math.sin(now / 1000 * 5), off = 8 * Math.sin(now / 1000 * 5);
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [-1, 1]) { const bx = x + s * (w / 2 + 20 + off); ctx.beginPath(); ctx.moveTo(bx - s * 6, y - 10); ctx.lineTo(bx + s * 4, y); ctx.lineTo(bx - s * 6, y + 10); ctx.stroke(); }
    ctx.restore();
  }
  function drawSparkle(x: number, y: number, s: number, a: number) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.fillStyle = '#fff'; starPath(ctx, s, 0.22, 4); ctx.fill(); ctx.restore();
  }

  function render(now: number, assist: number) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const fade = winning ? clamp01(1 - (now - winAt) / 260) : 1;

    if (spec.kind === 'pop' || spec.kind === 'catch' || spec.kind === 'hunt') {
      if (spec.kind === 'hunt' && assist > 0 && !winning) {
        for (const it of items) { if (it.hitAt) continue; const p = (t * 1.2 + it.phase) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.75 * assist * (1 - p)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(it.x, it.y, it.d * 0.6 + 26 * p, 0, P2); ctx.stroke(); }
      }
      for (const it of items) drawItem(it, now, fade * (spec.kind === 'hunt' ? 0.9 : 1));
      if (spec.kind === 'catch') {
        const cw = catcherW(assist), cy = H - 58;
        ctx.save(); ctx.globalAlpha = fade; drawBasket(cx, cy, cw); ctx.restore();
        if (!moved && !winning) drawChevrons(cx, cy, cw, now);
      }
    } else if (spec.kind === 'candles') {
      const { xs, baseY, r, d } = candleLayout();
      const x0 = xs[0] - r - 26, x1 = xs[xs.length - 1] + r + 26, top = baseY + r * 0.86;
      ctx.save(); ctx.globalAlpha = fade;
      ctx.shadowColor = 'rgba(12,4,28,.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      rrect(ctx, x0, top, x1 - x0, 34, 14);
      const g = ctx.createLinearGradient(0, top, 0, top + 34); g.addColorStop(0, shade(accent, 0.55)); g.addColorStop(1, shade(accent, 0.15)); ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#FFF3FA'; rrect(ctx, x0, top, x1 - x0, 10, 6); ctx.fill();
      for (let x = x0 + 12, k = 0; x < x1 - 8; x += 17, k++) { const len = 6 + ((k * 7) % 11); ctx.beginPath(); ctx.arc(x, top + 8 + len, 4.5, 0, P2); ctx.fill(); ctx.fillRect(x - 4.5, top + 6, 9, len + 2); }
      xs.forEach((x, i) => {
        let sx = 1, sy = 1;
        if (lit[i]) { const hp = hitPhase(now - lit[i]); if (hp.phase === 'anticipation') { sx = hp.sx; sy = hp.sy; } }
        ctx.save(); ctx.translate(x, baseY); ctx.scale(sx, sy); ctx.drawImage(spriteImage('candle', colors[i % colors.length], d, dpr), -d, -d, d * 2, d * 2); ctx.restore();
        const wick = baseY - r * 0.58;
        if (lit[i]) drawFlame(ctx, x, wick, r * 0.95, t + i, springAt(now - lit[i] - 3 * FRAME_MS));
        else if (!winning) {
          drawSparkle(x, wick - 4, 5 + 2 * Math.sin(t * 6 + i), 0.5 + 0.5 * Math.sin(t * 6 + i));
          if (assist > 0 && i === lit.findIndex(v => !v)) { const p = (t * 1.1) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.8 * assist * (1 - p)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, baseY - r * 0.2, r * 0.9 + 22 * p, 0, P2); ctx.stroke(); }
        }
      });
      ctx.restore();
    } else if (spec.kind === 'memory' && cardBack) {
      ctx.save(); ctx.globalAlpha = fade;
      cards.forEach((c, i) => {
        const R = cardRect(i), f = Math.max(0, c.flip), sxv = Math.max(0.02, Math.abs(Math.cos(f * Math.PI)));
        let sx = sxv, sy = 1 + 0.05 * (1 - sxv), flash = 0;
        if (c.matched) { const hp = hitPhase(now - c.matchedAt); if (hp.phase === 'anticipation') { sx *= hp.sx; sy *= hp.sy; } flash = hp.flash; }
        ctx.save(); ctx.translate(R.x + R.w / 2, R.y + R.h / 2); ctx.scale(sx, sy);
        if (c.matched) { ctx.shadowColor = rgba(faces[c.id].color, 0.95); ctx.shadowBlur = 18; }
        ctx.drawImage(f > 0.5 ? cardFaces[c.id] : cardBack!, -R.w / 2, -R.h / 2, R.w, R.h);
        ctx.shadowBlur = 0;
        if (flash) { ctx.globalAlpha = fade * flash; ctx.fillStyle = '#fff'; rrect(ctx, -R.w / 2, -R.h / 2, R.w, R.h, 14); ctx.fill(); }
        ctx.restore();
      });
      ctx.restore();
    } else if (spec.kind === 'scratch') {
      if (cover) cover.style.opacity = revealAt ? String(clamp01(1 - springAt(now - revealAt))) : '1';
      // sparkle flipbook trailing the finger: 4 frames at 12 fps, ±8 px
      for (let i = trail.length - 1; i >= 0; i--) {
        const s = trail[i], fr = Math.floor((now - s.t0) / (1000 / 12)); if (fr > 3) { trail.splice(i, 1); continue; }
        drawSparkle(s.x, s.y, [5, 9, 7, 3][fr], [0.9, 1, 0.8, 0.5][fr]);
      }
      if (!touched && !revealAt) {   // ghost finger showing how to scratch
        const p = (t * 0.55) % 1, zx = W * (0.25 + 0.5 * Math.abs(((p * 3) % 2) - 1)), zy = H * (0.42 + 0.26 * p);
        ctx.save(); ctx.globalAlpha = 0.9 * Math.sin(p * Math.PI); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(zx, zy, 18, 0, P2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); ctx.restore();
        drawSparkle(zx + 14, zy - 14, 7, 0.9 * Math.sin(p * Math.PI));
      }
    }

    // shards: the dissipation beat
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i], hp = hitPhase(now - s.t0);
      if (hp.phase === 'done') { shards.splice(i, 1); continue; }
      if (hp.phase !== 'dissipation') continue;
      const e = 1 - (1 - hp.travel) ** 2;
      ctx.save(); ctx.globalAlpha = hp.alpha; ctx.translate(s.x + s.dx * e, s.y + s.dy * e); ctx.rotate(s.rot + e * 2); ctx.fillStyle = s.color; drawShard(ctx, s.kind, s.size); ctx.restore();
    }
    // misses: a soft ring so every tap answers
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], p = (now - r.t0) / 320; if (p >= 1) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - p)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, 10 + 22 * p, 0, P2); ctx.stroke();
    }
    // celebration: ≤24 particles, 45-frame life
    const life = WIN.lifeFrames * FRAME_MS;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i], age = now - s.t0; if (age > life) { sparks.splice(i, 1); continue; }
      const k = age / life;
      ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : clamp01(1 - (k - 0.7) / 0.3);
      ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.fillStyle = s.color; drawShard(ctx, s.kind, s.size); ctx.restore();
    }
  }
  function stepSparks(dt: number) {
    for (const s of sparks) { s.vy += 1100 * dt; s.vx *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; }
  }

  function frame(now: number) {
    raf = 0; if (disposed || document.hidden) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    const el = o.elapsed(), assist = assistLevel(el);
    if (now >= holdUntil) update(now, dt, el, assist);
    stepSparks(dt);
    render(now, assist);
    raf = requestAnimationFrame(frame);
  }
  const onVis = () => { if (!document.hidden && !raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('lostpointercapture', onUp);
    },
    key,
    celebrate() {
      if (winning) return; winning = true; const now = performance.now(); winAt = now;
      if (spec.kind === 'scratch' && !revealAt) revealAt = now;
      shards = [];
      const ox = lastHit.x || W / 2, oy = lastHit.y || H * 0.55;
      const pal = [...colors, accent, '#FFFFFF'];
      for (let i = 0; i < WIN.particles; i++) {
        const fromCentre = i % 2 === 0, x = fromCentre ? W / 2 : ox, y = fromCentre ? H * 0.5 : oy;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6, sp = 320 + Math.random() * 420;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 5 + Math.random() * 5, color: pal[i % pal.length], t0: now, rot: Math.random() * P2, vr: (Math.random() - 0.5) * 10, kind: shardKind });
      }
    },
  };
}

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────────────────────
function usePrefersReduced(override?: boolean) {
  const [pref, setPref] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)'); const on = () => setPref(mq.matches);
    mq.addEventListener?.('change', on); return () => mq.removeEventListener?.('change', on);
  }, []);
  return override ?? pref;
}

export default function EvitePlayGate({ spec, accent, reducedMotion, onWin, onSkip }: EvitePlayGateProps) {
  const reduced = usePrefersReduced(reducedMotion);
  const [score, setScore] = useState(0);
  const [end, setEnd] = useState<null | 'won' | 'auto'>(null);
  const [tiles, setTiles] = useState<boolean[]>(() => Array.from({ length: spec.goal }, () => false));
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const clockRef = useRef(createClock());
  const endRef = useRef<null | 'won' | 'auto'>(null);
  const settledRef = useRef(false);
  const bumpAt = useRef(0);
  const cbs = useRef({ onWin, onSkip }); cbs.current = { onWin, onSkip };
  const specKey = JSON.stringify(spec);

  const finish = useCallback((how: 'won' | 'auto') => {
    if (endRef.current || settledRef.current) return;
    endRef.current = how; setEnd(how); engineRef.current?.celebrate();
  }, []);
  const skip = useCallback(() => { if (settledRef.current) return; settledRef.current = true; cbs.current.onSkip(); }, []);

  // reset when the spec changes (preview replays, a different plate)
  useEffect(() => {
    clockRef.current = createClock(); endRef.current = null; settledRef.current = false;
    setEnd(null); setScore(0); setTiles(Array.from({ length: spec.goal }, () => false));
    if (rootRef.current) rootRef.current.style.opacity = '1';
  }, [specKey, reduced]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the Skip button gets focus so a keyboard parent is one key away from the invite
  useEffect(() => { skipRef.current?.focus({ preventScroll: true }); }, []);

  // keep taps on the gate from also bursting the stage underneath (it listens natively on its host)
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop); return () => el.removeEventListener('pointerdown', stop);
  }, []);

  // the canvas game
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current; if (!canvas) return;
    let lastLabel = '';
    const engine = startEngine({
      canvas, cover: spec.kind === 'scratch' ? coverRef.current : null, spec, accent,
      seed: (Math.random() * 2 ** 31) >>> 0,
      elapsed: () => clockRef.current.elapsed,
      onScore: v => { const l = progressLabel(spec, v); if (l !== lastLabel) { lastLabel = l; setScore(v); bumpAt.current = performance.now(); } },
      onGoal: () => finish('won'),
    });
    engineRef.current = engine;
    return () => { engine.dispose(); if (engineRef.current === engine) engineRef.current = null; };
  }, [specKey, accent, reduced, finish]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the clock (visible play time → auto-complete at 15 s), the readout bump, and the win moment
  useEffect(() => {
    let raf = 0, last = performance.now(), winStart = 0;
    const loop = (now: number) => {
      const dt = now - last; last = now;
      clockRef.current = tickClock(pauseClock(clockRef.current, document.hidden), dt);
      if (clockRef.current.done && !endRef.current) finish('auto');
      const pill = pillRef.current;
      if (pill && !reduced && bumpAt.current) pill.style.transform = `scale(${1 + 0.16 * (1 - Math.min(1, springAt(now - bumpAt.current)))})`;
      if (endRef.current) {
        if (!winStart) winStart = now;
        const t = now - winStart, s = springAt(t);
        const b = badgeRef.current;
        if (b) { b.style.opacity = String(reduced ? clamp01(s) : clamp01(t / (3 * FRAME_MS))); b.style.transform = `translate(-50%,-50%) scale(${reduced ? 1 : 0.5 + 0.5 * s})`; }
        if (t > WIN_FADE_MS && rootRef.current) rootRef.current.style.opacity = String(clamp01(1 - springAt(t - WIN_FADE_MS)));
        if (t >= WIN_DONE_MS) { if (!settledRef.current) { settledRef.current = true; cbs.current.onWin(); } return; }
      }
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => { if (!document.hidden) last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [specKey, reduced, finish]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tilesRef = useRef(tiles); tilesRef.current = tiles;
  const tapTile = (i: number) => {
    if (endRef.current || tilesRef.current[i]) return;
    const next = tilesRef.current.slice(); next[i] = true; tilesRef.current = next; setTiles(next);
    const n = next.filter(Boolean).length; setScore(n);
    if (n >= spec.goal) finish('won');
  };

  const prompt = reduced ? (spec.kind === 'scratch' ? 'Tap Open to reveal your invite!' : spec.kind === 'memory' ? `Tap all ${spec.goal} cards to open your invite!` : spec.prompt) : spec.prompt;
  const readout = reduced && spec.kind === 'scratch' ? '' : progressLabel(spec, reduced ? tiles.filter(Boolean).length : score);
  const touch = spec.kind === 'catch' || spec.kind === 'scratch' ? 'none' : 'manipulation';
  const cols = spec.goal <= 4 ? spec.goal : 3;

  return (
    <div ref={rootRef} className={`epg${spec.kind === 'scratch' ? ' scratch' : ''}`} role="dialog" aria-label={prompt}
      style={{ ['--epg-acc' as any]: accent }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); skip(); } }}>
      <style>{CSS}</style>
      {spec.kind !== 'scratch' && <div className="epg-dim" />}
      {!reduced && spec.kind === 'scratch' && <canvas ref={coverRef} className="epg-cover" aria-hidden="true" />}
      {!reduced && (
        <canvas ref={canvasRef} className="epg-canvas" tabIndex={0} role="button"
          aria-label={`${prompt} Keyboard: press Space to play${spec.kind === 'catch' ? ', arrow keys to move the basket' : ''}.`}
          style={{ touchAction: touch }}
          onKeyDown={e => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); engineRef.current?.key('hit'); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); engineRef.current?.key('left'); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); engineRef.current?.key('right'); }
          }} />
      )}
      {reduced && (
        <div className="epg-reduced">
          {spec.kind === 'scratch'
            ? <button type="button" className="epg-open" onClick={() => finish('won')} disabled={!!end}>Open</button>
            : <div className="epg-tiles" role="group" aria-label={prompt} style={{ ['--cols' as any]: cols }}>
              {tiles.map((on, i) => {
                const kind: SpriteKind = spec.kind === 'candles' ? 'candle' : spec.kind === 'memory' ? memoryFaces(spec)[i % spec.goal].sprite : spec.sprite;
                const color = spec.kind === 'memory' ? memoryFaces(spec)[i % spec.goal].color : spec.colors[i % spec.colors.length];
                return (
                  <button type="button" key={i} className={`epg-tile${on ? ' on' : ''}${spec.kind === 'candles' ? ' candle' : ''}`} aria-pressed={on}
                    aria-label={spec.kind === 'candles' ? `Candle ${i + 1}${on ? ', lit' : ''}` : `${spriteNoun(kind, 1)} ${i + 1}${on ? ', found' : ''}`} onClick={() => tapTile(i)}>
                    <span className="a"><SpriteIcon kind={kind} color={color} size={54} /></span>
                    <span className="b">{spec.kind === 'candles'
                      ? <SpriteIcon kind="candle" color={color} size={54} lit />
                      : <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                  </button>
                );
              })}
            </div>}
        </div>
      )}

      <div className="epg-bar">
        {readout ? <div ref={pillRef} className="epg-pill" aria-live="polite" aria-atomic="true"><SpriteIcon kind={spec.kind === 'candles' ? 'candle' : spec.sprite} color={spec.colors[0] || accent} size={22} lit={spec.kind === 'candles'} /><span>{readout}</span></div> : <span />}
        <button ref={skipRef} type="button" className="epg-skip" onClick={skip} aria-label="Skip to the invite">Skip to the invite</button>
      </div>
      <div className="epg-prompt" aria-hidden="true"><span>{prompt}</span></div>
      <div ref={badgeRef} className="epg-badge" role="status">{end ? (end === 'won' ? 'You did it!' : 'Here’s your invite!') : ''}</div>
    </div>
  );
}

const CSS = `
.epg{position:absolute;inset:0;z-index:5;border-radius:inherit;overflow:hidden;pointer-events:auto;color:#fff;font-family:Fredoka,Outfit,system-ui,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.epg *{box-sizing:border-box}
.epg-dim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom,rgba(11,7,19,.62),rgba(11,7,19,0) 30%),radial-gradient(130% 90% at 50% 58%,rgba(11,7,19,.05),rgba(11,7,19,.42))}
.epg-cover,.epg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.epg-canvas{outline:none;cursor:pointer}.epg.scratch .epg-canvas{cursor:crosshair}
.epg-canvas:focus-visible{box-shadow:inset 0 0 0 3px var(--epg-acc)}
.epg-bar{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none}
.epg-pill{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 13px 0 8px;border-radius:999px;background:rgba(16,8,28,.64);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.16);font:700 16px/1 Fredoka,Outfit,system-ui,sans-serif;font-variant-numeric:tabular-nums;transform-origin:left center;box-shadow:0 6px 18px -8px rgba(0,0,0,.6)}
.epg-skip{pointer-events:auto;min-height:44px;min-width:44px;padding:0 15px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(16,8,28,.66);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font:700 13px/1 Inter,system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;white-space:nowrap;box-shadow:0 6px 18px -8px rgba(0,0,0,.6)}
.epg-skip:hover{background:rgba(44,22,70,.8)}.epg-skip:focus-visible{outline:3px solid var(--epg-acc);outline-offset:2px}
.epg-prompt{position:absolute;top:62px;left:12px;right:12px;text-align:center;pointer-events:none}
.epg-prompt span{display:inline-block;max-width:100%;padding:9px 16px;border-radius:18px;background:linear-gradient(135deg,rgba(107,0,153,.86),rgba(212,0,85,.8) 60%,rgba(255,140,0,.78));box-shadow:0 10px 26px -12px rgba(0,0,0,.7);font:700 17px/1.2 Fredoka,Outfit,system-ui,sans-serif;text-wrap:balance;text-shadow:0 1px 2px rgba(0,0,0,.3)}
.epg-badge{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) scale(.5);opacity:0;pointer-events:none;white-space:nowrap;padding:12px 22px;border-radius:22px;background:rgba(16,8,28,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.22);font:700 32px/1 Fredoka,Outfit,system-ui,sans-serif;text-shadow:0 0 18px var(--epg-acc),0 2px 4px rgba(0,0,0,.4)}
.epg-badge:empty{display:none}
.epg-reduced{position:absolute;left:14px;right:14px;top:122px;bottom:18px;display:flex;align-items:center;justify-content:center}
.epg-tiles{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:10px;width:100%;max-width:300px}
.epg-tile{position:relative;aspect-ratio:1;min-height:64px;border-radius:18px;border:1px solid rgba(255,255,255,.24);background:rgba(16,8,28,.58);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:grid;place-items:center;cursor:pointer;padding:0;color:#fff}
.epg-tile .a,.epg-tile .b{grid-area:1/1;display:grid;place-items:center;transition:opacity 300ms cubic-bezier(.2,.8,.2,1)}
.epg-tile .b{opacity:0}.epg-tile.on .a{opacity:.22}.epg-tile.candle.on .a{opacity:0}.epg-tile.on .b{opacity:1}
.epg-tile.on{border-color:var(--epg-acc)}
.epg-tile:focus-visible,.epg-open:focus-visible{outline:3px solid var(--epg-acc);outline-offset:2px}
.epg-open{min-height:64px;padding:0 44px;border-radius:999px;border:0;background:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:700 24px/1 Fredoka,Outfit,system-ui,sans-serif;cursor:pointer;box-shadow:0 14px 36px -14px rgba(212,0,85,.8)}
@media (max-width:360px){.epg-skip{font-size:12px;padding:0 11px}.epg-prompt span{font-size:15px}.epg-badge{font-size:27px}}
`;
