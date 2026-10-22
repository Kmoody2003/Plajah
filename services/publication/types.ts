// Periodicals — newspapers, magazines, newsletters and zines published as numbered issues.
//
// A periodical is a journalist Publication (services/journalist/types) with the fields a real masthead
// carries: kind, frequency, staff by role, imprint/legal lines, ISSN, and — for student publications —
// the class and the faculty adviser who signs off each issue. Issues live in `periodicalIssues`.
// Two tiers share one model:
//   student  run by a class; every story is teacher-approved and the adviser approves the issue
//   pro      an independent or professional outlet; compliance checks mirror industry practice

import type { Publication } from '../journalist/types';
import type { DocPrintSpec } from '../print/types';

export type PeriodicalKind = 'newspaper' | 'magazine' | 'newsletter' | 'zine' | 'journal';
export type PeriodicalTier = 'student' | 'pro';
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semester' | 'occasional';

export type StaffRole =
  | 'publisher' | 'editor-in-chief' | 'managing-editor' | 'section-editor' | 'copy-editor'
  | 'design-editor' | 'photo-editor' | 'reporter' | 'columnist' | 'photographer' | 'adviser' | 'business-manager';

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  publisher: 'Publisher', 'editor-in-chief': 'Editor-in-chief', 'managing-editor': 'Managing editor', 'section-editor': 'Section editor',
  'copy-editor': 'Copy editor', 'design-editor': 'Design editor', 'photo-editor': 'Photo editor', reporter: 'Reporter',
  columnist: 'Columnist', photographer: 'Photographer', adviser: 'Faculty adviser', 'business-manager': 'Business manager',
};

export interface StaffMember { uid?: string; name: string; role: StaffRole; section?: string }

export interface Periodical extends Publication {
  kind?: PeriodicalKind;
  tier?: PeriodicalTier;
  frequency?: Frequency;
  staff?: StaffMember[];
  /** Student tier: the classroom and the adviser whose account approves every issue. */
  classId?: string;
  adviserUid?: string;
  adviserName?: string;
  schoolName?: string;
  /** Pro tier (and good practice for students): imprint lines printed in the staff box. */
  publisherLegalName?: string;
  postalAddress?: string;
  contactEmail?: string;
  issn?: string;
  copyrightHolder?: string;
  /** Default print product for issues (services/print/products). */
  printProductId?: string;
  /** Distribute issues to Lorea's Periodicals shelf. */
  distributeToLorea?: boolean;
}

/** One story placed in an issue, from either newsroom. */
export interface IssueStory {
  id: string;
  source: 'student' | 'article';
  headline: string;
  dek?: string;
  byline: string;
  /** Plain paragraphs separated by blank lines. */
  body: string;
  section: string;
  /** Teacher-approved (student) or published/cleared by the publish gate (pro). */
  approved: boolean;
  approvedBy?: string;
  aiUsed?: boolean;
  corrections?: string[];
  imageUrl?: string;
  imageCredit?: string;
  /** Higher leads the front page. */
  priority?: number;
}

export type FlatSlotKind = 'front' | 'news' | 'feature' | 'opinion' | 'sports' | 'arts' | 'ad' | 'house' | 'back';

/** One page in the flatplan (the page-by-page plan editors and designers work from). */
export interface FlatSlot { page: number; kind: FlatSlotKind; section: string; storyIds: string[]; note?: string }

export type IssueStatus = 'planning' | 'production' | 'review' | 'approved' | 'published';

/** Staff sign-offs (editor-in-chief, publisher). The adviser's approval is separate: see adviserApproval. */
export interface IssueApproval { role: 'editor-in-chief' | 'publisher'; uid: string; name: string; at: number }

export interface PeriodicalIssue {
  id: string;
  ownerId: string;
  publicationId: string;
  publicationName: string;
  tier: PeriodicalTier;
  kind: PeriodicalKind;
  volume: number;
  number: number;
  /** ISO date printed on the folio. */
  date: string;
  coverLine?: string;
  status: IssueStatus;
  stories: IssueStory[];
  flatplan: FlatSlot[];
  /** Tela document the issue is laid out in. */
  telaDocId?: string;
  printSpec?: DocPrintSpec;
  approvals: IssueApproval[];
  /** Student tier: copy of the publication's adviser so rules can check the approval on the issue itself. */
  adviserUid?: string;
  /** Written only by the adviser's own account (Firestore rules); required before a student issue publishes. */
  adviserApproval?: { uid: string; name: string; at: number; note?: string } | null;
  staffUids: string[];
  /** Digital edition: the published Tela version (bundle stored with the issue). */
  published?: { versionId: string; at: number; pageCount: number; flatPdfUrl?: string };
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReadinessCheck { id: string; label: string; ok: boolean; level: 'required' | 'recommended'; detail?: string }
