/**
 * Zero-Tear Multi-Layer Painted-Artwork Animator
 * (Plajah Motion Council: PASTORAL / LIVE2D / SATSUEI / MINIATURE / INK_WASH)
 *
 * Instead of tearing flattened JPEGs with scanline strips or cutout smears, every world is
 * composed cleanly like a real hand-painted cel/multiplane animation camera:
 *   Layer 0: Clean 1376x768 hand-painted background plate (zero baked actors, zero baked UI)
 *   Layer 1: Contact shadows & subtle painted atmospheric lighting (komorebi rays, glints, caustics)
 *   Layer 2: Isolated transparent RGBA sprites extracted via Plajah's Alpha Matting Engine
 *            (`services/matting/alphaMattingEngine.ts`) — fox, lanterns, 3D-foreshortened
 *            spinning waterwheel, shepherd, grazing flock, bronze wind-bell, sailing dhows,
 *            pierced rotating brass astrolabe dial — animated smoothly on 1s/2s/3s!
 *   Layer 3: Architectural foreground occlusions (bridge arch, water spray, dome reflections)
 *            & Satsuei unified cold-press cotton-rag film grain.
 */

import { fbm2D } from '../anima/procedural';
import { quantizeMotionTime, type DirectorSettings } from './motionDirector';
import type { WorldId } from './contracts';

export type SpriteKey =
  | 'fox'
  | 'lantern'
  | 'waterwheel'
  | 'shepherd'
  | 'sheep'
  | 'windbell'
  | 'riverboat'
  | 'astrolabeDial';

export const WORLD_SPRITE_MANIFEST: Record<WorldId | 'ora', ReadonlyArray<SpriteKey>> = {
  reading: ['fox', 'lantern'],
  math: ['waterwheel'],
  science: [],
  studio: [],
  history: ['riverboat', 'astrolabeDial'],
  elevate: ['shepherd', 'sheep'],
  ora: ['windbell'],
};

export const SPRITE_URLS: Record<SpriteKey, string> = {
  fox: '/academia-games/sprites/fox.png',
  lantern: '/academia-games/sprites/lantern.png',
  waterwheel: '/academia-games/sprites/waterwheel.png',
  shepherd: '/academia-games/sprites/shepherd.png',
  sheep: '/academia-games/sprites/sheep.png',
  windbell: '/academia-games/sprites/windbell.png',
  riverboat: '/academia-games/sprites/riverboat.png',
  astrolabeDial: '/academia-games/sprites/astrolabe-dial.png',
};

export interface LanternSlotState {
  text: string;
  filled: boolean;
  solved: boolean;
}

export interface PlateAnimParams {
  world: WorldId | 'ora';
  timeSec: number;
  reducedMotion: boolean;
  director: DirectorSettings;
  intensity: number;       // 0..1 quest progress / harmony
  wheelAngle: number;      // radians (Math waterwheel)
  needleAngle: number;     // radians (Science galvanometer)
  astrolabeAngle: number;  // radians (History astrolabe)
  rpmOrVoltage: number;    // 0..1
  bioFlux: number;         // 0..1
  pointerNorm: { x: number; y: number; active: boolean };
  lanternSlots?: ReadonlyArray<LanternSlotState>;
  sprites?: Partial<Record<SpriteKey, HTMLImageElement>>;
}

// Reusable cold-press paper grain canvas (created once, zero per-frame allocation)
let cachedPaperPattern: CanvasPattern | null = null;
function getPaperPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedPaperPattern) return cachedPaperPattern;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(128, 128);
  let s = 1337;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 132 + (rnd() - 0.5) * 44;
    img.data[i] = v;
    img.data[i + 1] = v - 4;
    img.data[i + 2] = v - 10;
    img.data[i + 3] = 14;
  }
  g.putImageData(img, 0, 0);
  cachedPaperPattern = ctx.createPattern(c, 'repeat');
  return cachedPaperPattern;
}

function spriteReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

// ── ZERO-TEAR PAINTED ATMOSPHERE & CRAFT PRIMITIVES ──────────────────────────────────────────────

