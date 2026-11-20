/**
 * Plajah Real-Time 60 FPS Shallow-Water Ripple & Wake Fluid Field
 * Complements services/anima/fluids.ts with a fast 2D wave-equation PDE solver
 * (d²h/dt² = c²∇²h - γ·dh/dt) on a camera/vehicle-following world patch, uploading
 * a compact RGBA8 GPU normal+height DataTexture (< 0.12 ms/frame, ~36 KB VRAM)
 * for interactive wet-road tire wakes, puddle splashes, and lake shoreline ripples.
 */
import * as THREE from 'three';

export class RealtimeRippleField {
  readonly size: number;
  readonly spanMeters: number;
  readonly texture: THREE.DataTexture;
  readonly origin = new THREE.Vector2();

  private hCur: Float32Array;
  private hPrev: Float32Array;
  private hNext: Float32Array;
  private pixels: Uint8Array;
  private initialized = false;
  private cellSize: number;

  constructor(size = 96, spanMeters = 42) {
    this.size = size;
    this.spanMeters = spanMeters;
    this.cellSize = spanMeters / size;
    const n = size * size;
    this.hCur = new Float32Array(n);
    this.hPrev = new Float32Array(n);
    this.hNext = new Float32Array(n);
    this.pixels = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.pixels[i * 4] = 128;
      this.pixels[i * 4 + 1] = 128;
      this.pixels[i * 4 + 2] = 128;
      this.pixels[i * 4 + 3] = 255;
    }
    this.texture = new THREE.DataTexture(this.pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Recenter the rolling fluid window onto (cx, cz), shifting existing wakes seamlessly in world space! */
  recenter(cx: number, cz: number): void {
    const step = this.cellSize;
    const gx = Math.round(cx / step) * step;
    const gz = Math.round(cz / step) * step;
    if (!this.initialized) {
      this.origin.set(gx, gz);
      this.initialized = true;
      return;
    }
    const shiftX = Math.round((gx - this.origin.x) / step);
    const shiftZ = Math.round((gz - this.origin.y) / step);
    if (shiftX === 0 && shiftZ === 0) return;

    this.origin.set(gx, gz);
    const N = this.size;
    if (Math.abs(shiftX) >= N - 2 || Math.abs(shiftZ) >= N - 2) {
      this.hCur.fill(0);
      this.hPrev.fill(0);
      return;
    }

    const shiftBuf = (src: Float32Array, dst: Float32Array) => {
      dst.fill(0);
      for (let y = 1; y < N - 1; y++) {
        const sy = y + shiftZ;
        if (sy < 1 || sy >= N - 1) continue;
        const rowDst = y * N;
        const rowSrc = sy * N;
        for (let x = 1; x < N - 1; x++) {
          const sx = x + shiftX;
          if (sx < 1 || sx >= N - 1) continue;
          dst[rowDst + x] = src[rowSrc + sx];
        }
      }
    };
    shiftBuf(this.hCur, this.hNext);
    this.hCur.set(this.hNext);
    shiftBuf(this.hPrev, this.hNext);
    this.hPrev.set(this.hNext);
  }

  /** Inject a localized splash/tire-wake disturbance at world (wx, wz) */
  splat(wx: number, wz: number, strength: number, radiusMeters = 0.65): void {
    const N = this.size;
    const u = (wx - this.origin.x) / this.spanMeters + 0.5;
    const v = (wz - this.origin.y) / this.spanMeters + 0.5;
    const cx = Math.floor(u * N);
    const cy = Math.floor(v * N);
    const r = Math.max(1, Math.ceil(radiusMeters / this.cellSize));
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 2 || y >= N - 2) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 2 || x >= N - 2) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const w = 1 - Math.sqrt(d2) / (r + 0.2);
        const idx = y * N + x;
        this.hCur[idx] = Math.max(-1.0, Math.min(1.0, this.hCur[idx] + strength * w * w));
      }
    }
  }

  /** Advance wave PDE and upload RG normal slope + B height to GPU DataTexture */
  step(dt: number, rainAmt = 0): void {
    const N = this.size;
    // Inject gentle random raindrop impacts inside the active patch
    if (rainAmt > 0.04) {
      const drops = Math.min(14, Math.ceil(rainAmt * 10));
      for (let d = 0; d < drops; d++) {
        const rx = 3 + Math.floor(Math.random() * (N - 6));
        const ry = 3 + Math.floor(Math.random() * (N - 6));
        this.hCur[ry * N + rx] = Math.min(1.0, this.hCur[ry * N + rx] + 0.28 * rainAmt);
      }
    }

    const c2 = Math.min(0.42, 0.34 * Math.min(1.3, dt * 60));
    const damp = 0.948;
    const cur = this.hCur;
    const prev = this.hPrev;
    const next = this.hNext;
    const px = this.pixels;

    for (let y = 1; y < N - 1; y++) {
      const row = y * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        const lap = cur[i - 1] + cur[i + 1] + cur[i - N] + cur[i + N] - 4.0 * cur[i];
        let v = (2.0 * cur[i] - prev[i] + c2 * lap) * damp;
        // Soft absorbing edge damping so waves never bounce harshly off patch border
        if (x < 5 || x > N - 6 || y < 5 || y > N - 6) v *= 0.72;
        if (v > 1.0) v = 1.0;
        else if (v < -1.0) v = -1.0;
        next[i] = v;

        const dx = (cur[i + 1] - cur[i - 1]) * 1.85;
        const dz = (cur[i + N] - cur[i - N]) * 1.85;
        const o = i * 4;
        px[o] = Math.max(0, Math.min(255, Math.round(128 + dx * 127)));
        px[o + 1] = Math.max(0, Math.min(255, Math.round(128 + dz * 127)));
        px[o + 2] = Math.max(0, Math.min(255, Math.round(128 + v * 127)));
      }
    }

    // Rotate buffers with zero allocation
    this.hPrev = cur;
    this.hCur = next;
    this.hNext = prev;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
