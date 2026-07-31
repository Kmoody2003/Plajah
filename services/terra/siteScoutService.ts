/**
 * Site Scout — commercial site-selection intelligence.
 *
 * ── The load-bearing rule ────────────────────────────────────────────────────
 * This is the ONLY Terra surface that shows demographics (income, population,
 * daytime workers). US fair-housing law governs *dwellings*; commercial site
 * selection — where to put a shop — sits outside it, which is why demographic
 * analytics is standard practice here and nowhere near residential listings.
 * Every report is stamped `commercialOnly: true`. Do not surface these metrics
 * on the Explorer, the Passport, or a residential listing. (Michigan caveat:
 * ELCRA's "real property" may not carve out commercial cleanly — counsel before
 * launch; the gate is cheap insurance regardless.)
 *
 * ── Data honesty ─────────────────────────────────────────────────────────────
 * The live sources this wants — Census ACS (needs an API key), LEHD LODES WAC
 * (flat files, Michigan tops out at 2021), Overture Places (GeoParquet, no hosted
 * API), MDOT/SEMCOG traffic (keyless ArcGIS) — are NOT wired yet. So each metric
 * carries a status and provenance, and reports built now are `preview` data:
 * representative, clearly labelled, never presented as measured. The adapter seam
 * below is where real sources plug in without touching the UI.
 */

export type MetricStatus = 'live' | 'preview' | 'unavailable';

export interface SiteMetric {
  key: string;
  label: string;
  value: number | null;
  display: string;
  /** e.g. "Census LODES WAC", "MDOT 2024", "Overture Places". */
  source: string;
  vintage?: string;
  observed: 'observed' | 'estimated' | 'interpolated';
  status: MetricStatus;
  hint?: string;
}

export interface Competitor { name: string; category: string; distanceMi: number; }

export type TradeAreaKind = 'drive' | 'radius';
export interface TradeArea { kind: TradeAreaKind; minutes?: number; radiusMi?: number; }

export interface SiteScoutReport {
  site: { label: string; address?: string; lat?: number; lng?: number; parcelId?: string };
  category: string;
  tradeArea: TradeArea;
  metrics: SiteMetric[];
  competitors: Competitor[];
  /** 0–100 composite + its three drivers. */
  score: { overall: number; demand: number; access: number; competition: number };
  /** True when any metric is preview data — the UI must say so. */
  isPreview: boolean;
  generatedAt: number;
  commercialOnly: true;
}

export const RETAIL_CATEGORIES = [
  { key: 'cafe', label: 'Café / coffee' },
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'grocery', label: 'Grocery / market' },
  { key: 'fitness', label: 'Fitness studio' },
  { key: 'salon', label: 'Salon / barber' },
  { key: 'retail', label: 'General retail' },
];

/** Trade area scales the numbers — a bigger reach captures more of everything. */
function reachFactor(ta: TradeArea): number {
  if (ta.kind === 'radius') return Math.max(0.4, (ta.radiusMi ?? 1) / 1);
  const m = ta.minutes ?? 10;
  return Math.max(0.5, m / 10);
}

/**
 * Build a PREVIEW report. Numbers are representative and every metric says so.
 * Deterministic in its inputs (no randomness) so the same site/area/category
 * always reads the same — a real analysis would, too.
 */
export function buildPreviewReport(
  site: SiteScoutReport['site'],
  category: string,
  tradeArea: TradeArea,
): SiteScoutReport {
  const f = reachFactor(tradeArea);
  const cat = RETAIL_CATEGORIES.find(c => c.key === category)?.label || 'Business';

  const daytime = Math.round(31480 * f);
  const residentWorkers = Math.round(9120 * f);
  const households = Math.round(14260 * f);
  const medianIncome = 52400;                    // tract-level, doesn't scale with reach
  const aadt = 18400;                            // frontage-road count
  const walk = 14.2;                             // EPA National Walkability Index (0–20)
  const compCount = Math.max(1, Math.round(7 * f));
  const per10k = Math.round((compCount / (daytime / 10000)) * 10) / 10;

  const metrics: SiteMetric[] = [
    {
      key: 'daytime', label: 'Daytime population', value: daytime, display: daytime.toLocaleString(),
      source: 'Census LODES WAC', vintage: '2021 — latest for Michigan', observed: 'estimated', status: 'preview',
      hint: 'Jobs inside the trade area — the count that matters for a lunchtime or weekday business.',
    },
    {
      key: 'households', label: 'Households', value: households, display: households.toLocaleString(),
      source: 'Census ACS 5-year', vintage: '2020–2024', observed: 'estimated', status: 'preview',
    },
    {
      key: 'income', label: 'Median HH income', value: medianIncome, display: `$${medianIncome.toLocaleString()}`,
      source: 'Census ACS 5-year', vintage: '2020–2024', observed: 'estimated', status: 'preview',
      hint: 'Tract-level. Commercial context only — never shown on a residential surface.',
    },
    {
      key: 'aadt', label: 'Traffic (AADT)', value: aadt, display: aadt.toLocaleString(),
      source: 'MDOT / SEMCOG', vintage: '2024 count', observed: 'estimated', status: 'preview',
      hint: 'Average daily traffic on the frontage road.',
    },
    {
      key: 'walk', label: 'Walkability', value: walk, display: `${walk} / 20`,
      source: 'EPA National Walkability Index', vintage: 'SLD v3 (2019 BGs)', observed: 'estimated', status: 'preview',
    },
    {
      key: 'competition', label: `${cat} nearby`, value: compCount, display: String(compCount),
      source: 'Overture Places', vintage: 'monthly', observed: 'estimated', status: 'preview',
      hint: `${per10k} per 10k daytime population.`,
    },
  ];

  const competitors: Competitor[] = Array.from({ length: compCount }).slice(0, 8).map((_, i) => ({
    name: `${cat} · site ${i + 1}`,
    category: cat,
    distanceMi: Math.round((0.2 + i * 0.18) * 10) / 10,
  }));

  const score = computeScore({ daytime, households, medianIncome, aadt, walk, per10k });

  return {
    site, category, tradeArea, metrics, competitors, score,
    isPreview: true, generatedAt: Date.now(), commercialOnly: true,
  };
}

/** Composite 0–100 from demand, access and (inverse) competition. Transparent weights. */
export function computeScore(x: {
  daytime: number; households: number; medianIncome: number; aadt: number; walk: number; per10k: number;
}): SiteScoutReport['score'] {
  const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  // Demand: daytime pop + households + income.
  const demand = Math.round(
    0.45 * norm(x.daytime, 3000, 60000) +
    0.30 * norm(x.households, 2000, 30000) +
    0.25 * norm(x.medianIncome, 25000, 90000),
  );
  // Access: traffic + walkability.
  const access = Math.round(
    0.6 * norm(x.aadt, 3000, 40000) +
    0.4 * norm(x.walk, 4, 20),
  );
  // Competition: fewer competitors per 10k daytime = better. Inverted.
  const competition = Math.round(100 - norm(x.per10k, 0.5, 8));

  const overall = Math.round(0.45 * demand + 0.3 * access + 0.25 * competition);
  return { overall, demand, access, competition };
}

export function scoreBand(n: number): { label: string; color: string } {
  if (n >= 75) return { label: 'Strong', color: '#3DD68C' };
  if (n >= 55) return { label: 'Promising', color: '#FFAE47' };
  if (n >= 40) return { label: 'Mixed', color: '#E8B33D' };
  return { label: 'Challenging', color: '#FF6B5E' };
}
