/**
 * Parcel survey — dimensions, angles, closure and cross-checks for one parcel.
 *
 * Three independent readings of the same boundary, checked against each other:
 *
 *   A. RECORD  — the legal description's metes and bounds, run as a closed
 *                traverse: latitudes & departures, linear misclosure, precision
 *                (1 : perimeter/misclosure), Compass-rule (Bowditch) adjustment,
 *                area by coordinates plus curve segments, interior & deflection
 *                angles.
 *   B. MAPPED  — the city GIS polygon: every side's length and bearing, every
 *                interior angle, area and perimeter, after merging collinear
 *                digitising vertices.
 *   C. NEIGHBOURS — the parcels that touch it: which side each one shares, how
 *                much of it, where there are gaps or overlaps between the two
 *                polygons, and whether a neighbour's own deed calls the same
 *                line (same bearing reversed, same distance).
 *
 * The record traverse is placed on the map by a best-fit rotation + translation
 * onto the mapped polygon (deeds use their own basis of bearings, so the
 * rotation it finds IS the basis-of-bearing difference), and the residual at
 * every corner says how well record and map agree.
 *
 * None of this is a boundary survey. GIS parcel layers are compiled from plats
 * and are typically good to a few feet; only a licensed surveyor's field work
 * sets corners.
 */

import type { TerraParcel, GeoJsonGeometry } from '../terraTypes';
import {
  type Pt, azimuthOf, dist, angleDiff, norm360, bearingToAzimuth, signedArea, centroid,
  latDep, solveCurve, makeLocalProjection, distanceToPolygon, pointInPolygon, rotate,
  pointSegmentDistance, type CurveElements,
} from './cogo';
import { parseLegalDescription, type ParsedLegalDescription, type SurveyCall } from './legalDescription';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MappedSide {
  index: number;
  from: Pt; to: Pt;
  length: number;
  /** Azimuth of the side walking clockwise around the parcel. */
  azimuth: number;
  /** Interior angle at the side's START corner, degrees. */
  interiorAngle: number;
  /** Neighbour parcels sharing this side. */
  adjoiners: { parcelId: string; address?: string; sharedFt: number; offsetFt: number; kind: 'flush' | 'gap' | 'overlap' }[];
  /** Feet of this side with no parcel beyond it (street, alley, river, ROW). */
  openFt: number;
  /** Nearest parallel parcel line across an open side — the street/alley width as mapped. */
  across?: { parcelId: string; address?: string; distanceFt: number };
}

export interface MappedPolygon {
  vertices: Pt[];
  sides: MappedSide[];
  areaSqFt: number;
  perimeter: number;
  /** Rectangle within 1° on every corner. */
  isRectangular: boolean;
  /** Angle sum check: Σ interior − (n−2)·180 (should be ~0 for a simple polygon). */
  angleSumError: number;
}

export interface TraverseCourse {
  index: number;
  call: SurveyCall;
  /** Azimuth of the straight leg (the chord, for a curve). */
  azimuth: number;
  length: number;
  lat: number; dep: number;
  curve?: CurveElements & { turn: 'left' | 'right'; tangentInAz: number; tangentOutAz: number };
  /** Interior angle at this course's START corner (chord-to-chord). */
  interiorAngle?: number;
  /** Deflection at the start corner: + right, − left. */
  deflection?: number;
  /** Bowditch-adjusted end point. */
  adjustedEnd?: Pt;
  /** Agrees with an adjoiner's deed call. */
  neighbourAgreement?: { parcelId: string; address?: string; dAzSec: number; dLenFt: number };
}

export interface RecordTraverse {
  courses: TraverseCourse[];
  /** Unadjusted coordinates, POB at (0,0). */
  points: Pt[];
  adjusted: Pt[];
  perimeter: number;
  misclosureLat: number;
  misclosureDep: number;
  misclosure: number;
  misclosureBearing: number;
  /** Denominator of 1:N. Infinity for a perfect close. */
  precision: number;
  /** Closes: 1:5,000 or better (urban ALTA-ish screening threshold, not a standard). */
  closes: boolean;
  areaSqFt: number;
  /** Curve segment area included in areaSqFt. */
  curveAreaSqFt: number;
  clockwise: boolean;
}

