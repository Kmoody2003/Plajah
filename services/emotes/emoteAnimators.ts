// emoteAnimators — gives the vector collections a life of their own when they're shown BIG
// (on-stream bursts, picker hover, jumbo chat, chorus). Chat-size (28 px) stays still on purpose.
//
// Each animator takes the emote's single rasterised frame and bakes a short seamless loop:
//   neon   the tube flickers like real neon: mains hum in the glow, a cold-start double blink at
//          the top of the loop, and one band of the sign (a "letter") that stutters on its own
//          while the rest stays lit — the classic failing-tube look.
//   sheen  gold catches the light: a soft diagonal band sweeps across (clipped to the shape), then
//          star glints pop on the brightest highlights, one after another.
//   boil   riso/zine stop-motion: the print redraws itself at 8 fps with a hair of rotation and
//          offset (a "boiling" hand-made line), the inks slip out of register and back, and the
//          sticker slaps down with a squash at the start of the loop.
//   spot   the follow-spot is alive: the beam breathes like a carbon arc, dust motes drift through
//          the light from the top-left, and a soft hot spot wanders a little, as if the operator
//          is tracking the performer.
//
// Frames are deterministic (seeded by the emote id) so every viewer sees the same performance.

export type SvgAnim = 'neon' | 'sheen' | 'boil' | 'spot';

export interface AnimSpec { duration: number; fps: number }
const SPEC: Record<SvgAnim, AnimSpec> = {
  neon: { duration: 2.4, fps: 12 },
  sheen: { duration: 2.6, fps: 12 },
  boil: { duration: 1.5, fps: 8 },
  spot: { duration: 3.0, fps: 10 },
};

/** Frame budget: big bakes get fewer frames (memory), never fewer than 8. */
function frameCount(a: SvgAnim, size: number): { n: number; fps: number } {
  const s = SPEC[a];
  const cap = size >= 256 ? 16 : size >= 160 ? 24 : 36;
  const n = Math.max(8, Math.min(cap, Math.round(s.duration * s.fps)));
  return { n, fps: n / s.duration };
}

function seedOf(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };

export function bakeSvgAnimation(base: HTMLCanvasElement, anim: SvgAnim, size: number, id: string): { frames: HTMLCanvasElement[]; fps: number } {
  const { n, fps } = frameCount(anim, size);
  const r = rng(seedOf(id));
  const make = { neon, sheen, boil, spot }[anim];
  const step = make(base, size, r);
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < n; i++) {
    const out = canvas(size), g = out.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    step(g, i / n);
    frames.push(out);
  }
  return { frames, fps };
}

type Step = (g: CanvasRenderingContext2D, k: number) => void;   // k = loop phase 0..1

