// Parametric sewing patterns: home textiles (pillow covers, throws, duvet covers, fitted sheets),
// bags, plush (a two-panel critter with a base, a ball made of gores) and clothing (tee, hoodie,
// gathered skirt). Every template drafts seam lines from a handful of measurements; the cutting
// line, marker, print tiles, DXF and tech pack are all derived from the same pieces.
// Our own drafts: no commercial pattern or character is copied. Millimetres throughout.

import { type Pt, bez, ccw, clean, offset, mirror, pathLength, bbox, area, rect, ellipse, ellipsePerimeter, contour, sdCircle, sdEllipse, sdCapsule, smin, simplify } from './geometry';

export type FabricRole = 'main' | 'contrast' | 'lining' | 'rib' | 'fur' | 'interfacing';
export type Audience = 'adult' | 'child' | 'under3' | 'infant';
export type SoftKind = 'home' | 'bag' | 'plush' | 'apparel';

export interface Piece {
  id: string; name: string;
  /** Seam line, counter-clockwise. */
  seam: Pt[];
  /** Seam allowance per edge (edge i runs seam[i] → seam[i+1]); a number applies to every edge. */
  allowance: number | number[];
  /** How many to cut. With `pair`, half are cut mirrored (fabric folded right sides together). */
  cut: number; pair?: boolean;
  /** Index of the edge that lies on the fabric fold (cut as one mirrored piece). */
  fold?: number;
  fabric: FabricRole;
  grain: [Pt, Pt];
  /** Notch positions on the seam line. */
  notches?: Pt[];
  marks?: Array<{ at: Pt; label: string; r?: number }>;
  /** Straight-grain stretch direction matters (knits, minky pile direction). */
  note?: string;
}

export interface Notion { item: string; qty: string; note?: string }
export interface SoftFeatures { safetyEyes?: boolean; buttons?: boolean; beads?: boolean; magnets?: boolean; sound?: boolean; drawstring?: boolean; sleepwear?: boolean; weighted?: boolean; longPile?: boolean; cords?: boolean; zip?: boolean; elastic?: boolean }

export interface Pattern {
  template: string; name: string; kind: SoftKind; size?: string;
  pieces: Piece[]; notions: Notion[]; steps: string[]; notes: string[];
  features: SoftFeatures;
  /** Default fabric width for the marker (mm). */
  fabricWidth: number;
  fill?: { grams: number; litres: number };
  /** Finished measurements for the tech pack (label → mm). */
  finished: Array<[string, number]>;
  /** Graded points of measure across sizes (apparel). */
  grading?: { sizes: string[]; rows: Array<{ pom: string; values: number[] }> };
}

export type ParamValue = number | string | boolean;
export interface ParamDef { key: string; label: string; type: 'length' | 'number' | 'select' | 'bool'; default: ParamValue; min?: number; max?: number; step?: number; options?: Array<{ value: string; label: string }>; help?: string }
export interface SoftTemplate { id: string; name: string; kind: SoftKind; blurb: string; params: ParamDef[]; audience: Audience; build: (v: Record<string, ParamValue>) => Pattern }

const num = (v: Record<string, ParamValue>, k: string, d: number) => { const x = Number(v[k]); return Number.isFinite(x) ? x : d; };
const str = (v: Record<string, ParamValue>, k: string, d: string) => (typeof v[k] === 'string' ? v[k] as string : d);
const bool = (v: Record<string, ParamValue>, k: string) => v[k] === true || v[k] === 'true';
const grainV = (b: { x0: number; y0: number; w: number; h: number }): [Pt, Pt] => [[b.x0 + b.w * 0.5, b.y0 + b.h * 0.2], [b.x0 + b.w * 0.5, b.y0 + b.h * 0.8]];
const inch = (x: number) => `${(x / 25.4).toFixed(x / 25.4 < 10 ? 1 : 0)}″`;
export const fmtLen = (mm: number, unit: 'cm' | 'in' = 'cm') => (unit === 'in' ? inch(mm) : `${(mm / 10).toFixed(mm < 1000 ? 1 : 0)} cm`);

/** A rectangle piece with per-side allowances [bottom, right, top, left]. */
function rectPiece(id: string, name: string, w: number, h: number, a: [number, number, number, number], extra: Partial<Piece> = {}): Piece {
  const seam = rect(0, 0, w, h); return { id, name, seam, allowance: a, cut: 1, fabric: 'main', grain: grainV({ x0: 0, y0: 0, w, h }), ...extra };
}

/**
 * Split a wide rectangle into panels that fit the fabric: a full-width centre panel and two equal
 * sides (no seam down the middle of a bed or blanket), or equal panels when wider still.
 */
export function panels(id: string, name: string, W: number, H: number, usable: number, a: number, edge: [number, number, number, number], extra: Partial<Piece> = {}): Piece[] {
  const fitsW = W + edge[1] + edge[3] <= usable, fitsH = H + edge[0] + edge[2] <= usable;
  if (fitsW || fitsH) return [rectPiece(id, name, W, H, edge, { ...extra, ...(!fitsW ? { note: 'Railroaded: the length runs across the fabric width.', grain: [[W * 0.2, H / 2], [W * 0.8, H / 2]] as [Pt, Pt] } : {}) })];
  const centre = usable - 2 * a; const side = (W - centre) / 2;
  if (side + a + Math.max(edge[1], edge[3]) <= usable && side > 0) return [
    rectPiece(`${id}-c`, `${name} (centre)`, centre, H, [edge[0], a, edge[2], a], extra),
    rectPiece(`${id}-s`, `${name} (side)`, side, H, [edge[0], a, edge[2], edge[1]], { ...extra, cut: (extra.cut ?? 1) * 2, pair: true }),
  ];
  const n = Math.ceil(W / (usable - 2 * a - Math.max(edge[1], edge[3]))); const pw = W / n;
  return [rectPiece(`${id}-p`, `${name} (panel, ${n} across)`, pw, H, [edge[0], a, edge[2], a], { ...extra, cut: (extra.cut ?? 1) * n, note: `Join ${n} panels side by side; the outer edges take the ${edge[1]} mm edge allowance.` })];
}

// ── Home textiles ───────────────────────────────────────────────────────────────────────────────

