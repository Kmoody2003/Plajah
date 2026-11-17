const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Stateful, game-tuned water balance. Rainfall and retained water are distinct. */
export class WetRoad {
  wetness = 0;
  pooling = 0;
  update(dt: number, rain: number, sun: number, wind: number): void {
    const seconds = clamp(dt, 0, 0.1), r = clamp(rain);
    // A thin film arrives first. Puddles fill more slowly and survive the shower.
    const drying = (0.0018 + clamp(sun) * 0.004 + clamp(wind) * 0.0015);
    this.wetness = clamp(this.wetness + seconds * (r * (1 - this.wetness) / 9 - (1 - r) * drying));
    this.pooling = clamp(this.pooling + seconds * (r * smooth(0.35, 0.9, this.wetness) / 75 - (1 - r) * (0.0012 + drying * 0.15)));
  }
}

/** Tuned contact response, not a tyre-pressure or fluid simulation. Depth is millimetres. */
export function waterContact(speedMps: number, wetness: number, depthMm: number, loadRatio = 1): { hydro: number; grip: number; drag: number } {
  const water = Math.max(0, depthMm), speed = Math.abs(speedMps);
  const onset = (31 - 10 * smooth(0.3, 5, water)) * Math.sqrt(clamp(loadRatio, 0.45, 1.8));
  const hydro = smooth(onset, onset + 12, speed) * smooth(0.35, 3, water);
  return { hydro, grip: Math.max(0.12, (1 - 0.24 * clamp(wetness)) * (1 - 0.82 * hydro)), drag: Math.min(0.24, water * 0.012 * smooth(2, 32, speed)) };
}
