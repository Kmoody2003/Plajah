// Grass and wildflowers that grow back across the valley when Dracula falls (daybreak.ts).
// One instanced draw: three crossed blade cards per clump, cut to a tapering blade by alpha,
// swaying in the wind; each clump grows in as a ring expands from where he died. Hidden (and
// free) until the daybreak.
import * as THREE from 'three/webgpu';
import { Fn, uniform, attribute, uv, float, vec2, vec3, mix, smoothstep, step, sin, time, positionLocal, length, fract, floor, hash } from 'three/tsl';
import type { ArrivalWorld } from './arrival';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export function buildGrass(road: ArrivalWorld['road'], count: number) {
  // Clump: three crossed cards, 0.5 wide, 0.7 tall, base at y = 0.
  const card = new THREE.PlaneGeometry(0.5, 0.7, 1, 3);
  card.translate(0, 0.35, 0);
  const parts = [0, 1, 2].map((k) => card.clone().rotateY((k / 3) * Math.PI));
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    pos.push(...(p.attributes.position.array as Float32Array));
    uvs.push(...(p.attributes.uv.array as Float32Array));
    for (const i of p.index!.array as Uint16Array) idx.push(i + base);
    base += p.attributes.position.count;
  }
  // Plain geometry + InstancedMesh (InstancedBufferGeometry's instanceCount defaults to Infinity,
  // which WebGPU rejects as a draw count).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Per clump: world x, z, a phase, and a flower roll (> 0.88 = flowers, tinted by .w).
  const info = new Float32Array(count * 4);
  const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 4; tries++) {
    const left = Math.random() < 0.62;
    const u = left ? road.uL - 0.8 - Math.random() * 26 : road.uR + 1.2 + Math.random() * 18;
    const v = road.vStart + 4 + Math.random() * (-road.vStart + 30);
    const h = road.heightAt(u, v);
    if (h < -2.2) continue;                     // not down in the moat
    const w = road.fromLocal(u, v, h - 0.04);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    const sc = 0.6 + Math.random() * 0.9;
    s.set(sc, sc * (0.7 + Math.random() * 0.8), sc);
    m4.compose(pv.copy(w), q, s);
    mesh.setMatrixAt(n, m4);
    info.set([w.x, w.z, Math.random() * 6.28, Math.random()], n * 4);
    n++;
  }
  mesh.count = n;
  geo.setAttribute('ginfo', new THREE.InstancedBufferAttribute(info, 4));

  const uGrow = uniform(0);                     // ring radius (m) of grown grass
  const uCenter = uniform(new THREE.Vector2());
  const g: N = attribute('ginfo', 'vec4');
  const grow: N = smoothstep(float(0), float(1), (uGrow as N).sub(length(g.xy.sub(uCenter as N))).div(6)).toVar();
  const t: N = uv().y;
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5 });
  mat.positionNode = Fn(() => {
    const p: N = (positionLocal as N).toVar();
    // Sway grows with height; grown-in clumps rise from flat.
    const sway: N = sin((time as N).mul(1.7).add(g.z).add(p.x.mul(2))).mul(0.08).mul(t.mul(t));
    return vec3(p.x.mul(mix(float(0.4), float(1), grow)).add(sway), p.y.mul(grow), p.z.mul(mix(float(0.4), float(1), grow)).add(sway.mul(0.6)));
  })();
  // Each card is cut into 6 thin blades of varying height, each tapering to a point.
  const BLADES = 6;
  const strip: N = (uv().x as N).mul(BLADES);
  const id: N = floor(strip).add(g.z.mul(13));
  const top: N = float(0.55).add((hash(id) as N).mul(0.45));
  const across: N = fract(strip).sub(0.5).abs().mul(2);
  mat.opacityNode = step(across, float(1).sub(t.div(top)).mul(0.85)).mul(step(t, top));
  const flower: N = step(float(0.88), g.w);
  const petal: N = mix(vec3(1, 0.85, 0.25), mix(vec3(0.95, 0.95, 1), vec3(0.75, 0.45, 0.95), smoothstep(float(0.94), float(1), g.w)), smoothstep(float(0.9), float(0.95), g.w));
  const blade: N = mix(vec3(0.06, 0.15, 0.03), vec3(0.36, 0.62, 0.18), t.div(top).clamp(0, 1)).mul(mix(float(0.8), float(1.2), (hash(id.add(5)) as N)));
  mat.colorNode = mix(blade, petal, flower.mul(smoothstep(top.mul(0.82), top.mul(0.92), t)));
  mesh.material = mat;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.dynamic = true;
  mesh.receiveShadow = true;
  void vec2;
  return { mesh, uGrow, uCenter };
}
