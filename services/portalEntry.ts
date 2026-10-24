// portalEntry — the doors on the landing page and where each one lands.
//
// Plajah has five ways in: Personal (the regular profile/home), Academia, Elevate, Business & Work
// and Productions. Each door's sign-in leads to that door's hub; someone already signed in who taps
// a door goes straight there. A sign-in started at a door is remembered in sessionStorage so the
// redirect flows (Android, popup-blocked browsers) still land in the right place after the reload.
//
// Elevate is sticky: someone who came in through the Elevate door gets the Elevate landing as their
// default view from then on, whichever login they use later (localStorage + `elevateHome` on the
// profile so it follows them to other devices).
import type { OrgMembership, Organization } from '../types';

export type PortalKey = 'personal' | 'academia' | 'elevate' | 'business' | 'productions';
/** What the door was asked for: Elevate's claim/join/create, Business owner vs employee, Productions' film vs creators hub. */
export type PortalIntent = 'hub' | 'claim' | 'join' | 'create' | 'film' | 'creators' | 'student' | 'teacher' | 'owner' | 'employee';
export interface PortalEntry { portal: PortalKey; intent?: PortalIntent; orgKey?: string; memberNumber?: string }

export const PORTALS: { key: PortalKey; label: string; sub: string; color: string }[] = [
  { key: 'personal', label: 'Personal', sub: 'Your profile & home', color: '#D40055' },
  { key: 'academia', label: 'Academia', sub: 'Schools & learning', color: '#3FB98E' },
  { key: 'elevate', label: 'Elevate', sub: 'Churches & nonprofits', color: '#8B5CF6' },
  { key: 'business', label: 'Business & Work', sub: 'Owners & employees', color: '#22D3EE' },
  { key: 'productions', label: 'Productions', sub: 'Creators & film', color: '#E11D8F' },
];

const HOME_KEY = 'plajah_elevate_home_v1';
const PENDING_KEY = 'plajah_portal_signin_pending_v1';

export function isElevateHome(): boolean {
  try { return localStorage.getItem(HOME_KEY) === '1'; } catch { return false; }
}

export function markElevateHome(): void {
  try { localStorage.setItem(HOME_KEY, '1'); } catch { /* private mode */ }
}

/** Remember the Elevate home on the profile too, so another device lands on Elevate after any login. */
export async function persistElevateHome(uid: string, profile?: { elevateHome?: boolean } | null): Promise<void> {
  markElevateHome();
  if (profile?.elevateHome) return;
  try {
    const { updateUserProfile } = await import('./backendService');
    await updateUserProfile(uid, { elevateHome: true });
  } catch { /* offline — localStorage still carries it on this device */ }
}

/** Call right before opening sign-in from a door. */
export function beginPortalSignIn(entry: PortalEntry): void {
  if (entry.portal === 'elevate') markElevateHome();
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...entry, at: Date.now() })); } catch { /* */ }
}

export function peekPortalSignIn(): PortalEntry | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (!p?.portal || Date.now() - (p.at || 0) > 30 * 60_000) return null;
    return { portal: p.portal, intent: p.intent, orgKey: p.orgKey, memberNumber: p.memberNumber };
  } catch { return null; }
}

/** Read-and-clear the pending door sign-in (ignored after 30 minutes). */
export function consumePortalSignIn(): PortalEntry | null {
  const p = peekPortalSignIn();
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* */ }
  return p;
}

const ROLE_RANK: Record<OrgMembership['role'], number> = { OWNER: 0, ADMIN: 1, MODERATOR: 2, STAFF: 3, MEMBER: 4 };

/** Active memberships whose org passes `want`, leaders first, then most recently joined. */
async function findMemberOrg(uid: string, want: (o: Organization, m: OrgMembership) => boolean): Promise<string | null> {
  const { fetchUserMemberships, fetchOrganization } = await import('./organizationService');
  const ms = (await fetchUserMemberships(uid).catch(() => [] as OrgMembership[]))
    .filter(m => m.status === 'ACTIVE')
    .sort((a, b) => ((ROLE_RANK[a.role] ?? 5) - (ROLE_RANK[b.role] ?? 5)) || ((b.joinedAt || 0) - (a.joinedAt || 0)))
    .slice(0, 8);
  if (!ms.length) return null;
  const orgs = await Promise.all(ms.map(m => fetchOrganization(m.orgId).catch(() => null as Organization | null)));
  const i = orgs.findIndex((o, idx) => !!o && want(o, ms[idx]));
  return i >= 0 ? orgs[i]!.id : null;
}

/** "My Elevate hub": the church / religious / cultural / nonprofit org the person belongs to. */
export async function resolveElevateHubOrgId(uid: string): Promise<string | null> {
  const { isElevateOrg } = await import('./elevateTemplates');
  return findMemberOrg(uid, o => isElevateOrg(o.orgType));
}

/** An employee's workplace: a business / brand org where they hold a staff seat (not the owner). */
export async function resolveWorkplaceOrgId(uid: string): Promise<string | null> {
  return findMemberOrg(uid, (o, m) => (o.orgType === 'BUSINESS' || o.orgType === 'BRAND') && m.role !== 'OWNER');
}