const pillow: SoftTemplate = {
  id: 'pillow-envelope', name: 'Envelope pillow cover', kind: 'home', audience: 'adult', blurb: 'No zip: two overlapping back panels. Throw pillows and cushions.',
  params: [{ key: 'w', label: 'Width', type: 'length', default: 450, min: 200, max: 1000 }, { key: 'h', label: 'Height', type: 'length', default: 450, min: 200, max: 1000 },
    { key: 'overlap', label: 'Back overlap', type: 'length', default: 120, min: 60, max: 250 }, { key: 'a', label: 'Seam allowance', type: 'length', default: 15, min: 6, max: 25 }],
  build: v => {
    const w = num(v, 'w', 450), h = num(v, 'h', 450), ov = num(v, 'overlap', 120), a = num(v, 'a', 15), hem = 25; const bh = h / 2 + ov / 2;
    return { template: 'pillow-envelope', name: `Pillow cover ${Math.round(w / 10)}×${Math.round(h / 10)} cm`, kind: 'home', fabricWidth: 1400, features: {},
      pieces: [rectPiece('front', 'Front', w, h, [a, a, a, a], { notches: [[w / 2, 0], [w / 2, h]] }),
        rectPiece('back', 'Back', w, bh, [a, a, hem, a], { cut: 2, note: 'Double-fold hem on the overlap edge.' })],
      notions: [{ item: 'Pillow insert', qty: '1', note: `${Math.round((w + 25) / 10)}×${Math.round((h + 25) / 10)} cm (2-3 cm larger than the cover for a plump fill)` }, { item: 'Thread', qty: '1 spool', note: 'All-purpose polyester' }],
      steps: ['Hem the overlap edge of both back panels: press 1.25 cm, then 1.25 cm again, stitch.', 'Lay the front right side up. Lay one back on top, right side down, raw edges at the top; the other at the bottom so the hems overlap in the middle.', `Pin and stitch all round at ${a} mm. Clip the corners.`, 'Turn right side out through the opening, push the corners out, press.'],
      notes: [], finished: [['Width', w], ['Height', h], ['Back overlap', ov]] };
  },
};

const throwBlanket: SoftTemplate = {
  id: 'throw', name: 'Throw / blanket', kind: 'home', audience: 'adult', blurb: 'Two layers sewn and turned, or bound. Pieces itself when wider than your fabric.',
  params: [{ key: 'w', label: 'Width', type: 'length', default: 1270, min: 600, max: 2800 }, { key: 'h', label: 'Length', type: 'length', default: 1520, min: 600, max: 2800 },
    { key: 'style', label: 'Finish', type: 'select', default: 'turned', options: [{ value: 'turned', label: 'Sewn and turned' }, { value: 'bound', label: 'Bound edge (quilt binding)' }] },
    { key: 'fw', label: 'Fabric width', type: 'length', default: 1500, min: 900, max: 3000 }, { key: 'weighted', label: 'Weighted (glass beads in channels)', type: 'bool', default: false }],
  build: v => {
    const w = num(v, 'w', 1270), h = num(v, 'h', 1520), fw = num(v, 'fw', 1500), bound = str(v, 'style', 'turned') === 'bound', weighted = bool(v, 'weighted'); const a = bound ? 6 : 12;
    const top = panels('top', 'Top', w, h, fw - 20, a, [a, a, a, a]);
    const back = panels('back', 'Back', w, h, fw - 20, a, [a, a, a, a], { fabric: 'contrast' });
    const pieces = [...top, ...back]; const bindLen = 2 * (w + h) + 300;
    if (bound) pieces.push(rectPiece('binding', `Binding strip (join to ${(bindLen / 1000).toFixed(2)} m)`, Math.min(fw - 40, bindLen), 64, [0, 0, 0, 0], { fabric: 'contrast', cut: Math.ceil(bindLen / (fw - 40)), note: 'Cut 64 mm (2½″) strips, join on the bias, press in half.' }));
    const notions: Notion[] = [{ item: 'Thread', qty: '2 spools' }];
    if (weighted) notions.push({ item: 'Glass micro-beads', qty: `${Math.round(w * h / 1e6 * 2.2 * 10) / 10} kg (about 10% of the user\'s body weight; never for babies or toddlers)`, note: 'In sewn 10-15 cm channel pockets' });
    return { template: 'throw', name: `${weighted ? 'Weighted ' : ''}Throw ${Math.round(w / 10)}×${Math.round(h / 10)} cm`, kind: 'home', fabricWidth: fw, features: { weighted },
      pieces, notions, notes: top.length > 1 ? ['Wider than your fabric: the top is pieced from a centre panel and two sides.'] : [],
      steps: bound ? ['Piece the top and back if needed; press seams open.', 'Layer back (right side down), batting if used, top (right side up); baste or pin.', 'Quilt or tie the layers.', 'Sew the binding to the front, mitring the corners; fold to the back and hand- or machine-stitch.']
        : ['Piece the top and back if needed; press seams open.', `Lay right sides together and stitch round at ${a} mm, leaving 30 cm open on one side.`, 'Clip corners, turn through the gap, press, topstitch 6 mm from the edge to close the gap.', ...(weighted ? ['Stitch vertical channels, fill each row of pockets with weighed beads, stitch across, repeat.'] : [])],
      finished: [['Width', w], ['Length', h]] };
  },
};

const BEDS: Record<string, [number, number, string]> = { twin: [1730, 2180, 'Twin duvet 68×86″'], full: [2290, 2340, 'Full/Queen duvet 90×92″'], king: [2640, 2340, 'King duvet 104×92″'], eu140: [1400, 2000, 'EU single 140×200 cm'], eu200: [2000, 2000, 'EU double 200×200 cm'], crib: [1000, 1350, 'Toddler 100×135 cm'] };
const duvet: SoftTemplate = {
  id: 'duvet', name: 'Duvet cover', kind: 'home', audience: 'adult', blurb: 'Top and back with a button or snap opening and corner ties.',
  params: [{ key: 'bed', label: 'Size', type: 'select', default: 'full', options: Object.entries(BEDS).map(([value, [, , label]]) => ({ value, label })) },
    { key: 'fw', label: 'Fabric width', type: 'length', default: 2740, min: 1100, max: 3000, help: 'Sheeting comes 108″ (274 cm) wide; quilting cotton 44″ (112 cm).' }],
  build: v => {
    const [w, h, label] = BEDS[str(v, 'bed', 'full')] ?? BEDS.full; const fw = num(v, 'fw', 2740), a = 15, hem = 60;
    const pieces = [...panels('top', 'Top', w, h, fw - 20, a, [hem, a, a, a]), ...panels('back', 'Back', w, h, fw - 20, a, [hem, a, a, a], { fabric: 'contrast' }),
      rectPiece('tie', 'Corner tie', 25, 250, [10, 10, 10, 10], { cut: 8, note: 'Fold in half lengthways, stitch, turn.' })];
    const buttons = Math.max(4, Math.floor(w / 220));
    return { template: 'duvet', name: label.replace(/ duvet/, '') + ' duvet cover', size: str(v, 'bed', 'full'), kind: 'home', fabricWidth: fw, features: {}, pieces,
      notions: [{ item: 'Buttons or snap tape', qty: `${buttons} buttons (or ${(w - 400) / 1000} m snap tape)` }, { item: 'Thread', qty: '2 spools' }],
      steps: ['Piece top and back if needed.', 'Hem the bottom edge of top and back: press 1 cm then 5 cm, stitch.', 'Sew ties into the four corners of the back, pointing inwards.', 'Right sides together, stitch both sides and the top; across the bottom stitch 20 cm in from each side, leaving the middle open.', `Work ${buttons} buttonholes in the top hem and sew buttons to the back hem (or apply snap tape).`, 'Turn and press.'],
      notes: [], finished: [['Width', w], ['Length', h]] };
  },
};

