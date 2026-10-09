// Lightweight particles: a pure simulation (seeded, capped) plus a draw function that works on any 2D context.
// One canvas, one rAF loop (owned by the engine), nothing allocated per frame beyond the particle objects themselves.
import type { BurstKind } from '../contracts';
import { mulberry32 } from './rng';

export interface Particle {
  kind: BurstKind;
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number;
  size: number; life: number; age: number;
  hue: number; gravity: number; drag: number;
  /** firefly / twinkle phase */
  ph: number;
}

export const BURST_KINDS: BurstKind[] = ['sparkles', 'confetti', 'bubbles', 'petals', 'hearts', 'stars', 'fireflies', 'leaves', 'notes', 'snow', 'embers'];
export const MAX_PARTICLES = 160;
export const MAX_BURST = 48;

const PALETTES: Record<BurstKind, string[]> = {
  sparkles: ['#fff6c8', '#ffe27a', '#ffffff', '#ffd1f0'],
  confetti: ['#ff4d6d', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff', '#ff9f1c'],
  bubbles: ['#bfe9ff', '#d9f3ff', '#a5dcf7'],
  petals: ['#ffc2d1', '#ffb3c6', '#ff8fab', '#fff0f3'],
  hearts: ['#ff5d8f', '#ff85a1', '#ffb3c6'],
  stars: ['#ffe066', '#fff3b0', '#ffd23f'],
  fireflies: ['#e8ff6a', '#caff70', '#fff59d'],
  leaves: ['#7cb518', '#a7c957', '#d4a373', '#bc6c25'],
  notes: ['#ffffff', '#ffd6a5', '#cdb4db', '#a2d2ff'],
  snow: ['#ffffff', '#e8f1ff'],
  embers: ['#ff7b00', '#ffb703', '#ff4d00'],
};
export const colorFor = (k: BurstKind, hue: number) => { const p = PALETTES[k]; return p[Math.floor(hue * p.length) % p.length]; };

interface Kind { life: [number, number]; speed: [number, number]; size: [number, number]; gravity: number; drag: number; spin: number; up?: boolean; spread?: number }
const KINDS: Record<BurstKind, Kind> = {
  sparkles: { life: [500, 950], speed: [40, 150], size: [3, 7], gravity: 40, drag: 2.2, spin: 4 },
  confetti: { life: [1100, 1900], speed: [160, 420], size: [5, 9], gravity: 520, drag: 1.4, spin: 10 },
  bubbles: { life: [1400, 2600], speed: [20, 70], size: [5, 13], gravity: -60, drag: 0.8, spin: 0, up: true },
  petals: { life: [1600, 2800], speed: [30, 110], size: [6, 11], gravity: 70, drag: 1.2, spin: 3 },
  hearts: { life: [1100, 1900], speed: [40, 120], size: [8, 15], gravity: -45, drag: 1.1, spin: 1.4, up: true },
  stars: { life: [700, 1300], speed: [60, 200], size: [6, 12], gravity: 60, drag: 1.6, spin: 5 },
  fireflies: { life: [1800, 3200], speed: [10, 40], size: [3, 5], gravity: -8, drag: 0.6, spin: 0 },
  leaves: { life: [1800, 3000], speed: [40, 130], size: [7, 12], gravity: 90, drag: 1.0, spin: 4 },
  notes: { life: [1200, 2000], speed: [30, 90], size: [12, 18], gravity: -50, drag: 1.0, spin: 1, up: true },
  snow: { life: [2200, 3600], speed: [10, 50], size: [2, 5], gravity: 45, drag: 0.7, spin: 0 },
  embers: { life: [900, 1700], speed: [30, 110], size: [2, 5], gravity: -80, drag: 1.0, spin: 0, up: true },
};

const range = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();

/** Spawn `count` particles of a kind at (x,y). Seeded: same seed -> same burst. */
export function spawn(kind: BurstKind, x: number, y: number, count: number, seed: number): Particle[] {
  const k = KINDS[kind]; const r = mulberry32(seed);
  const n = Math.max(0, Math.min(MAX_BURST, Math.round(count)));
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = k.up ? -Math.PI / 2 + (r() - .5) * 1.7 : r() * Math.PI * 2;
    const sp = range(r, k.speed);
    out.push({ kind, x: x + (r() - .5) * 8, y: y + (r() - .5) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: r() * Math.PI * 2, vr: (r() - .5) * k.spin, size: range(r, k.size), life: range(r, k.life), age: 0, hue: r(), gravity: k.gravity, drag: k.drag, ph: r() * 6.28 });
  }
  return out;
}

