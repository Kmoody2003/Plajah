// The rich-layer registry: every Tela-only enhancement an author can add to a book, what it needs, how it is
// stored in the Tela doc, and - the contract that matters for portability - how it DEGRADES when the book is
// exported to EPUB / PDF / Markdown / HTML. Nothing in this file touches React or Firebase.
//
// Rule: an enhancement may never make an exported file invalid, and may never silently vanish. Each one either
// keeps a faithful static form (FULL), keeps what a static medium can carry and says what it lost (DEGRADED),
// or is dropped with a note in the export report and colophon (OMITTED).

import type { TelaChartDevice, TelaDevice, TelaGridDevice, TelaMediaDevice, TelaVectorDevice, TelaVectorObject } from '../../types';
import type { EnhancementInstance, EnhancementType, ExportFormat, FallbackStrategy, Fidelity } from './types';

export interface EnhancementDef {
  type: EnhancementType;
  label: string;
  /** One sentence a non-technical author understands. */
  benefit: string;
  /** frame = adds its own page in the Tela doc; text = attaches to text; chapter = decorates the chapter opener. */
  placement: 'frame' | 'text' | 'chapter';
  defaultFallback: FallbackStrategy;
  allowedFallbacks: FallbackStrategy[];
  /** Config keys that must be present (and non-empty) for the enhancement to be usable. */
  required: string[];
  /** Does the visual need author-written alt text? */
  needsAlt: boolean;
  /** Plain-language description of what the reader of an exported file sees instead. */
  exportSummary: string;
}

