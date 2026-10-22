// Wraps — vehicle panels and object dielines for wide-format and label/packaging shops.
//
// Honest scope:
//   • Vehicle templates are PARAMETRIC GUIDES, not OEM data. Every surface size and zone is a ratio of the
//     length/height/width the customer measures; the ratios were set from typical body proportions and are
//     approximate. The installer measures the real vehicle and the shop re-checks every panel before print.
//   • Zones ('window', 'door-gap', 'handle', …) are "keep faces and text out of here" guidance, approximated
//     as rectangles (wheel wells flagged as arches for drawing only).
//   • Tiling: straight panels across a roll, a fixed overlap, seams nudged to door gaps (±6 in) and away from
//     handles. No compound-curve stretch, recess relief or per-panel distortion — installers handle that.
//   • Dielines: cylinder labels, cone sleeves (exact annular-sector unwrap), reverse tuck-end cartons and
//     sticker cuts. Paths use ONLY absolute M/L/C/Z so the press-PDF writer can stroke them as spot colours.
//     Carton geometry is a generic style (flap depths are rules of thumb); the converter's die wins.
// Units are inches throughout. Pure: no DOM.

import type { PreflightFinding, RectIn, SpotColor } from './types';
import { conditionById } from './conditions';

// ── Spots ────────────────────────────────────────────────────────────────────

export const CUT_CONTOUR: SpotColor = { name: 'CutContour', previewHex: '#ff00ff', cmykFallback: [0, 100, 0, 0], technical: 'cut' };
export const CREASE: SpotColor = { name: 'Crease', previewHex: '#00a0ff', cmykFallback: [100, 0, 0, 0], technical: 'crease' };

// ── Vehicle model ────────────────────────────────────────────────────────────

export type SurfaceId = 'driver-side' | 'passenger-side' | 'rear' | 'front' | 'hood' | 'roof' | 'tailgate';
export type ZoneKind = 'window' | 'door-gap' | 'handle' | 'wheel-well' | 'fuel-door' | 'light' | 'body-line';

export interface WrapZone { kind: ZoneKind; rect: RectIn; shape?: 'rect' | 'arch'; note: string }

export interface WrapSurface {
  id: SurfaceId | 'flat';
  label: string;
  /** Trim size, inches. Zone rects are relative to the trim's top-left. */
  w: number;
  h: number;
  zones: WrapZone[];
}

export interface WrapMaterial {
  name: string;
  rollWidthIn: number;
  /** Shared strip between neighbouring panels. */
  overlapIn: number;
  laminate: boolean;
}

export interface Dieline {
  label: string;
  /** Flat (unfolded) size, bleed excluded. Paths have their origin at the flat's top-left. */
  flatIn: [number, number];
  /** CutContour paths — absolute M/L/C/Z only, inches, 4 decimals. */
  cut: string[];
  /** Crease/fold paths — same rules. */
  crease: string[];
  /** Bleed outline (extends past the flat, so it has negative coordinates). */
  bleedPath?: string;
  notes: string[];
  /** Non-printing guides (glue tab / overlap start) — same path rules; never sent as a spot. */
  guides?: string[];
  kind?: 'cylinder' | 'cone-sleeve' | 'tuck-box' | 'sticker';
  bleedIn?: number;
  spots?: SpotColor[];
  /** Geometry the maths produced (radii, sweep, panel sizes) for display and tests. */
  geometry?: Record<string, number>;
}

export interface WrapJob {
  id: string;
  kind: 'vehicle' | 'object';
  label: string;
  surfaces: WrapSurface[];
  bleedIn: number;
  material: WrapMaterial;
  /** Artboard ÷ real size: 0.1 = design at 1:10. */
  designScale: number;
  notes: string[];
  templateId?: VehicleTemplateId;
  windowFilm?: 'none' | 'perforated';
  dieline?: Dieline;
}

export const DEFAULT_VEHICLE_MATERIAL: WrapMaterial = { name: 'Cast wrap vinyl 60 in + laminate', rollWidthIn: 60, overlapIn: 1, laminate: true };
/** Shops lose about an inch each side of the roll to pinch rollers and margins. */
export const printableWidthIn = (m: WrapMaterial) => Math.max(1, m.rollWidthIn - 2);

export type VehicleTemplateId = 'compact-car' | 'sedan' | 'suv' | 'pickup' | 'cargo-van' | 'box-truck-16ft' | 'trailer-53ft' | 'food-truck';
type Dim = 'L' | 'H' | 'W';
type Range = [number, number];

/** Zone spec in FRACTIONS of the surface (x, y, w, h). */
interface ZoneSpec { kind: ZoneKind; f: [number, number, number, number]; note: string; shape?: 'arch' }
interface SurfaceSpec { id: SurfaceId; label: string; w: [Dim, number]; h: [Dim, number]; zones: ZoneSpec[] }

export interface VehicleTemplate {
  id: VehicleTemplateId;
  label: string;
  /** Typical overall size — NOT your vehicle. Measure it. */
  typical: { lengthIn: Range; heightIn: Range; widthIn: Range };
  surfaces: SurfaceSpec[];
  notes: string[];
}

const z = (kind: ZoneKind, x: number, y: number, w: number, h: number, note: string, shape?: 'arch'): ZoneSpec => ({ kind, f: [x, y, w, h], note, ...(shape ? { shape } : {}) });
const GAP = 0.004;
const gap = (x: number, y0 = 0.3, y1 = 0.92) => z('door-gap', x - GAP / 2, y0, GAP, y1 - y0, 'Door gap — vinyl is cut here; a good seam, a bad place for a face.');
const handle = (x: number, y: number) => z('handle', x, y, 0.045, 0.06, 'Door handle — vinyl is relieved around it.');
const well = (cx: number, r: number, top = 0.6) => z('wheel-well', cx - r, top, 2 * r, 1 - top, 'Wheel arch — graphics are cut away.', 'arch');
const lights = (y: number, h: number, note: string) => [z('light', 0, y, 0.16, h, note), z('light', 0.84, y, 0.16, h, note)];
const bodyLine = (y: number) => z('body-line', 0, y - 0.01, 1, 0.02, 'Body crease — text across it distorts.');

/** Side of a passenger car: greenhouse on top, two wheel arches, doors between. */
function carSide(o: { glass: [number, number, number]; gaps: number[]; handles: number[]; wheels: [number, number]; r: number; fuel?: number }): ZoneSpec[] {
  return [
    z('window', o.glass[0], 0, o.glass[1] - o.glass[0], o.glass[2], 'Side glass — left clear, or perforated film (50/50 see-through).'),
    ...o.gaps.map(x => gap(x)),
    ...o.handles.map(x => handle(x, 0.42)),
    well(o.wheels[0], o.r), well(o.wheels[1], o.r),
    ...(o.fuel != null ? [z('fuel-door', o.fuel, 0.4, 0.04, 0.1, 'Fuel door — side varies by make; it is cut free.')] : []),
    z('light', 0, 0.36, 0.035, 0.14, 'Headlight wrap-around.'), z('light', 0.965, 0.36, 0.035, 0.14, 'Tail-light wrap-around.'),
    bodyLine(0.5),
  ];
}

