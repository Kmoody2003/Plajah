// The gap report: what a vision model sees missing or wrong when it compares renders of the model with the
// reference photo. It is the hand-over between the eye (vision model) and the hands (Aria's agent), so it is
// small, typed and checked: anything a model writes goes through parseGapReport before the agent sees it.
//
// The vision model says WHAT and WHERE IN THE PICTURE; it never does 3D maths. planner.ts turns the picture
// region into a place on the model (unprojection through the aligned camera), and the agent picks the ops.

import type { Hex } from './schema';

export type GapAxis = 'silhouette' | 'geometry' | 'colour' | 'material' | 'prop';
export const GAP_AXES: GapAxis[] = ['silhouette', 'geometry', 'colour', 'material', 'prop'];
/** missing: in the photo, not on the model. wrong: on both, but not the same. extra: on the model, not in the photo. */
export type GapKind = 'missing' | 'wrong' | 'extra';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
/** How much of the score one item costs at full confidence. Critical = the subject reads as something else. */
export const SEVERITY_COST: Record<Severity, number> = { low: 0.01, medium: 0.03, high: 0.07, critical: 0.15 };

/** Shape the agent should reach for, when the eye can tell (it often can: "a ring", "a bar", "a knob"). */
export type ShapeHint = 'ring' | 'bar' | 'rod' | 'knob' | 'plate' | 'block' | 'lump' | 'hole' | 'groove' | 'band';
export const SHAPE_HINTS: ShapeHint[] = ['ring', 'bar', 'rod', 'knob', 'plate', 'block', 'lump', 'hole', 'groove', 'band'];

/** Normalised picture box in the named view: 0..1, origin top-left. */
export interface Box2 { x0: number; y0: number; x1: number; y1: number }

export interface GapItem {
  id: string;
  axis: GapAxis;
  kind: GapKind;
  /** Which picture the region is in: 'photo' (the reference) or a render name ('render-front', 'render-left' …). */
  view: string;
  region: Box2;
  description: string;
  severity: Severity;
  /** 0..1, the eye's own confidence. */
  confidence: number;
  hint?: {
    shape?: ShapeHint;
    /** The colour the photo shows there. */
    colour?: Hex;
    /** "brass", "lacquered wood", "rawhide" … */
    material?: string;
    metal?: boolean;
    /** Roughly how far it stands off the surface, as a fraction of the subject's height. */
    depth?: number;
    /** Repeats around or across the subject (lugs on a drum, buttons on a coat). */
    count?: number;
    /** It is on both sides (left/right mirror). */
    symmetric?: boolean;
  };
}

export interface GapReport {
  subject: string;
  /** The eye's own estimate of how close the model is, 0..100 (kept beside the measured score, never instead of it). */
  visionScore?: number;
  items: GapItem[];
  /** What answered (model id, or 'rules'). */
  source: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : d);

/**
 * Reads whatever a vision model returned (object or JSON text, possibly fenced) into a clean report.
 * Unknown axes/kinds/severities are mapped to the nearest meaning or dropped; boxes are clamped and ordered;
 * pixel boxes (any value > 1) are scaled by the view size when given; near-duplicate items are merged.
 */
