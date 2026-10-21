/**
 * Ops presets — the per-business-type / per-org-type wiring for everything that is NOT the catalog:
 * events, CRM pipelines, correspondence, social, paid + offline marketing (billboard / direct mail
 * hand-offs), commerce surface wiring (POS / kiosk / merch shop / signage feeds) and the staff "today"
 * board.
 *
 * Vertical packs (services/verticalPacks) answer "what do I sell and how do I go live".
 * Ops presets answer "how do I run and grow it": a dealership gets a lead → test drive → deal pipeline,
 * a venue gets booking holds and show-night run sheets, a church gets a guest-follow-up pipeline.
 *
 * Pure data + pure functions. No Firebase in this folder (unit-testable, safe in the dev preview).
 */
import type { AdChannel, CampaignObjective } from '../marketing/campaignTypes';

/** Who a preset is for. A business resolves by pack id, then parent vertical; an org by orgType. */
export type PresetSubject =
  | { kind: 'business'; packId?: string | null; vertical?: string | null }
  | { kind: 'org'; orgType?: string | null; templateId?: string | null };

// ── Events ───────────────────────────────────────────────────────────────

export interface EventTierIdea { name: string; price: number; qty?: number; perks?: string }

export interface EventPlaybook {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
  format: 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
  durationMin: number;
  capacity?: number;
  /** Free events use RSVP (evites); priced tiers use ticketing (plajahEvents). */
  tiers: EventTierIdea[];
  runOfShow: { t: string; what: string; owner: string }[];
  /** Planning tasks counted back from the event date. */
  checklist: { daysBefore: number; task: string; owner: string }[];
  /** Promotion beats counted back from the event date; each lands on a real channel. */
  promo: { daysBefore: number; channel: PromoChannel; copy: string }[];
  /** Which catalog category to feature at the event (POS quick keys + signage + merch table). */
  merchTieIn?: string;
}

export type PromoChannel = 'social' | 'email' | 'push' | 'signage' | 'mail' | 'billboard' | 'evite';

// ── CRM ──────────────────────────────────────────────────────────────────

export interface CrmStage {
  id: string;
  label: string;
  kind: 'open' | 'won' | 'lost';
  /** Win probability 0–100, for the weighted pipeline value. */
  probability: number;
  /** Days a contact may sit here before the board flags it as stale. */
  slaDays?: number;
  /** Suggested next action shown on the card. */
  nextAction?: string;
  /** Correspondence template sent (as a draft for review) when a contact enters this stage. */
  templateId?: string;
}

export interface CrmPipeline {
  id: string;
  label: string;
  /** What one card is: lead, deal, inquiry, booking, guest, donor. */
  noun: string;
  valueLabel?: string;
  stages: CrmStage[];
}

export interface CrmField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'currency';
  options?: string[];
}

/** Segments are pure filters over CrmContact; evaluated in services/crm/segments.ts. */
export interface SegmentRule {
  tagsAny?: string[];
  stageIn?: string[];
  pipelineId?: string;
  minSpend?: number;
  minVisits?: number;
  /** Last visit / contact older than N days (win-back). */
  inactiveDays?: number;
  /** Created within the last N days (new customers). */
  newWithinDays?: number;
  sourceIn?: string[];
  /** Only contacts with marketing consent (always applied to promo sends). */
  optedIn?: boolean;
  hasAddress?: boolean;
}

export interface CrmSegment { id: string; label: string; rule: SegmentRule }

export interface CrmPreset {
  pipelines: CrmPipeline[];
  fields: CrmField[];
  segments: CrmSegment[];
  tags: string[];
  /** What the CRM calls a person here: customer, client, guest, member, donor. */
  contactNoun: string;
}

// ── Correspondence ───────────────────────────────────────────────────────

export type CorrespondenceChannel = 'email' | 'push' | 'letter' | 'postcard';

