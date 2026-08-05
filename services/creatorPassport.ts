// creatorPassport.ts — Creator Passport provenance (blueprint Part 1C.5).
//
// ⚠️ HONESTY NOTE — READ BEFORE EXTENDING ⚠️
// This is an ATTRIBUTION RECORD, not cryptographic proof. Nothing here is signed,
// hashed, anchored, or verifiable by a third party. A provenance stamp says
// "Plajah's database recorded this upload as originating from this account at this
// time" and nothing stronger. It is exactly as trustworthy as Plajah's database.
//
// What it is NOT (do not let UI copy imply otherwise):
//   · not a signature — no keypair exists yet, no DID, no AT-Proto record
//   · not tamper-evident — a Firestore write can change it with no trace
//   · not a Bitcoin/blockchain timestamp — nothing is anchored anywhere
//   · not content-derived — we do not hash the media, so a re-encode is invisible
//
// The Creator Passport Phase 0 spec (see the creator-passport memo) plans the real
// version: an AT-Proto-backed portable identity plus a timestamped record. When that
// lands, `passportId` becomes a real DID and `signature`/`anchor` fields get added
// here; `resolveOrigin()` keeps its shape. Until then the value of this layer is
// practical, not cryptographic: reused/remixed content always resolves back to a
// concrete origin video and origin owner instead of losing its lineage.
//
// Firestore: provenance lives INSIDE the existing `videos/{id}` doc (Video.provenance),
// so it needs no new collection and no new security rule beyond the ones that already
// govern video reads/writes.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Video } from '../types';

export type Provenance = NonNullable<Video['provenance']>;

/** How many links of a remix chain we will walk before giving up (cycle guard). */
const MAX_CHAIN = 8;

/**
 * The account's passport identifier. Today this is simply a namespaced form of the
 * Plajah uid — a stable handle, NOT a cryptographic identity. When the real Creator
 * Passport (AT-Proto DID) ships, this function is the single place to swap.
 */
export function passportIdFor(uid: string): string {
  return `plajah:${uid}`;
}

/** True if this looks like a placeholder passport id rather than a real DID. */
export function isPlaceholderPassport(passportId?: string): boolean {
  return !passportId || passportId.startsWith('plajah:');
}

/**
 * Build the provenance record to stamp onto a NEW upload.
 *
 * · An original upload points at itself: originVideoId = its own id, originOwnerId =
 *   the uploader. That makes "resolve to origin" a total function — every stamped
 *   video has an origin, even when it is the origin.
 * · A remix/reprise inherits the ORIGIN of its source (not the source itself), so a
 *   chain of remixes still resolves in one hop to the true first work.
 *
 * Returns a plain object with NO undefined values — Firestore rejects undefined
 * ([[plajah-firestore-gotchas]]) — so it is safe to spread straight into a doc.
 */
export function buildProvenance(input: {
  videoId: string;
  ownerId: string;
  /** Provenance of the source video, when this upload is a remix of something. */
  sourceProvenance?: Provenance | null;
  /** The source video's id, when known and the source itself carried no provenance. */
  sourceVideoId?: string | null;
  /** The source video's owner, when known and the source itself carried no provenance. */
  sourceOwnerId?: string | null;
  at?: number;
}): Provenance {
  const stampedAt = input.at ?? Date.now();
  const src = input.sourceProvenance;

  const originVideoId =
    src?.originVideoId || input.sourceVideoId || input.videoId;
  const originOwnerId =
    src?.originOwnerId || input.sourceOwnerId || input.ownerId;

  const out: Provenance = {
    passportId: passportIdFor(input.ownerId),
    originVideoId,
    originOwnerId,
    stampedAt,
  };
  return stripUndefined(out);
}

/** Drop any key whose value is undefined — Firestore throws on undefined writes. */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Stamp provenance onto an ALREADY-CREATED video document. Non-fatal by design: a
 * failed stamp must never break an upload that otherwise succeeded, so this swallows
 * and logs. Callers may ignore the return value.
 *
 * Idempotent-ish: if the doc already carries a stampedAt we leave it alone rather than
 * overwrite an earlier (more truthful) claim with a later one.
 */
