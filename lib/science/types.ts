// ── Core science layer types ──────────────────────────────────────────────────

export type ScienceDiscipline =
  | 'PHYSICS' | 'CHEMISTRY' | 'BIOLOGY' | 'COMPUTER_SCIENCE'
  | 'ENGINEERING' | 'MATHEMATICS' | 'NEUROSCIENCE' | 'EARTH_SCIENCE'
  | 'ASTRONOMY' | 'DATA_SCIENCE' | 'ENVIRONMENT' | 'NETWORKS'
  | 'MEDICINE' | 'ARCHAEOLOGY' | 'LINGUISTICS'
  | 'ARCHITECTURE' | 'HISTORY';

export type ClaimType =
  | 'OBSERVATION'   // "We observed X under conditions Y"
  | 'HYPOTHESIS'    // "We hypothesize that X causes Y"
  | 'FINDING'       // "We found / confirmed X"
  | 'REPLICATION'   // "We replicated [postId] and found X"
  | 'PEER_REVIEW'   // "Reviewing [postId]: ..."
  | 'EXTENSION'     // "Building on [postId]: ..."
  | 'NULL_RESULT'   // "We could not replicate / found no effect"
  | 'DATASET'       // Raw data deposit
  | 'PREPRINT'      // Pre-peer-review paper
  | 'GREY_LIT';     // Field log, report, unpublished work

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'REPLICATED';

// ── Science metadata attached to a post ──────────────────────────────────────

export interface ScienceMeta {
  discipline: ScienceDiscipline[];
  claimType: ClaimType;
  confidence: number;             // 0–1
  confidenceLevel: ConfidenceLevel;
  // Linked entities
  doiLink?: string;               // DOI of cited/submitted paper
  arxivId?: string;               // arXiv ID
  replicatesPostId?: string;      // if claimType === 'REPLICATION'
  extendsPostId?: string;         // if claimType === 'EXTENSION'
  reviewsPostId?: string;         // if claimType === 'PEER_REVIEW'
  // Live API snapshot (captured at post time)
  apiSnapshot?: LiveDataSnapshot;
  // Reproducibility
  reproScore?: number;            // 0–1, computed by reproducibility engine
  replicationCount?: number;
  successfulReplications?: number;
  // Muse translations
  museSummary?: string;           // plain-language Muse translation
  museGeneratedAt?: number;
  // Tags
  keywords?: string[];
  // GPS context
  location?: { lat: number; lng: number; description?: string };
}

export interface SciencePost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  science: ScienceMeta;
  likesCount: number;
  likedBy: string[];
  commentCount: number;
  shareCount: number;
  timestamp: number;
  isPublic: boolean;
}

// ── Science comment (typed) ───────────────────────────────────────────────────

export type ScienceCommentType =
  | 'REPLY'
  | 'REPLICATION'   // structured replication submission
  | 'PEER_REVIEW'   // structured review
  | 'EXTENSION'     // extends or builds on the post
  | 'MUSE_SUMMARY'; // Muse-generated plain-language summary

export interface ReplicationData {
  outcome: 'CONFIRMED' | 'PARTIAL' | 'FAILED' | 'INCONCLUSIVE';
  method: string;
  delta?: string;           // difference from original finding
  confidenceDelta?: number; // how much confidence changed
}

export interface ReviewData {
  verdict: 'STRONG' | 'ADEQUATE' | 'NEEDS_REVISION' | 'REJECTED';
  score: number;            // 1–10
  strengths: string;
  weaknesses: string;
}

export interface ScienceComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  type: ScienceCommentType;
  replication?: ReplicationData;
  review?: ReviewData;
  timestamp: number;
  likesCount: number;
  likedBy: string[];
  parentId?: string;
}

// ── Live data snapshots ───────────────────────────────────────────────────────

