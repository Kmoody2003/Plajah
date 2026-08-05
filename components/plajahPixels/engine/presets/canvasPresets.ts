// engine/presets/canvasPresets.ts — 7 audio-reactive Canvas2D scenes.
// Each preset is pure: it draws into the provided context using the
// supplied audio bands + params. State lives in `ctx.state` (reset on switch).

import { hexA, AudioBands, VizParams } from '../params';

export interface DrawCtx {
  g: CanvasRenderingContext2D;
  W: number; H: number; t: number;        // t = ms timestamp
  A: AudioBands; P: VizParams; pal: string[];
  state: Record<string, any>;
}

export interface CanvasPreset {
  id: string; name: string; cat: string;
  init?(s: Record<string, any>, c: DrawCtx): void;
  draw(c: DrawCtx): void;
}

function bg(c: DrawCtx) {
  const { g, W, H, P } = c;
  const tr = P.trail;
  if (tr <= 0.001) { g.fillStyle = '#07070c'; g.fillRect(0, 0, W, H); }
  else { g.fillStyle = `rgba(7,7,12,${1 - tr})`; g.fillRect(0, 0, W, H); }
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  {
    id: 'aurora', name: 'Aurora Drift', cat: 'Tranquil · Fluid',
    init(s) { s.b = Array.from({ length: 5 }, (_, i) => ({ off: i * 1.3, y: 0.35 + i * 0.07 })); },
    draw(c) {
      bg(c); const { g, W, H, t, A, P, pal } = c; g.globalCompositeOperation = 'lighter';
      const e = 0.5 + A.level * 0.8 + A.bass * 0.5;
      c.state.b.forEach((b: any, bi: number) => {
        const grad = g.createLinearGradient(0, 0, 0, H); const col = pal[bi % pal.length];
        grad.addColorStop(0, hexA(col, 0)); grad.addColorStop(0.5, hexA(col, 0.16 * P.glow * e)); grad.addColorStop(1, hexA(col, 0));
        g.fillStyle = grad; g.beginPath(); const by = H * b.y, amp = H * (0.06 + 0.1 * e) * (1 + bi * 0.15); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) { const u = x / W; g.lineTo(x, by + Math.sin(u * 6 + t * 0.0004 * P.speed + b.off + A.mid * 3) * amp + Math.sin(u * 13 - t * 0.0006 * P.speed + b.off * 2) * amp * 0.4 + Math.sin(u * 3 + t * 0.0002) * amp * 0.6); }
        g.lineTo(W, H); g.closePath(); g.fill();
      });
      for (let i = 0; i < 60; i++) { const sx = i * 137.5 % W, sy = i * 263.1 % H, tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.001 + i)); g.fillStyle = hexA('#fff', tw * A.treble * 0.5 * P.glow); g.beginPath(); g.arc(sx, sy, 1.1, 0, 7); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'chrome', name: 'Liquid Chrome', cat: 'Fluid · 3D',
    init(s) { s.bl = Array.from({ length: 7 }, (_, i) => ({ a: Math.random() * 7, r: 0.18 + Math.random() * 0.18, sp: 0.0003 + Math.random() * 0.0006, orbit: 0.12 + Math.random() * 0.28, ci: i })); },
    draw(c) {
      const { g, W, H, t, A, P, pal } = c; g.fillStyle = '#05050a'; g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, pump = 1 + A.bass * 0.7 + A.beat * 0.25; g.globalCompositeOperation = 'lighter';
      c.state.bl.forEach((b: any) => {
        b.a += b.sp * P.speed * (1 + A.mid * 2);
        const ox = cx + Math.cos(b.a) * W * b.orbit * pump, oy = cy + Math.sin(b.a * 1.3) * H * b.orbit * pump, rad = Math.min(W, H) * b.r * pump, col = pal[b.ci % pal.length];
        const gr = g.createRadialGradient(ox - rad * 0.3, oy - rad * 0.3, rad * 0.1, ox, oy, rad);
        gr.addColorStop(0, hexA('#fff', 0.6 * P.glow)); gr.addColorStop(0.25, hexA(col, 0.5 * P.glow)); gr.addColorStop(0.7, hexA(col, 0.12 * P.glow)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, rad, 0, 7); g.fill();
      });
      g.globalCompositeOperation = 'overlay';
      const sw = g.createLinearGradient(0, cy + Math.sin(t * 0.0008) * H * 0.3, W, cy);
      sw.addColorStop(0, hexA(pal[2], 0)); sw.addColorStop(0.5, hexA(pal[2], 0.25 * A.treble * P.glow)); sw.addColorStop(1, hexA(pal[0], 0));
      g.fillStyle = sw; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'bauhaus', name: 'Bauhaus Pop', cat: '2D · Flat',
    init(s) { s.rebuild = () => { s.cells = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) s.cells.push({ x, y, shape: Math.floor(Math.random() * 4), ci: Math.floor(Math.random() * 4), rot: Math.random() * Math.PI }); }; s.rebuild(); },
    draw(c) {
      const { g, W, H, t, A, pal, P } = c; g.fillStyle = '#0c0c14'; g.fillRect(0, 0, W, H);
      if (A.beat > 0.6 && Math.random() < 0.5) c.state.rebuild();
      const cw = W / 5, ch = H / 3;
      c.state.cells.forEach((cell: any, i: number) => {
        const px = cell.x * cw, py = cell.y * ch, col = pal[cell.ci % pal.length], pulse = 1 + (i % 3 === 0 ? A.bass : i % 3 === 1 ? A.mid : A.treble) * 0.5, s = Math.min(cw, ch) * 0.4 * pulse;
        g.save(); g.translate(px + cw / 2, py + ch / 2); g.rotate(cell.rot + (cell.shape === 2 ? t * 0.0004 * P.speed : 0)); g.fillStyle = col; g.globalAlpha = 0.92;
        if (cell.shape === 0) { g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); }
        else if (cell.shape === 1) g.fillRect(-s, -s, s * 2, s * 2);
        else if (cell.shape === 2) { g.beginPath(); g.moveTo(0, -s); g.lineTo(s, s); g.lineTo(-s, s); g.closePath(); g.fill(); }
        else { g.beginPath(); g.arc(0, 0, s, 0, Math.PI); g.fill(); }
        g.restore();
      });
      g.globalAlpha = 1;
    },
  },
  {
    id: 'nebula', name: 'Particle Nebula', cat: '3D · Abstract',
    init(s) { s.pts = Array.from({ length: 900 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 })); s.rot = 0; },
    draw(c) {
      bg(c); const { g, W, H, t, A, P, pal } = c; const cx = W / 2, cy = H / 2, f = Math.min(W, H) * 0.9;
      c.state.rot += (0.0015 + A.mid * 0.004) * P.speed;
      const ry = c.state.rot, cy_ = Math.cos(ry), sy_ = Math.sin(ry), rx = Math.sin(t * 0.0003) * 0.4, cx_ = Math.cos(rx), sx_ = Math.sin(rx), burst = 1 + A.bass * 0.5 + A.beat * 0.4;
      g.globalCompositeOperation = 'lighter';
      c.state.pts.forEach((p: any, i: number) => {
        const x1 = p.x * cy_ - p.z * sy_, z1 = p.x * sy_ + p.z * cy_, y1 = p.y * cx_ - z1 * sx_, z2 = p.y * sx_ + z1 * cx_;
        const sc = f / (2.2 + z2 * 1.4) * burst, sx = cx + x1 * sc, sy = cy + y1 * sc, d = (z2 + 1) / 2, col = pal[i % pal.length], sz = (0.6 + d * 2.2) * (1 + A.treble * 0.6);
        g.fillStyle = hexA(col, (0.15 + d * 0.5) * P.glow); g.beginPath(); g.arc(sx, sy, sz, 0, 7); g.fill();
      });
      g.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'gravity', name: 'Gravity Wells', cat: 'Physics',
    init(s) { s.o = Array.from({ length: 34 }, (_, i) => ({ x: Math.random(), y: Math.random(), vx: (Math.random() * 2 - 1) * 0.6, vy: (Math.random() * 2 - 1) * 0.6, r: 4 + Math.random() * 9, ci: i % 4, _init: false })); },
    draw(c) {
      bg(c); const { g, W, H, A, P, pal } = c; const cx = W / 2, cy = H / 2, o = c.state.o, gp = 0.04 + A.level * 0.05;
      o.forEach((b: any) => { if (!b._init) { b.x *= W; b.y *= H; b._init = true; } });
      if (A.beat > 0.6) o.forEach((b: any) => { const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1, f = 2.5 + A.bass * 4; b.vx += dx / d * f; b.vy += dy / d * f; });
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < o.length; i++) {
        const b = o[i], dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy) || 1; b.vx += dx / d * gp; b.vy += dy / d * gp;
        for (let j = i + 1; j < o.length; j++) { const p = o[j], ax = b.x - p.x, ay = b.y - p.y, dd = ax * ax + ay * ay; if (dd < 6400 && dd > 1) { const inv = 1 / Math.sqrt(dd), f = 0.6 * (1 - Math.sqrt(dd) / 80) * inv; b.vx += ax * f; b.vy += ay * f; p.vx -= ax * f; p.vy -= ay * f; } }
        b.vx *= 0.985; b.vy *= 0.985; b.x += b.vx * P.speed * 1.6; b.y += b.vy * P.speed * 1.6;
        if (b.x < b.r) { b.x = b.r; b.vx *= -0.8; } if (b.x > W - b.r) { b.x = W - b.r; b.vx *= -0.8; }
        if (b.y < b.r) { b.y = b.r; b.vy *= -0.8; } if (b.y > H - b.r) { b.y = H - b.r; b.vy *= -0.8; }
        const col = pal[b.ci], rad = b.r * (1 + A.bass * 0.6), gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad * 3);
        gr.addColorStop(0, hexA(col, 0.9 * P.glow)); gr.addColorStop(0.4, hexA(col, 0.4 * P.glow)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, rad * 3, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'kinetic', name: 'Kinetic Mirror', cat: 'Kinetic',
    init(s) { s.ang = 0; s.sh = Array.from({ length: 14 }, (_, i) => ({ d: 0.1 + i * 0.05, a: Math.random() * 7, sp: Math.random() * 2 - 1, ci: i % 4, sz: 8 + Math.random() * 22 })); },
    draw(c) {
      bg(c); const { g, W, H, A, P, pal } = c; const cx = W / 2, cy = H / 2, slices = P.mirror ? 10 : 8;
      c.state.ang += (0.002 + A.treble * 0.01 + A.beat * 0.02) * P.speed; g.globalCompositeOperation = 'lighter';
      for (let s = 0; s < slices; s++) {
        g.save(); g.translate(cx, cy); g.rotate(c.state.ang + s * (Math.PI * 2 / slices)); if (s % 2) g.scale(1, -1);
        c.state.sh.forEach((sh: any) => {
          sh.a += sh.sp * 0.004 * P.speed * (1 + A.mid);
          const rr = Math.min(W, H) * sh.d * (1 + A.bass * 0.4), x = Math.cos(sh.a) * rr, y = Math.sin(sh.a) * rr, col = pal[sh.ci], sz = sh.sz * (1 + A.level * 0.8);
          const gr = g.createRadialGradient(x, y, 0, x, y, sz); gr.addColorStop(0, hexA(col, 0.85 * P.glow)); gr.addColorStop(1, hexA(col, 0));
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, sz, 0, 7); g.fill();
          g.strokeStyle = hexA(col, 0.25 * P.glow); g.lineWidth = 1.5 * (1 + A.bass); g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke();
        });
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'ripple', name: 'Ripple Field', cat: 'Fluid · Abstract',
    init(s) { s.r = []; s.tl = 0; },
    draw(c) {
      bg(c); const { g, W, H, A, P, pal } = c; const cx = W / 2, cy = H / 2;
      if (A.beat > 0.5) c.state.r.push({ r: 0, life: 1, ci: Math.floor(Math.random() * 4), x: cx + (Math.random() * 2 - 1) * W * 0.2, y: cy + (Math.random() * 2 - 1) * H * 0.2, speed: 2 + A.bass * 4 });
      c.state.tl++; if (c.state.tl % 26 === 0) c.state.r.push({ r: 0, life: 1, ci: (c.state.tl / 26) % 4 | 0, x: cx, y: cy, speed: 1.6 });
      g.globalCompositeOperation = 'lighter';
      c.state.r = c.state.r.filter((rg: any) => {
        rg.r += rg.speed * P.speed * (1 + A.level); rg.life -= 0.006; if (rg.life <= 0) return false;
        const col = pal[rg.ci]; g.strokeStyle = hexA(col, rg.life * 0.5 * P.glow); g.lineWidth = (2 + A.bass * 5) * rg.life; g.beginPath(); g.arc(rg.x, rg.y, rg.r, 0, 7); g.stroke();
        g.strokeStyle = hexA('#fff', rg.life * 0.15 * P.glow); g.lineWidth = 1; g.beginPath(); g.arc(rg.x, rg.y, rg.r * 0.7, 0, 7); g.stroke();
        return true;
      });
      if (c.state.r.length > 120) c.state.r.splice(0, c.state.r.length - 120);
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.3 * (1 + A.bass));
      cg.addColorStop(0, hexA(pal[0], 0.18 * A.level * P.glow)); cg.addColorStop(1, hexA(pal[0], 0));
      g.fillStyle = cg; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    },
  },
];
