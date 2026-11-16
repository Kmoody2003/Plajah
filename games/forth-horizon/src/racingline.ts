// The racing line and driving assists. From a circuit's centre line this works out how fast the car can take every point (corner speed from the curvature and the tyres'
// grip), then sweeps backwards so the braking zones appear ahead of each corner. It draws the line on the road the way Forza does (green: flat out, yellow: at the corner
// speed, red: brake) and gives the assists what they need: how hard the car should be braking now, and which way to steer to stay on the line.
import * as THREE from 'three';

export interface LinePt { x: number; y: number; z: number }

export class RacingLine {
  readonly n: number;
  /** safe speed (m/s, dry) at each point and what limits it: 0 free, 1 braking for something ahead, 2 the corner itself */
  readonly speed: Float32Array; readonly kind: Uint8Array; readonly yaw: Float32Array;
  readonly ds: number;
  private hint = 0;

  constructor(private P: LinePt[], private closed: boolean, opt: { aLat: number; aBrake: number; vmax: number }) {
    const n = (this.n = P.length);
    this.ds = n > 1 ? Math.hypot(P[1].x - P[0].x, P[1].z - P[0].z) : 6;
    this.speed = new Float32Array(n); this.kind = new Uint8Array(n); this.yaw = new Float32Array(n);
    const at = (i: number): LinePt => P[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
    const corner = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = at(i - 2), b = at(i), c = at(i + 2);
      const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
      const cross = abx * bcz - abz * bcx, la = Math.hypot(abx, abz), lb = Math.hypot(bcx, bcz), lc = Math.hypot(c.x - a.x, c.z - a.z);
      const k = la * lb * lc > 1e-6 ? (2 * Math.abs(cross)) / (la * lb * lc) : 0;       // curvature = 1 / radius
      corner[i] = k > 1e-5 ? Math.min(opt.vmax, Math.sqrt(opt.aLat / k)) : opt.vmax;
      const d = at(i + 1), e = at(i - 1);
      this.yaw[i] = Math.atan2(d.x - e.x, d.z - e.z);
    }
    this.speed.set(corner);
    for (let i = 0; i < n; i++) this.kind[i] = corner[i] < opt.vmax - 0.5 ? 2 : 0;
    // braking: no point may be faster than a car could slow down from to reach the next point's speed
    const passes = closed ? 2 : 1;
    for (let p = 0; p < passes; p++) for (let i = n - 1; i >= 0; i--) {
      const j = closed ? (i + 1) % n : i + 1;
      if (j >= n) continue;
      const lim = Math.sqrt(this.speed[j] * this.speed[j] + 2 * opt.aBrake * this.ds);
      if (lim < this.speed[i]) { this.speed[i] = lim; this.kind[i] = 1; }
    }
  }

  /** nearest line point to x,z, searching near where the car was (the line is a loop or a long open path) */
  nearest(x: number, z: number): number {
    const n = this.n;
    let best = 1e18, bi = this.hint;
    const scan = (from: number, to: number): void => {
      for (let k = from; k <= to; k++) {
        const i = this.closed ? ((this.hint + k) % n + n) % n : this.hint + k;
        if (i < 0 || i >= n) continue;
        const d = (this.P[i].x - x) ** 2 + (this.P[i].z - z) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    };
    scan(-25, 25);
    if (best > 70 * 70) { best = 1e18; scan(-n, n); }
    this.hint = bi;
    return bi;
  }
  /** the deceleration (m/s^2) the car needs from here to be at or under the line's speed at every point within `look` metres ahead */
  demand(i: number, v: number, grip: number, look = 260): number {
    const sg = Math.sqrt(Math.max(0.3, grip));
    let need = 0;
    const steps = Math.floor(look / this.ds);
    for (let k = 1; k <= steps; k++) {
      const j = this.closed ? (i + k) % this.n : i + k;
      if (j >= this.n) break;
      const vt = this.speed[j] * sg;
      if (v > vt) need = Math.max(need, (v * v - vt * vt) / (2 * k * this.ds));
    }
    return need;
  }
  /** signed offset of x,z to the left of the line (m) and the heading error (rad, positive: the line turns left of where the car points) */
  offsets(i: number, x: number, z: number, carYaw: number): { lat: number; head: number } {
    const p = this.P[i], y = this.yaw[i];
    const lx = Math.cos(y), lz = -Math.sin(y);
    let h = y - carYaw; h = Math.atan2(Math.sin(h), Math.cos(h));
    return { lat: (x - p.x) * lx + (z - p.z) * lz, head: h };
  }

  /** the line as a ribbon on the road, coloured by what to do */
  mesh(lift: (x: number, z: number) => number): THREE.Mesh {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const W = 0.7, n = this.n;
    const color = (i: number, out: number[]): void => {
      const here = this.speed[i], ahead = this.speed[Math.min(n - 1, i + 3)];
      const k = this.kind[i];
      if (k === 1 && ahead < here - 0.4) out.push(1.0, 0.18, 0.12);        // brake
      else if (k === 2) out.push(1.0, 0.82, 0.12);                          // at the corner speed
      else out.push(0.2, 0.9, 0.35);                                        // free
    };
    for (let i = 0; i < n; i++) {
      const p = this.P[i], y = this.yaw[i];
      const lx = Math.cos(y) * W, lz = -Math.sin(y) * W, yy = lift(p.x, p.z);
      pos.push(p.x + lx, yy, p.z + lz, p.x - lx, yy, p.z - lz);
      color(i, col); color(i, col);
    }
    for (let i = 0; i < n - 1; i++) {
      // a gap in the loop where the ends do not meet stays open
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, fog: false }));
    m.frustumCulled = false; m.renderOrder = 3;
    return m;
  }
}
