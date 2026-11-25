// Standing water: where puddles collect on the road (the same function drives the road shader and the physics), and the spray and mist a car throws up in them.
import * as THREE from 'three';

/** localized puddle pockets (~3-8 m discrete low spots, never wall-to-wall track flooding), identical in GLSL and JS so the puddle you see is the puddle you hit */
export function puddleNoise(x: number, z: number): number {
  const pocket = 0.5 + 0.25 * Math.sin(x * 0.21 + 1.4 * Math.sin(z * 0.16)) + 0.25 * Math.sin(z * 0.23 + 1.2 * Math.sin(x * 0.18 + 0.8));
  const detail = 0.11 * Math.sin(x * 0.52 + z * 0.41) * Math.sin(z * 0.37 - x * 0.33);
  const env = 0.78 + 0.22 * Math.sin(x * 0.037 + 0.9 * Math.sin(z * 0.031)) * Math.cos(z * 0.033 - 0.7 * Math.sin(x * 0.027));
  return (pocket + detail) * env;
}
const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 dry .. 1 deep, for a pool level 0..1 */
export function puddleDepth(x: number, z: number, level: number): number {
  if (level <= 0.01) return 0;
  const thr = 0.98 - level * 0.22;                 // crowned drained track: ~0.9% scattered pockets in rain, ~3.6% max in peak storm (discrete 3-8 m puddles, never flooded sections)
  return sm(thr, thr + 0.13, puddleNoise(x, z));
}

export const PUDDLE_GLSL = `
float puddleNoise(vec2 p) {
  float pocket = 0.5 + 0.25 * sin(p.x * 0.21 + 1.4 * sin(p.y * 0.16)) + 0.25 * sin(p.y * 0.23 + 1.2 * sin(p.x * 0.18 + 0.8));
  float detail = 0.11 * sin(p.x * 0.52 + p.y * 0.41) * sin(p.y * 0.37 - p.x * 0.33);
  float env = 0.78 + 0.22 * sin(p.x * 0.037 + 0.9 * sin(p.y * 0.031)) * cos(p.y * 0.033 - 0.7 * sin(p.x * 0.027));
  return (pocket + detail) * env;
}
float puddleAt(vec2 p, float level) {
  if (level <= 0.01) return 0.0;
  float thr = 0.98 - level * 0.22;
  return smoothstep(thr, thr + 0.13, puddleNoise(p));
}`;

const VERT = `
  attribute float aSize; attribute float aAlpha;
  varying float vA; varying float vS;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Near-camera splash points must not turn into opaque circles on the lens.
    vA = aAlpha * smoothstep(0.8, 3.5, -mv.z);
    gl_PointSize = clamp(aSize * 520.0 / max(-mv.z, 0.5), 1.0, 220.0);
    vS = gl_PointSize;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform vec3 uTint;
  varying float vA; varying float vS;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    // small points (droplets) are crisp, big ones (mist) are soft
    float a = (1.0 - smoothstep(mix(0.55, 0.05, clamp(vS / 45.0, 0.0, 1.0)), 1.0, d)) * vA;
    a *= mix(0.38, 1.0, smoothstep(5.0, 28.0, vS));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint, a);
  }`;

const N = 1400;

