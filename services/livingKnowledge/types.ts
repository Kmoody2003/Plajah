/**
 * Living knowledge layer — types.
 *
 * The Law and Medicine courses are written once, but the world they describe keeps moving: trials
 * report, guidelines change, papers are retracted, courts overrule each other. Every lesson lists
 * ANCHORS (cases, statutes, trials, MeSH topics, drugs...). This layer watches real sources for
 * those anchors and records IMPACTS: "this new thing may matter to this lesson". A human (or a
 * reviewer agent) then updates the lesson. Nothing here edits course text, and nothing here
 * invents content: items carry the source's own title, link and ids, never a generated summary.
 */
import type { AnchorKind } from '../schoolChassis';

export type Domain = 'medicine' | 'law';
export type ItemSource = 'pubmed' | 'courtlistener' | 'feed';
export type ItemKind = 'meta-analysis' | 'systematic-review' | 'guideline' | 'trial' | 'retraction' | 'preprint' | 'safety-alert' | 'news' | 'opinion';
/** How much weight the source type deserves. Preprints and news never rank as evidence. */
export type EvidenceTier = 'synthesis' | 'guideline' | 'trial' | 'regulatory' | 'court-binding' | 'court-persuasive' | 'news' | 'other';
export type CourtLevel = 'supreme-federal' | 'federal-appellate' | 'state-supreme';

export interface KnowledgeItem {
  /** Deterministic: pm_<pmid> | cl_<clusterId> | feed_<hash>. Re-ingesting never duplicates. */
  id: string;
  domain: Domain;
  source: ItemSource;
  kind: ItemKind;
  tier: EvidenceTier;
  title: string;
  /** ISO date (yyyy-mm-dd) the work was published / decided. */
  date: string;
  url: string;
  venue?: string;
  ids?: { pmid?: string; doi?: string; clusterId?: string };
  /** False for preprints and news. */
  peerReviewed: boolean;
  court?: { id: string; name: string; level: CourtLevel };
  /** The source's own text (a court snippet or feed blurb). Never machine-written. */
  excerpt?: string;
  fetchedAt: number;
}

/** 'new' = relevant addition; 'review' = could contradict or supersede what the lesson teaches. */
export type Severity = 'new' | 'review';
export type ImpactState = 'open' | 'reviewed' | 'dismissed';

export interface Impact {
  /** `${itemId}__${lessonId}` so reruns are idempotent. */
  id: string;
  itemId: string;
  targetKey: string;
  courseId: string;
  lessonId: string;
  severity: Severity;
  /** Plain-language reason a person can act on. */
  reason: string;
  state: ImpactState;
  createdAt: number;
  /** Denormalised so the lesson banner needs no second read. */
  itemTitle: string;
  itemUrl: string;
  itemDate: string;
}

export interface WatchTarget {
  /** `${kind}:${ref}` */
  key: string;
  kind: AnchorKind;
  ref: string;
  domain: Domain;
  lessons: Array<{ courseId: string; lessonId: string }>;
}

/** Where results go. File-backed for the CLI, Firestore-backed on the server. */
export interface KnowledgeSink {
  getCursor(key: string): Promise<string | undefined>;
  setCursor(key: string, value: string): Promise<void>;
  putItems(items: KnowledgeItem[]): Promise<void>;
  putImpacts(impacts: Impact[]): Promise<void>;
}

/** Thrown by a source when it is rate limiting us; the run stops using that source and tries later. */
export class RateLimited extends Error { constructor(public source: string) { super(`${source} rate limited`); } }
