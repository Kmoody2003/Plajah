// The residential hill (city plan, phase 3): the slope north of the canal, west of the Samurai District, climbs in
// terraces held by battered dry-stone retaining walls (ishigaki). Two stepped lanes go straight up it, each riser
// crossed by a flight of stone steps between cheek walls; along each terrace a lane runs under a row of small
// houses (village.ts builds them: chapter1 passes the terrace lanes as one-sided streets). A low board fence
// guards each wall's edge. At the top, on the broad crown of the hill: a temple (gate, main hall on a stone podium,
// three-storey pagoda, bell house, lanterns along the approach) and, at the east end, a lookout tower over the
// roofs, climbed by a stair, with a signal brazier on its balcony.
//
// Static pieces merge per material (a few draw calls for the whole kit); solid ones collide.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collide } from './core/collision';
import { rng } from './core/kit';
import { boxGeo, gableGeo } from './village';

export interface HillMats { wood: THREE.Material; darkWood: THREE.Material; plaster: THREE.Material; tile: THREE.Material; stone: THREE.Material; flags: THREE.Material; lacquer: THREE.Material }
export interface HillSpec { x0: number; x1: number; z0: number; z1: number; step: number; lanes: number[]; laneHalf: number }
export interface Hillside {
  group: THREE.Group;
  footprints: THREE.Box3[];
  /** Where houses must keep clear: the risers and their flights, the lanes, the temple and the lookout. */
  keepOutRect: (cx: number, cz: number, hx: number, hz: number) => boolean;
  /** The terrace lanes (one-sided streets for village.ts: a row of houses on each lane's uphill side). */
  streets: { x0: number; z0: number; x1: number; z1: number; side: 1; off: number; depth: number; noCross: true }[];
  /** Trees for the temple grounds (chapter1 plants them). */
  trees: { x: number; z: number; h: number; blossom: boolean }[];
  spots: {
    temple: THREE.Vector3; templeGate: THREE.Vector3;
    /** The lookout's balcony (its deck height in y), the foot of its stair, and the brazier. */
    lookout: THREE.Vector3; lookoutFoot: THREE.Vector3; brazier: THREE.Vector3;
    /** Hiding places on the hill (the Hidden Children). */
    hides: THREE.Vector3[];
  };
}

