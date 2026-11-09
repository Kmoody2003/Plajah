// Fit analysis on a settled drape: strain (how far the fabric is stretched, from each triangle's
// deformation against its flat pattern shape), contact pressure (collision push turned back into
// force per area), gap to the body (ease you could pinch), girths at the points of measure against
// the body and the spec, a fit score per size, and "try every size" on one fixed avatar.

import { type Pattern, type SoftTemplate, type ParamValue, softDefaults } from '../patterns';
import { type Body, type SdfGrid, sampleSdf, torsoAt, ellPerim } from './avatar';
import { type ClothModel, ClothSim, K_STITCH, constraintValue, meshVolume } from './cloth';
import { setupDrape, drapeSync, type DrapeSetup } from './drape';
import { maxStretch } from './fabrics';

export interface FitMaps { strain: Float32Array; pressure: Float32Array; gap: Float32Array; triStrain: Float32Array }

/** Largest principal stretch − 1 per triangle (flat rest shape → 3D), averaged onto vertices. */
export function strainMap(m: ClothModel) {
  const X = m.pos, R = m.rest2, T = m.tris; const tri = new Float32Array(T.length / 3); const v = new Float32Array(m.n), w = new Float32Array(m.n);
  for (let t = 0; t < tri.length; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const u1x = R[2 * b] - R[2 * a], u1y = R[2 * b + 1] - R[2 * a + 1], u2x = R[2 * c] - R[2 * a], u2y = R[2 * c + 1] - R[2 * a + 1];
    const det = u1x * u2y - u2x * u1y; if (Math.abs(det) < 1e-9) continue; const i11 = u2y / det, i12 = -u2x / det, i21 = -u1y / det, i22 = u1x / det;
    const e1 = [X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]], e2 = [X[3 * c] - X[3 * a], X[3 * c + 1] - X[3 * a + 1], X[3 * c + 2] - X[3 * a + 2]];
    // F = [e1 e2] · inv([u1 u2]) (3×2); C = FᵀF.
    const f1 = [0, 1, 2].map(k => e1[k] * i11 + e2[k] * i21), f2 = [0, 1, 2].map(k => e1[k] * i12 + e2[k] * i22);
    const c11 = f1[0] ** 2 + f1[1] ** 2 + f1[2] ** 2, c22 = f2[0] ** 2 + f2[1] ** 2 + f2[2] ** 2, c12 = f1[0] * f2[0] + f1[1] * f2[1] + f1[2] * f2[2];
    const tr = (c11 + c22) / 2, dd = Math.sqrt(Math.max(0, ((c11 - c22) / 2) ** 2 + c12 * c12)); const s = Math.sqrt(tr + dd) - 1;
    tri[t] = s; const A = Math.abs(det) / 2; for (const i of [a, b, c]) { v[i] += s * A; w[i] += A; }
  }
  for (let i = 0; i < m.n; i++) v[i] = w[i] ? v[i] / w[i] : 0;
  return { tri, vert: v };
}

export function fitMaps(m: ClothModel, sim: ClothSim, sdf: SdfGrid | null): FitMaps {
  const { tri, vert } = strainMap(m); const pressure = new Float32Array(m.n), gap = new Float32Array(m.n);
  const h = 1 / 60 / sim.o.substeps; const steps = Math.max(1, sim.contactSteps);
  for (let i = 0; i < m.n; i++) {
    // Mean push per substep × mass / h² = contact force (g·mm/s²); / area (mm²) = Pa.
    pressure[i] = (sim.contact[i] / steps) * m.mass[i] / (h * h) / Math.max(1, m.vArea[i]) / 1000;
    gap[i] = sdf ? Math.max(0, sampleSdf(sdf, m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]) - m.offset[i]) : Math.max(0, m.pos[3 * i + 1] - m.offset[i]);
  }
  if (m.layers > 1 && sdf) layerGap(m, sdf, gap);
  return { strain: vert, pressure, gap, triStrain: tri };
}

