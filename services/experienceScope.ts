// experienceScope — how much of Plajah the left pillar shows someone right now.
//
//   • 'elevate'  came in through an Elevate door (church / nonprofit invite, claim, join). The pillar shows
//                their org (pinned department, org pages) plus a short "Pinned · Discover" list. No creative
//                tools. Stays until they tap "Show all of Plajah".
//   • 'starter'  a new account that chose "Start simple" at sign-up (the default): Social, Chora, Reello,
//                Cinema, Lorea and Museion, plus their own profile/messages, for the first STARTER_DAYS.
//   • 'full'     everything (today's sidebar). Chosen at sign-up ("Full Pro experience"), reached by tapping
//                "Show all of Plajah", or automatically when the starter week is over.
//
// Accounts that existed before this shipped have no `navScope`, so they stay 'full' — except Elevate-door
// accounts (`elevateHome`), which get the Elevate scope as the feedback asked.
//
// Ads: on Elevate pages (and for Elevate-scoped people) the side rail shows the org's own news. Regular
// ads only join the rotation once the account is ORG_ADS_ONLY_DAYS old (see orgAdsOnly).

import { useEffect, useState } from 'react';

export type NavScope = 'elevate' | 'starter' | 'full';

export const STARTER_DAYS = 7;
export const ORG_ADS_ONLY_DAYS = 30;
const DAY = 86_400_000;

/** Sidebar ids the week-one starter pillar shows. */
export const STARTER_NAV: readonly string[] = ['FEED', 'MUSIC', 'VIDEOS', 'MOVIES_TV', 'BOOKS', 'PLAJAH_LABS', 'USER_PROFILE', 'CHAT', 'POSTMAN', 'HELP_CENTER'];
/** "Pinned · Discover" under the org block for Elevate-scoped people. */
export const ELEVATE_DISCOVER_NAV: readonly string[] = ['FEED', 'USER_PROFILE', 'CHAT', 'POSTMAN', 'PLAJAH_ELEVATE', 'HELP_CENTER'];

export interface ScopeProfile {
  navScope?: NavScope;
  navScopeSince?: number;
  elevateHome?: boolean;
  createdAt?: number;
  isChild?: boolean;
  accountType?: string;
}

// "Show all" works instantly on this device even before the profile write lands (or when signed out).
const LOCAL_FULL_KEY = 'plajah_nav_scope_full_v1';
const SCOPE_EVENT = 'plajah:nav-scope';

export function localShowAll(): boolean {
  try { return localStorage.getItem(LOCAL_FULL_KEY) === '1'; } catch { return false; }
}
export function setLocalShowAll(on: boolean): void {
  try { on ? localStorage.setItem(LOCAL_FULL_KEY, '1') : localStorage.removeItem(LOCAL_FULL_KEY); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(SCOPE_EVENT));
}
/** Re-render on local scope changes (Show all, sign-up choice). */
export function useScopeTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN(x => x + 1);
    window.addEventListener(SCOPE_EVENT, on);
    return () => window.removeEventListener(SCOPE_EVENT, on);
  }, []);
  return n;
}

export function accountAgeDays(p: ScopeProfile | null | undefined, authCreatedAt?: number, now = Date.now()): number | null {
  const created = p?.createdAt || authCreatedAt;
  if (!created || !Number.isFinite(created)) return null;
  return Math.max(0, (now - created) / DAY);
}

export function resolveNavScope(
  p: ScopeProfile | null | undefined,
  opts: { elevateDoor?: boolean; now?: number } = {},
): NavScope {
  if (!p || localShowAll()) return 'full';
  if (p.isChild || p.accountType === 'CHILD') return 'full'; // kids have their own curated shell
  const now = opts.now ?? Date.now();
  if (p.navScope === 'full') return 'full';
  if (p.navScope === 'elevate') return 'elevate';
  if (p.navScope === 'starter') {
    const since = p.navScopeSince || p.createdAt || now;
    return now - since < STARTER_DAYS * DAY ? 'starter' : 'full';
  }
  // No choice recorded: only Elevate-door accounts are scoped.
  if (p.elevateHome || opts.elevateDoor) return 'elevate';
  return 'full';
}

/** Days left in the starter week (1..STARTER_DAYS), or null outside it. */
export function starterDay(p: ScopeProfile | null | undefined, now = Date.now()): { day: number; of: number } | null {
  if (p?.navScope !== 'starter') return null;
  const since = p.navScopeSince || p.createdAt;
  if (!since) return null;
  const day = Math.floor((now - since) / DAY) + 1;
  return day >= 1 && day <= STARTER_DAYS ? { day, of: STARTER_DAYS } : null;
}

/** Can this sidebar id show under the scope? (null = no restriction) */
export function scopeAllowedNav(scope: NavScope): Set<string> | null {
  if (scope === 'starter') return new Set(STARTER_NAV);
  if (scope === 'elevate') return new Set(ELEVATE_DISCOVER_NAV);
  return null;
}

/** Org pages / Elevate people: the side rail is org news only until the account is a month old. */
export function orgAdsOnly(p: ScopeProfile | null | undefined, authCreatedAt?: number, now = Date.now()): boolean {
  const age = accountAgeDays(p, authCreatedAt, now);
  return age === null || age < ORG_ADS_ONLY_DAYS;
}

// ── Opening a tab / department on the org page from outside it (the left pillar) ─────────────────

export type OrgPageTarget = { orgId: string; tab?: string; ministryId?: string };
export const ORG_PAGE_EVENT = 'plajah:open-org-page';
let pending: OrgPageTarget | null = null;

/** Ask the org page to show a tab or department; App switches the view to ORG_HUB. */
export function requestOrgPage(t: OrgPageTarget): void {
  pending = t;
  window.dispatchEvent(new CustomEvent(ORG_PAGE_EVENT, { detail: t }));
}
/** The org page takes a request made before it mounted (once). */
export function takePendingOrgPage(orgId: string): OrgPageTarget | null {
  if (pending && pending.orgId === orgId) { const t = pending; pending = null; return t; }
  return null;
}