export interface RecordFit {
  /** Add to record azimuths to get grid (map) azimuths. */
  rotationDeg: number;
  /** Record points placed on the map, local feet. */
  placed: Pt[];
  /** Distance of each placed record corner to the mapped boundary. */
  residuals: number[];
  rms: number;
  max: number;
  verdict: 'agrees' | 'roughly' | 'disagrees';
}

export interface ParcelSurvey {
  parcelId: string;
  legal: ParsedLegalDescription;
  mapped?: MappedPolygon;
  record?: RecordTraverse;
  fit?: RecordFit;
  /** Lng/lat helpers so the UI can draw the results. */
  toLngLat: (p: Pt) => [number, number];
  toLocal: (lng: number, lat: number) => Pt;
  /** Comparisons the UI shows as a check list. */
  checks: { label: string; status: 'ok' | 'warn' | 'bad' | 'info'; detail: string }[];
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

export function outerRing(g?: GeoJsonGeometry): [number, number][] | null {
  if (!g) return null;
  if (g.type === 'Polygon') return (g.coordinates as any)?.[0] ?? null;
  if (g.type === 'MultiPolygon') {
    // Largest part by vertex-area.
    let best: [number, number][] | null = null, bestA = -1;
    for (const poly of (g.coordinates as any) ?? []) {
      const r = poly?.[0];
      if (!r) continue;
      const a = Math.abs(signedArea(r.map(([x, y]: number[]) => ({ x, y }))));
      if (a > bestA) { bestA = a; best = r; }
    }
    return best;
  }
  return null;
}

/** Drop the closing duplicate and merge collinear / near-duplicate vertices. */
export function cleanRing(pts: Pt[], angleTolDeg = 0.75, minSideFt = 0.15): Pt[] {
  let r = pts.slice();
  if (r.length > 1 && dist(r[0], r[r.length - 1]) < 1e-6) r.pop();
  // Remove near-duplicates.
  r = r.filter((p, i) => dist(p, r[(i + 1) % r.length]) > minSideFt || r.length <= 3);
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const turn = Math.abs(angleDiff(azimuthOf(a, b), azimuthOf(b, c)));
      // Merge when nearly straight, OR when the kink is tiny in feet (digitising jitter).
      const lateral = pointSegmentDistance(b, a, c).d;
      if (turn < angleTolDeg || lateral < 0.1) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r;
}

function ensureClockwise(r: Pt[]): Pt[] {
  return signedArea(r) > 0 ? r.slice().reverse() : r;
}

/** Interior angle at vertex b for a CLOCKWISE ring a→b→c. */
function interiorAngleCW(azIn: number, azOut: number): number {
  return 180 - angleDiff(azIn, azOut);
}

// ─── B. Mapped polygon ───────────────────────────────────────────────────────

export function analyseRing(ringLocal: Pt[]): MappedPolygon | undefined {
  const r = ensureClockwise(cleanRing(ringLocal));
  if (r.length < 3) return undefined;
  const n = r.length;
  const sides: MappedSide[] = [];
  for (let i = 0; i < n; i++) {
    const from = r[i], to = r[(i + 1) % n], prev = r[(i - 1 + n) % n];
    const az = azimuthOf(from, to);
    sides.push({
      index: i, from, to, length: dist(from, to), azimuth: az,
      interiorAngle: interiorAngleCW(azimuthOf(prev, from), az),
      adjoiners: [], openFt: dist(from, to),
    });
  }
  const sum = sides.reduce((s, x) => s + x.interiorAngle, 0);
  return {
    vertices: r,
    sides,
    areaSqFt: Math.abs(signedArea(r)),
    perimeter: sides.reduce((s, x) => s + x.length, 0),
    isRectangular: n === 4 && sides.every(s => Math.abs(s.interiorAngle - 90) < 1),
    angleSumError: sum - (n - 2) * 180,
  };
}

// ─── A. Record traverse ──────────────────────────────────────────────────────

export function runTraverse(calls: SurveyCall[]): RecordTraverse | undefined {
  if (calls.length < 2) return undefined;
  const courses: TraverseCourse[] = [];
  let prevTangentOut: number | undefined;

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.kind === 'line') {
      const az = bearingToAzimuth(c.bearing);
      const { lat, dep } = latDep(az, c.distance);
      courses.push({ index: i, call: c, azimuth: az, length: c.distance, lat, dep });
      prevTangentOut = az;
      continue;
    }
    const el = solveCurve({ radius: c.radius, arc: c.arc, chord: c.chord, delta: c.delta });
    if (!el) {
      // Under-determined: fall back to the chord if we at least have that.
      if (c.chordBearing && c.chord) {
        const az = bearingToAzimuth(c.chordBearing);
        const { lat, dep } = latDep(az, c.chord);
        courses.push({ index: i, call: c, azimuth: az, length: c.chord, lat, dep });
        prevTangentOut = az;
        continue;
      }
      return undefined;
    }
    let turn: 'left' | 'right' | undefined = c.turn;
    let chordAz: number | undefined = c.chordBearing ? bearingToAzimuth(c.chordBearing) : undefined;
    if (!turn && c.concaveAz !== undefined) {
      const ref = chordAz ?? prevTangentOut;
      if (ref !== undefined) turn = angleDiff(ref, c.concaveAz) > 0 ? 'right' : 'left';
    }
    if (chordAz === undefined) {
      if (prevTangentOut === undefined || !turn) return undefined;
      // Tangent curve: chord = incoming tangent ± Δ/2.
      chordAz = norm360(prevTangentOut + (turn === 'right' ? 1 : -1) * el.delta / 2);
    }
    turn = turn ?? 'right';
    const s = turn === 'right' ? 1 : -1;
    const tangentInAz = norm360(chordAz - s * el.delta / 2);
    const tangentOutAz = norm360(chordAz + s * el.delta / 2);
    const { lat, dep } = latDep(chordAz, el.chord);
    courses.push({ index: i, call: c, azimuth: chordAz, length: el.chord, lat, dep, curve: { ...el, turn, tangentInAz, tangentOutAz } });
    prevTangentOut = tangentOutAz;
  }

  const points: Pt[] = [{ x: 0, y: 0 }];
  for (const c of courses) {
    const p = points[points.length - 1];
    points.push({ x: p.x + c.dep, y: p.y + c.lat });
  }
  const end = points[points.length - 1];
  const misLat = end.y, misDep = end.x;
  const misclosure = Math.hypot(misLat, misDep);
  const perimeter = courses.reduce((s, c) => s + (c.curve ? c.curve.arc : c.length), 0);
  const chordPerim = courses.reduce((s, c) => s + c.length, 0);

  // Compass (Bowditch) rule: each leg's correction ∝ its length.
  const adjusted: Pt[] = [{ x: 0, y: 0 }];
  let run = 0;
  for (const c of courses) {
    run += c.length;
    const k = run / chordPerim;
    const raw = points[adjusted.length];
    const adj = { x: raw.x - misDep * k, y: raw.y - misLat * k };
    adjusted.push(adj);
    c.adjustedEnd = adj;
  }

  const ring = adjusted.slice(0, -1);
  const sa = signedArea(ring);
  const clockwise = sa < 0;

  // Curve segments: bulge sits opposite the centre. It is OUTSIDE the chord
  // polygon when a right-hand curve runs clockwise (or left-hand counter-clockwise).
  let curveArea = 0;
  for (const c of courses) {
    if (!c.curve) continue;
    const outward = (c.curve.turn === 'right') === clockwise;
    curveArea += (outward ? 1 : -1) * c.curve.segmentArea;
  }

  // Angles at each corner, chord to chord.
  const n = courses.length;
  for (let i = 0; i < n; i++) {
    const inc = courses[(i - 1 + n) % n], out = courses[i];
    const azIn = inc.curve ? inc.curve.tangentOutAz : inc.azimuth;
    const azOut = out.curve ? out.curve.tangentInAz : out.azimuth;
    out.deflection = angleDiff(azIn, azOut);
    const chordTurn = angleDiff(inc.azimuth, out.azimuth);
    out.interiorAngle = clockwise ? 180 - chordTurn : 180 + chordTurn;
  }

  const precision = misclosure > 1e-6 ? perimeter / misclosure : Infinity;
  return {
    courses, points, adjusted,
    perimeter,
    misclosureLat: misLat, misclosureDep: misDep, misclosure,
    misclosureBearing: azimuthOf({ x: 0, y: 0 }, { x: -misDep, y: -misLat }),
    precision,
    closes: precision >= 5000,
    areaSqFt: Math.abs(sa) + curveArea,
    curveAreaSqFt: curveArea,
    clockwise,
  };
}

