// Shared effect materials.
import * as THREE from 'three/webgpu';
import {
  color, float, mix, smoothstep, mx_fractal_noise_float, time, vec3, uv, billboarding,
  attribute, cameraPosition, positionLocal, normalize, vec2,
} from 'three/tsl';

/** Camera-facing flame card: noisy teardrop, additive, flickering upward. */
export function flameMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uv();
  const n = mx_fractal_noise_float(vec3(u.x.mul(3), u.y.mul(2).sub(time.mul(2.2)), time.mul(0.7)), 3, 2, 0.5, 1);
  const body = smoothstep(float(0.5), float(0.0), u.x.sub(0.5).abs().add(u.y.mul(0.35)).add(n.mul(0.18)));
  const tip = smoothstep(float(1.0), float(0.15), u.y);
  const a = body.mul(tip);
  m.colorNode = mix(color(0xff4a0c), color(0xffb24a), body.mul(1.2).clamp()).mul(3.2);
  m.opacityNode = a;
  // Cylindrical billboard on the GPU (no per-frame CPU lookAt).
  m.vertexNode = billboarding({ horizontal: true, vertical: false });
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/**
 * Every flame in a level merged into ONE draw. Each quad carries its centre and a flicker
 * seed; the vertex shader turns it to face the camera around that centre. On this engine
 * a draw costs ~0.1 ms of CPU, so ~40 flames → 1 draw saves ~4 ms per frame.
 */
export function batchFlames(flames: THREE.Mesh[]): THREE.Mesh | null {
  if (!flames.length) return null;
  const pos: number[] = [], uvs: number[] = [], ctr: number[] = [], seed: number[] = [], idx: number[] = [];
  const c = new THREE.Vector3(), s = new THREE.Vector3();
  flames.forEach((f, i) => {
    f.updateWorldMatrix(true, false);
    f.getWorldPosition(c);
    f.getWorldScale(s);
    const g = f.geometry as THREE.PlaneGeometry;
    const w = (g.parameters?.width ?? 0.5) * s.x, h = (g.parameters?.height ?? 0.8) * s.y;
    const base = i * 4;
    for (const [x, y, u, v] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [-0.5, 0.5, 0, 1], [0.5, 0.5, 1, 1]]) {
      pos.push(x * w, y * h, 0); uvs.push(u, v); ctr.push(c.x, c.y, c.z); seed.push(i * 1.618);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    f.removeFromParent();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('center', new THREE.Float32BufferAttribute(ctr, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const centre: N = attribute('center', 'vec3');
  const sd: N = attribute('seed', 'float');
  // Horizontal billboard: quad's x axis = perpendicular to the camera direction in XZ.
  const toCam: N = normalize((vec2 as N)((cameraPosition as N).x.sub(centre.x), (cameraPosition as N).z.sub(centre.z)));
  const right: N = vec3(toCam.y.negate(), 0, toCam.x);
  m.positionNode = centre.add(right.mul((positionLocal as N).x)).add(vec3(0, (positionLocal as N).y, 0));
  const u: N = uv();
  const t: N = (time as N).add(sd);
  const n: N = mx_fractal_noise_float(vec3(u.x.mul(3), u.y.mul(2).sub(t.mul(2.2)), t.mul(0.7)), 3, 2, 0.5, 1);
  const body: N = smoothstep(float(0.5), float(0.0), u.x.sub(0.5).abs().add(u.y.mul(0.35)).add(n.mul(0.18)));
  const tip: N = smoothstep(float(1.0), float(0.15), u.y);
  m.colorNode = mix(color(0xff4a0c), color(0xffb24a), body.mul(1.2).clamp()).mul(3.2);
  m.opacityNode = body.mul(tip);
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.name = 'flameBatch';
  return mesh;
}
