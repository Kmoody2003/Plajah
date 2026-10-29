// Reello Story Intelligence — what a watched upload produces.
//
// The film pipeline (worker/story, taleoAnalysis/*) reads a MOVIE for structure. This is its sibling for
// a creator's Reello upload: it reads what the video is ABOUT and what it SELLS — chapters, the
// poignant lines, every product offered in speech or on screen (price, multi-item packages, links) —
// and drafts the follow-on content: a blog post that teases the video, quote clips, and store listings.
//
// Everything here is a DRAFT until the account approves it, or until the upload template says
// "post automatically" — and then every auto-posted piece carries the auto-created notice
// (autoNotice in core.ts) so readers know the account may still change it.
//
// Storage: reelloIntel/{videoId} (server-only; the API authorises every read — no client rule).

export type ReelloIntelStatus =
  | 'WAITING_MEDIA'   // upload still transcoding — resumes when Mux reports the asset ready
  | 'QUEUED'
  | 'WATCHING'        // the model is watching + listening
  | 'DRAFTING'        // writing the article from what it saw
  | 'READY'           // drafts waiting for approval (or already auto-posted)
  | 'FAILED'
  | 'SKIPPED';

/** Where an offer was found. 'both' = said AND shown — the strongest evidence. */
export type OfferEvidence = 'speech' | 'graphic' | 'both' | 'description';

export interface OfferPackage {
  /** Items in the package (1 = single item). */
  quantity: number;
  /** Package price in the offer currency. */
  price: number;
  /** As written/spoken, for the reviewer ("3 for $50"). */
  label: string;
}

export interface ProductOffer {
  id: string;
  name: string;
  description?: string;
  /** Lowest single-unit price found (null = no price given — the draft says so). */
  price: number | null;
  compareAtPrice?: number;
  currency: string;
  /** Multi-item packages / bundles, cheapest-per-item last. Always includes the single item when priced. */
  packages: OfferPackage[];
  url?: string;
  /** Discount / promo code mentioned with it. */
  promoCode?: string;
  evidence: OfferEvidence;
  /** First moment it appears (seconds). */
  tSec: number;
  /** A still of the product at tSec. */
  stillUrl?: string;
  /** 0..1 — how sure the reader is this is a real, purchasable offer. */
  confidence: number;
  category?: string;
}

export interface VideoLink {
  url: string;
  label?: string;
  tSec?: number;
  evidence: OfferEvidence;
}

export interface QuoteMoment {
  id: string;
  text: string;
  speaker?: string;
  startSec: number;
  endSec: number;
  /** Why it's worth clipping (shown to the approver). */
  why?: string;
  stillUrl?: string;
}

export interface VideoChapter { tSec: number; title: string }
export interface VideoStill { tSec: number; url: string; caption?: string }

export interface ArticleDraftBlock {
  type: 'HEADING' | 'TEXT' | 'QUOTE' | 'IMAGE' | 'VIDEO';
  content: string;
  caption?: string;
}

export interface ArticleDraft {
  title: string;
  subtitle: string;
  coverImage?: string;
  tags: string[];
  blocks: ArticleDraftBlock[];
}

/** One reviewable output. `status` moves DRAFT → POSTED (approved or auto) or DISCARDED. */
export type DraftStatus = 'DRAFT' | 'POSTED' | 'DISCARDED' | 'NEEDS_REVIEW';

export interface DraftState {
  status: DraftStatus;
  /** What it became once posted: articles/{id}, videos/{id}, storeProducts/{id}. */
  postedId?: string;
  postedAt?: number;
  auto?: boolean;
  /** Why an auto-post held this one back for a person (e.g. no price). */
  heldReason?: string;
}

export interface MerchTarget {
  kind: 'USER' | 'ORG';
  orgId?: string;
  orgName?: string;
}

/** Which outputs the upload asked for (from its template, or the uploader's toggles). */
export interface IntelOptions {
  article: boolean;
  clips: boolean;
  merch: boolean;
  /** APPROVE = drafts wait for the account; AUTO = post now with the auto-created notice. */
  publishMode: 'APPROVE' | 'AUTO';
  merchTarget: MerchTarget;
  /** Visibility for auto-posted clips (articles and listings are public by nature once posted). */
  clipVisibility: 'PUBLIC' | 'PRIVATE';
}

export interface VideoIntelReport {
  summary: string;
  topics: string[];
  chapters: VideoChapter[];
  stills: VideoStill[];
  offers: ProductOffer[];
  links: VideoLink[];
  quotes: QuoteMoment[];
  /** Short spoken/on-screen call-to-action lines ("link in the description"). */
  callsToAction: string[];
  language?: string;
}

export interface ReelloIntelJob {
  videoId: string;
  ownerId: string;
  status: ReelloIntelStatus;
  progress: { stage: string; pct: number; note?: string };
  options: IntelOptions;
  /** Account display name at request time — used in the auto-created notice. */
  accountName: string;
  videoTitle: string;
  report?: VideoIntelReport;
  article?: ArticleDraft;
  /** Keyed by 'article', `clip:{quoteId}`, `product:{offerId}`. */
  drafts?: Record<string, DraftState>;
  error?: string;
  usage?: { inTokens: number; outTokens: number; costUsd: number };
  leaseUntil?: number;
  attempts?: number;
  createdAt: number;
  updatedAt: number;
}