// ─── Record ↔ map fit ────────────────────────────────────────────────────────

function fitCost(pts: Pt[], ring: Pt[]): number {
  let s = 0;
  for (const p of pts) { const d = distanceToPolygon(p, ring); s += d * d; }
  return s / pts.length;
}

/**
 * Rotate + translate the record polygon onto the mapped ring. Scale is held
 * at 1: record distances are ground distances and a scale fudge would hide a
 * real disagreement.
 */
export function fitRecordToMap(record: Pt[], ring: Pt[]): RecordFit {
  const rc = centroid(record), mc = centroid(ring);
  const base = record.map(p => ({ x: p.x - rc.x + mc.x, y: p.y - rc.y + mc.y }));
  const place = (rot: number, t: Pt) => base.map(p => { const q = rotate(p, rot, mc); return { x: q.x + t.x, y: q.y + t.y }; });

  // Coarse rotation search, then local refinement of rotation + translation.
  let bestRot = 0, bestCost = Infinity;
  for (let a = -180; a < 180; a += 1) {
    const c = fitCost(place(a, { x: 0, y: 0 }), ring);
    // Symmetric lots fit equally at 180° apart — prefer the smaller rotation,
    // since record bases of bearing differ from grid by a few degrees at most.
    if (c < bestCost * 0.999 - 1e-6 || (c <= bestCost * 1.001 + 1e-6 && Math.abs(a) < Math.abs(bestRot))) { bestCost = Math.min(c, bestCost); bestRot = a; }
  }
  let t: Pt = { x: 0, y: 0 };
  let step = 0.5, tStep = 2;
  for (let iter = 0; iter < 200 && (step > 1e-4 || tStep > 1e-3); iter++) {
    let improved = false;
    for (const [dr, dx, dy] of [[step, 0, 0], [-step, 0, 0], [0, tStep, 0], [0, -tStep, 0], [0, 0, tStep], [0, 0, -tStep]]) {
      const nt = { x: t.x + dx, y: t.y + dy };
      const c = fitCost(place(bestRot + dr, nt), ring);
      if (c < bestCost - 1e-9) { bestCost = c; bestRot += dr; t = nt; improved = true; }
    }
    if (!improved) { step /= 2; tStep /= 2; }
  }
  const placed = place(bestRot, t);
  const residuals = placed.map(p => distanceToPolygon(p, ring));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const max = Math.max(...residuals);
  return {
    rotationDeg: angleDiff(0, bestRot),
    placed, residuals, rms, max,
    verdict: max <= 2 ? 'agrees' : max <= 6 ? 'roughly' : 'disagrees',
  };
}