/**
 * Outer layers: ease is measured to the garment underneath where there is one (a hoodie over a tee
 * is roomy only by what clears the tee), along the body normal, else to the body.
 */
export function layerGap(m: ClothModel, sdf: SdfGrid, gap: Float32Array) {
  const X = m.pos; const cell = 40; const grid = new Map<string, number[]>(); const g = [0, 0, 0];
  for (let i = 0; i < m.n; i++) { const k = `${Math.floor(X[3 * i] / cell)},${Math.floor(X[3 * i + 1] / cell)},${Math.floor(X[3 * i + 2] / cell)}`; const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
  for (let i = 0; i < m.n; i++) { if (m.layer[i] === 0) continue; sampleSdf(sdf, X[3 * i], X[3 * i + 1], X[3 * i + 2], g); const gl = Math.hypot(g[0], g[1], g[2]) || 1; const nx = g[0] / gl, ny = g[1] / gl, nz = g[2] / gl;
    const cx = Math.floor(X[3 * i] / cell), cy = Math.floor(X[3 * i + 1] / cell), cz = Math.floor(X[3 * i + 2] / cell); let best = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
      if (m.layer[j] >= m.layer[i]) continue; const ux = X[3 * i] - X[3 * j], uy = X[3 * i + 1] - X[3 * j + 1], uz = X[3 * i + 2] - X[3 * j + 2]; const along = ux * nx + uy * ny + uz * nz; const lat = Math.sqrt(Math.max(0, ux * ux + uy * uy + uz * uz - along * along));
      if (lat > 15 || along < -5) continue; best = Math.min(best, Math.max(0, along - (m.thick[i] + m.thick[j]) * 0.5)); }
    if (best < Infinity) gap[i] = Math.min(gap[i], best); }
}

type P2 = [number, number];
function hullPerimeter(pts: P2[]) {
  if (pts.length < 3) return 0; const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], hi: P2[] = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const h = [...lo.slice(0, -1), ...hi.slice(0, -1)]; let L = 0; for (let i = 0; i < h.length; i++) L += Math.hypot(h[i][0] - h[(i + 1) % h.length][0], h[i][1] - h[(i + 1) % h.length][1]); return L;
}
/** Tape-measure girth of the cloth where it crosses a plane (origin o, unit normal n), over the given pieces. */
export function clothGirth(m: ClothModel, o: number[], n: number[], pieceIds: Set<number>) {
  const X = m.pos, T = m.tris; const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]]; const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1.forEach((_, k) => (e1[k] /= l1));
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  const d = (i: number) => (X[3 * i] - o[0]) * n[0] + (X[3 * i + 1] - o[1]) * n[1] + (X[3 * i + 2] - o[2]) * n[2];
  const pts: P2[] = [];
  for (let t = 0; t < T.length / 3; t++) { if (!pieceIds.has(m.triPiece[t])) continue; const v = [T[3 * t], T[3 * t + 1], T[3 * t + 2]]; const s = v.map(d);
    for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3]; if ((sa < 0) === (sb < 0)) continue; const f = sa / (sa - sb);
      const q = [0, 1, 2].map(c => X[3 * a + c] + (X[3 * b + c] - X[3 * a + c]) * f - o[c]); pts.push([q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2]]); } }
  return hullPerimeter(pts);
}

export interface Pom { name: string; body: number; garment: number; ease: number; spec?: number }
export interface FitReport {
  poms: Pom[]; score: number; verdict: string[];
  tightPct: number; loosePct: number; maxPressure: number; meanStrain: number; maxStrain: number;
  sleeveEnd?: number; hemY?: number; neckOpening?: number; neckPressure?: number; seamGap: number;
  plush?: { volume: number; target: number; fillPct: number; seamStrain: number; pressurePa: number; sitsUp: boolean; sitTested: boolean; /** Seam strain ÷ the fabric's own stretch. */ seamLoad?: number };
}

