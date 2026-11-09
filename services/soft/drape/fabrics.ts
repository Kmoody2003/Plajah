// Fabric library for the 3D fit room, from physical properties a maker can read off a swatch card:
// weight (g/m²), stretch % along the warp (lengthwise grain) and the weft (crosswise), bending
// stiffness (KES-style, gf·cm²/cm), thickness, friction. The solver turns these into constraint
// stiffness; the numbers are typical published ranges, not lab measurements of a given bolt.

export interface Fabric {
  id: string; name: string; knit: boolean;
  /** Weight, grams per square metre. */
  gsm: number;
  /** Elongation under a light hand pull (~250 N/m), percent, along the warp and the weft. */
  stretchWarp: number; stretchWeft: number;
  /** Bending rigidity, gf·cm²/cm (KES-FB2 style). Jersey ≈ 0.02, denim ≈ 1. */
  bend: number;
  /** Thickness, mm. */
  thickness: number;
  /** Cloth-to-skin friction coefficient. */
  friction: number;
  /** Price per metre of a typical 150 cm wide bolt, USD (editable; used for cost per size). */
  pricePerMetre: number;
  colour: string;
}

export const FABRICS: Fabric[] = [
  { id: 'jersey', name: 'Cotton jersey', knit: true, gsm: 180, stretchWarp: 20, stretchWeft: 55, bend: 0.03, thickness: 0.6, friction: 0.35, pricePerMetre: 12, colour: '#7c9cbf' },
  { id: 'rib', name: '1×1 rib knit', knit: true, gsm: 230, stretchWarp: 25, stretchWeft: 90, bend: 0.05, thickness: 1.0, friction: 0.4, pricePerMetre: 14, colour: '#6b8aa9' },
  { id: 'fleece', name: 'French terry / fleece', knit: true, gsm: 300, stretchWarp: 12, stretchWeft: 35, bend: 0.12, thickness: 2.0, friction: 0.45, pricePerMetre: 16, colour: '#8c7fb5' },
  { id: 'denim', name: 'Denim 12 oz', knit: false, gsm: 400, stretchWarp: 1.5, stretchWeft: 2.5, bend: 1.2, thickness: 0.9, friction: 0.5, pricePerMetre: 15, colour: '#3d5a80' },
  { id: 'poplin', name: 'Cotton poplin', knit: false, gsm: 120, stretchWarp: 1.5, stretchWeft: 3, bend: 0.08, thickness: 0.25, friction: 0.35, pricePerMetre: 10, colour: '#e8e2d0' },
  { id: 'satin', name: 'Polyester satin', knit: false, gsm: 95, stretchWarp: 1, stretchWeft: 2, bend: 0.03, thickness: 0.2, friction: 0.15, pricePerMetre: 9, colour: '#c9a227' },
  { id: 'minky', name: 'Minky (short pile)', knit: true, gsm: 300, stretchWarp: 10, stretchWeft: 30, bend: 0.15, thickness: 3.0, friction: 0.5, pricePerMetre: 18, colour: '#e9a6c1' },
  { id: 'felt', name: 'Wool-blend felt', knit: false, gsm: 280, stretchWarp: 4, stretchWeft: 4, bend: 0.6, thickness: 1.5, friction: 0.55, pricePerMetre: 20, colour: '#b5654a' },
];

export const fabricById = (id: string) => FABRICS.find(f => f.id === id);

export function customFabric(over: Partial<Fabric>): Fabric {
  return { ...FABRICS[0], id: 'custom', name: 'Custom fabric', ...over };
}

/** Default fabric for a pattern piece's role and the kind of product. */
export function defaultFabric(role: string, kind: string): Fabric {
  if (role === 'rib') return fabricById('rib')!;
  if (role === 'contrast' && kind === 'plush') return fabricById('felt')!;
  if (role === 'fur' || kind === 'plush') return fabricById('minky')!;
  if (role === 'lining') return fabricById('poplin')!;
  return fabricById(kind === 'apparel' ? 'fleece' : 'poplin')!;
}

/**
 * Edge stiffness (g/s², our solver units: mm, g, s) along a direction at angle `a` to the grain.
 * Membrane stiffness N/m = load / strain; 1 N/m = 1000 g/s². Bias (45°) takes the shear stiffness,
 * which for woven cloth is far below the yarn directions and for knits sits between them.
 */
export function edgeStiffness(f: Fabric, cosA: number, sinA: number): number {
  const kWarp = 250 / (f.stretchWarp / 100) * 1000, kWeft = 250 / (f.stretchWeft / 100) * 1000;
  const kShear = Math.min(kWarp, kWeft) * (f.knit ? 0.5 : 0.08);
  const c2 = cosA * cosA, s2 = sinA * sinA, cs = Math.abs(cosA * sinA) * 2; // cs: 1 on the bias
  // Harmonic blend so the softest component dominates where it applies.
  const yarn = 1 / (c2 / kWarp + s2 / kWeft);
  return yarn * (1 - cs) + kShear * cs;
}

/** Bending constraint stiffness (g/s²) from KES bending rigidity; scaled so denim stands and jersey drapes. */
export const bendStiffness = (f: Fabric) => 2e4 * f.bend;

/** Largest comfortable stretch the fabric gives, fraction (for "will it go over the head"). */
export const maxStretch = (f: Fabric) => Math.max(f.stretchWarp, f.stretchWeft) / 100;