export const ENHANCEMENTS: Record<EnhancementType, EnhancementDef> = {
  AUDIO_SYNC: {
    type: 'AUDIO_SYNC', label: 'Narration', placement: 'frame',
    benefit: 'Readers can listen to a narrated version right on the page. Great for accessibility and for kids. (Cue points are stored for word-by-word highlighting, which the reader does not play yet.)',
    defaultFallback: 'qr-link', allowedFallbacks: ['qr-link', 'omit-note'], required: ['src'], needsAlt: false,
    exportSummary: 'Audio is not embedded. Exports carry the full text plus a QR code and link to the narrated edition on Plajah.',
  },
  VIDEO: {
    type: 'VIDEO', label: 'Embedded video', placement: 'frame',
    benefit: 'Play a trailer, a demo or an author interview right on the page.',
    defaultFallback: 'static-snapshot', allowedFallbacks: ['static-snapshot', 'qr-link', 'omit-note'], required: ['src'], needsAlt: true,
    exportSummary: 'Exports show the poster image with a caption, plus a QR code and link to watch on Plajah.',
  },
  MOTION: {
    type: 'MOTION', label: 'Motion illustration (Lottie)', placement: 'frame',
    benefit: 'Illustrations that move gently, loop, or react when the page appears.',
    defaultFallback: 'static-snapshot', allowedFallbacks: ['static-snapshot', 'alt-text', 'omit-note'], required: ['lottie'], needsAlt: true,
    exportSummary: 'Exports show one still frame (the poster) with your alt text. Motion is lost.',
  },
  INTERACTIVE_3D: {
    type: 'INTERACTIVE_3D', label: 'Interactive 3D object', placement: 'frame',
    benefit: 'Readers can turn an object, a creature or a place around and look at it from every side.',
    defaultFallback: 'static-snapshot', allowedFallbacks: ['static-snapshot', 'qr-link', 'omit-note'], required: ['modelSrc'], needsAlt: true,
    exportSummary: 'Exports show a still picture of the object with your alt text and a QR code to explore it in 3D on Plajah.',
  },
  CHART: {
    type: 'CHART', label: 'Chart or data graphic', placement: 'frame',
    benefit: 'Interactive charts that readers can hover and explore, drawn from real numbers.',
    defaultFallback: 'plain-text', allowedFallbacks: ['plain-text', 'static-snapshot', 'omit-note'], required: ['labels', 'series'], needsAlt: true,
    exportSummary: 'Exports show the numbers as an accessible data table with your caption. The interactive chart stays on Plajah.',
  },
  ILLUSTRATED_OPENER: {
    type: 'ILLUSTRATED_OPENER', label: 'Illustrated chapter opener', placement: 'chapter',
    benefit: 'A full-width picture and designed title at the start of the chapter.',
    defaultFallback: 'alt-text', allowedFallbacks: ['alt-text', 'omit-note'], required: ['src'], needsAlt: true,
    exportSummary: 'Exports keep the illustration as a normal image with alt text. Nothing is lost.',
  },
  ANIMATED_DROPCAP: {
    type: 'ANIMATED_DROPCAP', label: 'Animated drop cap', placement: 'chapter',
    benefit: 'The first letter of each chapter grows into place.',
    defaultFallback: 'alt-text', allowedFallbacks: ['alt-text', 'omit-note'], required: [], needsAlt: false,
    exportSummary: 'Exports keep the large first letter but it is static.',
  },
  READER_NOTE: {
    type: 'READER_NOTE', label: 'Margin note', placement: 'text',
    benefit: 'Short asides that appear beside the text on the reader, without breaking the flow.',
    defaultFallback: 'footnote', allowedFallbacks: ['footnote', 'omit-note'], required: ['text'], needsAlt: false,
    exportSummary: 'Exports turn each note into a numbered endnote with a link back to the text.',
  },
  GLOSSARY: {
    type: 'GLOSSARY', label: 'Glossary popover', placement: 'text',
    benefit: 'Tap a word to see what it means, without leaving the page.',
    defaultFallback: 'footnote', allowedFallbacks: ['footnote', 'omit-note'], required: ['term', 'definition'], needsAlt: false,
    exportSummary: 'Exports add an endnote at the first use of the word and a Glossary section at the back.',
  },
  BRANCHING: {
    type: 'BRANCHING', label: 'Choose-your-path choices', placement: 'text',
    benefit: 'Let readers decide what happens next.',
    defaultFallback: 'internal-links', allowedFallbacks: ['internal-links', 'plain-text', 'omit-note'], required: ['choices'], needsAlt: false,
    exportSummary: 'Exports turn each choice into a link to the chapter it leads to ("If you open the door, go to ...").',
  },
  LIVE_DATA: {
    type: 'LIVE_DATA', label: 'Live-linked number', placement: 'frame',
    benefit: 'A figure that updates itself from real data, such as a score, a price or a count.',
    defaultFallback: 'plain-text', allowedFallbacks: ['plain-text', 'omit-note'], required: ['label', 'snapshotValue'], needsAlt: false,
    exportSummary: 'Exports freeze the value as of the export date and say so. It will not update.',
  },
  COMMENTARY: {
    type: 'COMMENTARY', label: 'Author commentary', placement: 'text',
    benefit: 'A "director\'s commentary" track: the author explains choices as you read.',
    defaultFallback: 'footnote', allowedFallbacks: ['footnote', 'omit-note'], required: ['text'], needsAlt: false,
    exportSummary: 'Exports include commentary as endnotes labelled "Author commentary" (you can turn this off per export).',
  },
};

export const ENHANCEMENT_TYPES = Object.keys(ENHANCEMENTS) as EnhancementType[];

// ── Validation ───────────────────────────────────────────────────────────────

export interface InstanceIssue { code: string; message: string; severity: 'error' | 'warning' }

export function validateInstance(inst: EnhancementInstance): InstanceIssue[] {
  const def = ENHANCEMENTS[inst.type];
  const out: InstanceIssue[] = [];
  if (!def) return [{ code: 'enh.unknown_type', message: `Unknown enhancement type "${inst.type}".`, severity: 'error' }];
  for (const k of def.required) {
    const v = inst.config?.[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) out.push({ code: 'enh.missing_config', message: `${def.label}: "${k}" is required.`, severity: 'error' });
  }
  if (def.needsAlt && !(inst.alt || '').trim()) out.push({ code: 'enh.alt_missing', message: `${def.label}: add alt text. Exports need a text description of what the reader would see.`, severity: 'warning' });
  if (inst.fallbackOverride && !def.allowedFallbacks.includes(inst.fallbackOverride)) out.push({ code: 'enh.fallback_not_allowed', message: `${def.label} cannot use "${inst.fallbackOverride}" as its export fallback.`, severity: 'error' });
  return out;
}

