/**
 * Partition: "Hold the pen". Pure logic for the boundary-drawing experience, ported from public/dossier/partition-map.html.
 *
 * The map is the Foreign Office Research Department's September 1948 map of the Punjab (1280 x 949 in its own pixels).
 * The reader's line runs between the same two ends as the award's printed line, with three movable points between them.
 * Eleven towns are classified by which side of the reader's line they sit on and compared with the side they fell on
 * under the final award. Town positions are placed by hand from the map and are APPROXIMATE; nothing here is survey data.
 */

export interface Pt { x: number; y: number }

export const MAP_W = 1280;
export const MAP_H = 949;
export const MAP_URL = '/dossier/partition/maps/punjab-fo-1948.jpg';

/** The award's two ends, read off the printed red line: top at the Gurdaspur-Chamba edge, bottom at the Sutlej. */
export const TOP: Pt = { x: 887, y: 292 };
export const BOT: Pt = { x: 707, y: 593 };

/** The reader's three movable points when the page opens or is reset. */
export const START_POINTS: Pt[] = [{ x: TOP.x - 12, y: TOP.y + 70 }, { x: 800, y: 420 }, { x: BOT.x + 30, y: BOT.y - 70 }];

export type Country = 'I' | 'P';

export interface Town { n: string; x: number; y: number; /** Outcome under the final award: India or Pakistan. */ a: Country }

export const TOWNS: Town[] = [
  { n: 'Sialkot', x: 790, y: 282, a: 'P' }, { n: 'Gurdaspur', x: 881, y: 343, a: 'I' }, { n: 'Amritsar', x: 840, y: 413, a: 'I' },
  { n: 'Lahore', x: 762, y: 424, a: 'P' }, { n: 'Sheikhupura', x: 716, y: 383, a: 'P' }, { n: 'Kapurthala', x: 852, y: 434, a: 'I' },
  { n: 'Jullundur', x: 924, y: 458, a: 'I' }, { n: 'Hoshiarpur', x: 962, y: 420, a: 'I' }, { n: 'Ferozepore', x: 800, y: 497, a: 'I' },
  { n: 'Montgomery', x: 612, y: 540, a: 'P' }, { n: 'Lyallpur', x: 606, y: 428, a: 'P' },
];

/** Keeps a dragged point on the map. */
export const clampPt = (p: Pt): Pt => ({
  x: Math.max(40, Math.min(MAP_W - 40, Number.isFinite(p.x) ? p.x : 40)),
  y: Math.max(30, Math.min(MAP_H - 29, Number.isFinite(p.y) ? p.y : 30)),
});

/** Maps a client coordinate inside the rendered svg box (left, top, width, height) to map pixels. */
export function toMap(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): Pt {
  const w = box.width || 1, h = box.height || 1;
  return clampPt({ x: ((clientX - box.left) / w) * MAP_W, y: ((clientY - box.top) / h) * MAP_H });
}

/** The whole line, with the two end legs extended straight up and down off the map. */
export const fullLine = (pts: Pt[]): Pt[] => [{ x: TOP.x, y: 0 }, TOP, ...pts, BOT, { x: BOT.x, y: MAP_H }];

/** True when the town is EAST of the reader's line (the line passes to its west). Ray cast to the west, crossing parity. */
export function eastOfLine(town: Pt, pts: Pt[]): boolean {
  const full = fullLine(pts);
  let n = 0;
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i], b = full[i + 1];
    if ((a.y > town.y) !== (b.y > town.y)) {
      const x = a.x + ((town.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x < town.x) n++;
    }
  }
  return n % 2 === 1;
}

export interface TownResult { town: Town; east: boolean; same: boolean }
export interface PenResult { towns: TownResult[]; west: TownResult[]; east: TownResult[]; match: number; total: number; verdict: string }

export function verdictFor(match: number, total: number): string {
  if (match === total) return 'Every place sits on the same side as in the final award. Radcliffe’s line still cuts through more than towns: canals, rail and villages are where it was fought over.';
  if (match >= total - 2) return 'Close. The places that disagree are where the award was most contested.';
  return 'Quite different. Every place that differs is a town whose fate a real commission had to decide on partial evidence.';
}

/** East of the line = India's side, west = Pakistan's side, as in the final award. */
export function classify(pts: Pt[], towns: Town[] = TOWNS): PenResult {
  const rs: TownResult[] = towns.map(town => {
    const east = eastOfLine(town, pts);
    return { town, east, same: (east ? 'I' : 'P') === town.a };
  });
  const match = rs.filter(r => r.same).length;
  return { towns: rs, west: rs.filter(r => !r.east), east: rs.filter(r => r.east), match, total: rs.length, verdict: verdictFor(match, rs.length) };
}

/** Arrow-key step in map pixels (Shift for a bigger one); null for other keys. */
export function keyStep(key: string, shift: boolean): Pt | null {
  const s = shift ? 20 : 6;
  switch (key) {
    case 'ArrowLeft': return { x: -s, y: 0 };
    case 'ArrowRight': return { x: s, y: 0 };
    case 'ArrowUp': return { x: 0, y: -s };
    case 'ArrowDown': return { x: 0, y: s };
    default: return null;
  }
}
