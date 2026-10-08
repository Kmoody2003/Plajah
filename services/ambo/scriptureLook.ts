// scriptureLook — the operator's chosen scripture layout, transition and accent.
//
// The presenter stamps these onto SCRIPTURE content as it goes on air (so
// mesh devices get them over the wire); same-origin output windows also stay
// in step through the storage event, so a look change repaints every screen.

import { DEFAULT_SCRIPTURE_LAYOUT, scriptureLayoutById, transitionById } from './scriptureLayouts';

/** Canvas blend modes offered for composing a look's background art onto what's beneath it. */
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'lighten', 'darken', 'color-dodge', 'luminosity', 'color'] as const;
export type BlendMode = typeof BLEND_MODES[number];

export interface ScriptureLook {
  layoutId: string;
  /** Entrance/exit when scripture comes up from clear or is cleared. */
  transition: string;
  /** Text-only transition between verses — the background stays up. */
  verseTransition: string;
  accent: string;
  /** How the look's background art composes onto the layers below (generator, video…). */
  bgBlend: BlendMode;
  bgOpacity: number;
}

const KEY = 'ambo_scripture_look_v1';
const DEFAULTS: ScriptureLook = { layoutId: DEFAULT_SCRIPTURE_LAYOUT, transition: 'crossfade', verseTransition: 'crossfade', accent: '#D4AF37', bgBlend: 'normal', bgOpacity: 1 };

function read(): ScriptureLook {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }; } catch { /* */ }
  return { ...DEFAULTS };
}

let look = read();
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) { try { fn(); } catch { /* */ } } };

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) { look = read(); emit(); } });
}

export const getScriptureLook = () => look;
export function setScriptureLook(patch: Partial<ScriptureLook>) {
  look = { ...look, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* */ }
  emit();
}
export function subscribeScriptureLook(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Fill any missing look fields on SCRIPTURE content (the on-air stamp). */
export function stampScripture<T extends { kind: string }>(content: T): T {
  if (content.kind !== 'SCRIPTURE') return content;
  const c: any = content;
  if (c.layoutId && c.transition && c.accent && c.verseTransition && c.bgBlend) return content;
  return {
    ...c,
    layoutId: c.layoutId ?? look.layoutId, transition: c.transition ?? look.transition, accent: c.accent ?? look.accent,
    verseTransition: c.verseTransition ?? look.verseTransition, bgBlend: c.bgBlend ?? look.bgBlend, bgOpacity: c.bgOpacity ?? look.bgOpacity,
  };
}

/** Make a saved look (mine, shared with me, or from the community) the current look. Values are checked, never trusted. */
export function applySavedLook(l: { layoutId?: string; transition?: string; verseTransition?: string; accent?: string; bgBlend?: string; bgOpacity?: number } | undefined): boolean {
  if (!l?.layoutId) return false;
  const patch: Partial<ScriptureLook> = { layoutId: scriptureLayoutById(l.layoutId).id };
  if (l.transition) patch.transition = transitionById(l.transition).id;
  if (l.verseTransition) patch.verseTransition = transitionById(l.verseTransition).id;
  if (l.accent && /^#[0-9a-f]{3,8}$/i.test(l.accent)) patch.accent = l.accent;
  if (l.bgBlend && (BLEND_MODES as readonly string[]).includes(l.bgBlend)) patch.bgBlend = l.bgBlend as BlendMode;
  if (typeof l.bgOpacity === 'number' && isFinite(l.bgOpacity)) patch.bgOpacity = Math.min(1, Math.max(0, l.bgOpacity));
  setScriptureLook(patch);
  return true;
}