function carSurfaces(side: ZoneSpec[], s: { sideH: number; rearH: number; frontH: number; hoodL: number; roofL: number }): SurfaceSpec[] {
  return [
    { id: 'driver-side', label: 'Driver side', w: ['L', 0.97], h: ['H', s.sideH], zones: side },
    { id: 'passenger-side', label: 'Passenger side', w: ['L', 0.97], h: ['H', s.sideH], zones: side },
    { id: 'rear', label: 'Rear', w: ['W', 0.9], h: ['H', s.rearH], zones: [z('window', 0.14, 0, 0.72, 0.38, 'Rear glass — perforated film or clear.'), ...lights(0.4, 0.18, 'Tail light — not covered.'), bodyLine(0.62)] },
    { id: 'front', label: 'Front bumper', w: ['W', 0.9], h: ['H', s.frontH], zones: [...lights(0, 0.4, 'Headlight — never covered.'), bodyLine(0.55)] },
    { id: 'hood', label: 'Hood', w: ['W', 0.85], h: ['L', s.hoodL], zones: [] },
    { id: 'roof', label: 'Roof', w: ['W', 0.75], h: ['L', s.roofL], zones: [] },
  ];
}

const mirrorX = (zs: ZoneSpec[]) => zs.map(q => ({ ...q, f: [1 - q.f[0] - q.f[2], q.f[1], q.f[2], q.f[3]] as ZoneSpec['f'] }));

const boxRear = (doors: 'roll-up' | 'swing'): ZoneSpec[] => doors === 'roll-up'
  ? [handle(0.475, 0.9), ...lights(0.88, 0.1, 'Marker / tail light.'), bodyLine(0.25), bodyLine(0.5), bodyLine(0.75)]
  : [gap(0.5, 0, 1), handle(0.42, 0.45), handle(0.535, 0.45), ...lights(0.9, 0.1, 'Marker / tail light.')];

