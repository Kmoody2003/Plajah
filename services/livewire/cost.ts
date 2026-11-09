// services/livewire/cost.ts — what one stream (or a month) costs on Mux vs Livewire.
// Rates are estimates from public pricing roundups (Nov 2026); verify on mux.com/pricing and
// bunny.net/pricing before quoting. Pure.

export interface Rates {
  muxInputPerMin: number;       // Mux live encode, per broadcast minute
  muxDeliveryPerViewerMin: number;
  muxSimulcastPerMinTarget: number;
  bunnyPerGB: number;           // CDN delivery
  livewireFixedMonthly: number; // origins + relay + monitoring
}

export const DEFAULT_RATES: Rates = {
  muxInputPerMin: 0.032,
  muxDeliveryPerViewerMin: 0.001,
  muxSimulcastPerMinTarget: 0.02,
  bunnyPerGB: 0.005,
  livewireFixedMonthly: 750,
};

export interface StreamUsage {
  broadcastMinutes: number;
  /** Average concurrent viewers across the broadcast. */
  avgViewers: number;
  /** Average kbps a viewer pulls (ladder.deliveredKbps). 720p talk ≈ 1800, 1080p sports ≈ 5000. */
  deliveredKbps: number;
  simulcastTargets?: number;
}

export interface CostBreakdown { encode: number; delivery: number; simulcast: number; total: number }

const gbPerViewerMin = (kbps: number) => (kbps * 1000 * 60) / 8 / 1e9;

export function muxCost(u: StreamUsage, r: Rates = DEFAULT_RATES): CostBreakdown {
  const encode = u.broadcastMinutes * r.muxInputPerMin;
  const delivery = u.broadcastMinutes * u.avgViewers * r.muxDeliveryPerViewerMin;
  const simulcast = u.broadcastMinutes * (u.simulcastTargets ?? 0) * r.muxSimulcastPerMinTarget;
  return round({ encode, delivery, simulcast, total: encode + delivery + simulcast });
}

/** Variable Livewire cost: encode is on the broadcaster's GPU, simulcast is pushed from the desktop. */
export function livewireCost(u: StreamUsage, r: Rates = DEFAULT_RATES): CostBreakdown {
  const viewerMin = u.broadcastMinutes * u.avgViewers;
  const delivery = viewerMin * gbPerViewerMin(u.deliveredKbps) * r.bunnyPerGB;
  return round({ encode: 0, delivery, simulcast: 0, total: delivery });
}

export interface MonthCompare { mux: number; livewireVariable: number; livewireTotal: number; saves: number }

export function compareMonth(streams: StreamUsage[], r: Rates = DEFAULT_RATES): MonthCompare {
  const mux = streams.reduce((s, u) => s + muxCost(u, r).total, 0);
  const lv = streams.reduce((s, u) => s + livewireCost(u, r).total, 0);
  const total = lv + r.livewireFixedMonthly;
  return { mux: r2(mux), livewireVariable: r2(lv), livewireTotal: r2(total), saves: r2(mux - total) };
}

/** Monthly Mux spend at which Livewire's fixed cost pays for itself, for a given usage shape. */
export function breakEvenMuxSpend(sample: StreamUsage, r: Rates = DEFAULT_RATES): number {
  const m = muxCost(sample, r).total, l = livewireCost(sample, r).total;
  if (m <= l) return Infinity;
  return r2((r.livewireFixedMonthly / (m - l)) * m);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const round = (c: CostBreakdown): CostBreakdown =>
  ({ encode: r2(c.encode), delivery: r2(c.delivery), simulcast: r2(c.simulcast), total: r2(c.total) });
