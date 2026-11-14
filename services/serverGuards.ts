// serverGuards — pure authorization decisions shared by server.ts and routes/*.ts.
// The server writes through admin REST, so Firestore rules do not protect these paths: the checks here are the
// only barrier. No I/O in this file, so every decision is unit tested (tests/serverGuards.test.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// ── Elevate seat claims ──────────────────────────────────────────────────────
/** A plain member seat. Anything else (staff, finance, clergy, department roles) needs a verified email match. */
export function isPlainMemberSeat(seat: { role?: unknown; roleKey?: unknown; isEmployee?: unknown; ministryRoles?: unknown }): boolean {
  const key = String(seat.roleKey || 'MEMBER').toUpperCase();
  const role = String(seat.role || 'MEMBER').toUpperCase();
  return key === 'MEMBER' && role === 'MEMBER' && !seat.isEmployee && !(Array.isArray(seat.ministryRoles) && seat.ministryRoles.length > 0);
}
/** Last name on file: the whole display name, or its final word(s). Never a substring in the middle of a name. */
export function lastNameMatches(displayName: unknown, lastName: unknown): boolean {
  const dn = norm(displayName); const ln = norm(lastName);
  return !!ln && (dn === ln || dn.endsWith(` ${ln}`));
}
export type ClaimProof = 'verified-email' | 'id-and-last-name';
/** May a caller who proved `proof` take this seat? */
export function claimAllowed(
  seat: { role?: unknown; roleKey?: unknown; isEmployee?: unknown; ministryRoles?: unknown; claimEmailLower?: unknown },
  proof: ClaimProof,
  caller: { email?: string; emailVerified?: boolean } | null | undefined,
): boolean {
  const onFile = norm(seat.claimEmailLower);
  const verifiedMatch = !!caller?.emailVerified && !!onFile && norm(caller.email) === onFile;
  if (verifiedMatch) return true;
  return proof === 'id-and-last-name' && isPlainMemberSeat(seat);
}

// ── Tickets ──────────────────────────────────────────────────────────────────
export type TicketAction = 'check-in' | 'redeem' | 'redeem-override' | 'add-package' | 'print';
/** Event staff may do everything. A holder may self check-in, spend their own perks and print; never add perks or skip the cooldown. */
export function ticketActionAllowed(action: TicketAction, who: { isHolder: boolean; isEventManager: boolean }): boolean {
  if (who.isEventManager) return true;
  return who.isHolder && (action === 'check-in' || action === 'redeem' || action === 'print');
}
/** Whole positive units only: a negative count used to add balance. */
export function cleanRedeemUnits(units: unknown): number | null {
  const n = Number(units ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

// ── Mux ownership (carried in Mux's own passthrough field) ───────────────────
const OWNER_TAG = /^o:([A-Za-z0-9_-]{1,128});/;
const UNSTAMPED_GRACE_MS = 48 * 3_600_000;
/** Mux caps passthrough at 255 chars; the owner goes first so a long trace tag can never push it out. */
export const muxOwnerTag = (uid: string, trace = '') => `o:${uid};${trace}`.slice(0, 255);
export const muxOwnerOf = (passthrough: unknown): string | null => OWNER_TAG.exec(String(passthrough ?? ''))?.[1] ?? null;
/**
 * Stamped: owner only. Unstamped assets predate the stamp, so only ones younger than the longest upload window pass
 * (uploads in flight across a deploy); older ones are admin only.
 */
export function muxAssetReadable(a: { passthrough?: unknown; createdAtMs?: number; callerUid: string; isAdmin: boolean; now: number }): boolean {
  if (a.isAdmin) return true;
  const owner = muxOwnerOf(a.passthrough);
  if (owner) return owner === a.callerUid;
  return typeof a.createdAtMs === 'number' && a.createdAtMs > 0 && a.now - a.createdAtMs < UNSTAMPED_GRACE_MS;
}

// ── Push ─────────────────────────────────────────────────────────────────────
/** Links in a push open inside the app: view names and internal deep links only, never an outside site. */
export function isInternalPushLink(link: unknown): boolean {
  if (link == null || link === '') return true;
  const s = String(link).trim();
  if (s.length > 300 || /[\s\\]/.test(s) || s.startsWith('//')) return false;
  if (/^(claim-copy|content-hq):/i.test(s)) return true;
  if (s.startsWith('/')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(s);
}
/** The push must describe a notification the sender really created for this recipient. */
export const pushMatchesNotification = (n: { userId?: unknown; senderId?: unknown } | null | undefined, recipient: string, sender: string): boolean =>
  !!n && n.userId === recipient && n.senderId === sender;

// ── Veo proxy (the server appends its Google key to whatever URI it fetches) ─
const VEO_DOWNLOAD = /^https:\/\/generativelanguage\.googleapis\.com\/v1(beta|alpha)?\/files\/[A-Za-z0-9_-]+:download(\?alt=media)?$/;
const VEO_OPERATION = /^models\/veo-[\w.-]+\/operations\/[\w-]+$/;
export const isVeoDownloadUri = (uri: unknown) => VEO_DOWNLOAD.test(String(uri ?? ''));
export const isVeoOperationName = (name: unknown) => VEO_OPERATION.test(String(name ?? ''));

// ── Signed, expiring state for popup OAuth (binds a code to org + caller) ────
const stateSig = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');
export function signConnectState(secret: string, orgId: string, uid: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ o: orgId, u: uid, e: exp })).toString('base64url');
  return `${payload}.${stateSig(secret, payload)}`;
}
export function verifyConnectState(secret: string, state: unknown, orgId: string, uid: string, now: number): boolean {
  const [payload, sig] = String(state ?? '').split('.');
  if (!secret || !payload || !sig) return false;
  const a = Buffer.from(sig); const b = Buffer.from(stateSig(secret, payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { o, u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return o === orgId && u === uid && Number(e) > now;
  } catch { return false; }
}

// ── LAN device targets ───────────────────────────────────────────────────────
/** A literal private IPv4 address: local light hardware, never a hostname or the metadata range. */
export function isPrivateLanIp(ip: unknown): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip ?? ''));
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some(n => n > 255)) return false;
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// ── Register PIN lockout ─────────────────────────────────────────────────────
/** Scoped to caller and network, so a stranger's wrong PINs lock only themselves, never the shop's register. */
export const pinLockKeys = (businessUid: string, uid: string, ip: string): string[] => [`login:${businessUid}:u:${uid}`, `login:${businessUid}:ip:${ip}`];