export const VEHICLE_TEMPLATES: Record<VehicleTemplateId, VehicleTemplate> = {
  'compact-car': {
    id: 'compact-car', label: 'Compact car / hatchback', typical: { lengthIn: [160, 175], heightIn: [56, 60], widthIn: [68, 71] },
    surfaces: carSurfaces(carSide({ glass: [0.3, 0.78, 0.36], gaps: [0.3, 0.52, 0.74], handles: [0.46, 0.69], wheels: [0.17, 0.82], r: 0.09, fuel: 0.84 }), { sideH: 0.72, rearH: 0.6, frontH: 0.3, hoodL: 0.22, roofL: 0.3 }),
    notes: [],
  },
  sedan: {
    id: 'sedan', label: 'Sedan', typical: { lengthIn: [185, 197], heightIn: [56, 59], widthIn: [71, 74] },
    surfaces: carSurfaces(carSide({ glass: [0.3, 0.74, 0.36], gaps: [0.29, 0.5, 0.71], handles: [0.44, 0.65], wheels: [0.16, 0.8], r: 0.08, fuel: 0.82 }), { sideH: 0.72, rearH: 0.5, frontH: 0.3, hoodL: 0.24, roofL: 0.28 }),
    notes: ['Sedan trunk lid is part of "rear".'],
  },
  suv: {
    id: 'suv', label: 'SUV / crossover', typical: { lengthIn: [180, 205], heightIn: [66, 74], widthIn: [72, 80] },
    surfaces: carSurfaces(carSide({ glass: [0.27, 0.92, 0.36], gaps: [0.27, 0.5, 0.72], handles: [0.42, 0.65], wheels: [0.16, 0.81], r: 0.085, fuel: 0.84 }), { sideH: 0.75, rearH: 0.62, frontH: 0.3, hoodL: 0.22, roofL: 0.4 }),
    notes: ['Rear liftgate glass is usually perforated film.'],
  },
  pickup: {
    id: 'pickup', label: 'Pickup (crew cab)', typical: { lengthIn: [210, 250], heightIn: [74, 80], widthIn: [79, 81] },
    surfaces: [
      ...(() => { const side = carSide({ glass: [0.24, 0.56, 0.32], gaps: [0.24, 0.41, 0.58], handles: [0.36, 0.53], wheels: [0.15, 0.78], r: 0.075, fuel: 0.62 }).concat([gap(0.6, 0.3, 0.75)]);
        return [{ id: 'driver-side' as const, label: 'Driver side (cab + bed)', w: ['L', 0.97] as [Dim, number], h: ['H', 0.62] as [Dim, number], zones: side },
                { id: 'passenger-side' as const, label: 'Passenger side (cab + bed)', w: ['L', 0.97] as [Dim, number], h: ['H', 0.62] as [Dim, number], zones: side }]; })(),
      { id: 'tailgate', label: 'Tailgate', w: ['W', 0.8], h: ['H', 0.28], zones: [handle(0.475, 0.05), bodyLine(0.5)] },
      { id: 'front', label: 'Front bumper', w: ['W', 0.9], h: ['H', 0.25], zones: [...lights(0, 0.5, 'Headlight — never covered.')] },
      { id: 'hood', label: 'Hood', w: ['W', 0.85], h: ['L', 0.24], zones: [bodyLine(0.5)] },
      { id: 'roof', label: 'Cab roof', w: ['W', 0.75], h: ['L', 0.2], zones: [] },
    ],
    notes: ['Bed rails and tonneau covers are not included.'],
  },
  'cargo-van': {
    id: 'cargo-van', label: 'Cargo van (high roof)', typical: { lengthIn: [230, 290], heightIn: [82, 110], widthIn: [80, 84] },
    surfaces: [
      { id: 'driver-side', label: 'Driver side', w: ['L', 0.95], h: ['H', 0.82], zones: [
        z('window', 0.08, 0.3, 0.12, 0.2, 'Cab door glass.'), gap(0.08, 0.3, 0.9), gap(0.22, 0.3, 0.9), handle(0.19, 0.55),
        well(0.13, 0.06, 0.78), well(0.8, 0.06, 0.78), z('fuel-door', 0.24, 0.55, 0.03, 0.06, 'Fuel door — side varies by make.'), bodyLine(0.62)] },
      { id: 'passenger-side', label: 'Passenger side (sliding door)', w: ['L', 0.95], h: ['H', 0.82], zones: [
        z('window', 0.8, 0.3, 0.12, 0.2, 'Cab door glass.'), gap(0.92, 0.3, 0.9), gap(0.78, 0.3, 0.9), gap(0.5, 0.25, 0.9), handle(0.52, 0.55), handle(0.76, 0.55),
        well(0.87, 0.06, 0.78), well(0.2, 0.06, 0.78), bodyLine(0.62)] },
      { id: 'rear', label: 'Rear doors', w: ['W', 0.85], h: ['H', 0.72], zones: [...boxRear('swing'), z('window', 0.1, 0.05, 0.8, 0.25, 'Rear door glass — perforated film or clear.')] },
      { id: 'front', label: 'Front', w: ['W', 0.85], h: ['H', 0.3], zones: [...lights(0, 0.5, 'Headlight — never covered.')] },
      { id: 'hood', label: 'Hood', w: ['W', 0.8], h: ['L', 0.1], zones: [] },
      { id: 'roof', label: 'Roof', w: ['W', 0.8], h: ['L', 0.8], zones: [] },
    ],
    notes: ['Ribbed panels on some vans need extra relief cuts — ask the installer.'],
  },
  'box-truck-16ft': {
    id: 'box-truck-16ft', label: 'Box truck 16 ft', typical: { lengthIn: [260, 290], heightIn: [120, 135], widthIn: [90, 96] },
    surfaces: [
      { id: 'driver-side', label: 'Box — driver side', w: ['L', 0.66], h: ['H', 0.72], zones: [bodyLine(0.96), z('body-line', 0, 0, 1, 0.03, 'Top rail and rivet line.')] },
      { id: 'passenger-side', label: 'Box — passenger side', w: ['L', 0.66], h: ['H', 0.72], zones: [bodyLine(0.96), z('body-line', 0, 0, 1, 0.03, 'Top rail and rivet line.')] },
      { id: 'rear', label: 'Roll-up door', w: ['W', 0.92], h: ['H', 0.66], zones: boxRear('roll-up') },
      { id: 'front', label: 'Box header (above cab)', w: ['W', 0.95], h: ['H', 0.18], zones: [z('light', 0.1, 0, 0.8, 0.15, 'Marker lights.')] },
    ],
    notes: ['Cab doors are separate spot graphics.', 'Roll-up door graphics are cut at every slat joint.', 'Rivet heads need heat and a rivet brush; avoid fine text across rivet lines.'],
  },
  'trailer-53ft': {
    id: 'trailer-53ft', label: 'Trailer 53 ft (dry van)', typical: { lengthIn: [630, 640], heightIn: [156, 162], widthIn: [100, 102] },
    surfaces: [
      { id: 'driver-side', label: 'Driver side', w: ['L', 0.98], h: ['H', 0.68], zones: [bodyLine(0.97), z('body-line', 0, 0, 1, 0.03, 'Top rail and rivet line.')] },
      { id: 'passenger-side', label: 'Passenger side', w: ['L', 0.98], h: ['H', 0.68], zones: [bodyLine(0.97), z('body-line', 0, 0, 1, 0.03, 'Top rail and rivet line.')] },
      { id: 'rear', label: 'Swing doors', w: ['W', 0.95], h: ['H', 0.68], zones: [...boxRear('swing'), z('handle', 0.2, 0, 0.03, 1, 'Lock rod.'), z('handle', 0.77, 0, 0.03, 1, 'Lock rod.')] },
    ],
    notes: ['Logistic posts and rivet lines run every ~2 ft; DOT conspicuity tape must stay visible.', 'Sides are usually printed in many vertical panels — plan the design for seams.'],
  },
  'food-truck': {
    id: 'food-truck', label: 'Food truck', typical: { lengthIn: [216, 312], heightIn: [120, 132], widthIn: [90, 96] },
    surfaces: [
      { id: 'driver-side', label: 'Driver side', w: ['L', 0.8], h: ['H', 0.6], zones: [well(0.75, 0.06, 0.8), z('fuel-door', 0.15, 0.6, 0.04, 0.08, 'Fuel / generator access.'), bodyLine(0.78)] },
      { id: 'passenger-side', label: 'Passenger side (service window)', w: ['L', 0.8], h: ['H', 0.6], zones: [
        z('window', 0.3, 0.12, 0.42, 0.38, 'Service window — opens; never cover it.'), gap(0.3, 0.1, 0.52), gap(0.72, 0.1, 0.52), z('handle', 0.3, 0.52, 0.42, 0.04, 'Counter / awning hardware.'),
        well(0.25, 0.06, 0.8), bodyLine(0.78)] },
      { id: 'rear', label: 'Rear', w: ['W', 0.9], h: ['H', 0.6], zones: [gap(0.3, 0.05, 0.95), gap(0.7, 0.05, 0.95), z('window', 0.35, 0.08, 0.3, 0.2, 'Rear door glass.'), handle(0.62, 0.5), ...lights(0.88, 0.1, 'Tail light.')] },
      { id: 'front', label: 'Box header (above cab)', w: ['W', 0.95], h: ['H', 0.15], zones: [] },
    ],
    notes: ['Menu boards and awnings are separate graphics.', 'Health-permit decals and vents must stay visible.'],
  },
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const dimOf = (d: Dim, m: { lengthIn: number; heightIn: number; widthIn: number }) => d === 'L' ? m.lengthIn : d === 'H' ? m.heightIn : m.widthIn;

export function buildVehicleWrap(
  templateId: VehicleTemplateId,
  measured: { lengthIn: number; heightIn: number; widthIn: number; windowFilm?: 'none' | 'perforated' },
  opts: { material?: Partial<WrapMaterial>; bleedIn?: number; surfaces?: SurfaceId[] } = {},
): WrapJob {
  const t = VEHICLE_TEMPLATES[templateId];
  const film = measured.windowFilm || 'none';
  const surfaces: WrapSurface[] = t.surfaces
    .filter(s => !opts.surfaces || opts.surfaces.includes(s.id))
    .map(s => {
      const w = r4(dimOf(s.w[0], measured) * s.w[1]), h = r4(dimOf(s.h[0], measured) * s.h[1]);
      // Passenger side is the driver side seen from the other side of the vehicle — mirror it.
      const specs = s.id === 'passenger-side' && t.surfaces.find(o => o.id === 'driver-side')?.zones === s.zones
        ? mirrorX(s.zones).filter(q => q.kind !== 'fuel-door') : s.zones;
      return { id: s.id, label: s.label, w, h, zones: specs.map(q => ({
        kind: q.kind, note: q.note, ...(q.shape ? { shape: q.shape } : {}),
        rect: { x: r4(q.f[0] * w), y: r4(q.f[1] * h), w: Math.max(0.5, r4(q.f[2] * w)), h: r4(q.f[3] * h) },
      })) };
    });
  const inRange = (v: number, r: Range) => v >= r[0] * 0.85 && v <= r[1] * 1.15;
  const notes = [
    'Template sizes are approximate guides derived from your measurements — measure every panel on the vehicle before print.',
    `Typical ${t.label}: ${t.typical.lengthIn.join('–')} in long, ${t.typical.heightIn.join('–')} in high, ${t.typical.widthIn.join('–')} in wide. Measure yours.`,
    film === 'perforated' ? 'Windows: perforated window film (typically 50/50) — graphics show outside, the driver sees through; it reduces visibility, check local law for front side glass.' : 'Windows left clear — keep artwork that matters off the glass.',
    ...t.notes,
  ];
  if (!inRange(measured.lengthIn, t.typical.lengthIn) || !inRange(measured.heightIn, t.typical.heightIn) || !inRange(measured.widthIn, t.typical.widthIn))
    notes.unshift('Your measurements are well outside the typical range for this template — double-check units (inches) and the template choice.');
  return {
    id: `vehicle:${templateId}:${measured.lengthIn}x${measured.heightIn}x${measured.widthIn}`,
    kind: 'vehicle', label: t.label, surfaces, bleedIn: opts.bleedIn ?? 3,
    material: { ...DEFAULT_VEHICLE_MATERIAL, ...opts.material }, designScale: 0.1, notes, templateId, windowFilm: film,
  };
}

// ── Tiling ───────────────────────────────────────────────────────────────────

export interface WrapPanel {
  index: number;
  /** Surface coords (trim top-left = 0,0), bleed included. */
  rect: RectIn;
  /** As it runs on the roll: printW is across the roll (≤ printable width), printH is along the feed. */
  printW: number;
  printH: number;
  /** Shared strip with the previous / next panel (left/right for vertical panels, top/bottom when sideways). */
  overlapLeft: number;
  overlapRight: number;
}

export interface TileResult {
  surfaceId: WrapSurface['id'];
  orientation: 'vertical' | 'sideways';
  panels: WrapPanel[];
  /** Seam centre lines (x for vertical panels, y for sideways). */
  seams: number[];
  /** Seams that were moved onto a door gap / body line. */
  snapped: number[];
  linearIn: number;
  mediaSqFt: number;
  printSqFt: number;
  surfaceSqFt: number;
  wasteSqFt: number;
}

/** Seam positions along one axis. Greedy: each seam starts at an even split of what's left, snaps to the
 *  nearest target within ±snapIn when both sides still fit the roll, and steps out of avoid ranges. */
function seams1D(start: number, end: number, n: number, ov: number, P: number, targets: number[], avoid: Array<[number, number]>, snapIn = 6) {
  const seams: number[] = [], snapped: number[] = [];
  let prev = start;
  for (let k = 1; k < n; k++) {
    const left = n - k + 1;
    const fits = (s: number) => {
      const cur = s - prev + (k === 1 ? ov / 2 : ov);
      const restN = left - 1, rest = end - s;
      const restW = restN === 1 ? rest + ov / 2 : rest / restN + ov;
      return s > prev && cur <= P + 1e-9 && restW <= P + 1e-9;
    };
    const nominal = prev + (end - prev) / left;
    let s = nominal, hit = false;
    const near = targets.filter(t => Math.abs(t - nominal) <= snapIn && fits(t)).sort((a, b) => Math.abs(a - nominal) - Math.abs(b - nominal));
    if (near.length) { s = near[0]; hit = true; }
    else {
      const bad = avoid.find(([a, b]) => s > a - ov / 2 && s < b + ov / 2);
      if (bad) {
        const opts = [bad[0] - ov / 2 - 0.25, bad[1] + ov / 2 + 0.25].filter(fits).sort((a, b) => Math.abs(a - nominal) - Math.abs(b - nominal));
        if (opts.length) s = opts[0];
      }
    }
    seams.push(r4(s)); if (hit) snapped.push(r4(s));
    prev = s;
  }
  return { seams, snapped };
}

function tileAxis(span: [number, number], other: [number, number], ov: number, P: number, targets: number[], avoid: Array<[number, number]>) {
  const L = span[1] - span[0];
  // Fewest panels that fit when split evenly (edge panels carry half an overlap, inner ones a full one).
  let n = 1;
  while (!(n === 1 ? L <= P : L / n + (n >= 3 ? ov : ov / 2) <= P + 1e-9)) n++;
  const { seams, snapped } = seams1D(span[0], span[1], n, ov, P, targets, avoid);
  const cuts = [span[0], ...seams, span[1]];
  const strips = cuts.slice(0, -1).map((a, i) => {
    const s0 = i === 0 ? a : a - ov / 2, s1 = i === cuts.length - 2 ? cuts[i + 1] : cuts[i + 1] + ov / 2;
    return { a: r4(s0), b: r4(s1), ovA: i === 0 ? 0 : ov, ovB: i === cuts.length - 2 ? 0 : ov };
  });
  return { strips, seams, snapped, otherLen: other[1] - other[0] };
}

export function tilePanels(surface: WrapSurface, material: WrapMaterial, bleedIn: number, opts: { prefer?: 'auto' | 'vertical' | 'sideways' } = {}): TileResult {
  const b = bleedIn, ov = material.overlapIn, P = printableWidthIn(material);
  const X: [number, number] = [-b, surface.w + b], Y: [number, number] = [-b, surface.h + b];
  const gaps = surface.zones.filter(q => q.kind === 'door-gap');
  const avoidX = surface.zones.filter(q => q.kind === 'handle' || q.kind === 'fuel-door').map(q => [q.rect.x, q.rect.x + q.rect.w] as [number, number]);
  const vert = tileAxis(X, Y, ov, P, gaps.map(q => q.rect.x + q.rect.w / 2), avoidX);
  const side = tileAxis(Y, X, ov, P, surface.zones.filter(q => q.kind === 'body-line').map(q => q.rect.y + q.rect.h / 2), []);
  const vLin = vert.strips.length * vert.otherLen, sLin = side.strips.length * side.otherLen;
  const useSide = opts.prefer === 'sideways' || (opts.prefer !== 'vertical' && sLin < vLin - 1e-9);
  const t = useSide ? side : vert;
  const panels: WrapPanel[] = t.strips.map((s, index) => useSide
    ? { index, rect: { x: X[0], y: s.a, w: X[1] - X[0], h: r4(s.b - s.a) }, printW: r4(s.b - s.a), printH: r4(X[1] - X[0]), overlapLeft: s.ovA, overlapRight: s.ovB }
    : { index, rect: { x: s.a, y: Y[0], w: r4(s.b - s.a), h: Y[1] - Y[0] }, printW: r4(s.b - s.a), printH: r4(Y[1] - Y[0]), overlapLeft: s.ovA, overlapRight: s.ovB });
  const linearIn = r4(panels.reduce((a, p) => a + p.printH, 0));
  const mediaSqFt = r4(linearIn * material.rollWidthIn / 144);
  const printSqFt = r4(panels.reduce((a, p) => a + p.printW * p.printH, 0) / 144);
  const surfaceSqFt = r4(surface.w * surface.h / 144);
  return { surfaceId: surface.id, orientation: useSide ? 'sideways' : 'vertical', panels, seams: t.seams, snapped: t.snapped, linearIn, mediaSqFt, printSqFt, surfaceSqFt, wasteSqFt: r4(mediaSqFt - surfaceSqFt) };
}

export const tileJob = (job: WrapJob) => job.surfaces.map(s => tilePanels(s, job.material, job.bleedIn));

// ── Preflight ────────────────────────────────────────────────────────────────

/** Artwork per surface id: pixel size covering trim + bleed at full size, plus optional key-content rects
 *  (faces, logos, phone numbers…) in surface inches. */
export type WrapArtwork = Record<string, { pixelW: number; pixelH: number; keyRects?: RectIn[] }>;

const hits = (a: RectIn, b: RectIn) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function wrapPreflight(job: WrapJob, artwork: WrapArtwork = {}): PreflightFinding[] {
  const out: PreflightFinding[] = [];
  const ppi = conditionById('WIDE_FORMAT').ppi;
  const minBleed = job.kind === 'vehicle' ? 2 : 0.0625;
  if (job.bleedIn < minBleed) out.push({ level: 'error', code: 'wrap-bleed', message: `Bleed is ${job.bleedIn} in; ${job.kind === 'vehicle' ? 'vehicle wraps need at least 2 in (3–4 in is usual)' : 'labels need at least 1/16 in'}.`, fix: `Set bleed to ${job.kind === 'vehicle' ? 3 : 0.125} in and extend the artwork past the trim.`, autoFix: 'extend-bleed' });
  const k = 1 / job.designScale;
  let media = 0, area = 0;
  for (const s of job.surfaces) {
    const tile = tilePanels(s, job.material, job.bleedIn);
    media += tile.mediaSqFt; area += tile.surfaceSqFt;
    const art = artwork[s.id];
    if (art) {
      const eff = Math.min(art.pixelW / (s.w + 2 * job.bleedIn), art.pixelH / (s.h + 2 * job.bleedIn));
      const scaled = k !== 1 ? ` At 1:${Math.round(k)} design scale that is ${Math.round(eff * k)} ppi on the board.` : '';
      if (eff < ppi.min) out.push({ level: 'error', code: 'wrap-low-ppi', pageId: s.id, message: `${s.label}: artwork is ${Math.round(eff)} ppi at full size (minimum ${ppi.min}).${scaled}`, fix: `Use artwork at least ${Math.ceil(ppi.min * (s.w + 2 * job.bleedIn))} px wide${k !== 1 ? ` (${Math.ceil(ppi.min * k)} ppi on the 1:${Math.round(k)} board)` : ''}, or vector art.` });
      else if (eff < ppi.recommended) out.push({ level: 'warn', code: 'wrap-low-ppi', pageId: s.id, message: `${s.label}: artwork is ${Math.round(eff)} ppi at full size (recommended ${ppi.recommended}).${scaled}`, fix: 'Fine from a distance; use higher-resolution art for anything seen up close.' });
      for (const r of art.keyRects || []) {
        const seam = tile.seams.find(x => tile.orientation === 'vertical' ? x > r.x && x < r.x + r.w : x > r.y && x < r.y + r.h);
        if (seam != null) out.push({ level: 'warn', code: 'wrap-seam-through-content', pageId: s.id, message: `${s.label}: a panel seam at ${seam.toFixed(1)} in runs through key content (a face or text).`, fix: 'Move the content off the seam, or ask the shop to shift the seam to a door gap.' });
        for (const q of s.zones) {
          if (!hits(r, q.rect)) continue;
          if (q.kind === 'window') out.push({ level: 'warn', code: 'wrap-content-on-window', pageId: s.id, message: `${s.label}: key content sits on a window.`, fix: job.windowFilm === 'perforated' ? 'Perforated film (50/50) shows graphics at reduced density and reduces visibility; keep faces and small text off glass.' : 'Windows are usually left clear — move the content onto the body.' });
          else if (q.kind === 'door-gap' || q.kind === 'handle' || q.kind === 'wheel-well' || q.kind === 'fuel-door') out.push({ level: 'warn', code: 'wrap-content-on-hazard', pageId: s.id, message: `${s.label}: key content crosses a ${q.kind.replace('-', ' ')}.`, fix: q.note });
        }
      }
    }
  }
  out.push({ level: 'info', code: 'wrap-area', message: `Wrap area ≈ ${area.toFixed(0)} sq ft over ${job.surfaces.length} surface${job.surfaces.length === 1 ? '' : 's'}; media ≈ ${media.toFixed(0)} sq ft of ${job.material.rollWidthIn} in roll including bleed, overlap and waste.`, fix: job.kind === 'vehicle' ? 'Estimates from template ratios — the shop quotes from the measured panels.' : 'Ganging labels on one sheet reduces waste.' });
  return out;
}

// ── Path helpers (absolute M/L/C/Z only, 4 decimals) ─────────────────────────

const n4 = (v: number) => String(r4(v) === 0 ? 0 : r4(v));
const pt = (x: number, y: number) => `${n4(x)} ${n4(y)}`;
const poly = (p: Array<[number, number]>, close = true) => p.map(([x, y], i) => `${i ? 'L' : 'M'} ${pt(x, y)}`).join(' ') + (close ? ' Z' : '');
const line = (x0: number, y0: number, x1: number, y1: number) => `M ${pt(x0, y0)} L ${pt(x1, y1)}`;
const rectPath = (x: number, y: number, w: number, h: number) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

/** Circular arc as cubic Béziers in ≤90° pieces, without the leading M. Angles in radians, standard
 *  orientation in the given coordinate frame: point = (cx + r·cos a, cy + r·sin a). */
function arcC(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const d = (a1 - a0) / segs, kk = (4 / 3) * Math.tan(d / 4);
  let s = '';
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + i * d, t1 = t0 + d;
    const [x0, y0, x1, y1] = [cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
    s += ` C ${pt(x0 - kk * r * Math.sin(t0), y0 + kk * r * Math.cos(t0))} ${pt(x1 + kk * r * Math.sin(t1), y1 - kk * r * Math.cos(t1))} ${pt(x1, y1)}`;
  }
  return s;
}

function roundRectPath(x: number, y: number, w: number, h: number, rr: number): string {
  const r = Math.max(0, Math.min(rr, w / 2, h / 2));
  if (r === 0) return rectPath(x, y, w, h);
  const H = Math.PI / 2;
  return `M ${pt(x + r, y)} L ${pt(x + w - r, y)}${arcC(x + w - r, y + r, r, -H, 0)} L ${pt(x + w, y + h - r)}${arcC(x + w - r, y + h - r, r, 0, H)}`
    + ` L ${pt(x + r, y + h)}${arcC(x + r, y + h - r, r, H, 2 * H)} L ${pt(x, y + r)}${arcC(x + r, y + r, r, 2 * H, 3 * H)} Z`;
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => {
  // Circle arcs scaled to an ellipse: build as circle of radius 1 then map.
  const k = (4 / 3) * Math.tan(Math.PI / 8);
  const P = (x: number, y: number) => pt(cx + x * rx, cy + y * ry);
  return `M ${P(1, 0)} C ${P(1, k)} ${P(k, 1)} ${P(0, 1)} C ${P(-k, 1)} ${P(-1, k)} ${P(-1, 0)} C ${P(-1, -k)} ${P(-k, -1)} ${P(0, -1)} C ${P(k, -1)} ${P(1, -k)} ${P(1, 0)} Z`;
};

// ── Object dielines ──────────────────────────────────────────────────────────

const LABEL_BLEED = 0.0625;

/** Label for a can, bottle, jar or straight tumbler: flat width = π·d + overlap. */
export function cylinderWrap(diameterIn: number, heightIn: number, overlapIn = 0.25): Dieline {
  const w = Math.PI * diameterIn + overlapIn, h = heightIn, b = LABEL_BLEED;
  return {
    kind: 'cylinder', label: `Cylinder label ${diameterIn}″ ⌀ × ${heightIn}″`, flatIn: [r4(w), r4(h)],
    cut: [rectPath(0, 0, w, h)], crease: [], bleedPath: rectPath(-b, -b, w + 2 * b, h + 2 * b), bleedIn: b, spots: [CUT_CONTOUR],
    guides: overlapIn > 0 ? [line(w - overlapIn, 0, w - overlapIn, h)] : [],
    geometry: { circumferenceIn: r4(Math.PI * diameterIn), overlapIn },
    notes: [`Circumference ${r4(Math.PI * diameterIn)} in + ${overlapIn} in overlap. The last ${overlapIn} in sits under the start — keep text out of it.`, 'Measure the label panel height, not the whole container; for a tapered container use the cone sleeve.'],
  };
}

/** Paper-cup sleeve / tapered tumbler: the exact annular-sector unwrap of a truncated cone.
 *  s = √(h² + ((D−d)/2)²), R = s·D/(D−d), r = R − s, θ = π·D/R. Overlap is added as extra sweep measured on
 *  the inner radius (so the tab is at least `overlapIn` everywhere). Arc opens downward (smile). */
export function coneSleeve(topDiameterIn: number, bottomDiameterIn: number, heightIn: number, overlapIn = 0.375): Dieline {
  const D = Math.max(topDiameterIn, bottomDiameterIn), d = Math.min(topDiameterIn, bottomDiameterIn);
  if (D - d < 1e-6) {
    const c = cylinderWrap(D, heightIn, overlapIn);
    return { ...c, kind: 'cone-sleeve', label: `Sleeve ${D}″ ⌀ × ${heightIn}″ (straight — cylinder)`, geometry: { ...c.geometry, slantIn: heightIn, outerRadiusIn: Infinity, innerRadiusIn: Infinity, sweepRad: 0 } };
  }
  const s = Math.sqrt(heightIn ** 2 + ((D - d) / 2) ** 2);
  const R = s * D / (D - d), r = R - s, theta = Math.PI * D / R;
  const tab = overlapIn / r, sweep = theta + tab;
  // Sector centred on "down" (+y): angle a measured from +x; down = π/2.
  const a0 = Math.PI / 2 - sweep / 2, a1 = Math.PI / 2 + sweep / 2;
  // Bounding box of the sector with apex at (0,0).
  const pts: Array<[number, number]> = [];
  for (const rad of [r, R]) for (const a of [a0, a1]) pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
  for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, 2 * Math.PI, 2.5 * Math.PI]) if (a > a0 && a < a1) pts.push([R * Math.cos(a), R * Math.sin(a)], [r * Math.cos(a), r * Math.sin(a)]);
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const cx = -minX, cy = -minY, b = LABEL_BLEED;
  const P = (rad: number, a: number): [number, number] => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  // Outer arc runs a0→a1; inner back a1→a0.
  const cut = `M ${pt(...P(R, a0))}${arcC(cx, cy, R, a0, a1)} L ${pt(...P(r, a1))}${arcC(cx, cy, r, a1, a0)} Z`;
  const ab = b / r; // bleed: grow radii by b and sweep by b at the inner radius
  const bleed = `M ${pt(...P(R + b, a0 - ab))}${arcC(cx, cy, R + b, a0 - ab, a1 + ab)} L ${pt(...P(r - b, a1 + ab))}${arcC(cx, cy, r - b, a1 + ab, a0 - ab)} Z`;
  return {
    kind: 'cone-sleeve', label: `Cone sleeve ${D}″ → ${d}″ × ${heightIn}″`, flatIn: [r4(maxX - minX), r4(maxY - minY)],
    cut: [cut], crease: [], bleedPath: bleed, bleedIn: b, spots: [CUT_CONTOUR], guides: [`M ${pt(...P(r, a1 - tab))} L ${pt(...P(R, a1 - tab))}`],
    geometry: { slantIn: r4(s), outerRadiusIn: r4(R), innerRadiusIn: r4(r), sweepRad: r4(theta), sweepDeg: r4(theta * 180 / Math.PI), tabRad: r4(tab) },
    notes: [
      `Unwrap: slant ${r4(s)} in, outer radius ${r4(R)} in, inner radius ${r4(r)} in, sweep ${r4(theta * 180 / Math.PI)}° + ${overlapIn} in glue tab.`,
      `The last ${overlapIn} in of sweep is the glue tab (dotted guide) — keep artwork that must line up away from it.`,
      sweep >= 2 * Math.PI ? 'This taper is so shallow the unwrap overlaps itself — print it as two halves.' : 'Text set straight on the flat will curve on the cup; follow the arc.',
    ],
  };
}