// ─── C. Neighbours ───────────────────────────────────────────────────────────

const ADJ_ANGLE_TOL = 3;   // degrees
const ADJ_OFFSET_TOL = 6;  // feet — beyond this it's not the same line
const FLUSH_TOL = 0.5;     // feet
const ACROSS_MAX = 160;    // feet — widest right-of-way we look across

function analyseAdjoiners(mapped: MappedPolygon, neighbours: { parcel: TerraParcel; ring: Pt[] }[]) {
  for (const side of mapped.sides) {
    const ux = (side.to.x - side.from.x) / side.length, uy = (side.to.y - side.from.y) / side.length;
    const covered: [number, number][] = [];
    let across: MappedSide['across'];
    for (const nb of neighbours) {
      let shared = 0, offsetSum = 0, signSum = 0;
      const r = nb.ring;
      for (let j = 0; j < r.length; j++) {
        const a = r[j], b = r[(j + 1) % r.length];
        const L = dist(a, b);
        if (L < 0.2) continue;
        const dAz = Math.abs(angleDiff(side.azimuth, azimuthOf(a, b)));
        if (Math.min(dAz, 180 - dAz) > ADJ_ANGLE_TOL) continue;
        // Perpendicular offsets of the neighbour edge's ends from this side's line.
        // + = right of the side, which is INSIDE a clockwise ring.
        const off = (p: Pt) => (p.x - side.from.x) * uy - (p.y - side.from.y) * ux;
        const oa = off(a), ob = off(b);
        const ta = (a.x - side.from.x) * ux + (a.y - side.from.y) * uy;
        const tb = (b.x - side.from.x) * ux + (b.y - side.from.y) * uy;
        const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(side.length, Math.max(ta, tb));
        if (Math.abs(oa) > ADJ_OFFSET_TOL || Math.abs(ob) > ADJ_OFFSET_TOL) {
          // A parallel line out beyond this side: the far side of a street or alley.
          const d = -(oa + ob) / 2;
          if (oa < 0 && ob < 0 && d <= ACROSS_MAX && hi - lo >= Math.min(5, side.length * 0.3) && (!across || d < across.distanceFt)) {
            across = { parcelId: nb.parcel.id, address: nb.parcel.address, distanceFt: d };
          }
          continue;
        }
        if (hi - lo < 0.5) continue;
        shared += hi - lo;
        offsetSum += ((oa + ob) / 2) * (hi - lo);
        signSum += hi - lo;
        covered.push([lo, hi]);
      }
      if (shared > 0.5) {
        const offset = offsetSum / signSum; // + = neighbour's line lies inside this parcel
        side.adjoiners.push({
          parcelId: nb.parcel.id, address: nb.parcel.address,
          sharedFt: shared, offsetFt: Math.abs(offset),
          kind: Math.abs(offset) <= FLUSH_TOL ? 'flush' : offset > 0 ? 'overlap' : 'gap',
        });
      }
    }
    // Union of covered intervals → open (unadjoined) length.
    covered.sort((p, q) => p[0] - q[0]);
    let total = 0, curLo = -1, curHi = -1;
    for (const [lo, hi] of covered) {
      if (lo > curHi) { if (curHi > curLo) total += curHi - curLo; curLo = lo; curHi = hi; }
      else curHi = Math.max(curHi, hi);
    }
    if (curHi > curLo) total += curHi - curLo;
    side.openFt = Math.max(0, side.length - total);
    if (side.openFt > 1 && across) side.across = across;
  }
}

