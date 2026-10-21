// Sponsored + gift copies of a book — the pure half. Server I/O: routes/sponsorCopies.ts.
//
// A sponsor (a reader, a fan, a business or an org) pays once for N copies. That creates a POOL with N
// seats. Each claim takes one seat, mints the claimer a normal book licence (grant 'GIFT') and writes a
// CLAIM entry on the work's licence ledger. Three ways to hand seats out:
//   OPEN    — "for the author's fans": anyone signed in can claim from the pool's link or the book page,
//             first come first served, one copy per person.
//   CODES   — bulk (classrooms, staff, events): every seat gets a one-use claim code the sponsor shares.
//   DIRECT  — named people: each recipient (a Plajah user or an email address) gets their own seat + code;
//             only they can claim it.
// Unclaimed seats can be cancelled and refunded to the sponsor; claimed copies are never taken back.

export type PoolMode = 'OPEN' | 'CODES' | 'DIRECT';
export type PoolStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'CLOSED';

export interface PoolRecipient {
  /** A Plajah account (picked in the UI). */
  uid?: string;
  /** Or an email address; the claim must come from an account with this verified email. */
  email?: string;
  name?: string;
}

export interface SponsorAs {
  kind: 'self' | 'org' | 'business';
  /** org/business id — the server checks the buyer manages it before showing its name. */
  id?: string;
}

export interface PoolRequest {
  bookId: string;
  mode: PoolMode;
  quantity: number;
  recipients?: PoolRecipient[];
  message?: string;
  as?: SponsorAs;
  /** OPEN pools can be listed on the book's page ("12 free copies from Acme Library"). */
  showOnBookPage?: boolean;
}

export interface CopyPool {
  poolId: string;
  workKind: 'book';
  workId: string;
  title: string;
  sponsorUid: string;
  sponsorName: string;
  sponsorKind: 'self' | 'org' | 'business';
  sponsorOrgId?: string;
  mode: PoolMode;
  quantity: number;
  claimed: number;
  unitPriceCents: number;
  edition: number;
  message?: string;
  showOnBookPage: boolean;
  status: PoolStatus;
  createdAt: number;
  activatedAt?: number;
  paymentRef?: string;
  refundedSeats?: number;
}

export const MAX_COPIES = 1000;
export const MAX_DIRECT = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate + normalise what the sponsor asked for. DIRECT quantity = number of recipients. */
export function checkPoolRequest(raw: any): Checked<PoolRequest> {
  const bookId = typeof raw?.bookId === 'string' ? raw.bookId.trim() : '';
  if (!bookId || bookId.includes('/')) return { ok: false, error: 'Choose a book' };
  const mode: PoolMode = raw?.mode === 'CODES' || raw?.mode === 'DIRECT' ? raw.mode : raw?.mode === 'OPEN' ? 'OPEN' : (null as any);
  if (!mode) return { ok: false, error: 'Choose how the copies are handed out' };
  let recipients: PoolRecipient[] | undefined;
  let quantity = Math.floor(Number(raw?.quantity) || 0);
  if (mode === 'DIRECT') {
    const seen = new Set<string>();
    recipients = [];
    for (const r of Array.isArray(raw?.recipients) ? raw.recipients : []) {
      const uid = typeof r?.uid === 'string' && /^[\w-]{6,128}$/.test(r.uid) ? r.uid : undefined;
      const email = !uid && typeof r?.email === 'string' && EMAIL.test(r.email.trim()) ? r.email.trim().toLowerCase() : undefined;
      if (!uid && !email) continue;
      const k = uid || email!;
      if (seen.has(k)) continue;
      seen.add(k);
      recipients.push({ ...(uid ? { uid } : { email }), ...(typeof r?.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 80) } : {}) });
    }
    if (!recipients.length) return { ok: false, error: 'Add at least one person to send a copy to' };
    if (recipients.length > MAX_DIRECT) return { ok: false, error: `Send to at most ${MAX_DIRECT} people at once` };
    quantity = recipients.length;
  }
  if (!(quantity >= 1 && quantity <= MAX_COPIES)) return { ok: false, error: `Choose between 1 and ${MAX_COPIES} copies` };
  const asKind = raw?.as?.kind === 'org' || raw?.as?.kind === 'business' ? raw.as.kind : 'self';
  const asId = asKind !== 'self' && typeof raw?.as?.id === 'string' ? raw.as.id.trim() : undefined;
  if (asKind !== 'self' && !asId) return { ok: false, error: 'Choose the organization you are buying for' };
  const message = typeof raw?.message === 'string' ? raw.message.trim().slice(0, 500) : '';
  return {
    ok: true,
    value: { bookId, mode, quantity, ...(recipients ? { recipients } : {}), ...(message ? { message } : {}), as: { kind: asKind, ...(asId ? { id: asId } : {}) }, showOnBookPage: mode === 'OPEN' && raw?.showOnBookPage !== false },
  };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

/** A one-use claim code like "K7QP2-MX9TA" from 10 random bytes. */
export function codeFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** What a person types or pastes → the canonical code (or null). */
export function normalizeCode(input: unknown): string | null {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 10 || [...s].some(c => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export const seatsLeft = (p: Pick<CopyPool, 'quantity' | 'claimed' | 'refundedSeats'>) => Math.max(0, p.quantity - p.claimed - (p.refundedSeats || 0));

/** Cents to refund when the sponsor cancels the unclaimed seats. */
export const unclaimedRefundCents = (p: Pick<CopyPool, 'quantity' | 'claimed' | 'refundedSeats' | 'unitPriceCents'>) => seatsLeft(p) * p.unitPriceCents;

/** Public line for the book page / claim page. */
export function sponsorLine(p: Pick<CopyPool, 'sponsorName' | 'quantity' | 'claimed' | 'refundedSeats' | 'mode'>): string {
  const left = seatsLeft(p);
  const who = p.sponsorName || 'A reader';
  if (p.mode === 'OPEN') return left ? `${who} is giving away ${left} free ${left === 1 ? 'copy' : 'copies'}` : `${who} gave away ${p.claimed} ${p.claimed === 1 ? 'copy' : 'copies'}`;
  return `${who} sent you this book`;
}