const MATTRESS: Record<string, [number, number, string]> = { crib: [710, 1330, 'Crib (28×52″)'], twin: [970, 1910, 'Twin (38×75″)'], full: [1370, 1910, 'Full (54×75″)'], queen: [1520, 2030, 'Queen (60×80″)'], king: [1930, 2030, 'King (76×80″)'], eu90: [900, 2000, 'EU 90×200'], eu160: [1600, 2000, 'EU 160×200'] };
const fittedSheet: SoftTemplate = {
  id: 'fitted-sheet', name: 'Fitted sheet', kind: 'home', audience: 'adult', blurb: 'Boxed corners and an elastic edge, from the mattress size and depth.',
  params: [{ key: 'size', label: 'Mattress', type: 'select', default: 'queen', options: Object.entries(MATTRESS).map(([value, [, , label]]) => ({ value, label })) },
    { key: 'depth', label: 'Mattress depth', type: 'length', default: 300, min: 100, max: 450 }, { key: 'tuck', label: 'Tuck under', type: 'length', default: 150, min: 80, max: 250 },
    { key: 'fw', label: 'Fabric width', type: 'length', default: 2740, min: 1100, max: 3000 }],
  build: v => {
    const key = str(v, 'size', 'queen'); const [mw, ml, label] = MATTRESS[key] ?? MATTRESS.queen; const crib = key === 'crib';
    const depth = num(v, 'depth', crib ? 150 : 300), tuck = crib ? Math.min(num(v, 'tuck', 150), 120) : num(v, 'tuck', 150), fw = num(v, 'fw', 2740); const a = 12, hem = 25;
    const c = depth + tuck, W = mw + 2 * c, L = ml + 2 * c;
    // Seam line with a square notch at each corner; the notch edges get sewn together into a box corner.
    const seam: Pt[] = [[c, 0], [W - c, 0], [W - c, c], [W, c], [W, L - c], [W - c, L - c], [W - c, L], [c, L], [c, L - c], [0, L - c], [0, c], [c, c]];
    const al = seam.map((p, i) => { const q = seam[(i + 1) % seam.length]; return (p[0] === q[0] && (p[0] === 0 || p[0] === W)) || (p[1] === q[1] && (p[1] === 0 || p[1] === L)) ? hem : a; });
    const piece: Piece = { id: 'sheet', name: 'Sheet', seam, allowance: al, cut: 1, fabric: 'main', grain: [[W / 2, L * 0.3], [W / 2, L * 0.7]] };
    const pieces: Piece[] = W + 2 * hem <= fw - 20 || L + 2 * hem <= fw - 20 ? [piece] : [{ ...piece, note: `${Math.round(W / 10)} cm wide: use 108″ (274 cm) sheeting, or piece the centre with flat-felled seams.` }];
    const edge = 2 * (W - 2 * c) + 2 * (L - 2 * c) + 8 * tuck; const elastic = Math.round(edge * 0.65 / 10) * 10;
    return { template: 'fitted-sheet', name: `${label} fitted sheet`, size: key, kind: 'home', fabricWidth: fw, features: { elastic: true }, pieces,
      notions: [{ item: '10 mm elastic', qty: `${(elastic / 1000).toFixed(2)} m`, note: 'Stretched evenly into the hem casing all round' }, { item: 'Thread', qty: '2 spools' }],
      steps: ['At each corner bring the two notch edges together, right sides in, and stitch (or serge) to make a box corner.', 'Press 6 mm then 19 mm along the whole edge to form a casing; stitch, leaving 5 cm open.', `Thread ${(elastic / 1000).toFixed(2)} m of elastic through, overlap the ends 2 cm and stitch, close the gap.`, ...(crib ? ['Test on the actual crib mattress: the sheet must fit tightly with no slack, and must not pull up at the corners.'] : [])],
      notes: crib ? ['Crib sheet: must fit the mattress tightly. A loose sheet can entrap or cover a baby\'s face.'] : [], finished: [['Mattress width', mw], ['Mattress length', ml], ['Depth', depth], ['Tuck', tuck]] };
  },
};

