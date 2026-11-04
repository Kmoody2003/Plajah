// backShowCore - PURE rules for Sponsor This Show (routes/backShow.ts): an organizer lists sponsorship packages for
// a show, and businesses buy them. Fan tickets are sold separately through normal ticketing.
// No Firebase, no Stripe, no node:crypto, so the browser can run the record check itself.
//
// A sponsorship is advertising, paid for when bought. It carries no share of revenue: passive returns could be
// a security, and stay out until a securities attorney signs off.
//
// The organizer is the seller: each sale is a charge on their own Stripe account, and Plajah takes only its fee.
// Plajah holds no money and pays nothing out.
//
// The record is a hash chain of the terms and every money event. Its head is timestamped through OpenTimestamps
// (anchored to Bitcoin), so a later rewrite of the chain, even by Plajah, would stop matching the proof.

export type TierKind = 'sponsor' | 'host' | 'ad';
export const TIER_KINDS: TierKind[] = ['sponsor', 'host', 'ad'];

export interface BackTier { id: string; kind: TierKind; name: string; description: string; cancellationTerms: string; priceCents: number; limit?: number; sold?: number }
export type CampaignStatus = 'draft' | 'live' | 'completed' | 'cancelled';

/** Whoever is putting on the show. Every cost and financial obligation is theirs. Plajah supplies the software and takes a percentage. */
export type OrganizerRole = 'artist' | 'promoter' | 'other';
export const ORGANIZER_ROLES: Record<OrganizerRole, string> = { artist: 'Artist', promoter: 'Event promoter', other: 'Other organizer' };
export const ORGANIZER_TERMS_VERSION = '2026-11-02';
// Draft wording, pending attorney review.
export const ORGANIZER_TERMS = 'I am putting on this show and I am the seller of these sponsorships, through my own Stripe account. I alone am financially responsible for the show: the venue, its deposit and fees, every other cost, taxes, delivering what sponsors bought, and any refunds or disputes. Plajah provides the software and takes a percentage of each sale. It does not fund, organize or guarantee this show, holds none of the money, and is not a party to my venue contract or my deals with sponsors.';
export const SPONSOR_TERMS = 'I am buying advertising from the organizer named on this page, who is the seller and is responsible for delivering it. This is not an investment and carries no share of revenue or profit. My name will appear publicly. If the show is cancelled, this package’s cancellation terms apply between me and the organizer. Plajah provides the platform and doesn’t guarantee the show or issue refunds.';

export interface CampaignInput {
  title: string; artistName: string; venue: string; city: string; description?: string; ticketUrl?: string;
  organizerName: string; organizerRole: OrganizerRole;
  showDate: number; tiers: BackTier[];
}

export const PLATFORM_FEE_BPS = 500; // Kenne, 2026-11-02: 5%. Stripe bills its own processing fee to the organizer's account.
export const sponsorFeeCents = (priceCents: number) => Math.round(priceCents * PLATFORM_FEE_BPS / 10000);
export const DAY_MS = 24 * 3600 * 1000;
/** A package stays reserved this long while the buyer is on Stripe's page. Stripe's sessions must last at least 30 minutes. */
export const CHECKOUT_SESSION_MS = 31 * 60 * 1000;
export const CHECKOUT_HOLD_MS = 35 * 60 * 1000;
export const TERMS_VERSION = '2026-11-02';
export const MAX_CONTRACT_BYTES = 15 * 1024 * 1024;
export const VERIFY_LINK_MS = 30 * DAY_MS;

export const organizerProblem = (c: Pick<CampaignInput, 'organizerName' | 'organizerRole'>) =>
  (!c.organizerName?.trim() || !ORGANIZER_ROLES[c.organizerRole] ? 'Say who is putting on the show.' : null);

// ── Venue booking ────────────────────────────────────────────────────────────
// No sponsorship can be sold until a venue is on record, its signed contract is posted, and the organizer and the
// venue have each verified it. Plajah only records that an agreement exists: it isn't a party and doesn't review the terms.

export interface VenuePhone { label: string; number: string }
export interface VenueInput {
  name: string; street: string; city: string; region: string; postalCode: string; country: string;
  contactName: string; phones: VenuePhone[]; email?: string;
  lat?: number; lng?: number;
}
export interface ContractVerification { name: string; title?: string; at: number; contractHash: string; ip?: string; userAgent?: string; uid?: string }
export interface VenueBooking {
  venueId?: string; venue?: VenueInput;
  contract?: { hash: string; path: string; fileName: string; size: number; uploadedAt: number };
  artistVerification?: ContractVerification; venueVerification?: ContractVerification;
  verifyLinkHash?: string;
  confirmedAt?: number;
}

/** Null when the venue can go on record. */
export function venueProblem(v: VenueInput): string | null {
  if (!v.name?.trim()) return 'Add the venue’s name.';
  if (!v.street?.trim() || !v.city?.trim() || !v.region?.trim() || !v.postalCode?.trim() || !v.country?.trim()) return 'Add the venue’s full address.';
  if (!v.contactName?.trim()) return 'Add a contact person at the venue.';
  if (!Array.isArray(v.phones) || !v.phones.length) return 'Add at least one contact number for the venue.';
  for (const p of v.phones) {
    const digits = (p.number || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return 'Check the contact number: it needs 10 to 15 digits.';
  }
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return 'Check the venue’s email address.';
  if ((v.lat === undefined) !== (v.lng === undefined)) return 'Add both latitude and longitude, or neither.';
  if (v.lat !== undefined && (!Number.isFinite(v.lat) || Math.abs(v.lat) > 90 || !Number.isFinite(v.lng) || Math.abs(v.lng!) > 180)) return 'Check the map coordinates.';
  return null;
}

/** The same venue submitted for two shows lands on one record. */
export const venueKey = (v: Pick<VenueInput, 'name' | 'street' | 'postalCode'>) =>
  [v.name, v.street, v.postalCode].map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).join('|');