export class SprayFx {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private alpha = new Float32Array(N);
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private maxLife = new Float32Array(N);
  private size0 = new Float32Array(N);
  private alpha0 = new Float32Array(N);
  private grav = new Float32Array(N);
  private head = 0;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uTint: { value: new THREE.Color(0.85, 0.89, 0.93) } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
  }

  setTint(c: THREE.Color, bright: number): void { (this.mat.uniforms.uTint.value as THREE.Color).copy(c).multiplyScalar(bright); }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, alpha: number, grav: number): void {
    const i = this.head; this.head = (this.head + 1) % N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size0[i] = size; this.alpha0[i] = alpha; this.grav[i] = grav;
  }

  /** one wheel's worth of emission this frame. wet 0..1 (how much water is under it), speed m/s, dir = car velocity direction (xz, unit) */
  wheel(dt: number, x: number, y: number, z: number, vx: number, vz: number, speed: number, wet: number, big: number): void {
    if (wet < 0.04 || speed < 6) return;
    const k = wet * Math.min(1, (speed - 6) / 34);
    const n = k * (170 + big * 260) * dt;
    let c = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    const inv = 1 / Math.max(speed, 1), dx = vx * inv, dz = vz * inv;
    while (c-- > 0) {
      const sp = speed * (0.1 + Math.random() * 0.22), up = 1.4 + Math.random() * (2.6 + speed * 0.09 * (0.5 + big));
      const side = (Math.random() - 0.5) * 2.2 * (0.6 + big);
      // droplets: carried partly forward by the car, flung up and out, short-lived, fall quickly
      this.emit(x + (Math.random() - 0.5) * 0.25, y + 0.05, z + (Math.random() - 0.5) * 0.25,
        vx * (0.25 + Math.random() * 0.2) - dx * sp * 0.3 - dz * side, up * (0.7 + big * 0.5), vz * (0.25 + Math.random() * 0.2) - dz * sp * 0.3 + dx * side,
        0.03 + Math.random() * 0.06 * (0.6 + big), 0.45 + Math.random() * 0.6, 0.5 + 0.3 * k, 9.0);
      // the finer mist that hangs behind: faint and wispy, not blobs
      if (Math.random() < 0.18 * (0.4 + big)) this.emit(x, y + 0.3, z, vx * 0.3 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, vz * 0.3 + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.7, 1.2 + Math.random() * 1.1, 0.045 + 0.04 * k, 0.15);
    }
  }

  update(dt: number): void {
    const decay = Math.exp(-dt * 0.9);
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= decay; this.vel[i * 3 + 2] *= decay;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // droplets that hit the road vanish; mist grows and fades
      this.alpha[i] = this.alpha0[i] * Math.min(1, t * 2.2) * (1 - (1 - t) * 0.3);
      this.size[i] = this.size0[i] * (1 + (1 - t) * (this.grav[i] < 1 ? 2.4 : 0.5));
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void { this.life.fill(0); this.alpha.fill(0); }
}

// ---------------------------------------------------------------- dust and dirt
// What a car throws up off a loose road: big soft clouds that roll out behind it and hang, and a rooster tail of dark clods and gravel flung up and back. A separate system
// from the water spray (its own tint, much bigger and longer-lived puffs, a per-point shade so the clods read darker than the dust).
const DVERT = `
  attribute float aSize; attribute float aAlpha; attribute float aShade;
  varying float vA; varying float vS; varying float vSh;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = aAlpha * smoothstep(0.6, 4.0, -mv.z);
    gl_PointSize = clamp(aSize * 640.0 / max(-mv.z, 0.5), 1.0, 360.0);
    vS = gl_PointSize; vSh = aShade;
    gl_Position = projectionMatrix * mv;
  }`;
const DFRAG = `
  uniform vec3 uTint;
  varying float vA; varying float vS; varying float vSh;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    // clods (small, dark) are crisp; dust (big) is a soft puff with a slightly lumpy edge
    float soft = clamp(vS / 60.0, 0.0, 1.0);
    float a = (1.0 - smoothstep(mix(0.7, 0.0, soft), 1.0, d)) * vA;
    a *= mix(0.55, 1.0, smoothstep(6.0, 40.0, vS));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint * vSh, a);
  }`;
const DN = 3600;