const tote: SoftTemplate = {
  id: 'tote', name: 'Tote bag', kind: 'bag', audience: 'adult', blurb: 'Boxed bottom, two handles, optional lining.',
  params: [{ key: 'w', label: 'Width', type: 'length', default: 380, min: 200, max: 600 }, { key: 'h', label: 'Height', type: 'length', default: 400, min: 200, max: 600 },
    { key: 'g', label: 'Gusset depth', type: 'length', default: 100, min: 0, max: 200 }, { key: 'handle', label: 'Handle length', type: 'length', default: 600, min: 300, max: 1200 }, { key: 'lined', label: 'Lined', type: 'bool', default: true }],
  build: v => {
    const w = num(v, 'w', 380), h = num(v, 'h', 400), g = num(v, 'g', 100), hl = num(v, 'handle', 600), lined = bool(v, 'lined'); const a = 10, c = g / 2;
    const seam: Pt[] = g > 0 ? [[c, 0], [w + c, 0], [w + c, c], [w + 2 * c, c], [w + 2 * c, h + c], [0, h + c], [0, c], [c, c]] : rect(0, 0, w, h);
    const body: Piece = { id: 'body', name: 'Body', seam, allowance: seam.map((_, i) => (seam[i][1] === h + c && seam[(i + 1) % seam.length][1] === h + c ? 30 : a)), cut: 2, fabric: 'main', grain: [[w / 2 + c, h * 0.3], [w / 2 + c, h * 0.8]] };
    const pieces: Piece[] = [body, rectPiece('handle', 'Handle', 30 * 4, hl, [a, 0, a, 0], { cut: 2, note: 'Fold edges to the centre, fold again: 30 mm wide strap.' })];
    if (lined) pieces.push({ ...body, id: 'lining', name: 'Lining', fabric: 'lining', allowance: a });
    return { template: 'tote', name: `Tote ${Math.round(w / 10)}×${Math.round(h / 10)} cm`, kind: 'bag', fabricWidth: 1120, features: {}, pieces,
      notions: [{ item: 'Thread', qty: '1 spool (heavy-duty)' }, ...(lined ? [] : [{ item: 'Bias binding or serger', qty: 'for the inside seams' }])],
      steps: ['Make the handles: press, fold, edge-stitch both sides.', 'Body pieces right sides together: stitch sides and bottom, leaving the corner notches open.', 'Box the corners: flatten each notch so the side seam meets the bottom seam, stitch across.', lined ? 'Repeat for the lining, leaving 12 cm open in the bottom; put the bag inside the lining right sides together with handles sandwiched, stitch round the top, turn through the gap.' : 'Fold the top 1 cm then 2 cm, stitch, with the handles caught in and stitched in a box-X.', 'Topstitch round the top edge. Box-X the handles: they carry the load.'],
      notes: [], finished: [['Width', w], ['Height', h], ['Gusset', g], ['Handle', hl]] };
  },
};

// ── Plush ───────────────────────────────────────────────────────────────────────────────────────

