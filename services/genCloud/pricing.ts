// services/genCloud/pricing.ts — turn a request into units and credits. Pure.
// Credits are charged only for successful jobs (hold on submit, settle on success, release on fail).

import type { Engine, GenRequest, Quote, Resolution } from './types';

/** Speech runs ~900 characters a minute; voice jobs bill per started 15 seconds (min 15 s). */
export const CHARS_PER_MINUTE = 900;
/** Lowest acceptable markup (credit value / provider cost) on any route. */
export const MARKUP_FLOOR = 1.5;
export const CREDIT_USD = 0.01;
export const MAX_IMAGES = 4;

export class QuoteError extends Error {
  constructor(public code: 'bad_duration' | 'bad_resolution' | 'bad_count' | 'no_text' | 'no_price', msg: string) { super(msg); }
}

function pick<T>(table: Partial<Record<Resolution | 'default', T>>, res?: Resolution): T | undefined {
  return (res && table[res]) ?? table.default;
}

export function units(engine: Engine, req: GenRequest): { units: number; unitLabel: Quote['unitLabel']; resolution?: Resolution } {
  if (engine.kind === 'image') {
    const n = req.count ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > MAX_IMAGES) throw new QuoteError('bad_count', `1–${MAX_IMAGES} images per request`);
    return { units: n, unitLabel: 'image' };
  }
  if (engine.kind === 'video') {
    const sec = req.seconds ?? engine.durations?.[0];
    if (!sec || !engine.durations?.includes(sec)) throw new QuoteError('bad_duration', `durations: ${engine.durations?.join(', ')} s`);
    const res = req.resolution ?? engine.resolutions?.[0];
    if (!res || !engine.resolutions?.includes(res)) throw new QuoteError('bad_resolution', `resolutions: ${engine.resolutions?.join(', ')}`);
    return { units: sec, unitLabel: 'second', resolution: res };
  }
  const text = (req.text ?? '').trim();
  if (!text) throw new QuoteError('no_text', 'nothing to speak');
  const minutes = Math.max(0.25, Math.ceil((text.length / CHARS_PER_MINUTE) * 4) / 4);
  return { units: minutes, unitLabel: 'minute' };
}

export function quote(engine: Engine, req: GenRequest): Quote {
  const u = units(engine, req);
  const perUnit = pick(engine.credits, u.resolution);
  const cost = pick(engine.routes[0]?.costPerUnit ?? {}, u.resolution);
  if (perUnit === undefined || cost === undefined) throw new QuoteError('no_price', `${engine.id} has no price for ${u.resolution ?? 'default'}`);
  return {
    engine: engine.id, units: u.units, unitLabel: u.unitLabel,
    credits: Math.ceil(perUnit * u.units),
    estCostUsd: Math.round(cost * u.units * 10000) / 10000,
  };
}

export interface MarginIssue { engine: string; provider: string; resolution: string; markup: number }

/** Every route of every engine must clear MARKUP_FLOOR at base credit value. */
export function marginCheck(engines: Engine[], floor = MARKUP_FLOOR): MarginIssue[] {
  const issues: MarginIssue[] = [];
  for (const e of engines) {
    for (const route of e.routes) {
      for (const [res, cost] of Object.entries(route.costPerUnit)) {
        const credits = pick(e.credits, res === 'default' ? undefined : res as Resolution);
        if (credits === undefined || !cost) continue;
        const markup = (credits * CREDIT_USD) / cost;
        if (markup < floor) issues.push({ engine: e.id, provider: route.provider, resolution: res, markup: Math.round(markup * 100) / 100 });
      }
    }
  }
  return issues;
}
