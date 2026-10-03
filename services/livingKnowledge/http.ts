import { RateLimited } from './types';

const lastCall: Record<string, number> = {};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Polite, per-host throttled JSON/text fetch. 429/503 become RateLimited so the run backs off. */
export async function politeFetch(url: string, opts: { host: string; minGapMs: number; headers?: Record<string, string>; timeoutMs?: number }): Promise<Response> {
  const wait = (lastCall[opts.host] || 0) + opts.minGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[opts.host] = Date.now();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'PlajahAcademiaBot/1.0 (open education; contact via plajah.com)', Accept: 'application/json, application/xml;q=0.9, */*;q=0.5', ...opts.headers }, signal: ctl.signal });
    if (res.status === 429 || res.status === 503) throw new RateLimited(opts.host);
    return res;
  } finally { clearTimeout(timer); }
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Small stable hash for ids. */
export const hash = (s: string): string => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
