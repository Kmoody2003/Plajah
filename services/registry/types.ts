/**
 * Plajah Identifier Registry — canonical schema (Phase 0, types only).
 *
 * See docs/PLAJAH_IDENTIFIER_LEDGER_BLUEPRINT.md for the research and rationale.
 *
 * THE MODEL
 * ─────────
 * Every media industry converged on the same five-layer ladder. This file is that ladder,
 * once, with per-vertical vocabulary rather than three parallel schemas:
 *
 *   Party         who         (artist / writer / publisher / label / studio / estate)
 *   Work          the abstract creation      → ISWC (music), ISTC (books), EIDR abstraction
 *   Manifestation a specific fixation of it  → ISRC (recording), book edition, EIDR edit
 *   Product       the sellable package       → UPC/GTIN, ISBN-13, GRid, catalogue number
 *   Claim         who asserts which right over which of the above, where, when
 *
 * TWO RULES THIS SCHEMA ENFORCES
 * ──────────────────────────────
 * 1. No bare foreign identifiers. `isrc: string` becomes a lie the moment two sources
 *    disagree. Every external ID is an `ExternalId` carrying who asserted it, when, from
 *    what source, and whether it has been verified against the issuing registry.
 * 2. The registry is ADDITIVE. Existing `Track`/`Album`/`Book`/`Video` docs get one optional
 *    `RegistryRef` (see `RegistryRef` below) plus cached display identifiers. No migration.
 *
 * HONESTY NOTE (mirrors services/creatorPassport.ts)
 * ──────────────────────────────────────────────────
 * Until Phase 3 lands, a registry record is a Firestore row: nothing is signed, hashed or
 * anchored, and it proves exactly as much as Plajah's database. `LedgerStatement` and
 * `RegistryEpoch` below describe the target design, not shipped behaviour. Do not let UI
 * copy say "verified on the ledger" before the signing and anchoring code exists.
 *
 * Firestore gotchas that apply to every write built on these types:
 *   · never write `undefined` — build optional sub-objects conditionally
 *   · any where(...)+orderBy(...) query needs a composite index declared up front
 */

// ─────────────────────────────────────────────────────────────────────────────
// Identifier primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every identifier scheme the registry can hold. Plajah IDs (`PLJ_*`) are internal;
 * everything else is a foreign key into someone else's registry.
 */
export type IdScheme =
  // ── Plajah / open, free, no registrar
  | 'PLJ'          // plj:<layer>:<id> — internal canonical id
  | 'ARK'          // Archival Resource Key — free NAAN, self-minted, resolvable via n2t.net
  | 'ISCC'         // ISO 24138:2024 — content-derived, computed from the file, no assignment
  | 'DID'          // Creator Passport (did:plc:… / did:web:…)
  | 'C2PA'         // content credentials manifest id
  // ── Party
  | 'IPI'          // 11-digit CAE/IPI name number — what ASCAP/BMI/PRS key writers on
  | 'ISNI'         // ISO 27729 — public identity of a person/organisation
  | 'ORCID'        // researchers/authors
  | 'DPID'         // DDEX Party ID (free)
  | 'LABEL_CODE'   // IFPI/GVL "LC" label code
  | 'GS1_PREFIX'   // GS1 company prefix (issues the GTINs below)
  | 'PRO_MEMBER'   // society-internal member number
  // ── Music
  | 'ISRC'         // sound recording
  | 'ISWC'         // musical work / composition
  | 'GRID'         // Global Release Identifier (digital release product)
  // ── Books
  | 'ISBN13'
  | 'ISBN10'       // legacy; normalise to ISBN13 on ingest
  | 'ISTC'         // textual work (the ISWC-equivalent; rarely populated in practice)
  | 'ISSN'         // serials
  | 'LCCN'
  | 'DOI'
  | 'ASIN'         // Amazon — what a KDP ebook is actually identified by (no ISBN involved)
  | 'OLID'         // Open Library id — free, open catalogue presence without an ISBN
  // ── Film / TV
  | 'EIDR'
  | 'ISAN'
  | 'AD_ID'
  | 'IMDB'
  | 'TMDB'
  // ── Retail
  | 'GTIN'         // UPC-12 / EAN-13 normalised to GTIN
  | 'CATALOG_NO'   // the label's own sequence — no authority issues it, the label owns it
  | 'SKU';

