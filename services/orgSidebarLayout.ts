// Org default sidebar layouts.
//
// An org can publish a default sidebar: which sections of the site show in the left rail while
// someone is on that org's page. It is only a default — each person can switch to their own
// layout or customize the org's one, and that choice is remembered per org (users/{uid}/prefs/orgSidebar,
// owner-only, so the list of orgs someone visits never lands on their public profile).
//
// The org page (OrgHub › OrgProfile) announces itself with setActiveOrgSidebar(); App.tsx reads it
// through useActiveOrgSidebar() and filters the rail. Leaving the org page clears it.

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Organization, OrgMembership } from '../types';

/** Stored on organizations/{orgId}.sidebarDefault. */
export interface OrgSidebarDefault {
  /** Off = members see their own sidebar on the org page, as before. */
  enabled: boolean;
  /** Section ids (App nav ids, e.g. 'MUSIC') turned OFF in the org's default. */
  hidden: string[];
  updatedAt?: number;
  updatedBy?: string;
}

/** A person's choice for one org's page. */
export type OrgSidebarChoice =
  | { mode: 'org' }
  | { mode: 'mine' }
  | { mode: 'custom'; hidden: string[] };

export interface SidebarSection { id: string; label: string; group: string }

/** The sidebar sections an org can turn on and off, grouped as in the grouped nav. */
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: 'USER_PROFILE', label: 'My Profile', group: 'Discover' },
  { id: 'DASHBOARD', label: 'Front Row', group: 'Discover' },
  { id: 'FEED', label: 'Plajah Social', group: 'Discover' },
  { id: 'WORLDS', label: 'Worlds', group: 'Discover' },
  { id: 'SEARCH', label: 'Find People', group: 'Discover' },
  { id: 'MUSIC', label: 'Chora', group: 'Entertainment' },
  { id: 'VIDEOS', label: 'Reello', group: 'Entertainment' },
  { id: 'MOVIES_TV', label: 'Cinema', group: 'Entertainment' },
  { id: 'RADIO', label: 'Radio', group: 'Entertainment' },
  { id: 'GAMES', label: 'Games', group: 'Entertainment' },
  { id: 'APPS', label: 'Apps', group: 'Entertainment' },
  { id: 'GLOBAL_PHOTOS', label: 'Photos', group: 'Entertainment' },
  { id: 'PLAJAH_SPORTS', label: 'Plajah Sports', group: 'Sports & News' },
  { id: 'HEALTH_FITNESS', label: 'Health & Fitness', group: 'Sports & News' },
  { id: 'ARTICLES', label: 'The Newstand', group: 'Sports & News' },
  { id: 'BOOKS', label: 'Lorea', group: 'Education' },
  { id: 'CLASSROOMS', label: 'Plajah Academia', group: 'Education' },
  { id: 'PLAJAH_LABS', label: 'Museion', group: 'Education' },
  { id: 'CLUBS', label: 'Clubs', group: 'Community' },
  { id: 'CHAT', label: 'Chat', group: 'Community' },
  { id: 'DISCUSSION', label: 'Discussion', group: 'Community' },
  { id: 'PLAJAH_ELEVATE', label: 'Plajah Elevate', group: 'Community' },
  { id: 'SACRED_LIBRARY', label: 'Sacred Library', group: 'Community' },
  { id: 'CHARITY', label: 'Charity', group: 'Community' },
  { id: 'PAY_IT_FORWARD', label: 'Pay It Forward', group: 'Community' },
  { id: 'SANCTUARY_HUB', label: 'Backstage', group: 'Community' },
  { id: 'STORE_HUB', label: 'Plajah Store', group: 'Community' },
  { id: 'CREATOR', label: 'Creator Hub', group: 'Creator Tools' },
  { id: 'ARTIST_MANAGER', label: 'Chora Artist Manager', group: 'Creator Tools' },
  { id: 'PLAJAH_STUDIO', label: 'Marketing', group: 'Creator Tools' },
  { id: 'BUSINESS_DASHBOARD', label: 'Plajah Business', group: 'Creator Tools' },
  { id: 'TERRA', label: 'Terra', group: 'Creator Tools' },
  { id: 'AD_PACKAGES', label: 'Promote', group: 'Creator Tools' },
  { id: 'LIVE_HUB', label: 'Live Hub', group: 'Creator Tools' },
  { id: 'FABULA', label: 'Fabula', group: 'Creator Tools' },
  { id: 'PLAJAH_BUILD', label: 'Plajah Build', group: 'Creator Tools' },
  { id: 'TV_STUDIO', label: 'TV Studio', group: 'Creator Tools' },
  { id: 'AMBO_PRO', label: 'Stage', group: 'Creator Tools' },
  { id: 'MEDIA_ROUTER', label: 'Router & Switcher', group: 'Creator Tools' },
  { id: 'POSTMAN', label: 'The Postman', group: 'Creator Tools' },
  { id: 'PLAJAH_HOME', label: 'Plajah Home', group: 'Platform' },
  { id: 'HELP_CENTER', label: 'Help Center', group: 'Platform' },
  { id: 'BROWSER', label: 'Partner Sites', group: 'Platform' },
];

export const SIDEBAR_SECTION_IDS = new Set(SIDEBAR_SECTIONS.map(s => s.id));

export function groupSections(sections: SidebarSection[] = SIDEBAR_SECTIONS): { group: string; items: SidebarSection[] }[] {
  const out: { group: string; items: SidebarSection[] }[] = [];
  for (const s of sections) {
    let g = out.find(x => x.group === s.group);
    if (!g) { g = { group: s.group, items: [] }; out.push(g); }
    g.items.push(s);
  }
  return out;
}

