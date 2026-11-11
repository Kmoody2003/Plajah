// Elise's ponytail: a strand bundle hung from the back of her head and simulated as a Verlet chain.
// It swings with her runs, turns, rolls and fight moves, settles under gravity, sways in the wind,
// and rests on her head, hood and backpack instead of passing through them.
// The image-to-3D model only has the hair painted flat on the back of the skull, so the tail is
// built here: tube geometry rebuilt along the simulated chain each frame (a few hundred vertices).
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, uv, vec2 } from 'three/tsl';

const N = 9;                 // chain particles (incl. the pinned root)
const SIDES = 7;
const RINGS = 22;
const STRANDS: [number, number, number][] = [   // offset around the core (x, y in tube space), radius scale
  [0, 0, 1], [0.45, 0.25, 0.62], [-0.45, 0.2, 0.62], [0.1, -0.45, 0.6],
];

export interface Ponytail {
  update(dt: number): void;
  /** 0 calm … 1 storm. */
  wind: number;
}

function hairMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  // Streaks along the length (uv.y runs root → tip, uv.x around the tube), a sheen band, a darker tip.
  const streak = mx_noise_float(vec2(uv().x.mul(46), uv().y.mul(3))).mul(0.5).add(0.5);
  const base = mix(color(0x140d09), color(0x4a3222), streak);
  m.colorNode = base.mul(mix(float(1), float(0.65), uv().y));
  m.roughnessNode = mix(float(0.38), float(0.62), streak);
  return m;
}

/**
 * Hang a ponytail from `head` (a bone). `model` is the character mesh root in its bind pose,
 * facing +Z; `parent` is where the tube lives (the character root).
 */
