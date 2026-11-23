// elevateHome — "your organization" for Elevate members.
//
// • Opening Elevate while signed in lands on your org (the one you used last, else the first you joined).
// • Belong to more than one? The org switcher lists every org across the accounts saved on this device
//   (the account roster). Picking an org that belongs to another saved account signs that account in
//   (Google account chooser pre-selected with its email) and then opens the org.
//
// Each roster entry remembers its own Elevate orgs (name/logo only), written while that account is
// signed in — Firestore never lets one account read another's memberships.

import { useEffect, useState } from 'react';
import type { Organization, OrgMembership } from '../types';
import { fetchUserMemberships, fetchOrganization } from './organizationService';
import { isElevateOrg } from './elevateTemplates';
import { loadRoster, saveRoster } from './accountRoster';

export interface MyOrg { org: Organization; membership: OrgMembership }
export interface SwitchableOrg { orgId: string; name: string; logoUrl?: string; uid: string; email: string; current: boolean }

// ── This account's Elevate orgs ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, Promise<MyOrg[]>>();
const CHANGED = 'plajah:elevate-home';

async function load(uid: string): Promise<MyOrg[]> {
  const ms = (await fetchUserMemberships(uid)).filter(m => m.status === 'ACTIVE').sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const out: MyOrg[] = [];
  const seen = new Set<string>();
  for (const m of ms) {
    if (seen.has(m.orgId)) continue;
    seen.add(m.orgId);
    const org = await fetchOrganization(m.orgId).catch(() => null);
    if (org && isElevateOrg(org.orgType)) out.push({ org, membership: m });
  }
  return out;
}

export function invalidateMyOrgs(uid?: string): void {
  if (uid) cache.delete(uid); else cache.clear();
  window.dispatchEvent(new CustomEvent(CHANGED));
}

export function useMyElevateOrgs(uid: string | undefined): { orgs: MyOrg[]; loaded: boolean } {
  const [state, setState] = useState<{ orgs: MyOrg[]; loaded: boolean }>({ orgs: [], loaded: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick(t => t + 1);
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, []);
  useEffect(() => {
    if (!uid) { setState({ orgs: [], loaded: true }); return; }
    let alive = true;
    setState(s => ({ ...s, loaded: false }));
    if (!cache.has(uid)) cache.set(uid, load(uid).catch(() => { cache.delete(uid); return []; }));
    cache.get(uid)!.then(orgs => { if (alive) setState({ orgs, loaded: true }); });
    return () => { alive = false; };
  }, [uid, tick]);
  return state;
}

// ── The org you used last (per account, this device) ───────────────────────────────────────────────

const lastKey = (uid: string) => `plajah_elevate_last_org_v1:${uid}`;
export function getLastOrgId(uid: string): string | null {
  try { return localStorage.getItem(lastKey(uid)); } catch { return null; }
}
export function setLastOrgId(uid: string, orgId: string): void {
  try { localStorage.setItem(lastKey(uid), orgId); } catch { /* private mode */ }
}
/** The org Elevate opens on: the last one used if still a member, else the first joined. */
export function pickHomeOrg(uid: string | undefined, orgs: MyOrg[]): MyOrg | null {
  if (!uid || !orgs.length) return null;
  const last = getLastOrgId(uid);
  return orgs.find(o => o.org.id === last) || orgs[0];
}

// ── Orgs across every account saved on this device ───────────────────────────────────────────────

type RosterOrg = { id: string; name: string; logoUrl?: string };

/** Remember this account's orgs on its roster entry so other accounts' switchers can list them. */
export function rememberRosterOrgs(uid: string, orgs: MyOrg[]): void {
  const list = loadRoster();
  const me = list.find(a => a.uid === uid) as (ReturnType<typeof loadRoster>[number] & { orgs?: RosterOrg[] }) | undefined;
  if (!me) return;
  const next: RosterOrg[] = orgs.map(o => ({ id: o.org.id, name: o.org.name, ...(o.org.logoUrl ? { logoUrl: o.org.logoUrl } : {}) }));
  if (JSON.stringify(me.orgs || []) === JSON.stringify(next)) return;
  me.orgs = next;
  saveRoster(list);
}

export function switchableOrgs(currentUid: string | undefined, mine: MyOrg[]): SwitchableOrg[] {
  const out: SwitchableOrg[] = [];
  const roster = loadRoster() as (ReturnType<typeof loadRoster>[number] & { orgs?: RosterOrg[] })[];
  const meEmail = roster.find(a => a.uid === currentUid)?.email || '';
  mine.forEach(o => out.push({ orgId: o.org.id, name: o.org.name, logoUrl: o.org.logoUrl, uid: currentUid || '', email: meEmail, current: true }));
  roster.filter(a => a.uid !== currentUid).forEach(a => (a.orgs || []).forEach(o => {
    // The same org reachable from the signed-in account wins (no account switch needed).
    if (out.some(x => x.orgId === o.id && x.current)) return;
    out.push({ orgId: o.id, name: o.name, logoUrl: o.logoUrl, uid: a.uid, email: a.email, current: false });
  }));
  return out;
}

// ── Opening an org that belongs to another saved account ─────────────────────────────────────────

const PENDING = 'plajah_pending_org_v1';

export function setPendingOrg(orgId: string, uid: string): void {
  try { sessionStorage.setItem(PENDING, JSON.stringify({ orgId, uid, at: Date.now() })); } catch { /* */ }
}
/** The org to open now that `uid` is signed in (taken once; 10-minute window). */
export function takePendingOrg(uid: string): string | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
    if (!p?.orgId || Date.now() - (p.at || 0) > 10 * 60_000) { sessionStorage.removeItem(PENDING); return null; }
    if (p.uid !== uid) return null;
    sessionStorage.removeItem(PENDING);
    return p.orgId;
  } catch { return null; }
}

/** Open an org from the switcher. Same account → just open it; another account → sign that one in first. */
export async function openSwitchableOrg(o: SwitchableOrg): Promise<void> {
  if (o.current) {
    if (o.uid) setLastOrgId(o.uid, o.orgId);
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ORG_HUB', params: { orgId: o.orgId, fromElevate: true } } }));
    return;
  }
  setPendingOrg(o.orgId, o.uid);
  setLastOrgId(o.uid, o.orgId);
  const { loginWithGoogle } = await import('./backendService');
  await loginWithGoogle(o.email);
}
