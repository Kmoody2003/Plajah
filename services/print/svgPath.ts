// svgPath — the full SVG path grammar reduced to absolute moveto / lineto / cubic / close, the only
// operators the press PDF writer emits. Quadratics are raised to cubics; elliptical arcs become ≤90°
// cubic segments (SVG 1.1 implementation notes F.6.5 for the endpoint → centre conversion).
// Pure; tested in tests/printVector.test.ts.

export type Seg = { op: 'M'; x: number; y: number } | { op: 'L'; x: number; y: number } | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { op: 'Z' };

/** Tokenise path data: command letters and numbers (handles "1.5.5", "-1-2", exponents, packed arc flags). */
function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : parseFloat(m[2]));
  return out;
}

function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (rx === 0 || ry === 0) return [{ op: 'L', x: x2, y: y2 }];
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const der = (t: number) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = der(a), [dbx, dby] = der(b);
    segs.push({ op: 'C', x1: ax + k * dax, y1: ay + k * day, x2: bx - k * dbx, y2: by - k * dby, x: i === n - 1 ? x2 : bx, y: i === n - 1 ? y2 : by });
  }
  return segs;
}

/** Parse any SVG path data into absolute M/L/C/Z segments. Malformed tails are dropped, not thrown. */
export function parseSvgPath(d: string): Seg[] {
  const t = tokenize(d); const out: Seg[] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = '';
  const num = () => (typeof t[i] === 'number' ? (t[i++] as number) : NaN);
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++] as string;
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push({ op: 'Z' }); x = sx; y = sy; prev = 'Z'; cmd = ''; continue; }
    if (C === 'M') { const a = num(), b = num(); if (isNaN(b)) break; x = ox + a; y = oy + b; sx = x; sy = y; out.push({ op: 'M', x, y }); cmd = rel ? 'l' : 'L'; prev = 'M'; continue; }
    if (C === 'L') { const a = num(), b = num(); if (isNaN(b)) break; x = ox + a; y = oy + b; out.push({ op: 'L', x, y }); prev = 'L'; continue; }
    if (C === 'H') { const a = num(); if (isNaN(a)) break; x = (rel ? x : 0) + a; out.push({ op: 'L', x, y }); prev = 'L'; continue; }
    if (C === 'V') { const a = num(); if (isNaN(a)) break; y = (rel ? y : 0) + a; out.push({ op: 'L', x, y }); prev = 'L'; continue; }
    if (C === 'C' || C === 'S') {
      let x1: number, y1: number;
      if (C === 'C') { x1 = ox + num(); y1 = oy + num(); }
      else { const refl = prev === 'C'; x1 = refl ? 2 * x - lcx : x; y1 = refl ? 2 * y - lcy : y; }
      const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
      if ([x1, y1, x2, y2, ex, ey].some(isNaN)) break;
      out.push({ op: 'C', x1, y1, x2, y2, x: ex, y: ey }); lcx = x2; lcy = y2; x = ex; y = ey; prev = 'C'; continue;
    }
    if (C === 'Q' || C === 'T') {
      let qx: number, qy: number;
      if (C === 'Q') { qx = ox + num(); qy = oy + num(); }
      else { const refl = prev === 'Q'; qx = refl ? 2 * x - lqx : x; qy = refl ? 2 * y - lqy : y; }
      const ex = ox + num(), ey = oy + num();
      if ([qx, qy, ex, ey].some(isNaN)) break;
      out.push({ op: 'C', x1: x + (2 / 3) * (qx - x), y1: y + (2 / 3) * (qy - y), x2: ex + (2 / 3) * (qx - ex), y2: ey + (2 / 3) * (qy - ey), x: ex, y: ey });
      lqx = qx; lqy = qy; x = ex; y = ey; prev = 'Q'; continue;
    }
    if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = num(), sw = num(), ex = ox + num(), ey = oy + num();
      if ([rx, ry, rot, la, sw, ex, ey].some(isNaN)) break;
      out.push(...arcToCubics(x, y, rx, ry, rot, !!la, !!sw, ex, ey)); x = ex; y = ey; prev = 'A'; continue;
    }
    i++; // unknown command: skip a token
  }
  return out;
}

/** Apply an affine matrix [a b c d e f] (SVG/DOM order) to every point. */
export function transformSegs(segs: Seg[], m: [number, number, number, number, number, number]): Seg[] {
  const [a, b, c, d, e, f] = m;
  const P = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
  return segs.map(s => {
    if (s.op === 'Z') return s;
    if (s.op === 'C') { const [x1, y1] = P(s.x1, s.y1), [x2, y2] = P(s.x2, s.y2), [x, y] = P(s.x, s.y); return { op: 'C', x1, y1, x2, y2, x, y }; }
    const [x, y] = P(s.x, s.y); return { op: s.op, x, y };
  });
}

/** Segments back to absolute M/L/C/Z path data (4 decimals), the form pressPdf/paths.ts parses. */
export function segsToD(segs: Seg[]): string {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return segs.map(s => s.op === 'Z' ? 'Z' : s.op === 'C' ? `C${r(s.x1)} ${r(s.y1)} ${r(s.x2)} ${r(s.y2)} ${r(s.x)} ${r(s.y)}` : `${s.op}${r(s.x)} ${r(s.y)}`).join(' ');
}

/** Simple shapes as path data (SVG semantics, including rounded rect radii). */
export function rectPath(x: number, y: number, w: number, h: number, rx = 0, ry = rx): string {
  rx = Math.min(Math.abs(rx), w / 2); ry = Math.min(Math.abs(ry), h / 2);
  if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}
export const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`;
export const polyPath = (points: string, close: boolean) => {
  const n = (points.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
  if (n.length < 4) return '';
  let d = `M${n[0]} ${n[1]}`; for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
  return close ? `${d}Z` : d;
};
