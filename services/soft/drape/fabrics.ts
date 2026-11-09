// Fabric library for the 3D fit room, from physical properties a maker can measure at home (see
// calibrate.ts): weight (g/m²), stretch % along the warp (lengthwise grain) and the weft
// (crosswise) under a light pull, bending length from the cantilever test (rigidity D = w·c³),
// thickness, friction. Every preset says where its numbers come from. They are typical values for
// the cloth class, not a lab measurement of a given bolt: measure yours with the home tests and
// the fit room uses those instead.

export type Finish = 'plain' | 'twill' | 'knit' | 'rib' | 'satin' | 'pile' | 'fleece' | 'felt';
export interface Fabric {
  id: string; name: string; knit: boolean;
  /** Weight, grams per square metre. */
  gsm: number;
  /** Elongation under a light hand pull (250 N/m), percent, along the warp and the weft. */
  stretchWarp: number; stretchWeft: number;
  /** Bending rigidity, gf·cm²/cm (KES-FB2 units). Jersey ≈ 0.03, denim ≈ 1. */
  bend: number;
  /** Thickness, mm. */
  thickness: number;
  /** Cloth-to-skin friction coefficient. */
  friction: number;
  /** Price per metre of a typical 150 cm wide bolt, USD (editable; used for cost per size). */
  pricePerMetre: number;
  colour: string;
  /** Surface for rendering (weave/knit normal map, sheen, fuzz). */
  finish?: Finish;
  /** Cantilever bending length c (mm) the rigidity was derived from. */
  bendingLength?: number;
  /** Where each number comes from (shown in the fabric picker). */
  source?: string;
}

interface Swatch extends Omit<Fabric, 'bend'> { bendingLength: number }
/** Rigidity from bending length and weight: D = w·c³ (Peirce), in gf·cm²/cm. */
const fromSwatch = (s: Swatch): Fabric => { const w = s.gsm / 1000 * 9.81, c = s.bendingLength / 1000; return { ...s, bend: Math.round(w * c ** 3 / 9.81e-5 * 1000) / 1000 }; };
const TYPICAL = 'Typical values for this cloth class, not a measured bolt; measure yours with the home tests.';

export const FABRICS: Fabric[] = ([
  { id: 'jersey', name: 'Cotton jersey', knit: true, finish: 'knit', gsm: 180, stretchWarp: 20, stretchWeft: 55, bendingLength: 12, thickness: 0.6, friction: 0.35, pricePerMetre: 12, colour: '#7c9cbf',
    source: `Weight: T-shirt single jersey is sold at about 140-220 g/m²; 180 is mid-range. Stretch: single jersey gives far more across the courses (weft) than along the wales. Bending: c ≈ 12 mm is typical of a light single jersey in the cantilever test. ${TYPICAL}` },
  { id: 'stretch-jersey', name: 'Cotton-spandex jersey (95/5)', knit: true, finish: 'knit', gsm: 210, stretchWarp: 45, stretchWeft: 90, bendingLength: 11, thickness: 0.6, friction: 0.4, pricePerMetre: 15, colour: '#5f7f9c',
    source: `Weight: leggings-weight cotton/elastane jersey is usually 190-240 g/m². Stretch: 4-way with 5% elastane; pattern makers ask for 50%+ across the grain for snug fits. Bending: c ≈ 11 mm (limp). ${TYPICAL}` },
  { id: 'rib', name: '1×1 rib knit', knit: true, finish: 'rib', gsm: 230, stretchWarp: 25, stretchWeft: 90, bendingLength: 13, thickness: 1.0, friction: 0.4, pricePerMetre: 14, colour: '#6b8aa9',
    source: `Weight: cuff and band rib is usually 200-280 g/m². Stretch: rib's whole point is crosswise recovery stretch, often 80-100%. Bending: c ≈ 13 mm. ${TYPICAL}` },
  { id: 'fleece', name: 'French terry / fleece', knit: true, finish: 'fleece', gsm: 300, stretchWarp: 12, stretchWeft: 35, bendingLength: 16, thickness: 2.0, friction: 0.45, pricePerMetre: 16, colour: '#8c7fb5',
    source: `Weight: sweatshirt fleece and French terry are 260-340 g/m². Stretch: the looped back limits stretch to roughly a third of jersey's. Bending: c ≈ 16 mm (holds a soft fold). ${TYPICAL}` },
  { id: 'denim', name: 'Denim 12 oz', knit: false, finish: 'twill', gsm: 400, stretchWarp: 1.5, stretchWeft: 2.5, bendingLength: 31, thickness: 0.9, friction: 0.5, pricePerMetre: 15, colour: '#3d5a80',
    source: `Weight: 12 oz/yd² is 407 g/m² by definition. Stretch: rigid 3×1 twill, a few percent at most under a hand pull. Bending: c ≈ 31 mm, typical of mid-weight denim (stands in stiff folds). ${TYPICAL}` },
  { id: 'poplin', name: 'Cotton poplin', knit: false, finish: 'plain', gsm: 120, stretchWarp: 1.5, stretchWeft: 3, bendingLength: 19, thickness: 0.25, friction: 0.35, pricePerMetre: 10, colour: '#e8e2d0',
    source: `Weight: shirting poplin runs 100-140 g/m². Stretch: tight plain weave, slightly more give across the weft. Bending: c ≈ 19 mm (crisp for its weight). ${TYPICAL}` },
  { id: 'satin', name: 'Polyester satin', knit: false, finish: 'satin', gsm: 95, stretchWarp: 1, stretchWeft: 2, bendingLength: 14.5, thickness: 0.2, friction: 0.15, pricePerMetre: 9, colour: '#c9a227',
    source: `Weight: dress and lining satins are 70-120 g/m². Stretch: very little. Bending: c ≈ 14.5 mm (fluid). Friction: low, it slides over skin and other layers. ${TYPICAL}` },
  { id: 'minky', name: 'Minky (short pile)', knit: true, finish: 'pile', gsm: 300, stretchWarp: 10, stretchWeft: 30, bendingLength: 17, thickness: 3.0, friction: 0.5, pricePerMetre: 18, colour: '#e9a6c1',
    source: `Weight: plush minky is listed at 280-350 g/m². Stretch: a knit base, mostly crosswise. Thickness includes the 2-3 mm pile. Bending: c ≈ 17 mm. ${TYPICAL}` },
  { id: 'felt', name: 'Wool-blend felt', knit: false, finish: 'felt', gsm: 280, stretchWarp: 4, stretchWeft: 4, bendingLength: 28, thickness: 1.5, friction: 0.55, pricePerMetre: 20, colour: '#b5654a',
    source: `Weight: 1-1.5 mm craft felt is roughly 200-350 g/m². Stretch: non-woven, the same every way. Bending: c ≈ 28 mm (stiff, used for bases). ${TYPICAL}` },
] as Swatch[]).map(fromSwatch);

export const fabricById = (id: string) => FABRICS.find(f => f.id === id);

export function customFabric(over: Partial<Fabric>): Fabric {
  return { ...FABRICS[0], id: 'custom', name: 'Custom fabric', source: 'Your own numbers.', ...over };
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

/**
 * Bending rigidity D in solver units (g·mm²/s², per unit width) from the KES-style value in
 * gf·cm²/cm: 1 gf·cm²/cm = 9.81e-5 N·m = 9.81e4 g·mm²/s².
 */
export const bendRigidity = (f: Fabric) => f.bend * 9.81e4;

/** Largest comfortable stretch the fabric gives, fraction (for "will it go over the head"). */
export const maxStretch = (f: Fabric) => Math.max(f.stretchWarp, f.stretchWeft) / 100;
