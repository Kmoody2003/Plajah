/**
 * Terra — minimal geohash (isomorphic, no deps).
 *
 * Why: Firestore has no spatial query. Every parcel doc carries a precision-7
 * geohash of its centroid, and the map loads the viewport by running one
 * prefix-range query per covering cell (`where geohash >= cell && <= cell+'~'`)
 * — a single-field range, so no composite-index trap. Docs written before the
 * geohash backfill simply don't match the range (missing fields are excluded
 * from range queries), which degrades to "not on the map yet", never an error.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat: number, lng: number, precision = 7): string {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx = idx * 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

/** Cell dimensions in degrees at a precision. Longitude gets the extra bit on odd totals. */
export function geohashCellSize(precision: number): { latDeg: number; lonDeg: number } {
  const bits = 5 * precision;
  return {
    lonDeg: 360 / 2 ** Math.ceil(bits / 2),
    latDeg: 180 / 2 ** Math.floor(bits / 2),
  };
}

export interface GeoBounds { south: number; west: number; north: number; east: number }

/** All cells of `precision` touching `bounds`, or null once the count exceeds `maxCells`. */
export function geohashCellsForBounds(bounds: GeoBounds, precision: number, maxCells: number): string[] | null {
  const { latDeg, lonDeg } = geohashCellSize(precision);
  const cells = new Set<string>();
  // Step by cell size from each edge; clamp the sample point inside the bounds
  // so the last row/column doesn't sample a cell past the edge.
  for (let lat = bounds.south; ; lat += latDeg) {
    for (let lng = bounds.west; ; lng += lonDeg) {
      cells.add(geohashEncode(Math.min(lat, bounds.north), Math.min(lng, bounds.east), precision));
      if (cells.size > maxCells) return null;
      if (lng >= bounds.east) break;
    }
    if (lat >= bounds.north) break;
  }
  return [...cells];
}

/**
 * Pick the finest precision whose covering set fits in `maxCells`.
 * Finer cells = fewer wasted reads at high zoom; coarser cells = fewer queries
 * when zoomed out. Returns null for a viewport too large to cover sanely —
 * the caller should gate on zoom instead of firing a city-wide read.
 */
export function coverBounds(bounds: GeoBounds, maxCells = 32): { precision: number; cells: string[] } | null {
  for (let p = 7; p >= 5; p--) {
    const cells = geohashCellsForBounds(bounds, p, maxCells);
    if (cells) return { precision: p, cells };
  }
  return null;
}