/** Reverse tuck-end carton (top tuck on the back panel, bottom tuck on the front).
 *  L × W is the footprint, D the height. One caliper is added to each panel for the folds (approximation). */
export function tuckEndBox(lengthIn: number, widthIn: number, depthIn: number, materialIn = 0.018): Dieline {
  const L = lengthIn + materialIn, W = widthIn + materialIn, D = depthIn;
  const gw = Math.min(0.625, W * 0.6), taper = Math.min(gw * 0.8, D * 0.15);
  const t = Math.min(0.625, W * 0.5), df = Math.min(W * 0.6, L / 2), inset = Math.min(0.0625, W * 0.05);
  const yT = W + t, yB = yT + D;
  const x0 = gw, x1 = x0 + L, x2 = x1 + W, x3 = x2 + L, x4 = x3 + W;
  const tuck = (a: number, e: number, y: number, dir: -1 | 1): Array<[number, number]> => {
    const yC = y + dir * W, yE = yC + dir * t, c = t * 0.5;
    return [[a, y], [a, yC], [a + c, yE], [e - c, yE], [e, yC], [e, y]];
  };
  const dust = (a: number, e: number, y: number, dir: -1 | 1, flip: boolean): Array<[number, number]> => {
    const yE = y + dir * df;
    const pts: Array<[number, number]> = [[a, y], [a + inset, yE], [e - df * 0.4, yE], [e, y + dir * df * 0.3], [e, y]];
    return flip ? pts.map(([x, yy]) => [a + e - x, yy] as [number, number]).reverse() : pts;
  };
  const outline: Array<[number, number]> = [
    ...tuck(x0, x1, yT, -1), ...dust(x1, x2, yT, -1, false), [x2, yT], [x3, yT], ...dust(x3, x4, yT, -1, true),
    [x4, yB], ...dust(x3, x4, yB, 1, true).reverse(), ...tuck(x2, x3, yB, 1).reverse(), ...dust(x1, x2, yB, 1, false).reverse(),
    [x1, yB], [x0, yB], [0, yB - taper], [0, yT + taper],
  ];
  const dedup = outline.filter((p, i) => i === 0 || Math.abs(p[0] - outline[i - 1][0]) > 1e-9 || Math.abs(p[1] - outline[i - 1][1]) > 1e-9);
  const crease = [
    ...[x0, x1, x2, x3].map(x => line(x, yT, x, yB)),
    line(x0, yT, x1, yT), line(x1, yT, x2, yT), line(x3, yT, x4, yT), line(x0, yT - W, x1, yT - W),
    line(x1, yB, x2, yB), line(x2, yB, x3, yB), line(x3, yB, x4, yB), line(x2, yB + W, x3, yB + W),
  ];
  const fw = x4, fh = yB + W + t, b = 0.125;
  return {
    kind: 'tuck-box', label: `Reverse tuck-end box ${lengthIn}×${widthIn}×${depthIn}″`, flatIn: [r4(fw), r4(fh)],
    cut: [poly(dedup)], crease, bleedPath: rectPath(-b, -b, fw + 2 * b, fh + 2 * b), bleedIn: b, spots: [CUT_CONTOUR, CREASE],
    geometry: { glueFlapIn: r4(gw), tuckIn: r4(t), dustFlapIn: r4(df), panelL: r4(L), panelW: r4(W) },
    notes: ['Panels left→right: glue flap, back, side, front, side. Top tuck on the back, bottom tuck on the front.', 'Flap depths are common rules of thumb; the carton converter adjusts them for their board and die.', 'Bleed shown as a box around the flat; extend art 1/8 in past every cut edge.'],
  };
}

