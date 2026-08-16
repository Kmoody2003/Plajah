/**
 * Registry service — Phase 1 (free tier, opt-in).
 *
 * Creates and maintains the Work / Manifestation / Product triple for a piece of Plajah
 * content, plus the free identity layer (DID + ARK + content hash) and any industry
 * identifiers the owner already holds and pastes in.
 *
 * WHAT IS FREE HERE, AND WHY THAT IS THE WHOLE SCOPE
 * ─────────────────────────────────────────────────
 *   · DID            — from the Creator Passport; identifies the party, never the work
 *   · ARK            — free NAAN, self-minted, resolvable (see ./ark.ts)
 *   · SHA-256        — exact-duplicate detection across the catalogue, computed locally
 *   · bring-your-own — ISBN/ISRC/ISWC/UPC/EIDR the owner already has, validated on entry
 *
 * Nothing here mints an ISBN, ISRC, UPC or EIDR. Those are retail routing keys and only their
 * issuing authority can create one; see docs/PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md §5.
 *
 * NOT YET A LEDGER. Every write below is an ordinary Firestore write: unsigned, unanchored,
 * editable without trace. It proves exactly as much as Plajah's database — the same honesty
 * rule `services/creatorPassport.ts` states. Signing and anchoring are Phase 4.
 *
 * OPT-IN. This surface is off for every account until the owner turns it on. A hobbyist
 * uploading a song must never be asked for an IPI number.
 *
 * Firestore notes:
 *   · every write goes through `clean()` — an `undefined` field value throws
 *   · no where()+orderBy() queries here, so no composite index is required yet
 */

import { db, auth } from '../firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import type {
  ExternalId, IdScheme, IdSource,
  RegistryWork, RegistryManifestation, RegistryProduct,
  WorkContributor, WorkKind, ManifestationKind, ProductKind,
} from './types';
import { validateId, normalizeId } from './identifiers';
import { mintArk, arkAvailable } from './ark';

// ─── Collections ──────────────────────────────────────────────────────────────

const WORKS = 'registryWorks';
const MANIFESTATIONS = 'registryManifestations';
const PRODUCTS = 'registryProducts';
/** subjectKey → the triple. Keeps the registry additive: no existing doc is modified. */
const REFS = 'registryRefs';

// ─── Subjects: the Plajah content a registry record can hang off ──────────────

export type RegistrySubjectKind =
  | 'BOOK' | 'COMIC'          // Lorea
  | 'ALBUM' | 'TRACK'         // Chora
  | 'FILM' | 'EPISODE';       // Taleo

export interface RegistrySubject {
  kind: RegistrySubjectKind;
  /** The id of the underlying Plajah doc (studio book id, album id, track id, video id). */
  id: string;
  title?: string;
  /** Display name of the credited creator — seeds the work's first contributor. */
  creatorName?: string;
}

export const subjectKey = (s: RegistrySubject) => `${s.kind}_${s.id}`;

/** Per-subject vocabulary, so a book never offers ISRC and a track never offers ISBN. */
const SUBJECT_PROFILE: Record<RegistrySubjectKind, {
  work: WorkKind; manifestation: ManifestationKind; product: ProductKind;
  workSchemes: IdScheme[]; manifestationSchemes: IdScheme[]; productSchemes: IdScheme[];
}> = {
  BOOK: {
    work: 'LITERARY', manifestation: 'BOOK_EDITION', product: 'EBOOK',
    workSchemes: ['ISTC', 'DOI'],
    manifestationSchemes: ['ASIN', 'OLID'],
    productSchemes: ['ISBN13', 'ISBN10', 'GTIN', 'CATALOG_NO'],
  },
  COMIC: {
    work: 'LITERARY', manifestation: 'COMIC_VOLUME', product: 'GRAPHIC_NOVEL',
    workSchemes: ['ISTC'],
    manifestationSchemes: ['ASIN', 'OLID'],
    productSchemes: ['ISBN13', 'ISSN', 'GTIN', 'CATALOG_NO'],
  },
  ALBUM: {
    work: 'MUSICAL', manifestation: 'SOUND_RECORDING', product: 'ALBUM',
    workSchemes: [],
    manifestationSchemes: [],
    productSchemes: ['GTIN', 'GRID', 'CATALOG_NO'],
  },
  TRACK: {
    work: 'MUSICAL', manifestation: 'SOUND_RECORDING', product: 'SINGLE',
    workSchemes: ['ISWC'],
    manifestationSchemes: ['ISRC'],
    productSchemes: ['GTIN', 'CATALOG_NO'],
  },
  FILM: {
    work: 'AUDIOVISUAL', manifestation: 'AV_EDIT', product: 'FEATURE',
    workSchemes: ['ISAN'],
    manifestationSchemes: ['EIDR', 'IMDB', 'TMDB'],
    productSchemes: ['GTIN', 'CATALOG_NO'],
  },
  EPISODE: {
    work: 'AUDIOVISUAL', manifestation: 'AV_EDIT', product: 'EPISODE',
    workSchemes: ['ISAN'],
    manifestationSchemes: ['EIDR', 'IMDB', 'TMDB'],
    productSchemes: ['CATALOG_NO'],
  },
};

