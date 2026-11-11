// TONOS bodies — generated from INSTRUMENTS in rust/plajah-audio/src/tonos.rs (the `body` and
// excitation columns). tests/tonosDeep.test.ts checks it against the Rust table.

export interface TonosBodySpec {
  kind: 'wood' | 'skin' | 'tube' | 'gourd';
  /** Skin radius (m), areal density (kg/m²), tension (N/m). */
  a: number;
  sigma: number;
  ts: number;
  /** Wood/gourd: lowest plate mode; tube: air-column fundamental (Hz). */
  plate: number;
  /** Cavity Helmholtz mode (Hz). */
  helm: number;
  /** Mean bridge admittance (m/(N·s)). */
  y0: number;
  /** Bowed/wheeled: no deep body (the bow's future isn't known when the layer is rendered). */
  sustained: boolean;
}

export const TONOS_BODIES: TonosBodySpec[] = [
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 170, helm: 105, y0: 0.0022, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 150, helm: 95, y0: 0.002, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 250, helm: 180, y0: 0.0016, sustained: false },
  { kind: 'skin', a: 0.045, sigma: 0.3, ts: 1200, plate: 0, helm: 300, y0: 0.015, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 200, helm: 140, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.1, sigma: 0.25, ts: 3000, plate: 0, helm: 260, y0: 0.025, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 180, helm: 120, y0: 0.003, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 140, helm: 90, y0: 0.002, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 450, helm: 300, y0: 0.008, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 200, helm: 130, y0: 0.005, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 150, helm: 100, y0: 0.002, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 220, helm: 110, y0: 0.004, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 160, helm: 90, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.1, sigma: 0.2, ts: 1500, plate: 0, helm: 150, y0: 0.02, sustained: false },
  { kind: 'skin', a: 0.08, sigma: 0.25, ts: 2000, plate: 0, helm: 250, y0: 0.02, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 170, helm: 100, y0: 0.003, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 245, helm: 160, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.08, sigma: 0.25, ts: 1800, plate: 0, helm: 220, y0: 0.015, sustained: true },
  { kind: 'skin', a: 0.095, sigma: 0.28, ts: 1700, plate: 0, helm: 190, y0: 0.015, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 200, helm: 110, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.07, sigma: 0.15, ts: 1000, plate: 0, helm: 150, y0: 0.01, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 240, helm: 170, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.075, sigma: 0.2, ts: 1500, plate: 0, helm: 300, y0: 0.015, sustained: true },
  { kind: 'skin', a: 0.09, sigma: 0.12, ts: 900, plate: 0, helm: 200, y0: 0.018, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 260, helm: 170, y0: 0.004, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 220, helm: 140, y0: 0.003, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 200, helm: 130, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.08, sigma: 0.25, ts: 1800, plate: 0, helm: 180, y0: 0.02, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 180, helm: 110, y0: 0.004, sustained: false },
  { kind: 'skin', a: 0.08, sigma: 0.3, ts: 1500, plate: 0, helm: 220, y0: 0.02, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 210, helm: 140, y0: 0.002, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 280, helm: 220, y0: 0.004, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 260, helm: 170, y0: 0.003, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 260, helm: 200, y0: 0.003, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 280, helm: 270, y0: 0.003, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 300, helm: 220, y0: 0.004, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 150, helm: 100, y0: 0.002, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 190, helm: 110, y0: 0.0035, sustained: false },
  { kind: 'skin', a: 0.08, sigma: 0.2, ts: 1200, plate: 0, helm: 260, y0: 0.02, sustained: true },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 230, helm: 150, y0: 0.0025, sustained: false },
  { kind: 'skin', a: 0.22, sigma: 0.6, ts: 2500, plate: 0, helm: 90, y0: 0.012, sustained: false },
  { kind: 'skin', a: 0.13, sigma: 0.25, ts: 1800, plate: 0, helm: 160, y0: 0.02, sustained: false },
  { kind: 'skin', a: 0.1, sigma: 0.2, ts: 1500, plate: 0, helm: 180, y0: 0.025, sustained: false },
  { kind: 'skin', a: 0.11, sigma: 0.2, ts: 1500, plate: 0, helm: 150, y0: 0.025, sustained: false },
  { kind: 'skin', a: 0.12, sigma: 0.25, ts: 1500, plate: 0, helm: 170, y0: 0.02, sustained: false },
  { kind: 'skin', a: 0.18, sigma: 0.5, ts: 1800, plate: 0, helm: 100, y0: 0.015, sustained: false },
  { kind: 'skin', a: 0.1, sigma: 0.3, ts: 1800, plate: 0, helm: 200, y0: 0.02, sustained: true },
  { kind: 'tube', a: 0, sigma: 0, ts: 0, plate: 171, helm: 620, y0: 0.003, sustained: false },
  { kind: 'wood', a: 0, sigma: 0, ts: 0, plate: 170, helm: 120, y0: 0.003, sustained: false },
  { kind: 'skin', a: 0.11, sigma: 0.5, ts: 2000, plate: 0, helm: 110, y0: 0.025, sustained: false },
  { kind: 'skin', a: 0.1, sigma: 0.2, ts: 1300, plate: 0, helm: 180, y0: 0.025, sustained: true },
  { kind: 'gourd', a: 0, sigma: 0, ts: 0, plate: 900, helm: 600, y0: 0.005, sustained: false },
];
