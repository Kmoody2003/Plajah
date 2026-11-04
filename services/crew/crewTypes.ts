/**
 * Aria Crew — shared types.
 *
 * Aria is the one face people talk to. The crew are small workers behind her, each with ONE job, a written
 * charter, a fixed list of things it may do, a daily budget, and (for anything that leaves the building)
 * a person who approves it first. Security workers are never steered by a model: they are rule-based
 * (services/securityCouncil) and Aria only explains what they found.
 *
 * Pure types. No Firebase, no model calls — safe in node tests and the dev preview.
 */

/** Who a crew member works for. */
export type CrewAudience = 'org' | 'hq';

export type CrewMemberId =
  // Org + small-business crew
  | 'front_desk' | 'follow_up' | 'shopkeeper' | 'promoter' | 'grants_scout' | 'moderator' | 'watchman'
  // Plajah HQ crew (runs Plajah itself; platform admins only)
  | 'hq_security' | 'growth_analyst' | 'strategist' | 'counsel' | 'vision_keeper';

/**
 * Everything a crew member could ever touch. A charter lists the ones it may use; anything else is
 * refused by crewPolicy.checkAction no matter what a model or a request asks for.
 */
export type CrewCapability =
  | 'read_public_profile'   // the org's published page: about, hours, location, departments, FAQ
  | 'answer_visitors'       // reply to a visitor in the Front Desk chat, from published facts only
  | 'read_crm'              // leads / guests in the org's own CRM
  | 'draft_message'         // write a message for a person to approve
  | 'read_inventory'        // stock levels and orders
  | 'draft_reorder'         // a reorder list for a person to approve (never places it)
  | 'draft_post'            // a social post / announcement draft
  | 'read_grants'           // the org's grant workspace
  | 'hide_content'          // hide (never delete) a comment on the org's feed, reversible
  | 'read_security_signals' // login / access-change signals for the org or the platform
  | 'read_platform_metrics' // HQ: signups, activity counts
  | 'read_findings'         // HQ: security council findings and briefs
  | 'write_briefing';       // HQ: compose the daily briefing for the owner

/**
 * Things no crew member may ever do, whatever its charter says. These mirror the owner's standing rules:
 * no held money, a person sends, nothing is deleted, nobody's settings change behind their back.
 */
export const FORBIDDEN_ACTIONS = [
  'move_money', 'charge_card', 'refund', 'payout',
  'send_message', 'publish_post', 'place_order',
  'delete_content', 'delete_record',
  'change_settings', 'change_permissions', 'change_rules', 'deploy',
  'sign_document', 'give_legal_advice',
] as const;
export type ForbiddenAction = typeof FORBIDDEN_ACTIONS[number];

/** How a crew member uses a model. 'none' = rules only (all security work). */
export type CrewModelLane = 'none' | 'cloud' | 'local_first';

/** Built and usable today, or a written charter waiting to be built (shown honestly in the UI). */
export type CrewStatus = 'live' | 'planned';

export interface CrewCharter {
  id: CrewMemberId;
  audience: CrewAudience;
  name: string;
  /** One line: the job. */
  role: string;
  /** What it promises the people it works for. */
  promise: string;
  can: CrewCapability[];
  /** Plain-language limits shown on its card (the hard ones are enforced by FORBIDDEN_ACTIONS). */
  never: string[];
  /** Whether its output waits for a person before anything happens. */
  approval: 'none' | 'person_approves';
  model: CrewModelLane;
  /** Model calls per day per org (org crew) or per day (HQ). 0 = no model. */
  dailyModelCalls: number;
  status: CrewStatus;
  /** Org crew only: which kinds of org/business it is offered to. Empty = every kind. */
  offeredTo?: { orgTypes?: string[]; business?: boolean };
  /** Where it lives in Plajah today (for 'live' members) or will hook in (for 'planned'). */
  home: string;
}

/** A piece of work waiting for a person: a drafted message, a reorder list, a post. */
export type CrewDraftStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export interface CrewDraft {
  id: string;
  crewId: CrewMemberId;
  /** orgId for org crew, 'hq' for HQ crew. */
  scope: string;
  kind: 'message' | 'reorder' | 'post' | 'note';
  title: string;
  body: string;
  status: CrewDraftStatus;
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  /** Why it was rejected, if the person said. */
  reason?: string;
}

/** One line in a crew member's work log. Never holds a visitor's identity. */
export interface CrewLogEntry {
  at: number;
  crewId: CrewMemberId;
  what: string;
  /** 'model' when a model wrote the output, 'rules' when it came from the rules alone. */
  by: 'model' | 'rules' | 'person';
}

/** The org's crew settings, kept in the server-only `orgCrew/{orgId}` doc. */
export interface OrgCrewState {
  orgId: string;
  hired: Partial<Record<CrewMemberId, { on: boolean; by: string; at: number }>>;
  /** Questions and answers the org teaches Front Desk. Published: visitors may be told these. */
  faq: { id: string; q: string; a: string }[];
  /** Questions Front Desk could not answer, newest first (text only, no visitor identity). */
  unanswered: { q: string; at: number }[];
  drafts: CrewDraft[];
  log: CrewLogEntry[];
  /** Model calls used today, per crew member. */
  usage: { day: string; calls: Partial<Record<CrewMemberId, number>> };
  updatedAt: number;
}