/** One-click starting points for the org editor. */
export const SIDEBAR_PRESETS: { key: string; label: string; hint: string; visible: string[] | 'all' }[] = [
  { key: 'all', label: 'Everything', hint: 'The full site', visible: 'all' },
  {
    key: 'community', label: 'Community focus', hint: 'Church / nonprofit essentials',
    visible: ['USER_PROFILE', 'FEED', 'SEARCH', 'MUSIC', 'VIDEOS', 'RADIO', 'GLOBAL_PHOTOS', 'BOOKS', 'CLASSROOMS', 'CLUBS', 'CHAT', 'DISCUSSION', 'PLAJAH_ELEVATE', 'SACRED_LIBRARY', 'CHARITY', 'STORE_HUB', 'LIVE_HUB', 'POSTMAN', 'HELP_CENTER'],
  },
  {
    key: 'learning', label: 'Learning', hint: 'Classes and reading first',
    visible: ['USER_PROFILE', 'FEED', 'SEARCH', 'BOOKS', 'CLASSROOMS', 'PLAJAH_LABS', 'ARTICLES', 'SACRED_LIBRARY', 'CLUBS', 'CHAT', 'DISCUSSION', 'PLAJAH_ELEVATE', 'POSTMAN', 'HELP_CENTER'],
  },
  {
    key: 'minimal', label: 'Minimal', hint: 'Just the basics',
    visible: ['USER_PROFILE', 'FEED', 'CHAT', 'PLAJAH_ELEVATE', 'HELP_CENTER'],
  },
];

export function presetHidden(visible: string[] | 'all'): string[] {
  if (visible === 'all') return [];
  const keep = new Set(visible);
  return SIDEBAR_SECTIONS.map(s => s.id).filter(id => !keep.has(id));
}

/**
 * Sections to hide right now, or null when the person's own sidebar applies unchanged.
 * Ids outside SIDEBAR_SECTIONS are never touched by an org layout.
 */
export function resolveOrgHiddenSections(layout: OrgSidebarDefault | undefined | null, choice: OrgSidebarChoice): Set<string> | null {
  if (!layout?.enabled) return null;
  if (choice.mode === 'mine') return null;
  const hidden = choice.mode === 'custom' ? choice.hidden : layout.hidden || [];
  return new Set(hidden.filter(id => SIDEBAR_SECTION_IDS.has(id)));
}

// ── The org page currently on screen ─────────────────────────────────────────

export interface ActiveOrgSidebar {
  orgId: string;
  orgName: string;
  layout?: OrgSidebarDefault | null;
  /** The org on screen and the viewer's membership in it — the Elevate pillar pins their departments from it. */
  org?: Organization;
  membership?: OrgMembership | null;
}

const ACTIVE_EVENT = 'plajah:org-sidebar';
let active: ActiveOrgSidebar | null = null;

export function setActiveOrgSidebar(next: ActiveOrgSidebar | null): void {
  active = next;
  window.dispatchEvent(new CustomEvent(ACTIVE_EVENT, { detail: next }));
}

export function useActiveOrgSidebar(): ActiveOrgSidebar | null {
  const [cur, setCur] = useState<ActiveOrgSidebar | null>(active);
  useEffect(() => {
    const on = (e: Event) => setCur((e as CustomEvent<ActiveOrgSidebar | null>).detail ?? null);
    window.addEventListener(ACTIVE_EVENT, on);
    setCur(active);
    return () => window.removeEventListener(ACTIVE_EVENT, on);
  }, []);
  return cur;
}

// ── Each person's choice, per org ────────────────────────────────────────────

type ChoiceMap = Record<string, OrgSidebarChoice>;
const LS_KEY = 'plajah_org_sidebar_choice_v1';
const CHOICE_EVENT = 'plajah:org-sidebar-choice';

function readLocal(): ChoiceMap {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { return {}; }
}
function writeLocal(map: ChoiceMap) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* storage full / private mode */ }
}
const prefsRef = (uid: string) => doc(db, 'users', uid, 'prefs', 'orgSidebar');

let loadedFor: string | null = null;
async function pullCloud(uid: string) {
  if (loadedFor === uid) return;
  loadedFor = uid;
  try {
    const snap = await getDoc(prefsRef(uid));
    const cloud = (snap.exists() ? (snap.data().choices as ChoiceMap) : null) || {};
    // Cloud is the record; anything chosen offline before sign-in is kept on top.
    const merged = { ...cloud, ...readLocal() };
    writeLocal(merged);
    window.dispatchEvent(new CustomEvent(CHOICE_EVENT));
  } catch { loadedFor = null; }
}

export function useOrgSidebarChoice(uid: string | undefined, orgId: string | undefined): [OrgSidebarChoice, (c: OrgSidebarChoice) => void] {
  const [map, setMap] = useState<ChoiceMap>(readLocal);
  useEffect(() => {
    const on = () => setMap(readLocal());
    window.addEventListener(CHOICE_EVENT, on);
    return () => window.removeEventListener(CHOICE_EVENT, on);
  }, []);
  useEffect(() => { if (uid) void pullCloud(uid); }, [uid]);

  const choice: OrgSidebarChoice = (orgId && map[orgId]) || { mode: 'org' };
  const setChoice = useCallback((c: OrgSidebarChoice) => {
    if (!orgId) return;
    const next = { ...readLocal() };
    if (c.mode === 'org') delete next[orgId]; else next[orgId] = c;
    writeLocal(next);
    setMap(next);
    window.dispatchEvent(new CustomEvent(CHOICE_EVENT));
    if (uid) setDoc(prefsRef(uid), { choices: next, updatedAt: Date.now() }).catch(() => {});
  }, [uid, orgId]);
  return [choice, setChoice];
}
