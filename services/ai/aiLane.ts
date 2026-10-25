/**
 * AI lanes — which machine runs the model, what it costs, and how long it takes. Shared by the grants
 * workspace and every council that moves off Anthropic onto Gemini (services/ai/geminiLane.ts).
 *
 * Policy (owner decision, 2026-10-25): privacy-facing work runs ON THE USER'S PC when it has
 * qualifying hardware (the Plajah desktop app with a local model on a GPU). Otherwise the work can
 * run in the cloud (Gemini), but only after the person sees the estimated cost and time and says yes.
 *
 * This module is pure and isomorphic: the price table, token estimates, GPU speed tiers and the
 * self-calibrating time estimate. The desktop bridge and the consent UI live elsewhere.
 *
 * Estimates are estimates. Token counts are approximated from characters (≈4 chars/token for English),
 * GPU speeds start from conservative tier defaults and are replaced by this PC's measured speed after
 * the first local run. Prices are Google's published paid-tier rates as of PRICES_ASOF.
 */

// ─── Cloud prices (Gemini paid tier, USD per 1M text tokens) ─────────────────

export const PRICES_ASOF = '2026-10-25';
export const PRICES_URL = 'https://ai.google.dev/gemini-api/docs/pricing';

/** From Google's pricing page on PRICES_ASOF. Thinking tokens bill as output. */
export const GEMINI_PRICES: Record<string, { in: number; out: number; note?: string }> = {
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40, note: 'not available to new API users (404, checked 2026-10-25)' },
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-3.6-flash': { in: 0.75, out: 3.75, note: 'rises to $1.50 / $7.50 on 2027-01-01' },
  'gemini-3.8-flash': { in: 0.75, out: 3.75, note: 'rises to $1.50 / $7.50 on 2027-01-01' },
};

/**
 * Default cloud model: Google's recommended current Flash-Lite. Checked live 2026-10-25: answered a JSON
 * prompt in ~1s, while gemini-3.1-flash-lite (cheaper) returned 503 "high demand" twice before answering
 * in ~6s. Switch with AI_COUNCIL_MODEL (or a feature's own override) when that changes.
 */
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

export function priceFor(model: string): { in: number; out: number } | null {
  return GEMINI_PRICES[model] ?? null;
}

export function costUsd(model: string, inTokens: number, outTokens: number): number | null {
  const p = priceFor(model);
  return p ? (inTokens * p.in + outTokens * p.out) / 1_000_000 : null;
}

export const estTokens = (chars: number) => Math.ceil(chars / 4);

// ─── Workload ────────────────────────────────────────────────────────────────

/** One model call's size: prompt tokens in, a typical (not maximum) number of tokens out. */
export interface CallSize { inTokens: number; outTokens: number }
export interface Workload {
  kind: 'council' | 'draft';
  calls: CallSize[];
  /** Calls that can run at the same time in the cloud (the five seats); the GPU runs them one by one. */
  parallelGroups: number[][];
}

export const totals = (w: Workload) => w.calls.reduce((a, c) => ({ inTokens: a.inTokens + c.inTokens, outTokens: a.outTokens + c.outTokens }), { inTokens: 0, outTokens: 0 });

// ─── Local speed ─────────────────────────────────────────────────────────────

export type GpuTier = 'nvidia' | 'discrete' | 'integrated' | 'cpu';

/**
 * Conservative starting rates for a 7B model at 4-bit (prompt tokens/s, generated tokens/s).
 * Replaced by measurements after the first local run on this PC.
 */
export const TIER_RATES: Record<GpuTier, { prompt: number; gen: number; label: string }> = {
  nvidia: { prompt: 900, gen: 35, label: 'NVIDIA GPU' },
  discrete: { prompt: 500, gen: 25, label: 'Dedicated GPU' },
  integrated: { prompt: 120, gen: 10, label: 'Integrated graphics' },
  cpu: { prompt: 30, gen: 5, label: 'Processor only' },
};

export function gpuTier(gpu: string, backend: string): GpuTier {
  const g = `${gpu} ${backend}`.toLowerCase();
  if (!/vulkan|cuda|gpu/.test(backend.toLowerCase())) return 'cpu';
  if (/nvidia|geforce|rtx|quadro/.test(g)) return 'nvidia';
  if (/radeon rx|arc a\d|arc b\d/.test(g)) return 'discrete';
  return 'integrated';
}

/**
 * Qualifying hardware for running privacy work locally: a GPU backend and a model on disk. Integrated
 * graphics qualify too (slower, still private) — the person sees the time and can choose the cloud.
 * CPU-only does not qualify: a council review would take many minutes and tie up the machine.
 */
export function qualifies(status: { ready: boolean; backend: string; gpu: string } | null): boolean {
  return !!status?.ready && gpuTier(status.gpu, status.backend) !== 'cpu';
}

/** One measured local call. */
export interface LocalSample { inTokens: number; outTokens: number; seconds: number }

/**
 * Seconds for a workload on this PC. Starts from the tier's rates and scales by how fast this PC has
 * actually been on past runs (median of measured/predicted), so the estimate gets honest quickly.
 */
export function localSeconds(w: Workload, tier: GpuTier, samples: LocalSample[] = [], loadSeconds = 8): number {
  const r = TIER_RATES[tier];
  const predict = (c: CallSize) => c.inTokens / r.prompt + c.outTokens / r.gen;
  const ratios = samples.filter(s => s.seconds > 0 && s.outTokens > 0).map(s => s.seconds / Math.max(0.1, predict(s))).sort((a, b) => a - b);
  const factor = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  return loadSeconds + w.calls.reduce((t, c) => t + predict(c), 0) * factor;
}

/** Cloud wall-clock: parallel groups take their slowest call; network/queue overhead per round trip. */
export function cloudSeconds(w: Workload, genRate = 180, overhead = 2): number {
  const callSecs = (c: CallSize) => overhead + c.outTokens / genRate;
  const grouped = new Set(w.parallelGroups.flat());
  let t = 0;
  for (const g of w.parallelGroups) t += Math.max(...g.map(i => callSecs(w.calls[i])));
  w.calls.forEach((c, i) => { if (!grouped.has(i)) t += callSecs(c); });
  return t;
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `about ${Math.max(5, Math.round(s / 5) * 5)} seconds`;
  const m = s / 60;
  return m < 10 ? `about ${Math.round(m * 2) / 2} minute${m >= 1.25 ? 's' : ''}` : `about ${Math.round(m)} minutes`;
}

export function fmtUsd(n: number | null): string {
  if (n === null) return 'unknown';
  if (n < 0.01) return 'less than 1¢';
  return `about ${n < 1 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(2)}`}`;
}