export type RegistryLayer = 'work' | 'manifestation' | 'product';

/** Which identifier schemes to offer for a subject, per layer. Drives the UI, nothing else. */
export function schemesFor(kind: RegistrySubjectKind, layer: RegistryLayer): IdScheme[] {
  const p = SUBJECT_PROFILE[kind];
  return layer === 'work' ? p.workSchemes : layer === 'manifestation' ? p.manifestationSchemes : p.productSchemes;
}

// ─── Opt-in gate ──────────────────────────────────────────────────────────────

/**
 * Whether an account has switched the registry on. Read from the user doc rather than a
 * capability, because this is a deliberate choice by the owner, not a property of their
 * account type — a FAN who self-publishes one book may want it; most ARTISTs will not.
 */
export async function isRegistryEnabled(uid?: string): Promise<boolean> {
  const id = uid || auth.currentUser?.uid;
  if (!id) return false;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    return snap.exists() && snap.data()?.registryOptIn === true;
  } catch { return false; }
}

/** Turn the Rights & Identifiers surface on or off for the signed-in account. */
export async function setRegistryOptIn(on: boolean, uid?: string): Promise<void> {
  const id = uid || auth.currentUser?.uid;
  if (!id) throw new Error('Sign in to change this setting.');
  await updateDoc(doc(db, 'users', id), { registryOptIn: on, registryOptInAt: Date.now() });
}

// ─── The record ───────────────────────────────────────────────────────────────

export interface RegistryRecord {
  subject: RegistrySubject;
  work: RegistryWork;
  manifestation: RegistryManifestation;
  product: RegistryProduct;
}

/** Strip `undefined` values — Firestore throws on them, silently breaking the whole write. */
function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !(v instanceof Date) ? clean(v) : v;
  }
  return out as T;
}

/** Time-ordered id. Not a UUIDv7 implementation — sortable and collision-safe is enough here. */
function newId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

function arkIdentifier(shoulder: 'w' | 'm' | 'p'): ExternalId[] {
  const ark = mintArk(shoulder);
  if (!ark) return [];   // no NAAN yet — never fabricate one
  return [{ scheme: 'ARK', value: ark, status: 'VERIFIED', source: 'PLAJAH_ASSIGNED', assertedAt: Date.now() }];
}

/** Load the triple for a subject, or null when the owner has never opened the panel. */
export async function loadRegistryRecord(subject: RegistrySubject): Promise<RegistryRecord | null> {
  const refSnap = await getDoc(doc(db, REFS, subjectKey(subject)));
  if (!refSnap.exists()) return null;
  const ref = refSnap.data() as { workId: string; manifestationId: string; productId: string };
  const [w, m, p] = await Promise.all([
    getDoc(doc(db, WORKS, ref.workId)),
    getDoc(doc(db, MANIFESTATIONS, ref.manifestationId)),
    getDoc(doc(db, PRODUCTS, ref.productId)),
  ]);
  if (!w.exists() || !m.exists() || !p.exists()) return null;
  return {
    subject,
    work: w.data() as RegistryWork,
    manifestation: m.data() as RegistryManifestation,
    product: p.data() as RegistryProduct,
  };
}

/**
 * Load the record, creating the triple on first use. ARKs are minted once, here, and never
 * re-minted — an identifier that changes is not an identifier.
 */