/** Advance in place; returns the survivors. Total is capped (oldest dropped first). */
export function step(ps: Particle[], dtMs: number): Particle[] {
  const dt = Math.min(0.05, dtMs / 1000);
  const out: Particle[] = [];
  for (const p of ps) {
    p.age += dtMs; if (p.age >= p.life) continue;
    p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; p.vy += p.gravity * dt;
    if (p.kind === 'petals' || p.kind === 'leaves' || p.kind === 'snow') p.vx += Math.sin(p.age / 260 + p.ph) * 22 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    out.push(p);
  }
  return out.length > MAX_PARTICLES ? out.slice(out.length - MAX_PARTICLES) : out;
}

export function addParticles(ps: Particle[], more: Particle[]): Particle[] {
  const all = ps.concat(more);
  return all.length > MAX_PARTICLES ? all.slice(all.length - MAX_PARTICLES) : all;
}

/** Minimal 2D-context surface we use (lets tests pass a recorder). */
export interface Ctx2D {
  save(): void; restore(): void; translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; arc(x: number, y: number, r: number, a0: number, a1: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, w: number, h: number): void; fillText(t: string, x: number, y: number): void;
  globalAlpha: number; fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; font: string; textAlign: CanvasTextAlign;
  shadowBlur: number; shadowColor: string;
}

function star(c: Ctx2D, r: number, points: number, inner: number) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = (i * Math.PI) / points - Math.PI / 2; const rr = i % 2 ? r * inner : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  c.closePath(); c.fill();
}

export function drawParticle(c: Ctx2D, p: Particle) {
  const t = p.age / p.life;
  const fade = t < .12 ? t / .12 : t > .65 ? Math.max(0, (1 - t) / .35) : 1;
  c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
  c.globalAlpha = Math.max(0, Math.min(1, fade)); c.fillStyle = colorFor(p.kind, p.hue); c.strokeStyle = c.fillStyle as string;
  const s = p.size;
  switch (p.kind) {
    case 'sparkles': star(c, s, 4, .28); break;
    case 'stars': star(c, s, 5, .45); break;
    case 'confetti': c.fillRect(-s / 2, -s / 4, s, s / 2); break;
    case 'bubbles': c.lineWidth = 1.4; c.globalAlpha *= .8; c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.stroke(); c.globalAlpha *= .25; c.fill(); break;
    case 'petals': case 'leaves': c.beginPath(); c.ellipse(0, 0, s, s * .5, 0, 0, Math.PI * 2); c.fill(); break;
    case 'hearts': c.beginPath(); c.moveTo(0, s * .35); c.bezierCurveTo(-s, -s * .2, -s * .5, -s, 0, -s * .45); c.bezierCurveTo(s * .5, -s, s, -s * .2, 0, s * .35); c.fill(); break;
    case 'fireflies': { const pulse = .55 + .45 * Math.sin(p.age / 180 + p.ph); c.globalAlpha *= pulse; c.shadowColor = '#e8ff6a'; c.shadowBlur = 10; c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.fill(); break; }
    case 'notes': c.font = `${Math.round(s * 1.6)}px serif`; c.textAlign = 'center'; c.fillText('♪', 0, 0); break;
    case 'snow': c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.fill(); break;
    case 'embers': c.shadowColor = '#ff7b00'; c.shadowBlur = 8; c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.fill(); break;
  }
  c.restore();
}
