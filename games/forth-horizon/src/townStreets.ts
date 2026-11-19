import * as THREE from 'three';
import type { CountryScenes, Pt } from './countryScenes';

/**
 * Curbs and sidewalks for the town streets (the subdivisions in user_streets.json), laid out the way a suburban street is built:
 *   carriageway | 15 cm curb (20 cm top) | grass tree lawn | 1.5 m concrete sidewalk | front yards
 * - At a junction the bigger street (or, between equals, the first) owns the corner: its sidewalk runs on to the cross street's curb, where the curb is cut for a ramp,
 *   and the cross street's sidewalk stops where it meets it, so the two walks join in an L like a real corner.
 * - The curb drops (a curb cut) at every driveway and at every ramp, and stops where another road begins.
 * - Nothing is laid where the street mask already paints a downtown sidewalk, on bridge decks, or over water.
 * One mesh for the walks and one for the curbs, whatever the number of streets.
 */
const CURB_H = 0.15, CURB_TOP = 0.2, WALK = 1.5, STEP = 2;

interface Run { line: Pt[]; ys: number[]; half: number; town: boolean; lawn: number; cum: number[] }

export function buildTownSidewalks(
  cs: Pick<CountryScenes, 'pavedRuns' | 'driveMouths'>,
  o: { ground: (x: number, z: number) => number; painted?: (x: number, z: number) => boolean; water?: (x: number, z: number) => boolean; extra?: { line: Pt[]; half: number }[] },
): { group: THREE.Group; near: (x: number, z: number, r: number) => boolean } {
  const group = new THREE.Group(); group.name = 'town-sidewalks';
  // resample every run at 2 m so cuts and ends land where they should
  const dens = (line: Pt[], ys: number[]): { line: Pt[]; ys: number[] } => {
    const L: Pt[] = [], Y: number[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
      for (let k = 0; k < n; k++) { const t = k / n; L.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); Y.push(ys[i] + (ys[i + 1] - ys[i]) * t); }
    }
    L.push(line[line.length - 1]); Y.push(ys[ys.length - 1]);
    return { line: L, ys: Y };
  };
  const runs: Run[] = [];
  for (const r of cs.pavedRuns) {
    const d = dens(r.line, r.ys), cum = [0];
    for (let i = 1; i < d.line.length; i++) cum.push(cum[i - 1] + Math.hypot(d.line[i].x - d.line[i - 1].x, d.line[i].z - d.line[i - 1].z));
    runs.push({ line: d.line, ys: d.ys, half: r.half, town: r.town, lawn: r.half >= 4.6 ? 1.4 : 2.2, cum });
  }
  for (const e of o.extra ?? []) { const d = dens(e.line, e.line.map(() => 0)); runs.push({ line: d.line, ys: d.ys, half: e.half, town: false, lawn: 0, cum: [] }); }
  // segment hash over every road, for "how far is this point from road q"
  const C = 32, seg = new Map<number, number[]>();     // [run, i] pairs
  runs.forEach((r, ri) => {
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1], pad = r.half + 8;
      for (let gx = Math.floor((Math.min(a.x, b.x) - pad) / C); gx <= Math.floor((Math.max(a.x, b.x) + pad) / C); gx++)
        for (let gz = Math.floor((Math.min(a.z, b.z) - pad) / C); gz <= Math.floor((Math.max(a.z, b.z) + pad) / C); gz++) { const k = gx * 100003 + gz; let l = seg.get(k); if (!l) { l = []; seg.set(k, l); } l.push(ri, i); }
    }
  });
  /** for each other road within reach of (x, z): its index and the distance to its centreline */
  const others = (x: number, z: number, self: number, out: Map<number, number>): Map<number, number> => {
    out.clear();
    const l = seg.get(Math.floor(x / C) * 100003 + Math.floor(z / C)); if (!l) return out;
    for (let k = 0; k < l.length; k += 2) {
      const ri = l[k]; if (ri === self) continue;
      const r = runs[ri], a = r.line[l[k + 1]], b = r.line[l[k + 1] + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z), was = out.get(ri);
      if (was === undefined || d < was) out.set(ri, d);
    }
    return out;
  };
  // driveway mouths in a hash
  const MC = 8, mouths = new Map<number, Pt[]>();
  for (const m of cs.driveMouths) { const k = Math.floor(m.x / MC) * 100003 + Math.floor(m.z / MC); (mouths.get(k) ?? (mouths.set(k, []), mouths.get(k)!)).push(m); }
  const nearMouth = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / MC), cz = Math.floor(z / MC);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const m of mouths.get((cx + i) * 100003 + cz + k) ?? []) if ((m.x - x) ** 2 + (m.z - z) ** 2 < r * r) return true;
    return false;
  };
  const owns = (a: number, b: number): boolean => runs[a].half > runs[b].half + 0.3 || (Math.abs(runs[a].half - runs[b].half) <= 0.3 && a < b);

  const wPos: number[] = [], wUv: number[] = [], wIdx: number[] = [];
  const cPos: number[] = [], cIdx: number[] = [];
  const quadC = (a: number[], b: number[], c: number[], d: number[]): void => { const n = cPos.length / 3; cPos.push(...a, ...b, ...c, ...d); cIdx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  const walkPts: number[] = [];
  const tmp = new Map<number, number>();
  let walkM = 0, curbM = 0;
  runs.forEach((r, ri) => {
    if (!r.town) return;
    const n = r.line.length;
    // a cul-de-sac bulb or a loop: no sidewalk on the inside (the island)
    const closed = Math.hypot(r.line[0].x - r.line[n - 1].x, r.line[0].z - r.line[n - 1].z) < r.half * 4 && r.cum[n - 1] < 600;
    let inner = 0;
    if (closed) {
      const cx = r.line.reduce((a, p) => a + p.x, 0) / n, cz = r.line.reduce((a, p) => a + p.z, 0) / n;
      let vote = 0;
      for (let i = 1; i < n - 1; i++) { const dx = r.line[i + 1].x - r.line[i - 1].x, dz = r.line[i + 1].z - r.line[i - 1].z; vote += Math.sign(-dz * (cx - r.line[i].x) + dx * (cz - r.line[i].z)); }
      inner = vote > 0 ? 1 : -1;                                       // the side whose normal points at the centre
    }
    for (const side of [-1, 1]) {
      if (side === inner) continue;
      const o0 = r.half + CURB_TOP + r.lawn, o1 = o0 + WALK;      // sidewalk band, from the centreline
      let prevW: number[] | null = null, prevC: number[] | null = null;
      for (let i = 0; i < n; i++) {
        const p = r.line[i], pa = r.line[Math.max(0, i - 1)], pb = r.line[Math.min(n - 1, i + 1)];
        let dx = pb.x - pa.x, dz = pb.z - pa.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = -dz * side, nz = dx * side, y = r.ys[i];
        const gy = o.ground(p.x, p.z);
        const deck = y - gy > 0.6;                                          // a bridge or causeway deck: no sidewalk
        // ---- sidewalk sample ----
        const wx = p.x + nx * (o0 + WALK / 2), wz = p.z + nz * (o0 + WALK / 2);
        let walk = !deck && !(o.water?.(wx, wz)) && !(o.painted?.(wx, wz));
        if (walk) for (const [q, d] of others(wx, wz, ri, tmp)) {
          const R = runs[q];
          if (d < R.half + CURB_TOP + 0.1) { walk = false; break; }                                         // in the other road
          if (R.lawn && !owns(ri, q) && d < R.half + CURB_TOP + R.lawn + WALK + 0.2) { walk = false; break; }  // the corner belongs to the cross street's walk
        }
        if (walk) {
          const ya = o.ground(p.x + nx * o0, p.z + nz * o0) + 0.07, yb = o.ground(p.x + nx * o1, p.z + nz * o1) + 0.07;
          const A = [p.x + nx * o0, Math.max(ya, y + 0.02), p.z + nz * o0], B = [p.x + nx * o1, Math.max(yb, y + 0.02), p.z + nz * o1];
          if (prevW) {
            const b0 = wPos.length / 3;
            wPos.push(...prevW, ...A, ...B);
            const s0 = r.cum[i - 1] / 1.5, s1 = r.cum[i] / 1.5;
            wUv.push(0, s0, 1, s0, 0, s1, 1, s1);
            wIdx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
            // keep winding the same on both sides (the normal points up)
            if (side < 0) { const t = wIdx.length - 6; [wIdx[t + 1], wIdx[t + 2]] = [wIdx[t + 2], wIdx[t + 1]]; [wIdx[t + 4], wIdx[t + 5]] = [wIdx[t + 5], wIdx[t + 4]]; }
            walkM += STEP;
          }
          prevW = [...A, ...B];
          if (i % 3 === 0) walkPts.push(wx, wz);
        } else prevW = null;
        // ---- curb sample ----
        const cx = p.x + nx * r.half, cz = p.z + nz * r.half;
        let curb = !deck && !(o.water?.(cx, cz)) && !(o.painted?.(cx, cz)) && !nearMouth(cx, cz, 2.4);
        if (curb) for (const [q, d] of others(cx, cz, ri, tmp)) {
          const R = runs[q];
          if (d < R.half + 0.6) { curb = false; break; }                                                    // the mouth of another road
          if (R.lawn && owns(q, ri) && d > R.half + CURB_TOP + R.lawn - 0.3 && d < R.half + CURB_TOP + R.lawn + WALK + 0.3) { curb = false; break; }   // a ramp: the cross street's walk lands here
        }
        if (curb) {
          const base = [cx, y, cz], top = [cx, y + CURB_H, cz], back = [cx + nx * CURB_TOP, y + CURB_H, cz + nz * CURB_TOP];
          const gyb = o.ground(cx + nx * (CURB_TOP + 0.05), cz + nz * (CURB_TOP + 0.05)) + 0.02, foot = [cx + nx * CURB_TOP, Math.min(gyb, y + CURB_H - 0.02), cz + nz * CURB_TOP];
          const cur = [...base, ...top, ...back, ...foot];
          if (prevC) {
            const P = (k: number, arr: number[]): number[] => arr.slice(k * 3, k * 3 + 3);
            const s = side > 0;
            const face = (a0: number, a1: number): void => { if (s) quadC(P(a0, prevC!), P(a0, cur), P(a1, cur), P(a1, prevC!)); else quadC(P(a0, prevC!), P(a1, prevC!), P(a1, cur), P(a0, cur)); };
            face(0, 1); face(1, 2); face(2, 3);
            curbM += STEP;
          }
          prevC = cur;
        } else prevC = null;
      }
    }
  });
  if (wPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2)); g.setIndex(wIdx); g.computeVertexNormals();
    const tl = new THREE.TextureLoader(), T = '/games/forth-horizon/tex/';
    const t = (f: string, srgb: boolean): THREE.Texture => { const x = tl.load(T + f); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; x.anisotropy = 4; return x; };
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t('ground_concrete_sidewalk.png', true), normalMap: t('ground_concrete_sidewalk_normal.png', false), color: 0xd6d3cc, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.receiveShadow = true; m.name = 'town-walks'; group.add(m);
  }
  if (cPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3)); g.setIndex(cIdx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xbdbab2, roughness: 0.85, side: THREE.DoubleSide }));
    m.receiveShadow = true; m.name = 'town-curbs'; group.add(m);
  }
  console.log('town sidewalks', Math.round(walkM / 1000), 'km of walk,', Math.round(curbM / 1000), 'km of curb');
  // keep street trees and props off the walks
  const WC = 16, wg = new Map<number, number[]>();
  for (let i = 0; i < walkPts.length; i += 2) { const k = Math.floor(walkPts[i] / WC) * 100003 + Math.floor(walkPts[i + 1] / WC); (wg.get(k) ?? (wg.set(k, []), wg.get(k)!)).push(walkPts[i], walkPts[i + 1]); }
  const near = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / WC), cz = Math.floor(z / WC), rr = (r + 1.0) ** 2;
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { const a = wg.get((cx + i) * 100003 + cz + k); if (a) for (let n = 0; n < a.length; n += 2) if ((a[n] - x) ** 2 + (a[n + 1] - z) ** 2 < rr) return true; }
    return false;
  };
  return { group, near };
}