// ── Strategy resolution + fidelity ───────────────────────────────────────────

/** What will really happen on export, after checking the inputs the chosen strategy needs. */
export function resolveStrategy(inst: EnhancementInstance): { strategy: FallbackStrategy; downgraded?: string } {
  const def = ENHANCEMENTS[inst.type];
  let s = inst.fallbackOverride && def.allowedFallbacks.includes(inst.fallbackOverride) ? inst.fallbackOverride : def.defaultFallback;
  const errs = validateInstance(inst).filter(i => i.severity === 'error');
  if (errs.length) return { strategy: 'omit-note', downgraded: 'The enhancement is incomplete, so it is left out of exports.' };
  const c = inst.config || {};
  const hasAlt = !!(inst.alt || '').trim();
  const poster = c.posterSrc || c.lottie?.posterSrc || c.poster;
  if (s === 'static-snapshot' && !poster) {
    if (def.allowedFallbacks.includes('qr-link') && inst.type !== 'MOTION') return { strategy: 'qr-link', downgraded: 'No poster image, so exports use a QR/link instead.' };
    if (hasAlt) return { strategy: 'alt-text', downgraded: 'No poster image, so exports carry the alt text only.' };
    return { strategy: 'omit-note', downgraded: 'No poster image and no alt text, so it is left out of exports.' };
  }
  if (s === 'alt-text' && def.needsAlt && !hasAlt && inst.type !== 'ILLUSTRATED_OPENER') return { strategy: 'omit-note', downgraded: 'No alt text, so it is left out of exports.' };
  return { strategy: s };
}

export interface InstanceFidelity { fidelity: Fidelity; strategy: FallbackStrategy; changes: string[] }

/** Fidelity of ONE enhancement in ONE target format. */
export function instanceFidelity(inst: EnhancementInstance, format: ExportFormat): InstanceFidelity {
  const def = ENHANCEMENTS[inst.type];
  const { strategy, downgraded } = resolveStrategy(inst);
  const changes: string[] = [];
  if (strategy === 'omit-note') return { fidelity: 'OMITTED', strategy, changes: [downgraded || `${def.label} is left out of exports and listed in the colophon.`] };
  if (downgraded) changes.push(downgraded);
  // FULL: static decorations that a static medium can carry exactly.
  if (inst.type === 'ILLUSTRATED_OPENER') return { fidelity: 'FULL', strategy, changes };
  if (format === 'MARKDOWN' && strategy === 'qr-link') changes.push('Markdown carries the link only, not a QR image.');
  changes.push(def.exportSummary);
  return { fidelity: 'DEGRADED', strategy, changes };
}

// ── Tela device builders (frame-level enhancements) ──────────────────────────

/** Frame width in Tela px. Narrow on purpose: the reader scales a frame to the screen, so 480 keeps body text near 14-17px on a phone. */
export const BOOK_FRAME_W = 480;

export interface EnhancementFrame { id: string; w: number; h: number; label: string; device: TelaDevice }

const vecObj = (id: string, patch: Partial<TelaVectorObject>): TelaVectorObject => ({
  id, kind: 'RECT', x: 0, y: 0, w: 100, h: 100, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, ...patch,
});