const plushPal: SoftTemplate = {
  id: 'plush-pal', name: 'Plush critter (two-panel + base)', kind: 'plush', audience: 'child', blurb: 'Our original round critter: head, body, ears, arms, feet and a sit-flat base. Change the shape, it redrafts.',
  params: [{ key: 'height', label: 'Height', type: 'length', default: 300, min: 120, max: 800 }, { key: 'head', label: 'Head size', type: 'number', default: 0.55, min: 0.35, max: 0.75, step: 0.01 },
    { key: 'ears', label: 'Ears', type: 'select', default: 'round', options: [{ value: 'round', label: 'Round' }, { value: 'pointed', label: 'Pointed' }, { value: 'long', label: 'Long (bunny)' }, { value: 'none', label: 'None' }] },
    { key: 'arms', label: 'Arms', type: 'bool', default: true }, { key: 'feet', label: 'Feet', type: 'bool', default: true }, { key: 'base', label: 'Sit-flat base', type: 'bool', default: true },
    { key: 'face', label: 'Eyes', type: 'select', default: 'embroidered', options: [{ value: 'embroidered', label: 'Embroidered (safest; required under 3)' }, { value: 'safety-eyes', label: 'Plastic safety eyes (3+ only)' }, { value: 'felt', label: 'Felt, stitched all round' }] },
    { key: 'pellets', label: 'Pellet pouch for weight', type: 'bool', default: false }, { key: 'sound', label: 'Squeaker or sound box', type: 'bool', default: false },
    { key: 'a', label: 'Seam allowance', type: 'length', default: 6, min: 4, max: 12 }],
  build: v => {
    const H = num(v, 'height', 300), hr = num(v, 'head', 0.55), ears = str(v, 'ears', 'round'), arms = v.arms !== false, feet = v.feet !== false, base = v.base !== false, face = str(v, 'face', 'embroidered'), a = num(v, 'a', 6);
    // Proportions as fractions of the height: head on top, pear body below.
    const rh = H * hr / 2, hc: Pt = [0, H - rh - (ears === 'none' ? 0 : ears === 'long' ? H * 0.28 : H * 0.07)];
    const bw = rh * 0.95, bh = (hc[1] - rh * 0.35) / 2, bc: Pt = [0, bh]; const k = H * 0.06;
    const sdf = (x: number, y: number) => {
      let d = smin(sdCircle(x, y, hc[0], hc[1], rh), sdEllipse(x, y, bc[0], bc[1], bw, bh), k);
      if (arms) for (const s of [-1, 1]) d = smin(d, sdCapsule(x, y, [s * bw * 0.6, bc[1] + bh * 0.55], [s * (bw + rh * 0.45), bc[1] + bh * 0.05], rh * 0.2), k * 0.5);
      if (feet) for (const s of [-1, 1]) d = smin(d, sdEllipse(x, y, s * bw * 0.48, rh * 0.18, rh * 0.32, rh * 0.22), k * 0.5);
      if (ears === 'round') for (const s of [-1, 1]) d = smin(d, sdCircle(x, y, s * rh * 0.72, hc[1] + rh * 0.78, rh * 0.3), k * 0.4);
      if (ears === 'pointed') for (const s of [-1, 1]) { const tip: Pt = [s * rh * 0.8, hc[1] + rh * 1.25]; d = smin(d, sdCapsule(x, y, [s * rh * 0.5, hc[1] + rh * 0.55], tip, rh * 0.12) - 0.08 * Math.max(0, hc[1] + rh * 1.2 - y) * 0.6, k * 0.4); }
      if (ears === 'long') for (const s of [-1, 1]) d = smin(d, sdEllipse(x, y, s * rh * 0.42, hc[1] + rh + H * 0.14, rh * 0.22, H * 0.17), k * 0.4);
      // Flat bottom for the base gusset.
      const yb = rh * (feet ? 0.12 : 0.05) + bh * 0.08; if (base) d = Math.max(d, yb - y);
      return d;
    };
    const ext = Math.max(bw + rh, rh * 1.4) + 10; const raw = contour(sdf, -ext, -10, ext, H + 10, Math.max(0.8, H / 300));
    // Scale so the finished outline is exactly the asked height, base edge on y = 0.
    const rb = bbox(raw); const sc = H / rb.h; const T = ([x, y]: Pt): Pt => [x * sc, (y - rb.y0) * sc];
    const seam = simplify(raw.map(T), Math.max(0.15, H / 1500));
    const bb = bbox(seam);
    // The straight base edge: the two lowest points of the ring.
    const pieces: Piece[] = [];
    const [, eyeY] = T([0, hc[1] + rh * 0.08]); const eyeX = rh * 0.38 * sc, eyeR = Math.max(4, Math.round(rh * 0.09 * sc));
    const faceMarks = face === 'embroidered' ? [{ at: [-eyeX, eyeY] as Pt, label: 'eye: satin stitch', r: eyeR }, { at: [eyeX, eyeY] as Pt, label: 'eye', r: eyeR }, { at: [0, eyeY - rh * 0.28 * sc] as Pt, label: 'nose/mouth: stitch', r: 3 }]
      : face === 'safety-eyes' ? [{ at: [-eyeX, eyeY] as Pt, label: `${eyeR * 2} mm safety eye`, r: eyeR }, { at: [eyeX, eyeY] as Pt, label: 'safety eye', r: eyeR }] : [{ at: [-eyeX, eyeY] as Pt, label: 'felt eye: whip-stitch all round', r: eyeR }, { at: [eyeX, eyeY] as Pt, label: 'felt eye', r: eyeR }];
    const notchesFrom = (ring: Pt[]) => [0.15, 0.35, 0.5, 0.65, 0.85].map(f => ring[Math.floor(f * ring.length)]);
    pieces.push({ id: 'front', name: 'Front', seam, allowance: a, cut: 1, fabric: 'fur', grain: [[0, bb.y0 + bb.h * 0.25], [0, bb.y0 + bb.h * 0.7]], notches: notchesFrom(seam), marks: faceMarks, note: 'Pile runs down (arrow): brush the fur, cut from the back of the fabric, snip only the backing.' });
    // The back is the mirror image (same outline, cut reversed) with a stuffing gap marked.
    const back = ccw(mirror(seam, [0, 0], [0, 1]));
    const gy = T(bc)[1]; const gapAt = seam.reduce((best, p) => (p[0] > 0 && Math.abs(p[1] - gy) < Math.abs(best[1] - gy) ? p : best), [bb.x1, bb.y1] as Pt);
    pieces.push({ id: 'back', name: 'Back', seam: back, allowance: a, cut: 1, fabric: 'fur', grain: [[0, bb.y0 + bb.h * 0.25], [0, bb.y0 + bb.h * 0.7]], notches: notchesFrom(seam).map(([x, y]) => [-x, y] as Pt), marks: [{ at: [-gapAt[0], gapAt[1]], label: `leave ${Math.round(Math.max(50, H * 0.2))} mm open to stuff`, r: 3 }] });
    let litres = 0, baseLen = 0;
    if (base) {
      // The bottom edge is the longest nearly-horizontal run at the lowest y.
      const ys = Math.min(...seam.map(p => p[1])); const bottom = seam.filter(p => p[1] < ys + 0.6); const bx = bbox(bottom); baseLen = bx.w;
      // Oval base: its perimeter matches the front and back bottom edges together; depth 60% of width.
      let A = baseLen / 2; for (let it = 0; it < 40; it++) A *= (2 * baseLen) / ellipsePerimeter(A, A * 0.6);
      const oval = ccw(ellipse(0, 0, A, A * 0.6, 64));
      pieces.push({ id: 'base', name: 'Base', seam: oval, allowance: a, cut: 1, fabric: 'contrast', grain: [[0, -A * 0.4], [0, A * 0.4]], notches: [[A, 0], [-A, 0], [0, A * 0.6], [0, -A * 0.6]], note: 'Match the side notches to the front/back side seams.' });
    }
    if (ears !== 'none') pieces.push({ id: 'ear-inner', name: 'Inner ear (optional contrast appliqué)', seam: ccw(ellipse(0, 0, rh * (ears === 'long' ? 0.14 : 0.2), ears === 'long' ? H * 0.12 : rh * 0.2, 32)), allowance: 0, cut: 2, fabric: 'contrast', grain: [[0, -5], [0, 5]], note: 'No allowance: appliqué onto the front ears before assembly, stitched all round.' });
    // Volume: the silhouette area times an effective thickness of ~55% of the body width.
    const A2 = Math.abs(area(seam)) / 1e6; litres = A2 * (bw * sc * 2 * 0.55 / 1000) * 1000 * 0.7; const grams = Math.round(litres * 45);
    const pellets = bool(v, 'pellets'), sound = bool(v, 'sound');
    const notions: Notion[] = [{ item: 'Polyester fibre fill (toy-safe, new material)', qty: `about ${grams} g`, note: 'Stuff firmly in small tufts; the label must say new material if you sell it' }, { item: 'Thread', qty: '1 spool, strong polyester' }];
    if (face === 'safety-eyes') notions.push({ item: 'Plastic safety eyes with locking washers', qty: '2', note: `${eyeR * 2} mm; washers pressed fully home before stuffing` });
    if (face === 'embroidered') notions.push({ item: 'Embroidery floss', qty: '1 skein each colour' });
    if (pellets) notions.push({ item: 'Plastic pellets in a sewn inner pouch', qty: `${Math.round(grams * 0.4)} g`, note: 'Double-stitched pouch, never loose pellets' });
    if (sound) notions.push({ item: 'Squeaker / sound module', qty: '1', note: 'Enclosed in a sewn pocket; any battery in a screw-secured compartment' });
    return { template: 'plush-pal', name: `Plush critter ${Math.round(H / 10)} cm`, kind: 'plush', fabricWidth: 1500, features: { safetyEyes: face === 'safety-eyes', beads: pellets, sound, longPile: true }, pieces,
      fill: { grams, litres: Math.round(litres * 10) / 10 }, notions,
      steps: [face === 'embroidered' ? 'Embroider the face on the front BEFORE sewing: satin-stitch eyes, backstitch mouth, knot securely on the back.' : face === 'safety-eyes' ? 'Fit the safety eyes on the front before sewing: punch a small hole, push the shank through, press the washer fully home (it must not pull off).' : 'Whip-stitch the felt eyes all round, tight stitches 2 mm apart.',
        ears !== 'none' ? 'Appliqué the inner ears onto the front ears.' : '', `Front and back right sides together; stitch round at ${a} mm with a short stitch (2 mm), leaving the base open${base ? '' : ' and the marked gap'}.`,
        base ? 'Pin the base in, matching notches; stitch all round, leaving the marked gap on the back.' : '', 'Clip curves and into the corners (not through the stitching). Turn right side out; use a blunt tool to push out ears and arms.',
        pellets ? 'Fill the pellet pouch, double-stitch it closed, and place it in the base.' : '', 'Stuff firmly in small tufts: extremities first, then head, then body.', 'Close the gap with a ladder stitch; bury the thread end inside.', 'Pull test: tug every eye, ear and seam hard. Nothing should move or open.'].filter(Boolean),
      notes: ['Fur (minky, faux fur): cut single layer from the back with a craft knife so the pile is not cut; keep the pile direction the same on every piece.'],
      finished: [['Height', H], ['Width', bb.w], ...(base ? [['Base seam length (front+back)', 2 * baseLen] as [string, number]] : [])] };
  },
};

