/**
 * Server-side pure helpers for business staff seats (routes/businessStaff.ts). No Firebase, no I/O:
 * invite validation, seat-map edits and the owner-level permission index. See services/businessStaffCore.ts
 * for the storage model.
 */
import { createHash } from 'node:crypto';
import {
  normalizePerms, normalizeInviteCode, DEFAULT_PERMS,
  type BizPerm, type StaffSeat, type StaffSeatRole, type StaffInviteSummary,
} from './businessStaffCore';

export interface StaffInviteDoc {
  pageId: string;
  ownerUid: string;
  businessName: string;
  role: StaffSeatRole;
  roleKey?: string | null;
  roleLabel?: string | null;
  perms: BizPerm[];
  staffMemberId?: string | null;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedBy?: string | null;
  usedAt?: number | null;
  revoked?: boolean;
}

/** Doc id for an invite: sha256 of the canonical code. The plaintext code is never stored. */
export const inviteDocId = (code: string) => createHash('sha256').update(normalizeInviteCode(code)).digest('hex');

export const asSeatRole = (r: unknown): StaffSeatRole => (r === 'MANAGER' ? 'MANAGER' : 'STAFF');

/** Perms for a new/edited seat: explicit list if given (normalized), else the role defaults. */
export const seatPerms = (role: StaffSeatRole, perms?: unknown): BizPerm[] =>
  Array.isArray(perms) ? normalizePerms(perms) : [...DEFAULT_PERMS[role]];

export type InviteState = 'ok' | 'missing' | 'expired' | 'used' | 'revoked' | 'owner';

/**
 * Can `uid` redeem this invite now? A re-redeem by the same uid that already used it is 'ok'
 * (idempotent repair if the seat write failed half-way).
 */
export function validateInvite(inv: Partial<StaffInviteDoc> | null | undefined, now: number, uid?: string): InviteState {
  if (!inv || !inv.pageId || !inv.ownerUid) return 'missing';
  if (inv.revoked) return 'revoked';
  if (inv.usedBy && inv.usedBy !== uid) return 'used';
  if (!inv.usedBy && !(Number(inv.expiresAt) > now)) return 'expired';
  if (uid && uid === inv.ownerUid) return 'owner';
  return 'ok';
}

export const INVITE_STATE_HTTP: Record<Exclude<InviteState, 'ok'>, { status: number; error: string }> = {
  missing: { status: 404, error: 'That invite code was not found.' },
  expired: { status: 410, error: 'That invite has expired. Ask the owner for a new one.' },
  used: { status: 410, error: 'That invite has already been used.' },
  revoked: { status: 410, error: 'That invite was cancelled by the owner.' },
  owner: { status: 409, error: 'You own this business; invites are for your team.' },
};

export function inviteSummary(inv: StaffInviteDoc): StaffInviteSummary {
  return {
    pageId: inv.pageId, businessName: inv.businessName, role: asSeatRole(inv.role),
    ...(inv.roleLabel ? { roleLabel: inv.roleLabel } : {}),
    perms: normalizePerms(inv.perms), expiresAt: Number(inv.expiresAt),
  };
}

export interface SeatPageShape { id?: string; ownerId?: string; staffUids?: string[]; staffSeats?: Record<string, StaffSeat> }

/** Seat fields after adding/replacing `seat` on a page. */
export function withSeat(page: SeatPageShape, seat: StaffSeat): { staffUids: string[]; staffSeats: Record<string, StaffSeat> } {
  const uids = Array.isArray(page.staffUids) ? page.staffUids.filter(u => u !== seat.uid) : [];
  return { staffUids: [...uids, seat.uid], staffSeats: { ...(page.staffSeats || {}), [seat.uid]: seat } };
}

/** Seat fields after removing `uid` from a page. */
export function withoutSeat(page: SeatPageShape, uid: string): { staffUids: string[]; staffSeats: Record<string, StaffSeat> } {
  const seats = { ...(page.staffSeats || {}) };
  delete seats[uid];
  return { staffUids: (Array.isArray(page.staffUids) ? page.staffUids : []).filter(u => u !== uid), staffSeats: seats };
}

/** Is `uid` actually seated on the page (listed in staffUids AND has a seat)? */
export const isSeated = (page: SeatPageShape | null | undefined, uid: string) =>
  !!page && (page.staffUids || []).includes(uid) && !!page.staffSeats?.[uid];

/** Union of uid's perms across every page they are seated on (canonical order). */
export function unionPerms(pages: SeatPageShape[], uid: string): BizPerm[] {
  const all: BizPerm[] = [];
  for (const p of pages) if (isSeated(p, uid)) all.push(...normalizePerms(p.staffSeats![uid].perms));
  return normalizePerms(all);
}

/** The owner-level index (businessStaffIndex/{owner}: staffPerms + staffUids) rebuilt from all of that owner's pages. */
export function ownerStaffIndex(pages: SeatPageShape[]): { staffPerms: Record<string, BizPerm[]>; staffUids: string[] } {
  const uids = new Set<string>();
  for (const p of pages) for (const u of p.staffUids || []) if (isSeated(p, u)) uids.add(u);
  const staffPerms: Record<string, BizPerm[]> = {};
  for (const u of uids) staffPerms[u] = unionPerms(pages, u);
  return { staffPerms, staffUids: [...uids].sort() };
}

/** Register-facing summary of a staff account across an owner's pages (for resolveRegisterActor). */
export function staffActorInfo(pages: SeatPageShape[], uid: string): { name: string; role: StaffSeatRole; staffMemberId?: string } | null {
  const seats = pages.filter(p => isSeated(p, uid)).map(p => p.staffSeats![uid]);
  if (!seats.length) return null;
  const role: StaffSeatRole = seats.some(s => s.role === 'MANAGER') ? 'MANAGER' : 'STAFF';
  const linked = seats.find(s => s.staffMemberId)?.staffMemberId;
  return { name: seats[0].name || 'Staff', role, ...(linked ? { staffMemberId: linked } : {}) };
}

/** Sanitize free-text seat labels. */
export const cleanLabel = (s: unknown, max = 60): string | undefined => {
  const t = typeof s === 'string' ? s.trim().slice(0, max) : '';
  return t || undefined;
};
export const validId = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 128 && !s.includes('/');
