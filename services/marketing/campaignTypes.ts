// ─── Marketing — Campaign types ──────────────────────────────────────────────
// The planning spine behind the Paid half of the Marketing Kit. A Campaign is
// scope-aware (reuses MarketingScope from ../../components/MarketingKit — not
// re-invented) and holds one Placement per channel, so a single campaign can
// span both an on-platform "buy" (billboards, direct mail) and a bring-your-own
// "manage" connector (Google/Bing/Meta) side by side.
//
// See docs/MARKETING_LOCAL_REACH_SPEC.md for the full design rationale.

import type { MarketingScope } from '../../components/MarketingKit';

export type CampaignObjective =
  | 'awareness' | 'traffic' | 'sales' | 'event' | 'membership';

export type CampaignStatus =
  | 'draft' | 'scheduled' | 'live' | 'paused' | 'completed' | 'failed';

// Model B = Plajah brokers a true on-platform transaction (billboards, mail,
// house inventory). Model A = bring-your-own account; Plajah only manages it.
export type AdModel = 'buy' | 'manage';

export type AdChannel =
  | 'eddm' | 'direct_mail'
  | 'billboard_dooh'
  | 'plajah_house'
  | 'google' | 'bing' | 'meta' | 'tiktok';

export type AdVendor =
  | 'lob' | 'postgrid' | 'taradel'
  | 'adomni' | 'blip' | 'vistar'
  | 'plajah'
  | 'google' | 'bing' | 'meta'
  | null;

export const CHANNEL_MODEL: Record<AdChannel, AdModel> = {
  eddm: 'buy',
  direct_mail: 'buy',
  billboard_dooh: 'buy',
  plajah_house: 'buy',
  google: 'manage',
  bing: 'manage',
  meta: 'manage',
  tiktok: 'manage',
};

export const CHANNEL_LABEL: Record<AdChannel, string> = {
  eddm: 'EDDM mail',
  direct_mail: 'Targeted mail',
  billboard_dooh: 'Billboards / DOOH',
  plajah_house: 'Plajah house inventory',
  google: 'Google Ads',
  bing: 'Microsoft / Bing',
  meta: 'Meta (Instagram · Facebook)',
  tiktok: 'TikTok',
};

/** Channels wired up in this build. The rest are named for the data model but
 *  have no estimator/purchase path yet (Wave 3/4 — see the build spec). */
export const LOCAL_REACH_CHANNELS: AdChannel[] = ['eddm', 'billboard_dooh'];

export interface GeoRadius {
  center: { lat: number; lng: number; label?: string };
  radiusMi: number; // 0.5–5
  mode: 'radius' | 'routes';
  routeIds?: string[]; // set when mode === 'routes' (hand-edited carrier routes)
}

export interface AudienceList {
  source: 'store_customers' | 'uploaded' | 'purchased';
  segmentId?: string;
  count?: number;
}

export interface CampaignCreative {
  id: string;
  name: string;
  /** Public URL/data-URI for the thumbnail. Placeholder until the Content Asset
   *  Manager exports a shared AssetRef this can consume directly. */
  thumbnailUrl?: string;
  sourceLabel?: string; // e.g. "from Pixels"
}

export interface Placement {
  channel: AdChannel;
  model: AdModel;
  vendor: AdVendor;
  vendorRef?: string; // external order/campaign id, set on purchase
  status: 'estimated' | 'ordered' | 'live' | 'delivered' | 'failed';
  units?: number;   // mailboxes | screens | recipients
  spendCents?: number;
  metrics?: Record<string, number>;
}

export interface CampaignBudget {
  totalCents: number;
  currency: 'usd';
  pacing: 'even' | 'asap';
}

export interface CampaignResults {
  spendCents: number;
  impressions: number;
  reach: number;
  attributedRevenueCents?: number;
}

export interface Campaign {
  id: string;
  scope: MarketingScope;
  /** Operator uid — the document lives under users/{ownerId}/campaigns, the
   *  only subtree per-user rules let the signed-in operator write to. */
  ownerId: string;
  /** Set for BUSINESS/ORG scope — same field scheduledPostsService uses to
   *  attribute Plajah-feed content to a managed identity. */
  authorOrgId?: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  schedule: { start: number; end: number };
  budget: CampaignBudget;
  audience: { geo?: GeoRadius; list?: AudienceList };
  creatives: CampaignCreative[];
  placements: Placement[];
  results?: CampaignResults;
  createdAt: number;
  updatedAt: number;
}

export const CAMPAIGN_OBJECTIVES: { id: CampaignObjective; label: string; blurb: string }[] = [
  { id: 'awareness',  label: 'Awareness',  blurb: 'Get the neighborhood to recognize your name.' },
  { id: 'traffic',    label: 'Foot traffic', blurb: 'Drive people through the door this week.' },
  { id: 'sales',      label: 'Sales',      blurb: 'Push a specific offer or product.' },
  { id: 'event',      label: 'Event',      blurb: 'Fill seats for a date on the calendar.' },
  { id: 'membership', label: 'Membership', blurb: 'Grow Plajah+ binds or Sanctuary members.' },
];