export async function ensureRegistryRecord(subject: RegistrySubject): Promise<RegistryRecord> {
  const existing = await loadRegistryRecord(subject);
  if (existing) return existing;

  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use the registry.');

  const now = Date.now();
  const profile = SUBJECT_PROFILE[subject.kind];
  const title = subject.title?.trim() || 'Untitled';
  const creator = subject.creatorName?.trim() || user.displayName || 'Unknown';

  const work: RegistryWork = clean({
    id: newId('work'),
    kind: profile.work,
    titles: [{ value: title, kind: 'ORIGINAL' as const }],
    identifiers: arkIdentifier('w'),
    contributors: [{
      partyId: `uid:${user.uid}`,
      displayName: creator,
      role: profile.work === 'MUSICAL' ? 'CA' : profile.work === 'AUDIOVISUAL' ? 'SCREENWRITER' : 'AUTHOR',
      controlled: true,
      sharePerf: 100,
      shareMech: 100,
    } as WorkContributor],
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
  });

  const manifestation: RegistryManifestation = clean({
    id: newId('manif'),
    kind: profile.manifestation,
    title,
    identifiers: arkIdentifier('m'),
    workUses: [{ workId: work.id, percentage: 100 }],
    credits: [],
    masterOwners: [{
      partyId: `uid:${user.uid}`,
      displayName: creator,
      rightType: 'MASTER' as const,
      percentage: 100,
    }],
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
  });

  const product: RegistryProduct = clean({
    id: newId('prod'),
    kind: profile.product,
    title,
    identifiers: arkIdentifier('p'),
    displayArtist: creator,
    mainParties: [{
      partyId: `uid:${user.uid}`,
      role: profile.work === 'LITERARY' ? 'AUTHOR' as const : 'MAIN_ARTIST' as const,
    }],
    items: [{ sequence: 1, manifestationId: manifestation.id, title }],
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
  });

  await Promise.all([
    setDoc(doc(db, WORKS, work.id), clean({ ...work, ownerUid: user.uid })),
    setDoc(doc(db, MANIFESTATIONS, manifestation.id), clean({ ...manifestation, ownerUid: user.uid })),
    setDoc(doc(db, PRODUCTS, product.id), clean({ ...product, ownerUid: user.uid })),
  ]);
  await setDoc(doc(db, REFS, subjectKey(subject)), clean({
    ownerUid: user.uid,
    subjectKind: subject.kind,
    subjectId: subject.id,
    subjectTitle: title,
    workId: work.id,
    manifestationId: manifestation.id,
    productId: product.id,
    createdAt: now,
    updatedAt: serverTimestamp(),
  }));

  return { subject, work, manifestation, product };
}

// ─── Identifiers ──────────────────────────────────────────────────────────────

const COLLECTION_FOR: Record<RegistryLayer, string> = {
  work: WORKS, manifestation: MANIFESTATIONS, product: PRODUCTS,
};

function entityFor(record: RegistryRecord, layer: RegistryLayer) {
  return layer === 'work' ? record.work : layer === 'manifestation' ? record.manifestation : record.product;
}

export interface SetIdentifierResult {
  ok: boolean;
  reason?: string;
  identifiers?: ExternalId[];
}

/**
 * Add or replace an identifier on one layer. Rejects anything that fails its check digit —
 * catching a bad ISBN here is the entire point, because downstream it surfaces as a rejected
 * delivery weeks later.
 */
export async function setIdentifier(
  record: RegistryRecord,
  layer: RegistryLayer,
  scheme: IdScheme,
  rawValue: string,
  source: IdSource = 'USER',
): Promise<SetIdentifierResult> {
  const check = validateId(scheme, rawValue);
  if (!check.valid) return { ok: false, reason: check.reason || 'Not a valid identifier' };

  const entity = entityFor(record, layer);
  const now = Date.now();
  const next: ExternalId = clean({
    scheme,
    value: check.normalized,
    // The owner asserting their own ISBN is not verification — nothing was checked against
    // the issuing registry. Only Plajah-minted values start life VERIFIED.
    status: source === 'PLAJAH_ASSIGNED' ? 'VERIFIED' : 'ASSERTED',
    source,
    assertedBy: auth.currentUser?.uid ? `uid:${auth.currentUser.uid}` : undefined,
    assertedAt: now,
  });

  const identifiers = [...(entity.identifiers || []).filter(i => i.scheme !== scheme), next];
  await updateDoc(doc(db, COLLECTION_FOR[layer], entity.id), { identifiers: clean({ identifiers }).identifiers, updatedAt: now });
  entity.identifiers = identifiers;
  return { ok: true, identifiers };
}

/** Remove an identifier. Plajah-minted ARKs are not removable — persistence is the promise. */
export async function removeIdentifier(
  record: RegistryRecord,
  layer: RegistryLayer,
  scheme: IdScheme,
): Promise<SetIdentifierResult> {
  if (scheme === 'ARK') return { ok: false, reason: 'An ARK is permanent once minted.' };
  const entity = entityFor(record, layer);
  const identifiers = (entity.identifiers || []).filter(i => i.scheme !== scheme);
  await updateDoc(doc(db, COLLECTION_FOR[layer], entity.id), { identifiers, updatedAt: Date.now() });
  entity.identifiers = identifiers;
  return { ok: true, identifiers };
}

export function findIdentifier(entity: { identifiers?: ExternalId[] }, scheme: IdScheme): ExternalId | undefined {
  return (entity.identifiers || []).find(i => i.scheme === scheme);
}

