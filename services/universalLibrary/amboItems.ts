// amboItems — Ambo's slide templates, scripture looks and saved/shared/community
// templates as Universal Library items. Every item carries a ready-to-use
// TelaMotionTemplateSpec in `preview.motion`, so a tile previews it with the same
// pure renderer a Tela object, a Fabula clip or the titler uses
// (services/tela/telaMotionTemplate → renderMotionTemplateAt).
//
// Pure (no Firebase): the panel loads saved templates lazily from
// services/ambo/templateLibrary and maps them through savedTemplateToItem.
import type { TelaMotionTemplateSpec } from '../../types';
import type { SavedTemplate } from '../ambo/templateLibrary';
import type { LibraryItem, LibrarySourceId } from './libraryModel';
import {
  SLIDE_TEMPLATES, SCRIPTURE_LAYOUTS, defaultMotionSpec, themeSetOf, scriptureSetOf, themesInSet, type ThemeSet,
} from '../tela/telaMotionTemplate';

export type MotionKindFacet = 'all' | 'slide' | 'scripture';
export type ThemeSetFacet = 'all' | ThemeSet;
export interface MotionFacets { kind: MotionKindFacet; set: ThemeSetFacet; category: string; /** Preview theme for platform slide templates ('' = each item's own). */ theme: string }
export const DEFAULT_MOTION_FACETS: MotionFacets = { kind: 'all', set: 'all', category: 'all', theme: '' };

/** One item per slide template (previewed in the default/chosen theme) and per scripture look. */
export function amboPresetItems(defaultTheme = 'sanctuary'): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (const t of SLIDE_TEMPLATES) {
    const motion = defaultMotionSpec('slide', t.id, { theme: defaultTheme });
    out.push({
      id: 'ambo:' + t.id, name: t.name, source: 'presets', kind: 'motion', category: t.category, author: 'Ambo',
      tags: ['ambo', 'slide', t.category, ...(t.media ? [t.media] : []), t.blurb], typeLabel: 'SLIDE · ' + t.category.toUpperCase(),
      preview: { mode: 'motion', motion }, facets: { motionKind: 'slide', themeSet: themeSetOf(defaultTheme), media: t.media },
    });
  }
  for (const l of SCRIPTURE_LAYOUTS) {
    const motion = defaultMotionSpec('scripture', l.id);
    out.push({
      id: 'scripture:' + l.id, name: l.name, source: 'presets', kind: 'motion', category: l.family, author: l.director ? `${l.director} · Ambo` : 'Ambo',
      tags: ['ambo', 'scripture', 'verse', l.family, l.background, l.blurb], typeLabel: 'SCRIPTURE · ' + (l.background === 'transparent' ? 'OVERLAY' : 'FULL'),
      preview: { mode: 'motion', motion }, facets: { motionKind: 'scripture', themeSet: scriptureSetOf(l.id) },
    });
  }
  return out;
}

/** A saved / shared / community template → item (null when it cannot be drawn here). */
export function savedTemplateToItem(t: SavedTemplate, source: LibrarySourceId, me?: string): LibraryItem | null {
  let motion: TelaMotionTemplateSpec | null = null;
  if (t.kind === 'scripture-look' && t.look?.layoutId) {
    const SAMPLE = defaultMotionSpec('scripture', t.look.layoutId);
    motion = { ...SAMPLE, accent: t.look.accent || SAMPLE.accent, transition: t.look.transition || SAMPLE.transition, savedTemplateId: t.id, name: t.name };
  } else if ((t.kind === 'ambo-slide' || t.kind === 'tela-motion') && t.baseTemplateId && SLIDE_TEMPLATES.some(s => s.id === t.baseTemplateId)) {
    motion = { kind: 'slide', templateId: t.baseTemplateId, theme: t.theme || 'sanctuary', fields: { ...(t.fields || {}) }, timing: { startOffset: 0 }, savedTemplateId: t.id, name: t.name };
    if (t.overrides && Object.keys(t.overrides).length) motion.overrides = { ...(t.overrides as Record<string, unknown>) };
  }
  if (!motion) return null;
  const isSlide = motion.kind === 'slide';
  const base = isSlide ? SLIDE_TEMPLATES.find(s => s.id === motion!.templateId) : null;
  const look = !isSlide ? SCRIPTURE_LAYOUTS.find(l => l.id === motion!.layoutId) : null;
  const shared = source === 'mine' && me && t.ownerUid !== me && t.ownerUid !== 'local';
  return {
    id: `saved:${source}:${t.id}`, name: t.name || base?.name || look?.name || 'Template', source, kind: 'motion',
    category: base?.category || look?.family || 'Saved', author: shared ? `shared by ${t.ownerName || 'a friend'}` : source === 'community' ? (t.ownerName || 'Community') : 'You',
    tags: ['ambo', 'saved', isSlide ? 'slide' : 'scripture', ...(t.tags || []), t.description || ''].filter(Boolean),
    typeLabel: (isSlide ? 'SLIDE' : 'SCRIPTURE') + (source === 'community' ? ` · ${t.uses || 0} USES` : shared ? ' · SHARED' : ' · SAVED'),
    preview: { mode: 'motion', motion, url: t.thumb },
    facets: { motionKind: isSlide ? 'slide' : 'scripture', themeSet: isSlide ? themeSetOf(motion.theme) : scriptureSetOf(motion.layoutId), saved: true },
  };
}

/** Narrow motion items by facets and apply the preview-theme override (non-motion items pass through). */
export function applyMotionFacets(items: LibraryItem[], f: MotionFacets): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (const it of items) {
    if (it.kind !== 'motion') { out.push(it); continue; }
    const fc = it.facets || {};
    if (f.kind !== 'all' && fc.motionKind !== f.kind) continue;
    if (f.category !== 'all' && it.category !== f.category) continue;
    const m = it.preview.motion;
    // Platform slide templates are theme-agnostic: the set/theme facet re-themes their preview.
    if (fc.motionKind === 'slide' && !fc.saved && m) {
      const theme = f.theme && (f.set === 'all' || themeSetOf(f.theme) === f.set) ? f.theme : f.set !== 'all' && themeSetOf(m.theme) !== f.set ? firstThemeOf(f.set) : m.theme;
      out.push(theme && theme !== m.theme ? { ...it, preview: { ...it.preview, motion: { ...m, theme } }, facets: { ...fc, themeSet: themeSetOf(theme) } } : it);
      continue;
    }
    if (f.set !== 'all' && fc.themeSet !== f.set) continue;
    out.push(it);
  }
  return out;
}

const firstThemeOf = (set: ThemeSet) => themesInSet(set)[0]?.id;

/** Categories present among motion items (for the facet chips). */
export function motionCategories(items: LibraryItem[], kind: MotionKindFacet): string[] {
  const s = new Set<string>();
  for (const it of items) if (it.kind === 'motion' && (kind === 'all' || it.facets?.motionKind === kind) && it.category) s.add(it.category);
  return [...s];
}

/** The spec a "Use" should insert (a fresh copy). */
export function motionSpecFromItem(it: LibraryItem): TelaMotionTemplateSpec | null {
  const m = it.preview.motion;
  return m ? JSON.parse(JSON.stringify(m)) : null;
}
