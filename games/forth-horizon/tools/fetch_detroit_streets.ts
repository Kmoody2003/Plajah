// Fetch downtown Detroit street centrelines through Terra's own adapter (the city's open ArcGIS service).
// Only a geographic bounding box is sent. Output: tools/data/detroit_streets.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDetroitStreets } from '../../../services/terra/detroitAdapter';

const here = dirname(fileURLToPath(import.meta.url));
const bounds = { south: 42.318, west: -83.078, north: 42.352, east: -83.026 };

const streets = await fetchDetroitStreets(bounds, { maxRecords: 6000 });
mkdirSync(join(here, 'data'), { recursive: true });
writeFileSync(join(here, 'data', 'detroit_streets.json'), JSON.stringify({ bounds, streets }));
console.log('segments', streets.length, 'named', streets.filter((s) => s.name).length);
