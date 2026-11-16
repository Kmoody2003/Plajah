// Standing water: where puddles collect on the road (the same function drives the road shader and the physics), and the spray and mist a car throws up in them.
import * as THREE from 'three';

/** low-frequency pooling pattern, identical in the road shaders (GLSL below) and in JS so the puddle you see is the puddle you hit */
export function puddleNoise(x: number, z: number): number {
  return 0.5 + 0.25 * Math.sin(x * 0.043 + 1.7 * Math.sin(z * 0.031)) + 0.25 * Math.sin(z * 0.057 + 1.3 * Math.sin(x * 0.029 + 1.0)) + 0.12 * Math.sin(x * 0.19 + z * 0.23) * Math.sin(z * 0.17 - x * 0.11);
}
const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 dry .. 1 deep, for a pool level 0..1 */
export function puddleDepth(x: number, z: number, level: number): number {
  const thr = 1.12 - level * 0.62;
  return sm(thr, thr + 0.12, puddleNoise(x, z));
}

export const PUDDLE_GLSL = `
float puddleNoise(vec2 p) {
  return 0.5 + 0.25 * sin(p.x * 0.043 + 1.7 * sin(p.y * 0.031)) + 0.25 * sin(p.y * 0.057 + 1.3 * sin(p.x * 0.029 + 1.0)) + 0.12 * sin(p.x * 0.19 + p.y * 0.23) * sin(p.y * 0.17 - p.x * 0.11);
}
float puddleAt(vec2 p, float level) {
  float thr = 1.12 - level * 0.62;
  return smoothstep(thr, thr + 0.12, puddleNoise(p));
}`;

const VERT = `
  attribute float aSize; attribute float aAlpha;
  varying float vA; varying float vS;
  void main() {
    vA = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
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
    float a = smoothstep(1.0, mix(0.8, 0.05, clamp(vS / 45.0, 0.0, 1.0)), d) * vA;
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