/** How much we trust a foreign identifier. Set by the ingest source, upgraded by verification. */
export type IdStatus =
  | 'ASSERTED'   // someone told us; unverified
  | 'VERIFIED'   // checked against the issuing registry or an authoritative feed
  | 'DISPUTED'   // two sources disagree — surface both, resolve nothing automatically
  | 'RETIRED';   // superseded (e.g. a duplicate ISRC withdrawn by the label)

/** Where an assertion came from. Drives trust ranking when sources conflict. */
export type IdSource =
  | 'USER'            // typed into Plajah by the owner
  | 'PLAJAH_ASSIGNED' // minted by Plajah from its own registrant code / prefix
  | 'COMPUTED'        // derived from the file (ISCC)
  | 'DDEX_ERN'
  | 'DDEX_CTS'        // Catalogue Transfer Standard 1.0
  | 'ONIX'
  | 'CWR'
  | 'EIDR_API'
  | 'SPREADSHEET'
  | 'PARTNER_FEED';

export interface ExternalId {
  scheme: IdScheme;
  /** Normalised form — no hyphens/spaces, upper case (see identifiers.ts `normalize`). */
  value: string;
  status: IdStatus;
  source: IdSource;
  /** RegistryParty id of whoever asserted it (a label's claim ≠ the artist's claim). */
  assertedBy?: string;
  assertedAt: number;
  verifiedAt?: number;
  /** Free-text or URI pointing at the contract, delivery batch, or registry response. */
  evidence?: string;
  /** Set when this identifier lost a conflict; points at the winning ExternalId value. */
  supersededBy?: string;
}