export type LiveDataSource =
  | 'NOAA_WEATHER' | 'USGS_EARTHQUAKE' | 'USGS_VOLCANO'
  | 'PUBCHEM' | 'CROSSREF' | 'ARXIV' | 'OPEN_METEO'
  | 'NASA_APOD'
  | 'GBIF'        // Global Biodiversity Information Facility — biology, ecology, environment
  | 'RCSB_PDB'   // RCSB Protein Data Bank — biology, medicine, neuroscience
  | 'FEMA_FLOOD' // FEMA National Flood Hazard Layer — civil/mechanical engineering
  | 'MACROSTRAT' // Macrostrat geological formations — earth science, archaeology
  | 'OPEN_CONTEXT' // OpenContext archaeological datasets — archaeology
  | 'NCBI_PUBMED'  // NIH PubMed paper search — biology, medicine, neuroscience
  | 'NCBI_GENE'    // NIH GenBank gene/sequence data — biology, medicine
  | 'NCBI_TAXONOMY' // NCBI taxonomy tree — biology, ecology
  | 'WOLFRAM'      // Wolfram Alpha computation — mathematics, physics, chemistry
  | 'NOAA_CDO'      // NOAA Climate Data Online — meteorology, ecology (historical climate)
  | 'WIKIDATA'      // Wikidata entity search — architecture, history, all disciplines
  | 'OSM_BUILDINGS' // OpenStreetMap Overpass — architecture (named buildings near GPS)
  | 'WIKIPEDIA'     // Wikipedia REST API — history, architecture, general context
  | 'LOC'           // Library of Congress — history (records, photos, maps)
  | 'GETTY_AAT'     // Getty Art & Architecture Thesaurus — architecture vocabulary
  | 'EUROPEANA'     // Europeana cultural heritage — architecture + history (key required)
  | 'DPLA'          // Digital Public Library of America — US history (key required)
  | 'MANUAL';

export interface LiveDataSnapshot {
  source: LiveDataSource;
  fetchedAt: number;
  data: Record<string, any>;
  summary?: string;   // human-readable summary of the snapshot
}

// ── Expertise graph ───────────────────────────────────────────────────────────

export interface DisciplineScore {
  discipline: ScienceDiscipline;
  score: number;                // 0–100
  postsCount: number;
  citationsReceived: number;
  replicationsConfirmed: number;
  reviewsGiven: number;
  lastActiveAt: number;
}

export interface ExpertiseProfile {
  userId: string;
  displayName: string;
  photoURL: string;
  disciplines: DisciplineScore[];
  totalScore: number;
  tier: 'NOVICE' | 'RESEARCHER' | 'EXPERT' | 'AUTHORITY';
  updatedAt: number;
}

// ── Reproducibility engine ────────────────────────────────────────────────────

export interface ReplicationAttempt {
  id: string;
  originalPostId: string;
  replicatorId: string;
  replicatorName: string;
  outcome: ReplicationData['outcome'];
  commentId: string;
  timestamp: number;
}

export interface ReproducibilityRecord {
  postId: string;
  score: number;                     // 0–1
  attempts: number;
  confirmedCount: number;
  partialCount: number;
  failedCount: number;
  inconclusiveCount: number;
  lastAttemptAt: number;
  history: ReplicationAttempt[];
}

// ── Renderer detection ────────────────────────────────────────────────────────

export type ContentTokenType =
  | 'LATEX_INLINE' | 'LATEX_BLOCK'
  | 'SMILES' | 'DOI' | 'ARXIV_ID'
  | 'GPS_COORD' | 'PLAIN_TEXT';

export interface ContentToken {
  type: ContentTokenType;
  raw: string;
  start: number;
  end: number;
}

// ── Muse AI ───────────────────────────────────────────────────────────────────

export interface MuseTranslation {
  postId: string;
  original: string;
  plainLanguage: string;
  detectedDisciplines: ScienceDiscipline[];
  keyTerms: string[];
  significance: string;   // one-line impact statement
  generatedAt: number;
  model: string;
}

export interface CrossConnectionSuggestion {
  targetPostId: string;
  targetAuthorId: string;
  targetAuthorName: string;
  reason: string;         // why these are connected
  similarity: number;     // 0–1
  disciplines: ScienceDiscipline[];
}
