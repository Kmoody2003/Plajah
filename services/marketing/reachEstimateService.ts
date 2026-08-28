// ─── Marketing — reach estimate service ──────────────────────────────────────
// Turns a GeoRadius + channel list into an estimated reach/cost. Wave 1 ships
// on a pure density model (no vendor contract required); each channel is an
// adapter so a live vendor call (Taradel/Lob/Adomni) can drop in later without
// the caller changing shape — only `source` flips 'model' -> 'live'.
//
// See docs/MARKETING_LOCAL_REACH_SPEC.md §3.

import type { AdChannel, GeoRadius } from './campaignTypes';
import { verifyAddressBatch, type MailAddress } from './lobVerification';

export interface ChannelEstimate {
  units: number;        // mailboxes | screens | recipients
  costCents: number;
  extra?: Record<string, number>;
  source: 'model' | 'live';
}

export interface GeoReachEstimate {
  reach: number;
  costCents: number;
  costLowCents: number;
  costHighCents: number;
  byChannel: Partial<Record<AdChannel, ChannelEstimate>>;
}

export interface EstimateRequest {
  geo: GeoRadius;
  channels: AdChannel[];
  flightDays?: number;
}

interface ChannelEstimator {
  channel: AdChannel;
  estimate(geo: GeoRadius, flightDays: number): Promise<ChannelEstimate>;
}

// Urban mailbox density per sq mi — a placeholder table until per-market data
// (or a live Taradel route lookup) replaces it. See spec §3.
const MAILBOX_DENSITY_PER_SQMI = 1850;
const ADDRESSES_PER_ROUTE = 540;
const EDDM_COST_PER_PIECE_CENTS = 25;

const DOOH_SCREENS_PER_SQMI = 4;
const DOOH_WEEKLY_IMPRESSIONS_PER_SCREEN = 5200;
const DOOH_COST_PER_SCREEN_WEEK_CENTS = 18000;
const DOOH_VIEWABLE_FRACTION = 0.62; // fraction of raw impressions counted as "reach"

function areaSqMi(radiusMi: number): number {
  return Math.PI * radiusMi * radiusMi;
}

const eddmEstimator: ChannelEstimator = {
  channel: 'eddm',
  async estimate(geo) {
    const area = areaSqMi(geo.radiusMi);
    const mailboxes = Math.round(area * MAILBOX_DENSITY_PER_SQMI);
    const routes = Math.max(1, Math.round(mailboxes / ADDRESSES_PER_ROUTE));
    return {
      units: mailboxes,
      costCents: Math.round(mailboxes * EDDM_COST_PER_PIECE_CENTS),
      extra: { routes },
      source: 'model',
    };
  },
};

const doohEstimator: ChannelEstimator = {
  channel: 'billboard_dooh',
  async estimate(geo, flightDays) {
    const area = areaSqMi(geo.radiusMi);
    const screens = Math.round(area * DOOH_SCREENS_PER_SQMI);
    const weeks = Math.max(1, flightDays / 7);
    const rawImpressions = screens * DOOH_WEEKLY_IMPRESSIONS_PER_SCREEN * weeks;
    return {
      units: Math.round(rawImpressions * DOOH_VIEWABLE_FRACTION),
      costCents: Math.round(screens * DOOH_COST_PER_SCREEN_WEEK_CENTS * weeks),
      extra: { screens },
      source: 'model',
    };
  },
};

// direct_mail (targeted/list-based) is audience.list driven, not radius driven —
// its units come from the campaign's AudienceList count, so the adapter here
// only prices a known count. Two ways to get that count:
const DIRECT_MAIL_COST_PER_PIECE_CENTS = 62;

/** Raw (unverified) count — same as before Lob was wired in. */
function directMailEstimateForCount(count: number): ChannelEstimate {
  return { units: count, costCents: Math.round(count * DIRECT_MAIL_COST_PER_PIECE_CENTS), source: 'model' };
}

/** Wired to the real Lob adapter (services/marketing/lobVerification.ts →
 *  POST /api/marketing/verify-address-batch). Prices the VERIFIED deliverable
 *  count when LOB_API_KEY is configured server-side, so `source` genuinely
 *  flips 'model' -> 'live' the moment a real key exists — no caller changes
 *  needed. Falls back to the raw list length (still 'model') on any failure
 *  or when the key isn't set, so an unconfigured server never blocks a builder. */
async function directMailEstimateForList(addresses: MailAddress[]): Promise<ChannelEstimate> {
  if (!addresses.length) return { units: 0, costCents: 0, source: 'model' };
  try {
    const batch = await verifyAddressBatch(addresses);
    if (batch.configured && typeof batch.deliverableCount === 'number') {
      return {
        units: batch.deliverableCount,
        costCents: Math.round(batch.deliverableCount * DIRECT_MAIL_COST_PER_PIECE_CENTS),
        extra: { uploadedCount: addresses.length, undeliverableCount: addresses.length - batch.deliverableCount },
        source: 'live',
      };
    }
  } catch {
    // Server unreachable or auth failed — degrade to the raw count below.
  }
  return directMailEstimateForCount(addresses.length);
}

const ESTIMATORS: Partial<Record<AdChannel, ChannelEstimator>> = {
  eddm: eddmEstimator,
  billboard_dooh: doohEstimator,
};

/** Radius-driven channels only (eddm, billboard_dooh, later plajah_house). For
 *  direct_mail (list-based), call directMailEstimateForCount directly with the
 *  resolved AudienceList.count. */
export async function estimate(req: EstimateRequest): Promise<GeoReachEstimate> {
  const flightDays = req.flightDays ?? 14;
  const results = await Promise.allSettled(
    req.channels.map(async (channel) => {
      const adapter = ESTIMATORS[channel];
      if (!adapter) return null;
      const est = await adapter.estimate(req.geo, flightDays);
      return { channel, est };
    }),
  );

  const byChannel: GeoReachEstimate['byChannel'] = {};
  let reach = 0;
  let costCents = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    byChannel[r.value.channel] = r.value.est;
    reach += r.value.est.units;
    costCents += r.value.est.costCents;
  }

  return {
    reach,
    costCents,
    costLowCents: Math.round(costCents * 0.9),
    costHighCents: Math.round(costCents * 1.15),
    byChannel,
  };
}

export { directMailEstimateForCount, directMailEstimateForList };