export function stickerCut(shape: 'circle' | 'rounded-rect' | 'rect', wIn: number, hIn: number, cornerIn = 0.125): Dieline {
  const b = LABEL_BLEED;
  const cut = shape === 'circle' ? ellipsePath(wIn / 2, hIn / 2, wIn / 2, hIn / 2)
    : shape === 'rounded-rect' ? roundRectPath(0, 0, wIn, hIn, cornerIn) : rectPath(0, 0, wIn, hIn);
  const bleed = shape === 'circle' ? ellipsePath(wIn / 2, hIn / 2, wIn / 2 + b, hIn / 2 + b)
    : shape === 'rounded-rect' ? roundRectPath(-b, -b, wIn + 2 * b, hIn + 2 * b, cornerIn + b) : rectPath(-b, -b, wIn + 2 * b, hIn + 2 * b);
  return {
    kind: 'sticker', label: `${shape === 'circle' ? (wIn === hIn ? 'Circle' : 'Oval') : shape === 'rounded-rect' ? 'Rounded' : 'Square-cut'} sticker ${wIn}×${hIn}″`,
    flatIn: [r4(wIn), r4(hIn)], cut: [cut], crease: [], bleedPath: bleed, bleedIn: b, spots: [CUT_CONTOUR],
    notes: ['Keep text 1/16 in inside the cut line; the die can drift that far.'],
  };
}