const EASE_BAND: Record<string, [number, number]> = { fitted: [30, 90], regular: [60, 170], oversized: [140, 330] };

export function fitReport(s: DrapeSetup, sim: ClothSim, maps = fitMaps(s.model, sim, s.sdf), fit = 'regular', garment?: number): FitReport {
  const m = s.model; const body = s.body; let tA = 0, tight = 0, loose = 0, mp = 0, ms = 0, mx = 0;
  const gv = (i: number) => garment == null || m.garment[i] === garment; const gp = (pi: number) => garment == null || m.pieces[pi].garment === garment; const pat = s.garments?.[garment ?? 0] ?? s.pattern;
  for (let i = 0; i < m.n; i++) { if (!gv(i)) continue; const A = m.vArea[i]; tA += A; const knit = m.pieces[m.vPiece[i]].fabric.knit; if (maps.strain[i] > (knit ? 0.12 : 0.04)) tight += A; if (maps.gap[i] > 40) loose += A; mp = Math.max(mp, maps.pressure[i]); ms += maps.strain[i] * A; mx = Math.max(mx, maps.strain[i]); }
  // Peak stretch as the 99th percentile by count, so a single crease triangle does not set it.
  { const a = Array.from(maps.strain).filter((_, i) => gv(i)).sort((x, y) => x - y); mx = a.length ? a[Math.floor(a.length * 0.99)] : 0; }
  let seamGap = 0; for (let c = 0; c < m.nc; c++) if (m.kind[c] === K_STITCH && gv(m.a0[c])) seamGap = Math.max(seamGap, constraintValue(m, c) + m.rest[c]);
  const rep: FitReport = { poms: [], score: 100, verdict: [], tightPct: tight / tA * 100, loosePct: loose / tA * 100, maxPressure: mp, meanStrain: ms / tA, maxStrain: mx, seamGap };
  if (s.rig.kind === 'plush') {
    const vol = meshVolume(m); const target = m.pressure?.planned ?? m.pressure?.targetVolume ?? vol;
    // Seam strain: 75th percentile over seam vertices (corner creases are solver artefacts, not weak seams).
    const ss = (() => { const a: number[] = []; for (let i = 0; i < m.n; i++) if (m.seamVert[i]) a.push(maps.strain[i]); a.sort((x, y) => x - y); return a.length ? a[Math.floor(a.length * 0.75)] : 0; })();
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < m.n; i++) { lo = Math.min(lo, m.pos[3 * i + 1]); hi = Math.max(hi, m.pos[3 * i + 1]); }
    const tested = sim.stuffedHeight != null; const sits = tested ? (hi - lo) / sim.stuffedHeight! > 0.8 : true;
    rep.plush = { volume: vol, target, fillPct: vol / target * 100, seamStrain: ss, pressurePa: Math.max(0, sim.lastPressure), sitsUp: sits, sitTested: tested };
    // Seam strain is judged against what the fabric itself gives (minky stretches, felt does not).
    const give = Math.max(0.05, Math.max(...m.pieces.map(p => maxStretch(p.fabric)))); const over = ss / give;
    rep.plush.seamLoad = over;
    rep.score = Math.max(0, Math.round(100 - Math.max(0, over - 0.8) * 60 - Math.max(0, 80 - rep.plush.fillPct) * 0.5 - Math.max(0, seamGap - 6) * 2 - (sits ? 0 : 15)));
    if (over > 1.2) rep.verdict.push('Seams are under high strain when stuffed: use a shorter stitch, stronger thread, or stuff a little softer.');
    if (rep.plush.fillPct < 80) rep.verdict.push(`The sewn shell holds about ${Math.round(rep.plush.fillPct)}% of the fill the pattern estimates; buy fill for this, not the estimate.`);
    if (!sits) rep.verdict.push(s.pattern.features.beads ? 'Tips over when sat down even with the pellet pouch: widen the base or make the head smaller.' : 'Tips over when sat down: add a pellet pouch in the base, widen the base, or make the head smaller.');
    if (!rep.verdict.length) rep.verdict.push(tested ? 'Stuffs evenly, sits up, seams within comfortable strain.' : 'Stuffs evenly with seams within comfortable strain. Run the sit test to see if it sits up.');
    return rep;
  }
  if (!body) return rep;
  const ids = (role: string) => new Set(m.pieces.map((p, i) => (p.role === role && gp(i) ? i : -1)).filter(i => i >= 0));
  const torso = ids('body'); const spec = (name: string) => pat.grading?.rows.find(r => r.pom.startsWith(name))?.values[pat.grading.sizes.indexOf(pat.size ?? '')];
  const ring = (y: number) => { const r = torsoAt(body, y); return ellPerim(r.a, r.b); };
  if (torso.size) {
    for (const [name, y, key] of [['Chest', body.y.chest, 'Chest'], ['Waist', body.y.waist, ''], ['Hip', body.y.hip, '']] as Array<[string, number, string]>) {
      const g = clothGirth(m, [0, y, 0], [0, 1, 0], torso); if (g < 50) continue; const b = ring(y); rep.poms.push({ name, body: b, garment: g, ease: g - b, spec: key ? spec(key) : undefined });
    }
  }
  const sleeves = m.pieces.map((p, i) => (p.role === 'sleeve' && gp(i) ? i : -1)).filter(i => i >= 0);
  if (sleeves.length && body) {
    const arm = body.arms[0]; const d = arm.dir; const o = [arm.root[0] + (arm.mid[0] - arm.root[0]) * 0.45, arm.root[1] + (arm.mid[1] - arm.root[1]) * 0.45, arm.root[2] + (arm.mid[2] - arm.root[2]) * 0.45];
    const g = clothGirth(m, o, d as unknown as number[], new Set([sleeves[0]])); const b = 2 * Math.PI * arm.r * 0.97; if (g > 30) rep.poms.push({ name: 'Bicep', body: b, garment: g, ease: g - b });
    // Sleeve end: furthest sleeve or cuff vertex along the arm, against the wrist.
    const ends = m.pieces.map((p, i) => ((p.role === 'sleeve' || p.role === 'rib') && /L$/.test(p.id) && gp(i) ? i : -1)).filter(i => i >= 0);
    let far = -Infinity; for (const pi of ends) { const P = m.pieces[pi]; for (let i = P.v0; i < P.v0 + P.vn; i++) far = Math.max(far, (m.pos[3 * i] - arm.root[0]) * d[0] + (m.pos[3 * i + 1] - arm.root[1]) * d[1] + (m.pos[3 * i + 2] - arm.root[2]) * d[2]); }
    const wrist = (arm.end[0] - arm.root[0]) * d[0] + (arm.end[1] - arm.root[1]) * d[1] + (arm.end[2] - arm.root[2]) * d[2]; rep.sleeveEnd = far - wrist;
  }
  // Hem: the lowest torso/waistband vertex.
  let hem = Infinity; m.pieces.forEach((p, pi) => { if (gp(pi) && (p.role === 'body' || /waistband$/.test(p.id))) for (let i = p.v0; i < p.v0 + p.vn; i++) hem = Math.min(hem, m.pos[3 * i + 1]); }); rep.hemY = hem;
  // Neck: opening (flat neckline length × the knit's stretch) and pressure on the band round the neck.
  const neckSeams = m.seams.filter((x, k) => /(^|: )(Hood neck|Neckband$)/.test(x.name) && (garment == null || m.garment[m.a0[x.ids[0]] ?? 0] === garment) && k >= 0); if (neckSeams.length) {
    const flat = neckSeams.reduce((a, x) => a + x.lenB, 0); const f = m.pieces.find((p, pi) => p.role === 'body' && gp(pi))!.fabric; rep.neckOpening = flat * (1 + maxStretch(f) * 0.6);
  }
  let np = 0; for (let i = 0; i < m.n; i++) { const y = m.pos[3 * i + 1]; if (gv(i) && y > body.y.neckBase - 50 && y < body.y.chin && Math.hypot(m.pos[3 * i], m.pos[3 * i + 2]) < body.neckR + 60) np = Math.max(np, maps.pressure[i]); } rep.neckPressure = np;
  // Score.
  const band = EASE_BAND[fit] ?? EASE_BAND.regular; let score = 100; const chest = rep.poms.find(p => p.name === 'Chest');
  if (chest) { const e = chest.ease; if (e < band[0]) { score -= Math.min(45, (band[0] - e) * 0.6); rep.verdict.push(`Tight at the chest: ${Math.round(e / 10)} cm ease (aim for ${band[0] / 10}-${band[1] / 10} cm for a ${fit} fit).`); }
    else if (e > band[1]) { score -= Math.min(35, (e - band[1]) * 0.25); rep.verdict.push(`Roomy at the chest: ${Math.round(e / 10)} cm ease.`); } }
  score -= Math.min(25, rep.tightPct * 1.5); if (rep.tightPct > 5) rep.verdict.push(`${Math.round(rep.tightPct)}% of the garment is stretched past comfortable.`);
  if (mp > 4) { score -= 15; rep.verdict.push(`Contact pressure peaks at ${mp.toFixed(1)} kPa (over 4 kPa feels like compression wear).`); } else if (mp > 2) score -= 6;
  if (rep.sleeveEnd != null) { const e = rep.sleeveEnd; if (e < -40) { score -= Math.min(20, (-40 - e) * 0.3); rep.verdict.push(`Sleeves end ${Math.round(-e / 10)} cm above the wrist.`); } else if (e > 60) { score -= Math.min(15, (e - 60) * 0.2); rep.verdict.push(`Sleeves run ${Math.round(e / 10)} cm past the wrist.`); } }
  if (rep.hemY != null && isFinite(rep.hemY) && sleeves.length) { if (rep.hemY > body.y.hip + 40) { score -= 10; rep.verdict.push('Hem sits above the hip: cropped on this body.'); } else if (rep.hemY < body.y.crotch - 140) { score -= 8; rep.verdict.push('Hem falls well below the seat: long on this body.'); } }
  if (seamGap > 15) { score -= 10; rep.verdict.push(`Some seams cannot close on this body (${Math.round(seamGap)} mm apart): a piece is too small where it meets the body.`); }
  rep.score = Math.max(0, Math.round(score)); if (!rep.verdict.length) rep.verdict.push('Good fit: ease, length and pressure all in range.');
  return rep;
}

export interface SizeRow { size: string; report: FitReport; ms: number }
/** Drape every size on the same avatar (coarser mesh), yielding to the UI between sizes. */
export async function tryEverySize(tpl: SoftTemplate, params: Record<string, ParamValue>, body: Body, sdf: SdfGrid, sizes: string[], onProgress?: (done: number, row?: SizeRow) => void, opts: { seconds?: number; spacing?: number; fabric?: Parameters<typeof setupDrape>[1]['fabric'] } = {}): Promise<SizeRow[]> {
  const rows: SizeRow[] = [];
  for (let k = 0; k < sizes.length; k++) {
    const t0 = Date.now(); const pattern: Pattern = tpl.build({ ...softDefaults(tpl), ...params, size: sizes[k] });
    const s = setupDrape(pattern, { body, sdf, spacing: opts.spacing ?? 26, fabric: opts.fabric });
    const sim = drapeSync(s, opts.seconds ?? 1.8, { substeps: 10 });
    const row = { size: sizes[k], report: fitReport(s, sim, undefined, String(params.fit ?? 'regular')), ms: Date.now() - t0 }; rows.push(row); onProgress?.(k + 1, row);
    await new Promise(r => setTimeout(r, 0));
  }
  return rows;
}
