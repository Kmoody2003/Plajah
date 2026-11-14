// services/coedit/hlc.ts — hybrid logical clock stamps for co-editing.
//
// A stamp is `wall.counter.site` with fixed-width base-36 fields, so plain string comparison is
// causal-then-wall-clock order with the site id as the final tie-break. Every write in a shared
// project carries one; last-writer-wins registers compare them. Pure (no Firebase).

const W = 9; // ms since epoch in base 36 fits 9 chars until ~5188 AD
const C = 4;

export interface Clock {
  site: string;
  wall: number;
  counter: number;
}

export function newClock(site: string): Clock {
  return { site: site.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'site', wall: 0, counter: 0 };
}

const fmt = (c: Clock) => `${c.wall.toString(36).padStart(W, '0')}.${c.counter.toString(36).padStart(C, '0')}.${c.site}`;

/** A fresh stamp greater than every stamp this clock has issued or seen. */
export function tick(c: Clock, now = Date.now()): string {
  if (now > c.wall) {
    c.wall = now;
    c.counter = 0;
  } else {
    c.counter++;
  }
  return fmt(c);
}

export function parseStamp(s: string): { wall: number; counter: number; site: string } | null {
  const [w, n, ...rest] = s.split('.');
  if (!w || !n || !rest.length) return null;
  return { wall: parseInt(w, 36), counter: parseInt(n, 36), site: rest.join('.') };
}

/** Advance the clock past a stamp received from another site. */
export function observe(c: Clock, stamp: string, now = Date.now()) {
  const p = parseStamp(stamp);
  if (!p) return;
  const wall = Math.max(c.wall, p.wall, now);
  if (wall === c.wall && wall === p.wall) c.counter = Math.max(c.counter, p.counter) + 1;
  else if (wall === c.wall) c.counter++;
  else if (wall === p.wall) c.counter = p.counter + 1;
  else c.counter = 0;
  c.wall = wall;
}

export const stampWall = (s: string | undefined) => (s ? parseStamp(s)?.wall ?? 0 : 0);
export const stampSite = (s: string | undefined) => (s ? parseStamp(s)?.site ?? '' : '');

/** A stamp that beats every real one (local draft overlays). */
export const TOP_STAMP = '~';
