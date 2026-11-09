// STEM → Plajah Build launch contract.
//
// A lesson, project or Museion lab asks for a Build room by parking the request in
// sessionStorage['plajah:pendingBuild'] and then dispatching `plajah:openBuild` with the same JSON as the detail.
// App.tsx listens and switches the view to PLAJAH_BUILD; the Build hub (components/build/*, owned by the Build
// Studio work) reads the parked request on mount, or live from the event if it is already open.
//
// validateLaunch() is what the tests run over every lesson and project: a launch must name a real room, and any
// recipe / pattern / bio-starter / studio-shape id must resolve, so no student lands in an empty room.

import type { BuildLaunch, BuildRoom } from '../../data/stem/types';
import { recipeById } from '../elec/recipes';
import { softTemplateById } from '../soft/patterns';
import { STARTERS } from '../bio/models';

export const OPEN_BUILD_EVENT = 'plajah:openBuild';
export const PENDING_BUILD_KEY = 'plajah:pendingBuild';
export const BUILD_ROOMS: BuildRoom[] = ['elec', 'cad', 'sew', 'bio', 'exchange', 'studio'];
export const BUILD_ROOM_LABEL: Record<BuildRoom, string> = {
  elec: 'Electronics Lab', cad: 'CAD & Make', sew: 'Sewing & Plush', bio: 'Biology Lab', exchange: 'Maker Exchange', studio: 'Build Studio',
};

/** Build Studio's primitive shape kinds (components/build/studio, services/build/studio/shapes.ts ShapeKind). */
export const STUDIO_SHAPES = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'wedge', 'pyramid', 'text', 'star', 'heart'] as const;

/** Electronics recipes that are never a student starter: anything touching mains. */
export const ADULT_ONLY_RECIPES = new Set(['charger']);

export function validateLaunch(l: BuildLaunch): string[] {
  const errs: string[] = [];
  if (!BUILD_ROOMS.includes(l.room)) errs.push(`unknown room "${l.room}"`);
  if (l.room === 'elec') {
    if (!l.template && !l.prompt) errs.push('elec launch needs a recipe template or a describe-it prompt');
    if (l.template && !recipeById(l.template)) errs.push(`unknown elec recipe "${l.template}"`);
    if (l.template && ADULT_ONLY_RECIPES.has(l.template)) errs.push(`recipe "${l.template}" touches mains and is never a student starter`);
  }
  if (l.room === 'sew' && l.template && !softTemplateById(l.template)) errs.push(`unknown sewing template "${l.template}"`);
  if (l.room === 'bio' && l.template && !STARTERS.some(s => s.id === l.template)) errs.push(`unknown bio starter "${l.template}"`);
  if (l.room === 'studio') {
    for (const s of l.starter?.shapes || []) if (!(STUDIO_SHAPES as readonly string[]).includes(s)) errs.push(`unknown studio shape "${s}"`);
    if (!l.prompt && !l.starter?.shapes?.length) errs.push('studio launch needs a prompt or starter shapes');
  }
  if ((l.room === 'cad' || l.room === 'exchange') && !l.prompt) errs.push(`${l.room} launch needs a prompt`);
  return errs;
}

/** Open Plajah Build on a room with a starter. Safe outside the browser (no-op). */
export function openBuild(launch: BuildLaunch): void {
  if (typeof window === 'undefined') return;
  const detail: BuildLaunch = { ...launch };
  try { sessionStorage.setItem(PENDING_BUILD_KEY, JSON.stringify(detail)); } catch { /* private mode: the event still carries it */ }
  window.dispatchEvent(new CustomEvent(OPEN_BUILD_EVENT, { detail }));
}

/** Open the STEM track view, optionally on a tab / unit / lesson / project. */
export type StemTab = 'MAP' | 'UNITS' | 'PROJECTS' | 'WALL';
export interface StemOpen { tab?: StemTab; band?: string; unitId?: string; lessonId?: string; projectId?: string }
export const STEM_OPEN_EVENT = 'plajah:stem:open';
export const PENDING_STEM_KEY = 'plajah:pendingStem';

export function openStemTrack(req: StemOpen = {}): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(PENDING_STEM_KEY, JSON.stringify(req)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent(STEM_OPEN_EVENT, { detail: req }));
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'STEM_TRACK' } }));
}

export function takePendingStemOpen(): StemOpen | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STEM_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_STEM_KEY);
    return JSON.parse(raw) as StemOpen;
  } catch { return null; }
}