/** Devices a frame-level enhancement adds to the Tela doc. Text-level and chapter-level types return null. */
export function enhancementFrame(inst: EnhancementInstance, docId: string): EnhancementFrame | null {
  const c = inst.config || {};
  const id = `${docId}:enh:${inst.id}`;
  const name = inst.label || ENHANCEMENTS[inst.type]?.label || 'Enhancement';
  switch (inst.type) {
    case 'AUDIO_SYNC': {
      const d: TelaMediaDevice = { id, type: 'MEDIA', kind: 'AUDIO', name, src: String(c.src || ''), mimeType: String(c.mimeType || ''), size: 0, width: BOOK_FRAME_W, height: 110 };
      return { id, w: BOOK_FRAME_W, h: 110, label: name, device: d };
    }
    case 'VIDEO': {
      const d: TelaMediaDevice = { id, type: 'MEDIA', kind: 'VIDEO', name, src: String(c.src || ''), mimeType: String(c.mimeType || ''), size: 0, width: BOOK_FRAME_W, height: 270 };
      return { id, w: BOOK_FRAME_W, h: 270, label: name, device: d };
    }
    case 'INTERACTIVE_3D': {
      const d: TelaMediaDevice = { id, type: 'MEDIA', kind: 'MODEL_3D', name, src: String(c.modelSrc || ''), mimeType: String(c.mimeType || 'model/gltf-binary'), size: 0, width: BOOK_FRAME_W, height: 320 };
      return { id, w: BOOK_FRAME_W, h: 320, label: name, device: d };
    }
    case 'MOTION': {
      const l = c.lottie;
      const w = BOOK_FRAME_W; const h = Math.round(w * ((l?.intrinsicHeight || 9) / (l?.intrinsicWidth || 16)));
      const d: TelaVectorDevice = { id, type: 'VECTOR', name, width: w, height: h, objects: [vecObj(`${id}:lottie`, { kind: 'LOTTIE', w, h, lottie: l, objectLabel: name })] };
      return { id, w, h, label: name, device: d };
    }
    case 'CHART': {
      const labels: string[] = (c.labels || []).map(String);
      const d: TelaChartDevice = {
        id, type: 'CHART', name, title: String(c.title || name), subtitle: c.caption ? String(c.caption) : undefined,
        width: BOOK_FRAME_W, height: 340, kind: c.kind || 'BAR', style: c.style || 'EDITORIAL',
        binding: { sourceType: 'INLINE', labels, series: (c.series || []).map((s: any, i: number) => ({ id: `${id}:s${i}`, name: String(s.name || `Series ${i + 1}`), values: (s.values || []).map(Number), color: s.color })) },
        showLegend: (c.series || []).length > 1, showValues: true, interactive: true,
        animation: { preset: 'RISE', durationMs: 900, staggerMs: 60 }, transition: { in: 'FADE', out: 'FADE' },
      };
      return { id, w: BOOK_FRAME_W, h: 340, label: name, device: d };
    }
    case 'LIVE_DATA': {
      const d: TelaGridDevice = { id, type: 'GRID', rows: 1, cols: 3, cells: { A1: String(c.label || ''), B1: c.formula ? String(c.formula) : String(c.snapshotValue ?? ''), C1: String(c.unit || '') } };
      return { id, w: BOOK_FRAME_W, h: 90, label: name, device: d };
    }
    default: return null;
  }
}

export const isFrameLevel = (t: EnhancementType): boolean => ENHANCEMENTS[t]?.placement === 'frame';

let seq = 0;
/** Fresh enhancement id (unique within a session; callers persist it). */
export function newEnhancementId(): string { return `enh_${Date.now().toString(36)}${(++seq).toString(36)}`; }

/** Defaults an editor can start from. */
export function defaultConfig(type: EnhancementType): Record<string, any> {
  switch (type) {
    case 'AUDIO_SYNC': return { src: '', cues: [] };
    case 'VIDEO': return { src: '', poster: '' };
    case 'MOTION': return { lottie: null };
    case 'INTERACTIVE_3D': return { modelSrc: '', poster: '' };
    case 'CHART': return { title: '', kind: 'BAR', labels: [], series: [] };
    case 'ILLUSTRATED_OPENER': return { src: '' };
    case 'ANIMATED_DROPCAP': return { style: 'GROW' };
    case 'READER_NOTE': return { text: '' };
    case 'GLOSSARY': return { term: '', definition: '' };
    case 'BRANCHING': return { prompt: '', choices: [] };
    case 'LIVE_DATA': return { label: '', snapshotValue: '', formula: '', unit: '', asOf: '' };
    case 'COMMENTARY': return { text: '', audioSrc: '' };
  }
}
