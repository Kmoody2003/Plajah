// Pure structural-engineering functions. SI base units used internally:
//   length: m   force: N   moment: N·m   stress: Pa   E: Pa   I: m^4
// UI passes engineering-friendly units (kN, GPa, mm^4, ...) and converts at the
// boundary using the helpers below. Formulas are the classic closed-form
// solutions for prismatic, linear-elastic members.

// ── unit conversions ────────────────────────────────────────────────────────
export const kN = 1e3; // kN → N
export const GPa = 1e9; // GPa → Pa
export const MPa = 1e6; // MPa → Pa
export const mm = 1e-3; // mm → m
export const cm = 1e-2; // cm → m
export const mm4_to_m4 = 1e-12; // mm^4 → m^4  (1e-3)^4
export const cm4_to_m4 = 1e-8; // cm^4 → m^4  (1e-2)^4
export const mm3_to_m3 = 1e-9; // mm^3 → m^3  (section modulus)
export const cm3_to_m3 = 1e-6; // cm^3 → m^3

// ── simply-supported beam ───────────────────────────────────────────────────
// Uniformly distributed load w (N/m) over span L (m):
//   Reactions R = wL/2 ; Mmax = wL²/8 (at midspan) ; Vmax = wL/2 (at supports)
//   δmax = 5wL⁴ / (384·E·I)  (at midspan)
export function ssBeamUDL(w: number, L: number, E: number, I: number) {
  const reaction = (w * L) / 2;
  const Mmax = (w * L * L) / 8;
  const Vmax = (w * L) / 2;
  const dMax = E > 0 && I > 0 ? (5 * w * Math.pow(L, 4)) / (384 * E * I) : NaN;
  return { reaction, Mmax, Vmax, dMax };
}

// Central point load P (N) at midspan of span L (m):
//   Reactions R = P/2 ; Mmax = PL/4 (at midspan) ; Vmax = P/2
//   δmax = PL³ / (48·E·I)  (at midspan)
export function ssBeamPoint(P: number, L: number, E: number, I: number) {
  const reaction = P / 2;
  const Mmax = (P * L) / 4;
  const Vmax = P / 2;
  const dMax = E > 0 && I > 0 ? (P * Math.pow(L, 3)) / (48 * E * I) : NaN;
  return { reaction, Mmax, Vmax, dMax };
}

// ── cantilever beam (fixed at one end, free at the other) ────────────────────
// End point load P (N) at the free tip:
//   Mmax = P·L (at the fixed support) ; Vmax = P
//   δmax = PL³ / (3·E·I)  (at the free tip)
export function cantileverPoint(P: number, L: number, E: number, I: number) {
  const Mmax = P * L;
  const Vmax = P;
  const dMax = E > 0 && I > 0 ? (P * Math.pow(L, 3)) / (3 * E * I) : NaN;
  return { Mmax, Vmax, dMax };
}

// Uniformly distributed load w (N/m):
//   Mmax = wL²/2 (at the fixed support) ; Vmax = wL
//   δmax = wL⁴ / (8·E·I)  (at the free tip)
export function cantileverUDL(w: number, L: number, E: number, I: number) {
  const Mmax = (w * L * L) / 2;
  const Vmax = w * L;
  const dMax = E > 0 && I > 0 ? (w * Math.pow(L, 4)) / (8 * E * I) : NaN;
  return { Mmax, Vmax, dMax };
}

// ── section properties (about the strong / centroidal axis) ──────────────────
// Rectangle b × h (any consistent length unit → I in unit^4, S in unit^3):
//   A = b·h ; I = b·h³/12 ; S = b·h²/6 ; c = h/2
export function rectSection(b: number, h: number) {
  const A = b * h;
  const I = (b * Math.pow(h, 3)) / 12;
  const S = (b * Math.pow(h, 2)) / 6;
  const c = h / 2;
  return { A, I, S, c };
}

