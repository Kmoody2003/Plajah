/**
 * Terra survey engine — legal description reader + COGO traverse.
 * Fixtures are verbatim Detroit assessor-roll descriptions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLegalDescription, parseBearing } from '../services/terra/survey/legalDescription';
import { runTraverse, analyseRing, fitRecordToMap, surveyParcel } from '../services/terra/survey/parcelSurvey';
import { bearingToAzimuth, formatBearing, solveCurve, formatDms, rotate } from '../services/terra/survey/cogo';

const CONGRESS = `N LARNED PT OF LOTS 41 THRU 44 & PT OF 84,85,88,89 AND ALL OF 86 & 87, THE VACATED 20FT ALLEY LYING STHLY OF SAID PART OF LOTS 41- 44, INCLUSIVE AND NTHLY OF ALL OR PT OF SAID LOTS 85 THRU 88 INCLUSIVE AND STHLY 7.40FT OF ETHLY 160FT OF CONGRESS ST LYING BETW VAC BATES ST AND RANDOLPH ST ORGRINALLY PART OF SAID LOTS 42 THRU 44 INCLUSIVE & VAC 20FT ALLEY LYING ADJ TO LOTS 42- 44, ALL IN PLAN OF SECTION 1 OF THE CITY OF DETROIT L34 P550 CITY RECORDS. DESC AS: BEGINNING AT A POINT ON THE NTHLY LINE OF LARNED ST 60FT WD, POINT BEG A DISTANT ALG SAID N LINE N 59 DEGRS 52MIN 1SEC E 472.8FT FROM ETHLY LN WOODWARD AVE 190FT WD THENCE N 30 DEGRS 7MIN 44SEC W 260.28FT TO STHLY CONGRESS ST THENCE N 59 DEGRS 52MIN 1SEC E 30.61FT THENCE N 30DEGRS 10MIN 4SEC W 7.40FT THENCE PARALLEL TO CONGRESS ST N 59DEGRS 52MIN 1SEC E 160FT THEN ALG WTHLY LN RANDOLPH ST AND ITS EXTN NTHLY S 30DEGR 10MIN 4SEC E 267.70FT THEN S 59DEGRS 52MIN 16SEC W 190.80FT TO P O B  50823.68 SQ FT`;

const SEWARD = `N SEWARD PT OF LOT 2 DESC AS FOLS: COM AT SE COR OF LOT 1,SD PTE BEG ALSO PTE OF INTSEC OF W LINE OF PUBLIC ALLEY 20 FT WD, WITH N LINE OF SEWARD AVE 80 FT WD;TH S 63 DEG 50'47" W, ALG N LINE OF SD SEWARD AVE, SD LOT BEG ALSO S LINE OF SD LOT 1 & LOT 2 A DIST OF 78.37 FT TO POB; TH ALG ARC OF CUR CONCAVE TO E, RAD 45.0 FT AN ARC DIST OF 22.70 FT-CHD BRGS N 30 DEG 06' 34" E 22.46 FT TO A PTE; TH S 26 DEG 25'44" E 12.48 FT;TH S 63 DEG 53'46" W 18.75 FT TO P.O.B. SCHMIDTS SUB L19 P66 PLATS, W C R 2/117 138 SQ FT .003 AC`;

const GRAND_RIVER = `S GRAND RIVER 39 THRU 73 AND VAC ALLEY ADJ EXC N 7.50FT ADJ TO 73 AND VAC PARK TERRENCE AVE ADJ 66 THRU 73 PARK MANOR L33 P30 PLATS, W C R 18/395, MORE COMMONLY DESCRIBED AS: BEG AT A POINT AT THE S-W INTERSECTION OF SOUTH LINE GRAND RIVER AVE 100FT WD AND THE WESTERNLY LINE OF MANOR 50FT WD, SAID POINT BEING THE N-E CORNER LOT 57. THENCE CONT ALONG THE SOUTH LINE GRAND RIVER AVE 100FT WD 40FT TO P.O.B. THENCE N 61 DEGR 24' 45" W 538.23FT TO THE N-W CORNER LOT 63 PARK MANOR SUB AND THE SOUTH EAST INTERSECTION OF GRAND RIVER AVE 100FT WD AND EAST LINE MEYER AVE 66FT WD, THENCE S 1 DEGR 28' 55" E 208.23FT ALG EAST LINE MEYER AVE, THENCE S 61 DEGR 8' 12" E 454.92FT TO W LINE MANOR, THENCE N 35 DEGR 20' 10" E 105.52FT, THENCE N 61 DEGR 24' 45" W 40FT, THENCE N 35 DEGR 20' 10" E 107.50FT TO P.O.B.  ( 100,435.52 SF)`;

const JEFFERSON = ` N JEFFERSON PART OF 5 FAULCONER AND BOYNTON'S SUB L19 P85 OF PLATS WCR DESC AS BEG AT THE SOUTHWEST CORNER OF SAID LOT 5 AND THE FOLLOWING COURSES, N39 DEG 12'43" E 21.71 FT, S26 DEG 42'27" E 8 FT, S60 DEG 49'02" W 19.84 FT TO POB 77.08 SQ FT\r\n\r\nSPLIT ON 07/26/2018 INTO 18000097.001\r\n`;

const WOODWARD = `W WOODWARD PT OF LOTS 2 THRU 4 PT OF LOTS 63 THRU 66 AND VAC ALLEYS ADJ ALL DESC AS FOLS BEG AT NE COR JEFFERSON AVE 210 FT WD & GRISWOLD ST 90 FT WD TH N 30D 06M W 190.50 FT TH N 59D 52M 10S E 130.28 FT TH S 30D 09M E 190.57 FT TH S 59D 54M W 130.45 FT TO POB PLAT OF SEC 2 GOVERNOR & JUDGES PLAN L34 P549 DEEDS, W C R 2/38 190.57 IRREG`;

test('bearings in every roll abbreviation', () => {
  const cases: [string, number][] = [
    ['N 59 DEGRS 52MIN 1SEC E', 59 + 52 / 60 + 1 / 3600],
    [`S 63 DEG 50'47" W`, 180 + 63 + 50 / 60 + 47 / 3600],
    [`N39 DEG 12'43" E`, 39 + 12 / 60 + 43 / 3600],
    ['N 30D 06M W', 360 - (30 + 6 / 60)],
    ['N 59D 52M 10S E', 59 + 52 / 60 + 10 / 3600],
    [`N 30°07'44" W`, 360 - (30 + 7 / 60 + 44 / 3600)],
    ['S 30DEGR 10MIN 4SEC E', 180 - (30 + 10 / 60 + 4 / 3600)],
  ];
  for (const [s, az] of cases) {
    const b = parseBearing(s);
    assert.ok(b, s);
    assert.ok(Math.abs(bearingToAzimuth(b!) - az) < 1e-9, s);
  }
  assert.equal(formatBearing(360 - (30 + 7 / 60 + 44 / 3600)), `N 30°07'44" W`);
  assert.equal(formatDms(59.99999), `60°00'00"`);
});

test('tie call (distant … FROM) is separated from the boundary', () => {
  const p = parseLegalDescription(CONGRESS);
  assert.equal(p.ties.length, 1);
  assert.equal(p.courses.length, 6);
  assert.equal(p.recordAreaSqFt, 50823.68);
  const t = runTraverse(p.courses)!;
  assert.ok(t.misclosure < 0.2, `misclosure ${t.misclosure}`);
  assert.ok(Math.abs(t.areaSqFt - 50823.68) / 50823.68 < 0.003, `area ${t.areaSqFt}`);
  const sum = t.courses.reduce((s, c) => s + c.interiorAngle!, 0);
  assert.ok(Math.abs(sum - 4 * 180) < 0.01, `angle sum ${sum}`);
});

test('commencement to POB, then a curve concave to the east', () => {
  const p = parseLegalDescription(SEWARD);
  assert.equal(p.ties.length, 1);
  assert.equal(p.courses.length, 3);
  const c = p.courses[0];
  assert.equal(c.kind, 'curve');
  if (c.kind === 'curve') {
    assert.equal(c.radius, 45);
    assert.equal(c.arc, 22.7);
    assert.equal(c.chord, 22.46);
    assert.equal(c.concaveAz, 90);
  }
  const t = runTraverse(p.courses)!;
  assert.equal(t.courses[0].curve?.turn, 'right');
  assert.ok(t.misclosure < 0.15, `misclosure ${t.misclosure}`);
  assert.ok(Math.abs(t.areaSqFt - 138) < 6, `area ${t.areaSqFt}`);
});

test('bearing-less "CONT … 40FT TO POB" leaves all six courses as boundary', () => {
  const p = parseLegalDescription(GRAND_RIVER);
  assert.equal(p.ties.length, 0);
  assert.equal(p.courses.length, 6);
  assert.equal(p.recordAreaSqFt, 100435.52);
  // The record itself does not close (~29.8 ft) — the engine must SAY so, not hide it.
  const t = runTraverse(p.courses)!;
  assert.ok(t.misclosure > 25 && t.misclosure < 35, `misclosure ${t.misclosure}`);
  assert.equal(t.closes, false);
});

test('comma-separated courses in one clause; trailing SPLIT notes ignored', () => {
  const p = parseLegalDescription(JEFFERSON);
  assert.equal(p.courses.length, 3);
  const t = runTraverse(p.courses)!;
  assert.ok(t.misclosure < 0.01);
  // Independent check: ½·a·b·sin(C) at the second corner (record says 77.08 — it is off ~3%).
  const C = t.courses[1].interiorAngle! * Math.PI / 180;
  assert.ok(Math.abs(t.areaSqFt - 0.5 * 21.71 * 8 * Math.sin(C)) < 0.05, `area ${t.areaSqFt}`);
});

test('D/M/S abbreviations + plat + IRREG dims', () => {
  const p = parseLegalDescription(WOODWARD);
  assert.equal(p.courses.length, 4);
  assert.deepEqual(p.lotDims, { frontage: 190.57, irregular: true });
  assert.equal(p.plat?.liber, '34');
  const t = runTraverse(p.courses)!;
  assert.ok(t.precision > 1000);
  assert.ok(Math.abs(t.areaSqFt - 24699) / 24699 < 0.03, `area ${t.areaSqFt}`);
});

test('platted lot: dims + plat reference, no calls', () => {
  const p = parseLegalDescription('S HOGARTH 221 E 10 FT 222 CROSMAN & MC KAYS SUB L17 P98 PLATS, W C R 10/69 40 X 110');
  assert.equal(p.hasMetesAndBounds, false);
  assert.deepEqual(p.lotDims, { frontage: 40, depth: 110, irregular: false });
  assert.equal(p.plat?.liber, '17');
  assert.equal(p.plat?.page, '98');
});

test('curve solver identities', () => {
  const c = solveCurve({ radius: 45, arc: 22.7 })!;
  assert.ok(Math.abs(c.chord - 22.46) < 0.01);
  const c2 = solveCurve({ arc: 22.7, chord: c.chord })!;
  assert.ok(Math.abs(c2.radius - 45) < 1e-6);
});

test('mapped polygon sides/angles + record fit recovers a rotation', () => {
  // 40 × 110 lot, rotated 12° and with a collinear digitising vertex.
  const rect = [{ x: 0, y: 0 }, { x: 0, y: 55 }, { x: 0, y: 110 }, { x: 40, y: 110 }, { x: 40, y: 0 }]
    .map(p => rotate(p, 12));
  const m = analyseRing(rect)!;
  assert.equal(m.sides.length, 4);
  assert.ok(m.isRectangular);
  assert.ok(Math.abs(m.areaSqFt - 4400) < 1e-6);
  const record = [{ x: 0, y: 0 }, { x: 0, y: 110 }, { x: 40, y: 110 }, { x: 40, y: 0 }];
  const f = fitRecordToMap(record, m.vertices);
  assert.ok(f.max < 0.01, `max ${f.max}`);
  assert.ok(Math.abs(f.rotationDeg - 12) < 0.01, `rot ${f.rotationDeg}`);
});

test('adjoiners: flush neighbour and a 1.5 ft gap are detected', () => {
  const lat0 = 42.35, lng0 = -83.05;
  const ftLat = 1 / 364000, ftLng = 1 / 269000; // approx at 42°N
  const ll = (x: number, y: number) => [lng0 + x * ftLng, lat0 + y * ftLat];
  const poly = (pts: number[][]) => ({ type: 'Polygon' as const, coordinates: [[...pts.map(([x, y]) => ll(x, y)), ll(pts[0][0], pts[0][1])]] });
  const subject: any = { id: 'a', parcelNumber: 'a', geometry: poly([[0, 0], [0, 100], [30, 100], [30, 0]]), centroidLat: lat0, centroidLng: lng0, sources: [], updatedAt: 0 };
  const east: any = { id: 'b', address: 'EAST', geometry: poly([[30, 0], [30, 100], [60, 100], [60, 0]]), sources: [], updatedAt: 0 };
  const west: any = { id: 'c', address: 'WEST', geometry: poly([[-31.5, 0], [-31.5, 100], [-1.5, 100], [-1.5, 0]]), sources: [], updatedAt: 0 };
  const s = surveyParcel(subject, [east, west]);
  const adj = s.mapped!.sides.flatMap(x => x.adjoiners);
  assert.ok(adj.some(a => a.parcelId === 'b' && a.kind === 'flush'));
  assert.ok(adj.some(a => a.parcelId === 'c' && a.kind === 'gap' && Math.abs(a.offsetFt - 1.5) < 0.2));
});

test('site context: building setbacks, coverage, nearest hydrant', async () => {
  const { siteContext } = await import('../services/terra/survey/siteContext');
  const lat0 = 42.35, lng0 = -83.05;
  const ftLat = 1 / 364000, ftLng = 1 / 269000;
  const ll = (x: number, y: number) => [lng0 + x * ftLng, lat0 + y * ftLat];
  const poly = (pts: number[][]) => ({ type: 'Polygon' as const, coordinates: [[...pts.map(([x, y]) => ll(x, y)), ll(pts[0][0], pts[0][1])]] });
  const lot: any = { id: 'a', parcelNumber: '1.', geometry: poly([[0, 0], [0, 100], [40, 100], [40, 0]]), centroidLat: lat0, centroidLng: lng0, sources: [], updatedAt: 0 };
  const s = surveyParcel(lot, []);
  const house = { id: 'FOOTPRINT:1', kind: 'FOOTPRINT' as const, props: { STORIES: 2 }, geometry: poly([[5, 20], [5, 70], [35, 70], [35, 20]]) };
  const hyd = { id: 'HYDRANT:1', kind: 'HYDRANT' as const, props: { DFDHYDRANTID: 'X1' }, geometry: { type: 'Point' as const, coordinates: ll(-30, 50) } };
  const c = siteContext(s, [house, hyd], '1.');
  assert.equal(c.buildings.length, 1);
  assert.ok(Math.abs(c.lotCoveragePct! - 37.5) < 0.5, `coverage ${c.lotCoveragePct}`);
  const sb = c.buildings[0].setbacks.slice().sort((a, b) => a - b);
  // 5 ft each side, 20 ft front, 30 ft rear (projection approx → loose tolerance).
  assert.ok(Math.abs(sb[0] - 5) < 0.2 && Math.abs(sb[1] - 5) < 0.2 && Math.abs(sb[2] - 20) < 0.3 && Math.abs(sb[3] - 30) < 0.3, sb.join(','));
  assert.ok(Math.abs(c.nearestHydrant!.distanceFt - 30) < 0.5);
});