/** Wrap a dieline as a one-surface object job (for preflight and the artboard). */
export function objectWrapJob(dl: Dieline): WrapJob {
  return {
    id: `object:${dl.kind || 'flat'}:${dl.flatIn.join('x')}`, kind: 'object', label: dl.label,
    surfaces: [{ id: 'flat', label: dl.label, w: dl.flatIn[0], h: dl.flatIn[1], zones: [] }],
    bleedIn: dl.bleedIn ?? LABEL_BLEED, material: { name: 'Label stock / sheet', rollWidthIn: 13, overlapIn: 0, laminate: false },
    designScale: 1, notes: dl.notes, dieline: dl,
  };
}

// ── Guide SVG ────────────────────────────────────────────────────────────────

const ZONE_COLOR: Record<ZoneKind, string> = { window: '#38bdf8', 'door-gap': '#f59e0b', handle: '#f97316', 'wheel-well': '#a3a3a3', 'fuel-door': '#ef4444', light: '#facc15', 'body-line': '#a78bfa' };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface GuideLayout { svg: string; widthIn: number; heightIn: number }

/** The guide layer dropped on a Tela board. User units are inches; viewBox starts at the bleed corner. */
export function wrapTemplateLayout(src: WrapJob | Dieline): GuideLayout {
  if ('surfaces' in src && !src.dieline) return vehicleGuide(src);
  const dl = 'surfaces' in src ? src.dieline! : src;
  const b = dl.bleedIn ?? LABEL_BLEED, [w, h] = dl.flatIn, fs = Math.max(0.08, Math.min(w, h) * 0.04);
  const pad = b + fs * 3;
  const body = [
    dl.bleedPath ? `<path d="${dl.bleedPath}" fill="none" stroke="#ef4444" stroke-width="${fs * 0.08}" stroke-dasharray="${fs * 0.5} ${fs * 0.3}"/>` : '',
    ...dl.cut.map(d => `<path d="${d}" fill="none" stroke="${CUT_CONTOUR.previewHex}" stroke-width="${fs * 0.12}" data-spot="CutContour"/>`),
    ...(dl.guides || []).map(d => `<path d="${d}" fill="none" stroke="#9ca3af" stroke-width="${fs * 0.08}" stroke-dasharray="${fs * 0.15} ${fs * 0.25}"/>`),
    ...dl.crease.map(d => `<path d="${d}" fill="none" stroke="${CREASE.previewHex}" stroke-width="${fs * 0.1}" stroke-dasharray="${fs * 0.6} ${fs * 0.3}" data-spot="Crease"/>`),
    `<text x="0" y="${n4(-b - fs * 0.8)}" font-size="${n4(fs)}" fill="#e5e7eb" font-family="sans-serif">${esc(dl.label)} — flat ${r4(w)}×${r4(h)} in · magenta = CutContour${dl.crease.length ? ', blue dashed = Crease' : ''}, red dashed = bleed</text>`,
  ].join('');
  const W = w + 2 * pad, H = h + 2 * pad;
  return { widthIn: r4(W), heightIn: r4(H), svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n4(W)}in" height="${n4(H)}in" viewBox="${n4(-pad)} ${n4(-pad)} ${n4(W)} ${n4(H)}">${body}</svg>` };
}

