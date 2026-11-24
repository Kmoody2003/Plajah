/**
 * Theme runtime: one place that decides which ThemeSpec is in force and tells the app.
 *
 *   effective = org theme (while on that org's pages, unless the visitor opted out)
 *               ?? the user's own theme
 *               ?? none (plain built-in theme)
 *
 * App.tsx feeds the user's spec in; OrgHub feeds the org's in while its page is open.
 * Nothing here touches the DOM directly except through applyPalette — components subscribe.
 */
import { useSyncExternalStore } from 'react';
import type { ThemeSpec } from '../types';

let userSpec: ThemeSpec | null = null;
let orgScope: { orgId: string; spec: ThemeSpec } | null = null;
const listeners = new Set<() => void>();
let snapshot: ThemeSpec | null = null;

const optOutKey = (orgId: string) => `pj:org-theme-optout:${orgId}`;
/** `*` = the visitor turned org themes off everywhere; otherwise per-org. */
export const isOrgThemeOptedOut = (orgId: string) => {
  try { return localStorage.getItem(optOutKey('*')) === '1' || localStorage.getItem(optOutKey(orgId)) === '1'; } catch { return false; }
};
export function setOrgThemeOptOut(orgId: string, out: boolean) {
  try { out ? localStorage.setItem(optOutKey(orgId), '1') : localStorage.removeItem(optOutKey(orgId)); } catch { /* private mode */ }
  recompute();
}

function recompute() {
  const next = orgScope && !isOrgThemeOptedOut(orgScope.orgId) ? orgScope.spec : userSpec;
  if (next !== snapshot) { snapshot = next; listeners.forEach(l => l()); }
}

export function setUserThemeSpec(spec: ThemeSpec | null | undefined) { userSpec = spec ?? null; recompute(); }
export function setOrgThemeScope(orgId: string | null, spec: ThemeSpec | null | undefined) {
  orgScope = orgId && spec ? { orgId, spec } : null;
  recompute();
}
export const getEffectiveThemeSpec = () => snapshot;
export const getActiveOrgThemeId = () => orgScope?.orgId ?? null;

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useEffectiveThemeSpec = (): ThemeSpec | null => useSyncExternalStore(subscribe, getEffectiveThemeSpec, getEffectiveThemeSpec);
