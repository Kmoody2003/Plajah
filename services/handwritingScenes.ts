// handwritingScenes — the procedural illustrations Story Mode paints in as a child writes. Each
// fable page names a `scene`; the reader draws it here and reveals more of it per word written
// (fraction 0..1). Pure Canvas2D, no assets — CSP-safe and offline. Charming-but-simple on purpose;
// richer art can replace these later without touching the engine.

type Ctx = CanvasRenderingContext2D;
type El = (ctx: Ctx, w: number, h: number) => void;
interface Scene { bg: [string, string]; els: El[]; }

// ── little drawing helpers ──
const sun = (cx: number, cy: number, r: number, color = '#F4B942'): El => (ctx) => {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
    ctx.lineTo(cx + Math.cos(a) * (r + 15), cy + Math.sin(a) * (r + 15));
    ctx.stroke();
  }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};
const hill = (yFrac: number, color: string): El => (ctx, w, h) => {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-10, h);
  ctx.quadraticCurveTo(w * 0.5, h * yFrac, w + 10, h);
  ctx.closePath(); ctx.fill(); ctx.restore();
};
const cloud = (cx: number, cy: number, s: number): El => (ctx) => {
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [dx, dy, r] of [[0, 0, 1], [-s * 0.7, s * 0.2, 0.7], [s * 0.7, s * 0.2, 0.7], [0, s * 0.35, 0.9]])
    { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, s * (r as number), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};
const ant = (x: number, y: number, s: number, color = '#2a2118'): El => (ctx) => {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = s * 0.12;
  for (const [dx, r] of [[-s, 0.5], [0, 0.62], [s * 1.05, 0.72]])
    { ctx.beginPath(); ctx.ellipse(x + (dx as number), y, s * (r as number), s * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
  for (const d of [-0.5, 0, 0.5]) { // legs
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s * 0.6, y + s * 0.9 + d * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.6, y + s * 0.9 + d * s); ctx.stroke();
  }
  ctx.restore();
};
const grass = (x: number, baseFrac = 0.86): El => (ctx, w, h) => {
  ctx.save(); ctx.strokeStyle = '#5a9e46'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  const y = h * baseFrac;
  for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + 3, y - 12, x + dx + (dx > 0 ? 6 : -6), y - 20); ctx.stroke(); }
  ctx.restore();
};
const snow = (seed: number): El => (ctx, w, h) => {
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 14; i++) {
    const x = ((seed * 53 + i * 97) % 100) / 100 * w;
    const y = ((seed * 31 + i * 61) % 100) / 100 * h * 0.9;
    ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};