// ── neon ─────────────────────────────────────────────────────────────────────────────────────────
function neon(base: HTMLCanvasElement, size: number, r: () => number): Step {
  // unlit glass: the same tube, dark and desaturated, its halo almost gone
  const off = canvas(size), og = off.getContext('2d')!;
  og.filter = 'saturate(0.25) brightness(0.32)'; og.drawImage(base, 0, 0); og.filter = 'none';
  // bloom layer for the hum
  const bloom = canvas(size), bg = bloom.getContext('2d')!;
  bg.filter = `blur(${Math.max(1, size / 40)}px) brightness(1.4)`; bg.drawImage(base, 0, 0); bg.filter = 'none';
  // the stuttering band: one vertical slice of the sign (a letter on GG / LIVE / OK, a segment on a glyph)
  const bw = 0.28 + r() * 0.22, bx = 0.08 + r() * (0.84 - bw);
  const stutterAt = 0.45 + r() * 0.25;                  // when in the loop the bad tube acts up
  const pattern = [1, 0, 1, 1, 0, 0, 1, 0.3, 1];        // its little stammer (per frame-ish)
  return (g, k) => {
    // cold-start double blink at the top of the loop, then steady with hum
    let lit = 1;
    if (k < 0.04) lit = 0.15; else if (k < 0.07) lit = 1; else if (k < 0.1) lit = 0.25;
    const hum = 0.92 + 0.08 * Math.sin(k * Math.PI * 2 * 9);
    const whole = lit * hum;
    // band stammer
    const d = k - stutterAt;
    const band = d >= 0 && d < 0.22 ? pattern[Math.floor((d / 0.22) * pattern.length)] : 1;
    const drawLit = (alpha: number, clip?: [number, number]) => {
      g.save();
      if (clip) { g.beginPath(); g.rect(clip[0] * size, 0, (clip[1] - clip[0]) * size, size); g.clip(); }
      g.globalAlpha = 1; g.drawImage(off, 0, 0);
      g.globalAlpha = alpha; g.drawImage(base, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * 0.35 * hum; g.drawImage(bloom, 0, 0);
      g.restore();
    };
    // outside the band
    g.save(); g.beginPath(); g.rect(0, 0, bx * size, size); g.rect((bx + bw) * size, 0, size, size); g.clip(); drawLit(whole); g.restore();
    drawLit(whole * band, [bx, bx + bw]);
  };
}

// ── gilded sheen ─────────────────────────────────────────────────────────────────────────────────
function sheen(base: HTMLCanvasElement, size: number, r: () => number): Step {
  // find bright, well-spaced highlight pixels for the glints
  const px = base.getContext('2d')!.getImageData(0, 0, size, size).data;
  const cand: [number, number, number][] = [];
  const stride = Math.max(1, Math.floor(size / 48));
  for (let y = 0; y < size; y += stride) for (let x = 0; x < size; x += stride) {
    const i = (y * size + x) * 4;
    if (px[i + 3] < 200) continue;
    const lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    if (lum > 200 && px[i] > px[i + 2] + 20) cand.push([x, y, lum]);   // warm highlights = gold
  }
  cand.sort((a, b) => b[2] - a[2]);
  const glints: { x: number; y: number; at: number }[] = [];
  for (const [x, y] of cand) {
    if (glints.length >= 3) break;
    if (glints.every(q => Math.hypot(q.x - x, q.y - y) > size * 0.22)) glints.push({ x, y, at: 0.42 + glints.length * 0.14 + r() * 0.05 });
  }
  const tmp = canvas(size), tg = tmp.getContext('2d')!;
  return (g, k) => {
    g.drawImage(base, 0, 0);
    // sweep: a diagonal band crossing between k = 0.02 .. 0.4
    const s = (k - 0.02) / 0.38;
    if (s > 0 && s < 1) {
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, size, size);
      tg.drawImage(base, 0, 0);
      tg.globalCompositeOperation = 'source-in';           // light only where there is gold
      const cx = -size * 0.4 + s * size * 1.8;
      const grad = tg.createLinearGradient(cx - size * 0.22, 0, cx + size * 0.22, 0);
      grad.addColorStop(0, 'rgba(255,248,225,0)'); grad.addColorStop(0.5, 'rgba(255,250,232,0.75)'); grad.addColorStop(1, 'rgba(255,248,225,0)');
      tg.translate(size / 2, size / 2); tg.rotate(-0.42); tg.translate(-size / 2, -size / 2);
      tg.fillStyle = grad; tg.fillRect(-size, -size, size * 3, size * 3);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85; g.drawImage(tmp, 0, 0); g.restore();
    }
    // glints
    for (const q of glints) {
      const t = (k - q.at) / 0.12;
      if (t <= 0 || t >= 1) continue;
      const a = Math.sin(t * Math.PI), len = size * (0.07 + 0.09 * a);
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(q.x, q.y); g.rotate(t * 0.8);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, len);
      rg.addColorStop(0, `rgba(255,255,245,${0.95 * a})`); rg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = rg;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const ang = (i * Math.PI) / 4, rr = i % 2 ? len * 0.16 : len; g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      g.closePath(); g.fill(); g.restore();
    }
  };
}