const plushBall: SoftTemplate = {
  id: 'plush-ball', name: 'Plush ball (gores)', kind: 'plush', audience: 'child', blurb: 'A sphere from 6-12 identical panels: balls, round critters, ornaments.',
  params: [{ key: 'd', label: 'Diameter', type: 'length', default: 200, min: 60, max: 600 }, { key: 'n', label: 'Panels', type: 'number', default: 6, min: 4, max: 16, step: 1 }, { key: 'a', label: 'Seam allowance', type: 'length', default: 6, min: 4, max: 12 }],
  build: v => {
    const D = num(v, 'd', 200), N = Math.max(4, Math.round(num(v, 'n', 6))), a = num(v, 'a', 6); const R = D / 2, L = Math.PI * R; const steps = 24;
    // Gore half-width at arc length s from the equator: (πD/N)/2 · cos(s/R).
    const right: Pt[] = []; for (let i = 0; i <= steps; i++) { const s = -L / 2 + L * i / steps; right.push([Math.PI * D / N / 2 * Math.cos(s / R), s]); }
    const seam = ccw(clean([...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as Pt)]));
    const litres = 4 / 3 * Math.PI * (R / 100) ** 3 * 1; const grams = Math.round(litres * 45);
    return { template: 'plush-ball', name: `Plush ball ${Math.round(D / 10)} cm, ${N} panels`, kind: 'plush', fabricWidth: 1500, features: {}, fill: { grams, litres: Math.round(litres * 10) / 10 },
      pieces: [{ id: 'gore', name: 'Panel', seam, allowance: a, cut: N, fabric: 'main', grain: [[0, -L * 0.3], [0, L * 0.3]], notches: [[right[steps / 2][0], 0], [-right[steps / 2][0], 0]] }],
      notions: [{ item: 'Polyester fibre fill', qty: `about ${grams} g` }, { item: 'Thread', qty: '1 spool' }],
      steps: ['Sew the panels together in pairs along one long edge, then the pairs together, matching the centre notches.', 'Leave 5 cm open on the last seam; stitch over the poles twice where all panels meet.', 'Turn, stuff firmly, ladder-stitch closed.'],
      notes: ['More panels make a rounder ball; 6 is easiest.'], finished: [['Diameter', D], ['Panel length', L]] };
  },
};

// ── Clothing ────────────────────────────────────────────────────────────────────────────────────

/** Body measurements (cm): chest, HPS length, shoulder width, neck width, short sleeve, long sleeve, head height for a hood. Our own size chart. */
export const SIZE_CHART: Record<string, [number, number, number, number, number, number, number]> = {
  '2T': [54, 37, 25, 13, 11, 30, 26], '4': [58, 42, 27, 13.5, 12, 35, 27], '6': [64, 46, 29, 14, 13, 40, 28], '8': [70, 50, 31, 14.5, 14, 45, 29], '10': [74, 54, 33, 15, 15, 49, 30], '12': [78, 58, 35, 15.5, 16, 53, 31], '14': [82, 62, 37, 16, 17, 56, 32],
  XS: [86, 66, 42, 17, 19, 58, 33], S: [92, 69, 44, 17.5, 20, 60, 34], M: [100, 72, 46, 18, 21, 62, 35], L: [108, 75, 48, 18.5, 22, 63, 36], XL: [116, 78, 50, 19, 23, 64, 36.5], '2XL': [124, 80, 52, 19.5, 24, 65, 37], '3XL': [132, 82, 54, 20, 25, 66, 37.5],
};
export const CHILD_SIZES = ['2T', '4', '6', '8', '10', '12', '14'];
const EASE: Record<string, number> = { fitted: 50, regular: 100, oversized: 220 };

interface Bodice { front: Pt[]; back: Pt[]; armF: number; armB: number; neckF: number; neckB: number; W: number; L: number; AD: number; hemW: number }
function bodice(size: string, fit: string, lengthAdd = 0): Bodice {
  const [chest, len, shoulder, neck] = SIZE_CHART[size] ?? SIZE_CHART.M; const C = chest * 10 + (EASE[fit] ?? 100); const L = len * 10 + lengthAdd;
  const W = C / 4, AD = C * 0.21 + (fit === 'oversized' ? 30 : 0), SW = shoulder * 10 / 2 + (fit === 'oversized' ? 40 : 0), NW = neck * 10 / 2, drop = Math.max(25, SW * 0.17);
  const FND = 60 + neck * 1.6, BND = 18; const yU = L - AD, sh: Pt = [SW, L - drop], np: Pt = [NW, L];
  const make = (nd: number) => {
    const arm = bez([W, yU], [W - (W - SW) * 0.55, yU], [SW - 2, yU + AD * 0.45], sh, 20);
    const neckCurve = bez(np, [NW, L - nd * 0.65], [NW * 0.55, L - nd], [0, L - nd], 16);
    const ring: Pt[] = [[0, 0], [W, 0], [W, yU], ...arm, np, ...neckCurve];
    return { ring: clean(ring), arm: pathLength([[W, yU], ...arm]), neck: pathLength([np, ...neckCurve]) };
  };
  const f = make(FND), b = make(BND);
  return { front: f.ring, back: b.ring, armF: f.arm, armB: b.arm, neckF: f.neck, neckB: b.neck, W, L, AD, hemW: W };
}
/** Bodice allowances: fold on the centre-front edge (last), hem on the first edge. */
const bodiceAllowance = (ring: Pt[], a: number, hem: number) => ring.map((_, i) => (i === 0 ? hem : i === ring.length - 1 ? 0 : a));

/** Sleeve whose cap matches the armhole (front + back) plus a little ease. */
function sleeve(b: Bodice, length: number, cuffW?: number): { seam: Pt[]; cap: number } {
  const target = b.armF + b.armB + 8; const CH = b.AD * 0.5; let B = target / 2.2;
  const build = (B: number) => { const top: Pt = [0, length]; const uL: Pt = [-B, length - CH], uR: Pt = [B, length - CH];
    const capR = bez(top, [B * 0.45, length], [B * 0.62, length - CH * 0.85], uR, 18), capL = bez(uL, [-B * 0.62, length - CH * 0.85], [-B * 0.45, length], top, 18);
    const hw = cuffW ?? B * 0.85;
    // Up the right side, over the cap (right half reversed, then the left half reversed), down the left.
    const ring: Pt[] = [[-hw, 0], [hw, 0], ...[...capR].reverse(), top, ...[...capL].reverse().slice(1), uL];
    return { ring: clean(ring), cap: pathLength([top, ...capR]) + pathLength([uL, ...capL]) };
  };
  for (let it = 0; it < 30; it++) { const { cap } = build(B); B *= target / cap; }
  const r = build(B); return { seam: ccw(r.ring), cap: r.cap };
}

