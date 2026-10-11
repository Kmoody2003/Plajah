// pathData — SVG path `d` parse (the full grammar, arcs converted to cubics) and serialise.
//
// The parser accepts everything browsers do: implicit command repetition, packed numbers
// ("1.5.5", "-1-2", "1e-3"), packed arc flags ("a1 1 0 0110 10"), commands after Z that
// start at the last subpath start, S/T reflection. Output is the canonical model; arcs
// become ≤90° cubic segments (max error ~2.7e-4 of the radius).
import type { Vec } from './vec';
import type { Anchor, CompoundPath, FillRule, SubPath } from './model';
import { inferKind, subpathCurves } from './model';
import { fmt } from './vec';

/** Cursor scanner over a `d` string: numbers, single-char arc flags and command letters. */
class Scanner {
  i = 0;
  constructor(readonly d: string) {}
  ws() { const d = this.d; while (this.i < d.length && /[\s,]/.test(d[this.i])) this.i++; }
  done() { this.ws(); return this.i >= this.d.length; }
  peekCmd(): string | null { this.ws(); const c = this.d[this.i]; return c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c) ? c : null; }
  hasNum() { this.ws(); const c = this.d[this.i]; return !!c && /[0-9.+-]/.test(c); }
  num(): number {
    this.ws(); const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.d.slice(this.i, this.i + 80));
    if (!m) throw new Error('expected number'); this.i += m[0].length; return parseFloat(m[0]);
  }
  flag(): boolean { this.ws(); const c = this.d[this.i]; if (c !== '0' && c !== '1') throw new Error('expected flag'); this.i++; return c === '1'; }
}

/** Convert an SVG elliptical arc to cubic segments (absolute coordinates). Returns [c1, c2, end] triples. */
export function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Array<[Vec, Vec, Vec]> {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx < 1e-12 || ry < 1e-12) return [[{ x: x1 + (x2 - x1) / 3, y: y1 + (y2 - y1) / 3 }, { x: x1 + (x2 - x1) * 2 / 3, y: y1 + (y2 - y1) * 2 / 3 }, { x: x2, y: y2 }]];
  const phi = phiDeg * Math.PI / 180, cs = Math.cos(phi), sn = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cs * dx + sn * dy, y1p = -sn * dx + cs * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (large === sweep) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2, cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI; else if (sweep && dth < 0) dth += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)); const d = dth / segs;
  const k = 4 / 3 * Math.tan(d / 4); const out: Array<[Vec, Vec, Vec]> = [];
  const P = (t: number) => { const x = rx * Math.cos(t), y = ry * Math.sin(t); return { x: cs * x - sn * y + cx, y: sn * x + cs * y + cy }; };
  const D = (t: number) => { const x = -rx * Math.sin(t), y = ry * Math.cos(t); return { x: cs * x - sn * y, y: sn * x + cs * y }; };
  for (let i = 0; i < segs; i++) {
    const a = th1 + i * d, b = a + d; const pa = P(a), pb = i === segs - 1 ? { x: x2, y: y2 } : P(b), da = D(a), db = D(b);
    out.push([{ x: pa.x + k * da.x, y: pa.y + k * da.y }, { x: pb.x - k * db.x, y: pb.y - k * db.y }, pb]);
  }
  return out;
}

