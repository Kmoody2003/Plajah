/**
 * Terra survey accuracy report — run after ANY change to the legal-description
 * reader or the traverse math.
 *
 *   npm run accuracy:terra-survey             # scans 120k parcels (~10 min)
 *   npm run accuracy:terra-survey -- 40 out.json
 *
 * Pages through the City of Detroit assessor parcel layer, keeps every legal
 * description that contains bearings, runs parse → traverse → best-fit against
 * the city polygon, and prints:
 *   • how many descriptions were read as metes and bounds and ran as a traverse
 *   • closure (exact, ≥1:5,000, ≥1:1,000)
 *   • computed area vs the area written in the record
 *   • record-vs-map fit for the closing ones
 *   • how many non-closers get a "likely typo" diagnosis
 * Baseline 2026-11-18 (120,000 parcels → 544 with bearings):
 *   v1: ran 447 · ≥1:1000 242 · area ±1% 148/287
 *   v4: ran 522 · ≥1:1000 330 · area ±1% 218/343
 * Most remaining non-closers are genuine record defects (missing N/S, calls
 * with no distance, measured-vs-record rounding); the UI reports each one.
 */
import { parseLegalDescription } from '../services/terra/survey/legalDescription';
import { surveyParcel, bestTraverse, diagnoseMisclosure } from '../services/terra/survey/parcelSurvey';
import * as fs from 'node:fs';

const B = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0/query';
const PAGES = Number(process.argv[2] || 120);
const PAGE = 1000; // layer maxRecordCount
const OUT = process.argv[3];
const BEARING_HINT = /\b[NS]\s*\.?\s*\d{1,2}(?:\.\d+)?\s*(?:°|DEG|D\b|-)/;

async function get(url: string) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); return await r.json(); } catch { /* retry */ }
  }
  return null;
}

(async () => {
  const hits: any[] = [];
  let scanned = 0;
  for (let p = 0; p < PAGES; p++) {
    const d = await get(`${B}?where=1%3D1&outFields=parcel_id,legal_description&returnGeometry=false&orderByFields=ObjectId&resultOffset=${p * PAGE}&resultRecordCount=${PAGE}&f=json`);
    const feats = d?.features ?? [];
    scanned += feats.length;
    for (const f of feats) if (BEARING_HINT.test(String(f.attributes.legal_description || '').toUpperCase())) hits.push(f.attributes);
    if (feats.length < PAGE) break;
  }
  console.log(`scanned ${scanned} parcels, ${hits.length} with bearings`);

  const rows: any[] = [];
  for (let i = 0; i < hits.length; i += 50) {
    const ids = hits.slice(i, i + 50).map(h => `'${String(h.parcel_id).replace(/'/g, "''")}'`).join(',');
    const g = await get(`${B}?where=${encodeURIComponent(`parcel_id IN (${ids})`)}&outFields=parcel_id,address,legal_description,total_square_footage&outSR=4326&f=geojson`);
    for (const f of g?.features ?? []) {
      const pr = f.properties;
      const ring = f.geometry?.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry?.coordinates?.[0]?.[0];
      if (!ring) continue;
      const parcel: any = {
        id: pr.parcel_id, parcelNumber: pr.parcel_id, address: pr.address, legalDescription: pr.legal_description, lotSqFt: pr.total_square_footage, geometry: f.geometry,
        centroidLat: ring.reduce((a: number, c: number[]) => a + c[1], 0) / ring.length, centroidLng: ring.reduce((a: number, c: number[]) => a + c[0], 0) / ring.length, sources: [], updatedAt: 0,
      };
      const legal = parseLegalDescription(pr.legal_description);
      const s = surveyParcel(parcel, []);
      const t = bestTraverse(legal);
      rows.push({
        id: pr.parcel_id, address: pr.address, mb: legal.hasMetesAndBounds, describes: legal.describes,
        ran: !!t, mis: t?.misclosure ?? null, prec: t ? (t.precision === Infinity ? 1e12 : t.precision) : null,
        areaRec: legal.recordAreaSqFt ?? null, area: t?.areaSqFt ?? null,
        fitMax: s.fit?.max ?? null, hint: t && t.precision < 1000 ? diagnoseMisclosure(t.courses.map(c => c.call)) : null,
        text: String(pr.legal_description).slice(0, 4000),
      });
    }
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));

  const n = rows.length, ran = rows.filter(r => r.ran);
  const pct = (a: number, b: number) => `${a}/${b} (${b ? ((a / b) * 100).toFixed(1) : '0'}%)`;
  console.log(`read as metes & bounds  ${pct(rows.filter(r => r.mb).length, n)}`);
  console.log(`ran as a traverse       ${pct(ran.length, n)}`);
  console.log(`closes exactly (<0.02') ${pct(ran.filter(r => r.mis < 0.02).length, ran.length)}`);
  console.log(`closes ≥ 1:5,000        ${pct(ran.filter(r => r.prec >= 5000).length, ran.length)}`);
  console.log(`closes ≥ 1:1,000        ${pct(ran.filter(r => r.prec >= 1000).length, ran.length)}`);
  const withArea = ran.filter(r => r.areaRec && r.describes !== 'exception');
  console.log(`area within 1% of record ${pct(withArea.filter(r => Math.abs(r.area - r.areaRec) / r.areaRec <= 0.01).length, withArea.length)}`);
  const fitted = ran.filter(r => r.fitMax !== null && r.prec >= 1000);
  console.log(`fit to city map ≤ 2 ft  ${pct(fitted.filter(r => r.fitMax <= 2).length, fitted.length)}   ≤ 6 ft ${pct(fitted.filter(r => r.fitMax <= 6).length, fitted.length)}`);
  console.log(`non-closers with a typo diagnosis ${ran.filter(r => r.hint).length}`);
})();
