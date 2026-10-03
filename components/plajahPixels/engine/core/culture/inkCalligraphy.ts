/**
 * Sumi brush engine for the Japanese Ink scene: writes real kanji in correct stroke order and paints
 * sumi-e (ensō, bamboo, mountain washes), then stamps a vermilion hanko seal.
 *
 * Strokes are authored as polylines (kanji in a unit glyph box, v pointing down), smoothed with
 * Catmull-Rom and walked by arc length. Every stroke has a calligraphic profile — a pressed entry
 * (the brush lands at an angle), the body, and one of the classic endings:
 *   tome  — stop: the brush presses and lifts in place
 *   hane  — hook: a quick flick off the end
 *   harai — sweep: the stroke thins to a point and breaks into dry-brush streaks
 *   dot   — a short teardrop
 *   leaf  — bamboo leaf: thin → full → point
 * The brush is a row of bristles, each with its own ink load, stamped as short segments across the
 * stroke width on a 2D canvas (black ink, red seal) that the paper shader reads as a texture. As the
 * load runs out, bristles skip and the stroke turns into dry-brush streaks (kasure).
 *
 * Canvas space = the visible frame: x 0..ASP, y 0..1 (y up), matching the paper shader's P.
 */

type Pt = [number, number];
type Kind = 'tome' | 'hane' | 'harai' | 'dot' | 'leaf' | 'enso' | 'wash';
export interface BStroke { pts: Pt[]; kind: Kind; w: number; ink: number; speed: number }

// ── kanji, stroke by stroke (unit box, v down), in standard stroke order ──
const K: Record<string, [Pt[], Kind][]> = {
  '山': [
    [[[0.5, 0.1], [0.5, 0.78]], 'tome'],
    [[[0.16, 0.36], [0.16, 0.6], [0.165, 0.82], [0.5, 0.825], [0.84, 0.82]], 'tome'],
    [[[0.84, 0.34], [0.84, 0.6], [0.84, 0.86]], 'tome'],
  ],
  '川': [
    [[[0.2, 0.1], [0.22, 0.42], [0.18, 0.7], [0.07, 0.92]], 'harai'],
    [[[0.5, 0.22], [0.5, 0.48], [0.5, 0.72]], 'tome'],
    [[[0.82, 0.06], [0.82, 0.5], [0.82, 0.94]], 'tome'],
  ],
  '心': [
    [[[0.2, 0.44], [0.13, 0.66]], 'dot'],
    [[[0.34, 0.28], [0.34, 0.6], [0.36, 0.8], [0.46, 0.88], [0.7, 0.87], [0.78, 0.82], [0.84, 0.66]], 'hane'],
    [[[0.5, 0.2], [0.6, 0.4]], 'dot'],
    [[[0.78, 0.34], [0.9, 0.56]], 'dot'],
  ],
  '水': [
    [[[0.5, 0.06], [0.5, 0.5], [0.5, 0.9], [0.4, 0.82]], 'hane'],
    [[[0.12, 0.36], [0.39, 0.35], [0.26, 0.6], [0.08, 0.8]], 'harai'],
    [[[0.84, 0.24], [0.72, 0.38], [0.58, 0.5]], 'harai'],
    [[[0.58, 0.48], [0.74, 0.66], [0.94, 0.86]], 'harai'],
  ],
  '月': [
    [[[0.26, 0.1], [0.26, 0.5], [0.22, 0.74], [0.1, 0.92]], 'harai'],
    [[[0.26, 0.1], [0.78, 0.1], [0.78, 0.5], [0.78, 0.9], [0.66, 0.83]], 'hane'],
    [[[0.26, 0.36], [0.78, 0.36]], 'tome'],
    [[[0.26, 0.6], [0.78, 0.6]], 'tome'],
  ],
  '人': [
    [[[0.5, 0.06], [0.45, 0.42], [0.3, 0.72], [0.08, 0.92]], 'harai'],
    [[[0.47, 0.44], [0.66, 0.7], [0.94, 0.9]], 'harai'],
  ],
  '竹': [
    [[[0.3, 0.08], [0.22, 0.2], [0.1, 0.34]], 'harai'],
    [[[0.2, 0.27], [0.46, 0.26]], 'tome'],
    [[[0.33, 0.27], [0.33, 0.6], [0.33, 0.92]], 'tome'],
    [[[0.76, 0.08], [0.68, 0.2], [0.56, 0.34]], 'harai'],
    [[[0.64, 0.27], [0.94, 0.26]], 'tome'],
    [[[0.79, 0.27], [0.79, 0.6], [0.79, 0.92], [0.7, 0.85]], 'hane'],
  ],
};

