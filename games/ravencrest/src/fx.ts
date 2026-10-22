// Shared effect materials.
import * as THREE from 'three/webgpu';
import { color, float, mix, smoothstep, mx_fractal_noise_float, time, vec3, uv } from 'three/tsl';

/**
 * A moonlight shaft: two crossed planes falling from a window, alpha fading
 * along its length and at its edges. Additive, depth-write off — it reads as
 * dusty air catching the light, and it diffuses where the glass is rough.
 * Origin at the window; the shaft extends down local −Y. Caller rotates it
 * onto the light direction.
 */
export function lightShaft(width: number, length: number, strength = 0.16, tint = 0x8fb0e8): THREE.Group {
  const geo = new THREE.PlaneGeometry(width, length);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const u = uv();
  const along = float(1).sub(u.y).pow(1.6);
  const edge = u.x.mul(Math.PI).sin().pow(1.5);
  mat.colorNode = color(tint);
  mat.opacityNode = along.mul(edge).mul(float(strength));
  const g = new THREE.Group();
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.rotation.y = Math.PI / 2;
  g.add(a, b);
  return g;
}

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