export function buildHillside(o: { spec: HillSpec; risers: number[]; heightAt: (x: number, z: number) => number; mats: HillMats }): Hillside {
  const { spec: H, risers, heightAt, mats } = o;
  const R = rng(5113);
  const buckets = new Map<THREE.Material, { solid: THREE.BufferGeometry[]; decor: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const add = (c: THREE.BufferGeometry, mat: THREE.Material, solid: boolean) => {
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    const pp = c.attributes.position as THREE.BufferAttribute, gr = new Float32Array(pp.count);
    for (let i = 0; i < pp.count; i++) gr[i] = Math.max(0, Math.min(1, 1 - (pp.getY(i) - heightAt(pp.getX(i), pp.getZ(i))) / 1.3));
    c.setAttribute('grime', new THREE.BufferAttribute(gr, 1));
    let b = buckets.get(mat); if (!b) { b = { solid: [], decor: [] }; buckets.set(mat, b); }
    (solid ? b.solid : b.decor).push(c);
  };
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, frame: THREE.Matrix4, l: { x?: number; y?: number; z?: number; ry?: number; rx?: number; rz?: number }, solid = true) => {
    e.set(l.rx ?? 0, l.ry ?? 0, l.rz ?? 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(l.x ?? 0, l.y ?? 0, l.z ?? 0), q, one).premultiply(frame);
    add((g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4), mat, solid);
  };
  const frame = (x: number, y: number, z: number, yaw = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one);
  const W0 = frame(0, 0, 0);
  /** A quad strip in world space (p0→p1 along the bottom edge, p3→p2 along the top), UVs in metres. */
  const quads = (pts: number[], uvs: number[], mat: THREE.Material, solid: boolean) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals(); add(g, mat, solid);
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[], mat: THREE.Material, solid = true) =>
    quads([...a, ...b, ...c, ...a, ...c, ...d], [...ua, ...ub, ...uc, ...ua, ...uc, ...ud], mat, solid);
  const footprints: THREE.Box3[] = [];
  const foot = (x: number, z: number, sx: number, sz: number) => footprints.push(new THREE.Box3(new THREE.Vector3(x - sx / 2, -50, z - sz / 2), new THREE.Vector3(x + sx / 2, 200, z + sz / 2)));
  const roof = (F: THREE.Matrix4, w: number, d: number, h: number, y: number, over = 0.8, mat = mats.tile) => {
    put(gableGeo(w, d, h, over), mat, F, { y }, false);
    put(boxGeo(w + over * 2 + 0.05, 0.3, 0.42), mats.darkWood, F, { y: y + h + 0.06 }, false);
    for (const sz of [-1, 1]) put(boxGeo(w + over * 2 + 0.1, 0.16, 0.08), mats.darkWood, F, { y: y - 0.04, z: sz * (d / 2 + over) }, false);
  };
  /** A hipped skirt eave (4-sided frustum) round a body of side w at height y. */
  const eave = (F: THREE.Matrix4, w: number, y: number, over = 1.6, h = 0.9, mat = mats.tile) =>
    put(new THREE.CylinderGeometry((w / 2) * Math.SQRT2 * 0.62, (w / 2 + over) * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4), mat, F, { y: y + h / 2 }, false);
  const yAt = (x: number, z: number) => heightAt(x, z);
  /** A wall along z at x = cx: thickness t, its top following ys over zs, its foot at yb (both faces, top, ends). */
  const ribbonWall = (cx: number, t: number, zs: number[], ys: number[], yb: number, mat = mats.stone) => {
    const pts: number[] = [], uvs: number[] = [], xa = cx - t / 2, xb = cx + t / 2;
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { pts.push(...a, ...b, ...c); uvs.push(...ua, ...ub, ...uc); };
    const qd = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => { tri(a, b, c, ua, ub, uc); tri(a, c, d, ua, uc, ud); };
    for (let i = 0; i < zs.length - 1; i++) {
      const z1 = zs[i], z2 = zs[i + 1], y1 = ys[i], y2 = ys[i + 1];
      qd([xb, yb, z1], [xb, yb, z2], [xb, y2, z2], [xb, y1, z1], [z1 / 2, yb / 2], [z2 / 2, yb / 2], [z2 / 2, y2 / 2], [z1 / 2, y1 / 2]);
      qd([xa, yb, z2], [xa, yb, z1], [xa, y1, z1], [xa, y2, z2], [z2 / 2, yb / 2], [z1 / 2, yb / 2], [z1 / 2, y1 / 2], [z2 / 2, y2 / 2]);
      qd([xa, y1, z1], [xb, y1, z1], [xb, y2, z2], [xa, y2, z2], [xa / 2, z1 / 2], [xb / 2, z1 / 2], [xb / 2, z2 / 2], [xa / 2, z2 / 2]);
    }
    const n = zs.length - 1;
    qd([xa, yb, zs[0]], [xb, yb, zs[0]], [xb, ys[0], zs[0]], [xa, ys[0], zs[0]], [xa / 2, yb / 2], [xb / 2, yb / 2], [xb / 2, ys[0] / 2], [xa / 2, ys[0] / 2]);
    qd([xb, yb, zs[n]], [xa, yb, zs[n]], [xa, ys[n], zs[n]], [xb, ys[n], zs[n]], [xb / 2, yb / 2], [xa / 2, yb / 2], [xa / 2, ys[n] / 2], [xb / 2, ys[n] / 2]);
    quads(pts, uvs, mat, true);
  };
  const inLane = (x: number, pad = 0) => H.lanes.some((l) => Math.abs(x - l) < H.laneHalf + 0.35 + pad);
  const xA = H.x0 + 4, xB = H.x1 - 4;
  /** Wall-free runs along x between the lanes. */
  const runs: [number, number][] = [];
  { let a = xA; for (const l of [...H.lanes].sort((p, q2) => p - q2)) { runs.push([a, l - H.laneHalf - 0.3]); a = l + H.laneHalf + 0.3; } runs.push([a, xB]); }

  // ── The retaining walls: a battered stone face from the toe (buried) to the coping, then a coping strip back
  //    to the terrace above. Each riser is one prism per run (the terraces are level). Coping stones along the top. ─
  const walls: { z: number; yLo: number; yHi: number }[] = [];
  for (const r of risers) {
    const xm = (xA + H.lanes[0]) / 2;
    const yLo = yAt(xm, r - 2.6), yHi = yAt(xm, r + 2.2);
    walls.push({ z: r, yLo, yHi });
    const zt = r - 1.45, zf = r - 0.2, zb = r + 1.35, yb = yLo - 0.6, yt = yHi + 0.12;
    for (const [a, b] of runs) {
      // face
      quad([a, yb, zt], [b, yb, zt], [b, yt, zf], [a, yt, zf], [a / 2, yb / 2], [b / 2, yb / 2], [b / 2, yt / 2], [a / 2, yt / 2], mats.stone);
      // coping (top)
      quad([a, yt, zf], [b, yt, zf], [b, yt, zb], [a, yt, zb], [a / 2, zf / 2], [b / 2, zf / 2], [b / 2, zb / 2], [a / 2, zb / 2], mats.stone);
      // the wall's ends (where it meets a lane's cheek wall or the hill's edge)
      for (const [x, s] of [[a, -1], [b, 1]] as const) {
        const pts = [[x, yb, zt], [x, yt, zf], [x, yt, zb], [x, yb, zb]];
        const [p0, p1, p2, p3] = s > 0 ? pts : [pts[0], pts[3], pts[2], pts[1]];
        quad(p0, p3, p2, p1, [p0[2] / 2, p0[1] / 2], [p3[2] / 2, p3[1] / 2], [p2[2] / 2, p2[1] / 2], [p1[2] / 2, p1[1] / 2], mats.stone);
      }
      // coping stones (cut granite blocks along the top edge, a little irregular)
      for (let x = a + 0.3; x < b - 0.3; x += 0.62 + R() * 0.25) {
        const w = 0.5 + R() * 0.25;
        put(boxGeo(w, 0.2 + R() * 0.06, 0.5), mats.stone, W0, { x, y: yt + 0.08, z: zf + 0.42, ry: (R() - 0.5) * 0.05 }, false);
      }
      // a low board fence along the edge (wooden posts a ken apart, two rails, boards to knee height)
      for (let x = a + 0.4; x < b - 0.3; x += 1.82) {
        put(boxGeo(0.12, 1.05, 0.12), mats.darkWood, W0, { x, y: yt + 0.52, z: zf + 0.12 });
        const span = Math.min(1.82, b - 0.3 - x);
        if (span < 0.4) continue;
        put(boxGeo(span, 0.07, 0.06), mats.darkWood, W0, { x: x + span / 2, y: yt + 0.98, z: zf + 0.12 });
        put(boxGeo(span, 0.42, 0.03), mats.wood, W0, { x: x + span / 2, y: yt + 0.32, z: zf + 0.12 });
      }
    }
  }

  // ── The stepped lanes: flagstone paving up the slope; a flight of steps with cheek walls at every riser ──
  const flights: { l: number; z0: number; z1: number }[] = [];
  for (const l of H.lanes) {
    // paving: a ribbon on the lane's ground, the whole way up
    const pts: number[] = [], uvs: number[] = [];
    const hw = H.laneHalf - 0.05, zs = H.z0 - 1, ze = H.z1 + 2;
    for (let z = zs; z < ze; z += 0.5) {
      const z2 = z + 0.5, y1 = yAt(l, z) + 0.04, y2 = yAt(l, z2) + 0.04;
      pts.push(l - hw, y1, z, l + hw, y1, z, l + hw, y2, z2, l - hw, y1, z, l + hw, y2, z2, l - hw, y2, z2);
      uvs.push((l - hw) / 2.6, z / 2.6, (l + hw) / 2.6, z / 2.6, (l + hw) / 2.6, z2 / 2.6, (l - hw) / 2.6, z / 2.6, (l + hw) / 2.6, z2 / 2.6, (l - hw) / 2.6, z2 / 2.6);
    }
    quads(pts, uvs, mats.flags, false);
    foot(l, (zs + ze) / 2, H.laneHalf * 2 + 1.4, ze - zs);
    for (const w of walls) {
      // the flight: where the lane's ground climbs from the lower terrace to the upper
      const zAtY = (y: number) => { let lo = w.z - 8, hi = w.z + 3; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (yAt(l, m) < y) lo = m; else hi = m; } return lo; };
      const rise = w.yHi - w.yLo, n = Math.max(1, Math.round(rise / 0.19)), h = rise / n;
      const z0 = zAtY(w.yLo + 0.02), z1 = zAtY(w.yHi - 0.02);
      flights.push({ l, z0, z1 });
      for (let i = 0; i < n; i++) {
        const za = zAtY(w.yLo + (i + 0.5) * h), zb = i === n - 1 ? z1 + 0.3 : zAtY(w.yLo + (i + 1.5) * h);
        const top = w.yLo + (i + 1) * h;
        put(boxGeo(H.laneHalf * 2 + 0.1, top - w.yLo + 0.4, zb - za + 0.06), mats.flags, W0, { x: l, y: (top + w.yLo - 0.4) / 2, z: (za + zb) / 2 }, false);
      }
      // cheek walls either side of the flight, a parapet above whichever ground is higher
      for (const s of [-1, 1]) {
        const cx = l + s * (H.laneHalf + 0.32), zs2: number[] = [], ys: number[] = [];
        for (let z = z0 - 0.4; z <= z1 + 1.45; z += 0.3) { zs2.push(z); ys.push(Math.max(yAt(l, z), yAt(l + s * 3.2, z)) + 0.45); }
        // smooth the coping line (a running max of the two grounds has kinks)
        const ysm = ys.map((y, i) => (ys[Math.max(0, i - 1)] + y * 2 + ys[Math.min(ys.length - 1, i + 1)]) / 4);
        ribbonWall(cx, 0.62, zs2, ysm, w.yLo - 0.5);
      }
    }
  }

  // ── The terrace lanes (one-sided streets): along each terrace, just above its wall; houses on the uphill side ──
  const streets: Hillside['streets'] = [];
  const terraces = [H.z0 + 3.5, ...risers.map((r) => r + 1.35)];
  const tops = [...risers.map((r) => r - 1.45), Infinity];
  // (the walk runs along the coping, behind the fence; the houses' fronts open onto it. The bottom terrace is the
  //  canal's north-bank street's.)
  for (let k = 1; k < terraces.length - 1; k++) {
    const za = terraces[k], zb = tops[k], usable = zb - za;
    if (usable < 4) continue;
    const depth = Math.min(5.4, usable - 0.95);
    streets.push({ x0: H.x0 + 2, z0: za - 0.5, x1: H.x1 - 2, z1: za - 0.5, side: 1, off: 1.35 + depth / 2, depth, noCross: true });
  }

  // ── The temple on the crown (on the line of the west lane) ──────────────────────────────────────────
  const trees: Hillside['trees'] = [];
  const TX = H.lanes[1] ?? H.lanes[0], crown = risers[risers.length - 1] + 1.4;
  const gateZ = crown + 2.2, hallZ = gateZ + 14;
  const lantern = (x: number, z: number) => {
    const L = frame(x, yAt(x, z), z);
    put(boxGeo(0.7, 0.24, 0.7), mats.stone, L, { y: 0.12 });
    put(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 8), mats.stone, L, { y: 0.69 });
    put(boxGeo(0.56, 0.38, 0.56), mats.stone, L, { y: 1.33 });
    put(new THREE.ConeGeometry(0.58, 0.36, 4).rotateY(Math.PI / 4), mats.stone, L, { y: 1.7 });
  };
  {
    // the gate (a small roofed four-post gate, yakuimon)
    const G = frame(TX, yAt(TX, gateZ), gateZ);
    for (const sx of [-1, 1]) for (const sz of [-0.5, 0.5]) put(boxGeo(0.34, 3.6, 0.34), mats.darkWood, G, { x: sx * 1.9, y: 1.8, z: sz });
    put(boxGeo(4.6, 0.32, 0.4), mats.darkWood, G, { y: 3.4 });
    put(boxGeo(4.6, 0.26, 1.6), mats.darkWood, G, { y: 3.68 });
    roof(G, 4.4, 2.0, 1.0, 3.8, 0.6);
    // an earthen wall (tsuijibei) either side of the gate: plaster over a stone footing, a tiled cap
    for (const s of [-1, 1]) {
      const len = 13, cx = TX + s * (2.3 + len / 2), y0 = Math.min(yAt(cx - len / 2, gateZ), yAt(cx + len / 2, gateZ));
      const F = frame(cx, y0, gateZ);
      put(boxGeo(len, 0.6, 0.9), mats.stone, F, { y: 0.1 });
      put(boxGeo(len, 1.9, 0.62), mats.plaster, F, { y: 1.35 });
      put(gableGeo(len, 0.62, 0.38, 0.32), mats.tile, F, { y: 2.3 }, false);
    }
    // lanterns up the approach
    for (let z = gateZ + 3; z < hallZ - 6; z += 3.4) for (const s of [-1, 1]) lantern(TX + s * 2.6, z);
    // the approach: flagstones from the gate to the hall
    const pts: number[] = [], uvs: number[] = [];
    for (let z = gateZ - 1; z < hallZ - 5; z += 1) {
      const y = yAt(TX, z) + 0.05;
      pts.push(TX - 1.3, y, z, TX + 1.3, y, z, TX + 1.3, y, z + 1, TX - 1.3, y, z, TX + 1.3, y, z + 1, TX - 1.3, y, z + 1);
      uvs.push(-0.5, z / 2.6, 0.5, z / 2.6, 0.5, (z + 1) / 2.6, -0.5, z / 2.6, 0.5, (z + 1) / 2.6, -0.5, (z + 1) / 2.6);
    }
    quads(pts, uvs, mats.flags, false);
    // the main hall (hondō): a stone podium, a veranda round a body of posts and boarded walls, a deep hipped
    // skirt roof under a gabled upper roof (irimoya), facing south down the lane
    const hw = 13, hd = 10, base = yAt(TX, hallZ) + 0.9;
    const F = frame(TX, base, hallZ);
    put(boxGeo(hw + 3, 1.4, hd + 3), mats.stone, F, { y: -0.2 });
    for (let i = 0; i < 5; i++) put(boxGeo(3.2, 0.18, 0.42), mats.stone, F, { y: -0.75 + i * 0.18 + 0.09, z: hd / 2 + 1.5 + 0.42 * (5 - i) - 0.2 });
    put(boxGeo(hw + 1.6, 0.14, hd + 1.6), mats.wood, F, { y: 0.55 });   // the veranda
    for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) put(new THREE.CylinderGeometry(0.2, 0.22, 4.4, 10), mats.lacquer, F, { x: -hw / 2 + (i * hw) / 6, y: 2.8, z: sz * hd / 2 });
    for (let i = 1; i < 5; i++) for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.2, 0.22, 4.4, 10), mats.lacquer, F, { x: sx * hw / 2, y: 2.8, z: -hd / 2 + (i * hd) / 5 });
    put(boxGeo(hw - 0.4, 3.6, hd - 0.4), mats.darkWood, F, { y: 2.45 });
    put(boxGeo(hw * 0.6, 2.6, 0.05), mats.wood, F, { y: 2.0, z: hd / 2 - 0.18 });   // the open lattice doors
    eave(F, Math.max(hw, hd) + 0.8, 4.8, 2.6, 1.6);
    roof(new THREE.Matrix4().copy(F), hw * 0.72, hd * 0.62, 2.6, 6.2, 0.9);
    put(boxGeo(1.8, 1.0, 0.25), mats.darkWood, F, { y: 6.1, z: hd / 2 + 0.6 });   // the name board
    foot(TX, hallZ, hw + 4, hd + 6);
    // the bell house (shōrō): four splayed posts, a hipped roof, the bronze bell and its swinging beam
    const bx = TX - 11, bz = hallZ - 9, B = frame(bx, yAt(bx, bz), bz);
    put(boxGeo(4.2, 0.6, 4.2), mats.stone, B, { y: 0.1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(boxGeo(0.3, 4.6, 0.3), mats.darkWood, B, { x: sx * 1.6, y: 2.7, z: sz * 1.6, rx: sz * 0.04, rz: -sx * 0.04 });
    put(boxGeo(3.8, 0.28, 3.8), mats.darkWood, B, { y: 5.0 });
    eave(B, 3.4, 5.1, 1.2, 1.3);
    put(new THREE.CylinderGeometry(0.45, 0.62, 1.4, 16, 1), new THREE.MeshStandardNodeMaterial({ color: 0x4a5a4a, metalness: 0.75, roughness: 0.45 }), B, { y: 3.9 }, false);
    put(boxGeo(0.16, 0.16, 2.4), mats.wood, B, { x: 0.9, y: 3.6 }, false);
    foot(bx, bz, 4.4, 4.4);
    // the three-storey pagoda (sanjūnotō), east of the approach
    const px = TX + 12, pz = hallZ - 5, P = frame(px, yAt(px, pz), pz);
    put(boxGeo(6.4, 0.8, 6.4), mats.stone, P, { y: 0.2 });
    for (let i = 0; i < 3; i++) {
      const w = 4.6 - i * 0.7, y = 0.6 + i * 3.3;
      put(boxGeo(w, 2.4, w), i === 0 ? mats.lacquer : mats.lacquer, P, { y: y + 1.2 }, i === 0);
      put(boxGeo(w + 0.5, 0.3, w + 0.5), mats.darkWood, P, { y: y + 2.5 }, false);   // the bracket course
      eave(P, w, y + 2.55, 1.5, 0.7);
    }
    const sorin = new THREE.MeshStandardNodeMaterial({ color: 0x5a5448, metalness: 0.7, roughness: 0.45 });
    put(new THREE.CylinderGeometry(0.09, 0.14, 5.4, 8), sorin, P, { y: 0.6 + 3 * 3.3 + 2.2 }, false);
    for (let i = 0; i < 9; i++) put(new THREE.TorusGeometry(0.34 - i * 0.012, 0.045, 6, 14).rotateX(Math.PI / 2), sorin, P, { y: 0.6 + 3 * 3.3 + 0.6 + i * 0.36 }, false);
    foot(px, pz, 7, 7);
    trees.push({ x: TX - 7, z: gateZ + 5, h: 8, blossom: true }, { x: TX + 7, z: gateZ + 6, h: 7.5, blossom: true },
      { x: TX - 14, z: hallZ + 6, h: 10, blossom: false }, { x: TX + 15, z: hallZ + 7, h: 9, blossom: false }, { x: TX + 6, z: hallZ - 12, h: 7, blossom: false });
  }

  // ── The lookout (a fire-watch tower over the roofs, east end of the crown): four posts braced, a balcony at
  //    6 m with a railing, a stair up one side (0.3 m risers), a roof, and a signal brazier ──────────────────
  let rampMesh: THREE.Mesh | null = null;
  const STAIR_TOP = 0.9;   // where the lookout's stair lands, along the balcony's west side (local z)
  const group0 = new THREE.Group();
  const LX = H.x1 - 10, LZ = crown + 6, ly = yAt(LX, LZ), deckY = 6.0, half = 2.4;
  {
    const T = frame(LX, ly, LZ);
    put(boxGeo(half * 2 + 1, 0.5, half * 2 + 1), mats.stone, T, { y: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(boxGeo(0.34, deckY + 3.0, 0.34), mats.darkWood, T, { x: sx * half, y: (deckY + 3.0) / 2, z: sz * half });
    for (const y of [2.2, 4.4]) for (const s of [-1, 1]) {
      put(boxGeo(half * 2, 0.16, 0.16), mats.darkWood, T, { y, z: s * half }, false);
      put(boxGeo(0.16, 0.16, half * 2), mats.darkWood, T, { y, x: s * half }, false);
    }
    put(boxGeo(half * 2 + 1.2, 0.24, half * 2 + 1.2), mats.wood, T, { y: deckY - 0.12 });   // the balcony floor
    // the railing (solid: nobody falls off), open on the stair side
    for (const s of [-1, 1]) {
      put(boxGeo(half * 2 + 1.2, 1.0, 0.1), mats.wood, T, { y: deckY + 0.5, z: s * (half + 0.55) });
    }
    put(boxGeo(0.1, 1.0, half * 2 + 1.2), mats.wood, T, { y: deckY + 0.5, x: half + 0.55 });
    // (west side: open in the middle, where the stair lands)
    put(boxGeo(0.1, 1.0, 2.9), mats.wood, T, { y: deckY + 0.5, x: -(half + 0.55), z: -1.6 });
    put(boxGeo(0.1, 1.0, 1.65), mats.wood, T, { y: deckY + 0.5, x: -(half + 0.55), z: 2.2 });
    roof(new THREE.Matrix4().copy(T).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0)), half * 2, half * 2, 1.6, deckY + 3.0, 0.9);
    // the stair: along the west side from the north, rising southward to the balcony's open north-west corner
    const n = Math.ceil(deckY / 0.3), run = 0.42;
    const sx = -(half + 1.25), zTop = STAIR_TOP, zBot = zTop + n * run;
    for (let i = 0; i < n; i++) {
      const top = Math.min(deckY, (i + 1) * (deckY / n)), z = STAIR_TOP + 0.21 + (n - 1 - i) * run;
      put(boxGeo(1.2, 0.1, run + 0.06), mats.wood, T, { x: sx, y: top - 0.05, z }, false);
      put(boxGeo(1.2, deckY / n, 0.03), mats.darkWood, T, { x: sx, y: top - (deckY / n) / 2, z: z + run / 2 }, false);   // the riser board
    }
    const sl = Math.hypot(zBot - zTop, deckY), ang = Math.atan2(deckY, zBot - zTop);
    // what the feet walk on: an unseen ramp along the treads' nosings (open treads would snag the step-up)
    {
      const ramp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, sl + 0.2).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial());
      ramp.position.set(LX + sx, ly + deckY / 2 + 0.02, LZ + (zTop + zBot) / 2); ramp.rotation.x = ang;
      ramp.visible = false; ramp.updateMatrix(); rampMesh = collide(ramp);
    }
    for (const ex of [-0.66, 0.66]) {
      put(boxGeo(0.1, 0.3, sl), mats.darkWood, T, { x: sx + ex, y: deckY / 2 - 0.1, z: (zTop + zBot) / 2, rx: ang }, false);   // stringers
      if (ex < 0) put(boxGeo(0.07, 0.07, sl), mats.darkWood, T, { x: sx + ex - 0.04, y: deckY / 2 + 0.85, z: (zTop + zBot) / 2, rx: ang }, true);   // handrail
    }
    for (const f of [0.35, 0.7]) {   // posts under the flight
      const z = zBot - (zBot - zTop) * f, y = deckY * f;
      for (const ex of [-0.66, 0.66]) put(boxGeo(0.14, y, 0.14), mats.darkWood, T, { x: sx + ex, y: y / 2, z }, false);
    }
    for (let i = 1; i < n; i += 4) {   // handrail balusters
      const z = STAIR_TOP + 0.21 + (n - 1 - i) * run, top = (i + 1) * (deckY / n);
      put(boxGeo(0.05, 0.85, 0.05), mats.darkWood, T, { x: sx - 0.7, y: top + 0.42, z }, false);
    }
    // the stair's landing onto the balcony, and its handrail
    put(boxGeo(1.2, 0.2, 1.4), mats.wood, T, { x: -(half + 1.25), y: deckY - 0.1, z: STAIR_TOP - 0.6 });
    // the brazier (an iron basket on a stone block) at the balcony's south-east corner
    put(boxGeo(0.6, 0.5, 0.6), mats.stone, T, { x: half - 0.4, y: deckY + 0.25, z: half - 0.4 });
    foot(LX - 0.8, LZ + 3.3, half * 2 + 4.5, half * 2 + 9);
  }
  if (rampMesh) group0.add(rampMesh);
  const brazier = new THREE.Vector3(LX + half - 0.4, ly + deckY + 0.55, LZ + half - 0.4);

  // ── Merge ────────────────────────────────────────────────────────────────────────────────────────────
  const group = new THREE.Group(); group.name = 'hillside'; group.add(group0);
  for (const [mat, b] of buckets) for (const solid of [true, false]) {
    const list = solid ? b.solid : b.decor; if (!list.length) continue;
    const g = mergeGeometries(list, false); if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(solid ? collide(mesh) : mesh);
  }

  const keepOutRect = (cx: number, cz: number, hx: number, hz: number) => {
    if (cz + hz < H.z0 - 1 || cz - hz > H.z1 + 30 || cx + hx < H.x0 - 2 || cx - hx > H.x1 + 2) return false;   // not on the hill
    if (cx - hx < H.x0 + 7 || cx + hx > H.x1 - 3) return true;
    for (const r of risers) if (cz + hz > r - 1.7 && cz - hz < r + 1.5) return true;
    for (const l of H.lanes) if (Math.abs(cx - l) < hx + H.laneHalf + 0.9) return true;
    for (const f of footprints) if (cx + hx > f.min.x && cx - hx < f.max.x && cz + hz > f.min.z && cz - hz < f.max.z) return true;
    return cz - hz > risers[risers.length - 1];   // the crown is the temple's
  };
  void inLane;

  const V = (x: number, z: number, lift = 0) => new THREE.Vector3(x, yAt(x, z) + lift, z);
  const r0 = risers[0], r2 = risers[Math.min(2, risers.length - 1)];
  return {
    group, footprints, keepOutRect, streets, trees,
    spots: {
      temple: V(TX, hallZ - 7), templeGate: V(TX, gateZ - 2),
      lookout: new THREE.Vector3(LX, ly + deckY, LZ), lookoutFoot: V(LX - half - 1.25, LZ + STAIR_TOP + Math.ceil(deckY / 0.3) * 0.42 + 1.0), brazier,
      hides: [
        V(H.lanes[0] + 2.4, r0 + 0.7, 0.12),              // in the corner of a flight's cheek wall, on the first terrace walk
        V(TX - 11, hallZ - 6.2),                           // behind the bell house
        V(H.x0 + 5.5, r2 + 2.2),                           // at the far west end of a terrace walk
      ],
    },
  };
}