export async function stampVideo(videoId: string, ownerId: string, opts?: {
  remixOfVideoId?: string;
}): Promise<Provenance | null> {
  try {
    const ref = doc(db, 'videos', videoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const existing = (snap.data() as Partial<Video>).provenance;
    if (existing?.stampedAt) return existing as Provenance;

    let sourceProvenance: Provenance | null = null;
    let sourceOwnerId: string | null = null;
    const srcId = opts?.remixOfVideoId || (snap.data() as Partial<Video>).remixOfVideoId;
    if (srcId) {
      const srcSnap = await getDoc(doc(db, 'videos', srcId));
      if (srcSnap.exists()) {
        const sv = srcSnap.data() as Partial<Video>;
        sourceProvenance = (sv.provenance as Provenance) || null;
        sourceOwnerId = sv.ownerId || null;
      }
    }

    const provenance = buildProvenance({
      videoId, ownerId, sourceProvenance,
      sourceVideoId: srcId || null,
      sourceOwnerId,
    });
    await updateDoc(ref, { provenance });
    return provenance;
  } catch (err) {
    console.error('[creatorPassport] stampVideo failed:', err);
    return null;
  }
}

export interface OriginResolution {
  /** The video this one ultimately derives from (may be the video itself). */
  originVideoId: string | null;
  originOwnerId: string | null;
  /** The origin video document, when it could be fetched. */
  origin: Video | null;
  /** True when the video IS its own origin (an original upload). */
  isOriginal: boolean;
  /** How many remix links were walked to get here. */
  hops: number;
  /** Why this could not be resolved, when it could not. */
  reason?: 'unstamped' | 'missing' | 'error';
}

/**
 * Resolve a (possibly remixed) video back to its origin.
 *
 * Fast path: a stamped video already carries originVideoId, so this is one read.
 * Slow path: an UNSTAMPED remix (legacy content, uploaded before this shipped) is
 * walked link-by-link via `remixOfVideoId`, bounded by MAX_CHAIN and a visited set so
 * a malformed cycle cannot hang the caller.
 */
export async function resolveOrigin(video: Pick<Video, 'id' | 'ownerId'> & Partial<Video>): Promise<OriginResolution> {
  try {
    const prov = video.provenance as Provenance | undefined;

    // Stamped — the answer is already on the record.
    if (prov?.originVideoId) {
      const isOriginal = prov.originVideoId === video.id;
      const origin = isOriginal ? (video as Video) : await fetchVideoDoc(prov.originVideoId);
      return {
        originVideoId: prov.originVideoId,
        originOwnerId: prov.originOwnerId || origin?.ownerId || null,
        origin: origin || null,
        isOriginal,
        hops: isOriginal ? 0 : 1,
      };
    }

    // Unstamped — walk the remix chain if there is one.
    let current: Partial<Video> | null = video;
    let hops = 0;
    const seen = new Set<string>([video.id]);
    while (current?.remixOfVideoId && hops < MAX_CHAIN) {
      const nextId: string = current.remixOfVideoId;
      if (seen.has(nextId)) break;      // cycle — stop where we are
      seen.add(nextId);
      const next = await fetchVideoDoc(nextId);
      if (!next) break;
      hops++;
      current = next;
      // If we hit a stamped ancestor, trust its origin and stop walking.
      const p = next.provenance as Provenance | undefined;
      if (p?.originVideoId) {
        const origin = p.originVideoId === next.id ? next : await fetchVideoDoc(p.originVideoId);
        return {
          originVideoId: p.originVideoId,
          originOwnerId: p.originOwnerId || origin?.ownerId || null,
          origin: origin || null,
          isOriginal: false,
          hops: hops + (p.originVideoId === next.id ? 0 : 1),
        };
      }
    }

    if (hops === 0) {
      // No provenance and no remix link — we simply don't know. Say so; don't guess
      // that it is original just because we have no evidence to the contrary.
      return { originVideoId: null, originOwnerId: null, origin: null, isOriginal: false, hops: 0, reason: 'unstamped' };
    }
    return {
      originVideoId: current?.id || null,
      originOwnerId: current?.ownerId || null,
      origin: (current as Video) || null,
      isOriginal: false,
      hops,
    };
  } catch (err) {
    console.error('[creatorPassport] resolveOrigin failed:', err);
    return { originVideoId: null, originOwnerId: null, origin: null, isOriginal: false, hops: 0, reason: 'error' };
  }
}

async function fetchVideoDoc(id: string): Promise<Video | null> {
  try {
    const snap = await getDoc(doc(db, 'videos', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Video, 'id'>) };
  } catch {
    return null;
  }
}

/**
 * One-line summary for UI. Deliberately hedged wording — "recorded", never "verified"
 * or "proven", because no verification takes place (see the honesty note above).
 */
export function describeProvenance(res: OriginResolution): string {
  if (res.reason === 'unstamped') return 'No origin record for this upload.';
  if (res.reason) return 'Origin could not be checked right now.';
  if (res.isOriginal) return 'Recorded as an original upload on Plajah.';
  return res.hops > 1
    ? `Recorded as derived from an earlier work, ${res.hops} steps back.`
    : 'Recorded as derived from an earlier work.';
}
