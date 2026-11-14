// Heritage Acoustics, 3D-CT Tonewood & Hide Material Science, ODE Contact Mechanics,
// and Magnetic Pickup / Tone-Stack Nodal Circuit Physics for Chora Simulation Instruments.
//
// Bridges Plajah's numerical simulation stack (`services/bio/ode.ts` Dormand-Prince 5(4) /
// Rosenbrock 2(3) stiff ODE solvers, `services/elec/guitar.ts` scale/pickup geometry, and
// complex MNA nodal analysis from `services/elec/sim.ts`) into SOMA, TONOS, and LYRA.
//
// Primary physical & metrological references:
//   - Stoel & Borman (2008), PLoS ONE: 3D micro-CT densitometry of Cremonese Stradivari &
//     Guarneri del Gesù spruce/maple plates (reduced earlywood/latewood Δρ/ρ contrast).
//   - Tai, Chung & Nagyvary (2017, 2021), PNAS / Angew. Chem.: hemicellulose hydrolysis
//     over 250–300 years + mineral ground (borate/alum/silicate) specific modulus boost.
//   - Curtin (2006) & Bissinger (2008): 3D CT thickness graduation maps of the 1715 "Titian"
//     Stradivari and 1734 Guarneri "Il Cannone", plus A0/CBR/B1-/B1+ & Bridge Hill (~2.3 kHz).
//   - Weinreich (1977), JASA: Coupled vertical/horizontal string polarization & two-stage
//     prompt-to-aftersound decay via asymmetric bridge admittance Y_v, Y_h, Y_vh.
//   - C.V. Raman (1920, 1934), Nature / Proc. Indian Assoc. Cult. Sci.: concentric & eccentric
//     iron-oxide *syahi* / *karanai* harmonic membrane loading (1 : 2 : 3 : 4 : 5 eigenmodes).
//   - Hunt & Crossley (1975), ASME J. Appl. Mech.: nonlinear viscoelastic contact f = k δ^p(1 + α δ̇).

import { solve, linspace, type Rhs } from '../../../bio/ode';
import { fretPosition } from '../../../elec/guitar';

// ─────────────────────────────────────────────────────────────────────────────
// 1. 3D-CT Heritage Tonewood, Gourd & Hide Material Database + Aging Law
// ─────────────────────────────────────────────────────────────────────────────

export type TonewoodId =
  | 'cremonese_spruce'   // Picea abies (Val di Fiemme alpine spruce, Cremona)
  | 'bosnian_maple'      // Acer pseudoplatanus (Balkan flamed back/rib maple)
  | 'torres_cedar'       // Thuja plicata / Spanish guitar & oud soundboard
  | 'indian_tun'         // Toona ciliata (Miraj / Kolkata sitar & tanpura tabli)
  | 'aged_gourd'         // Lagenaria siceraria (kora / sitar tumba / berimbau calabash)
  | 'kiri_paulownia'     // Paulownia tomentosa (scorched koto / guzheng / gayageum)
  | 'lenke_hardwood';    // Afzelia africana (hand-carved West African djembe / balafon)

export interface TonewoodSpec {
  id: TonewoodId;
  label: string;
  origin: string;
  /** Density ρ (kg/m³) at 10% EMC before centuries of hemicellulose loss. */
  rho: number;
  /** Longitudinal Young's modulus E_L (Pa) along grain. */
  eLong: number;
  /** Radial/cross-grain Young's modulus E_R (Pa) — governs orthotropic ratio E_L/E_R. */
  eRad: number;
  /** In-plane shear modulus G_LR (Pa). */
  gShear: number;
  /** Internal friction tan δ_L along grain (lower = longer ring). */
  lossLong: number;
  /** Internal friction tan δ_R across grain. */
  lossRad: number;
  /** Earlywood/latewood CT density contrast Δρ/ρ (Stoel & Borman 2008). */
  ctRingContrast: number;
}