const garment = (hood: boolean): SoftTemplate => ({
  id: hood ? 'hoodie' : 'tee', name: hood ? 'Hoodie' : 'T-shirt', kind: 'apparel', audience: 'adult', blurb: hood ? 'Pullover hoodie: hood, kangaroo pocket, rib cuffs and waistband. Knit fabric.' : 'Crew-neck tee with a rib neckband. Knit fabric.',
  params: [{ key: 'size', label: 'Size', type: 'select', default: 'M', options: Object.keys(SIZE_CHART).map(s => ({ value: s, label: CHILD_SIZES.includes(s) ? `Kids ${s}` : s })) },
    { key: 'fit', label: 'Fit', type: 'select', default: hood ? 'regular' : 'regular', options: [{ value: 'fitted', label: 'Fitted' }, { value: 'regular', label: 'Regular' }, { value: 'oversized', label: 'Oversized' }] },
    { key: 'sleeve', label: 'Sleeves', type: 'select', default: hood ? 'long' : 'short', options: [{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }] },
    { key: 'length', label: 'Length adjustment', type: 'length', default: 0, min: -100, max: 150 },
    ...(hood ? [{ key: 'drawstring', label: 'Hood drawstring', type: 'bool' as const, default: false, help: 'Not allowed at the hood or neck of children\'s outerwear (sizes 2T-12).' }] : []),
    { key: 'sleepwear', label: 'Sold or marketed as sleepwear', type: 'bool', default: false }],
  build: v => {
    const size = str(v, 'size', 'M'), fit = str(v, 'fit', 'regular'), long = str(v, 'sleeve', hood ? 'long' : 'short') === 'long'; const a = 10, hem = hood ? 10 : 25; const child = CHILD_SIZES.includes(size);
    const b = bodice(size, fit, num(v, 'length', 0) - (hood ? 60 : 0)); const [, , , , ss, ls, headH] = SIZE_CHART[size] ?? SIZE_CHART.M;
    const sl = sleeve(b, (long ? ls * 10 - (hood ? 60 : 0) : ss * 10), long ? (SIZE_CHART[size][0] * 10 * 0.055) : undefined);
    const gr = (r: Pt[]): [Pt, Pt] => { const bb = bbox(r); return [[bb.w * 0.5, bb.h * 0.25], [bb.w * 0.5, bb.h * 0.7]]; };
    const pieces: Piece[] = [
      { id: 'front', name: 'Front', seam: ccw(b.front), allowance: bodiceAllowance(ccw(b.front), a, hem), fold: b.front.length - 1, cut: 1, fabric: 'main', grain: gr(b.front), notches: [[b.W, b.L - b.AD]] },
      { id: 'back', name: 'Back', seam: ccw(b.back), allowance: bodiceAllowance(ccw(b.back), a, hem), fold: b.back.length - 1, cut: 1, fabric: 'main', grain: gr(b.back), notches: [[b.W, b.L - b.AD], [b.W, b.L - b.AD - 10]] },
      { id: 'sleeve', name: 'Sleeve', seam: sl.seam, allowance: sl.seam.map((p, i) => (p[1] === 0 && sl.seam[(i + 1) % sl.seam.length][1] === 0 ? (long && hood ? a : hem) : a)), cut: 2, pair: true, fabric: 'main', grain: (() => { const bb = bbox(sl.seam); return [[0, bb.h * 0.2], [0, bb.h * 0.7]] as [Pt, Pt]; })() },
    ];
    const neckline = 2 * (b.neckF + b.neckB);
    const notions: Notion[] = [{ item: 'Thread', qty: '2-3 cones (serger) or 2 spools' }, { item: 'Ballpoint / stretch needle', qty: '1' }];
    let drawstring = false;
    if (!hood) pieces.push(rectPiece('neckband', 'Neckband (rib)', Math.round(neckline * 0.85), 40, [a, a, a, a], { fabric: 'rib', note: 'Stretch runs along the length. Fold in half lengthways.' }));
    else {
      const half = b.neckF + b.neckB; const HH = headH * 10 + 20; const depth = HH * 0.72;
      const hoodRing = ccw(clean([[0, 0], ...bez([0, 0], [half * 0.4, -12], [half * 0.75, -8], [half, 0], 12), ...bez([half, 0], [depth + 30, HH * 0.3], [depth + 10, HH * 0.85], [depth * 0.55, HH], 16), [0, HH]]));
      drawstring = bool(v, 'drawstring');
      pieces.push({ id: 'hood', name: 'Hood', seam: hoodRing, allowance: hoodRing.map((p, i) => { const q = hoodRing[(i + 1) % hoodRing.length]; return p[0] === 0 && q[0] === 0 ? 30 : a; }), cut: 2, pair: true, fabric: 'main', grain: [[depth * 0.3, HH * 0.2], [depth * 0.3, HH * 0.75]], note: drawstring ? 'Front edge folds back 2.5 cm as the drawstring casing; work two eyelets.' : 'Front edge folds back 2.5 cm and is topstitched.' });
      const hemC = 4 * b.hemW; const cuffC = SIZE_CHART[size][0] * 10 * 0.2;
      pieces.push(rectPiece('pocket', 'Kangaroo pocket', b.W * 1.1, b.L * 0.28, [a, a, a, a], { note: 'Hem the slanted hand openings (cut the top corners off at 45° on the seam line).', fold: 3 }),
        rectPiece('waistband', 'Waistband (rib)', Math.round(hemC * 0.82), 160, [a, a, a, a], { fabric: 'rib' }), rectPiece('cuff', 'Cuff (rib)', Math.round(cuffC), 160, [a, a, a, a], { fabric: 'rib', cut: 2 }));
      if (drawstring) notions.push({ item: 'Drawstring cord + 2 eyelets', qty: `${((half * 2 + 300) / 1000).toFixed(2)} m`, note: 'Adult sizes only; bartack at the centre back so it cannot pull out' });
    }
    const sleepwear = bool(v, 'sleepwear');
    const sizes = Object.keys(SIZE_CHART).filter(s => CHILD_SIZES.includes(s) === child);
    return { template: hood ? 'hoodie' : 'tee', name: `${hood ? 'Hoodie' : 'T-shirt'} size ${size}`, size, kind: 'apparel', fabricWidth: 1500, features: { drawstring, sleepwear }, pieces, notions,
      steps: [`Stitch shoulders right sides together (serger, or narrow zigzag at ${a} mm); stabilise with clear elastic.`, hood ? 'Sew the hood centre seam; fold and stitch the front edge casing; baste the hood to the neckline, centre back matched.' : 'Join the neckband into a ring, fold, quarter-mark it and the neckline; stretch the band to fit and stitch.',
        'Set the sleeves flat: match the cap centre to the shoulder seam and the notches.', 'Sew underarm and side seams in one pass.', hood ? 'Hem the pocket openings, topstitch the pocket to the front; attach cuffs and waistband as rings, stretched to fit.' : 'Hem sleeves and body with a twin needle or coverstitch.', 'Press with a cool iron.'],
      notes: [child ? 'Children\'s sizes: no drawstrings at the hood or neck; keep any trims sewn on securely.' : ''].filter(Boolean),
      finished: [['Chest (finished)', SIZE_CHART[size][0] * 10 + (EASE[fit] ?? 100)], ['Length (HPS)', b.L], ['Sleeve', long ? ls * 10 : ss * 10]],
      grading: { sizes, rows: [['Chest (finished)', 0], ['Length (HPS)', 1], ['Shoulder', 2], ['Neck width', 3], [long ? 'Sleeve (long)' : 'Sleeve (short)', long ? 5 : 4]].map(([pom, i]) => ({ pom: pom as string, values: sizes.map(s => SIZE_CHART[s][i as number] * 10 + (i === 0 ? (EASE[fit] ?? 100) : 0)) })) } };
  },
});

