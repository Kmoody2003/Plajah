// ─── Manager Suite — network catalog & cost model ────────────────────────────
// Every social network the Studio can publish to, classified by what it
// actually costs Plajah to serve. This is the single source of truth for both
// feature-gating (which tier may connect a network) and the business model.
//
// The decisive fact: only X (Twitter) charges for write access. Every other
// major network's publishing API is free (rate/quota limited, and gated behind
// a developer-app approval, but no per-post dollar cost). So Plajah can serve
// 8 of 9 networks at ~zero marginal cost and only needs to fund a single X
// API tier — which is why bundling the suite into Plajah+ stays profitable.

export type SuiteNetwork =
  | 'plajah'
  | 'mastodon' | 'bluesky' | 'threads'           // live today (free APIs)
  | 'instagram' | 'facebook'                       // Meta Graph API (free)
  | 'youtube' | 'linkedin' | 'tiktok'              // free APIs, approval-gated
  | 'x';                                           // paid API

export type NetworkCostClass =
  | 'FREE'        // no dollar cost to publish; rate/quota limited only
  | 'METERED'     // free dollar cost but a shared project quota to manage (YouTube)
  | 'PAID';       // real per-month API cost (X)

export interface NetworkInfo {
  id: SuiteNetwork;
  label: string;
  /** Brand color for chips/badges. */
  color: string;
  /** Per-post character limit (0 = none / not text-first). */
  charLimit: number;
  costClass: NetworkCostClass;
  /** Lowest plan that may connect this network. PAID networks are Pro-only so
   *  their API bill is covered by Plajah+ revenue, not the free tier. */
  minPlan: 'FREE' | 'PRO';
  /** Whether an adapter is implemented and live right now. */
  live: boolean;
  /** What Plajah must obtain before this network can ship. */
  requires: string;
  /** Plain-English note on the cost reality. */
  costNote: string;
}

export const NETWORKS: Record<SuiteNetwork, NetworkInfo> = {
  plajah: {
    id: 'plajah', label: 'Plajah', color: '#FF8C00', charLimit: 5000,
    costClass: 'FREE', minPlan: 'FREE', live: true,
    requires: 'nothing — native', costNote: 'On-platform; free.',
  },
  mastodon: {
    id: 'mastodon', label: 'Mastodon', color: '#6364FF', charLimit: 500,
    costClass: 'FREE', minPlan: 'FREE', live: true,
    requires: 'user access token', costNote: 'Open API, free, no app review.',
  },
  bluesky: {
    id: 'bluesky', label: 'Bluesky', color: '#0085FF', charLimit: 300,
    costClass: 'FREE', minPlan: 'FREE', live: true,
    requires: 'app password', costNote: 'Open AT Protocol, free.',
  },
  threads: {
    id: 'threads', label: 'Threads', color: '#000000', charLimit: 500,
    costClass: 'FREE', minPlan: 'FREE', live: true,
    requires: 'Meta app + token', costNote: 'Meta Threads API, free.',
  },
  instagram: {
    id: 'instagram', label: 'Instagram', color: '#E1306C', charLimit: 2200,
    costClass: 'FREE', minPlan: 'FREE', live: false,
    requires: 'Meta app + App Review (instagram_content_publish)',
    costNote: 'Graph API publishing is free; ~25 posts/24h per account.',
  },
  facebook: {
    id: 'facebook', label: 'Facebook', color: '#1877F2', charLimit: 63206,
    costClass: 'FREE', minPlan: 'FREE', live: false,
    requires: 'Meta app + App Review (pages_manage_posts)',
    costNote: 'Graph API page posting is free.',
  },
  youtube: {
    id: 'youtube', label: 'YouTube', color: '#FF0000', charLimit: 5000,
    costClass: 'METERED', minPlan: 'PRO', live: false,
    requires: 'Google Cloud app + OAuth + quota increase',
    costNote: 'No $ cost, but a shared 10k-units/day project quota (~6 uploads/day default) — request an increase; gate to Pro to manage demand.',
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', charLimit: 3000,
    costClass: 'FREE', minPlan: 'FREE', live: false,
    requires: 'LinkedIn app + Marketing Developer Platform approval',
    costNote: 'Posting API is free; approval is the only barrier.',
  },
  tiktok: {
    id: 'tiktok', label: 'TikTok', color: '#69C9D0', charLimit: 2200,
    costClass: 'FREE', minPlan: 'FREE', live: false,
    requires: 'TikTok app + Content Posting API approval',
    costNote: 'Content Posting API is free; approval-gated.',
  },
  x: {
    id: 'x', label: 'X (Twitter)', color: '#1DA1F2', charLimit: 280,
    costClass: 'PAID', minPlan: 'PRO', live: false,
    requires: 'X API plan ($200/mo Basic → $5,000/mo Pro)',
    costNote: 'The only network with a real bill. Basic = $200/mo for 50k posts; Pro = $5,000/mo for 1M. Fixed monthly cost, so amortizes across X-active users as you scale. Pro-only so Plajah+ revenue covers it.',
  },
};

/** Networks a given plan is allowed to connect. */
export function networksForPlan(plan: 'FREE' | 'PRO'): SuiteNetwork[] {
  return (Object.values(NETWORKS) as NetworkInfo[])
    .filter(n => plan === 'PRO' || n.minPlan === 'FREE')
    .map(n => n.id);
}

export function isPremiumNetwork(id: SuiteNetwork): boolean {
  return NETWORKS[id]?.minPlan === 'PRO';
}