// Solid circle of diameter d:
//   A = πd²/4 ; I = πd⁴/64 ; S = πd³/32 ; c = d/2
export function circleSection(d: number) {
  const A = (Math.PI * d * d) / 4;
  const I = (Math.PI * Math.pow(d, 4)) / 64;
  const S = (Math.PI * Math.pow(d, 3)) / 32;
  const c = d / 2;
  return { A, I, S, c };
}

// Bending stress σ = M / S  (M in N·m, S in m³ → Pa)
export function bendingStress(M: number, S: number) {
  return S > 0 ? M / S : NaN;
}

// ── Euler column buckling ────────────────────────────────────────────────────
// Critical (elastic) buckling load: Pcr = π²·E·I / (K·L)²
//   effective length Le = K·L ; radius of gyration r = √(I/A)
//   slenderness ratio λ = Le / r ; critical stress σcr = Pcr / A
export const K_PRESETS: Record<string, { K: number; label: string }> = {
  pinnedPinned: { K: 1.0, label: 'Pinned–Pinned' },
  fixedFree: { K: 2.0, label: 'Fixed–Free (cantilever)' },
  fixedFixed: { K: 0.5, label: 'Fixed–Fixed' },
  fixedPinned: { K: 0.7, label: 'Fixed–Pinned' },
};

export function eulerBuckling(E: number, I: number, L: number, K: number, A: number) {
  const Le = K * L;
  const Pcr = Le > 0 && E > 0 && I > 0 ? (Math.PI * Math.PI * E * I) / (Le * Le) : NaN;
  const r = A > 0 && I > 0 ? Math.sqrt(I / A) : NaN;
  const slenderness = r > 0 ? Le / r : NaN;
  const sigmaCr = A > 0 ? Pcr / A : NaN;
  return { Le, Pcr, r, slenderness, sigmaCr };
}

// ── ASCE 7-16 LRFD basic load combinations ──────────────────────────────────
// Inputs are the magnitude of each load effect in the SAME unit (kN or kPa).
//   D dead, L live, Lr roof-live, S snow, R rain, W wind, E seismic.
// Signed combinations (0.9D ± 1.0W) are evaluated at both signs; the governing
// (max absolute) value is reported per combination.
export interface AsceLoads {
  D: number;
  L: number;
  Lr: number;
  S: number;
  R: number;
  W: number;
  E: number;
}

export interface AsceCombo {
  id: number;
  expr: string;
  value: number;
}

export function asce7LRFD(v: AsceLoads): { combos: AsceCombo[]; governing: AsceCombo } {
  const { D, L, Lr, S, R, W, E } = v;
  const roofish = Math.max(Lr, S, R); // the "or" family (Lr | S | R)
  // ASCE 7-16 §2.3.1 LRFD combinations 1–7
  const combos: AsceCombo[] = [
    { id: 1, expr: '1.4D', value: 1.4 * D },
    { id: 2, expr: '1.2D + 1.6L + 0.5(Lr | S | R)', value: 1.2 * D + 1.6 * L + 0.5 * roofish },
    { id: 3, expr: '1.2D + 1.6(Lr | S | R) + (1.0L | 0.5W)', value: 1.2 * D + 1.6 * roofish + Math.max(1.0 * L, 0.5 * W) },
    { id: 4, expr: '1.2D + 1.0W + 1.0L + 0.5(Lr | S | R)', value: 1.2 * D + 1.0 * W + 1.0 * L + 0.5 * roofish },
    { id: 5, expr: '1.2D + 1.0E + 1.0L + 0.2S', value: 1.2 * D + 1.0 * E + 1.0 * L + 0.2 * S },
    { id: 6, expr: '0.9D + 1.0W', value: Math.abs(0.9 * D + 1.0 * W) },
    { id: 7, expr: '0.9D + 1.0E', value: Math.abs(0.9 * D + 1.0 * E) },
  ];
  const governing = combos.reduce((a, b) => (b.value > a.value ? b : a), combos[0]);
  return { combos, governing };
}

// ── formatting helper ────────────────────────────────────────────────────────
export function fmt(x: number, digits = 3): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e6 || abs < 1e-3) return x.toExponential(digits);
  return x.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
