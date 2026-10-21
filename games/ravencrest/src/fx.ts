// Shared effect materials.
import * as THREE from 'three/webgpu';
import { color, float, mix, smoothstep, mx_fractal_noise_float, time, vec3, uv } from 'three/tsl';

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
  return m;
}
