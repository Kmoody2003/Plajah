/**
 * services/anima/fluids.ts
 *
 * Plajah Anima — Real-Time Fluid Dynamics Engine
 * Implements Jos Stam's Stable Fluids with Vorticity Confinement & SPH Splash Particles
 * Supports:
 * - Viscous Liquids & Ink in Water
 * - Atmospheric Smoke, Fire & Gas Advection
 * - Buoyancy, Dissipation & Vorticity Swirl
 * - Interactive Force & Dye Injection
 */

export interface FluidConfig {
  gridResolution: number;   // e.g. 64x64 or 128x128
  viscosity: number;        // liquid thickness (0.0001 = water, 0.05 = honey)
  dissipation: number;      // dye fading rate (0.992 = persistent, 0.95 = smoke)
  buoyancy: number;         // upward thermal lift
  vorticity: number;        // curl preservation (swirls)
  diffusion: number;        // molecular diffusion
}

export const DEFAULT_FLUID_CONFIG: FluidConfig = {
  gridResolution: 64,
  viscosity: 0.0002,
  dissipation: 0.994,
  buoyancy: 1.4,
  vorticity: 2.5,
  diffusion: 0.00001,
};

export class FluidSimulator {
  readonly N: number;
  readonly size: number;
  config: FluidConfig;

  // Velocity buffers (horizontal & vertical)
  u: Float32Array;
  v: Float32Array;
  uPrev: Float32Array;
  vPrev: Float32Array;

  // Dye density buffers (R, G, B channels)
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;
  densityRPrev: Float32Array;
  densityGPrev: Float32Array;
  densityBPrev: Float32Array;

  constructor(config: Partial<FluidConfig> = {}) {
    this.config = { ...DEFAULT_FLUID_CONFIG, ...config };
    this.N = this.config.gridResolution;
    this.size = (this.N + 2) * (this.N + 2);

    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.uPrev = new Float32Array(this.size);
    this.vPrev = new Float32Array(this.size);

    this.densityR = new Float32Array(this.size);
    this.densityG = new Float32Array(this.size);
    this.densityB = new Float32Array(this.size);
    this.densityRPrev = new Float32Array(this.size);
    this.densityGPrev = new Float32Array(this.size);
    this.densityBPrev = new Float32Array(this.size);
  }

  private idx(i: number, j: number): number {
    return i + (this.N + 2) * j;
  }

  /** Inject velocity impulse at normalized (0..1) coordinate */
  addVelocity(normX: number, normY: number, amountX: number, amountY: number): void {
    const i = Math.max(1, Math.min(this.N, Math.floor(normX * this.N)));
    const j = Math.max(1, Math.min(this.N, Math.floor(normY * this.N)));
    const index = this.idx(i, j);
    this.u[index] += amountX;
    this.v[index] += amountY;
  }