export class DustFx {
  readonly points: THREE.Points;
  private pos = new Float32Array(DN * 3);
  private size = new Float32Array(DN);
  private alpha = new Float32Array(DN);
  private shade = new Float32Array(DN);
  private vel = new Float32Array(DN * 3);
  private life = new Float32Array(DN);
  private maxLife = new Float32Array(DN);
  private size0 = new Float32Array(DN);
  private alpha0 = new Float32Array(DN);
  private grav = new Float32Array(DN);
  private head = 0;
  private mat: THREE.ShaderMaterial;
  /** wind on the dust, m/s (x, z) */
  wind = new THREE.Vector2(0.6, 0.2);

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShade', new THREE.BufferAttribute(this.shade, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: DVERT, fragmentShader: DFRAG, transparent: true, depthWrite: false, uniforms: { uTint: { value: new THREE.Color(0.6, 0.48, 0.34) } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 7;
    scene.add(this.points);
  }

  /** the colour of the dust, already lit for the time of day */
  setTint(c: THREE.Color): void { (this.mat.uniforms.uTint.value as THREE.Color).copy(c); }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, alpha: number, grav: number, shade: number): void {
    const i = this.head; this.head = (this.head + 1) % DN;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size0[i] = size; this.alpha0[i] = alpha; this.grav[i] = grav; this.shade[i] = shade;
  }

  /**
   * One tyre's worth this frame. amount 0..1: how loose the surface is (gravel 1, sand 0.6, grass 0.35, wet ground less). slip 0..: sideways sliding and wheelspin, which
   * digs in and throws far more. big: the driven (rear) tyres throw more. speed m/s; vx, vz the car's velocity.
   */
  wheel(dt: number, x: number, y: number, z: number, vx: number, vz: number, speed: number, amount: number, slip: number, big: number): void {
    if (amount < 0.05 || speed < 2.5) return;
    const k = amount * Math.min(1, (speed - 2.5) / 26) * (1 + 1.6 * Math.min(1.5, slip));
    const inv = 1 / Math.max(speed, 1), dx = vx * inv, dz = vz * inv;
    let n = k * (70 + big * 90) * dt;
    let c = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    while (c-- > 0) {
      // the cloud: a soft puff left where the tyre was, rolling backwards and up, growing as it spreads and hanging for seconds
      const side = (Math.random() - 0.5) * 2.4;
      this.emit(x + (Math.random() - 0.5) * 0.5, y + 0.1, z + (Math.random() - 0.5) * 0.5,
        -dx * speed * (0.05 + Math.random() * 0.12) - dz * side * 0.6 + this.wind.x * 0.3, 0.7 + Math.random() * (1.4 + speed * 0.05), -dz * speed * (0.05 + Math.random() * 0.12) + dx * side * 0.6 + this.wind.y * 0.3,
        0.9 + Math.random() * 1.2 + big * 0.5, 2.2 + Math.random() * 2.4, Math.min(0.26, 0.08 + 0.13 * k), 0.05, 0.9 + Math.random() * 0.2);
    }
    // the rooster tail: clods and gravel thrown up and back, dark and fast, falling in a few tenths of a second
    n = k * (46 + big * 120) * dt;
    c = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    while (c-- > 0) {
      const spread = (Math.random() - 0.5) * 3.2;
      this.emit(x, y + 0.12, z,
        -dx * speed * (0.18 + Math.random() * 0.3) - dz * spread, 2.2 + Math.random() * (3.6 + speed * 0.1) * (0.6 + big * 0.5), -dz * speed * (0.18 + Math.random() * 0.3) + dx * spread,
        0.05 + Math.random() * 0.1, 0.5 + Math.random() * 0.7, 0.85, 13, 0.55 + Math.random() * 0.25);
    }
    // a little veil of fine dust straight up off a spinning tyre
    if (slip > 0.35 && Math.random() < 0.5 * k) this.emit(x, y + 0.2, z, (Math.random() - 0.5) * 1.5, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.5, 1.4 + Math.random() * 1.4, 2.6 + Math.random() * 2.0, 0.22, 0.04, 1.05);
  }

  update(dt: number): void {
    const drag = Math.exp(-dt * 0.9);
    for (let i = 0; i < DN; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const dust = this.grav[i] < 1;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      if (dust) { this.vel[i * 3] += (this.wind.x - this.vel[i * 3]) * dt * 0.35; this.vel[i * 3 + 2] += (this.wind.y - this.vel[i * 3 + 2]) * dt * 0.35; this.vel[i * 3 + 1] *= Math.exp(-dt * 0.8); }
      else { this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag; }
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // dust grows and thins; clods keep their size and vanish when they land
      this.alpha[i] = this.alpha0[i] * Math.min(1, (1 - t) * 6 + 0.25) * (dust ? t : Math.min(1, t * 3));
      this.size[i] = this.size0[i] * (dust ? 1 + (1 - t) * 3.2 : 1);
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aShade') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void { this.life.fill(0); this.alpha.fill(0); }
}