/** Mint the ARK for a layer that predates the NAAN being configured. No-op when already set. */
export async function backfillArk(record: RegistryRecord, layer: RegistryLayer): Promise<string | null> {
  if (!arkAvailable()) return null;
  const entity = entityFor(record, layer);
  const existing = findIdentifier(entity, 'ARK');
  if (existing) return existing.value;
  const shoulder = layer === 'work' ? 'w' : layer === 'manifestation' ? 'm' : 'p';
  const minted = arkIdentifier(shoulder);
  if (!minted.length) return null;
  const identifiers = [...(entity.identifiers || []), ...minted];
  await updateDoc(doc(db, COLLECTION_FOR[layer], entity.id), { identifiers, updatedAt: Date.now() });
  entity.identifiers = identifiers;
  return minted[0].value;
}

// ─── Content hash (free duplicate detection) ──────────────────────────────────

/**
 * Record the SHA-256 of the actual bytes on the manifestation. This is exact-duplicate
 * detection — the same file delivered twice resolves to the same hash.
 *
 * It is deliberately NOT called an ISCC. ISCC (ISO 24138) is blake3-based with a specific
 * header encoding and near-duplicate clustering; shipping a SHA-256 under that name would be
 * a false conformance claim. ISCC lands in Phase 2, verified against the published test
 * vectors, and will sit alongside this field rather than replacing it.
 */
export async function setContentHash(
  record: RegistryRecord,
  sha256: string,
  technical?: Partial<RegistryManifestation['technical']>,
): Promise<void> {
  const merged = clean({ ...(record.manifestation.technical || {}), ...(technical || {}), sha256 });
  await updateDoc(doc(db, MANIFESTATIONS, record.manifestation.id), {
    technical: merged, updatedAt: Date.now(),
  });
  record.manifestation.technical = merged as RegistryManifestation['technical'];
}

// ─── Contributors & splits ────────────────────────────────────────────────────

/** Sum of a share field across contributors, for the 100% validation the UI shows live. */
export function shareTotal(contributors: WorkContributor[], field: 'sharePerf' | 'shareMech' | 'shareSync'): number {
  return contributors.reduce((sum, c) => sum + (Number(c[field]) || 0), 0);
}

/**
 * Replace the work's contributor list. Shares that don't total 100 are saved anyway — the
 * registry records what the owner asserts — but the imbalance is stamped on the work so
 * export can refuse it later rather than shipping a registration a PRO will reject.
 */
export async function setContributors(record: RegistryRecord, contributors: WorkContributor[]): Promise<void> {
  const perf = shareTotal(contributors, 'sharePerf');
  const mech = shareTotal(contributors, 'shareMech');
  const warning = perf !== 100 || mech !== 100
    ? `Shares total ${perf}% performance / ${mech}% mechanical — both must be 100% before this can be registered.`
    : '';
  await updateDoc(doc(db, WORKS, record.work.id), clean({
    contributors: contributors.map(c => clean(c)),
    shareWarning: warning,
    updatedAt: Date.now(),
  }));
  record.work.contributors = contributors;
  record.work.shareWarning = warning || undefined;
}

// ─── Listing (the settings surface) ───────────────────────────────────────────

export interface RegistryRefRow {
  subjectKind: RegistrySubjectKind;
  subjectId: string;
  subjectTitle?: string;
  workId: string;
  manifestationId: string;
  productId: string;
  createdAt?: number;
}

/**
 * Everything this account has a rights record for. A single where() — no orderBy, so no
 * composite index is needed; sorting happens client-side.
 */
export async function listRegistryRefs(uid?: string): Promise<RegistryRefRow[]> {
  const id = uid || auth.currentUser?.uid;
  if (!id) return [];
  const snap = await getDocs(query(collection(db, REFS), where('ownerUid', '==', id)));
  return snap.docs
    .map(d => d.data() as RegistryRefRow)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Update the human-facing title across the triple when the underlying content is renamed. */
export async function syncTitle(record: RegistryRecord, title: string): Promise<void> {
  const t = title.trim();
  if (!t || t === record.product.title) return;
  const now = Date.now();
  await Promise.all([
    updateDoc(doc(db, REFS, subjectKey(record.subject)), { subjectTitle: t, updatedAt: now }),
    updateDoc(doc(db, WORKS, record.work.id), {
      titles: [{ value: t, kind: 'ORIGINAL' }, ...(record.work.titles || []).filter(x => x.kind !== 'ORIGINAL')],
      updatedAt: now,
    }),
    updateDoc(doc(db, MANIFESTATIONS, record.manifestation.id), { title: t, updatedAt: now }),
    updateDoc(doc(db, PRODUCTS, record.product.id), { title: t, updatedAt: now }),
  ]);
  record.product.title = t;
  record.manifestation.title = t;
}
