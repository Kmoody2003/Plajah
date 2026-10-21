/**
 * Business staff seats — team members work a business from their OWN Plajah account.
 *
 * A seat lives in two places, both written ONLY by the server (routes/businessStaff.ts) when an invite is
 * redeemed, a seat is edited or removed:
 *   businessPages/{pageId}.staffUids: string[]                     — who may open this page (array-contains query
 *                                                                     for the switcher; rules check membership)
 *   businessPages/{pageId}.staffSeats: Record<uid, StaffSeat>      — role + permissions per person
 *   businessStaffIndex/{ownerUid}: {staffUids, staffPerms: Record<uid, BizPerm[]>, updatedAt}
 *                                                                   — PRIVATE (owner + listed staff read; server
 *                                                                     writes): the same perms, keyed under the OWNER uid,
 *                                                                     because catalog/orders/offers rules are
 *                                                                     keyed by sellerId = owner uid
 * Invites: businessStaffInvites/{codeHash} (server-only). The code itself is shown once to the owner.
 *
 * Pure: no Firebase. Shared by the client, the server and the tests.
 */

export type BizPerm =
  | 'REGISTER'    // ring sales, open the register / kiosk (server: RING_SALES)
  | 'REFUNDS'     // refunds + drawer close (server: REFUND, CLOSE_DRAWER)
  | 'ORDERS'      // see and advance orders, tickets, appointments
  | 'INVENTORY'   // edit products, stock, deals
  | 'CRM'         // customers, pipeline, notes, 1:1 correspondence
  | 'CRM_ADMIN'   // export, import, delete, bulk promo sends
  | 'SIGNAGE'     // screens, now playing
  | 'EVENTS'      // create and run events for the business
  | 'MARKETING'   // social queue, campaigns, broadcasts
  | 'REPORTS'     // sales reports, drawer sessions, refunds history
  | 'TEAM';       // see the roster and schedule (never pay rates or PINs)

export type StaffSeatRole = 'MANAGER' | 'STAFF';

export interface StaffSeat {
  uid: string;
  name: string;
  role: StaffSeatRole;
  /** Pack role key (e.g. 'SERVICE_ADVISOR', 'TECH') — display + defaults; perms are authoritative. */
  roleKey?: string;
  roleLabel?: string;
  perms: BizPerm[];
  /** businesses/{owner}/staff/{id} record this account is linked to (PIN, clock-in, pay live there). */
  staffMemberId?: string;
  addedAt: number;
  addedBy: string;
}

export interface StaffInviteSummary {
  pageId: string;
  businessName: string;
  role: StaffSeatRole;
  roleLabel?: string;
  perms: BizPerm[];
  expiresAt: number;
}

export const ALL_BIZ_PERMS: BizPerm[] = ['REGISTER', 'REFUNDS', 'ORDERS', 'INVENTORY', 'CRM', 'CRM_ADMIN', 'SIGNAGE', 'EVENTS', 'MARKETING', 'REPORTS', 'TEAM'];

export const BIZ_PERM_LABEL: Record<BizPerm, { label: string; desc: string }> = {
  REGISTER: { label: 'Register', desc: 'Ring sales and run the kiosk' },
  REFUNDS: { label: 'Refunds & drawer', desc: 'Refund sales and close the cash drawer' },
  ORDERS: { label: 'Orders & jobs', desc: 'Orders, tickets and appointments' },
  INVENTORY: { label: 'Inventory & deals', desc: 'Products, stock counts and deals' },
  CRM: { label: 'Customers', desc: 'Pipeline, notes and one-to-one messages' },
  CRM_ADMIN: { label: 'Customer admin', desc: 'Import, export, delete and bulk promotions' },
  SIGNAGE: { label: 'Screens & music', desc: 'Signage slides and in-store radio' },
  EVENTS: { label: 'Events', desc: 'Create and run events' },
  MARKETING: { label: 'Marketing', desc: 'Social queue, campaigns and broadcasts' },
  REPORTS: { label: 'Reports', desc: 'Sales reports and drawer history' },
  TEAM: { label: 'Team schedule', desc: 'Roster and shifts (never pay)' },
};