const GUIDE_GAP_IN = 18;
const guideFont = (job: WrapJob) => Math.max(2, (Math.max(...job.surfaces.map(s => s.w)) + 2 * job.bleedIn) * 0.012);

/**
 * Where each surface (trim top-left) and its panels sit on the stacked guide layout, in real-world
 * inches. The design board is this layout × designScale, so the panel exporter crops exactly here.
 */
export function vehiclePlacements(job: WrapJob): Array<{ surface: WrapSurface; ox: number; oy: number; tile: TileResult }> {
  const fs = guideFont(job), b = job.bleedIn;
  let y = fs * 2;
  return job.surfaces.map(s => {
    const tile = tilePanels(s, job.material, b);
    const ox = b, oy = y + fs * 1.6 + b;
    y = oy + s.h + b + GUIDE_GAP_IN;
    return { surface: s, ox, oy, tile };
  });
}

function vehicleGuide(job: WrapJob): GuideLayout {
  const b = job.bleedIn, gapIn = GUIDE_GAP_IN;
  const maxW = Math.max(...job.surfaces.map(s => s.w)) + 2 * b;
  const fs = guideFont(job);
  let y = fs * 2; const parts: string[] = [];
  for (const { surface: s, tile, ox, oy } of vehiclePlacements(job)) {
    const g: string[] = [];
    g.push(`<text x="0" y="${n4(y + fs)}" font-size="${n4(fs)}" fill="#e5e7eb" font-family="sans-serif">${esc(s.label)} — ${r4(s.w)}×${r4(s.h)} in · ${tile.panels.length} ${tile.orientation} panel${tile.panels.length === 1 ? '' : 's'} · ${tile.linearIn.toFixed(0)} in of ${job.material.rollWidthIn} in roll</text>`);
    g.push(`<g transform="translate(${n4(ox)} ${n4(oy)})">`);
    g.push(`<rect x="${n4(-b)}" y="${n4(-b)}" width="${n4(s.w + 2 * b)}" height="${n4(s.h + 2 * b)}" fill="#1f2937" stroke="#ef4444" stroke-width="${n4(fs * 0.08)}" stroke-dasharray="${n4(fs * 0.6)} ${n4(fs * 0.4)}"/>`);
    g.push(`<rect x="0" y="0" width="${n4(s.w)}" height="${n4(s.h)}" fill="#374151" stroke="#e5e7eb" stroke-width="${n4(fs * 0.1)}"/>`);
    for (const q of s.zones) {
      const c = ZONE_COLOR[q.kind], { x, y: zy, w, h } = q.rect;
      const shape = q.shape === 'arch'
        ? `<path d="M ${pt(x, zy + h)} L ${pt(x, zy + w / 2)} C ${pt(x, zy + w * 0.22)} ${pt(x + w * 0.22, zy)} ${pt(x + w / 2, zy)} C ${pt(x + w * 0.78, zy)} ${pt(x + w, zy + w * 0.22)} ${pt(x + w, zy + w / 2)} L ${pt(x + w, zy + h)} Z"`
        : `<rect x="${n4(x)}" y="${n4(zy)}" width="${n4(w)}" height="${n4(h)}"`;
      g.push(`${shape} fill="${c}" fill-opacity="0.28" stroke="${c}" stroke-width="${n4(fs * 0.06)}"><title>${esc(q.kind + ': ' + q.note)}</title>${q.shape === 'arch' ? '</path>' : '</rect>'}`);
    }
    tile.panels.forEach((p, i) => {
      g.push(`<rect x="${n4(p.rect.x)}" y="${n4(p.rect.y)}" width="${n4(p.rect.w)}" height="${n4(p.rect.h)}" fill="none" stroke="${i % 2 ? '#22d3ee' : '#4ade80'}" stroke-width="${n4(fs * 0.1)}"/>`);
      g.push(`<text x="${n4(p.rect.x + fs * 0.4)}" y="${n4(p.rect.y + p.rect.h - fs * 0.5)}" font-size="${n4(fs * 0.8)}" fill="${i % 2 ? '#22d3ee' : '#4ade80'}" font-family="sans-serif">P${i + 1} ${p.printW.toFixed(1)}×${p.printH.toFixed(1)}</text>`);
    });
    for (const sx of tile.seams) g.push(tile.orientation === 'vertical'
      ? `<line x1="${n4(sx)}" y1="${n4(-b)}" x2="${n4(sx)}" y2="${n4(s.h + b)}" stroke="#f472b6" stroke-width="${n4(fs * 0.08)}"/>`
      : `<line x1="${n4(-b)}" y1="${n4(sx)}" x2="${n4(s.w + b)}" y2="${n4(sx)}" stroke="#f472b6" stroke-width="${n4(fs * 0.08)}"/>`);
    g.push('</g>');
    parts.push(...g);
    y = oy + s.h + b + gapIn;
  }
  const W = maxW, H = y - gapIn + fs;
  return { widthIn: r4(W), heightIn: r4(H), svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n4(W)}in" height="${n4(H)}in" viewBox="0 0 ${n4(W)} ${n4(H)}">${parts.join('')}</svg>` };
}

export const wrapTemplateSvg = (src: WrapJob | Dieline): string => wrapTemplateLayout(src).svg;