export const HERITAGE_TONEWOODS: Record<TonewoodId, TonewoodSpec> = {
  cremonese_spruce: {
    id: 'cremonese_spruce',
    label: '1715 Val di Fiemme Spruce',
    origin: 'Cremona micro-CT (Stoel & Borman)',
    rho: 392,
    eLong: 14.8e9,
    eRad: 1.08e9,
    gShear: 0.92e9,
    lossLong: 0.0058,
    lossRad: 0.0175,
    ctRingContrast: 0.24, // Low Δρ/ρ vs ~0.42 in modern spruce
  },
  bosnian_maple: {
    id: 'bosnian_maple',
    label: 'Flamed Bosnian Maple',
    origin: 'Dinaric Alps back plate',
    rho: 595,
    eLong: 10.6e9,
    eRad: 1.65e9,
    gShear: 1.28e9,
    lossLong: 0.0085,
    lossRad: 0.0210,
    ctRingContrast: 0.16,
  },
  torres_cedar: {
    id: 'torres_cedar',
    label: '1888 Almería Red Cedar',
    origin: 'Fan-braced Spanish luthiery',
    rho: 355,
    eLong: 11.4e9,
    eRad: 0.88e9,
    gShear: 0.78e9,
    lossLong: 0.0068,
    lossRad: 0.0195,
    ctRingContrast: 0.29,
  },
  indian_tun: {
    id: 'indian_tun',
    label: 'Seasoned Miraj Tun (Red Cedar)',
    origin: 'Maharashtra carved tabli',
    rho: 465,
    eLong: 10.9e9,
    eRad: 1.18e9,
    gShear: 0.95e9,
    lossLong: 0.0078,
    lossRad: 0.0205,
    ctRingContrast: 0.22,
  },
  aged_gourd: {
    id: 'aged_gourd',
    label: 'Sun-Cured Lagenaria Calabash',
    origin: 'Pandharpur / Mande dried rind',
    rho: 310,
    eLong: 3.8e9,
    eRad: 3.4e9, // Nearly isotropic cellular shell
    gShear: 1.35e9,
    lossLong: 0.0145,
    lossRad: 0.0155,
    ctRingContrast: 0.11,
  },
  kiri_paulownia: {
    id: 'kiri_paulownia',
    label: 'Yaki-Sugi Scorched Paulownia',
    origin: 'Fukuyama hollowed kiri',
    rho: 282,
    eLong: 6.4e9,
    eRad: 0.56e9,
    gShear: 0.49e9,
    lossLong: 0.0072,
    lossRad: 0.0215,
    ctRingContrast: 0.34,
  },
  lenke_hardwood: {
    id: 'lenke_hardwood',
    label: 'Hand-Adzed Lenke Hardwood',
    origin: 'Upper Guinea goblet shell',
    rho: 785,
    eLong: 16.2e9,
    eRad: 2.15e9,
    gShear: 1.55e9,
    lossLong: 0.0082,
    lossRad: 0.0185,
    ctRingContrast: 0.19,
  },
};

export interface AgedWoodMetrics {
  rho: number;
  eLong: number;
  eRad: number;
  gShear: number;
  /** Longitudinal sound speed c_L = sqrt(E_L / ρ) (m/s). */
  cLong: number;
  /** Cross-grain sound speed c_R = sqrt(E_R / ρ) (m/s). */
  cRad: number;
  /** Schelleng radiation ratio R = c_L / ρ (m⁴ / (kg·s)). */
  radiationRatio: number;
  lossLong: number;
  lossRad: number;
  ctRingContrast: number;
}

/**
 * Compute aged tonewood mechanical state under hemicellulose hydrolysis & mineral ground
 * cross-linking (`age` ∈ [0, 1], where 0 = green workshop wood, 1 = 300-year Cremonese/heritage).
 *
 * Per Tai et al. (2017) & Oba et al. (2020):
 *  - Hemicellulose depolymerization lowers equilibrium hygroscopicity and mass density by ~7.5%,
 *    while crystalline cellulose microfibrils raise specific longitudinal modulus E_L/ρ by ~16%.
 *  - Cross-grain loss tan δ_R drops at low-mid frequencies while very high (>5 kHz) micro-crack
 *    viscous loss increases gently, giving aged instruments "sweetness without harshness".
 */
export function ageTonewood(base: TonewoodSpec, age: number, mineralGround = 0.5): AgedWoodMetrics {
  const a = Math.max(0, Math.min(1, age));
  const m = Math.max(0, Math.min(1, mineralGround));
  const rho = base.rho * (1 - 0.075 * a);
  const eLong = base.eLong * (1 + 0.085 * a + 0.045 * a * m);
  const eRad = base.eRad * (1 - 0.04 * a + 0.08 * a * m);
  const gShear = base.gShear * (1 + 0.03 * a * m);
  const cLong = Math.sqrt(eLong / rho);
  const cRad = Math.sqrt(eRad / rho);
  const radiationRatio = cLong / rho;
  const lossLong = base.lossLong * (1 - 0.22 * a);
  const lossRad = base.lossRad * (1 - 0.14 * a);
  const ctRingContrast = base.ctRingContrast * (1 - 0.28 * a);
  return { rho, eLong, eRad, gShear, cLong, cRad, radiationRatio, lossLong, lossRad, ctRingContrast };
}

export type HideMaterialId = 'mylar' | 'calfskin' | 'goatskin' | 'cowhide' | 'fishskin';

export interface HideSpec {
  id: HideMaterialId;
  label: string;
  arealDensity: number; // kg/m²
  dorsalSpineAnisotropy: number; // Fractional thickness rise along animal spine
  viscoelasticCreep: number;
  baseHfLoss: number;
}