/** Soft painted contact shadow beneath grounded sprites (characters, sheep, boats). */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color = 'rgba(38, 30, 18, 0.30)',
): void {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, rx * 0.15, x, y, rx);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(38, 30, 18, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Gentle watercolor specular glints shimmering across water WITHOUT tearing the painted plate! */
function drawWaterGlints(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  polyNorm: ReadonlyArray<readonly [number, number]>,
  time: number,
  opts: { count?: number; color?: string; alpha?: number; flowX?: number; flowY?: number },
): void {
  const pts = polyNorm.map(([nx, ny]) => [nx * W, ny * H] as const);
  const minX = Math.min(...pts.map(p => p[0]));
  const maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1]));
  const maxY = Math.max(...pts.map(p => p[1]));
  const count = opts.count ?? 14;
  const baseAlpha = opts.alpha ?? 0.28;
  const flowX = opts.flowX ?? 0.04;
  const flowY = opts.flowY ?? 0.0;

  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = opts.color ?? '#FFF9E8';
  for (let i = 0; i < count; i++) {
    const u = ((i * 0.6180339 + time * flowX) % 1 + 1) % 1;
    const v = ((i * 0.3717 + time * flowY) % 1 + 1) % 1;
    const gx = minX + u * (maxX - minX);
    const gy = minY + v * (maxY - minY);
    const twinkle = 0.25 + 0.75 * Math.max(0, Math.sin(time * 2.1 + i * 1.9));
    ctx.globalAlpha = baseAlpha * twinkle;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 9 + (i % 4) * 5, 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Hand-inked dandelion seed parachute (matched sepia & cream style, on 2s). */
function drawInkDandelionSeed(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(72, 54, 38, 0.72)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, -6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(252, 245, 228, 0.88)';
  ctx.lineWidth = 1.0;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(i * 2.4, -10.5 + Math.abs(i) * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hand-drawn watercolor flame with organic on-2s ink boil (for Elevate terracotta oil lamps). */
function drawInkOilFlame(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tStepped: number, seed: number): void {
  const sway = Math.sin(tStepped * 7.5 + seed) * 2.2;
  const stretch = 1 + Math.sin(tStepped * 9.2 + seed * 1.7) * 0.14;
  ctx.save();
  ctx.translate(x, y);
  // Warm golden radiance behind flame
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 38 * scale);
  g.addColorStop(0, 'rgba(255, 214, 110, 0.56)');
  g.addColorStop(1, 'rgba(255, 214, 110, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -6, 38 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer saffron teardrop
  ctx.fillStyle = 'rgba(246, 178, 66, 0.93)';
  ctx.strokeStyle = 'rgba(92, 54, 24, 0.65)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-5 * scale, -6 * scale, sway, -15 * scale * stretch);
  ctx.quadraticCurveTo(5 * scale, -6 * scale, 0, 0);
  ctx.fill();
  ctx.stroke();

  // Inner cream core
  ctx.fillStyle = '#FFF6D4';
  ctx.beginPath();
  ctx.ellipse(sway * 0.3, -5 * scale, 2.2 * scale, 4.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Evaluate a quadratic Bezier point & tangent for catenary ropes and river paths. */
function evalQuad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  u: number,
): { x: number; y: number } {
  const inv = 1 - u;
  return {
    x: inv * inv * p0[0] + 2 * inv * u * p1[0] + u * u * p2[0],
    y: inv * inv * p0[1] + 2 * inv * u * p1[1] + u * u * p2[1],
  };
}

/** Smooth piecewise polyline interpolation along normalized river waypoints. */
function samplePolyline(
  pts: ReadonlyArray<readonly [number, number]>,
  u: number,
): { x: number; y: number; dx: number; dy: number } {
  const clamped = Math.max(0, Math.min(0.9999, u));
  const segs = pts.length - 1;
  const scaled = clamped * segs;
  const idx = Math.min(segs - 1, Math.floor(scaled));
  const f = scaled - idx;
  const a = pts[idx];
  const b = pts[idx + 1];
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    dx: b[0] - a[0],
    dy: b[1] - a[1],
  };
}

function drawGuideRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(label, x + 4, Math.max(14, y - 4));
  ctx.restore();
}

// ── MASTER ZERO-TEAR LAYERED ANIMATION RENDERER ──────────────────────────────────────────────────

export function renderAnimatedHandmadePlate(
  ctx: CanvasRenderingContext2D,
  plate: HTMLImageElement,
  W: number,
  H: number,
  p: PlateAnimParams,
): void {
  // LAYER 0: Draw the pristine, untouched 1376x768 clean background plate (ZERO tearing!)
  ctx.drawImage(plate, 0, 0, W, H);

  const tSmooth = p.reducedMotion ? 0 : p.timeSec;
  const tStepped = p.reducedMotion ? 0 : quantizeMotionTime(p.timeSec, p.director.stepping);
  const wind = p.reducedMotion ? 0 : p.director.windStrength;
  const guide = p.director.showRigGuides;
  const sprites = p.sprites ?? {};

  // ── 1. READING: Woodland Brook, Swinging Mulberry Lanterns & Woodland Fox ────────────
  if (p.world === 'reading') {
    // Subtle sunlit watercolor glints gliding across the brook (zero pixel tearing!)
    drawWaterGlints(
      ctx, W, H,
      [[0.02, 0.72], [0.46, 0.68], [0.54, 0.96], [0.02, 0.96]],
      tSmooth,
      { count: 14, color: '#FCF6E6', alpha: 0.30, flowX: -0.055, flowY: 0.015 },
    );
    drawWaterGlints(
      ctx, W, H,
      [[0.58, 0.50], [0.82, 0.50], [0.78, 0.68], [0.60, 0.68]],
      tSmooth,
      { count: 10, color: '#FCF6E6', alpha: 0.24, flowX: -0.04, flowY: 0.012 },
    );

    // Warm hand-painted komorebi sunbeams breathing behind the lanterns
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const drift = p.reducedMotion ? 0 : (fbm2D(tSmooth * 0.14 + i * 1.9, 0.5) - 0.5) * 44;
      const a = (0.065 + p.intensity * 0.095) * (0.82 + 0.18 * Math.sin(tSmooth * 0.65 + i));
      const g = ctx.createLinearGradient(W * (0.43 + i * 0.13) + drift, 0, W * (0.52 + i * 0.13) + drift, H * 0.78);
      g.addColorStop(0, `rgba(255, 240, 192, ${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 240, 192, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(W * (0.40 + i * 0.13) + drift, 0);
      ctx.lineTo(W * (0.48 + i * 0.13) + drift, 0);
      ctx.lineTo(W * (0.60 + i * 0.13) + drift, H * 0.78);
      ctx.lineTo(W * (0.47 + i * 0.13) + drift, H * 0.78);
      ctx.fill();
    }
    ctx.restore();

    // Hand-inked catenary twine rope strung between the oak bough and the right woodland tree
    const ropeSag = (0.215 + Math.sin(tStepped * 1.1) * 0.004 * wind) * H;
    const p0: [number, number] = [W * 0.365, H * 0.125];
    const p1: [number, number] = [W * 0.655, ropeSag];
    const p2: [number, number] = [W * 0.918, H * 0.118];

    ctx.save();
    ctx.strokeStyle = '#3F2B1A';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(186, 152, 108, 0.78)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1] - 0.8);
    ctx.quadraticCurveTo(p1[0], p1[1] - 0.8, p2[0], p2[1] - 0.8);
    ctx.stroke();
    ctx.restore();

    // Isolated transparent Mulberry-Paper Lantern sprites swinging cleanly on 2s from the twine rope!
    const lanternImg = sprites.lantern;
    const slots = p.lanternSlots && p.lanternSlots.length > 0
      ? p.lanternSlots
      : [
          { text: 'S', filled: true, solved: false },
          { text: 'U', filled: true, solved: false },
          { text: 'N', filled: true, solved: false },
        ];
    const nLanterns = slots.length;

    if (spriteReady(lanternImg)) {
      const targetH = nLanterns >= 4 ? H * 0.24 : H * 0.275;
      const aspect = lanternImg.naturalWidth / lanternImg.naturalHeight;
      const targetW = targetH * aspect;

      slots.forEach((slot, i) => {
        const u = nLanterns === 1
          ? 0.50
          : 0.22 + (i / (nLanterns - 1)) * 0.56;
        const anchor = evalQuad(p0, p1, p2, u);

        // Pointer breeze reaction when brushing near the lanterns
        let pointerPush = 0;
        if (p.pointerNorm.active && !p.reducedMotion) {
          const dx = p.pointerNorm.x - anchor.x / W;
          const dy = p.pointerNorm.y - (anchor.y + targetH * 0.5) / H;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.04) pointerPush = Math.max(-0.12, Math.min(0.12, -dx * 0.55));
        }
        const swing = Math.sin(tStepped * 1.45 + i * 1.15) * 0.052 * wind + pointerPush;
        const solvedLift = slot.solved && !p.reducedMotion ? Math.sin(tStepped * 3.8 + i) * 3.5 : 0;

        ctx.save();
        ctx.translate(anchor.x, anchor.y - 3 + solvedLift);
        ctx.rotate(swing);

        // Warm golden candlelight aura radiating softly from inside the mulberry paper
        const glowAmt = slot.solved
          ? 0.58 + Math.sin(tSmooth * 4.5 + i) * 0.08
          : slot.filled
            ? 0.36 + Math.sin(tSmooth * 3.8 + i) * 0.05
            : 0.16 + Math.sin(tSmooth * 3.0 + i) * 0.03;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(0, targetH * 0.64, 6, 0, targetH * 0.64, targetW * 1.35);
        g.addColorStop(0, `rgba(255, 224, 134, ${glowAmt.toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 224, 134, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, targetH * 0.64, targetW * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Crisp transparent isolated mulberry lantern sprite (zero halo, transparent handle loop!)
        ctx.drawImage(lanternImg, -targetW * 0.5, 0, targetW, targetH);

        // Small sepia twine knot tying the lantern loop onto the overhead rope
        ctx.fillStyle = '#4A3320';
        ctx.beginPath();
        ctx.arc(0, 4, 3.6, 0, Math.PI * 2);
        ctx.fill();

        // Live handwritten quest letter painted onto the glowing lantern face!
        const label = slot.text || '·';
        const fontSize = label.length >= 3 ? Math.round(targetW * 0.24) : Math.round(targetW * 0.42);
        ctx.font = `700 ${fontSize}px Georgia, "EB Garamond", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = slot.filled || slot.solved ? '#3A2414' : 'rgba(92, 66, 42, 0.45)';
        ctx.fillText(label, 0, targetH * 0.64);

        ctx.restore();

        if (guide) {
          drawGuideRect(ctx, anchor.x - targetW * 0.5, anchor.y, targetW, targetH, '#FFD54F', `SPRITE LANTERN ${i + 1}`);
        }
      });
    }

    // Isolated transparent Woodland Fox Cub sitting on the sunlit mossy right bank!
    const foxImg = sprites.fox;
    if (spriteReady(foxImg)) {
      const foxH = H * 0.345;
      const foxW = foxH * (foxImg.naturalWidth / foxImg.naturalHeight);
      const footX = W * 0.785;
      const footY = H * 0.805;

      const breath = Math.sin(tStepped * 1.65) * 0.020;
      const happyHop = p.intensity >= 0.99 && !p.reducedMotion ? Math.abs(Math.sin(tStepped * 5.2)) * 12 : 0;
      const tilt = Math.sin(tStepped * 0.9) * 0.016;

      // Grounded painted grass shadow under the fox
      drawContactShadow(ctx, footX + 6, footY - 8, foxW * 0.48, 16, 'rgba(34, 42, 20, 0.36)');

      ctx.save();
      ctx.translate(footX, footY - happyHop);
      ctx.rotate(tilt);
      ctx.scale(1 - breath * 0.4, 1 + breath);
      ctx.drawImage(foxImg, -foxW * 0.5, -foxH, foxW, foxH);

      // Gentle sepia hand-inked blink directly on the fox's eye (local UV inside trimmed fox.png: 0.302, 0.268)
      const blinkPhase = tStepped % 4.6;
      if (!p.reducedMotion && blinkPhase > 4.38 && blinkPhase < 4.54) {
        const ex = -foxW * 0.5 + foxW * 0.302;
        const ey = -foxH + foxH * 0.268;
        ctx.fillStyle = '#CA6C3B';
        ctx.beginPath();
        ctx.arc(ex, ey, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#332014';
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey - 1, 4.6, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      ctx.restore();

      if (guide) drawGuideRect(ctx, footX - foxW * 0.5, footY - foxH, foxW, foxH, '#CE93D8', 'SPRITE FOX');
    }

    // Hand-inked dandelion seeds drifting lazily across the sunlit meadow on 2s
    if (!p.reducedMotion) {
      for (let i = 0; i < 8; i++) {
        const dx = ((0.35 * W + i * 96 + tStepped * 22 * Math.max(0.3, wind)) % (W * 0.70)) + W * 0.18;
        const dy = H * 0.20 + ((i * 61) % (H * 0.44)) + Math.sin(tStepped * 1.15 + i) * 16;
        drawInkDandelionSeed(ctx, dx, dy, Math.sin(tStepped * 0.85 + i) * 0.34, 0.76);
      }
    }
  }

  // ── 2. MATH: Hillside Mill, Isolated 3D-Foreshortened Spinning Waterwheel & Spray ────
  else if (p.world === 'math') {
    // Flowing watercolor light-sheen ribbons gliding smoothly down the 3 oak sluices (ZERO tearing!)
    drawWaterGlints(
      ctx, W, H,
      [[0.33, 0.56], [0.68, 0.36], [0.71, 0.43], [0.46, 0.64], [0.33, 0.61]],
      tSmooth,
      { count: 14, color: '#F6FDFF', alpha: 0.36, flowX: -(0.10 + p.rpmOrVoltage * 0.14), flowY: 0.06 + p.rpmOrVoltage * 0.08 },
    );

    // ISOLATED TRANSPARENT MOSSY CEDAR WATERWHEEL spinning cleanly in 3D isometric perspective!
    const wheelImg = sprites.waterwheel;
    if (spriteReady(wheelImg)) {
      const cx = W * 0.502;
      const cy = H * 0.858;
      const r = H * 0.215;

      // Clip cleanly to the millrace trough so the wheel sits inside the stone wall housing
      ctx.save();
      ctx.beginPath();
      ctx.rect(W * 0.36, H * 0.60, W * 0.26, H * 0.40);
      ctx.clip();

      // Grounded shadow cast into the millrace water beneath the wheel
      drawContactShadow(ctx, cx - 8, cy + r * 0.72, r * 0.78, 26, 'rgba(18, 32, 38, 0.42)');

      // Back wooden rim pass (+11px, -5px) gives authentic 3D barrel/plank depth through the open spokes!
      ctx.save();
      ctx.translate(cx + 11, cy - 5);
      ctx.transform(0.66, -0.22, 0, 1.0, 0, 0);
      ctx.rotate(p.wheelAngle);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(wheelImg, -r, -r, r * 2, r * 2);
      ctx.restore();

      // Front isolated wheel pass (zero halo, all 8 inter-spoke windows 100% transparent!)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.transform(0.66, -0.22, 0, 1.0, 0, 0);
      ctx.rotate(p.wheelAngle);
      ctx.drawImage(wheelImg, -r, -r, r * 2, r * 2);
      ctx.restore();

      ctx.restore();

      // Animated painterly whitewater foam & splash ribbons cascading right onto the spinning paddles!
      ctx.save();
      const foamSpeed = 2.2 + p.rpmOrVoltage * 3.8;
      const foamSpots: Array<[number, number, number]> = [
        [0.448, 0.745, 38],
        [0.415, 0.895, 44],
        [0.320, 0.925, 42],
      ];
      for (let s = 0; s < foamSpots.length; s++) {
        const [fx, fy, fr] = foamSpots[s];
        const pulse = 0.78 + 0.22 * Math.sin(tSmooth * foamSpeed + s * 2.1);
        ctx.globalCompositeOperation = 'screen';
        const sg = ctx.createRadialGradient(fx * W, fy * H, 4, fx * W, fy * H, fr * pulse);
        sg.addColorStop(0, `rgba(244, 252, 255, ${(0.30 + p.rpmOrVoltage * 0.22).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(244, 252, 255, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(fx * W, fy * H, fr * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (guide) drawGuideRect(ctx, cx - r * 0.7, cy - r, r * 1.4, r * 2, '#FF8A65', 'SPRITE WATERWHEEL 3D');
    }

    // Delicate hand-painted watercolor smoke plumes curling softly from both terracotta cottages (on 2s)
    if (!p.reducedMotion) {
      [
        [0.050, 0.67, 0],
        [0.195, 0.52, 1.8],
      ].forEach(([cx, cy, ph]) => {
        for (let i = 0; i < 6; i++) {
          const u = ((tStepped * 0.24 + i / 6 + ph * 0.1) % 1);
          const sx = cx * W - u * 36 * wind + Math.sin(tStepped * 1.3 + i) * 5;
          const sy = cy * H - u * 145;
          ctx.fillStyle = `rgba(246, 240, 228, ${((1 - u) * 0.34).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 5.5 + u * 16, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  // ── 3. SCIENCE: Clean Twilight Botanical Conservatory & Live Instruments ─────────────
  else if (p.world === 'science') {
    // Pulsing emerald bioluminescent wave traveling along the ACTUAL painted soil roots inside the terrarium
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(W * 0.195, H * 0.54, W * 0.175, H * 0.235, 16);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    const rootPulse = 0.22 + p.bioFlux * 0.52 + Math.sin(tSmooth * 2.2) * 0.11;
    const rg = ctx.createRadialGradient(W * 0.285, H * 0.66, 8, W * 0.285, H * 0.66, W * 0.11);
    rg.addColorStop(0, `rgba(74, 244, 178, ${rootPulse.toFixed(3)})`);
    rg.addColorStop(1, 'rgba(74, 244, 178, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(W * 0.18, H * 0.52, W * 0.22, H * 0.28);
    ctx.restore();
    if (guide) drawGuideRect(ctx, W * 0.195, H * 0.54, W * 0.175, H * 0.235, '#69F0AE', 'MYCORRHIZA');

    // Clean Galvanometer dial inner mask + live spring-damped crimson/brass needle aligned to exact meter pivot
    const mx = W * 0.692;
    const my = H * 0.635;
    ctx.save();
    // Softly feathered cream parchment inside the arc below the printed scale numbers (hides static ink pointer cleanly)
    const dialMask = ctx.createRadialGradient(mx, my - 10, 6, mx, my - 10, 39);
    dialMask.addColorStop(0, 'rgba(210, 200, 182, 0.98)');
    dialMask.addColorStop(0.78, 'rgba(205, 195, 177, 0.94)');
    dialMask.addColorStop(1, 'rgba(205, 195, 177, 0)');
    ctx.fillStyle = dialMask;
    ctx.beginPath();
    ctx.arc(mx, my - 10, 39, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(mx + 22, my + 4);
    ctx.lineTo(mx - 22, my + 4);
    ctx.closePath();
    ctx.fill();

    // Live spring-damped crimson galvanometer needle + antique brass pivot cap
    ctx.translate(mx, my);
    ctx.rotate(p.needleAngle);
    ctx.strokeStyle = '#9C3728';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(0, -44);
    ctx.stroke();
    ctx.fillStyle = '#C99E4E';
    ctx.strokeStyle = '#4A3620';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (guide) drawGuideRect(ctx, mx - 44, my - 50, 88, 60, '#FFB74D', 'GALVANOMETER');

    // Realistic tungsten Edison bulb blackbody glow composited with 'screen'
    const bx = W * 0.812;
    const by = H * 0.555;
    const flick = p.reducedMotion ? 1 : 0.95 + 0.05 * Math.sin(tSmooth * 6.8);
    const brad = (42 + p.rpmOrVoltage * 145) * flick;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const bg = ctx.createRadialGradient(bx, by, 4, bx, by, brad);
    bg.addColorStop(0, `rgba(255, 224, 138, ${((0.26 + p.rpmOrVoltage * 0.62) * flick).toFixed(3)})`);
    bg.addColorStop(0.45, `rgba(255, 178, 76, ${((0.12 + p.rpmOrVoltage * 0.30) * flick).toFixed(3)})`);
    bg.addColorStop(1, 'rgba(255, 160, 50, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, brad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Gentle sunlit twilight conservatory dust motes
    if (!p.reducedMotion) {
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const dx = W * (0.14 + ((i * 0.053 + tSmooth * 0.008) % 0.74));
        const dy = H * (0.12 + ((i * 0.071) % 0.52)) + Math.sin(tSmooth * 0.9 + i) * 12;
        const a = 0.16 + 0.24 * Math.max(0, Math.sin(tSmooth * 1.4 + i * 1.3));
        ctx.fillStyle = `rgba(255, 224, 154, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.8 + (i % 2) * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── 4. STUDIO 9–12: Empty Glass Vitrine Caustics & Blank Cotton-Rag Folio ────────────
  else if (p.world === 'studio') {
    // Rotating optical caustics shimmering across the engraved celestial compass base inside the empty dome
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = W * 0.334;
    const cy = H * 0.515;
    const shimmer = 0.18 + Math.sin(tSmooth * 1.5) * 0.06;
    const cg = ctx.createRadialGradient(cx, cy, 8, cx, cy, W * 0.125);
    cg.addColorStop(0, `rgba(244, 202, 108, ${shimmer.toFixed(3)})`);
    cg.addColorStop(1, 'rgba(244, 202, 108, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, W * 0.125, H * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (guide) drawGuideRect(ctx, W * 0.19, H * 0.06, W * 0.285, H * 0.61, '#FFD54F', 'EMPTY GLASS VITRINE');
  }

  // ── 5. HISTORY: Clean Watercolor Map, Sailing Dhows & Pierced Rotating Astrolabe ─────
  else if (p.world === 'history') {
    // Gentle sunlit watercolor glints on the clear blue Niger river (ZERO tearing!)
    drawWaterGlints(
      ctx, W, H,
      [[0.15, 0.78], [0.56, 0.42], [0.76, 0.05], [0.81, 0.10], [0.60, 0.50], [0.24, 0.86]],
      tSmooth,
      { count: 16, color: '#FFFBF0', alpha: 0.28, flowX: 0.032, flowY: -0.025 },
    );

    // ISOLATED TRANSPARENT WOODEN RIVERBOATS (dhows) gliding serenely along the watercolor river!
    const boatImg = sprites.riverboat;
    if (spriteReady(boatImg)) {
      const riverPath: Array<[number, number]> = [
        [0.24, 0.77],
        [0.37, 0.64],
        [0.49, 0.54],
        [0.59, 0.41],
        [0.64, 0.28],
        [0.73, 0.12],
      ];

      // Clip out the stone camel bridge arch so passing riverboats glide cleanly UNDERNEATH the bridge!
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      // Reverse-winding cutout polygon around the painted stone bridge & camels
      ctx.moveTo(W * 0.535, H * 0.305);
      ctx.lineTo(W * 0.535, H * 0.375);
      ctx.lineTo(W * 0.625, H * 0.365);
      ctx.lineTo(W * 0.720, H * 0.435);
      ctx.lineTo(W * 0.730, H * 0.370);
      ctx.lineTo(W * 0.620, H * 0.295);
      ctx.closePath();
      ctx.clip('evenodd');

      const boats = [
        { baseU: 0.16, speed: 0.014, phase: 0.0 },
        { baseU: 0.52, speed: 0.011, phase: 2.4 },
      ];

      boats.forEach((b, idx) => {
        const u = (b.baseU + tSmooth * b.speed) % 0.94;
        const pos = samplePolyline(riverPath, u);
        const bx = pos.x * W;
        const by = pos.y * H;
        // Perspective depth scaling: larger in foreground harbor, smaller upriver
        const boatH = H * (0.185 - u * 0.085);
        const boatW = boatH * (boatImg.naturalWidth / boatImg.naturalHeight);
        const bob = Math.sin(tStepped * 2.0 + b.phase) * 2.6;
        const rock = Math.sin(tStepped * 1.4 + b.phase) * 0.032;

        // Delicate watercolor V-wake ripples trailing behind the hull
        ctx.save();
        ctx.strokeStyle = 'rgba(252, 248, 236, 0.52)';
        ctx.lineWidth = 1.4;
        for (let w = 0; w < 2; w++) {
          const off = 14 + w * 14 + ((tSmooth * 18) % 14);
          ctx.globalAlpha = Math.max(0, 0.55 - off / 52);
          ctx.beginPath();
          ctx.arc(bx - off * 0.72, by + off * 0.48, 6 + off * 0.22, -0.5, 1.3);
          ctx.stroke();
        }
        ctx.restore();

        // Soft cobalt river reflection shadow under the hull
        drawContactShadow(ctx, bx, by + 6, boatW * 0.36, 9, 'rgba(32, 56, 92, 0.32)');

        ctx.save();
        ctx.translate(bx, by + bob);
        ctx.rotate(rock);
        ctx.drawImage(boatImg, -boatW * 0.48, -boatH * 0.80, boatW, boatH);
        ctx.restore();

        if (guide) drawGuideRect(ctx, bx - boatW * 0.48, by - boatH * 0.80, boatW, boatH, '#4FC3F7', `SPRITE DHOW ${idx + 1}`);
      });

      ctx.restore();
    }

    // ISOLATED PIERCED BRASS ASTROLABE DIAL seated flush rim-to-rim inside the empty recessed brass bezel!
    const dialImg = sprites.astrolabeDial;
    if (spriteReady(dialImg)) {
      const cx = W * 0.892;
      const cy = H * 0.181;
      const r = H * 0.112;

      ctx.save();
      ctx.translate(cx, cy);
      // Match the exact tabletop perspective foreshortening of the recessed brass astrolabe dish!
      ctx.rotate(-0.10);
      ctx.scale(0.99, 0.85);
      ctx.rotate(p.astrolabeAngle);
      ctx.drawImage(dialImg, -r, -r, r * 2, r * 2);
      ctx.restore();

      if (guide) drawGuideRect(ctx, cx - r, cy - r * 0.85, r * 2, r * 1.70, '#FFD54F', 'SPRITE ASTROLABE');
    }

    // Softly drifting sunlit window-leaf shadow sweeping across the warm mahogany desk
    ctx.save();
    const shDrift = Math.sin(tSmooth * 0.42) * 18 * wind;
    ctx.fillStyle = 'rgba(72, 48, 28, 0.065)';
    ctx.beginPath();
    ctx.ellipse(W * 0.62 + shDrift, H * 0.08, W * 0.18, H * 0.09, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 6. ELEVATE: Sunlit Galilean Olive Hill, Shepherd, Grazing Flock & Oil Lamps ──────
  else if (p.world === 'elevate') {
    // Sunlit turquoise Sea of Galilee glints (ZERO tearing of the painted boats or olive trunk!)
    drawWaterGlints(
      ctx, W, H,
      [[0.12, 0.29], [0.54, 0.29], [0.43, 0.43], [0.15, 0.45]],
      tSmooth,
      { count: 16, color: '#FFF9E2', alpha: 0.30, flowX: 0.025, flowY: 0 },
    );

    // ISOLATED GALILEAN SHEPHERD standing gently in the olive grove shade
    const shepherdImg = sprites.shepherd;
    if (spriteReady(shepherdImg)) {
      const shH = H * 0.335;
      const shW = shH * (shepherdImg.naturalWidth / shepherdImg.naturalHeight);
      const sx = W * 0.278;
      const sy = H * 0.725;
      const breath = Math.sin(tStepped * 1.45) * 0.015;
      const sway = Math.sin(tStepped * 0.8) * 0.012;

      drawContactShadow(ctx, sx, sy - 4, shW * 0.52, 12, 'rgba(42, 44, 24, 0.32)');

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sway);
      ctx.scale(1 - breath * 0.35, 1 + breath);
      ctx.drawImage(shepherdImg, -shW * 0.5, -shH, shW, shH);
      ctx.restore();

      if (guide) drawGuideRect(ctx, sx - shW * 0.5, sy - shH, shW, shH, '#CE93D8', 'SPRITE SHEPHERD');
    }

    // ISOLATED GRAZING FLOCK OF CREAM-WOOL SHEEP (3 scales & gentle breathing/bobbing on 2s!)
    const sheepImg = sprites.sheep;
    if (spriteReady(sheepImg)) {
      const flock = [
        { x: 0.365, y: 0.655, h: 0.135, flip: false, ph: 1.7 },
        { x: 0.525, y: 0.695, h: 0.155, flip: true, ph: 0.6 },
        { x: 0.435, y: 0.775, h: 0.185, flip: false, ph: 2.9 },
      ];
      flock.forEach((f, idx) => {
        const fh = H * f.h;
        const fw = fh * (sheepImg.naturalWidth / sheepImg.naturalHeight);
        const fx = W * f.x;
        const fy = H * f.y;
        const breath = Math.sin(tStepped * 1.7 + f.ph) * 0.019;
        const hop = p.intensity >= 0.99 && !p.reducedMotion ? Math.abs(Math.sin(tStepped * 4.8 + f.ph)) * 9 : 0;

        drawContactShadow(ctx, fx, fy - 5, fw * 0.44, 11, 'rgba(42, 46, 22, 0.30)');

        ctx.save();
        ctx.translate(fx, fy - hop);
        ctx.scale((f.flip ? -1 : 1) * (1 - breath * 0.3), 1 + breath);
        ctx.drawImage(sheepImg, -fw * 0.5, -fh, fw, fh);
        ctx.restore();

        if (guide) drawGuideRect(ctx, fx - fw * 0.5, fy - fh, fw, fh, '#81C784', `SPRITE SHEEP ${idx + 1}`);
      });
    }

    // 4 Hand-inked flickering terracotta oil-lamp flames right at each hanging bowl's wick spout!
    [
      [0.698, 0.296, 0.96, 0.3],
      [0.844, 0.268, 0.90, 1.4],
      [0.892, 0.314, 1.04, 2.5],
      [0.935, 0.274, 0.92, 3.6],
    ].forEach(([lx, ly, sc, sd]) => drawInkOilFlame(ctx, lx * W, ly * H, sc, tStepped, sd));

    // Warm sunlit golden olive-grove pollen motes
    if (!p.reducedMotion) {
      ctx.save();
      for (let i = 0; i < 12; i++) {
        const dx = ((W * 0.1 + i * 105 + tStepped * 18 * Math.max(0.3, wind)) % (W * 0.85)) + W * 0.08;
        const dy = H * 0.16 + ((i * 59) % (H * 0.48)) + Math.sin(tStepped * 1.1 + i) * 14;
        ctx.fillStyle = 'rgba(255, 240, 186, 0.65)';
        ctx.beginPath();
        ctx.arc(dx, dy, 1.9 + (i % 2) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── 7. ORA TEA-HOUSE PAUSE: Twilight Veranda, Isolated Swinging Bronze Wind-Bell ─────
  else if (p.world === 'ora') {
    // Gentle moonlit twilight glints shimmering softly on the calm koi pond (ZERO tearing!)
    drawWaterGlints(
      ctx, W, H,
      [[0.11, 0.45], [0.89, 0.45], [0.88, 0.65], [0.12, 0.65]],
      tSmooth,
      { count: 14, color: '#FCE5AE', alpha: 0.22, flowX: 0.015, flowY: 0 },
    );

    // ISOLATED ANTIQUE BRONZE WIND-BELL (furin) swinging cleanly from top-left cedar beam!
    const bellImg = sprites.windbell;
    if (spriteReady(bellImg)) {
      const bellH = H * 0.275;
      const bellW = bellH * (bellImg.naturalWidth / bellImg.naturalHeight);
      const px = W * 0.126;
      const py = -H * 0.008;
      let pointerGust = 0;
      if (p.pointerNorm.active && !p.reducedMotion && p.pointerNorm.x < 0.25 && p.pointerNorm.y < 0.35) {
        pointerGust = (0.126 - p.pointerNorm.x) * 0.65;
      }
      const swing = Math.sin(tStepped * 1.18) * 0.062 * wind + pointerGust;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(swing);
      ctx.drawImage(bellImg, -bellW * 0.5, 0, bellW, bellH);
      ctx.restore();

      if (guide) drawGuideRect(ctx, px - bellW * 0.5, py, bellW, bellH, '#FFD54F', 'SPRITE WINDBELL');
    }

    // Soft twinkling lantern radiance aligned dead-center on the 4 painted distant village path lanterns
    [
      [0.630, 0.305],
      [0.662, 0.280],
      [0.728, 0.308],
      [0.755, 0.292],
    ].forEach(([vx, vy], i) => {
      const tw = 0.28 + 0.32 * Math.sin(tStepped * 1.85 + i * 1.7);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(vx * W, vy * H, 1, vx * W, vy * H, 22);
      g.addColorStop(0, `rgba(255, 222, 134, ${tw.toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 222, 134, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vx * W, vy * H, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── THE COMPOSITOR (SATSUEI) PASS: Unified Cold-Press Cotton-Rag Grain ──
  if (p.director.grainAndWrap) {
    const pat = getPaperPattern(ctx);
    if (pat) {
      ctx.save();
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}
