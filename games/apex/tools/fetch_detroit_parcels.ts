// Fetch downtown Detroit parcels (real lot footprints) through Terra's adapter.
// Only a geographic bounding box is sent. Output: tools/data/detroit_parcels.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDetroitParcels } from '../../../services/terra/detroitAdapter';

const here = dirname(fileURLToPath(import.meta.url));
const b = { south: 42.3215, west: -83.0690, north: 42.3470, east: -83.0290 };

const parcels = await fetchDetroitParcels({ envelope: { xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north }, maxRecords: 14000 });
const slim = parcels
  .filter((p) => p.geometry && (p.geometry.type === 'Polygon' || p.geometry.type === 'MultiPolygon'))
  .map((p) => ({
    id: p.id, a: p.address, c: [p.centroidLng, p.centroidLat],
    ring: p.geometry!.type === 'Polygon' ? (p.geometry as any).coordinates[0] : (p.geometry as any).coordinates[0][0],
    lot: p.lotSqFt, imp: p.isImproved, fa: p.floorAreaSqFt, yr: p.yearBuilt, cls: p.propertyClass, use: p.useCode, st: p.buildingStyle,
  }));
mkdirSync(join(here, 'data'), { recursive: true });
writeFileSync(join(here, 'data', 'detroit_parcels.json'), JSON.stringify({ bounds: b, parcels: slim }));
console.log('parcels', parcels.length, 'kept', slim.length, 'improved', slim.filter((s) => s.imp).length);
