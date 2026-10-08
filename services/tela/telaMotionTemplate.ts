// telaMotionTemplate — the pure renderer behind Tela's MOTION_TEMPLATE object.
//
// "Both": the designers stay CODE (Ambo slide templates + scripture looks) and a
// Tela object READS that code by reference. The spec carries which designer,
// theme, field values and overrides; the doc owns the timing (entrance at
// startOffset → hold → exit, optional loop). Everything here is deterministic
// from a clock, so any host can draw any frame:
//
//   Tela artboard        TelaMotionTemplateCanvas (components/tela/TelaMotionTemplate.tsx)
//   Universal Library    LibraryTile 'motion' previews
//   Fabula               title clips carrying `mGraphic` (monitor + offline export)
//   Broadcast titler     call renderMotionTemplateAt(ctx, spec, secondsSinceTake, w, h)
//                        from the source's tick — see the note at the end of this file.
//
// No React, no Firebase: safe to bundle into node tests and render workers.
import type { TelaMotionTemplateSpec, TelaMotionTemplateTiming, TelaVectorObject } from '../../types';
import { SLIDE_TEMPLATES, templateById, defaultFields, resolveTheme, buildSlideObjects, THEME_FIELD } from '../ambo/slideTemplates/registry';
import { renderSlideTemplate, slideTemplateTiming, loadSlideFonts, invalidateSlideLayouts, prefersReducedMotion } from '../ambo/slideTemplates/canvasRender';
import { SLIDE_THEMES } from '../ambo/slideTemplates/themes';
import { MODERN_THEMES_A } from '../ambo/slideTemplates/themesModernA';
import { MODERN_THEMES_B } from '../ambo/slideTemplates/themesModernB';
import { URBAN_THEMES } from '../ambo/slideTemplates/themesUrban';
import type { FieldDef } from '../ambo/slideTemplates/types';
import {
  SCRIPTURE_LAYOUTS, SCRIPTURE_TRANSITIONS, SAMPLE_SCRIPTURE, renderScripture, scriptureLayoutById, transitionById,
} from '../ambo/scriptureLayouts';

export type { TelaMotionTemplateSpec, TelaMotionTemplateTiming };

// ── catalogue helpers ────────────────────────────────────────────────────────

export type ThemeSet = 'classic' | 'modern' | 'urban';
const MODERN_IDS = new Set([...MODERN_THEMES_A, ...MODERN_THEMES_B].map(t => t.id));
const URBAN_IDS = new Set(URBAN_THEMES.map(t => t.id));
/** classic = the seven Art Council originals; modern = modern/postmodern/abstract; urban = urban/grunge. */
export function themeSetOf(themeId: string | undefined): ThemeSet {
  if (themeId && URBAN_IDS.has(themeId)) return 'urban';
  if (themeId && MODERN_IDS.has(themeId)) return 'modern';
  return 'classic';
}
export function themesInSet(set: ThemeSet | 'all') {
  return SLIDE_THEMES.filter(t => set === 'all' || themeSetOf(t.id) === set);
}
/** Scripture families map onto the same three sets. */
export function scriptureSetOf(layoutId: string | undefined): ThemeSet {
  const f = scriptureLayoutById(layoutId).family;
  return f === 'Urban & Grunge' ? 'urban' : f === 'Modern & Abstract' ? 'modern' : 'classic';
}

export { SLIDE_TEMPLATES, SLIDE_THEMES, SCRIPTURE_LAYOUTS, SCRIPTURE_TRANSITIONS };

/** The editable fields for a spec (slide: the template's schema; scripture: verse text). */
export function motionTemplateFields(spec: TelaMotionTemplateSpec): FieldDef[] {
  if (spec.kind === 'scripture') return [
    { key: 'text', label: 'Verse', default: SAMPLE_SCRIPTURE.text, multiline: true },
    { key: 'reference', label: 'Reference', default: SAMPLE_SCRIPTURE.reference },
    { key: 'translation', label: 'Translation', default: SAMPLE_SCRIPTURE.translation },
    { key: 'copyright', label: 'Copyright line', default: '' },
  ];
  const t = templateById(spec.templateId || '');
  // Text-ish fields only — media wells (video/audio) need an Ambo host; image URLs stay editable.
  return (t?.fields || []).filter(f => !f.key.startsWith('__') && f.kind !== 'video' && f.kind !== 'audio' && f.kind !== 'visualizer');
}

