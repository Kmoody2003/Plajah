// The landmarks every reference shot is composed around: a snow-capped volcano far up the valley beside the
// low sun, the castle keep on its own hill in the middle distance (stone ishigaki base, white plaster tiers,
// dark kawara roofs, corner turrets), and layered forested hills between, so the valley never ends in open sea.
// The haze (look.ts) turns all of it into the soft, warm silhouettes of the shots.
import * as THREE from 'three/webgpu';
import { positionLocal, positionWorld, normalWorld, mix, smoothstep, vec3, float, sin, atan, color, texture, vec2, normalMap, attribute, abs } from 'three/tsl';
import { pbr } from './core/materials';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

function hash2(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number) => vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.27 + vnoise(x * 4.3, z * 4.3) * 0.14 + vnoise(x * 8.7, z * 8.7) * 0.09;

export interface TreeAt { x: number; y: number; z: number; h: number }
export interface Landmarks { group: THREE.Group; castle: THREE.Group; castleAt: THREE.Vector3; mountainAt: THREE.Vector3;
  /** Umbrella-pine spots for the forest: full 3D on the valley walls, impostors beyond. */
  treeNear: TreeAt[]; treeFar: TreeAt[] }

export function buildLandmarks(o: { inner: { xMin: number; xMax: number; zMin: number; zMax: number }; heightAt: (x: number, z: number) => number }): Landmarks {
  const group = new THREE.Group(); group.name = 'landmarks';
  const { inner } = o;

  // ── The volcano: Fuji's concave profile on a dense radial mesh, cut by erosion gullies that deepen toward the
  //    summit; aerial rock on the flanks, forest at the foot, snow lying in the gullies below the snow line ──
  const mountainAt = new THREE.Vector3(-420, 0, 4300);
  const H = 980, R = 3400;
  {
    const RINGS = 110, SEGS = 320;
    const pos = new Float32Array((RINGS + 1) * (SEGS + 1) * 3), gul = new Float32Array((RINGS + 1) * (SEGS + 1));
    const ridged = (v: number) => 1 - Math.abs(2 * v - 1);
    for (let j = 0; j <= RINGS; j++) {
      // rings packed toward the summit, where the gullies are (and where the eye goes)
      const t = j / RINGS, r = R * (1 - Math.pow(t, 0.8) * 0.955);
      const y0 = H * Math.pow(1 - r / R, 2.2), up = y0 / H;
      for (let i = 0; i <= SEGS; i++) {
        const a = (i / SEGS) * Math.PI * 2;
        // gullies: ridged noise round the cone, finer and deeper toward the top, wandering with height
        const wob = fbm(Math.cos(a) * 3 + up * 2, Math.sin(a) * 3) * 1.4;
        const g1 = ridged(vnoise(a * 18 + wob, up * 3)), g2 = ridged(vnoise(a * 47 + wob * 2, up * 7 + 3));
        const cut = Math.pow(Math.max(0, 1 - (g1 * 0.65 + g2 * 0.35)), 1.6);          // 1 in a gully floor
        const depth = (18 + 70 * up) * Math.min(1, up * 3.2);                          // none at the foot
        const rr = r * (1 + 0.012 * (fbm(a * 4, up * 4) - 0.5)) - cut * depth * 0.6;
        const yy = y0 - cut * depth * 0.5 + (j === RINGS ? -35 * fbm(a * 5, 1) : 0) + 6 * (fbm(a * 30, up * 20) - 0.5) * up;
        const k = j * (SEGS + 1) + i;
        pos.set([Math.cos(a) * rr, yy, Math.sin(a) * rr], k * 3); gul[k] = cut;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEGS; i++) { const k = j * (SEGS + 1) + i, k2 = k + SEGS + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('gully', new THREE.BufferAttribute(gul, 1));
    mg.setIndex(idx); mg.computeVertexNormals();
    const RK = pbr('aerial_rocks_02'), GR = pbr('aerial_grass_rock');
    const mm = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, side: THREE.DoubleSide });
    const ly: N = positionLocal.y, gully: N = attribute('gully', 'float');
    const ang: N = atan(positionLocal.z, positionLocal.x);
    // rock projected round the cone (angle × height), so the strata run with the slope
    const uvR: N = vec2(ang.mul(R / 140), ly.div(90));
    const rock: N = texture(RK.diff, uvR).rgb.mul(vec3(0.62, 0.6, 0.6));
    const foot: N = texture(GR.diff, positionLocal.xz.div(260)).rgb.mul(vec3(0.7, 0.85, 0.66));
    // the snow line, ragged; snow reaches lower down the gullies and leaves the ridges bare near its edge
    const line: N = float(H * 0.58).add(sin(ang.mul(23)).mul(28)).add(sin(ang.mul(7).add(1.3)).mul(34)).sub(gully.mul(120));
    const snow: N = smoothstep(line.sub(18), line.add(30), ly);
    const snowCol: N = mix(vec3(0.86, 0.88, 0.92), vec3(0.97, 0.96, 0.94), smoothstep(H * 0.6, H, ly));
    const lower: N = mix(foot, rock, smoothstep(H * 0.12, H * 0.3, ly));
    mm.colorNode = mix(lower.mul(gully.mul(-0.25).add(1)), snowCol, snow);
    mm.normalNode = normalMap(texture(RK.nor, uvR));
    const mountain = new THREE.Mesh(mg, mm);
    mountain.position.copy(mountainAt);
    group.add(mountain);
  }

  // ── Far land: forested hills ringing the play area and climbing toward the mountain. One mesh whose grid is
  //    packed near the valley (metres between vertices) and loose at the horizon (tens of metres), shaped by
  //    eroded (ridged) noise, painted with aerial grass-over-rock and bare rock on the steeps. ─────────────
  const fx = 9000, seg = 300, FC = new THREE.Vector2(0, 300), half = fx / 2, WP = 2.0;
  const warp = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), WP) * half;         // grid → world (u in −1…1)
  const unwarp = (w: number) => Math.sign(w) * Math.pow(Math.min(1, Math.abs(w) / half), 1 / WP);
  const castleAt = new THREE.Vector3(62, 0, 400);   // on the sightline up the street, left of the mountain (the street shot)
  const ridgedFbm = (x: number, z: number) => { let v = 0, a = 0.5, f = 1; for (let k = 0; k < 5; k++) { const n = 1 - Math.abs(2 * vnoise(x * f, z * f) - 1); v += n * n * a; a *= 0.5; f *= 2.03; } return v; };
  const farHeight = (x: number, z: number) => {
    const ox = Math.max(0, inner.xMin + 2 - x, x - inner.xMax + 2), oz = Math.max(0, z - inner.zMax + 2);
    const out = Math.hypot(ox, oz);
    if (!(z > -470 && out > 0)) return -30;   // (the coast: river.ts COAST_DZ)
    const ridge = Math.min(1, out / 160);
    const axis = Math.abs(x + 0.0977 * z), side = THREE.MathUtils.smoothstep(axis, 160 + z * 0.06, 700 + z * 0.12);
    // big forms, eroded ridges on the slopes, small relief everywhere
    const big = 190 * fbm(x / 900, z / 900) + 120 * ridgedFbm(x / 700, z / 700) * side;
    let y = (6 + 26 * fbm(x / 220, z / 220) + side * big + 9 * (fbm(x / 48, z / 48) - 0.5) + 3 * (vnoise(x / 13, z / 13) - 0.5)) * ridge
      + o.heightAt(THREE.MathUtils.clamp(x, inner.xMin, inner.xMax), THREE.MathUtils.clamp(z, inner.zMin, inner.zMax)) * (1 - ridge);
    y *= THREE.MathUtils.smoothstep(z, -470, -360);
    const dc = Math.hypot(x - castleAt.x, z - castleAt.z);
    return Math.max(y * (dc < 220 ? THREE.MathUtils.smoothstep(dc, 60, 220) : 1), dc < 140 ? 46 * (1 - THREE.MathUtils.smoothstep(dc, 70, 140)) : 0);
  };
  const fg = new THREE.PlaneGeometry(2, 2, seg, seg); fg.rotateX(-Math.PI / 2);
  const fp = fg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) {
    const x = warp(fp.getX(i)) + FC.x, z = warp(fp.getZ(i)) + FC.y;
    fp.setXYZ(i, x, farHeight(x, z), z);
  }
  fg.computeVertexNormals();
  {
    const GR = pbr('aerial_grass_rock'), RK = pbr('aerial_rocks_02'), FG = pbr('forrest_ground_01');
    const fm = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    const pw: N = positionWorld, n: N = normalWorld;
    const uvA: N = pw.xz.div(90), uvB: N = pw.xz.div(23);
    // grass-over-rock at two scales (kills the tiling), forest floor in the hollows, rock on the steeps
    const grass: N = texture(GR.diff, uvA).rgb.mul(texture(GR.diff, uvB).rgb.mul(0.6).add(0.55)).mul(vec3(0.5, 0.62, 0.42));   // under forest: dark
    const forest: N = texture(FG.diff, pw.xz.div(14)).rgb.mul(vec3(0.5, 0.62, 0.42));
    const uvS: N = mix(vec2(pw.z, pw.y), vec2(pw.x, pw.y), smoothstep(0.4, 0.7, abs(n.z))).div(40);
    const rock: N = texture(RK.diff, uvS).rgb.mul(0.8);
    const macro: N = texture(GR.diff, pw.xz.div(1100)).rgb.dot(vec3(0.33, 0.33, 0.33)).mul(0.9).add(0.55);
    const steep: N = smoothstep(0.82, 0.6, n.y);
    const hollow: N = smoothstep(30, 0, pw.y).mul(0.6);
    fm.colorNode = mix(mix(grass, forest, hollow), rock, steep).mul(macro);
    fm.normalNode = normalMap(mix(texture(GR.nor, uvA).rgb, texture(RK.nor, uvS).rgb, steep));
    const farLand = new THREE.Mesh(fg, fm); farLand.receiveShadow = false;
    group.add(farLand);
  }
  castleAt.y = 46;
  // the far land's height where it is actually drawn (bilinear on the warped grid), for placing things on it
  const farAt = (x: number, z: number) => {
    const gx = (unwarp(x - FC.x) + 1) / 2 * seg, gz = (unwarp(z - FC.y) + 1) / 2 * seg;
    const i0 = Math.max(0, Math.min(seg - 1, Math.floor(gx))), j0 = Math.max(0, Math.min(seg - 1, Math.floor(gz)));
    const tx = gx - i0, tz = gz - j0, at = (i: number, j: number) => fp.getY(j * (seg + 1) + i);
    return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - tz) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * tz;
  };
  const inside = (x: number, z: number) => x > inner.xMin + 1 && x < inner.xMax - 1 && z < inner.zMax - 1 && z > inner.zMin;
  const groundY = (x: number, z: number) => (inside(x, z) ? o.heightAt(x, z) : farAt(x, z));
  const slope = (x: number, z: number, r = 4) => Math.hypot(groundY(x + r, z) - groundY(x - r, z), groundY(x, z + r) - groundY(x, z - r)) / (2 * r);

  // ── The town beyond: a carpet of roofs from the valley head to the castle hill (the shots' sea of roofs) ──
  {
    const bodyG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const pr = new THREE.Shape(); pr.moveTo(-0.62, 0); pr.lineTo(0, 0.5); pr.lineTo(0.62, 0); pr.lineTo(-0.62, 0);
    const roofG = new THREE.ExtrudeGeometry(pr, { depth: 1.12, bevelEnabled: false }).translate(0, 0, -0.56).rotateY(Math.PI / 2);
    const MAXN = 900;
    // seen from the hilltop and down the street: plaster walls over a dark timber skirt, tiled kawara roofs
    const PL = pbr('painted_plaster_wall'), RT = pbr('grey_roof_tiles');
    const bodyMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    const pw: N = positionWorld;
    const skirt: N = smoothstep(1.25, 1.1, positionLocal.y.mul(3.2));   // the lower third of each house (unit box)
    bodyMat.colorNode = mix(texture(PL.diff, vec2(pw.x.add(pw.z), pw.y).div(3)).rgb, vec3(0.16, 0.12, 0.09), skirt);
    const roofMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    roofMat.colorNode = texture(RT.diff, pw.xz.div(2.2)).rgb.mul(vec3(0.5, 0.53, 0.6));
    roofMat.normalNode = normalMap(texture(RT.nor, pw.xz.div(2.2)));
    const bodies = new THREE.InstancedMesh(bodyG, bodyMat, MAXN);
    const roofs = new THREE.InstancedMesh(roofG, roofMat, MAXN);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const walls = [0xe6dccb, 0xd9cdb6, 0x6a4a32, 0x5a3e2a, 0xeee6d6].map((c) => new THREE.Color(c));
    let n = 0;
    for (let gz = 150; gz < 560 && n < MAXN; gz += 8.5) for (let gx = -260; gx < 300 && n < MAXN; gx += 8.5) {
      if (Math.round(gz / 8.5) % 4 === 0 || Math.round(gx / 8.5) % 5 === 0) continue;   // streets
      const x = gx + (hash2(gx, gz) - 0.5) * 3, z = gz + (hash2(gz, gx) - 0.5) * 3;
      if (inside(x, z)) continue;
      const dc = Math.hypot(x - castleAt.x, z - castleAt.z);
      if (dc < 120) continue;                                  // the castle's own hill and moat
      if (Math.abs(x + 0.0977 * z) > 230 + (z - 150) * 0.15) continue;   // the town fills the valley floor
      if (hash2(x * 3, z * 7) < 0.18 || slope(x, z) > 0.32) continue;
      const w = 5 + hash2(x, z * 2) * 4, d = 4.5 + hash2(z, x * 2) * 2.5, h = 3 + (hash2(x * 5, z) < 0.5 ? 0 : 2.2);
      const yaw = (hash2(gx * 0.1, gz * 0.1) < 0.5 ? 0 : Math.PI / 2) + 0.08 * (hash2(x, z) - 0.5);
      const y = groundY(x, z) - 0.3;
      q.setFromAxisAngle(up, yaw);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d)); bodies.setMatrixAt(n, m4);
      bodies.setColorAt(n, walls[(hash2(x * 9, z * 3) * walls.length) | 0]);
      m4.compose(new THREE.Vector3(x, y + h, z), q, new THREE.Vector3(w + 1.2, 2.4 + hash2(x, z * 5) * 0.8, d + 1)); roofs.setMatrixAt(n, m4);
      n++;
    }
    bodies.count = roofs.count = n;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    bodies.computeBoundingSphere(); roofs.computeBoundingSphere();
    group.add(bodies, roofs);
  }

  // ── Pines (the shots' umbrella pines): spots for the ez-tree forest (core/forest.ts, planted by chapter1):
  //    full 3D trees on the valley walls, baked impostors on the far hills and round the castle ──────────
  const treeNear: { x: number; y: number; z: number; h: number }[] = [], treeFar: { x: number; y: number; z: number; h: number }[] = [];
  {
    const MAXP = 22000;
    let n = 0, far = false;
    const plant = (x: number, z: number, s: number) => {
      if (n >= MAXP) return;
      (far ? treeFar : treeNear).push({ x, y: groundY(x, z) - 0.3, z, h: s * 1.05 });
      n++;
    };
    // the valley walls inside the play area (bare slopes in the first pass)
    // the hillsides in view of the city: dense woods (Ravencrest's standard), stands with the odd clearing
    for (let z = -450; z < 175; z += 2.1) for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) {
      const x = sd > 0 ? 45 + hash2(z, k * 7 + sd) * 44 : -(162 + hash2(z, k * 7 + sd) * 22);
      if (hash2(x, z + k) < 0.22 || fbm(x / 40, z / 40) < 0.3) continue;
      plant(x, z + (hash2(k, z) - 0.5) * 2.5, 7 + hash2(x * 2, z) * 6);
    }
    // the hills outside, thick where they rise, thin on the valley floor
    far = true;
    for (let i = 0; i < 110000 && n < MAXP; i++) {
      const x = (hash2(i, 1.7) - 0.5) * 2400, z = -440 + hash2(2.3, i) * 1900;
      if (inside(x, z) || Math.hypot(x - castleAt.x, z - castleAt.z) < 80) continue;
      const y = groundY(x, z); if (y < 4) continue;
      const axis = Math.abs(x + 0.0977 * z);
      if (axis < 200 && hash2(i, 9) < 0.85) continue;          // the town's valley floor
      if (fbm(x / 260, z / 260) < 0.36) continue;              // clearings: the forest grows in stands, not evenly
      plant(x, z, 9 + hash2(i, 3) * 9);
    }
    // round the castle hill
    // the castle ring stays impostors (400 m out)
    for (let i = 0; i < 160; i++) { const a = i * 2.4, r = 90 + hash2(i, 5) * 60; plant(castleAt.x + Math.cos(a) * r, castleAt.z + Math.sin(a) * r, 8 + hash2(i, 8) * 5); }
  }

  // ── The castle keep: ishigaki base, five white tiers under flared kawara roofs, two turrets ──────────
  const S = pbr('japanese_stone_wall'), T = pbr('grey_roof_tiles');
  const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  stone.colorNode = texture(S.diff, positionWorld.xy.add(positionWorld.zy).mul(1 / 4)).rgb.mul(vec3(0.95, 0.93, 0.9));
  const plaster = new THREE.MeshStandardNodeMaterial({ color: 0xece6d8, roughness: 0.85 });
  const roof = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  roof.colorNode = texture(T.diff, positionWorld.xz.mul(1 / 3)).rgb.mul(vec3(0.62, 0.66, 0.74));
  roof.normalNode = normalMap(texture(T.nor, positionWorld.xz.mul(1 / 3)));
  const timber = new THREE.MeshStandardNodeMaterial({ color: 0x2a221c, roughness: 0.8 });
  void vec2;
  const castle = new THREE.Group(); castle.name = 'castle';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(24, 33, 16, 4, 1), stone); base.rotation.y = Math.PI / 4; base.position.y = 8; castle.add(base);
  const tier = (w: number, d: number, h: number, y: number, eave: number) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster); body.position.y = y + h / 2; castle.add(body);
    // dark timber band and windows under the eave
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.6, d + 0.1), timber); band.position.y = y + h - 0.3; castle.add(band);
    for (const side of [-1, 1]) for (let k = -2; k <= 2; k++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 0.2), timber); win.position.set(k * w / 6, y + h * 0.55, side * (d / 2 + 0.05)); castle.add(win);
    }
    // the flared hip roof: a four-sided frustum, wider than the tier, kicked up at the eaves
    const r = new THREE.Mesh(new THREE.CylinderGeometry((Math.max(w, d) * 0.5) * 0.62, (Math.max(w, d) * 0.5 + eave) * 1.414, 2.6, 4, 1), roof);
    r.rotation.y = Math.PI / 4; r.scale.set(1, 1, d / w); r.position.y = y + h + 1.3; castle.add(r);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry((Math.max(w, d) * 0.5 + eave) * 1.414, (Math.max(w, d) * 0.5 + eave + 0.4) * 1.414, 0.35, 4, 1), roof);
    lip.rotation.y = Math.PI / 4; lip.scale.set(1, 1, d / w); lip.position.y = y + h + 0.05; castle.add(lip);
    // a karahafu-style gable on the front
    const gab = new THREE.Mesh(new THREE.ConeGeometry(w * 0.22, 2.2, 3), roof); gab.rotation.z = 0; gab.position.set(0, y + h + 1.6, d / 2 + eave * 0.6); gab.rotation.x = 0.2; castle.add(gab);
  };
  let y = 16;
  [[30, 26, 7.5, 3.2], [25, 21, 6.5, 2.8], [20, 17, 6, 2.5], [15, 13, 5.5, 2.2], [11, 10, 5, 2]].forEach(([w, d, h, e]) => { tier(w, d, h, y, e); y += h + 2.4; });
  const finial = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.6), new THREE.MeshStandardNodeMaterial({ color: 0xc9a040, metalness: 0.8, roughness: 0.35 })); finial.position.y = y + 0.4; castle.add(finial);
  for (const [tx, tz] of [[-38, 22], [36, 30], [-30, -34]]) {
    const t = new THREE.Group();
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 11, 9, 4, 1), stone); b2.rotation.y = Math.PI / 4; b2.position.y = 4.5; t.add(b2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 9), plaster); body.position.y = 12; t.add(body);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 9.5, 2.6, 4, 1), roof); r.rotation.y = Math.PI / 4; r.position.y = 16.3; t.add(r);
    t.position.set(tx, 0, tz); castle.add(t);
  }
  // the outer walls between the turrets
  // (the outer walls between the turrets are gone: the castle's top is walkable now, walled round its rim by
  //  castleHill.ts)
  for (const [ax, az, bx, bz] of [] as number[][]) {
    const len = Math.hypot(bx - ax, bz - az);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(len, 7, 2.2), plaster); w2.position.set((ax + bx) / 2, 9.5, (az + bz) / 2); w2.rotation.y = -Math.atan2(bz - az, bx - ax); castle.add(w2);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 5), stone); s2.position.set((ax + bx) / 2, 3, (az + bz) / 2); s2.rotation.y = w2.rotation.y; castle.add(s2);
  }
  castle.traverse((m) => { (m as THREE.Mesh).castShadow = false; });
  castle.position.copy(castleAt);
  castle.rotation.y = Math.PI + 0.25;   // the keep's face toward the town
  group.add(mergeByMaterial(castle));   // ~90 pieces → one draw per material
  return { group, castle, castleAt, mountainAt, treeNear, treeFar };
}

/** Bake a built group into one mesh per material (its own transform kept): a few draw calls instead of one a piece. */
function mergeByMaterial(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), m4 = new THREE.Matrix4();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    (by.get(m.material) ?? by.set(m.material, []).get(m.material)!).push(g);
  });
  const out = new THREE.Group(); out.name = root.name;
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const [mat, list] of by) {
    const g = mergeGeometries(list, false); if (!g) continue;
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false; mesh.receiveShadow = true; out.add(mesh);
  }
  return out;
}