export function parseGapReport(raw: unknown, opts: { views: string[]; viewSize?: Record<string, [number, number]>; source?: string } = { views: ['photo'] }): { report: GapReport; warnings: string[] } {
  const warnings: string[] = [];
  let data: any = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try { data = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      try { data = m ? JSON.parse(m[0]) : {}; } catch { data = {}; warnings.push('answer was not JSON'); }
    }
  }
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.gaps) ? data.gaps : [];
  const items: GapItem[] = [];
  list.forEach((it, n) => {
    if (!it || typeof it !== 'object') { warnings.push(`item ${n}: not an object`); return; }
    const axis = toAxis(it.axis ?? it.category ?? it.type);
    if (!axis) { warnings.push(`item ${n}: unknown axis "${it.axis ?? it.category}"`); return; }
    const kind: GapKind = ['missing', 'wrong', 'extra'].includes(it.kind) ? it.kind : /extra|remove|too much/i.test(String(it.kind ?? it.description)) ? 'extra' : /missing|absent|lack/i.test(String(it.kind ?? it.description)) ? 'missing' : 'wrong';
    let view = typeof it.view === 'string' ? it.view : opts.views[0];
    if (!opts.views.includes(view)) { warnings.push(`item ${n}: unknown view "${view}", read as ${opts.views[0]}`); view = opts.views[0]; }
    const r = it.region ?? it.box ?? it.bbox;
    let box: Box2 | null = null;
    if (Array.isArray(r) && r.length === 4) box = { x0: num(r[0], 0), y0: num(r[1], 0), x1: num(r[2], 1), y1: num(r[3], 1) };
    else if (r && typeof r === 'object') box = { x0: num(r.x0 ?? r.left ?? r.x, 0), y0: num(r.y0 ?? r.top ?? r.y, 0), x1: num(r.x1 ?? r.right ?? (r.x !== undefined && r.w !== undefined ? num(r.x, 0) + num(r.w, 0) : 1), 1), y1: num(r.y1 ?? r.bottom ?? (r.y !== undefined && r.h !== undefined ? num(r.y, 0) + num(r.h, 0) : 1), 1) };
    if (!box) { warnings.push(`item ${n}: no region`); return; }
    if (Math.max(box.x0, box.y0, box.x1, box.y1) > 1.0001) {
      // Gemini likes 0..1000 boxes; a known view size means pixels.
      const size = opts.viewSize?.[view];
      const [sx, sy] = size && Math.max(box.x1, box.y1) > 1000.5 ? size : [1000, 1000];
      box = { x0: box.x0 / sx, y0: box.y0 / sy, x1: box.x1 / sx, y1: box.y1 / sy };
    }
    box = { x0: clamp01(Math.min(box.x0, box.x1)), y0: clamp01(Math.min(box.y0, box.y1)), x1: clamp01(Math.max(box.x0, box.x1)), y1: clamp01(Math.max(box.y0, box.y1)) };
    // A line or a point (the eye pointing rather than boxing): widen it round its centre instead of losing it.
    for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']] as const) {
      if (box[b] - box[a] >= 0.01) continue;
      const mid = (box[a] + box[b]) / 2;
      box[a] = clamp01(mid - 0.01); box[b] = clamp01(mid + 0.01);
      warnings.push(`item ${n}: region widened from a line`);
    }
    const severity: Severity = SEVERITIES.includes(it.severity) ? it.severity : severityFromNumber(it.severity);
    const description = String(it.description ?? it.what ?? '').trim().slice(0, 240);
    if (!description) { warnings.push(`item ${n}: no description`); return; }
    const h = it.hint ?? {};
    const hint: GapItem['hint'] = {};
    if (SHAPE_HINTS.includes(h.shape)) hint.shape = h.shape;
    if (typeof h.colour === 'string' || typeof h.color === 'string') { const c = String(h.colour ?? h.color).trim(); if (/^#?[0-9a-f]{6}$/i.test(c)) hint.colour = (c.startsWith('#') ? c : '#' + c).toLowerCase(); }
    if (typeof h.material === 'string' && h.material.trim()) hint.material = h.material.trim().slice(0, 40);
    if (typeof h.metal === 'boolean') hint.metal = h.metal;
    if (h.depth !== undefined) hint.depth = clamp01(num(h.depth, 0));
    if (h.count !== undefined) hint.count = Math.max(1, Math.min(32, Math.round(num(h.count, 1))));
    if (typeof h.symmetric === 'boolean') hint.symmetric = h.symmetric;
    items.push({
      id: typeof it.id === 'string' && /^[\w.-]{1,40}$/.test(it.id) ? it.id : `gap-${n + 1}`,
      axis, kind, view, region: box, description, severity, confidence: clamp01(num(it.confidence, 0.7)),
      ...(Object.keys(hint).length ? { hint } : {}),
    });
  });
  // Ids must be unique for the agent's `why` links.
  const seen = new Set<string>();
  for (const it of items) { let id = it.id, k = 2; while (seen.has(id)) id = `${it.id}-${k++}`; it.id = id; seen.add(id); }
  const merged = dedupe(items, warnings);
  const visionScore = data && data.score !== undefined ? Math.max(0, Math.min(100, num(data.score, 0))) : undefined;
  return {
    report: { subject: String(data?.subject ?? '').trim().slice(0, 80), ...(visionScore !== undefined ? { visionScore } : {}), items: merged, source: opts.source ?? 'vision' },
    warnings,
  };
}

function toAxis(v: unknown): GapAxis | null {
  const s = String(v ?? '').toLowerCase();
  if (GAP_AXES.includes(s as GapAxis)) return s as GapAxis;
  if (/outline|profile|shape outline|contour/.test(s)) return 'silhouette';
  if (/geom|form|volume|proportion|shape|depth/.test(s)) return 'geometry';
  if (/colou?r|hue|tint|paint/.test(s)) return 'colour';
  if (/material|finish|texture|shine|gloss|metal/.test(s)) return 'material';
  if (/prop|accessor|attachment|part|detail|hardware/.test(s)) return 'prop';
  return null;
}

