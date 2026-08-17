// contentLicense.ts — "Own it forever" license credentials for paid content.
// Covers Taleo films AND Lorea books (one entitlement system, keyed by `kind`).
//
// ⚠️ HONESTY NOTE — READ BEFORE EXTENDING ⚠️
// A license here is an ENTITLEMENT RECORD shaped like a Verifiable Credential. It is
// NOT yet cryptographically signed or anchored — same posture as creatorPassport.ts.
// What makes it meaningful now is practical: a purchase resolves to a concrete buyer +
// work + granted rights, lives in the buyer's account, and carries the fields an OCME
// VC needs so the swap to a real one is a single edit here.
//
// TRUST BOUNDARY: licenses are MINTED SERVER-SIDE ONLY, in the Stripe webhook
// (server.ts, checkout.session.completed → type 'content_purchase'), after a real
// charge. The client NEVER writes a license — the Firestore rule is read-only for the
// owner. That's why there is no mint function here: minting a paid entitlement from the
// client would let anyone self-grant. This module is READ + PURE-BUILD only.
//
// When OCME goes live: `issuerDid`/`subjectDid` stop being `plajah:<uid>` placeholders
// and become real DIDs, `proof` gets a signature, and the webhook additionally POSTs the
// VC to OCME + emits a settlement receipt carrying the Stripe ref (buyer identity never
// crosses). buildContentLicense() keeps its shape either way.
//
// Firestore: users/{uid}/contentLicenses/{licenseId}, licenseId = `${kind}_${contentId}`
// — deterministic so the webhook is idempotent (Stripe fires more than once).

import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { passportIdFor, isPlaceholderPassport, stripUndefined } from './creatorPassport';

export type ContentKind = 'film' | 'book';
/** PURCHASE / PPV are owned forever; RENTAL expires. */
export type LicenseGrant = 'PURCHASE' | 'RENTAL' | 'PPV';
/** How the buyer receives the work once owned. Films: FilmDistribution.delivery. */
export type Delivery = 'DOWNLOAD_OPEN' | 'PLAJAH_ONLY';

export interface ContentLicense {
  id: string;                    // `${kind}_${contentId}`
  kind: ContentKind;
  contentId: string;
  title?: string;
  buyerUid: string;
  issuerDid: string;             // passportIdFor(creator) — a real DID under OCME
  subjectDid: string;            // passportIdFor(buyer)   — a real DID under OCME
  grant: LicenseGrant;
  delivery: Delivery;
  priceCents: number;            // amount actually charged, in integer cents
  currency: string;
  paymentRef?: string;           // Stripe charge/PI id — for the settlement receipt
  issuedAt: number;              // ms
  expiresAt?: number;            // ms — RENTAL only
  watermarkTag?: string;         // per-buyer forensic stamp for the download copy
  proof: null;                   // signature — null until OCME/Passport signing lands
  placeholder: boolean;          // true while DIDs are placeholders, not real
}

export const licenseId = (kind: ContentKind, contentId: string) => `${kind}_${contentId}`;

/**
 * Deterministic per-buyer watermark token. Same buyer+work always yields the same tag
 * (a leaked copy is traceable) with nothing extra stored. NOT a secret, NOT anti-tamper —
 * a forensic stamp, the traceability substitute for hard DRM.
 */
export function watermarkTagFor(buyerUid: string, contentId: string): string {
  let h = 0;
  const s = `${buyerUid}:${contentId}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `PLJ-${(h >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

/**
 * Build (do not persist) the license for a purchase. PURE — the server webhook and any
 * client preview/receipt both call this so the shape can never drift. Returns a
 * Firestore-safe object (no undefined values).
 */
export function buildContentLicense(input: {
  kind: ContentKind;
  contentId: string;
  title?: string;
  buyerUid: string;
  creatorUid: string;
  grant: LicenseGrant;
  delivery?: Delivery;
  watermark?: boolean;
  priceCents: number;
  currency?: string;
  paymentRef?: string;
  rentalWindowHrs?: number;
  at?: number;
}): ContentLicense {
  const at = input.at ?? Date.now();
  const delivery: Delivery = input.delivery ?? 'DOWNLOAD_OPEN';
  const issuerDid = passportIdFor(input.creatorUid);
  const subjectDid = passportIdFor(input.buyerUid);

  const expiresAt =
    input.grant === 'RENTAL' && input.rentalWindowHrs
      ? at + input.rentalWindowHrs * 3600_000
      : undefined;

  const watermarkTag =
    delivery === 'DOWNLOAD_OPEN' && (input.watermark ?? true)
      ? watermarkTagFor(input.buyerUid, input.contentId)
      : undefined;

  return stripUndefined<ContentLicense>({
    id: licenseId(input.kind, input.contentId),
    kind: input.kind,
    contentId: input.contentId,
    title: input.title,
    buyerUid: input.buyerUid,
    issuerDid,
    subjectDid,
    grant: input.grant,
    delivery,
    priceCents: input.priceCents,
    currency: input.currency ?? 'USD',
    paymentRef: input.paymentRef,
    issuedAt: at,
    expiresAt,
    watermarkTag,
    proof: null,
    placeholder: isPlaceholderPassport(issuerDid) || isPlaceholderPassport(subjectDid),
  });
}

// ── Reads (gating + library) ─────────────────────────────────────────────────

/** The buyer's license for a work, or null if they don't own/haven't rented it. */
export async function getContentLicense(
  buyerUid: string, kind: ContentKind, contentId: string,
): Promise<ContentLicense | null> {
  if (!buyerUid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', buyerUid, 'contentLicenses', licenseId(kind, contentId)));
    return snap.exists() ? (snap.data() as ContentLicense) : null;
  } catch (e) {
    console.warn('[contentLicense] read failed:', e);
    return null;
  }
}

/** True if the buyer currently has access (owned, or a rental not yet expired). */
export async function hasAccess(
  buyerUid: string, kind: ContentKind, contentId: string, now = Date.now(),
): Promise<boolean> {
  const lic = await getContentLicense(buyerUid, kind, contentId);
  if (!lic) return false;
  return lic.expiresAt == null || lic.expiresAt > now;
}

/** All of a buyer's licenses (optionally one kind) — powers "Purchased" shelves. */
export async function listContentLicenses(
  buyerUid: string, kind?: ContentKind,
): Promise<ContentLicense[]> {
  if (!buyerUid) return [];
  try {
    const col = collection(db, 'users', buyerUid, 'contentLicenses');
    const snap = await getDocs(kind ? query(col, where('kind', '==', kind)) : col);
    return snap.docs.map(d => d.data() as ContentLicense).sort((a, b) => b.issuedAt - a.issuedAt);
  } catch (e) {
    console.warn('[contentLicense] list failed:', e);
    return [];
  }
}
