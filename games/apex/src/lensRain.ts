import * as THREE from 'three';

const MAX_DROPS = 6;
interface Drop { x: number; y: number; radius: number; age: number; life: number; pin: number; speed: number }
export class LensRain {
  readonly uniforms = {
    uLensDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
    uLensAspect: { value: 1 },
    uLensCount: { value: 0 },
  };
  private drops: Drop[] = [];
  private wait = 0.5;
  enabled = true;
  constructor(private random: () => number = Math.random) {}
  update(dt: number, rain: number, speed: number, exposed: boolean, aspect: number): void {
    const step = Math.max(0, Math.min(dt, 0.1));
    this.uniforms.uLensAspect.value = Math.max(0.3, aspect);
    if (!this.enabled || !exposed) { this.drops.length = 0; this.wait = 0.5; }
    else {
      const rate = Math.max(0, rain - 0.06) * (0.11 + Math.min(speed, 65) * 0.002);
      this.wait -= step * rate;
      if (rate > 0 && this.wait <= 0 && this.drops.length < MAX_DROPS) {
        let x = 0.08 + this.random() * 0.84, y = 0.15 + this.random() * 0.77;
        if (x > 0.33 && x < 0.67 && y > 0.25) x = this.random() < 0.5 ? 0.18 : 0.82;
        this.drops.push({ x, y, radius: 0.004 + this.random() * 0.008, age: 0, life: 5 + this.random() * 5, pin: 1 + this.random() * 2, speed: 0 });
        this.wait = -Math.log(Math.max(0.001, this.random()));
      }
      for (const drop of this.drops) {
        drop.age += step;
        if (drop.age > drop.pin) { drop.speed += step * (0.003 + speed * 0.00012); drop.y -= step * drop.speed; drop.x += Math.sin(drop.age * 2) * step * 0.0007; }
      }
      this.drops = this.drops.filter((drop) => drop.age < drop.life && drop.y > -drop.radius);
    }
    this.uniforms.uLensCount.value = this.drops.length;
    this.uniforms.uLensDrops.value.forEach((uniform, i) => {
      const drop = this.drops[i];
      if (!drop) { uniform.set(0, 0, 0, 0); return; }
      const fade = Math.min(1, drop.age / 0.12, (drop.life - drop.age) / 1.4);
      uniform.set(drop.x, drop.y, drop.radius, Math.max(0, fade));
    });
  }
}

// Inserted into the existing cinematic pass: no additional full-screen render target.
export const LENS_RAIN_GLSL = `
uniform vec4 uLensDrops[6];
uniform float uLensAspect;
uniform int uLensCount;
vec2 lensRainUv(vec2 uv, out float mask, out float shade, out float sparkle) {
  vec2 refracted = uv; mask = 0.0; shade = 1.0; sparkle = 0.0;
  if (uLensCount == 0) return uv;
  for (int i = 0; i < 6; i++) {
    if (i >= uLensCount) break;
    vec4 drop = uLensDrops[i];
    if (drop.z < 0.0001 || drop.w < 0.001) continue;
    vec2 delta = (uv - drop.xy) * vec2(uLensAspect, 1.0);
    if (abs(delta.x) > drop.z || abs(delta.y) > drop.z) continue;
    vec2 p = delta / drop.z;
    float rr = dot(p, p);
    if (rr >= 1.0) continue;
    vec3 normal = normalize(vec3(p * 0.82, sqrt(max(0.001, 1.0 - rr))));
    vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.333);
    refracted = clamp(uv + ray.xy * drop.z * 1.45 / vec2(uLensAspect, 1.0), vec2(0.002), vec2(0.998));
    mask = (1.0 - smoothstep(0.86, 1.0, rr)) * drop.w;
    shade = 1.0 - smoothstep(0.52, 0.99, rr) * 0.24;
    sparkle = pow(max(0.0, dot(normal, normalize(vec3(-0.45, 0.65, 1.0)))), 64.0) * 0.3;
    break;
  }
  return refracted;
}`;
