// careerImport/types — the shape everything a creator has ever made gets normalised into.
//
// A creator arrives with a decade of work scattered across services and meets an empty platform.
// This is the vocabulary for pulling that back in. Phase 0 covers the OPEN lane only: public
// metadata and feeds that are designed to be fetched. No authentication, no ownership gate, and
// no media except where the format exists to be downloaded (podcast enclosures, Audius streams).
//
// Everything produced here is a DRAFT. Nothing is written to the platform until a human accepts
// it — that is both the product decision and the legal one. See docs: the ownership gate and the
// gated/closed lanes arrive in P2.

export type StagedKind = 'RELEASE' | 'TRACK' | 'EPISODE' | 'BOOK' | 'VIDEO';

/** Which part of the platform this item becomes once committed. */
export type Destination = 'CHORA' | 'LOREA' | 'REELLO' | 'TALEO' | 'PODCAST';

export type SourceId = 'audius' | 'podcast' | 'musicbrainz' | 'openlibrary';

/** How the item may be treated — mirrors the three lanes in the spec. */
export type Lane =
  /** Public metadata AND media that the format intends to be fetched. */
  | 'OPEN'
  /** Metadata only; the file stays where it is until ownership is proven (P2). */
  | 'METADATA_ONLY';

export interface StagedItem {
  /** Stable within one scan, so the review UI can key and dedupe on it. */
  id: string;
  kind: StagedKind;
  destination: Destination;
  lane: Lane;
  sourceId: SourceId;

  title: string;
  /** Artist, author, or show — whoever it is credited to. */
  byline?: string;
  description?: string;
  artwork?: string;
  /** Epoch ms. Undefined when the source gives nothing trustworthy — never guessed. */
  releasedAt?: number;
  /** Where this came from, so a human can check the claim. */
  externalUrl?: string;
  /** Only ever set for OPEN-lane items. */
  mediaUrl?: string;
  durationSec?: number;

  /**
   * 0..1. Review sorts ASCENDING by this — uncertainty first — because a confident row needs
   * no attention and an unsure one is the entire reason a human is in the loop.
   */
  confidence: number;
  /** Source-specific extras (track lists, ISBNs, MBIDs) carried for later phases. */
  meta?: Record<string, any>;
}

export interface SourceResult {
  sourceId: SourceId;
  label: string;
  items: StagedItem[];
  /** Set when the source was reached but returned nothing useful, or could not be reached. */
  note?: string;
  ok: boolean;
}

export interface ScanResult {
  results: SourceResult[];
  items: StagedItem[];
  scannedAt: number;
}

/** What a pasted string turned out to be. */
export interface ResolvedInput {
  sourceId: SourceId | null;
  /** Handle, feed URL, MBID, or free-text name — whatever that source needs. */
  value: string;
  label: string;
}

export const DESTINATION_LABEL: Record<Destination, string> = {
  CHORA: 'Chora',
  LOREA: 'Lorea',
  REELLO: 'Reello',
  TALEO: 'Taleo',
  PODCAST: 'Podcasts',
};
