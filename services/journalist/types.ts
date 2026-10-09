// Journalist toolset data model. Pure types, no runtime imports, so tests and the
// server route can import it without dragging in the React/Firebase graph.

export type StoryStage = 'PITCH' | 'ASSIGNED' | 'REPORTING' | 'DRAFT' | 'EDIT' | 'LEGAL' | 'SCHEDULED' | 'PUBLISHED';
export const STORY_STAGES: StoryStage[] = ['PITCH', 'ASSIGNED', 'REPORTING', 'DRAFT', 'EDIT', 'LEGAL', 'SCHEDULED', 'PUBLISHED'];

export interface NewsroomStory {
  id: string;
  ownerId: string;
  /** Optional org scope. When set, org members with the right permission can see/move it. */
  orgId?: string;
  slug: string;
  stage: StoryStage;
  assigneeId?: string;
  assigneeName?: string;
  editorId?: string;
  section?: string;
  deadline?: number;
  budgetLine?: string;
  articleId?: string;
  pitchId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type PitchStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'KILLED';
export interface Pitch {
  id: string;
  ownerId: string;
  orgId?: string;
  headline: string;
  angle: string;
  whyNow?: string;
  targetOutlet?: string;
  status: PitchStatus;
  assignedTo?: string;
  responseDue?: number;
  storyId?: string;
  createdAt: number;
  updatedAt: number;
}

/** off_record: may inform reporting, never quoted. background: usable, not attributable. */
export type SourceAttribution = 'ON_RECORD' | 'BACKGROUND' | 'DEEP_BACKGROUND' | 'OFF_RECORD';
export interface SourceContact {
  id: string;
  ownerId: string;
  name: string;
  /** Free-form role/affiliation. */
  role?: string;
  attribution: SourceAttribution;
  confidential: boolean;
  /** Plain fields (searchable). Never put anything dangerous here when `confidential`. */
  tags?: string[];
  /** Sensitive details: if `vault` is present these are inside the ciphertext, not here. */
  contact?: string;
  notes?: string;
  /** Client-side AES-GCM envelope (see vaultCrypto.ts). Present only when the user sealed it. */
  vault?: SealedEnvelope;
  createdAt: number;
  updatedAt: number;
}
export interface SealedEnvelope { v: 1; alg: 'AES-GCM'; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }

export interface SourceLogEntry {
  id: string;
  ownerId: string;
  sourceId: string;
  storyId?: string;
  articleId?: string;
  at: number;
  kind: 'INTERVIEW' | 'EMAIL' | 'CALL' | 'DOCUMENT' | 'MESSAGE' | 'IN_PERSON';
  attribution: SourceAttribution;
  summary: string;
}

export type ClaimStatus = 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED';
export interface ClaimSourceLink { url: string; label?: string; archiveUrl?: string; addedAt: number }
export interface Claim {
  id: string;
  ownerId: string;
  articleId: string;
  text: string;
  status: ClaimStatus;
  /** Who set the status. Verified is ONLY ever set by a human: 'human:<uid>'. */
  statusBy: string;
  statusAt: number;
  sources: ClaimSourceLink[];
  /** Raised by the checkable-claim detector; purely a suggestion until a human acts. */
  suggestedBy?: 'heuristic' | 'ai';
  note?: string;
  blockId?: string;
}

export type NoticeLabel = 'CORRECTION' | 'UPDATE' | 'EDITORS_NOTE' | 'RETRACTION' | 'CLARIFICATION';
export interface ArticleNotice {
  id: string;
  label: NoticeLabel;
  /** Reader-facing text. */
  text: string;
  at: number;
  byUid: string;
  byName: string;
  /** The Tela version published as a result (null for note-only notices). */
  versionId?: string;
  /** The version readers can compare against. */
  previousVersionId?: string;
}

export interface ArticleDisclosures {
  aiAssisted: boolean;
  aiNote?: string;
  sponsored: boolean;
  sponsorName?: string;
  affiliateLinks: boolean;
  conflictOfInterest: boolean;
  conflictNote?: string;
}

export interface ImageRights {
  /** Block id of the IMAGE block, or 'cover'. */
  ref: string;
  credit: string;
  license: 'OWNED' | 'LICENSED' | 'CC_BY' | 'CC_BY_SA' | 'CC0' | 'PUBLIC_DOMAIN' | 'EDITORIAL_USE' | 'FAIR_USE_CLAIMED' | 'AI_GENERATED';
  sourceUrl?: string;
}

export interface Publication {
  id: string;
  ownerId: string;
  orgId?: string;
  name: string;
  tagline?: string;
  slug: string;
  sections: string[];
  editors: Array<{ uid: string; name: string; title?: string }>;
  /** 'FREE' | 'SUBSCRIBERS' (Plajah+/creator subscription rails) | 'PAID_ISSUES' (buy-to-own). */
  access: 'FREE' | 'SUBSCRIBERS' | 'PAID_ISSUES';
  mastheadTemplateId?: string;
  ethicsUrl?: string;
  correctionsPolicy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PressCredential {
  id: string;
  ownerId: string;
  issuer: string;
  kind: 'PRESS_CARD' | 'EMPLOYER_LETTER' | 'ASSOCIATION' | 'EVENT_ACCREDITATION';
  number?: string;
  expires?: number;
  /** Self-asserted until Plajah staff review it. */
  reviewStatus: 'SELF_ASSERTED' | 'APPROVED' | 'REJECTED';
  createdAt: number;
}

export interface InterviewTranscriptSegment { start: number; end: number; text: string; speaker?: string }
export interface InterviewRecord {
  id: string;
  ownerId: string;
  storyId?: string;
  sourceId?: string;
  title: string;
  recordedAt: number;
  durationSec: number;
  /** Local-only object key or url of the audio. Audio itself is not uploaded by this toolset. */
  audioRef?: string;
  segments: InterviewTranscriptSegment[];
  transcriptEngine: 'browser-speech' | 'manual' | 'gemini' | 'none';
}

export interface ExtractedQuote {
  id: string;
  text: string;
  speaker?: string;
  startSec: number;
  endSec: number;
  sourceId?: string;
  interviewId?: string;
  attribution: SourceAttribution;
}