const windLine = (yFrac: number, len: number): El => (ctx, w, h) => {
  ctx.save(); ctx.strokeStyle = 'rgba(180,205,230,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const y = h * yFrac;
  ctx.beginPath(); ctx.moveTo(w * 0.1, y);
  ctx.bezierCurveTo(w * 0.4, y - 14, w * (0.4 + len), y + 14, w * (0.6 + len), y);
  ctx.stroke(); ctx.restore();
};
const person = (xFrac: number, coatColor: string): El => (ctx, w, h) => {
  const x = w * xFrac, y = h * 0.86;
  ctx.save();
  ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(x, y - 46, 9, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = coatColor; ctx.beginPath(); // coat
  ctx.moveTo(x - 12, y - 36); ctx.lineTo(x + 12, y - 36); ctx.lineTo(x + 9, y); ctx.lineTo(x - 9, y); ctx.closePath(); ctx.fill();
  ctx.restore();
};
const anthill = (xFrac: number): El => (ctx, w, h) => {
  const x = w * xFrac, y = h * 0.86;
  ctx.save(); ctx.fillStyle = '#b98a4e';
  ctx.beginPath(); ctx.ellipse(x, y, 34, 20, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3a2c18'; ctx.beginPath(); ctx.arc(x, y - 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

const SCENES: Record<string, Scene> = {
  'ant-summer':  { bg: ['#8fd0ff', '#eaf6dd'], els: [sun(0, 0, 0), hill(0.7, '#bfe39a'), ant(0, 0, 12), grass(0), grass(0), anthill(0.8)] },
  'grasshopper': { bg: ['#9bd7ff', '#eaf6dd'], els: [sun(0, 0, 0), hill(0.72, '#a9dd86'), grass(0), grass(0), grass(0), cloud(0, 0, 16)] },
  'winter':      { bg: ['#aeb9cc', '#e9edf4'], els: [hill(0.72, '#dfe6ef'), snow(1), snow(2), snow(3), anthill(0.8)] },
  'ant-cozy':    { bg: ['#3a2f26', '#5a4632'], els: [anthill(0.5), ant(0, 0, 12), ant(0, 0, 9), grass(0)] },
  'sun-wind':    { bg: ['#8fd0ff', '#eaf6dd'], els: [sun(0, 0, 0), cloud(0, 0, 16), hill(0.72, '#bfe39a'), windLine(0.35, 0.1)] },
  'wind':        { bg: ['#7f95b3', '#c9d6e6'], els: [cloud(0, 0, 18), windLine(0.3, 0.1), windLine(0.45, 0.05), windLine(0.6, 0.12), person(0.5, '#8a5a3c')] },
  'traveler':    { bg: ['#8aa0bd', '#cdd8e8'], els: [hill(0.74, '#b9c4d4'), person(0.5, '#7a4a2c'), windLine(0.4, 0.08), windLine(0.55, 0.06)] },
  'sun':         { bg: ['#ffd98a', '#fff3d6'], els: [hill(0.72, '#bfe39a'), person(0.5, '#8a5a3c'), grass(0), sun(0, 0, 0)] },
};

/** Draw `scene` into ctx, revealing els up to `fraction` (0..1). The newest element fades in. */
export function drawScene(ctx: Ctx, scene: string, fraction: number, w: number, h: number): void {
  const spec = SCENES[scene] || SCENES['sun-wind'];
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, spec.bg[0]); grad.addColorStop(1, spec.bg[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  const f = Math.max(0, Math.min(1, fraction));
  const shown = f * spec.els.length;
  const full = Math.floor(shown);
  spec.els.forEach((el, i) => {
    if (i < full) { drawEl(el, ctx, w, h, scene, i, 1); }
    else if (i === full && shown - full > 0) { drawEl(el, ctx, w, h, scene, i, shown - full); }
  });
}

// Position the abstract helpers (sun/ant/grass placeholders were created at 0,0) by index, so a
// scene's element list stays terse. Positions are derived deterministically from the element index.
function drawEl(el: El, ctx: Ctx, w: number, h: number, scene: string, i: number, alpha: number) {
  ctx.save(); ctx.globalAlpha = alpha;
  // Re-place the "at origin" helpers to sensible spots; concrete-position helpers ignore this.
  const placed = placeFor(scene, i, w, h);
  if (placed) placed(ctx, w, h); else el(ctx, w, h);
  ctx.restore();
}

// Deterministic placements for the terse origin-helpers, per scene+index.
function placeFor(scene: string, i: number, w: number, h: number): El | null {
  const S: Record<string, (El | null)[]> = {
    'ant-summer':  [sun(w * 0.82, h * 0.22, 20), null, ant(w * 0.34, h * 0.78, 13), grass(w * 0.62), grass(w * 0.2), null],
    'grasshopper': [sun(w * 0.82, h * 0.22, 20), null, grass(w * 0.28), grass(w * 0.5), grass(w * 0.72), cloud(w * 0.28, h * 0.24, 16)],
    'winter':      [null, null, null, null, null],
    'ant-cozy':    [null, ant(w * 0.4, h * 0.72, 14), ant(w * 0.6, h * 0.78, 10), grass(w * 0.75, 0.9)],
    'sun-wind':    [sun(w * 0.8, h * 0.24, 20), cloud(w * 0.28, h * 0.26, 15), null, null],
    'wind':        [cloud(w * 0.3, h * 0.25, 18), null, null, null, null],
    'traveler':    [null, null, null, null],
    'sun':         [null, null, grass(w * 0.7), sun(w * 0.8, h * 0.22, 22)],
  };
  const row = S[scene];
  return row ? (row[i] ?? null) : null;
}