// ── riso boil ────────────────────────────────────────────────────────────────────────────────────
function boil(base: HTMLCanvasElement, size: number, r: () => number): Step {
  // three hand-drawn "takes" the loop steps through, like a stop-motion redraw
  const takes = [0, 1, 2].map(() => ({ rot: (r() - 0.5) * 0.045, dx: (r() - 0.5) * size * 0.018, dy: (r() - 0.5) * size * 0.018, sx: 1 + (r() - 0.5) * 0.02 }));
  // a pink-ink ghost for the misregistration slip
  const ink = canvas(size), ig = ink.getContext('2d')!;
  ig.drawImage(base, 0, 0); ig.globalCompositeOperation = 'source-in'; ig.fillStyle = '#FF48B0'; ig.fillRect(0, 0, size, size);
  return (g, k) => {
    const take = takes[Math.floor(k * 12) % 3];
    // slap: squash + overshoot over the first 18% of the loop
    let sc = 1, sy = 1;
    if (k < 0.18) { const t = k / 0.18; sc = 1.16 - 0.16 * t + Math.sin(t * Math.PI) * 0.05; sy = 1 - 0.1 * Math.sin(t * Math.PI); }
    const slip = Math.max(0, Math.sin(k * Math.PI * 2)) * size * 0.025;   // inks drift apart mid-loop and come back
    g.save();
    g.translate(size / 2 + take.dx, size / 2 + take.dy); g.rotate(take.rot); g.scale(sc * take.sx, sc * sy); g.translate(-size / 2, -size / 2);
    if (slip > 0.3) { g.globalAlpha = 0.55; g.globalCompositeOperation = 'multiply'; g.drawImage(ink, slip, -slip * 0.6); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    g.drawImage(base, 0, 0);
    g.restore();
  };
}

// ── spotlight ────────────────────────────────────────────────────────────────────────────────────
function spot(base: HTMLCanvasElement, size: number, r: () => number): Step {
  // dust motes drifting down the beam from the top-left (they loop: positions wrap with k)
  const motes = Array.from({ length: Math.round(10 + size / 24) }, () => ({ u: r(), v: r(), s: 0.004 + r() * 0.01, sp: 0.5 + r() * 0.8, tw: r() * Math.PI * 2 }));
  const tmp = canvas(size), tg = tmp.getContext('2d')!;
  return (g, k) => {
    g.drawImage(base, 0, 0);
    // carbon-arc breathing + a wandering hot spot, clipped to the emote's own pixels
    const breath = 0.5 + 0.5 * Math.sin(k * Math.PI * 2) * 0.6 + 0.2 * Math.sin(k * Math.PI * 2 * 5 + 1);
    const hx = size * (0.48 + 0.08 * Math.sin(k * Math.PI * 2)), hy = size * (0.5 + 0.05 * Math.cos(k * Math.PI * 2));
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, size, size); tg.drawImage(base, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    const rg = tg.createRadialGradient(hx, hy, 0, hx, hy, size * 0.42);
    rg.addColorStop(0, `rgba(255,236,200,${0.28 * breath})`); rg.addColorStop(1, 'rgba(255,236,200,0)');
    tg.fillStyle = rg; tg.fillRect(0, 0, size, size);
    g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(tmp, 0, 0); g.restore();
    // motes: travel along the beam axis (top-left → centre), twinkle as they cross the light
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const t = (m.u + k * m.sp) % 1;
      const x = size * (0.12 + t * 0.62 + (m.v - 0.5) * 0.28 * (0.4 + t));
      const y = size * (0.04 + t * 0.66 + (m.v - 0.5) * 0.12);
      const a = Math.sin(t * Math.PI) * (0.45 + 0.55 * Math.abs(Math.sin(m.tw + k * Math.PI * 6)));
      g.fillStyle = `rgba(255,240,210,${(0.55 * a).toFixed(3)})`;
      g.beginPath(); g.arc(x, y, Math.max(0.6, m.s * size), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
}