export const HERITAGE_HIDES: Record<HideMaterialId, HideSpec> = {
  mylar: { id: 'mylar', label: 'Modern PET Film', arealDensity: 0.26, dorsalSpineAnisotropy: 0.003, viscoelasticCreep: 0.02, baseHfLoss: 0.16 },
  calfskin: { id: 'calfskin', label: 'Vellum Calfskin (Dresden)', arealDensity: 0.34, dorsalSpineAnisotropy: 0.038, viscoelasticCreep: 0.14, baseHfLoss: 0.28 },
  goatskin: { id: 'goatskin', label: 'Hand-Scraped Goatskin', arealDensity: 0.41, dorsalSpineAnisotropy: 0.055, viscoelasticCreep: 0.18, baseHfLoss: 0.34 },
  cowhide: { id: 'cowhide', label: 'Thick Rawhide (Taiko / Conga)', arealDensity: 0.88, dorsalSpineAnisotropy: 0.068, viscoelasticCreep: 0.22, baseHfLoss: 0.46 },
  fishskin: { id: 'fishskin', label: 'Parchment Ray/Shark Skin', arealDensity: 0.29, dorsalSpineAnisotropy: 0.028, viscoelasticCreep: 0.11, baseHfLoss: 0.24 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. 3D-CT Plate Thickness Graduation & Orthotropic Body Eigenmodes
// ─────────────────────────────────────────────────────────────────────────────

export type PlateArchProfile = 'stradivari_titian' | 'guarneri_cannone' | 'torres_fan' | 'carved_tabli' | 'hollowed_kiri';

/**
 * Evaluate 3D-CT soundboard thickness h(ξ, η) in millimetres over normalized plate coordinates
 * ξ ∈ [-1, 1] (bass-to-treble width) and η ∈ [-1, 1] (tail-to-neck length), including
 * handmade luthiery graduation asymmetry (`craftAsymmetry` ∈ [0, 1]).
 *
 * Stradivari 1715 "Titian" exhibits concentric oval graduation (2.8 mm lung center, 2.1 mm C-bout
 * flanks, 3.6 mm bass-bar ridge at ξ ≈ -0.28), whereas Guarneri 1734 "Il Cannone" retains a
 * thicker 3.2–3.5 mm central core for darker, punchier projection under heavy bow pressure.
 */
export function evaluateCtPlateThicknessMm(
  xi: number,
  eta: number,
  profile: PlateArchProfile,
  craftAsymmetry = 0.25,
): number {
  const r2 = xi * xi * 1.15 + eta * eta * 0.85;
  const asym = Math.max(0, Math.min(1, craftAsymmetry));
  // Bass-bar / asymmetric fan-brace ridge on the bass side (ξ ≈ -0.28)
  const bassBar = Math.exp(-((xi + 0.28) ** 2) / 0.022) * Math.exp(-(eta * eta) / 0.55);
  // Hand-planed thumb-plane / scraper micro-graduation ripples
  const scraperRipple = asym * (
    0.14 * Math.sin(3.7 * xi + 1.9 * eta + 0.6) +
    0.09 * Math.cos(6.1 * eta - 2.3 * xi) +
    0.18 * xi * (1 - 0.4 * eta * eta)
  );

  let h = 2.6;
  switch (profile) {
    case 'stradivari_titian':
      h = 2.85 - 0.72 * r2 + 0.35 * r2 * r2 + 0.95 * bassBar;
      break;
    case 'guarneri_cannone':
      h = 3.35 - 0.55 * r2 + 0.22 * r2 * r2 + 1.05 * bassBar;
      break;
    case 'torres_fan': {
      // 7 radial fan struts emanating from above the soundhole
      const fanAngle = Math.atan2(xi, eta + 0.55);
      const fan = Math.max(0, Math.cos(fanAngle * 7)) ** 4 * Math.exp(-((eta - 0.15) ** 2) / 0.45);
      h = 2.15 - 0.35 * r2 + 0.55 * fan;
      break;
    }
    case 'carved_tabli':
      h = 5.4 - 1.35 * r2 + 0.45 * Math.cos(2.4 * xi);
      break;
    case 'hollowed_kiri':
      // Koto / guzheng hollowed paulownia shell with carved inner ayasugi (herringbone) grooves
      h = 11.5 - 2.1 * (eta * eta) + 0.65 * Math.sin(14 * xi) * asym;
      break;
  }
  return Math.max(1.35, h + scraperRipple);
}

export interface OrthotropicMode {
  m: number;
  n: number;
  freqHz: number;
  qFactor: number;
  gain: number;
  panAzimuth: number; // [-1, 1] spatial radiation dipole lobe
}

/**
 * Solve orthotropic Kirchhoff-Love flexural plate eigenmodes + Bridge Hill (~2.1–2.8 kHz)
 * weighting for a heritage wooden soundboard, incorporating aged wood mechanics and
 * handmade craft graduation asymmetry.
 *
 * Dispersion law for orthotropic plate (Fletcher & Rossing §3.6):
 *   f_{mn} = (π / 2) √(D_eff / (ρ h)) · √( (m/L_x)⁴ (E_R/E_L)^{1/2} + 2 H_eff (m/L_x)² (n/L_y)² + (n/L_y)⁴ (E_L/E_R)^{1/2} )
 */
export function solveOrthotropicPlateModes(opts: {
  woodId: TonewoodId;
  fPlateBaseHz: number;
  fHelmholtzHz: number;
  age?: number;
  craftAsymmetry?: number;
  maxModes?: number;
  minFreqHz?: number;
  maxFreqHz?: number;
  seed?: number;
}): OrthotropicMode[] {
  const wood = HERITAGE_TONEWOODS[opts.woodId] ?? HERITAGE_TONEWOODS.cremonese_spruce;
  const aged = ageTonewood(wood, opts.age ?? 0.35, 0.5);
  const asym = Math.max(0, Math.min(1, opts.craftAsymmetry ?? 0.25));
  const minF = opts.minFreqHz ?? 700;
  const maxF = opts.maxFreqHz ?? 15800;
  const budget = opts.maxModes ?? 192;

  // Anisotropy ratio E_L / E_R (typically ~12-14 for Cremonese spruce, ~1.1 for gourd)
  const aniso = Math.sqrt(aged.eLong / Math.max(1e6, aged.eRad));
  const aspect = 1.48; // Typical luthiery length/width aspect
  // Reference (1,1) mode normalization so f_{1,1} aligns with fPlateBaseHz scaled by aging stiffness
  const ageFreqLift = Math.sqrt((aged.eLong / wood.eLong) / (aged.rho / wood.rho));
  const refTerm = Math.sqrt(1 / aniso + 2 * 0.42 / (aspect * aspect) + aniso / (aspect ** 4));
  const fScale = (opts.fPlateBaseHz * ageFreqLift) / Math.max(0.1, refTerm);

  // Bridge-Hill admittance peak (Bissinger 2008: ~2.3 kHz for violin/lute, scaled by fPlateBaseHz)
  const fBridgeHill = Math.max(1100, Math.min(3600, opts.fPlateBaseHz * 11.5));

  let s = ((opts.seed ?? 0x517cc1b7) >>> 0) || 1;
  const nextRand = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296 - 0.5;
  };

  const candidates: OrthotropicMode[] = [];
  const maxM = 22;
  const maxN = 26;
  // Asymmetric bridge foot position (bass foot over bass bar, treble foot near soundpost)
  const bx = 0.37 + 0.04 * asym;
  const by = 0.44 - 0.03 * asym;

  for (let m = 1; m <= maxM; m++) {
    for (let n = 1; n <= maxN; n++) {
      const mx2 = m * m;
      const ny2 = (n * n) / (aspect * aspect);
      const orthoTerm = Math.sqrt((mx2 * mx2) / aniso + 2 * 0.44 * mx2 * ny2 + ny2 * ny2 * aniso);
      // Handmade graduation perturbation splits near-degenerate mode pairs and breaks sterile grid spacing
      const craftPerturb = 1 + (0.008 + 0.026 * asym) * nextRand() + 0.006 * asym * Math.sin(m * 1.7 - n * 1.1);
      const f = fScale * orthoTerm * craftPerturb;
      if (f < minF || f > maxF) continue;

      // Modal Q governed by directional internal friction weighted between cross-grain (m) and along-grain (n)
      const grainShare = ny2 / (mx2 + ny2 + 1e-6);
      const tanDelta = grainShare * aged.lossLong + (1 - grainShare) * aged.lossRad + 1.1e-6 * f;
      const qFactor = Math.max(14, Math.min(135, (1 / Math.max(1e-4, tanDelta)) * (1 + 0.14 * nextRand())));

      // Coupling at asymmetric bridge feet + Cremonese Bridge Hill admittance boost
      const coupling = Math.sin(Math.PI * m * bx) * Math.sin(Math.PI * n * by);
      const hillRatio = (f - fBridgeHill) / (0.42 * fBridgeHill);
      const bridgeHill = 1 + 0.85 * Math.exp(-(hillRatio * hillRatio));
      const gain = Math.abs(coupling) * bridgeHill / Math.pow(m * n, 0.42);
      if (gain < 0.015) continue;

      // Odd/even cross-grain index m determines dipole left/right acoustic radiation lobe
      const panAzimuth = ((m % 2 === 0 ? 1 : -1) * (0.35 + 0.45 * Math.abs(nextRand()))) * (n % 2 === 0 ? 0.75 : 1);
      candidates.push({ m, n, freqHz: f, qFactor, gain, panAzimuth });
    }
  }

  candidates.sort((a, b) => a.freqHz - b.freqHz);
  if (candidates.length <= budget) return candidates;
  // Stratified selection across log-frequency so modal density stays realistic up to 15.8 kHz
  const picked: OrthotropicMode[] = [];
  for (let i = 0; i < budget; i++) {
    const idx = Math.min(candidates.length - 1, Math.floor((i * candidates.length) / budget));
    picked.push(candidates[idx]);
  }
  return picked;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Raman *Syahi* Harmonic Membrane Loading & Dorsal-Spine Doublet Splitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classical circular membrane Bessel roots j_{mn} vs C.V. Raman's iron-oxide *syahi* / *karanai*
 * central-paste loaded membrane ratios (Tabla / Pakhawaj / Mridangam).
 *
 * Unloaded circular membrane ratios (relative to (0,1)):
 *   (0,1)=1.000, (1,1)=1.593, (2,1)=2.136, (0,2)=2.295, (3,1)=2.653, (1,2)=2.917 ...
 * Loaded *syahi* membrane aligns degenerate groups into crisp harmonic overtones (relative to (1,1) fundamental!):
 *   (0,1) muted/sub ~0.52, (1,1)=1.000, (2,1)+(0,2)=2.000, (3,1)+(1,2)=3.000, (4,1)+(0,3)=4.000, (5,1)+(2,2)=5.000!
 */
export interface SyahiModeSpec {
  m: number;
  n: number;
  besselRoot: number;
  unloadedRatio11: number; // Ratio relative to j_{11} = 3.8317
  syahiRatio11: number;    // Harmonic ratio under full Raman syahi load
  doubletSplitFrac: number; // Fractional frequency split from dorsal spine + eccentric paste
}

const J11 = 3.831706;

export const SOMA_HERITAGE_MODES: readonly SyahiModeSpec[] = [
  { m: 0, n: 1, besselRoot: 2.4048, unloadedRatio11: 2.4048 / J11, syahiRatio11: 0.520, doubletSplitFrac: 0.0000 },
  { m: 1, n: 1, besselRoot: 3.8317, unloadedRatio11: 1.0000,       syahiRatio11: 1.000, doubletSplitFrac: 0.0042 },
  { m: 2, n: 1, besselRoot: 5.1356, unloadedRatio11: 5.1356 / J11, syahiRatio11: 2.002, doubletSplitFrac: 0.0058 },
  { m: 0, n: 2, besselRoot: 5.5201, unloadedRatio11: 5.5201 / J11, syahiRatio11: 1.997, doubletSplitFrac: 0.0000 },
  { m: 3, n: 1, besselRoot: 6.3802, unloadedRatio11: 6.3802 / J11, syahiRatio11: 3.004, doubletSplitFrac: 0.0068 },
  { m: 1, n: 2, besselRoot: 7.0156, unloadedRatio11: 7.0156 / J11, syahiRatio11: 2.995, doubletSplitFrac: 0.0074 },
  { m: 4, n: 1, besselRoot: 7.5883, unloadedRatio11: 7.5883 / J11, syahiRatio11: 4.006, doubletSplitFrac: 0.0082 },
  { m: 2, n: 2, besselRoot: 8.4172, unloadedRatio11: 8.4172 / J11, syahiRatio11: 3.992, doubletSplitFrac: 0.0088 },
  { m: 0, n: 3, besselRoot: 8.6537, unloadedRatio11: 8.6537 / J11, syahiRatio11: 4.012, doubletSplitFrac: 0.0000 },
  { m: 5, n: 1, besselRoot: 8.7715, unloadedRatio11: 8.7715 / J11, syahiRatio11: 4.996, doubletSplitFrac: 0.0094 },
  { m: 3, n: 2, besselRoot: 9.7610, unloadedRatio11: 9.7610 / J11, syahiRatio11: 5.008, doubletSplitFrac: 0.0102 },
  { m: 6, n: 1, besselRoot: 9.9361, unloadedRatio11: 9.9361 / J11, syahiRatio11: 5.992, doubletSplitFrac: 0.0108 },
  { m: 1, n: 3, besselRoot: 10.1735, unloadedRatio11: 10.1735 / J11, syahiRatio11: 5.015, doubletSplitFrac: 0.0112 },
  { m: 4, n: 2, besselRoot: 11.0647, unloadedRatio11: 11.0647 / J11, syahiRatio11: 6.010, doubletSplitFrac: 0.0118 },
  { m: 7, n: 1, besselRoot: 11.0864, unloadedRatio11: 11.0864 / J11, syahiRatio11: 6.994, doubletSplitFrac: 0.0124 },
  { m: 2, n: 3, besselRoot: 11.6198, unloadedRatio11: 11.6198 / J11, syahiRatio11: 6.985, doubletSplitFrac: 0.0130 },
];

/**
 * Compute effective membrane mode ratio (relative to (1,1) pitch mode) including:
 *  - Raman *syahi* harmonic paste loading (`syahiLoad` ∈ [0, 1])
 *  - Exact Kirchhoff-Love $j_{mn}^4$ bending stiffness dispersion (`stiffnessB`)
 *  - Dorsal-spine + lacing craft doublet splitting (`craftAsymmetry` ∈ [0, 1])
 */
export function computeMembraneModeRatios(opts: {
  syahiLoad: number;
  stiffnessB: number;
  craftAsymmetry: number;
}): Array<{ m: number; n: number; primaryRatio: number; doubletRatio: number }> {
  const syahi = Math.max(0, Math.min(1, opts.syahiLoad));
  const B = Math.max(0, opts.stiffnessB);
  const craft = Math.max(0, Math.min(1, opts.craftAsymmetry));
  return SOMA_HERITAGE_MODES.map((spec) => {
    const baseRatio = spec.unloadedRatio11 * (1 - syahi) + spec.syahiRatio11 * syahi;
    // Exact fourth-order plate bending term: sqrt(1 + B * (j_mn / j_11)^2)
    const relWaveNum2 = (spec.besselRoot / J11) ** 2;
    const stiffFactor = Math.sqrt(1 + B * relWaveNum2);
    const primaryRatio = baseRatio * stiffFactor;
    const split = spec.m > 0 ? spec.doubletSplitFrac * (0.15 + 1.85 * craft + 0.45 * syahi) : 0;
    return {
      m: spec.m,
      n: spec.n,
      primaryRatio,
      doubletRatio: primaryRatio * (1 + split),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ODE Solvers (`services/bio/ode.ts`) for Weinreich Polarization & Contact
// ─────────────────────────────────────────────────────────────────────────────

export interface PolarizationPoint {
  tMs: number;
  vx: number;
  vy: number;
  envelope: number;
}

/**
 * Integrate Weinreich (1977) coupled vertical ($y$) and horizontal ($x$) string polarization
 * using Plajah's Dormand-Prince 5(4) / Rosenbrock 2(3) ODE solver (`services/bio/ode.ts`).
 *
 * Demonstrates and calibrates the exact physical mechanism behind two-stage piano/lute decay
 * ("prompt sound" → blooming "aftersound") and rotating elliptical trajectory in `TonosPanel`
 * and `LyraPanel`.
 */
export function simulateWeinreichPolarization(opts: {
  freqHz: number;
  pluckAngleRad: number;
  bridgeCoupling: number;   // [0, 1] off-diagonal bridge admittance Y_vh
  craftDetuneCents: number; // Mistuning between vertical & horizontal planes
  durationMs?: number;
  points?: number;
}): PolarizationPoint[] {
  const w0 = 2 * Math.PI * Math.max(40, Math.min(600, opts.freqHz));
  const detuneRatio = Math.pow(2, opts.craftDetuneCents / 1200);
  const wy = w0;
  const wx = w0 * detuneRatio;
  // Vertical polarization couples strongly to soundboard (fast prompt decay);
  // Horizontal polarization couples weakly (long singing aftersound).
  const gammaY = w0 * (0.0085 + 0.006 * opts.bridgeCoupling);
  const gammaX = w0 * 0.0016;
  const kappa = w0 * w0 * (0.002 + 0.018 * Math.max(0, Math.min(1, opts.bridgeCoupling)));

  const durSec = (opts.durationMs ?? 55) * 1e-3;
  const nPts = Math.max(32, Math.min(320, opts.points ?? 140));
  const times = linspace(0, durSec, nPts);

  // State y = [x, vx, y, vy]
  const y0 = [
    Math.cos(opts.pluckAngleRad),
    0,
    Math.sin(opts.pluckAngleRad),
    0,
  ];

  const rhs: Rhs = (_t, s, out) => {
    const [x, vx, y, vy] = s;
    out[0] = vx;
    out[1] = -2 * gammaX * vx - wx * wx * x + kappa * y;
    out[2] = vy;
    out[3] = -2 * gammaY * vy - wy * wy * y + kappa * x;
  };

  const sol = solve(rhs, y0, times, { rtol: 1e-4, atol: 1e-6, maxSteps: 6000, budgetMs: 25 });
  const peakV = Math.max(1e-6, ...sol.y.map((st) => Math.hypot(st[1], st[3])));
  return sol.t.map((t, i) => {
    const st = sol.y[i];
    const vx = st[1] / peakV;
    const vy = st[3] / peakV;
    return {
      tMs: t * 1000,
      vx,
      vy,
      envelope: Math.hypot(vx, vy),
    };
  });
}

export interface ContactBouncePoint {
  tMs: number;
  membraneY: number;
  snareY: number;
  contactForce: number;
}

/**
 * Integrate Hunt-Crossley (1975) nonlinear gut-snare / *sersal* ring / *jawari* grazing contact
 * via `services/bio/ode.ts` (`f = k δ^{1.5} (1 + α δ̇)` when penetration δ > 0) for live UI
 * diagnostics and physical calibration.
 */
export function simulateHuntCrossleyRattle(opts: {
  membraneFreqHz: number;
  buzzAmount: number;
  durationMs?: number;
  points?: number;
}): ContactBouncePoint[] {
  const buzz = Math.max(0, Math.min(1, opts.buzzAmount));
  const durSec = (opts.durationMs ?? 28) * 1e-3;
  const nPts = Math.max(32, Math.min(240, opts.points ?? 120));
  const times = linspace(0, durSec, nPts);
  const wm = 2 * Math.PI * Math.max(55, Math.min(350, opts.membraneFreqHz));
  const ws = wm * (0.65 + 0.55 * (1 - buzz)); // Snare tension vs membrane
  const kContact = 2.4e6 * (0.3 + 0.7 * buzz);
  const alpha = 0.28;
  const clearance = 0.12 * (1 - 0.82 * buzz);

  // State [y_snare, v_snare] driven by damped membrane displacement y_m(t)
  const memAt = (t: number) => {
    const env = Math.exp(-t * 42);
    const dEnv = -42 * env;
    const s = Math.sin(wm * t);
    const c = Math.cos(wm * t);
    return { ym: env * s, vm: dEnv * s + env * wm * c };
  };

  const rhs: Rhs = (t, s, out) => {
    const ys = s[0];
    const vs = s[1];
    const { ym, vm } = memAt(t);
    const delta = ym - ys - clearance;
    const dDelta = vm - vs;
    let fContact = 0;
    if (delta > 0) {
      fContact = kContact * Math.pow(delta, 1.5) * Math.max(0, 1 + alpha * dDelta);
    }
    out[0] = vs;
    out[1] = -2 * 38 * vs - ws * ws * ys + fContact;
  };

  const sol = solve(rhs, [clearance * 0.5, 0], times, { rtol: 1e-3, atol: 1e-5, maxSteps: 5000, budgetMs: 25 });
  let maxF = 1e-6;
  const raw = sol.t.map((t, i) => {
    const ys = sol.y[i][0];
    const vs = sol.y[i][1];
    const { ym, vm } = memAt(t);
    const delta = ym - ys - clearance;
    const f = delta > 0 ? kContact * Math.pow(delta, 1.5) * Math.max(0, 1 + alpha * (vm - vs)) : 0;
    if (f > maxF) maxF = f;
    return { tMs: t * 1000, membraneY: ym, snareY: ys, contactForce: f };
  });
  return raw.map((p) => ({ ...p, contactForce: p.contactForce / maxF }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Magnetic Pickup RLC + Eddy-Current + Passive Tone-Stack Circuit Transfer
// ─────────────────────────────────────────────────────────────────────────────

export type PickupCircuitKind = 'single_alnico' | 'paf_humbucker' | 'rhodes_tine' | 'wurli_reed' | 'clav_dual';

export interface PickupCircuitSpec {
  kind: PickupCircuitKind;
  label: string;
  inductanceH: number;     // Coil inductance L (Henries)
  dcResistanceOhm: number; // Winding resistance R_dc (Ohms)
  windingCapF: number;     // Parasitic inter-turn capacitance C_p (Farads)
  eddyLossOhm: number;     // Pole-piece / cover Foucault eddy-current shunt R_eddy (Ohms)
  potLoadOhm: number;      // Volume/tone pot nominal resistance (250k single, 500k humbucker)
  toneCapF: number;        // Tone bleed capacitor (22 nF / 47 nF)
  cableCapF: number;       // Coax instrument cable capacitance (~450 pF)
  scaleMm: number;         // Scale length for Plajah `fretPosition` comb-filter aperture
}

export const HERITAGE_PICKUP_CIRCUITS: Record<PickupCircuitKind, PickupCircuitSpec> = {
  single_alnico: {
    kind: 'single_alnico',
    label: "'54 Alnico V Single-Coil (250kΩ / 47nF)",
    inductanceH: 2.35,
    dcResistanceOhm: 5950,
    windingCapF: 115e-12,
    eddyLossOhm: 240e3,
    potLoadOhm: 250e3,
    toneCapF: 47e-9,
    cableCapF: 420e-12,
    scaleMm: 647.7, // 25.5"
  },
  paf_humbucker: {
    kind: 'paf_humbucker',
    label: "'59 PAF Nickel-Cover Humbucker (500kΩ / 22nF)",
    inductanceH: 4.65,
    dcResistanceOhm: 8100,
    windingCapF: 145e-12,
    eddyLossOhm: 155e3, // German-silver cover eddy damping softens resonant spike
    potLoadOhm: 500e3,
    toneCapF: 22e-9,
    cableCapF: 480e-12,
    scaleMm: 628.65, // 24.75"
  },
  rhodes_tine: {
    kind: 'rhodes_tine',
    label: "'73 Suitcase Tine Coil + Passive Bass-Boost",
    inductanceH: 1.45,
    dcResistanceOhm: 2850,
    windingCapF: 95e-12,
    eddyLossOhm: 190e3,
    potLoadOhm: 100e3,
    toneCapF: 47e-9,
    cableCapF: 320e-12,
    scaleMm: 520,
  },
  wurli_reed: {
    kind: 'wurli_reed',
    label: '200A Electrostatic Polarized Comb Pickup',
    inductanceH: 0.42,
    dcResistanceOhm: 1200,
    windingCapF: 68e-12,
    eddyLossOhm: 420e3,
    potLoadOhm: 500e3,
    toneCapF: 15e-9,
    cableCapF: 210e-12,
    scaleMm: 480,
  },
  clav_dual: {
    kind: 'clav_dual',
    label: 'D6 Dual Opposed Magnetic Pickups + ABCD Filter',
    inductanceH: 1.95,
    dcResistanceOhm: 4300,
    windingCapF: 105e-12,
    eddyLossOhm: 260e3,
    potLoadOhm: 250e3,
    toneCapF: 33e-9,
    cableCapF: 390e-12,
    scaleMm: 610,
  },
};

export interface PickupBodePoint {
  freqHz: number;
  magDb: number;
  phaseDeg: number;
}

/**
 * Exact AC complex nodal admittance evaluation of a heritage magnetic/electrostatic pickup
 * loaded by eddy-current pole loss, passive tone-pot bleed ($R_{\text{tone}} + 1/(j\omega C_{\text{tone}})$),
 * volume pot, and coaxial cable capacitance, plus magnetic aperture comb filtering derived
 * from Plajah's `fretPosition(scaleMm, fret)` geometry (`services/elec/guitar.ts`).
 */
export function evaluatePickupBodeCurve(opts: {
  kind: PickupCircuitKind;
  toneKnob: number;      // [0, 1] 0 = rolled off, 1 = wide open
  pickupPosNorm: number; // [0, 1] bridge -> neck position
  age?: number;          // [0, 1] Alnico demagnetization & paper-bobbin capacitance drift
  fret?: number;
  points?: number;
}): { curve: PickupBodePoint[]; resonantFreqHz: number; resonantPeakDb: number; bridgeOffsetMm: number } {
  const spec = HERITAGE_PICKUP_CIRCUITS[opts.kind] ?? HERITAGE_PICKUP_CIRCUITS.single_alnico;
  const age = Math.max(0, Math.min(1, opts.age ?? 0.3));
  const tone = Math.max(0, Math.min(1, opts.toneKnob));
  const nPts = Math.max(24, Math.min(160, opts.points ?? 72));

  // Aging slightly softens inductance (Alnico V ~4% flux relaxation) and adds wax/bobbin dielectric loss
  const L = spec.inductanceH * (1 - 0.045 * age);
  const Rdc = spec.dcResistanceOhm * (1 + 0.015 * age);
  const Cp = spec.windingCapF * (1 + 0.08 * age);
  const Reddy = spec.eddyLossOhm * (1 - 0.06 * age);
  const Ccable = spec.cableCapF;
  // Audio-taper tone pot resistance in series with tone capacitor
  const Rtone = spec.potLoadOhm * Math.pow(tone, 2.2) + 220;
  const Ctone = spec.toneCapF;
  const Rvol = spec.potLoadOhm;

  // Stopped speaking length from Plajah's CAD guitar scale law `fretPosition`
  const stoppedMm = spec.scaleMm - fretPosition(spec.scaleMm, Math.max(0, Math.min(22, opts.fret ?? 0)));
  const bridgeOffsetMm = stoppedMm * (0.065 + 0.19 * Math.max(0, Math.min(1, opts.pickupPosNorm)));

  let peakDb = -120;
  let peakHz = 2500;
  const curve: PickupBodePoint[] = [];

  for (let i = 0; i < nPts; i++) {
    const f = 50 * Math.pow(12000 / 50, i / (nPts - 1));
    const w = 2 * Math.PI * f;

    // Series branch Z_s = R_dc + (jωL || R_eddy)
    // Y_coil = 1/(jωL) + 1/R_eddy = (1/R_eddy) - j/(ωL)
    const gCoil = 1 / Reddy;
    const bCoil = -1 / (w * L);
    const denomCoil = gCoil * gCoil + bCoil * bCoil;
    const zsRe = Rdc + gCoil / denomCoil;
    const zsIm = -bCoil / denomCoil;

    // Parallel load admittance Y_load = jω(C_p + C_cable) + 1/R_vol + 1/(R_tone - j/(ω C_tone))
    const ztRe = Rtone;
    const ztIm = -1 / (w * Ctone);
    const denomTone = ztRe * ztRe + ztIm * ztIm;
    const ylRe = 1 / Rvol + ztRe / denomTone;
    const ylIm = w * (Cp + Ccable) - ztIm / denomTone;

    // Voltage divider H(jω) = 1 / (1 + Z_s * Y_load)
    const dRe = 1 + (zsRe * ylRe - zsIm * ylIm);
    const dIm = zsRe * ylIm + zsIm * ylRe;
    const magElec = 1 / Math.hypot(dRe, dIm);

    // Magnetic pole-aperture gentle sinc roll-off (wider for humbucker dual coils than single blade)
    const apertureMm = spec.kind === 'paf_humbucker' ? 18.5 : 6.5;
    const waveLenMm = (340e3 / Math.max(60, f)) * 0.45;
    const xAp = (Math.PI * apertureMm) / Math.max(8, waveLenMm);
    const sincAp = xAp < 1e-3 ? 1 : Math.max(0.18, Math.abs(Math.sin(xAp) / xAp));

    const magDb = 20 * Math.log10(Math.max(1e-5, magElec * sincAp));
    const phaseDeg = (-Math.atan2(dIm, dRe) * 180) / Math.PI;
    if (magDb > peakDb) {
      peakDb = magDb;
      peakHz = f;
    }
    curve.push({ freqHz: f, magDb, phaseDeg });
  }

  return { curve, resonantFreqHz: peakHz, resonantPeakDb: peakDb, bridgeOffsetMm };
}
