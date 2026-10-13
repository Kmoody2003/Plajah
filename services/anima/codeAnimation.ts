/**
 * services/anima/codeAnimation.ts
 *
 * Plajah Anima — Code-Based Animation & Programmatic Canvas Engine
 *
 * Just as code was used to procedurally draw rich Storybooks in Plajah,
 * this engine allows animating layers, characters, generative math, and parametric
 * curves using declarative JavaScript / TypeScript code hooks.
 *
 * Sandboxed evaluation contract:
 * (ctx: CanvasRenderingContext2D, env: CodeAnimationEnv) => void
 */

export interface CodeAnimationEnv {
  time: number;          // seconds elapsed
  frame: number;         // current frame number
  fps: number;           // project fps (e.g. 24)
  width: number;         // canvas width (1280)
  height: number;        // canvas height (720)
  progress: number;      // 0..1 normalized loop progress
  audioRms?: number;     // live audio envelope (0..1)
  theme: {
    purple: string;
    magenta: string;
    cyan: string;
    orange: string;
    gold: string;
  };
}

export interface CodeAnimationScript {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const BUILTIN_CODE_ANIMATIONS: Record<string, CodeAnimationScript> = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. STORYBOOK PROCEDURAL FLORAL BLOOM
  // ───────────────────────────────────────────────────────────────────────────
  storybook_floral: {
    id: 'storybook_floral',
    name: 'Storybook Procedural Floral Bloom',
    description: 'Generative growing vine with harmonic blooming petals, golden pollen dust, and gentle breeze sway.',
    code: `
// Storybook Floral Bloom
const { time, width, height, theme } = env;
ctx.save();
ctx.translate(width / 2, height - 60);

// Stem Growth
const grow = Math.min(1.0, time * 0.8);
ctx.strokeStyle = '#2E7D32';
ctx.lineWidth = 6;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(0, 0);

const segments = 16;
for (let i = 1; i <= segments * grow; i++) {
  const p = i / segments;
  const sx = Math.sin(p * Math.PI * 1.5 + time * 1.5) * 24 * p;
  const sy = -p * 320;
  ctx.lineTo(sx, sy);
}
ctx.stroke();

// Flower Head at Stem Tip
if (grow > 0.4) {
  const bloom = Math.min(1.0, (grow - 0.4) / 0.6);
  const tipX = Math.sin(Math.PI * 1.5 + time * 1.5) * 24;
  const tipY = -320;
  ctx.translate(tipX, tipY);

  const petalCount = 8;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount + time * 0.2;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = i % 2 === 0 ? theme.magenta : theme.lilac;
    ctx.beginPath();
    ctx.ellipse(0, -30 * bloom, 14 * bloom, 26 * bloom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Golden Center
  ctx.fillStyle = theme.gold;
  ctx.beginPath();
  ctx.arc(0, 0, 16 * bloom, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();
    `.trim(),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FLEISCHER BOILING INKWELL LINES
  // ───────────────────────────────────────────────────────────────────────────
  fleischer_boiling_lines: {
    id: 'fleischer_boiling_lines',
    name: '1930s Fleischer Boiling Ink Lines',
    description: 'Authentic 1930s hand-traced line jitter ("line boil") with inkwell imperfections.',
    code: `
// Fleischer Line Boil Simulation
const { time, width, height } = env;
ctx.save();
ctx.translate(width / 2, height / 2);

const boilStep = Math.floor(time * 12); // Boil at 12fps (on 2s)
const seed = (Math.sin(boilStep * 43.12) * 10000) % 1;

ctx.strokeStyle = '#FFFFFF';
ctx.fillStyle = '#111016';
ctx.lineWidth = 4 + (seed > 0.5 ? 0.8 : -0.8);
ctx.lineJoin = 'round';

// Draw a stylized character head with jittered vertices
ctx.beginPath();
const pts = 24;
for (let i = 0; i < pts; i++) {
  const a = (i * Math.PI * 2) / pts;
  const rJitter = Math.sin(i * 3 + boilStep) * 2.5;
  const r = 90 + rJitter;
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r;
  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}
ctx.closePath();
ctx.fill();
ctx.stroke();

// Whimsical Cartoon Eyes
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.ellipse(-28 + seed * 2, -15, 16, 26, 0, 0, Math.PI * 2);
ctx.ellipse(28 + seed * 2, -15, 16, 26, 0, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

ctx.fillStyle = '#000000';
ctx.beginPath();
ctx.arc(-24, -15, 6, 0, Math.PI * 2);
ctx.arc(32, -15, 6, 0, Math.PI * 2);
ctx.fill();

ctx.restore();
    `.trim(),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PARAMETRIC LISSAJOUS MOTION RIBBONS
  // ───────────────────────────────────────────────────────────────────────────
  lissajous_ribbons: {
    id: 'lissajous_ribbons',
    name: 'Parametric Harmonic Lissajous Ribbons',
    description: 'High-end mathematical motion graphics: multi-frequency harmonic ribbons with glowing gradient trails.',
    code: `
// Parametric Harmonic Lissajous
const { time, width, height, theme } = env;
ctx.save();
ctx.translate(width / 2, height / 2);

const trails = 18;
const points = 60;
const freqX = 3.0;
const freqY = 2.0;

for (let tIdx = 0; tIdx < trails; tIdx++) {
  const tOffset = time - tIdx * 0.04;
  ctx.strokeStyle = tIdx % 2 === 0 ? theme.cyan : theme.magenta;
  ctx.globalAlpha = 1.0 - (tIdx / trails) * 0.85;
  ctx.lineWidth = 3;

  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const p = (i / points) * Math.PI * 2;
    const x = Math.sin(p * freqX + tOffset * 2.0) * 320;
    const y = Math.cos(p * freqY + tOffset * 1.5) * 220;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
ctx.restore();
    `.trim(),
  },
};

export class CodeAnimationRunner {
  private compiledFn: Function | null = null;
  private lastError: string | null = null;

  compile(code: string): boolean {
    try {
      this.compiledFn = new Function('ctx', 'env', code);
      this.lastError = null;
      return true;
    } catch (e: any) {
      this.lastError = e?.message || 'Syntax error in animation script';
      console.warn('Code animation compilation failed:', e);
      return false;
    }
  }

  execute(ctx: CanvasRenderingContext2D, env: CodeAnimationEnv): void {
    if (!this.compiledFn) return;
    try {
      this.compiledFn(ctx, env);
    } catch (e: any) {
      this.lastError = e?.message || 'Runtime execution error';
    }
  }

  getError(): string | null {
    return this.lastError;
  }
}