function severityFromNumber(v: unknown): Severity {
  const n = num(v, 2);
  // Accept 1..4, 1..5 and 0..1 scales.
  const x = n <= 1 ? n : n <= 4 ? (n - 1) / 3 : (n - 1) / 4;
  return x >= 0.85 ? 'critical' : x >= 0.55 ? 'high' : x >= 0.25 ? 'medium' : 'low';
}

export function boxIoU(a: Box2, b: Box2): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const i = ix * iy, u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
  return u > 0 ? i / u : 0;
}

/** Same axis, same view, same kind and mostly the same box: keep the more severe one. */
function dedupe(items: GapItem[], warnings: string[]): GapItem[] {
  const out: GapItem[] = [];
  const rank = (s: Severity) => SEVERITIES.indexOf(s);
  for (const it of items) {
    const twin = out.find(o => o.axis === it.axis && o.view === it.view && o.kind === it.kind && boxIoU(o.region, it.region) > 0.7);
    if (!twin) { out.push(it); continue; }
    warnings.push(`merged ${it.id} into ${twin.id}`);
    if (rank(it.severity) > rank(twin.severity)) Object.assign(twin, { ...it, id: twin.id });
  }
  return out;
}

/** Cost of the open items per axis, 0..1 (capped so a long list of nits can't zero an axis). */
export function gapCost(items: GapItem[]): Record<GapAxis, number> {
  const out = Object.fromEntries(GAP_AXES.map(a => [a, 0])) as Record<GapAxis, number>;
  for (const it of items) out[it.axis] += SEVERITY_COST[it.severity] * it.confidence;
  for (const a of GAP_AXES) out[a] = Math.min(0.6, out[a]);
  return out;
}

/**
 * The instruction the eye gets. Pictures go with it: the photo first, then renders named in `renders`
 * (the first is from the photo's own camera, the rest from other angles, which have no photo to match and are
 * judged only for what the photo implies: symmetry, thickness, parts that must wrap round).
 */
export function gapPrompt(o: { subject?: string; renders: string[]; round: number; openItems?: GapItem[] }): { system: string; user: string } {
  const system = [
    'You are the eye of a 3D modelling loop. You compare renders of a 3D model with a reference photo and list what is missing or wrong, so a modelling agent can fix it.',
    'Be concrete and spatial. Prefer few, high-value items (at most 8), the biggest visual differences first, each description one short sentence (under 25 words). Be brief: no preamble. Do not mention lighting, shadows, background or camera.',
    'Answer only JSON.',
  ].join(' ');
  const user = [
    `Pictures, in order: "photo" (the reference)${o.renders.map(r => `, "${r}"`).join('')}.`,
    `"${o.renders[0]}" is rendered from the photo's own camera, so compare it with the photo pixel for pixel. ${o.renders.length > 1 ? `The others (${o.renders.slice(1).join(', ')}) show the model from other angles: judge them only for what the photo implies (parts that wrap all the way round, symmetry, plausible thickness).` : ''}`,
    o.subject ? `The subject is: ${o.subject}.` : 'First name the subject in a few words.',
    o.openItems?.length ? `Last round you reported: ${o.openItems.map(i => `${i.id} (${i.axis}: ${i.description})`).join('; ')}. Report again only what is still wrong, with the same id.` : '',
    `This is round ${o.round}.`,
    'Return {"subject": string, "score": 0-100 (how close the model is to the photo), "items": [{',
    '"id": short id, "axis": "silhouette"|"geometry"|"colour"|"material"|"prop", "kind": "missing"|"wrong"|"extra",',
    '"view": which picture the region is in (use "photo" for things only the photo shows, a render name for things wrong on the model),',
    '"region": [x0, y0, x1, y1] in 0..1 of that picture (top-left origin), tight around the area,',
    '"description": one sentence a modeller can act on (what, where, how big),',
    '"severity": "low"|"medium"|"high"|"critical", "confidence": 0..1,',
    `"hint": {"shape": one of ${SHAPE_HINTS.join('|')}, "colour": "#rrggbb" as seen in the photo, "material": words, "metal": bool, "depth": how far it stands off the surface as a fraction of the subject height, "count": how many around the subject, "symmetric": bool}`,
    '}]}',
  ].filter(Boolean).join('\n');
  return { system, user };
}