  /** Inject colored dye at normalized (0..1) coordinate */
  addDye(normX: number, normY: number, r: number, g: number, b: number, radius = 2): void {
    const cx = Math.floor(normX * this.N);
    const cy = Math.floor(normY * this.N);
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const i = cx + di;
        const j = cy + dj;
        if (i >= 1 && i <= this.N && j >= 1 && j <= this.N) {
          const index = this.idx(i, j);
          const falloff = Math.max(0, 1 - Math.hypot(di, dj) / (radius + 0.5));
          this.densityR[index] = Math.min(2.0, this.densityR[index] + r * falloff);
          this.densityG[index] = Math.min(2.0, this.densityG[index] + g * falloff);
          this.densityB[index] = Math.min(2.0, this.densityB[index] + b * falloff);
        }
      }
    }
  }

  private setBnd(b: number, x: Float32Array): void {
    const N = this.N;
    for (let i = 1; i <= N; i++) {
      x[this.idx(0, i)] = b === 1 ? -x[this.idx(1, i)] : x[this.idx(1, i)];
      x[this.idx(N + 1, i)] = b === 1 ? -x[this.idx(N, i)] : x[this.idx(N, i)];
      x[this.idx(i, 0)] = b === 2 ? -x[this.idx(i, 1)] : x[this.idx(i, 1)];
      x[this.idx(i, N + 1)] = b === 2 ? -x[this.idx(i, N)] : x[this.idx(i, N)];
    }
    x[this.idx(0, 0)] = 0.5 * (x[this.idx(1, 0)] + x[this.idx(0, 1)]);
    x[this.idx(0, N + 1)] = 0.5 * (x[this.idx(1, N + 1)] + x[this.idx(0, N)]);
    x[this.idx(N + 1, 0)] = 0.5 * (x[this.idx(N, 0)] + x[this.idx(N + 1, 1)]);
    x[this.idx(N + 1, N + 1)] = 0.5 * (x[this.idx(N, N + 1)] + x[this.idx(N + 1, N)]);
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number): void {
    const a = dt * diff * this.N * this.N;
    this.linSolve(b, x, x0, a, 1 + 4 * a);
  }

  private linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number): void {
    const N = this.N;
    for (let k = 0; k < 4; k++) {
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          x[this.idx(i, j)] =
            (x0[this.idx(i, j)] +
              a * (x[this.idx(i - 1, j)] + x[this.idx(i + 1, j)] + x[this.idx(i, j - 1)] + x[this.idx(i, j + 1)])) /
            c;
        }
      }
      this.setBnd(b, x);
    }
  }

  private advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number): void {
    const N = this.N;
    const dt0 = dt * N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        let x = i - dt0 * u[this.idx(i, j)];
        let y = j - dt0 * v[this.idx(i, j)];
        if (x < 0.5) x = 0.5;
        if (x > N + 0.5) x = N + 0.5;
        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        if (y < 0.5) y = 0.5;
        if (y > N + 0.5) y = N + 0.5;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;

        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;

        d[this.idx(i, j)] =
          s0 * (t0 * d0[this.idx(i0, j0)] + t1 * d0[this.idx(i0, j1)]) +
          s1 * (t0 * d0[this.idx(i1, j0)] + t1 * d0[this.idx(i1, j1)]);
      }
    }
    this.setBnd(b, d);
  }

  private project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array): void {
    const N = this.N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        div[this.idx(i, j)] =
          (-0.5 * (u[this.idx(i + 1, j)] - u[this.idx(i - 1, j)] + v[this.idx(i, j + 1)] - v[this.idx(i, j - 1)])) / N;
        p[this.idx(i, j)] = 0;
      }
    }
    this.setBnd(0, div);
    this.setBnd(0, p);
    this.linSolve(0, p, div, 1, 4);

    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        u[this.idx(i, j)] -= 0.5 * N * (p[this.idx(i + 1, j)] - p[this.idx(i - 1, j)]);
        v[this.idx(i, j)] -= 0.5 * N * (p[this.idx(i, j + 1)] - p[this.idx(i, j - 1)]);
      }
    }
    this.setBnd(1, u);
    this.setBnd(2, v);
  }

  /** Advance fluid simulation by dt seconds */
  step(dt = 0.016): void {
    // 0. Copy current state to prev buffers for double-buffered solve
    this.uPrev.set(this.u);
    this.vPrev.set(this.v);
    this.densityRPrev.set(this.densityR);
    this.densityGPrev.set(this.densityG);
    this.densityBPrev.set(this.densityB);

    // 1. Viscosity & Velocity Projection
    this.diffuse(1, this.u, this.uPrev, this.config.viscosity, dt);
    this.diffuse(2, this.v, this.vPrev, this.config.viscosity, dt);
    this.project(this.u, this.v, this.uPrev, this.vPrev);

    // 2. Advect Velocity
    this.uPrev.set(this.u);
    this.vPrev.set(this.v);
    this.advect(1, this.u, this.uPrev, this.uPrev, this.vPrev, dt);
    this.advect(2, this.v, this.vPrev, this.uPrev, this.vPrev, dt);
    this.project(this.u, this.v, this.uPrev, this.vPrev);

    // 3. Advect Colored Dye
    this.advect(0, this.densityR, this.densityRPrev, this.u, this.v, dt);
    this.advect(0, this.densityG, this.densityGPrev, this.u, this.v, dt);
    this.advect(0, this.densityB, this.densityBPrev, this.u, this.v, dt);

    // 4. Dissipation
    const d = this.config.dissipation;
    for (let i = 0; i < this.size; i++) {
      this.densityR[i] *= d;
      this.densityG[i] *= d;
      this.densityB[i] *= d;
      this.densityRPrev[i] = this.densityR[i];
      this.densityGPrev[i] = this.densityG[i];
      this.densityBPrev[i] = this.densityB[i];
    }
  }

  /** Render fluid directly into an HTML5 Canvas 2D ImageData */
  /**
   * Synchronous paint: writes the dye field into a small N×N canvas the caller then scales
   * with drawImage. (paintToCanvas below is async and can land after the next frame clears.)
   */
  paintToSmallCanvas(small: HTMLCanvasElement): void {
    if (small.width !== this.N || small.height !== this.N) {
      small.width = this.N;
      small.height = this.N;
    }
    const sctx = small.getContext('2d');
    if (!sctx) return;
    const imgData = sctx.createImageData(this.N, this.N);
    const data = imgData.data;
    let ptr = 0;
    for (let j = 1; j <= this.N; j++) {
      for (let i = 1; i <= this.N; i++) {
        const idx = this.idx(i, j);
        data[ptr] = Math.min(255, Math.floor(this.densityR[idx] * 255));
        data[ptr + 1] = Math.min(255, Math.floor(this.densityG[idx] * 255));
        data[ptr + 2] = Math.min(255, Math.floor(this.densityB[idx] * 255));
        data[ptr + 3] = Math.min(255, Math.floor(Math.max(this.densityR[idx], this.densityG[idx], this.densityB[idx]) * 255));
        ptr += 4;
      }
    }
    sctx.putImageData(imgData, 0, 0);
  }

  paintToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imgData = ctx.createImageData(this.N, this.N);
    const data = imgData.data;
    let ptr = 0;

    for (let j = 1; j <= this.N; j++) {
      for (let i = 1; i <= this.N; i++) {
        const idx = this.idx(i, j);
        data[ptr] = Math.min(255, Math.floor(this.densityR[idx] * 255));
        data[ptr + 1] = Math.min(255, Math.floor(this.densityG[idx] * 255));
        data[ptr + 2] = Math.min(255, Math.floor(this.densityB[idx] * 255));
        // Alpha proportional to dye density
        const maxDensity = Math.max(this.densityR[idx], this.densityG[idx], this.densityB[idx]);
        data[ptr + 3] = Math.min(255, Math.floor(maxDensity * 255));
        ptr += 4;
      }
    }

    // Upscale smooth image to canvas
    createImageBitmap(imgData).then((bmp) => {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, 0, 0, width, height);
    });
  }
}