export type BookingStep = 'venue' | 'contract' | 'artist_verify' | 'venue_verify' | 'confirmed';
export function bookingStep(b: VenueBooking | null | undefined): BookingStep {
  if (b?.confirmedAt) return 'confirmed';
  if (!b?.venue) return 'venue';
  if (!b.contract) return 'contract';
  if (b.artistVerification?.contractHash !== b.contract.hash) return 'artist_verify';
  return 'venue_verify';
}

/** Null when the show can be published. */
export function campaignProblem(c: CampaignInput, now: number): string | null {
  if (!c.title?.trim()) return 'Give the show a title.';
  if (!c.artistName?.trim()) return 'Add the artist name.';
  if (!c.venue?.trim() || !c.city?.trim()) return 'Add the venue and city.';
  if (!Number.isFinite(c.showDate) || c.showDate <= now) return 'The show date must be in the future.';
  if (c.ticketUrl && !/^https:\/\/\S+$/.test(c.ticketUrl)) return 'The ticket link must start with https://.';
  if (!Array.isArray(c.tiers) || !c.tiers.length || c.tiers.length > 20) return 'Add between 1 and 20 sponsorship packages.';
  const ids = new Set<string>();
  for (const t of c.tiers) {
    if (!t.id || ids.has(t.id)) return 'Each package needs its own id.';
    ids.add(t.id);
    if (!TIER_KINDS.includes(t.kind)) return 'Unknown package type.';
    if (!t.name?.trim()) return 'Every package needs a name.';
    if (!t.description?.trim()) return `Say what the sponsor gets with ${t.name}.`;
    if (!t.cancellationTerms?.trim()) return `Say what happens to ${t.name} if the show is cancelled.`;
    if (!Number.isInteger(t.priceCents) || t.priceCents < 100) return 'Every package must cost at least $1.';
    if (t.limit !== undefined && (!Number.isInteger(t.limit) || t.limit < 1)) return 'A limit must be a whole number.';
  }
  return null;
}

// ── Record ───────────────────────────────────────────────────────────────────

export type RecordType = 'published' | 'contract_verified' | 'sponsored' | 'refunded' | 'cancelled' | 'completed';
export interface RecordBody { campaignId: string; type: RecordType; at: number; data: Record<string, unknown> }
export interface RecordEntry extends RecordBody { seq: number; prevHash: string; hash: string }
export const GENESIS = '0'.repeat(64);

/** Deterministic JSON: sorted keys, undefined dropped. Same rule as services/ledger/licenseLedger, which needs node:crypto. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
export const entryPreimage = (e: Omit<RecordEntry, 'hash'>) =>
  canonical({ campaignId: e.campaignId, type: e.type, at: e.at, data: e.data, seq: e.seq, prevHash: e.prevHash });

export type Sha256Hex = (text: string) => Promise<string> | string;

export interface RecordCheck { ok: boolean; length: number; head: string; problem?: string; atSeq?: number }
/** Re-walks the chain. The server passes node's sha256; the public page passes WebCrypto. */
export async function verifyRecord(entries: readonly RecordEntry[], sha256: Sha256Hex): Promise<RecordCheck> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.seq !== i + 1) return { ok: false, length: sorted.length, head: prev, atSeq: i + 1, problem: `Entry ${i + 1} is missing.` };
    if (e.prevHash !== prev) return { ok: false, length: sorted.length, head: prev, atSeq: e.seq, problem: `Entry ${e.seq} doesn't link to the one before it.` };
    if ((await sha256(entryPreimage(e))) !== e.hash) return { ok: false, length: sorted.length, head: prev, atSeq: e.seq, problem: `Entry ${e.seq} has been changed.` };
    prev = e.hash;
  }
  return { ok: true, length: sorted.length, head: prev };
}

// ── OpenTimestamps ───────────────────────────────────────────────────────────

const OTS_MAGIC = [0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94];
const OP_SHA256 = 0x08;

export const hexToBytes = (hex: string) => Uint8Array.from((hex.match(/../g) || []).map(h => parseInt(h, 16)));

/** A standard .ots proof file from a calendar's response, checkable with the OpenTimestamps client (`ots verify`). */
export function otsProofFile(digestHex: string, calendarResponse: Uint8Array): Uint8Array {
  const digest = hexToBytes(digestHex);
  const out = new Uint8Array(OTS_MAGIC.length + 2 + digest.length + calendarResponse.length);
  out.set(OTS_MAGIC, 0);
  out[OTS_MAGIC.length] = 0x01; // file format version
  out[OTS_MAGIC.length + 1] = OP_SHA256;
  out.set(digest, OTS_MAGIC.length + 2);
  out.set(calendarResponse, OTS_MAGIC.length + 2 + digest.length);
  return out;
}