export function motionTemplateName(spec: TelaMotionTemplateSpec): string {
  if (spec.name) return spec.name;
  if (spec.kind === 'scripture') return scriptureLayoutById(spec.layoutId).name;
  return templateById(spec.templateId || '')?.name || 'Motion template';
}

/** A fresh spec for a platform template / look (default copy, default timing). */
export function defaultMotionSpec(kind: 'slide' | 'scripture', id: string, opts: { theme?: string; accent?: string; transition?: string } = {}): TelaMotionTemplateSpec {
  if (kind === 'scripture') {
    return { kind, layoutId: id, accent: opts.accent || '#D4AF37', transition: opts.transition || 'rise', fields: { text: SAMPLE_SCRIPTURE.text, reference: SAMPLE_SCRIPTURE.reference, translation: SAMPLE_SCRIPTURE.translation }, timing: { startOffset: 0 } };
  }
  return { kind, templateId: id, theme: opts.theme || 'sanctuary', fields: {}, timing: { startOffset: 0 } };
}

// ── timing ───────────────────────────────────────────────────────────────────

/** Render-ready slide fields: overrides travel inside the reserved __theme field. */
function slideFields(spec: TelaMotionTemplateSpec): Record<string, string> {
  const f: Record<string, string> = { ...(spec.fields || {}) };
  if (spec.overrides && Object.keys(spec.overrides).length) f[THEME_FIELD] = JSON.stringify(spec.overrides);
  return f;
}

export interface MotionDurations { start: number; enter: number; hold: number; exit: number; gap: number; loop: boolean }

/** Resolved durations: the doc's timing, falling back to the theme's / transition's own. */
export function motionTemplateDurations(spec: TelaMotionTemplateSpec, reduced = false): MotionDurations {
  const tm: TelaMotionTemplateTiming = spec.timing || {};
  let enter: number, exit: number;
  if (spec.kind === 'scripture') { const tr = transitionById(spec.transition); enter = tr.inSec; exit = tr.outSec; }
  else { const s = slideTemplateTiming(resolveTheme(spec.theme, slideFields(spec)), reduced); enter = s.enterSec; exit = s.exitSec; }
  const pos = (v: unknown, d: number) => typeof v === 'number' && isFinite(v) && v >= 0 ? v : d;
  enter = Math.max(0.05, pos(tm.enterSec, enter));
  exit = Math.max(0.05, pos(tm.exitSec, exit));
  const loop = !!tm.loop;
  const hold = pos(tm.holdSec, loop ? 4 : Infinity);
  return { start: pos(tm.startOffset, 0), enter, hold, exit, gap: pos(tm.gapSec, 0.6), loop };
}

/** Total length of one pass (start offset + enter + hold + exit); Infinity when it holds until cleared. */
export function motionTemplateLength(spec: TelaMotionTemplateSpec): number {
  const d = motionTemplateDurations(spec);
  return d.start + d.enter + d.hold + d.exit;
}

export type MotionPhase = 'pre' | 'enter' | 'hold' | 'exit' | 'post';
export interface MotionFrame { phase: MotionPhase; enterP: number; exitP: number; /** seconds since the entrance began (ambient clock). */ local: number }

/** Which phase a spec is in at clock `t` (seconds since the object appeared / the clip began). */
export function motionTemplatePhase(spec: TelaMotionTemplateSpec, t: number, reduced = false): MotionFrame {
  const d = motionTemplateDurations(spec, reduced);
  let local = t - d.start;
  if (local < 0) return { phase: 'pre', enterP: 0, exitP: 0, local: 0 };
  const pass = d.enter + d.hold + d.exit;
  if (d.loop && isFinite(pass)) {
    const cycle = pass + d.gap;
    local = local % cycle;
    if (local >= pass) return { phase: 'post', enterP: 1, exitP: 1, local };
  }
  if (local < d.enter) return { phase: 'enter', enterP: local / d.enter, exitP: 0, local };
  if (local < d.enter + d.hold) return { phase: 'hold', enterP: 1, exitP: 0, local };
  if (local < pass) return { phase: 'exit', enterP: 1, exitP: (local - d.enter - d.hold) / d.exit, local };
  return { phase: 'post', enterP: 1, exitP: 1, local };
}

