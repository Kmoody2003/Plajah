// elevateInviteCore — pure decisions + template for Elevate "claim your account" emails (routes/elevateInvites.ts).
//
// A pre-provisioned seat (services/elevateAccounts) is emailed an invitation to claim it. Rules:
//   • only unclaimed seats, only to the email the org has on file (never one the caller types)
//   • one send per seat per day, at most MAX_SENDS_PER_SEAT ever — a reminder, not a drip campaign
//   • a bounce or complaint stops sends to that address; a new address on file resets it
//   • the recipient can stop invites from the email itself (OPTED_OUT is permanent for that seat)

import { renderEmail, type RenderedEmail } from './notify/emailNotifyCore';

export const INVITE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_SENDS_PER_SEAT = 5;
/** Per request; also Resend's free-plan daily cap, so one click never overruns it. */
export const MAX_INVITES_PER_REQUEST = 100;

export type InviteStatus = 'SENT' | 'FAILED' | 'BOUNCED' | 'OPTED_OUT';
export type SkipReason = 'claimed' | 'no_email' | 'bounced' | 'opted_out' | 'cooldown' | 'limit';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
export const validEmail = (s: string) => EMAIL_RE.test(s) && s.length <= 254;

export interface SeatInviteState {
  isProvisioned?: boolean;
  claimInviteStatus?: InviteStatus;
  claimInviteEmail?: string;
  claimInviteSentAt?: number;
  claimInviteCount?: number;
}

export function inviteEligibility(seat: SeatInviteState, email: string, now: number): { ok: true } | { ok: false; reason: SkipReason } {
  if (!seat.isProvisioned) return { ok: false, reason: 'claimed' };
  const to = (email || '').trim().toLowerCase();
  if (!validEmail(to)) return { ok: false, reason: 'no_email' };
  if (seat.claimInviteStatus === 'OPTED_OUT') return { ok: false, reason: 'opted_out' };
  const sameAddress = (seat.claimInviteEmail || '') === to;
  if (seat.claimInviteStatus === 'BOUNCED' && sameAddress) return { ok: false, reason: 'bounced' };
  if (sameAddress && (seat.claimInviteCount || 0) >= MAX_SENDS_PER_SEAT) return { ok: false, reason: 'limit' };
  if (sameAddress && seat.claimInviteStatus === 'SENT' && now - (seat.claimInviteSentAt || 0) < INVITE_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  return { ok: true };
}

/** Patch written to the seat after an attempt. A new address starts the count over. */
export function inviteSentPatch(seat: SeatInviteState, email: string, ok: boolean, byUid: string, now: number): Record<string, unknown> {
  const to = email.trim().toLowerCase();
  const prior = (seat.claimInviteEmail || '') === to ? seat.claimInviteCount || 0 : 0;
  return ok
    ? { claimInviteStatus: 'SENT', claimInviteEmail: to, claimInviteSentAt: now, claimInviteCount: prior + 1, claimInviteBy: byUid }
    : { claimInviteStatus: 'FAILED', claimInviteEmail: to, claimInviteFailedAt: now, claimInviteBy: byUid };
}

/** "Grace Chapel via Plajah <notifications@…>" — the org name, never anything that can break the header. */
export function senderFrom(orgName: string, configuredFrom: string): string {
  const addr = (configuredFrom.match(/<([^>]+)>/)?.[1] || configuredFrom).trim();
  // Letters, digits and plain punctuation only: anything else (@ : , < ") would need quoting in the From header.
  const name = (orgName || '').replace(/[^\p{L}\p{N} .&'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return name ? `${name} via Plajah <${addr}>` : `Plajah <${addr}>`;
}

export function renderClaimInvite(o: {
  orgName: string; firstName?: string; roleLabel?: string; departments?: string[];
  memberNumber?: string; email: string; claimUrl: string; stopUrl?: string; reminder?: boolean;
}): RenderedEmail {
  const org = o.orgName || 'Your organization';
  const role = o.roleLabel && o.roleLabel !== 'Member' ? ` as ${o.roleLabel}` : '';
  const depts = (o.departments || []).filter(Boolean);
  return renderEmail({
    subject: `${o.reminder ? 'Reminder: ' : ''}Your ${org} account on Plajah is ready`,
    heading: `${o.firstName ? `Hi ${o.firstName}, your` : 'Your'} ${org} account is ready`,
    lines: [
      `${org} has set up a Plajah account for you${role}${depts.length ? ` with ${depts.join(', ')}` : ''}. Claim it to see announcements, your department feeds and chat rooms.`,
      `Sign in or create a free Plajah account with ${o.email} and it connects automatically.`,
      o.memberNumber ? `Or claim it with your member ID ${o.memberNumber} and your last name.` : '',
    ],
    ctaLabel: 'Claim my account',
    ctaUrl: o.claimUrl,
    footerNote: `${org} sent this through Plajah because you're in their directory. If this isn't you, you can ignore it.`,
    unsubscribeUrl: o.stopUrl,
  });
}