export function addPonytail(model: THREE.Object3D, head: THREE.Object3D, parent: THREE.Object3D, length = 0.42): Ponytail {
  model.updateMatrixWorld(true);
  const headW = head.getWorldPosition(new THREE.Vector3());
  // The skull from the mesh itself: vertices above the head bone.
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y > headW.y - 0.02) box.expandByPoint(v);
    }
  });
  const ctr = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(0.06, Math.min(size.x, size.z) / 2);
  // Gathered at the back of the crown (the art: high, pulled back), hanging down the back.
  const anchorW = new THREE.Vector3(ctr.x, ctr.y + size.y * 0.12, ctr.z - r * 0.92);
  const anchorL = head.worldToLocal(anchorW.clone());
  const skullL = head.worldToLocal(new THREE.Vector3(ctr.x, ctr.y - size.y * 0.05, ctr.z));
  const neckL = head.worldToLocal(new THREE.Vector3(ctr.x, ctr.y - size.y * 0.75, ctr.z - r * 0.35));
  const backL = head.worldToLocal(new THREE.Vector3(ctr.x, ctr.y - size.y * 1.9, ctr.z - r * 0.9));   // hood + backpack top
  const skullR = r * 1.0, neckR = r * 0.95, backR = r * 2.1;

  const seg = length / (N - 1);
  const p = Array.from({ length: N }, (_, i) => anchorW.clone().add(new THREE.Vector3(0, -i * seg * 0.8, -i * seg * 0.6)));
  const prev = p.map((x) => x.clone());
  const rest = new THREE.Vector3(0, -0.8, -0.6).normalize();   // hangs down-and-back in head space

  const verts = STRANDS.length * RINGS * SIDES;
  const geo = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const uvA = new Float32Array(verts * 2);
  const idx: number[] = [];
  for (let s = 0; s < STRANDS.length; s++) {
    const o = s * RINGS * SIDES;
    for (let ri = 0; ri < RINGS; ri++) for (let si = 0; si < SIDES; si++) {
      const k = o + ri * SIDES + si;
      uvA[k * 2] = si / SIDES + s * 0.37; uvA[k * 2 + 1] = ri / (RINGS - 1);
      if (ri < RINGS - 1) {
        const a = k, b = o + ri * SIDES + ((si + 1) % SIDES), c = a + SIDES, d = b + SIDES;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  geo.setAttribute('position', posA);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, hairMaterial());
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);

  const curve = new THREE.CatmullRomCurve3(p.map((x) => x.clone()));
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
  const sk = new THREE.Vector3(), nk = new THREE.Vector3(), bk = new THREE.Vector3();
  const T1 = new THREE.Vector3(), N1 = new THREE.Vector3(), B1 = new THREE.Vector3();
  let acc = 0, t = 0;
  const tail: Ponytail = { wind: 0, update };

  function collide(x: THREE.Vector3, c: THREE.Vector3, rad: number) {
    tmp.subVectors(x, c);
    const d = tmp.length();
    if (d < rad) x.addScaledVector(tmp, (rad - d) / Math.max(d, 1e-5));
  }

  function step(h: number) {
    head.updateWorldMatrix(true, false);
    head.getWorldQuaternion(q);
    p[0].copy(anchorL).applyMatrix4(head.matrixWorld);
    sk.copy(skullL).applyMatrix4(head.matrixWorld);
    nk.copy(neckL).applyMatrix4(head.matrixWorld);
    bk.copy(backL).applyMatrix4(head.matrixWorld);
    const restW = rest.clone().applyQuaternion(q);
    // Wind is a light push on hair that weighs something, not a flag in a gale.
    const gust = tail.wind * (0.6 + 0.4 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1));
    const windF = new THREE.Vector3(0.35 * gust + 0.04 * Math.sin(t * 0.6), 0, 0.22 * gust);
    for (let i = 1; i < N; i++) {
      const x = p[i], o = prev[i];
      tmp.subVectors(x, o).multiplyScalar(0.92);                  // velocity with air drag (heavy, settles fast)
      o.copy(x);
      x.add(tmp);
      x.y -= 9.8 * h * h;
      x.addScaledVector(windF, h * h * (i / N));
      // Shape memory: each link leans toward its rest direction (stiff near the tie, loose at the tip).
      const want = p[i - 1].clone().addScaledVector(restW, seg);
      x.lerp(want, 0.16 * (1 - i / N) + 0.03);
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < N; i++) {
        tmp.subVectors(p[i], p[i - 1]);
        const d = tmp.length() || 1e-5;
        p[i].copy(p[i - 1]).addScaledVector(tmp, seg / d);
      }
      for (let i = 1; i < N; i++) { collide(p[i], sk, skullR); collide(p[i], nk, neckR); collide(p[i], bk, backR); }
    }
  }

  function update(dt: number) {
    t += dt;
    acc = Math.min(acc + dt, 0.1);
    const H = 1 / 120;
    while (acc >= H) { step(H); acc -= H; }
    // Teleports (respawn, door fades): snap the chain instead of whipping across the map.
    if (p[1].distanceTo(p[0]) > seg * 3) for (let i = 1; i < N; i++) { p[i].copy(p[0]).addScaledVector(rest, i * seg); prev[i].copy(p[i]); }
    // Rebuild the bundle along the chain, in the parent's space.
    parent.updateWorldMatrix(true, false);
    const inv = parent.matrixWorld.clone().invert();
    curve.points.forEach((cp, i) => cp.copy(p[i]).applyMatrix4(inv));
    const scale = parent.getWorldScale(tmp).x || 1;
    // Ring frames by parallel transport from the head's own side axis. Frenet frames pick their start
    // normal from the tangent alone, so it could jump between frames and twist the whole tail.
    head.getWorldQuaternion(q);
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    N1.set(1, 0, 0).applyQuaternion(q).applyQuaternion(pq);
    const arr = posA.array as Float32Array;
    const c = new THREE.Vector3();
    for (let ri = 0; ri < RINGS; ri++) {
      const u = ri / (RINGS - 1);
      curve.getPointAt(u, c);
      curve.getTangentAt(u, T1);
      N1.addScaledVector(T1, -N1.dot(T1));                    // keep the side axis square to the strand
      if (N1.lengthSq() < 1e-8) N1.set(1, 0, 0).addScaledVector(T1, -T1.x);
      N1.normalize();
      B1.crossVectors(T1, N1);
      // Gathered at the tie, full through the middle, tapering to a point.
      const prof = (u < 0.08 ? 0.55 + u * 5 : 1) * (1 - Math.pow(u, 1.6) * 0.92);
      const R = 0.043 * prof / scale;
      STRANDS.forEach(([ox, oy, rs], s) => {
        const spread = 0.35 + u * 0.9;                            // strands fan apart toward the tip
        for (let si = 0; si < SIDES; si++) {
          const a = (si / SIDES) * Math.PI * 2;
          const cx = ox * R * 1.6 * spread + Math.cos(a) * R * rs, cy = oy * R * 1.6 * spread + Math.sin(a) * R * rs;
          const k = (s * RINGS * SIDES + ri * SIDES + si) * 3;
          arr[k] = c.x + N1.x * cx + B1.x * cy;
          arr[k + 1] = c.y + N1.y * cx + B1.y * cy;
          arr[k + 2] = c.z + N1.z * cx + B1.z * cy;
        }
      });
    }
    posA.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return tail;
}