/** Place a kanji's strokes: top-left-centred box at (cx, cy) in P space (y up), size s. */
function glyph(ch: string, cx: number, cy: number, s: number, w = 0.1, speed = 1): BStroke[] {
  return (K[ch] || []).map(([pts, kind]) => ({
    pts: pts.map(([u, v]) => [cx + (u - 0.5) * s, cy - (v - 0.5) * s] as Pt),
    kind, w: w * s, ink: 1, speed,
  }));
}

function enso(cx: number, cy: number, r: number): BStroke {
  const pts: Pt[] = [];
  for (let k = 0; k <= 40; k++) { const a = -2.1 - (k / 40) * Math.PI * 1.86; const rr = r * (1 + 0.04 * Math.sin(k * 0.6)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.02]); }
  return { pts, kind: 'enso', w: r * 0.26, ink: 1, speed: 2.4 };
}

function bamboo(x0: number, yBot: number, h: number, lean: number, w: number): BStroke[] {
  const out: BStroke[] = [];
  const segs = 3, seg = h / segs;
  for (let k = 0; k < segs; k++) {
    const y0 = yBot + k * seg + 0.012, y1 = yBot + (k + 1) * seg - 0.012;
    const xa = x0 + lean * (y0 - yBot), xb = x0 + lean * (y1 - yBot);
    out.push({ pts: [[xa, y0], [(xa + xb) / 2 + 0.003, (y0 + y1) / 2], [xb, y1]], kind: 'tome', w, ink: 0.85, speed: 2.4 });
  }
  for (let k = 1; k < segs; k++) {   // nodes
    const y = yBot + k * seg, x = x0 + lean * (y - yBot);
    out.push({ pts: [[x - w * 0.7, y + 0.004], [x, y - 0.004], [x + w * 0.7, y + 0.003]], kind: 'tome', w: w * 0.35, ink: 1, speed: 2 });
  }
  return out;
}

function leaves(x: number, y: number, dirs: number[], len: number): BStroke[] {
  return dirs.map((d, i) => {
    const L = len * (0.8 + 0.4 * ((i * 7) % 3) / 2);
    const ex = x + Math.cos(d) * L, ey = y + Math.sin(d) * L;
    const mx = x + Math.cos(d + 0.18) * L * 0.5, my = y + Math.sin(d + 0.18) * L * 0.5;
    return { pts: [[x, y], [mx, my], [ex, ey]] as Pt[], kind: 'leaf' as Kind, w: len * 0.34, ink: 1, speed: 2.4 };
  });
}

function ridge(x0: number, x1: number, base: number, peaks: [number, number][], w: number, ink: number): BStroke {
  const pts: Pt[] = [];
  for (let k = 0; k <= 30; k++) {
    const x = x0 + (x1 - x0) * k / 30;
    let y = base;
    for (const [px, ph] of peaks) y += ph * Math.exp(-((x - px) ** 2) / (2 * (ph * 0.9) ** 2));
    pts.push([x, y + 0.006 * Math.sin(k * 1.7)]);
  }
  return { pts, kind: 'wash', w, ink, speed: 2.2 };
}

export interface Composition { name: string; strokes: BStroke[]; seal: { x: number; y: number; s: number; ch: string } }