/** Do two record calls describe the same line? Same or reversed bearing, same length. */
function matchCall(a: TraverseCourse, b: TraverseCourse): { dAzSec: number; dLenFt: number } | null {
  const d1 = Math.abs(angleDiff(a.azimuth, b.azimuth));
  const dAz = Math.min(d1, Math.abs(180 - d1));
  const dLen = Math.abs(a.length - b.length);
  if (dAz * 3600 <= 60 && dLen <= 0.25) return { dAzSec: dAz * 3600, dLenFt: dLen };
  return null;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export function surveyParcel(parcel: TerraParcel, nearby: TerraParcel[] = []): ParcelSurvey {
  const legal = parseLegalDescription(parcel.legalDescription);
  const ringLL = outerRing(parcel.geometry);
  const lat0 = parcel.centroidLat ?? ringLL?.[0]?.[1] ?? 0;
  const lng0 = parcel.centroidLng ?? ringLL?.[0]?.[0] ?? 0;
  const proj = makeLocalProjection(lat0, lng0);
  const survey: ParcelSurvey = { parcelId: parcel.id, legal, toLngLat: proj.toLngLat, toLocal: proj.toLocal, checks: [] };
  const checks = survey.checks;

  const ringLocal = ringLL?.map(([lng, lat]) => proj.toLocal(lng, lat));
  if (ringLocal) survey.mapped = analyseRing(ringLocal);
  const mapped = survey.mapped;

  // Neighbours: parcels whose polygon comes within a few feet of this one.
  if (mapped) {
    const pad = ACROSS_MAX + 2;
    const xs = mapped.vertices.map(p => p.x), ys = mapped.vertices.map(p => p.y);
    const box = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
    const neighbours: { parcel: TerraParcel; ring: Pt[] }[] = [];
    for (const nb of nearby) {
      if (nb.id === parcel.id) continue;
      const r = outerRing(nb.geometry);
      if (!r) continue;
      const loc = r.map(([lng, lat]) => proj.toLocal(lng, lat));
      if (!loc.some(p => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1)) continue;
      neighbours.push({ parcel: nb, ring: cleanRing(loc, 0.25, 0.05) });
    }
    analyseAdjoiners(mapped, neighbours);

    const adjoinerIds = new Set(mapped.sides.flatMap(s => s.adjoiners.map(a => a.parcelId)));
    const gaps = mapped.sides.flatMap(s => s.adjoiners.filter(a => a.kind === 'gap'));
    const overlaps = mapped.sides.flatMap(s => s.adjoiners.filter(a => a.kind === 'overlap'));
    // Neighbour corners inside this parcel = a true overlap of the polygons.
    let deepCorners = 0;
    for (const nb of neighbours) for (const p of nb.ring) {
      if (pointInPolygon(p, mapped.vertices) && distanceToPolygon(p, mapped.vertices) > 1) deepCorners++;
    }
    checks.push({
      label: 'Adjoining parcels', status: adjoinerIds.size ? 'info' : 'warn',
      detail: adjoinerIds.size
        ? `${adjoinerIds.size} adjoiner${adjoinerIds.size === 1 ? '' : 's'} on the map. ${mapped.sides.filter(s => s.openFt > 1).length} side(s) front a street, alley or other unparcelled land.`
        : 'No adjoining parcels loaded around this one — zoom in or pan so neighbours load.',
    });
    if (gaps.length || overlaps.length || deepCorners) {
      const worst = Math.max(0, ...gaps.map(g => g.offsetFt), ...overlaps.map(o => o.offsetFt));
      checks.push({
        label: 'Gaps / overlaps with adjoiners', status: worst > 2 || deepCorners ? 'bad' : 'warn',
        detail: `${gaps.length} gap(s) and ${overlaps.length} overlap(s) along shared lines, worst ${worst.toFixed(2)} ft${deepCorners ? `; ${deepCorners} neighbour corner(s) sit inside this parcel` : ''}. A surveyor would call these hiatus/overlap areas to resolve.`,
      });
    } else if (adjoinerIds.size) {
      checks.push({ label: 'Gaps / overlaps with adjoiners', status: 'ok', detail: 'Shared lines sit flush (within 0.5 ft) on the city map.' });
    }

    // Record agreement with neighbours' deeds.
    if (legal.hasMetesAndBounds) {
      survey.record = runTraverse(legal.courses);
      const rec = survey.record;
      if (rec) {
        const nbTraverses = neighbours
          .filter(nb => adjoinerIds.has(nb.parcel.id))
          .map(nb => ({ nb, tr: runTraverse(parseLegalDescription(nb.parcel.legalDescription).courses) }))
          .filter(x => x.tr);
        let agreed = 0;
        for (const c of rec.courses) {
          for (const { nb, tr } of nbTraverses) {
            const hit = tr!.courses.map(o => matchCall(c, o)).find(Boolean);
            if (hit) { c.neighbourAgreement = { parcelId: nb.parcel.id, address: nb.parcel.address, ...hit }; agreed++; break; }
          }
        }
        if (nbTraverses.length) {
          checks.push({
            label: "Adjoiners' deeds", status: agreed ? 'ok' : 'info',
            detail: `${agreed} of ${rec.courses.length} record calls match a call in an adjoiner's own description (bearing within 60", distance within 0.25 ft).`,
          });
        }
      }
    }
  } else if (legal.hasMetesAndBounds) {
    survey.record = runTraverse(legal.courses);
  }

  // Record traverse checks.
  const rec = survey.record;
  if (rec) {
    checks.unshift({
      label: 'Record closure', status: rec.closes ? 'ok' : rec.precision >= 1000 ? 'warn' : 'bad',
      detail: rec.misclosure < 0.005
        ? 'The calls close exactly.'
        : `Misclosure ${rec.misclosure.toFixed(2)} ft (precision 1:${Math.round(rec.precision).toLocaleString()}). ${rec.closes ? 'Closes within 1:5,000.' : 'Does not close within 1:5,000 — a call may be misread or missing.'}`,
    });
    if (legal.recordAreaSqFt) {
      const pct = ((rec.areaSqFt - legal.recordAreaSqFt) / legal.recordAreaSqFt) * 100;
      checks.push({
        label: 'Area vs record', status: Math.abs(pct) <= 1 ? 'ok' : Math.abs(pct) <= 5 ? 'warn' : 'bad',
        detail: `Computed ${Math.round(rec.areaSqFt).toLocaleString()} sq ft vs ${Math.round(legal.recordAreaSqFt).toLocaleString()} written (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%).`,
      });
    }
    if (mapped) {
      survey.fit = fitRecordToMap(rec.adjusted.slice(0, -1), mapped.vertices);
      const f = survey.fit;
      checks.push({
        label: 'Record vs city map', status: f.verdict === 'agrees' ? 'ok' : f.verdict === 'roughly' ? 'warn' : 'bad',
        detail: `Best fit puts record corners within ${f.max.toFixed(1)} ft of the mapped line (RMS ${f.rms.toFixed(1)} ft). Basis-of-bearing rotation ${f.rotationDeg >= 0 ? '+' : ''}${f.rotationDeg.toFixed(3)}°.`,
      });
    }
  } else if (legal.courses.length) {
    checks.unshift({ label: 'Record closure', status: 'warn', detail: 'Calls were found but could not be run as a closed traverse.' });
  }

  // Assessor dimensions vs map.
  if (mapped && legal.lotDims) {
    const lens = mapped.sides.map(s => s.length);
    const f = legal.lotDims.frontage;
    const nearestF = lens.reduce((b, l) => (Math.abs(l - f) < Math.abs(b - f) ? l : b), lens[0]);
    const dF = nearestF - f;
    let detail = `Roll says ${f}${legal.lotDims.depth ? ` × ${legal.lotDims.depth}` : ''} ft${legal.lotDims.irregular ? ' (irregular)' : ''}; nearest mapped side to the frontage is ${nearestF.toFixed(2)} ft (${dF >= 0 ? '+' : ''}${dF.toFixed(2)}).`;
    let ok = Math.abs(dF) <= 1;
    if (legal.lotDims.depth) {
      const d = legal.lotDims.depth;
      const nearestD = lens.reduce((b, l) => (Math.abs(l - d) < Math.abs(b - d) ? l : b), lens[0]);
      detail += ` Depth side ${nearestD.toFixed(2)} ft (${nearestD - d >= 0 ? '+' : ''}${(nearestD - d).toFixed(2)}).`;
      ok = ok && Math.abs(nearestD - d) <= 1.5;
    }
    checks.push({ label: 'Plat dimensions vs map', status: ok ? 'ok' : 'warn', detail });
  }
  if (mapped && parcel.lotSqFt) {
    const pct = ((mapped.areaSqFt - parcel.lotSqFt) / parcel.lotSqFt) * 100;
    checks.push({
      label: 'Mapped area vs assessor', status: Math.abs(pct) <= 3 ? 'ok' : Math.abs(pct) <= 10 ? 'warn' : 'info',
      detail: `Map polygon ${Math.round(mapped.areaSqFt).toLocaleString()} sq ft vs assessor ${Math.round(parcel.lotSqFt).toLocaleString()} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`,
    });
  }
  if (!legal.hasMetesAndBounds) {
    checks.push({
      label: 'Legal description', status: 'info',
      detail: legal.plat?.subdivision || legal.plat?.liber
        ? `Platted lot — the plat (${legal.plat?.subdivision ?? 'subdivision'}${legal.plat?.liber ? `, Liber ${legal.plat.liber} Page ${legal.plat.page}` : ''}) holds the bearings and distances; dimensions here come from the city map.`
        : 'No metes-and-bounds calls in the description — dimensions come from the city map.',
    });
  }
  for (const n of legal.notes) checks.push({ label: 'Note', status: 'info', detail: n });
  return survey;
}
