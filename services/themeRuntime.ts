/**
 * Theme runtime: one place that decides which ThemeSpec is in force and tells the app.
 *
 * PRECEDENCE — the person's own choices always win:
 *   1. their personal custom theme (ThemeSpec saved in Settings)            → used as is
 *   2. otherwise, while on an org's pages, that org's theme (colours, background, pack) —
 *      unless they turned org themes off (everywhere, or for that org)
 *   3. otherwise nothing: plain built-in theme
 * An org theme NEVER changes the visitor's Light/Dark/Pastel/… base look (that is theirs, set in
 * Settings → Appearance); it only adds the org's accent colours, background and pack.
 *
 * App.tsx feeds the user's spec in; OrgHub feeds the org's in while its page is open.
 */
import { useSyncExternalStore } from 'react';
import type { ThemeSpec, ThemeType } from '../types';

let userSpec: ThemeSpec | null = null;
let userBase: ThemeType | null = null;
let orgScope: { orgId: string; spec: ThemeSpec } | null = null;
/** Unsaved edits in a Theme Studio: shown live, above everything, until saved or abandoned. */
let previewSpec: ThemeSpec | null = null;
let previewDerived: { src: ThemeSpec; base: ThemeType | null; out: ThemeSpec } | null = null;
const listeners = new Set<() => void>();
let snapshot: ThemeSpec | null = null;
let orgDerived: { src: ThemeSpec; base: ThemeType | null; out: ThemeSpec } | null = null;

const optOutKey = (orgId: string) => `pj:org-theme-optout:${orgId}`;
/** `*` = the visitor turned org themes off everywhere; otherwise per-org. */
export const isOrgThemeOptedOut = (orgId: string) => {
  try { return localStorage.getItem(optOutKey('*')) === '1' || localStorage.getItem(optOutKey(orgId)) === '1'; } catch { return false; }
};
export function setOrgThemeOptOut(orgId: string, out: boolean) {
  try { out ? localStorage.setItem(optOutKey(orgId), '1') : localStorage.removeItem(optOutKey(orgId)); } catch { /* private mode */ }
  recompute();
}

/** The org's spec re-based on the visitor's own look. Memoised so the snapshot is referentially stable. */
function orgFor(spec: ThemeSpec): ThemeSpec {
  if (orgDerived && orgDerived.src === spec && orgDerived.base === userBase) return orgDerived.out;
  const out: ThemeSpec = { ...spec, base: userBase ?? spec.base };
  orgDerived = { src: spec, base: userBase, out };
  return out;
}

function previewFor(spec: ThemeSpec): ThemeSpec {
  if (previewDerived && previewDerived.src === spec && previewDerived.base === userBase) return previewDerived.out;
  const out: ThemeSpec = { ...spec, base: userBase ?? spec.base };
  previewDerived = { src: spec, base: userBase, out };
  return out;
}

function recompute() {
  let next: ThemeSpec | null = null;
  if (previewSpec) next = previewFor(previewSpec);                                   // 0. live, unsaved edits
  else if (userSpec) next = userSpec;                                                     // 1. my own theme wins
  else if (orgScope && !isOrgThemeOptedOut(orgScope.orgId)) next = orgFor(orgScope.spec); // 2. org fallback
  if (next !== snapshot) { snapshot = next; listeners.forEach(l => l()); }
}

/** Live preview of a spec being edited. Pass null to drop it (after save, or when the editor closes). */
export function setPreviewThemeSpec(spec: ThemeSpec | null) { previewSpec = spec; recompute(); }
export function setUserThemeSpec(spec: ThemeSpec | null | undefined) { userSpec = spec ?? null; recompute(); }
/** The visitor's own base look, so an org theme can never flip it. */
export function setUserBaseTheme(base: ThemeType | null) { if (base !== userBase) { userBase = base; recompute(); } }
export function setOrgThemeScope(orgId: string | null, spec: ThemeSpec | null | undefined) {
  orgScope = orgId && spec ? { orgId, spec } : null;
  recompute();
}
export const getEffectiveThemeSpec = () => snapshot;
export const getActiveOrgThemeId = () => orgScope?.orgId ?? null;
/** True when the spec in force came from the org (so the UI can say so and offer "turn off"). */
export const isOrgThemeActive = () => !!orgScope && !userSpec && !isOrgThemeOptedOut(orgScope.orgId);

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useEffectiveThemeSpec = (): ThemeSpec | null => useSyncExternalStore(subscribe, getEffectiveThemeSpec, getEffectiveThemeSpec);

// ── Platform look, for self-themed surfaces (Lorea, games, studios) ───────────
export type BodyLook = 'light' | 'pastel' | 'dark' | 'plajah' | 'nebula' | 'citrus' | 'ethereal' | 'tv';

export function currentBodyLook(): BodyLook {
  if (typeof document === 'undefined') return 'plajah';
  const c = document.body.classList;
  if (c.contains('theme-light')) return 'light';
  if (c.contains('theme-pastel')) return 'pastel';
  if (c.contains('theme-nebula')) return 'nebula';
  if (c.contains('theme-citrus')) return 'citrus';
  if (c.contains('theme-ethereal')) return 'ethereal';
  if (c.contains('theme-plajah')) return 'plajah';
  if (c.contains('theme-big-screen') || c.contains('theme-phone')) return 'tv';
  return 'dark'; // DARK is the class-less default
}

let bodyObs: MutationObserver | null = null;
const bodyListeners = new Set<() => void>();
const subscribeBody = (l: () => void) => {
  bodyListeners.add(l);
  if (!bodyObs && typeof document !== 'undefined') {
    bodyObs = new MutationObserver(() => bodyListeners.forEach(f => f()));
    bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  return () => {
    bodyListeners.delete(l);
    if (!bodyListeners.size && bodyObs) { bodyObs.disconnect(); bodyObs = null; }
  };
};
/** The platform theme currently on <body>; re-renders when it changes. */
export const useBodyLook = (): BodyLook => useSyncExternalStore(subscribeBody, currentBodyLook, () => 'plajah');
