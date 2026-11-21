// Realtime → API: post a finished room's result, signed with the server-to-server secret. Retries with
// backoff; the API is idempotent per match (a repeat answers 200 { already: true }), so retrying is safe.

import type { RoomResult } from './room';
import { signBody, RESULT_SIG_HEADER, RESULT_TS_HEADER } from './ticket';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface PosterOpts {
  apiUrl: string;          // e.g. https://plajah.com  (POST <apiUrl>/api/gamer/rt/result)
  secret: string;          // GAMER_RT_RESULT_SECRET
  fetch?: FetchLike;
  backoffMs?: number[];
  now?: () => number;
  log?: (msg: string) => void;
}

export function resultPoster(o: PosterOpts): (r: RoomResult) => Promise<boolean> {
  const f: FetchLike = o.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
  const waits = o.backoffMs ?? [0, 1000, 4000, 10_000];
  const now = o.now ?? Date.now;
  const url = `${o.apiUrl.replace(/\/+$/, '')}/api/gamer/rt/result`;
  return async (r: RoomResult) => {
    for (let i = 0; i < waits.length; i++) {
      if (waits[i]) await new Promise(res => setTimeout(res, waits[i]));
      const ts = now(); // re-sign each attempt so a late retry stays inside the API's skew window
      try {
        const res = await f(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [RESULT_TS_HEADER]: String(ts), [RESULT_SIG_HEADER]: signBody(r, o.secret, ts) },
          body: JSON.stringify(r),
        });
        if (res.ok) return true;
        // 4xx other than 409/429 won't get better by retrying (bad signature, unknown match, invalid result).
        if (res.status >= 400 && res.status < 500 && res.status !== 409 && res.status !== 429) {
          o.log?.(`result ${r.matchId} rejected: ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
          return false;
        }
      } catch (e) { o.log?.(`result ${r.matchId} attempt ${i + 1} failed: ${String(e)}`); }
    }
    return false;
  };
}