const skirt: SoftTemplate = {
  id: 'skirt', name: 'Gathered elastic-waist skirt', kind: 'apparel', audience: 'adult', blurb: 'Two rectangles, an elastic casing. Any size, from waist, hip and length.',
  params: [{ key: 'waist', label: 'Waist', type: 'length', default: 760, min: 400, max: 1500 }, { key: 'hip', label: 'Hip', type: 'length', default: 1000, min: 500, max: 1700 }, { key: 'len', label: 'Length', type: 'length', default: 600, min: 250, max: 1100 },
    { key: 'full', label: 'Fullness', type: 'number', default: 1.6, min: 1.2, max: 2.5, step: 0.1 }],
  build: v => {
    const waist = num(v, 'waist', 760), hip = num(v, 'hip', 1000), len = num(v, 'len', 600), full = num(v, 'full', 1.6); const a = 12; const half = Math.max(hip + 80, waist * full) / 2;
    return { template: 'skirt', name: `Gathered skirt ${Math.round(len / 10)} cm`, kind: 'apparel', fabricWidth: 1400, features: { elastic: true },
      pieces: [rectPiece('panel', 'Front / back panel', half / 2, len, [30, a, 40, 0], { fold: 3, cut: 2, note: 'Cut 2 on the fold: front and back.' })],
      notions: [{ item: '25 mm elastic', qty: `${((waist - 50) / 1000).toFixed(2)} m` }, { item: 'Thread', qty: '1 spool' }],
      steps: ['Sew the side seams; finish the edges.', 'Fold the top 1 cm then 3 cm for the casing; stitch, leaving 5 cm open.', `Thread ${((waist - 50) / 1000).toFixed(2)} m of elastic through; overlap 2 cm and stitch; close the gap.`, 'Hem: press 1 cm then 2 cm, stitch.'],
      notes: [], finished: [['Waist (relaxed)', half * 2], ['Elastic', waist - 50], ['Length', len]] };
  },
};

export const SOFT_TEMPLATES: SoftTemplate[] = [plushPal, plushBall, pillow, throwBlanket, duvet, fittedSheet, tote, garment(false), garment(true), skirt];
export const softTemplateById = (id: string) => SOFT_TEMPLATES.find(t => t.id === id);
export const softDefaults = (t: SoftTemplate) => Object.fromEntries(t.params.map(p => [p.key, p.default])) as Record<string, ParamValue>;

/** The cutting line for a piece (seam line + allowance). */
export function cutLine(p: Piece) {
  if (p.fold == null) return offset(p.seam, p.allowance);
  const al = typeof p.allowance === 'number' ? p.seam.map(() => p.allowance as number) : [...p.allowance]; al[p.fold] = 0; return offset(p.seam, al);
}

/** Full flat piece for single-layer cutting: a fold piece unfolded across its fold edge. */
export function unfold(p: Piece): Piece {
  if (p.fold == null) return p; const n = p.seam.length; const A = p.seam[p.fold], B = p.seam[(p.fold + 1) % n];
  const al = typeof p.allowance === 'number' ? p.seam.map(() => p.allowance as number) : p.allowance;
  // The chain runs B → … → A round the half (every edge but the fold); its mirror image, walked
  // backwards, runs A → … → B. Mirroring flips orientation and walking backwards flips it again,
  // so the whole ring stays counter-clockwise, and mirrored edge j is chain edge n-2-j.
  const chain: Pt[] = [], chainAl: number[] = [];
  for (let k = 0; k < n; k++) { const i = (p.fold + 1 + k) % n; chain.push(p.seam[i]); if (k < n - 1) chainAl.push(al[i]); }
  const mir = mirror(chain, A, B).reverse();
  return { ...p, fold: undefined, seam: [...chain, ...mir.slice(1, -1)], allowance: [...chainAl, ...[...chainAl].reverse()], notches: [...(p.notches ?? []), ...mirror(p.notches ?? [], A, B)] };
}

export interface CutInstance { piece: Piece; copy: number; mirrored: boolean; outline: Pt[] }
/** Every shape that will be cut, one per copy (fold pieces unfolded, pairs mirrored). */
export function cutInstances(pattern: Pattern): CutInstance[] {
  const out: CutInstance[] = [];
  for (const p0 of pattern.pieces) { const p = unfold(p0); const line = cutLine(p);
    for (let c = 0; c < p.cut; c++) { const m = !!p.pair && c % 2 === 1; out.push({ piece: p, copy: c, mirrored: m, outline: m ? ccw(line.map(([x, y]) => [-x, y] as Pt)) : line }); } }
  return out;
}