/** Parse an SVG path `d` into a compound path. */
export function parsePathData(d: string, fillRule: FillRule = 'nonzero'): CompoundPath {
  const sc = new Scanner(d); const subpaths: SubPath[] = [];
  let cur: Anchor[] | null = null; let cx = 0, cy = 0, sx = 0, sy = 0;
  let lastC: Vec | null = null, lastQ: Vec | null = null; let cmd = '';
  const start = (x: number, y: number) => { cur = [{ x, y }]; subpaths.push({ anchors: cur, closed: false }); sx = x; sy = y; };
  const ensure = () => { if (!cur) start(cx, cy); };
  const lineTo = (x: number, y: number) => { ensure(); cur!.push({ x, y }); cx = x; cy = y; };
  const cubicTo = (c1: Vec, c2: Vec, x: number, y: number) => { ensure(); const prev = cur![cur!.length - 1]; prev.hout = c1; cur!.push({ x, y, hin: c2 }); cx = x; cy = y; };
  try {
    while (!sc.done()) {
      const c = sc.peekCmd();
      if (c) { cmd = c; sc.i++; } else if (!cmd || !sc.hasNum()) { sc.i++; continue; }
      const rel = cmd !== 'z' && cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const bx = () => rel ? cx : 0, by = () => rel ? cy : 0;
      switch (C) {
        case 'M': { const x = sc.num() + bx(), y = sc.num() + by(); start(x, y); cx = x; cy = y; lastC = lastQ = null; cmd = rel ? 'l' : 'L'; break; }
        case 'L': { const x = sc.num() + bx(), y = sc.num() + by(); lineTo(x, y); lastC = lastQ = null; break; }
        case 'H': { lineTo(sc.num() + bx(), cy); lastC = lastQ = null; break; }
        case 'V': { lineTo(cx, sc.num() + by()); lastC = lastQ = null; break; }
        case 'C': {
          const ox = bx(), oy = by();
          const c1 = { x: sc.num() + ox, y: sc.num() + oy }, c2 = { x: sc.num() + ox, y: sc.num() + oy }; const x = sc.num() + ox, y = sc.num() + oy;
          cubicTo(c1, c2, x, y); lastC = c2; lastQ = null; break;
        }
        case 'S': {
          const ox = bx(), oy = by();
          const c1 = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
          const c2 = { x: sc.num() + ox, y: sc.num() + oy }; const x = sc.num() + ox, y = sc.num() + oy;
          cubicTo(c1, c2, x, y); lastC = c2; lastQ = null; break;
        }
        case 'Q': {
          const ox = bx(), oy = by();
          const q = { x: sc.num() + ox, y: sc.num() + oy }; const x = sc.num() + ox, y = sc.num() + oy;
          cubicTo({ x: cx + 2 / 3 * (q.x - cx), y: cy + 2 / 3 * (q.y - cy) }, { x: x + 2 / 3 * (q.x - x), y: y + 2 / 3 * (q.y - y) }, x, y); lastQ = q; lastC = null; break;
        }
        case 'T': {
          const ox = bx(), oy = by();
          const q: Vec = lastQ ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y } : { x: cx, y: cy }; const x = sc.num() + ox, y = sc.num() + oy;
          cubicTo({ x: cx + 2 / 3 * (q.x - cx), y: cy + 2 / 3 * (q.y - cy) }, { x: x + 2 / 3 * (q.x - x), y: y + 2 / 3 * (q.y - y) }, x, y); lastQ = q; lastC = null; break;
        }
        case 'A': {
          const ox = bx(), oy = by();
          const rx = sc.num(), ry = sc.num(), rotDeg = sc.num(), large = sc.flag(), sweep = sc.flag(); const x = sc.num() + ox, y = sc.num() + oy;
          const segs = arcToCubics(cx, cy, rx, ry, rotDeg, large, sweep, x, y);
          ensure(); for (const [c1, c2, p] of segs) cubicTo(c1, c2, p.x, p.y);
          cx = x; cy = y; lastC = lastQ = null; break;
        }
        case 'Z': {
          if (cur) closeSub(subpaths[subpaths.length - 1]);
          cx = sx; cy = sy; cur = null; lastC = lastQ = null; cmd = '';
          break;
        }
        default: sc.i++;
      }
    }
  } catch { /* malformed tail: keep what parsed, as browsers do */ }
  const out = subpaths.filter(s => s.anchors.length > 0);
  for (const s of out) for (const a of s.anchors) a.kind = inferKind(a);
  return { subpaths: out.filter(s => !(s.anchors.length === 1 && !s.closed)), fillRule };
}
function closeSub(s: SubPath) {
  const A = s.anchors; s.closed = true;
  if (A.length > 1) { const a = A[0], b = A[A.length - 1]; if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) { if (b.hin) a.hin = b.hin; A.pop(); } }
}

export interface SerializeOpts { dp?: number; /** Translate before printing (e.g. to a local origin). */ dx?: number; dy?: number; scale?: number }

/** Serialise to an absolute `d` string (M/L/C/Z, plus H/V for axis-aligned lines). */
export function toPathData(p: CompoundPath, o: SerializeOpts = {}): string {
  const dp = o.dp ?? 3, dx = o.dx ?? 0, dy = o.dy ?? 0, k = o.scale ?? 1;
  const X = (x: number) => fmt((x + dx) * k, dp), Y = (y: number) => fmt((y + dy) * k, dp);
  const parts: string[] = [];
  for (const s of p.subpaths) {
    const A = s.anchors; if (!A.length) continue;
    parts.push(`M${X(A[0].x)} ${Y(A[0].y)}`);
    const cs = subpathCurves(s);
    cs.forEach((c, idx) => {
      const isClosing = s.closed && idx === cs.length - 1 && idx === A.length - 1;
      if (c.line) {
        if (isClosing) return; // Z draws it
        const ex = X(c.p3.x), ey = Y(c.p3.y);
        if (ey === Y(c.p0.y) && ex !== X(c.p0.x)) parts.push(`H${ex}`);
        else if (ex === X(c.p0.x) && ey !== Y(c.p0.y)) parts.push(`V${ey}`);
        else parts.push(`L${ex} ${ey}`);
      } else parts.push(`C${X(c.p1.x)} ${Y(c.p1.y)} ${X(c.p2.x)} ${Y(c.p2.y)} ${X(c.p3.x)} ${Y(c.p3.y)}`);
    });
    if (s.closed) parts.push('Z');
  }
  return parts.join('');
}

/** Points string for <polyline>/<polygon>. */
export function parsePoints(s: string): number[] { return (s.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(Number); }
