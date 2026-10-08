/**
 * Bundled vector basemap for the Persia road map (public domain, Natural Earth 1:50m land and coastline).
 *
 *   npx tsx scripts/dossier/buildRouteBasemap.ts      ->  data/dossier/persiaBasemap.json  (< 150 KB)
 *
 * Same approach as the Douglass basemaps (buildBasemap.ts): [lon, lat] geometry, simplified and clipped to the box.
 * "Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com."
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTRIBUTION, clipLines, clipPolys, fetchGeo, linesOf, type BBox } from './buildBasemap';

const ROOT = join(import.meta.dirname ?? '.', '..', '..');
const bbox: BBox = [34, 14, 118, 52];
const tol = 0.06;
const land = linesOf(await fetchGeo('ne_50m_land.geojson')).rings;
const coast = linesOf(await fetchGeo('ne_50m_coastline.geojson')).lines;
const out = {
  attribution: ATTRIBUTION,
  source: 'Natural Earth 1:50m land and coastline (v5.x), via github.com/nvkelso/natural-earth-vector',
  license: 'public-domain',
  bbox,
  simplifyToleranceDeg: tol,
  layers: { land: clipPolys(land, bbox, tol), coast: clipLines(coast, bbox, tol) },
};
const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'data', 'dossier', 'persiaBasemap.json'), json);
console.log(`persiaBasemap.json: ${(json.length / 1024).toFixed(1)} KB (land:${out.layers.land.length} coast:${out.layers.coast.length})`);
if (json.length > 150_000) process.exitCode = 1;
