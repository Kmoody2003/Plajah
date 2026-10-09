// eraEvites — the "Design eras" evite collection: one invitation per Tela design-history era, drawn in code from the
// era's own designer, palette and ornaments (services/evite/eraPlates.ts). Zero image credits; nothing on the bucket.
//
//   ERA_EVITES          the list (id "era/<eraId>", label, period, lesson, cantus firmus, motion preset, foil, voice)
//   eraPlateSvg(id)     the text-free art plate as an SVG string (optionally with the faint "design law" drawn on)
//   eraDepthSvg(id)     the matching grayscale depth map (far planes dark, near ornaments light) for EviteStage
//   eraMotion(id)       the living-card recipe: quiet, one foil colour, effects that settle after the reveal
//
// Pure (no DOM) and deterministic. The browser rasteriser lives in eraArt.ts; the server only needs eraIds.ts.
import type { TelaVectorObject } from '../../types';
import { TELA_STYLE_ERAS, resolveStyleEra, type TelaStyleEra } from '../telaStyleEraLibrary';
import { ERA_DESIGNS, ERA_LESSONS } from '../tela/designs/eras';
import { frame, luminance } from '../tela/templateKit';
import { objectToSvg } from '../tela/telaSvg';
import { fontCss, type FontKey } from '../tela/telaFonts';
import { rng } from '../tela/ornaments';
import { recipeFor, mergeMotion, type MotionRecipe } from './motionRecipes';
import { ERA_PLATES, PLATE_W, PLATE_H, CALM_Y, lawObjects, type CantusFirmus, type Layer, type PlateCtx } from './eraPlates';
import { ERA_EVITE_IDS, ERA_EVITE_EXCLUDED, eraIdOf, eraPlateId, isEraId } from './eraIds';

export { isEraId, eraIdOf, eraPlateId, ERA_EVITE_IDS, ERA_EVITE_EXCLUDED, PLATE_W, PLATE_H, CALM_Y };
export type { CantusFirmus };

/** Motion/voice preset collection every era evite borrows (see COLLECTION_MOTION.era). */
export const ERA_PRESET = 'era';

export interface EraEvite {
  id: string; eraId: string; label: string; period: string; category: string;
  /** one-line lesson: the design principle this card demonstrates */
  lesson: string;
  history: string;
  cantusFirmus: CantusFirmus;
  preset: typeof ERA_PRESET;
  /** one foil colour per era */
  foil: string;
  /** accent for the eyebrow / CTA over the art */
  cta: string;
  /** era palette: paper, ink, accent, secondary */
  palette: [string, string, string, string];
  /** the live headline face */
  font: FontKey; display: string; displayStyle: string;
  /** relief-print history → letterpress-wipe entrance */
  relief: boolean;
  /** the text block sits on a light ground */
  light: boolean;
}

const eraEntry = (eraId: string): TelaStyleEra | undefined => { const e = TELA_STYLE_ERAS.find(x => x.id === eraId); return e ? resolveStyleEra(e) : undefined; };

/** Where the invitation's art reads differently from the Tela template's lesson (the Tela page teaches graphic
 *  Brutalism; the invitation is an architectural plate), the card's own words win. */
const EVITE_LESSONS: Record<string, { label?: string; principle: string; history: string }> = {
  brutalist: {
    label: 'Brutalism',
    principle: 'Let the material speak: raw board-formed concrete, honest structure, and heavy masses that cantilever out into light and shadow.',
    history: 'Named from Le Corbusier’s béton brut (“raw concrete”) and the “New Brutalism” label critics gave it in the 1950s, the style shaped civic buildings, campuses and housing into the 1970s, from Boston City Hall to London’s Barbican. Its architects showed how a building was made instead of hiding it: the grain of the timber formwork, the exposed structure, the repeated bay.',
  },
};

export const ERA_EVITES: EraEvite[] = TELA_STYLE_ERAS.filter(e => ERA_PLATES[e.id] && ERA_DESIGNS[e.id] && isEraId(eraPlateId(e.id))).map(e0 => {
  const e = resolveStyleEra(e0); const s = ERA_PLATES[e.id]; const lesson = EVITE_LESSONS[e.id] || ERA_LESSONS[e.id];
  return {
    id: eraPlateId(e.id), eraId: e.id, label: EVITE_LESSONS[e.id]?.label || e.name, period: e.period, category: e.category,
    lesson: lesson?.principle || e.description, history: lesson?.history || e.description,
    cantusFirmus: s.cf, preset: ERA_PRESET, foil: s.foil, cta: s.cta, palette: e.palette,
    font: s.font, display: fontCss(s.font), displayStyle: s.fontStyle, relief: !!s.relief, light: s.light,
  };
});
const BY_ERA = new Map(ERA_EVITES.map(e => [e.eraId, e]));
/** Accepts "era/<eraId>" or a bare era id. */
export function eraEvite(id: string): EraEvite | null { return BY_ERA.get(eraIdOf(id) || id) || null; }

/** Only primitive vector kinds ever reach a plate: never text, images, Lottie or motion templates. */
const PLATE_KINDS = new Set<TelaVectorObject['kind']>(['RECT', 'ELLIPSE', 'LINE', 'PATH']);

