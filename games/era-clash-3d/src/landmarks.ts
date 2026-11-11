// The landmarks every reference shot is composed around: a snow-capped volcano far up the valley beside the
// low sun, the castle keep on its own hill in the middle distance (stone ishigaki base, white plaster tiers,
// dark kawara roofs, corner turrets), and layered forested hills between, so the valley never ends in open sea.
// The haze (look.ts) turns all of it into the soft, warm silhouettes of the shots.
import * as THREE from 'three/webgpu';
import { positionLocal, positionWorld, mix, smoothstep, vec3, float, sin, atan, color, texture, vec2, normalMap } from 'three/tsl';
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

export interface Landmarks { group: THREE.Group; castle: THREE.Group; castleAt: THREE.Vector3; mountainAt: THREE.Vector3 }

export function buildLandmarks(o: { inner: { xHalf: number; zMin: number; zMax: number }; heightAt: (x: number, z: number) => number }): Landmarks {
  const group = new THREE.Group(); group.name = 'landmarks';
  const { inner } = o;

  // ── The volcano: a concave cone (Fuji's profile), gullied flanks, a ragged snow cap ────────────────
  const mountainAt = new THREE.Vector3(-420, 0, 4300);
  const H = 980, R = 3400;
  // concave flanks (y = H(1 − r/R)^2.2), steep near the summit, cut off at the crater rim
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) { const r = R * (1 - (i / 48) * 0.955); prof.push(new THREE.Vector2(r, H * Math.pow(1 - r / R, 2.2))); }
  const mg = new THREE.LatheGeometry(prof, 160);
  const mp = mg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const gully = 1 + 0.035 * Math.sin(a * 46) * (y / H) + 0.05 * (fbm(a * 3, y / 200) - 0.5);
    mp.setXYZ(i, x * gully, y + (r > R * 0.9 ? -40 * fbm(a * 5, 1) : 0), z * gully);
  }
  mg.computeVertexNormals();
  const mm = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, side: THREE.DoubleSide });
  const ang: N = atan(positionLocal.z, positionLocal.x);
  const snowLine: N = float(H * 0.6).add(sin(ang.mul(46)).mul(55)).add(sin(ang.mul(9).add(1.3)).mul(30));
  const snow: N = smoothstep(snowLine.sub(25), snowLine.add(25), positionLocal.y);
  mm.colorNode = mix(mix(color(0x2c3238), color(0x4a4640), smoothstep(0, H * 0.4, positionLocal.y)), color(0xf2f0ea), snow);
  const mountain = new THREE.Mesh(mg, mm);
  mountain.position.copy(mountainAt);
  group.add(mountain);

  // ── Far land: forested hills ringing the play area and climbing toward the mountain ────────────────
  const fx = 9000, fz = 9000, seg = 180;
  const fg = new THREE.PlaneGeometry(fx, fz, seg, seg); fg.rotateX(-Math.PI / 2);
  const fp = fg.attributes.position as THREE.BufferAttribute;
  const castleAt = new THREE.Vector3(62, 0, 400);   // on the sightline up the street, left of the mountain (the street shot)
  const colors = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i) + 1800;
    // outside the playable terrain only; seaward (z < −60) stays sea
    const ox = Math.max(0, Math.abs(x) - inner.xHalf + 2), oz = Math.max(0, z - inner.zMax + 2);
    const out = Math.hypot(ox, oz);
    let y = -30;
    if (z > -70 && out > 0) {
      const ridge = Math.min(1, out / 160);
      // a low corridor along the sightline up the valley (to the castle and the mountain), big hills either side
      const axis = Math.abs(x + 0.0977 * z), side = THREE.MathUtils.smoothstep(axis, 160 + z * 0.06, 700 + z * 0.12);
      y = (6 + 26 * fbm(x / 220, z / 220) + side * (190 * fbm(x / 900, z / 900) + 70 * fbm(x / 160, z / 160))) * ridge + o.heightAt(THREE.MathUtils.clamp(x, -inner.xHalf, inner.xHalf), THREE.MathUtils.clamp(z, inner.zMin, inner.zMax)) * (1 - ridge);
      y *= THREE.MathUtils.smoothstep(z, -70, 40);
      // the castle hill: a plateau with the keep on it
      const dc = Math.hypot(x - castleAt.x, z - castleAt.z);
      y = Math.max(y * (dc < 220 ? THREE.MathUtils.smoothstep(dc, 60, 220) : 1), dc < 140 ? 46 * (1 - THREE.MathUtils.smoothstep(dc, 70, 140)) : 0);
    }
    fp.setXYZ(i, x, y, z);
    const g = 0.6 + 0.4 * fbm(x / 120, z / 120);
    colors.set([0.11 * g, 0.16 * g, 0.09 * g], i * 3);
  }
  fg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fg.computeVertexNormals();
  const fm = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1 });
  const farLand = new THREE.Mesh(fg, fm); farLand.receiveShadow = false;
  group.add(farLand);
  castleAt.y = 46;
  // the far land's height where it is actually drawn (bilinear on the mesh grid), for placing things on it
  const cell = fx / seg;
  const farAt = (x: number, z: number) => {
    const gx = (x + fx / 2) / cell, gz = (z - 1800 + fz / 2) / cell;
    const i0 = Math.max(0, Math.min(seg - 1, Math.floor(gx))), j0 = Math.max(0, Math.min(seg - 1, Math.floor(gz)));
    const tx = gx - i0, tz = gz - j0, at = (i: number, j: number) => fp.getY(j * (seg + 1) + i);
    return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - tz) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * tz;
  };
  const inside = (x: number, z: number) => Math.abs(x) < inner.xHalf - 1 && z < inner.zMax - 1 && z > inner.zMin;
  const groundY = (x: number, z: number) => (inside(x, z) ? o.heightAt(x, z) : farAt(x, z));
  const slope = (x: number, z: number, r = 4) => Math.hypot(groundY(x + r, z) - groundY(x - r, z), groundY(x, z + r) - groundY(x, z - r)) / (2 * r);

  // ── The town beyond: a carpet of roofs from the valley head to the castle hill (the shots' sea of roofs) ──
  {
    const bodyG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const pr = new THREE.Shape(); pr.moveTo(-0.62, 0); pr.lineTo(0, 0.5); pr.lineTo(0.62, 0); pr.lineTo(-0.62, 0);
    const roofG = new THREE.ExtrudeGeometry(pr, { depth: 1.12, bevelEnabled: false }).translate(0, 0, -0.56).rotateY(Math.PI / 2);
    const MAXN = 900;
    const bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }), MAXN);
    const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardNodeMaterial({ color: 0x3a3e46, roughness: 0.55 }), MAXN);
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

  // ── Pines (the shots' umbrella pines): a trunk and layered flat canopies, instanced over the hills ─────
  {
    const parts: THREE.BufferGeometry[] = [];
    const paint = (g: THREE.BufferGeometry, c: number) => { const col = new THREE.Color(c), n2 = g.attributes.position.count, a = new Float32Array(n2 * 3); for (let i = 0; i < n2; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    parts.push(paint(new THREE.CylinderGeometry(0.035, 0.07, 1, 5).translate(0, 0.5, 0), 0x3a2a20));
    for (const [ox, oy, oz, r] of [[0, 0.95, 0, 0.42], [0.22, 0.72, 0.05, 0.32], [-0.2, 0.6, -0.08, 0.3], [0.05, 0.48, 0.2, 0.26]]) {
      const g = new THREE.SphereGeometry(r, 7, 4); g.scale(1, 0.38, 1); g.translate(ox, oy, oz);
      parts.push(paint(g, 0x1e2c1a));
    }
    const pineG = mergeGeometries(parts)!;
    const MAXP = 2600;
    const pines = new THREE.InstancedMesh(pineG, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1 }), MAXP);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const plant = (x: number, z: number, s: number) => {
      if (n >= MAXP) return;
      q.setFromAxisAngle(up, hash2(x, z) * 6.28);
      m4.compose(new THREE.Vector3(x, groundY(x, z) - 0.3, z), q, new THREE.Vector3(s, s * (0.9 + hash2(z, x) * 0.3), s));
      pines.setMatrixAt(n++, m4);
    };
    // the valley walls inside the play area (bare slopes in the first pass)
    for (let z = -50; z < 175; z += 3.2) for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x = sd * (46 + hash2(z, k * 7 + sd) * 27);
      if (hash2(x, z + k) < 0.35) continue;
      plant(x, z + (hash2(k, z) - 0.5) * 2.5, 7 + hash2(x * 2, z) * 6);
    }
    // the hills outside, thick where they rise, thin on the valley floor
    for (let i = 0; i < 9000 && n < MAXP; i++) {
      const x = (hash2(i, 1.7) - 0.5) * 2400, z = -40 + hash2(2.3, i) * 1500;
      if (inside(x, z) || Math.hypot(x - castleAt.x, z - castleAt.z) < 80) continue;
      const y = groundY(x, z); if (y < 4) continue;
      const axis = Math.abs(x + 0.0977 * z);
      if (axis < 200 && hash2(i, 9) < 0.85) continue;          // the town's valley floor
      plant(x, z, 9 + hash2(i, 3) * 9);
    }
    // round the castle hill
    for (let i = 0; i < 160; i++) { const a = i * 2.4, r = 90 + hash2(i, 5) * 60; plant(castleAt.x + Math.cos(a) * r, castleAt.z + Math.sin(a) * r, 8 + hash2(i, 8) * 5); }
    pines.count = n; pines.computeBoundingSphere();
    group.add(pines);
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
  for (const [ax, az, bx, bz] of [[-38, 22, 36, 30], [36, 30, -30, -34], [-30, -34, -38, 22]]) {
    const len = Math.hypot(bx - ax, bz - az);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(len, 7, 2.2), plaster); w2.position.set((ax + bx) / 2, 9.5, (az + bz) / 2); w2.rotation.y = -Math.atan2(bz - az, bx - ax); castle.add(w2);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 5), stone); s2.position.set((ax + bx) / 2, 3, (az + bz) / 2); s2.rotation.y = w2.rotation.y; castle.add(s2);
  }
  castle.traverse((m) => { (m as THREE.Mesh).castShadow = false; });
  castle.position.copy(castleAt);
  castle.rotation.y = Math.PI + 0.25;   // the keep's face toward the town
  group.add(castle);
  return { group, castle, castleAt, mountainAt };
}