/** The works the brush paints, cycling each time the brush moment comes round. */
export function compositions(ASP: number): Composition[] {
  const colX = ASP - 0.32;
  return [
    { name: 'ensō · 山水', strokes: [enso(0.7, 0.5, 0.3), ...glyph('山', colX, 0.74, 0.32), ...glyph('水', colX, 0.38, 0.32)], seal: { x: colX, y: 0.12, s: 0.075, ch: '心' } },
    {
      name: 'bamboo · 竹', strokes: [
        ...bamboo(0.5, 0.06, 0.86, 0.06, 0.034), ...bamboo(0.74, 0.04, 0.62, -0.05, 0.026),
        ...leaves(0.55, 0.62, [2.3, 2.75, 3.3, 1.9], 0.2), ...leaves(0.7, 0.5, [0.5, 0.05, -0.35], 0.18), ...leaves(0.52, 0.34, [2.6, 3.1], 0.15),
        ...glyph('竹', colX, 0.6, 0.36),
      ], seal: { x: colX, y: 0.3, s: 0.075, ch: '竹' },
    },
    {
      name: 'mountains · 山川', strokes: [
        ridge(0.05, 1.3, 0.4, [[0.35, 0.22], [0.72, 0.3], [1.05, 0.16]], 0.03, 0.28),
        ridge(0.12, 1.25, 0.28, [[0.5, 0.15], [0.92, 0.2]], 0.03, 0.5),
        ridge(0.0, 1.05, 0.14, [[0.25, 0.1], [0.62, 0.08]], 0.035, 0.85),
        ...glyph('山', colX, 0.76, 0.3), ...glyph('川', colX, 0.42, 0.3),
      ], seal: { x: colX, y: 0.16, s: 0.075, ch: '山' },
    },
    { name: '心', strokes: glyph('心', ASP * 0.46, 0.5, 0.78, 0.085, 0.8), seal: { x: ASP * 0.8, y: 0.2, s: 0.08, ch: '心' } },
    { name: '水', strokes: glyph('水', ASP * 0.46, 0.5, 0.78, 0.08, 0.8), seal: { x: ASP * 0.8, y: 0.2, s: 0.08, ch: '水' } },
    { name: '月 · 人', strokes: [...glyph('月', ASP * 0.32, 0.52, 0.58, 0.08, 0.85), ...glyph('人', ASP * 0.66, 0.5, 0.58, 0.08, 0.85)], seal: { x: ASP * 0.88, y: 0.18, s: 0.07, ch: '月' } },
  ];
}

// Catmull-Rom resample of a polyline into ~even arc-length samples.
function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const dense: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = 16;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const out: Pt[] = [dense[0]]; let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (acc >= step) { out.push(dense[i]); acc = 0; }
  }
  if (out[out.length - 1] !== dense[dense.length - 1]) out.push(dense[dense.length - 1]);
  return out;
}

/** Width multiplier along a stroke (s 0..1) for each ending. */
function profile(kind: Kind, s: number) {
  const entry = 1 + 0.35 * Math.exp(-s * 26);                    // the pressed landing
  switch (kind) {
    case 'tome': return entry * (0.92 + 0.22 * Math.exp(-(1 - s) * 22));     // press at the stop
    case 'hane': return entry * (s < 0.8 ? 1 : Math.max(0.05, 1 - (s - 0.8) / 0.2 * 0.95));
    case 'harai': return entry * Math.max(0.03, 1 - Math.pow(s, 1.6) * 0.97);
    case 'dot': return Math.sin(Math.min(1, s * 1.15) * Math.PI) * 0.9 + 0.35 * (1 - s);
    case 'wash': return Math.min(1, s * 10, (1 - s) * 6) * (0.85 + 0.15 * Math.sin(s * 19));
    case 'enso': return entry * (s < 0.82 ? 1 - 0.12 * s : Math.max(0.05, 0.9 * (1 - (s - 0.82) / 0.18)));
    case 'leaf': return Math.max(0.04, Math.sin(Math.min(1, s) * Math.PI) * (1 - 0.35 * s));
  }
}

const BR = 22;   // bristles across the brush

export class InkCalligraphy {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: any;
  private CW: number; private CH: number; private ASP: number;
  private works: Composition[]; private workI = 0;
  private queue: { pts: Pt[]; len: number; kind: Kind; w: number; ink: number; speed: number }[] = [];
  private si = 0; private pos = 0; private lift = 0; private load = 1; private sealDone = true; private sealT = 0;
  private seal: Composition['seal'] | null = null;
  private bl = new Float32Array(BR); private bo = new Float32Array(BR);
  private dirty = false; private seed = 11;
  /** Current brush tip (P space), travel direction, whether the brush is on the paper, and pressure. */
  tip: Pt | null = null; dir = 0; down = false; press = 0; done = true; name = '';

  constructor(THREE: any, ASP: number, w = 1280) {
    this.ASP = ASP; this.CW = w; this.CH = Math.round(w / ASP);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.CW; this.canvas.height = this.CH;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.lineCap = 'round';
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter; this.texture.generateMipmaps = false;
    this.works = compositions(ASP);
    for (let i = 0; i < BR; i++) this.bo[i] = (i / (BR - 1)) * 2 - 1;
  }
  private rnd() { return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647; }
  private px(p: Pt): Pt { return [p[0] / this.ASP * this.CW, (1 - p[1]) * this.CH]; }