export const DEFAULT_PERMS: Record<StaffSeatRole, BizPerm[]> = {
  MANAGER: ['REGISTER', 'REFUNDS', 'ORDERS', 'INVENTORY', 'CRM', 'CRM_ADMIN', 'SIGNAGE', 'EVENTS', 'MARKETING', 'REPORTS', 'TEAM'],
  STAFF: ['REGISTER', 'ORDERS', 'CRM', 'SIGNAGE'],
};

/** Keep only known perms, de-duplicated, in canonical order. */
export function normalizePerms(perms: unknown): BizPerm[] {
  const set = new Set(Array.isArray(perms) ? perms.filter((p): p is BizPerm => ALL_BIZ_PERMS.includes(p as BizPerm)) : []);
  return ALL_BIZ_PERMS.filter(p => set.has(p));
}

/** Pack role → seat defaults: owner-ish roles (baseRole ADMIN) become managers. */
export function seatDefaultsForPackRole(r?: { key: string; label: string; baseRole: string } | null): { role: StaffSeatRole; roleKey?: string; roleLabel?: string; perms: BizPerm[] } {
  const role: StaffSeatRole = r && (r.baseRole === 'ADMIN' || r.baseRole === 'OWNER') ? 'MANAGER' : 'STAFF';
  return { role, roleKey: r?.key, roleLabel: r?.label, perms: DEFAULT_PERMS[role] };
}

export interface PageAccessShape { ownerId: string; staffUids?: string[]; staffSeats?: Record<string, StaffSeat> }

export type BizAccess =
  | { kind: 'owner'; perms: BizPerm[] }
  | { kind: 'staff'; perms: BizPerm[]; seat: StaffSeat }
  | { kind: 'none'; perms: [] };

/** What a signed-in user may do on a page. Owners can do everything. */
export function accessFor(page: PageAccessShape | null | undefined, uid: string | null | undefined): BizAccess {
  if (!page || !uid) return { kind: 'none', perms: [] };
  if (page.ownerId === uid) return { kind: 'owner', perms: [...ALL_BIZ_PERMS] };
  const seat = page.staffSeats?.[uid];
  if (seat && (page.staffUids ?? []).includes(uid)) return { kind: 'staff', perms: normalizePerms(seat.perms), seat };
  return { kind: 'none', perms: [] };
}

export const can = (a: BizAccess, p: BizPerm) => (a.perms as BizPerm[]).includes(p);

/** Register permission names used by the server register core (services/registerAuthCore.ts). */
export function registerPermsFor(perms: BizPerm[]): string[] {
  const out = new Set<string>();
  if (perms.includes('REGISTER')) out.add('RING_SALES');
  if (perms.includes('REFUNDS')) { out.add('REFUND'); out.add('CLOSE_DRAWER'); }
  if (perms.includes('REPORTS')) out.add('VIEW_REPORTS');
  if (perms.includes('INVENTORY') && perms.includes('REFUNDS')) out.add('DISCOUNT_OVERRIDE');
  return [...out];
}

/** Dashboard tabs a set of perms unlocks (tab ids from BusinessDashboard). */
export const TAB_PERM: Record<string, BizPerm | 'ANY'> = {
  TODAY: 'ANY', OVERVIEW: 'REPORTS', ORDERS: 'ORDERS', TICKETS: 'ORDERS', APPOINTMENTS: 'ORDERS', INVENTORY: 'INVENTORY',
  CRM: 'CRM', SIGNAGE: 'SIGNAGE', RADIO: 'SIGNAGE', EVENTS: 'EVENTS', SOCIAL: 'MARKETING', MARKETING: 'MARKETING',
  MESSAGING: 'MARKETING', TEAM: 'TEAM',
};

export function tabAllowed(tab: string, a: BizAccess): boolean {
  if (a.kind === 'owner') return true;
  if (a.kind === 'none') return false;
  const need = TAB_PERM[tab];
  if (!need) return false; // billing, settings, compliance, listings, seed raiser: owner only
  return need === 'ANY' || a.perms.includes(need);
}

// ── Invite codes ──────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

/** 10-char human code, grouped 5-5 for reading aloud. `rand` returns bytes (crypto on the server). */
export function makeInviteCode(rand: (n: number) => Uint8Array): string {
  const b = rand(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Canonical form for hashing/lookup: upper-case, no separators, ambiguous letters folded. */
export function normalizeInviteCode(raw: string): string {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export const inviteLink = (origin: string, code: string) => `${origin.replace(/\/$/, '')}/?bizJoin=${encodeURIComponent(code)}`;