/** The one optional field added to existing Track/Album/Book/Video docs. */
export interface RegistryRef {
  workId?: string;
  manifestationId?: string;
  productId?: string;
  /** Denormalised for display only — the registry entities remain the source of truth. */
  cached?: {
    isrc?: string;
    iswc?: string;
    gtin?: string;
    isbn?: string;
    eidr?: string;
    iscc?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Party
// ─────────────────────────────────────────────────────────────────────────────

export type PartyKind =
  | 'ARTIST'      // performer / recording artist (may be a Worlds Character persona)
  | 'WRITER'      // songwriter / author / screenwriter
  | 'PUBLISHER'   // music publisher or book publisher
  | 'LABEL'
  | 'IMPRINT'
  | 'STUDIO'
  | 'DISTRIBUTOR'
  | 'ESTATE'
  | 'SOCIETY'     // PRO / CMO
  | 'ORGANISATION';

export interface PartyName {
  /** The name as it should display. */
  value: string;
  kind: 'LEGAL' | 'PERFORMING' | 'ALIAS' | 'TRANSLITERATION' | 'FORMER';
  language?: string;
  primary?: boolean;
}

export interface RegistryParty {
  id: string;                   // plj:party:<uuidv7>
  kind: PartyKind;
  names: PartyName[];
  identifiers: ExternalId[];    // IPI, ISNI, DPID, LABEL_CODE, GS1_PREFIX, DID…

  /** Link into Plajah's own world, when the party has a presence here. */
  plajahUid?: string;
  /** Creator Passport DID — what makes this party's history portable off Plajah. */
  did?: string;
  /** Organization backbone id when the party is a label/studio account with RBAC roles. */
  orgId?: string;
  /** Artist personas are independent Worlds Characters — never overwrite from account name. */
  characterId?: string;
  worldId?: string;

  /** Society affiliations — drives which PRO a CWR registration must be routed to. */
  affiliations?: PartyAffiliation[];
  /** Parent label/publisher, for imprint hierarchies. */
  parentPartyId?: string;

  countryCode?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;            // uid
}

export interface PartyAffiliation {
  societyCode: string;          // CISAC society code, e.g. '010' ASCAP, '021' BMI
  societyName: string;
  role: 'WRITER' | 'PUBLISHER';
  ipi?: string;
  territories?: string[];       // ISO 3166-1 alpha-2, or 'WORLD'
  from?: number;
  until?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Work — the abstract creation
// ─────────────────────────────────────────────────────────────────────────────

export type WorkKind = 'MUSICAL' | 'LITERARY' | 'AUDIOVISUAL' | 'DRAMATIC' | 'VISUAL';

/**
 * CISAC/CWR contributor role codes, kept verbatim so CWR export is a straight mapping.
 * Music: CA composer/author, C composer, A author (lyricist), AR arranger, AD adaptor,
 * SR sub-arranger, SA sub-author, TR translator, PA publisher-acquirer, E original publisher,
 * AM administrator, SE sub-publisher.
 * Book/AV roles are Plajah extensions where CWR has no equivalent.
 */
export type ContributorRole =
  | 'CA' | 'C' | 'A' | 'AR' | 'AD' | 'SR' | 'SA' | 'TR'
  | 'E' | 'AM' | 'SE' | 'PA'
  | 'AUTHOR' | 'CO_AUTHOR' | 'EDITOR' | 'ILLUSTRATOR' | 'TRANSLATOR'
  | 'SCREENWRITER' | 'DIRECTOR' | 'CREATOR';

export interface WorkContributor {
  partyId: string;
  /** Denormalised for display; the party record stays authoritative. */
  displayName: string;
  role: ContributorRole;
  ipi?: string;
  /**
   * Whether this writer's share is controlled by the submitting publisher. CWR requires it,
   * and it is the single most common cause of a rejected PRO registration.
   */
  controlled: boolean;
  /** Percentages, 0–100. Perf and mech are tracked separately because they diverge. */
  sharePerf?: number;
  shareMech?: number;
  shareSync?: number;
  /** Publisher chain for this writer's share, ordered original → sub-publisher. */
  publisherChain?: { partyId: string; role: 'E' | 'AM' | 'SE' | 'PA'; sharePerf?: number; shareMech?: number }[];
}

export interface WorkTitle {
  value: string;
  kind: 'ORIGINAL' | 'ALTERNATE' | 'TRANSLATED' | 'FORMAL' | 'PART_OF_SERIES';
  language?: string;
}

export interface RegistryWork {
  id: string;                   // plj:work:<uuidv7>
  kind: WorkKind;
  titles: WorkTitle[];
  identifiers: ExternalId[];    // ISWC, ISTC, DOI…
  contributors: WorkContributor[];

  language?: string;
  /** Seconds — the work's nominal duration where meaningful (music, AV). */
  duration?: number;
  /** Derivative works: samples, adaptations, translations, screen adaptations. */
  derivedFrom?: { workId: string; relation: 'SAMPLE' | 'ADAPTATION' | 'TRANSLATION' | 'ARRANGEMENT' | 'EXCERPT' }[];
  /** True when the work is in the public domain in at least one territory — see `pdTerritories`. */
  publicDomain?: boolean;
  pdTerritories?: string[];

  /** Set when the shares don't sum correctly; blocks CWR export until resolved. */
  shareWarning?: string;

  ownerOrgId?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifestation — a specific fixation of a work
// ─────────────────────────────────────────────────────────────────────────────

export type ManifestationKind =
  | 'SOUND_RECORDING'
  | 'MUSIC_VIDEO'
  | 'BOOK_EDITION'
  | 'AUDIOBOOK'
  | 'COMIC_VOLUME'
  | 'AV_EDIT'          // a specific cut of a film/episode
  | 'PODCAST_EPISODE';

/** DDEX RIN-style contributor roles on the recording/fixation itself. */
export type CreditRole =
  | 'MAIN_ARTIST' | 'FEATURED_ARTIST' | 'PERFORMER' | 'ORCHESTRA' | 'CONDUCTOR'
  | 'PRODUCER' | 'CO_PRODUCER' | 'EXECUTIVE_PRODUCER'
  | 'ENGINEER' | 'MIXING_ENGINEER' | 'MASTERING_ENGINEER' | 'RECORDING_ENGINEER'
  | 'PROGRAMMER' | 'REMIXER' | 'ARRANGER'
  | 'NARRATOR' | 'ILLUSTRATOR' | 'COLORIST' | 'LETTERER'
  | 'DIRECTOR' | 'CINEMATOGRAPHER' | 'EDITOR';

export interface Credit {
  partyId?: string;
  displayName: string;
  role: CreditRole;
  instrument?: string;
  /** Order within its role group, for credit-block rendering. */
  sequence?: number;
}

/** Which works this fixation embodies, and how much of each (medleys, sampled works). */
export interface WorkUse {
  workId: string;
  /** 0–100; medleys and mashups split across works. Defaults to 100 when omitted. */
  percentage?: number;
  /** Start/end seconds within the manifestation, for cue sheets and sample clearance. */
  startSec?: number;
  endSec?: number;
  useKind?: 'FEATURED' | 'BACKGROUND' | 'THEME' | 'LOGO' | 'SAMPLE';
}

export interface TechnicalProfile {
  durationSec?: number;
  codec?: string;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  /** Immersive delivery tier — Chora already models Atmos and IAMF/Eclipsa releases. */
  immersive?: 'STEREO' | 'BINAURAL' | 'ATMOS' | 'IAMF' | 'AMBISONIC';
  /** Bytes, and the file digest used for dedup alongside the ISCC. */
  byteSize?: number;
  sha256?: string;
  /** Books: page count / word count. Video: resolution + frame rate. */
  pages?: number;
  words?: number;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface RegistryManifestation {
  /** plj:manifest:<ISCC> — content-derived, so the same master always lands on the same id. */
  id: string;
  kind: ManifestationKind;
  title: string;
  identifiers: ExternalId[];    // ISCC, ISRC, EIDR, ISAN, edition identifiers…

  workUses: WorkUse[];
  credits: Credit[];
  /** Sound-recording / edition ownership (the master side), distinct from the work side. */
  masterOwners: RightsShare[];

  technical?: TechnicalProfile;
  /** ℗ line — required by every DSP. */
  pLine?: string;
  recordedAt?: number;
  firstPublishedAt?: number;
  countryOfFixation?: string;
  language?: string;
  explicit?: boolean;
  /** Version marker: 'Radio Edit', 'Live at …', 'Director's Cut', '2nd Edition'. */
  versionTitle?: string;
  /** Territories where this fixation may NOT be exploited. Empty = worldwide. */
  restrictedTerritories?: string[];

  /** Where the bytes live in Plajah, when they live here at all. */
  assetUrl?: string;
  originalAssetUrl?: string;

  /** Set by ingest dedup: another manifestation whose ISCC clusters with this one. */
  possibleDuplicateOf?: string[];

  ownerOrgId?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product — the sellable package
// ─────────────────────────────────────────────────────────────────────────────

export type ProductKind =
  | 'ALBUM' | 'EP' | 'SINGLE' | 'COMPILATION' | 'BOXSET'
  | 'EBOOK' | 'PAPERBACK' | 'HARDCOVER' | 'AUDIOBOOK' | 'COMIC_ISSUE' | 'GRAPHIC_NOVEL'
  | 'FEATURE' | 'SHORT' | 'SEASON' | 'EPISODE' | 'DOCUMENTARY'
  | 'PODCAST_SERIES';

export interface ProductItem {
  /** 1-based position within the product (track number, chapter, episode). */
  sequence: number;
  /** Disc/volume/season grouping, 1-based. */
  group?: number;
  manifestationId: string;
  /** Cached from the manifestation for delivery-file generation. */
  isrc?: string;
  title?: string;
  /** Some items are on the product but not sold separately (bonus, hidden). */
  hidden?: boolean;
}

export interface Artwork {
  uri: string;
  width?: number;
  height?: number;
  kind: 'FRONT_COVER' | 'BACK_COVER' | 'BOOKLET' | 'POSTER' | 'BANNER' | 'THUMBNAIL';
  /** DSP floor is 3000×3000 for music front covers as of 2026 — validated at ingest. */
}

export interface RegistryProduct {
  id: string;                   // plj:product:<uuidv7>
  kind: ProductKind;
  title: string;
  subtitle?: string;
  identifiers: ExternalId[];    // GTIN/UPC, ISBN13, GRID, CATALOG_NO, EIDR…

  /** Billed display artist string, plus the structured parties behind it. */
  displayArtist?: string;
  mainParties: { partyId: string; role: 'MAIN_ARTIST' | 'AUTHOR' | 'PUBLISHER' | 'LABEL' | 'STUDIO' }[];
  labelPartyId?: string;
  /** The label's own sequence — mirrored into `identifiers` as CATALOG_NO. */
  catalogNumber?: string;

  items: ProductItem[];

  releaseDate?: number;
  originalReleaseDate?: number;
  /** Territories of release. Empty = worldwide. */
  territories?: string[];
  cLine?: string;
  pLine?: string;
  genres?: string[];
  /** Per-DSP genre overrides, keyed by DSP id — genre taxonomies never match. */
  genreMap?: Record<string, string>;
  parentalAdvisory?: 'NONE' | 'EXPLICIT' | 'CLEANED';
  artwork?: Artwork[];
  language?: string;

  /** Books: which edition/format this product represents of a shared work. */
  editionStatement?: string;
  /** BISAC (US) and Thema (international) subject codes, for ONIX export. */
  bisac?: string[];
  thema?: string[];

  /** Link back into Plajah's own surfaces, when this product is published here. */
  plajahAlbumId?: string;
  plajahBookId?: string;
  plajahVideoId?: string;

  ownerOrgId?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rights, shares and claims
// ─────────────────────────────────────────────────────────────────────────────

export type RightType =
  | 'PERF'          // public performance (PRO territory)
  | 'MECH'          // mechanical reproduction
  | 'SYNC'          // synchronisation into AV
  | 'MASTER'        // sound-recording ownership
  | 'NEIGHBOURING'  // performer/producer neighbouring rights
  | 'PRINT'         // sheet music / print reproduction
  | 'DISTRIBUTION'
  | 'LENDING'
  | 'ADAPTATION';

export interface RightsShare {
  partyId: string;
  displayName?: string;
  rightType: RightType;
  /** 0–100. Validated to sum to 100 per rightType per territory before export. */
  percentage: number;
  territories?: string[];       // empty = WORLD
  from?: number;
  until?: number;
  /** Contract/assignment trail, oldest first. */
  chainOfTitle?: { fromPartyId?: string; toPartyId: string; at: number; evidence?: string }[];
}

export type ClaimStatus =
  | 'ASSERTED'
  | 'CORROBORATED'  // a second independent source agrees
  | 'CONFLICTED'    // overlapping claims exceed 100% — revenue held, not guessed
  | 'RESOLVED'
  | 'WITHDRAWN';

/**
 * An assertion by one party of one right over one entity. The registry stores every claim,
 * including contradictory ones — it is a record of who said what, not an oracle of truth.
 * (The Global Repertoire Database died trying to be the latter.)
 */
export interface RegistryClaim {
  id: string;                   // plj:claim:<uuidv7>
  subjectId: string;            // work / manifestation / product id
  subjectKind: 'WORK' | 'MANIFESTATION' | 'PRODUCT';
  claimantPartyId: string;
  shares: RightsShare[];
  status: ClaimStatus;
  evidence?: { kind: 'CONTRACT' | 'DELIVERY' | 'REGISTRY' | 'STATEMENT' | 'OTHER'; uri?: string; note?: string }[];
  conflictsWith?: string[];     // other claim ids
  resolvedNote?: string;
  /** The ledger statement that recorded this claim, once Phase 3 exists. */
  statementId?: string;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger (Phase 3 target design — nothing below is implemented yet)
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerOp =
  | 'CREATE'
  | 'UPDATE'
  | 'ASSERT_ID'
  | 'ASSERT_CLAIM'
  | 'RESOLVE_CLAIM'
  | 'TRANSFER'
  | 'REVOKE';

/**
 * One signed, canonicalised assertion. Leaves of the Merkle tree; the unit of proof.
 * `payload` is JCS-canonicalised JSON; `payloadHash` is its SHA-256.
 */
export interface LedgerStatement {
  id: string;
  /** Monotonic sequence within the log. */
  seq: number;
  epoch: number;
  subject: string;              // plj:… id the statement is about
  op: LedgerOp;
  payload: unknown;
  payloadHash: string;
  /** Hash of the previous statement — cheap tamper-evidence even before anchoring. */
  prevHash?: string;
  /** DID of the signer (Creator Passport key, passkey-held). */
  signer: string;
  signature: string;
  signedAt: number;
  /** Position in the epoch's Merkle tree, and the audit path proving inclusion. */
  leafIndex?: number;
  inclusionProof?: string[];
  anchors?: LedgerAnchor[];
}

export interface LedgerAnchor {
  /** OTS = OpenTimestamps → Bitcoin (free, aggregated). EVM = optional L2 mirror. */
  kind: 'OTS' | 'EVM';
  /** URI of the .ots proof file, or the transaction hash. */
  ref: string;
  /** Bitcoin block height / EVM block number once the anchor confirms. */
  confirmedAt?: number;
  chain?: string;
}

/** A Signed Tree Head: the root of one epoch's Merkle tree, published and anchored. */
export interface RegistryEpoch {
  epoch: number;
  /** Number of leaves in the tree at this head. */
  size: number;
  rootHash: string;
  prevRootHash?: string;
  /** Plajah's signature over (epoch, size, rootHash) — mirrors can witness this. */
  signature: string;
  signedAt: number;
  anchors: LedgerAnchor[];
  /** Public URI of the exported log segment, so third parties can replicate it. */
  exportUri?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue ingestion (the label on-ramp)
// ─────────────────────────────────────────────────────────────────────────────

export type IngestSource =
  | 'FOLDER'        // files + a spreadsheet — 80% of independent labels
  | 'SPREADSHEET'
  | 'DDEX_ERN'      // ERN 4.x delivery batch
  | 'DDEX_CTS'      // Catalogue Transfer Standard 1.0 — the purpose-built migration format
  | 'ONIX'          // ONIX 3.0/3.1 book feed
  | 'CWR'           // works registration file (import side)
  | 'MMC'           // MovieLabs Media Manifest
  | 'EIDR_API'
  | 'PARTNER_API';

export type IngestStatus =
  | 'DRAFT' | 'UPLOADING' | 'PARSING' | 'VALIDATING'
  | 'DRY_RUN_READY'   // report produced, nothing published — the trust-winning state
  | 'AWAITING_REVIEW' // conflicts need a human
  | 'PUBLISHING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type IssueSeverity = 'BLOCKER' | 'ERROR' | 'WARNING' | 'INFO';

export interface IngestIssue {
  severity: IssueSeverity;
  /** Row/track index or delivery-file path the issue attaches to. */
  locator: string;
  field?: string;
  code: string;                 // 'DUPLICATE_ISRC' | 'ARTWORK_TOO_SMALL' | 'SHARES_NOT_100' | …
  message: string;
  suggestion?: string;
  /** Set when the importer can fix it automatically if the user approves. */
  autoFixable?: boolean;
}

/** Saved column mapping for a given label's spreadsheet dialect. Reusable across deliveries. */
export interface IngestMappingProfile {
  id: string;
  name: string;
  source: IngestSource;
  /** Source column/XPath → registry field path. */
  fieldMap: Record<string, string>;
  /** Constant values applied to every row (label party, ℗ line, territory default). */
  defaults?: Record<string, string | number | boolean>;
  ownerOrgId?: string;
  createdAt: number;
}

export interface CatalogueIngestion {
  id: string;
  ownerOrgId: string;
  submittedByUid: string;
  /** The label/publisher/studio whose catalogue this is. */
  partyId: string;
  source: IngestSource;
  status: IngestStatus;
  mappingProfileId?: string;
  dryRun: boolean;

  counts: {
    rows: number;
    parties: number;
    works: number;
    manifestations: number;
    products: number;
    duplicatesDetected: number;
    conflicts: number;
    blocked: number;
  };

  issues: IngestIssue[];
  /** Ids created once published, for rollback. */
  createdIds?: { works: string[]; manifestations: string[]; products: string[]; parties: string[] };

  startedAt: number;
  completedAt?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridges out (Phase 4) — one adapter per external format
// ─────────────────────────────────────────────────────────────────────────────

export type BridgeFormat =
  | 'DDEX_ERN_43'   // release delivery to DSPs
  | 'DDEX_MEAD'     // enriched marketing metadata
  | 'DDEX_RIN'      // studio/session credits
  | 'CWR_22' | 'CWR_31'   // works registration → MusicMark (ASCAP+BMI+SOCAN) / MLC
  | 'ONIX_31'       // book catalogue → retailers, wholesalers, libraries
  | 'CUE_SHEET'     // Taleo production → PRO cue sheet
  | 'EIDR_REGISTER'
  | 'CSV_GENERIC';

export interface BridgeExportJob {
  id: string;
  format: BridgeFormat;
  ownerOrgId: string;
  /** Which entities to include. */
  productIds?: string[];
  workIds?: string[];
  status: 'QUEUED' | 'BUILDING' | 'VALIDATING' | 'READY' | 'DELIVERED' | 'FAILED';
  /** Output package location once built. */
  outputUri?: string;
  /**
   * Who the file is submitted as. CWR needs a CISAC sender code, which Plajah does not hold —
   * Phase 4 generates a file the label submits under its OWN sender ID.
   */
  senderId?: string;
  issues?: IngestIssue[];
  createdAt: number;
  completedAt?: number;
  error?: string;
}

/** Contract every bridge adapter implements, in and out. */
export interface BridgeAdapter<TParsed = unknown> {
  format: BridgeFormat | IngestSource;
  /** Import: raw package → registry entities (never writes; the service decides). */
  parse?(input: Blob | string): Promise<TParsed>;
  /** Export: registry entities → the external format's package/file. */
  build?(job: BridgeExportJob): Promise<{ uri: string; issues: IngestIssue[] }>;
  /** Format-specific validation, run in dry-run before anything is published. */
  validate?(parsed: TParsed): IngestIssue[];
}