  clear() { this.ctx.clearRect(0, 0, this.CW, this.CH); this.dirty = true; }
  /** Fade what's on the paper (multiply alpha by k). */
  fade(k: number) {
    const c = this.ctx; c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = `rgba(0,0,0,${Math.min(1, Math.max(0, 1 - k))})`;
    c.fillRect(0, 0, this.CW, this.CH); c.restore(); this.dirty = true;
  }

  /** Begin the next composition (or a specific one). */
  start(which?: number) {
    const w = this.works[(which ?? this.workI++) % this.works.length];
    this.name = w.name;
    this.queue = w.strokes.map(s => {
      const pts = resample(s.pts, 0.004);
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return { pts, len, kind: s.kind, w: s.w, ink: s.ink, speed: s.speed };
    });
    this.si = 0; this.pos = 0; this.lift = 0.25; this.load = 1; this.done = false; this.sealDone = false; this.sealT = 0; this.seal = w.seal;
    this.dipBristles();
  }
  private dipBristles() { for (let i = 0; i < BR; i++) this.bl[i] = 0.75 + this.rnd() * 0.5; this.load = 1; }

  private at(st: { pts: Pt[]; len: number }, d: number): { p: Pt; dir: number } {
    const pts = st.pts, n = pts.length;
    const f = Math.max(0, Math.min(n - 1.0001, d / Math.max(st.len, 1e-6) * (n - 1)));
    const i = Math.floor(f), t = f - i, a = pts[i], b = pts[Math.min(n - 1, i + 1)];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }

  /**
   * Advance the brush. `rate` scales speed (voice/energy), `pressure` 0..1 thickens strokes, `nudge`
   * (a kick) ends a pause between strokes early. Returns wet points laid this frame (for the fluid bleed).
   */
  update(dt: number, rate: number, pressure: number, nudge: boolean): { p: Pt; w: number; ink: number }[] {
    const wet: { p: Pt; w: number; ink: number }[] = [];
    this.press = pressure;
    if (this.done) { this.down = false; this.flush(); return wet; }
    if (this.si >= this.queue.length) {
      // all strokes laid: stamp the seal, then the brush leaves
      this.down = false; this.tip = null; this.sealT += dt;
      if (!this.sealDone && (this.sealT > 0.7 || (nudge && this.sealT > 0.2))) { this.stampSeal(); this.sealDone = true; }
      if (this.sealDone) this.done = true;
      this.flush(); return wet;
    }
    const st = this.queue[this.si];
    if (this.lift > 0) {
      this.lift -= dt * (nudge ? 6 : 1);
      this.down = false; const s0 = this.at(st, 0); this.tip = s0.p; this.dir = s0.dir;
      this.flush(); return wet;
    }
    const c = this.ctx;
    const speed = 0.56 * st.speed * rate;
    let remaining = speed * dt;
    const step = 0.0025;
    for (let guard = 0; guard < 400 && remaining > 1e-6 && this.pos < st.len; guard++) {
      const d0 = this.pos, d1 = Math.min(st.len, this.pos + Math.min(step, remaining));
      if (d1 - d0 <= 1e-9) { this.pos = st.len; break; }      // float floor: finish the stroke rather than spin
      remaining -= d1 - d0; this.pos = d1;
      const A = this.at(st, d0), B = this.at(st, d1);
      const s = d1 / st.len;
      const prof = profile(st.kind, s);
      const w = st.w * prof * (0.75 + 0.45 * pressure);
      const nx = -Math.sin(B.dir), ny = Math.cos(B.dir);
      // ink depletes with distance; harai / hane ends run dry
      this.load = Math.max(0, this.load - (d1 - d0) * (st.kind === 'enso' ? 0.16 : 0.32 + (st.kind === 'harai' ? 0.5 * s : 0)));
      const dryEnd = st.kind === 'harai' || st.kind === 'hane' ? Math.max(0, (s - 0.55) / 0.45) : st.kind === 'enso' ? Math.max(0, (s - 0.8) / 0.2) : 0;
      const pa = this.px(A.p), pb = this.px(B.p);
      const wpx = w * this.CH;
      if (st.kind === 'wash') {
        const depth = 0.3 * this.CH, g = c.createLinearGradient(0, Math.min(pa[1], pb[1]), 0, Math.min(pa[1], pb[1]) + depth);
        g.addColorStop(0, `rgba(0,0,0,${(0.16 * st.ink * prof).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.lineTo(pb[0], pb[1] + depth); c.lineTo(pa[0], pa[1] + depth); c.closePath(); c.fill();
      }
      c.lineWidth = Math.max(0.8, wpx / BR * 2.2);
      for (let i = 0; i < BR; i++) {
        const o = this.bo[i] * 0.5 * wpx;
        const ld = this.bl[i] * (0.35 + this.load * 0.85) - dryEnd * 0.9;
        // dry brush: bristles skip in streaks along the stroke (hash on bristle + position)
        const h = Math.sin((i * 12.9898 + Math.floor(d1 * 260) * 78.233)) * 43758.5453; const r = h - Math.floor(h);
        if (r > ld + 0.25) continue;
        const a = Math.min(1, Math.max(0.05, ld)) * st.ink * st.ink * (st.kind === 'wash' ? 0.35 : 1) * (0.55 + 0.45 * (1 - Math.abs(this.bo[i]) * 0.5));
        c.strokeStyle = `rgba(0,0,0,${a.toFixed(3)})`;
        c.beginPath(); c.moveTo(pa[0] + nx * o, pa[1] - ny * o); c.lineTo(pb[0] + nx * o, pb[1] - ny * o); c.stroke();
      }
      // a soft core so the stroke body is solid where the brush is loaded
      if (this.load > 0.25 && dryEnd < 0.6 && st.kind !== 'wash') {
        c.lineWidth = wpx * 0.7; c.strokeStyle = `rgba(0,0,0,${(0.5 * st.ink * Math.min(1, this.load + 0.2) * (1 - dryEnd)).toFixed(3)})`;
        c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.stroke();
      }
      wet.push({ p: B.p, w, ink: st.ink * (1 - dryEnd) });
      this.tip = B.p; this.dir = B.dir; this.down = true; this.dirty = true;
    }
    if (this.pos >= st.len) {
      this.si++; this.pos = 0; this.lift = 0.12 + this.rnd() * 0.12; this.down = false;
      if (this.si % 3 === 0) this.dipBristles();
      else for (let i = 0; i < BR; i++) this.bl[i] = Math.min(1.2, this.bl[i] + 0.15);
      this.load = Math.min(1, this.load + 0.45);
    }
    this.flush();
    return wet;
  }

  private stampSeal() {
    if (!this.seal) return;
    const c = this.ctx, [x, y] = this.px([this.seal.x, this.seal.y]), s = this.seal.s * this.CH;
    c.save();
    c.fillStyle = 'rgba(255,0,0,0.92)';
    const r = s * 0.12;
    c.beginPath(); c.moveTo(x - s / 2 + r, y - s / 2); c.lineTo(x + s / 2 - r, y - s / 2); c.quadraticCurveTo(x + s / 2, y - s / 2, x + s / 2, y - s / 2 + r);
    c.lineTo(x + s / 2, y + s / 2 - r); c.quadraticCurveTo(x + s / 2, y + s / 2, x + s / 2 - r, y + s / 2); c.lineTo(x - s / 2 + r, y + s / 2);
    c.quadraticCurveTo(x - s / 2, y + s / 2, x - s / 2, y + s / 2 - r); c.lineTo(x - s / 2, y - s / 2 + r); c.quadraticCurveTo(x - s / 2, y - s / 2, x - s / 2 + r, y - s / 2); c.fill();
    // carve the character (and a thin border) out of the seal
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = Math.max(1, s * 0.05); c.strokeRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8);
    c.fillStyle = 'rgba(0,0,0,0.95)'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(s * 0.66)}px "Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","Noto Serif CJK JP","MS Mincho",serif`;
    c.fillText(this.seal.ch, x, y + s * 0.03);
    // stamp texture: a few unpressed specks
    for (let i = 0; i < 26; i++) { c.fillRect(x - s / 2 + this.rnd() * s, y - s / 2 + this.rnd() * s, 1 + this.rnd() * 2, 1 + this.rnd() * 2); }
    c.restore();
    this.dirty = true;
  }

  private flush() { if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; } }
  dispose() { this.texture.dispose(); }
}