/** Timing that fills a fixed duration (Fabula clips: the clip length drives the motion). */
export function fitMotionTimingToDuration(spec: TelaMotionTemplateSpec, durationSec: number): TelaMotionTemplateSpec {
  const d = motionTemplateDurations({ ...spec, timing: { ...spec.timing, holdSec: undefined, loop: false } });
  const dur = Math.max(0.2, durationSec);
  const k = Math.min(1, dur / Math.max(0.01, d.enter + d.exit + 0.2));
  const enterSec = d.enter * k, exitSec = d.exit * k;
  return { ...spec, timing: { startOffset: 0, enterSec, exitSec, holdSec: Math.max(0, dur - enterSec - exitSec), loop: false } };
}

// ── drawing ──────────────────────────────────────────────────────────────────

export interface MotionRenderOptions {
  reducedMotion?: boolean;
  /** Paint a neutral stage under transparent scripture looks (galleries/thumbnails). */
  backdrop?: boolean;
  /** Draw the settled (hold) frame regardless of `t` — posters and reduced motion. */
  still?: boolean;
}

/** A neutral stage so transparent looks read in previews. */
export function drawMotionBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b3a55'); g.addColorStop(0.5, '#4a3b5e'); g.addColorStop(1, '#2a4a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(((i * 0.19) % 1) * w, h * (0.3 + (i % 3) * 0.2), h * 0.18, 0, Math.PI * 2); ctx.fill(); }
}

/** True when the look composites over whatever is behind it. */
export function motionTemplateIsTransparent(spec: TelaMotionTemplateSpec): boolean {
  if (spec.kind === 'scripture') return scriptureLayoutById(spec.layoutId).background === 'transparent';
  return spec.fields?.__ground === 'translucent';
}

/**
 * Draw the frame at clock `t` (seconds since the object appeared / clip began)
 * into a w×h box. Pure + deterministic; never throws. The context's current
 * transform is respected (callers scale for backing-store resolution).
 */
export function renderMotionTemplateAt(ctx: CanvasRenderingContext2D, spec: TelaMotionTemplateSpec, t: number, w: number, h: number, opts: MotionRenderOptions = {}): MotionFrame {
  const reduced = !!opts.reducedMotion;
  const d = motionTemplateDurations(spec, reduced);
  const fr: MotionFrame = opts.still || reduced
    ? { phase: 'hold', enterP: 1, exitP: 0, local: opts.still ? Math.min(d.enter + 1.5, d.enter + d.hold) : 0 }
    : motionTemplatePhase(spec, t, reduced);
  try {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    const transparent = motionTemplateIsTransparent(spec);
    if (opts.backdrop && transparent) drawMotionBackdrop(ctx, w, h);
    if (fr.phase === 'post' || (fr.phase === 'pre' && !opts.backdrop)) { ctx.restore(); return fr; }
    if (spec.kind === 'scripture') {
      const f = spec.fields || {};
      renderScripture(ctx, spec.layoutId, {
        w, h, t: fr.local, mt: fr.local,
        text: f.text ?? SAMPLE_SCRIPTURE.text, reference: f.reference ?? SAMPLE_SCRIPTURE.reference,
        translation: f.translation || undefined, copyright: f.copyright || undefined,
        accent: spec.accent || '#D4AF37', enterP: fr.enterP, exitP: fr.exitP,
        transition: transitionById(spec.transition).id,
      });
    } else {
      // renderSlideTemplate clears its own box (a translucent ground shows the host layer beneath).
      renderSlideTemplate(ctx, spec.templateId || 'welcome', spec.theme, slideFields(spec), w, h, {
        t: fr.local, enterP: fr.phase === 'pre' ? 0 : fr.enterP, exitP: fr.exitP, reducedMotion: reduced,
      });
    }
    ctx.restore();
  } catch { try { ctx.restore(); } catch { /* */ } }
  return fr;
}

/** Logical width clip renders lay out at — monitor and export share it, so they match. */
export const MOTION_CLIP_LOGICAL_W = 1920;

/**
 * Fabula / timeline hosts: draw clip-local time `t` of a clip of `duration`
 * seconds into a W×H pixel canvas. The clip length drives the motion (entrance
 * from the clip start, exit into the clip end).
 */
export function renderMotionClipFrame(ctx: CanvasRenderingContext2D, spec: TelaMotionTemplateSpec, t: number, duration: number, W: number, H: number): MotionFrame {
  const k = W / MOTION_CLIP_LOGICAL_W;
  const lh = Math.max(2, Math.round(H / k));
  ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
  const fr = renderMotionTemplateAt(ctx, fitMotionTimingToDuration(spec, duration), t, MOTION_CLIP_LOGICAL_W, lh);
  ctx.restore();
  return fr;
}