function ctxFor(eraId: string): PlateCtx {
  const e = eraEntry(eraId)!; const [paper, ink, accent, secondary] = e.palette; const s = ERA_PLATES[eraId];
  const seed = [...e.id].reduce((a, ch) => a + ch.charCodeAt(0), 7);
  const pages = new Map<number, TelaVectorObject[]>();
  return {
    paper, ink, accent, secondary, seed, r: rng(seed), cf: s.cf,
    designer: (page = 0) => {
      if (!pages.has(page)) {
        const all = ERA_DESIGNS[eraId]({ entry: e, W: PLATE_W, H: PLATE_H, fr: frame(PLATE_W, PLATE_H, 64), paper, ink, accent, secondary, seed });
        pages.set(page, (all[page] || []).filter(o => PLATE_KINDS.has(o.kind) && o.templateRole !== 'IMAGE_SLOT'));
      }
      return pages.get(page)!.map(o => ({ ...o }));
    },
  };
}

const layerCache = new Map<string, Layer[]>();
/** The plate's layer stack (back → front), text-free, ids made deterministic. */
export function eraLayers(id: string, o: { fresh?: boolean } = {}): Layer[] {
  const eraId = eraIdOf(id) || (BY_ERA.has(id) ? id : null);
  if (!eraId) throw new Error(`Not an era evite: ${id}`);
  const hit = !o.fresh && layerCache.get(eraId); if (hit) return hit;
  let n = 0;
  const layers = ERA_PLATES[eraId].build(ctxFor(eraId)).map(l => ({ depth: Math.max(0, Math.min(1, l.depth)), objects: l.objects.filter(o => PLATE_KINDS.has(o.kind)).map(o => ({ ...o, id: `e${(n++).toString(36)}` })) }));
  layerCache.set(eraId, layers);
  return layers;
}

export interface EraSvgOpts { W?: number; H?: number; showLaw?: boolean }
const open = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLATE_W} ${PLATE_H}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">`;

/** The art plate as SVG: no text, no external references, deterministic. */
export function eraPlateSvg(id: string, o: EraSvgOpts = {}): string {
  const layers = eraLayers(id); const ev = eraEvite(id)!;
  const body = layers.flatMap(l => l.objects).map(x => objectToSvg(x)).join('');
  const law = o.showLaw ? lawObjects(ev.cantusFirmus, luminance(ev.palette[0]) > .4 && ev.light ? ev.palette[1] : ev.palette[2]).map((x, i) => objectToSvg({ ...x, id: `law${i}` })).join('') : '';
  return `${open(o.W || PLATE_W, o.H || PLATE_H)}<rect width="${PLATE_W}" height="${PLATE_H}" fill="${ev.palette[0]}"/>${body}${law ? `<g data-law="1">${law}</g>` : ''}</svg>`;
}

const gray = (d: number) => { const v = Math.round(Math.max(0, Math.min(1, d)) * 255).toString(16).padStart(2, '0'); return `#${v}${v}${v}`; };
/** Faint washes, glows and blurred light carry no depth: they would read as solid slabs in the map. */
function carriesDepth(o: TelaVectorObject): boolean {
  if (o.opacity <= .3) return false;
  if (o.blur && o.blur > 0) return false;
  if (o.gradient && o.gradient.stops.some(s => (s.opacity ?? 1) < .35)) return false;
  return true;
}

/** Grayscale depth map for EviteStage: layer depth → luminance (far = dark, near = light), softened at the edges. */
export function eraDepthSvg(id: string, o: Omit<EraSvgOpts, 'showLaw'> = {}): string {
  const layers = eraLayers(id);
  const body = layers.flatMap(l => l.objects.filter(carriesDepth).map(x => {
    const g = gray(l.depth);
    return objectToSvg({ ...x, fill: x.fill === 'none' ? 'none' : g, stroke: x.stroke === 'none' ? 'none' : g, gradient: undefined, shadow: undefined, blendMode: undefined, blur: undefined, opacity: 1 });
  })).join('');
  return `${open(o.W || PLATE_W, o.H || PLATE_H)}<defs><filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter></defs><rect width="${PLATE_W}" height="${PLATE_H}" fill="${gray(layers[0]?.depth ?? 0)}"/><g filter="url(#soft)">${body}</g></svg>`;
}

/** The living-card recipe for an era: the quiet `era` preset, its one foil colour, taps that burst in its palette. */
export function eraMotion(id: string): MotionRecipe {
  const ev = eraEvite(id); const s = ev && ERA_PLATES[ev.eraId];
  const base = recipeFor(ERA_PRESET, ev?.eraId || 'era');
  if (!ev || !s) return base;
  return mergeMotion(base, { foil: { color: s.foil, strength: s.foilStrength }, burstColors: [ev.palette[2], ev.palette[3], s.foil, ev.light ? ev.palette[1] : '#FFFFFF'] });
}

/** Typographic voice for the live text over an era plate (same shape as plateCatalog.plateVoice). */
export function eraVoice(id: string): { tone: 'formal'; display: string; displayStyle: string; eyebrow: string; scale: number } {
  const ev = eraEvite(id);
  return { tone: 'formal', display: ev?.display || 'Georgia, serif', displayStyle: ev?.displayStyle || 'normal 600', eyebrow: 'You are invited', scale: (ev && DISPLAY_SCALE[ev.font]) || 1 };
}
/** Extended / wide faces set smaller so a long word still fits a 390 px card; condensed faces a touch larger. */
const DISPLAY_SCALE: Partial<Record<FontKey, number>> = {
  michroma: .68, rubikMono: .7, unbounded: .78, audiowide: .82, orbitron: .8, spaceMono: .82, archivoBlack: .88, shrikhand: .88, permanentMarker: .9,
  uncial: .86, cinzel: .86, limelight: .9, syne: .9, abril: .94, federo: .92, specialElite: .9, bigShoulders: 1.08, anton: 1.04,
};
