/**
 * Curated starting shelves for live broadcast radio.
 *
 * Every shelf is a QUERY against the Radio Browser API — there are no hardcoded
 * stream URLs anywhere in this file. Stream endpoints move constantly (that's
 * precisely why the API exists), so baking one in guarantees dead air later.
 * Public broadcasters are found the same way as everything else: by name, tag,
 * or country code.
 *
 * Each query below was run against the live API before being committed here and
 * returned a full, healthy page of `lastcheckok=1` stations.
 */

import type { StationQuery } from '../services/radioBrowser';

export type ShelfKind = 'query' | 'trending' | 'topvoted' | 'countries';

export interface RadioShelf {
  id: string;
  title: string;
  /** Micro-label shown above the title in house uppercase tracking. */
  eyebrow: string;
  blurb: string;
  kind: ShelfKind;
  /** Present when `kind === 'query'`. */
  query?: StationQuery;
}

/**
 * PUBLIC RADIO FIRST — these lead the page.
 *
 * Note on how each is found:
 *  • NPR member stations self-identify with "NPR" in the station name.
 *  • BBC / CBC / ABC are name matches scoped by country code, because "ABC"
 *    alone collides with unrelated stations worldwide (ABC in the US, and a
 *    long tail of "abc"-prefixed community stations). Scoping to AU is what
 *    makes that shelf actually return the Australian broadcaster.
 *  • The "public radio" tag is a genuine, well-populated tag in their taxonomy.
 */
export const PUBLIC_RADIO_SHELVES: RadioShelf[] = [
  {
    id: 'npr',
    title: 'NPR & Member Stations',
    eyebrow: 'Public Radio',
    blurb: 'National Public Radio and its member stations across the United States.',
    kind: 'query',
    query: { name: 'NPR', limit: 60 },
  },
  {
    id: 'bbc',
    title: 'BBC',
    eyebrow: 'Public Radio',
    blurb: 'The World Service and the full BBC network out of the United Kingdom.',
    kind: 'query',
    // Mostly HLS streams — handled by hls.js on the player path.
    query: { name: 'BBC', countryCode: 'GB', limit: 60 },
  },
  {
    id: 'cbc',
    title: 'CBC / Radio-Canada',
    eyebrow: 'Public Radio',
    blurb: 'Canada’s public broadcaster, coast to coast.',
    kind: 'query',
    // The best-behaved public shelf: verified all-https, so nothing is blocked.
    query: { name: 'CBC', countryCode: 'CA', limit: 60 },
  },
  {
    id: 'abc-au',
    title: 'ABC Australia',
    eyebrow: 'Public Radio',
    blurb: 'The Australian Broadcasting Corporation — news, Radio National and local.',
    kind: 'query',
    query: { name: 'ABC', countryCode: 'AU', limit: 60 },
  },
  {
    id: 'public-radio-tag',
    title: 'Public Radio Worldwide',
    eyebrow: 'Public Radio',
    blurb: 'Everything the community has tagged as public service broadcasting.',
    kind: 'query',
    query: { tag: 'public radio', limit: 80 },
  },
];

/** Genre + format shelves. */
export const GENRE_SHELVES: RadioShelf[] = [
  {
    id: 'classical',
    title: 'Classical',
    eyebrow: 'Genre',
    blurb: 'Orchestral, chamber, opera and early music, around the clock.',
    kind: 'query',
    query: { tag: 'classical', limit: 80 },
  },
  {
    id: 'jazz',
    title: 'Jazz',
    eyebrow: 'Genre',
    blurb: 'Straight-ahead, smooth, bebop and everything between.',
    kind: 'query',
    query: { tag: 'jazz', limit: 80 },
  },
  {
    id: 'news',
    title: 'News & Talk',
    eyebrow: 'Format',
    blurb: 'Rolling news, current affairs and spoken word.',
    kind: 'query',
    query: { tag: 'news', limit: 80 },
  },
];

/** Dynamic shelves — computed by the API, not by a stored query. */
export const DISCOVERY_SHELVES: RadioShelf[] = [
  {
    id: 'trending',
    title: 'Trending Now',
    eyebrow: 'Discover',
    blurb: 'The most-tuned-in stations across the network right now.',
    kind: 'trending',
  },
  {
    id: 'topvoted',
    title: 'Most Loved',
    eyebrow: 'Discover',
    blurb: 'Highest-voted stations of all time.',
    kind: 'topvoted',
  },
  {
    id: 'countries',
    title: 'Browse by Country',
    eyebrow: 'Discover',
    // 241 country codes carry at least one live station.
    blurb: 'Tune in anywhere — every country with a live station on air.',
    kind: 'countries',
  },
];

/** Every shelf, in the order the browser renders them. Public radio leads. */
export const RADIO_SHELVES: RadioShelf[] = [
  ...PUBLIC_RADIO_SHELVES,
  ...GENRE_SHELVES,
  ...DISCOVERY_SHELVES,
];

/** Shelf ids grouped for the section rail. */
export const SHELF_GROUPS: { label: string; shelfIds: string[] }[] = [
  { label: 'Public Radio', shelfIds: PUBLIC_RADIO_SHELVES.map(s => s.id) },
  { label: 'Genres', shelfIds: GENRE_SHELVES.map(s => s.id) },
  { label: 'Discover', shelfIds: DISCOVERY_SHELVES.map(s => s.id) },
];

export const getShelf = (id: string): RadioShelf | undefined =>
  RADIO_SHELVES.find(s => s.id === id);