export interface CorrespondenceTemplate {
  id: string;
  label: string;
  channel: CorrespondenceChannel;
  purpose: 'welcome' | 'follow_up' | 'thank_you' | 'promo' | 'reminder' | 'winback' | 'event_invite'
    | 'review_request' | 'appointment' | 'quote' | 'receipt' | 'birthday' | 'announcement';
  subject?: string;
  /** Merge fields: {{first_name}} {{name}} {{business_name}} {{business_phone}} {{business_address}}
   *  {{stage}} {{next_action}} {{event_title}} {{event_date}} {{deal}} {{custom.<fieldId>}} {{sender_name}}. */
  body: string;
  /** When it should be suggested; sends are always reviewed by a person (never silent). */
  trigger?: { on: 'manual' | 'stage_enter' | 'after_purchase' | 'inactive_days' | 'event_rsvp' | 'birthday' | 'new_contact'; stageId?: string; days?: number };
  /** Promo sends require marketing consent; transactional ones do not. */
  promotional?: boolean;
}

// ── Social ───────────────────────────────────────────────────────────────

export type SocialNet = 'plajah' | 'instagram' | 'facebook' | 'tiktok' | 'x' | 'linkedin' | 'youtube' | 'bluesky' | 'mastodon';

export interface SocialPlaybook {
  pillars: { id: string; label: string; share: number; ideas: string[] }[];
  cadence: { network: SocialNet; perWeek: number; bestTimes: string[] }[];
  /** A two-week starter calendar: dayOffset from "next Monday", local time HH:MM. */
  starterPosts: { pillar: string; text: string; dayOffset: number; time: string; networks: SocialNet[] }[];
  hashtags: string[];
}

// ── Marketing (paid, local, offline hand-offs) ───────────────────────────

export interface MarketingPlay {
  id: string;
  label: string;
  objective: CampaignObjective;
  channels: AdChannel[];
  budgetCents: number;
  durationDays: number;
  radiusMi?: number;
  headline: string;
  body: string;
  cta: string;
  /** When to run it: "Opening month", "Before Labor Day", "Every Q4". */
  when?: string;
  /** Mail format for direct_mail / eddm hand-offs. */
  mail?: { format: 'postcard_4x6' | 'postcard_6x9' | 'postcard_6x11' | 'letter' | 'eddm_flat'; list: 'store_customers' | 'crm_segment' | 'eddm_routes' | 'uploaded'; segmentId?: string };
  /** Billboard copy discipline: 7 words or fewer on the main line. */
  billboard?: { line: string; sub?: string };
}

// ── Commerce wiring ──────────────────────────────────────────────────────

export type SignageFeed = 'PRODUCT' | 'MENU' | 'DEAL' | 'EVENT' | 'NOW_PLAYING';

export interface CommerceWiring {
  pos: boolean;
  kiosk: boolean;
  onlineStore: boolean;
  /** Branded merch shop (apparel, gifts) on the public page and org pages. */
  merchShop: boolean;
  signageFeeds: SignageFeed[];
  /** Inventory category that becomes the live menu / price board. */
  menuBoardCategory?: string;
  /** Categories pinned as register quick keys. */
  posQuickKeys?: string[];
  /** One-liner on how sales, stock and screens connect for this type. */
  note: string;
}

// ── Staff today board ────────────────────────────────────────────────────

export interface StaffDuty {
  role: string;
  duties: string[];
  /** Dashboard/ops tab each duty jumps to (business tab ids or org section keys). */
  opens?: string;
}

// ── The preset ───────────────────────────────────────────────────────────

export interface OpsPreset {
  id: string;
  label: string;
  /** Accent within the Plajah family; the page brand still leads. */
  accent: string;
  events: EventPlaybook[];
  crm: CrmPreset;
  correspondence: CorrespondenceTemplate[];
  social: SocialPlaybook;
  marketing: MarketingPlay[];
  commerce: CommerceWiring;
  staffToday: StaffDuty[];
}