// ── fonts ────────────────────────────────────────────────────────────────────

const fontReady = new Map<string, Promise<void>>();
const SCRIPTURE_FACES = ['400 32px "Noto Serif"', 'italic 400 32px "Noto Serif"', '600 32px "Inter"', '600 32px "Outfit"', '500 32px "Space Grotesk"', '500 32px "JetBrains Mono"'];
/** Load the faces a spec draws with; resolves once canvas text will measure correctly. */
export function ensureMotionTemplateFonts(spec: TelaMotionTemplateSpec): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const key = spec.kind === 'scripture' ? 'scripture' : `${spec.templateId}|${spec.theme}|${spec.overrides ? JSON.stringify(spec.overrides) : ''}`;
  let p = fontReady.get(key);
  if (!p) {
    if (spec.kind === 'scripture') {
      const fonts = (document as any).fonts;
      p = fonts ? Promise.all(SCRIPTURE_FACES.map(s => fonts.load(s).catch(() => null))).then(() => undefined) : Promise.resolve();
    } else {
      const objs = buildSlideObjects(spec.templateId || 'welcome', spec.theme, slideFields(spec), 1920, 1080) || [];
      p = loadSlideFonts(objs).then(() => invalidateSlideLayouts());
    }
    fontReady.set(key, p);
  }
  return p;
}

// ── posters + objects ───────────────────────────────────────────────────────

/** Settled-frame poster (data URL, ≤ maxLong px) for thumbnails, print and static export. */
export async function renderMotionTemplatePoster(spec: TelaMotionTemplateSpec, w: number, h: number, maxLong = 360): Promise<string | undefined> {
  if (typeof document === 'undefined' || !(w > 0) || !(h > 0)) return undefined;
  try {
    await ensureMotionTemplateFonts(spec);
    // Render at design size (templates re-flow by size), then downscale.
    const k = Math.min(1, 1920 / Math.max(w, h));
    const big = document.createElement('canvas'); big.width = Math.max(2, Math.round(w * k)); big.height = Math.max(2, Math.round(h * k));
    const b = big.getContext('2d'); if (!b) return undefined;
    b.setTransform(k, 0, 0, k, 0, 0);
    renderMotionTemplateAt(b, spec, 0, w, h, { still: true });
    const s = Math.min(1, maxLong / Math.max(big.width, big.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(big.width * s)); c.height = Math.max(1, Math.round(big.height * s));
    c.getContext('2d')?.drawImage(big, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/webp', 0.8);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    return url;
  } catch { return undefined; }
}

const oid = () => `obj_mt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
/** A MOTION_TEMPLATE vector object for an artboard box. */
export function makeMotionTemplateObject(spec: TelaMotionTemplateSpec, box: { x: number; y: number; w: number; h: number }): TelaVectorObject {
  return {
    id: oid(), kind: 'MOTION_TEMPLATE', x: box.x, y: box.y, w: box.w, h: box.h,
    fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
    semanticRole: 'ARTWORK', templateRole: 'ORNAMENT', objectLabel: motionTemplateName(spec),
    motionTemplate: spec,
  };
}

/** Respect the OS setting by default. */
export const motionPrefersReduced = prefersReducedMotion;

/** Default copy for a slide template (for inspectors). */
export function motionTemplateDefaults(spec: TelaMotionTemplateSpec): Record<string, string> {
  if (spec.kind === 'scripture') return { text: SAMPLE_SCRIPTURE.text, reference: SAMPLE_SCRIPTURE.reference, translation: SAMPLE_SCRIPTURE.translation, copyright: '' };
  const t = templateById(spec.templateId || '');
  return t ? defaultFields(t) : {};
}

// ── Where the broadcast titler hooks in ─────────────────────────────────────
// TV Studio / Ambo live outputs tick a canvas per graphic source. A motion
// template source is: keep the spec, record `takenAt` when the operator takes
// it, and each tick call
//     renderMotionTemplateAt(ctx, spec, (now - takenAt) / 1000, w, h)
// For CLEAR, set spec.timing.holdSec = secondsSinceTake - enter (so the exit
// starts now) and keep ticking until the returned phase is 'post'. That is the
// exact path Fabula's MotionTemplateMonitor + offline export use.
