// Digital venues as data, in metres. x is across the stage, y is up, audience sits towards +z and
// the stage lip is at z = 0. Building the geometry is stageScene.ts's job; this stays pure so the
// rig placement can be tested.

import { canMove, hasColor, type FixtureCategory, type FixtureProfile } from './fixtureProfiles';
import { profileOf, type PatchedFixture } from './boardCore';

export type VenueKind = 'room' | 'club' | 'theatre' | 'hall' | 'arena' | 'stadium' | 'house' | 'photo';

export interface TrussLine { y: number; z: number; span: number; use: 'movers' | 'wash' | 'front' | 'back' }

export interface VenueSpec {
  id: string;
  name: string;
  kind: VenueKind;
  capacity: string;
  blurb: string;
  width: number;
  depth: number;
  height: number;
  stage: { width: number; depth: number; height: number };
  trusses: TrussLine[];
  /** A starter rig, as built-in or catalog profile ids. */
  rig: { profileId: string; count: number; name: string }[];
  crowd: number;
  /** Camera orbit target and distance for the opening view. */
  view: { height: number; distance: number };
}

const spot = 'spot-16', wash = 'wash-15', par = 'par-rgbwau-6', bar = 'bar-4cell', strobe = 'strobe-2', fog = 'fog-2';

export const VENUES: VenueSpec[] = [
  {
    id: 'home', name: 'Home', kind: 'room', capacity: 'Living room', blurb: 'A 5 × 6 m room with sofa, TV and smart lights.',
    width: 5, depth: 6, height: 2.6, stage: { width: 0, depth: 0, height: 0 },
    trusses: [{ y: 2.5, z: 1.4, span: 3.6, use: 'wash' }],
    rig: [{ profileId: 'par-rgb-3', count: 4, name: 'Corner light' }], crowd: 0, view: { height: 1.3, distance: 4.4 },
  },
  {
    id: 'club', name: 'Small club', kind: 'club', capacity: '150', blurb: 'Low ceiling, corner stage, one truss and a haze machine.',
    width: 12, depth: 16, height: 4.2, stage: { width: 7, depth: 3.6, height: 0.5 },
    trusses: [{ y: 3.8, z: -1.6, span: 6.5, use: 'movers' }, { y: 3.8, z: 2, span: 7, use: 'front' }],
    rig: [{ profileId: wash, count: 4, name: 'Wash' }, { profileId: par, count: 6, name: 'Par' }, { profileId: strobe, count: 2, name: 'Strobe' }, { profileId: fog, count: 1, name: 'Haze' }],
    crowd: 120, view: { height: 2.2, distance: 13 },
  },
  {
    id: 'theatre-small', name: 'Small theatre', kind: 'theatre', capacity: '350', blurb: 'Proscenium stage, raked seats and a front-of-house bar.',
    width: 16, depth: 24, height: 9, stage: { width: 11, depth: 8, height: 0.9 },
    trusses: [{ y: 6.5, z: -6, span: 10, use: 'back' }, { y: 6.5, z: -3, span: 10, use: 'movers' }, { y: 7.6, z: 8, span: 12, use: 'front' }],
    rig: [{ profileId: spot, count: 6, name: 'Spot' }, { profileId: par, count: 8, name: 'Wash par' }, { profileId: 'par-drgbwas-7', count: 8, name: 'Front' }, { profileId: fog, count: 1, name: 'Haze' }],
    crowd: 280, view: { height: 3, distance: 21 },
  },
  {
    id: 'hall', name: 'Medium hall', kind: 'hall', capacity: '1,500', blurb: 'Concert hall with a balcony and three trusses.',
    width: 28, depth: 40, height: 14, stage: { width: 16, depth: 10, height: 1.2 },
    trusses: [{ y: 10, z: -8, span: 15, use: 'back' }, { y: 10, z: -4, span: 15, use: 'movers' }, { y: 10, z: 0, span: 15, use: 'wash' }, { y: 11, z: 10, span: 18, use: 'front' }],
    rig: [{ profileId: spot, count: 10, name: 'Spot' }, { profileId: wash, count: 12, name: 'Wash' }, { profileId: bar, count: 8, name: 'Bar' }, { profileId: strobe, count: 6, name: 'Strobe' }, { profileId: fog, count: 2, name: 'Haze' }],
    crowd: 1100, view: { height: 4.5, distance: 15 },
  },
  {
    id: 'hall-large', name: 'Large theatre', kind: 'hall', capacity: '5,000', blurb: 'A big touring house with two balconies and a wide stage.',
    width: 46, depth: 62, height: 22, stage: { width: 24, depth: 14, height: 1.5 },
    trusses: [{ y: 15, z: -12, span: 22, use: 'back' }, { y: 15, z: -7, span: 22, use: 'movers' }, { y: 15, z: -2, span: 22, use: 'movers' }, { y: 15, z: 3, span: 22, use: 'wash' }, { y: 17, z: 16, span: 28, use: 'front' }],
    rig: [{ profileId: spot, count: 16, name: 'Spot' }, { profileId: wash, count: 20, name: 'Wash' }, { profileId: bar, count: 12, name: 'Bar' }, { profileId: strobe, count: 10, name: 'Strobe' }, { profileId: fog, count: 2, name: 'Haze' }],
    crowd: 3000, view: { height: 7, distance: 25 },
  },
  {
    id: 'arena', name: 'Arena', kind: 'arena', capacity: '18,000', blurb: 'End-stage bowl with a flown rig and a floor crowd.',
    width: 110, depth: 85, height: 34, stage: { width: 30, depth: 16, height: 2 },
    trusses: [{ y: 20, z: -13, span: 32, use: 'back' }, { y: 20, z: -8, span: 34, use: 'movers' }, { y: 20, z: -3, span: 34, use: 'movers' }, { y: 20, z: 3, span: 34, use: 'wash' }, { y: 22, z: 22, span: 42, use: 'front' }],
    rig: [{ profileId: spot, count: 24, name: 'Spot' }, { profileId: wash, count: 28, name: 'Wash' }, { profileId: bar, count: 16, name: 'Bar' }, { profileId: strobe, count: 12, name: 'Strobe' }, { profileId: fog, count: 4, name: 'Haze' }],
    crowd: 6000, view: { height: 9, distance: 44 },
  },
  {
    id: 'stadium', name: 'Stadium', kind: 'stadium', capacity: '60,000', blurb: 'An open-air bowl with a festival stage at one end of the pitch.',
    width: 150, depth: 190, height: 46, stage: { width: 44, depth: 18, height: 3 },
    trusses: [{ y: 24, z: -15, span: 44, use: 'back' }, { y: 24, z: -9, span: 46, use: 'movers' }, { y: 24, z: -3, span: 46, use: 'movers' }, { y: 24, z: 3, span: 46, use: 'wash' }],
    rig: [{ profileId: spot, count: 30, name: 'Spot' }, { profileId: wash, count: 36, name: 'Wash' }, { profileId: bar, count: 20, name: 'Bar' }, { profileId: strobe, count: 16, name: 'Strobe' }, { profileId: fog, count: 4, name: 'Haze' }],
    crowd: 10000, view: { height: 12, distance: 72 },
  },
  {
    id: 'christmas', name: 'Christmas house', kind: 'house', capacity: 'Front yard', blurb: 'A snowy house and yard for planning a holiday light display.',
    width: 40, depth: 40, height: 12, stage: { width: 0, depth: 0, height: 0 },
    trusses: [], rig: [], crowd: 0, view: { height: 3, distance: 26 },
  },
];

export const venueById = (id: string) => VENUES.find((v) => v.id === id);

/** Where one fixture hangs and how it's rigged in a venue. */
export interface RigSpot {
  fixtureId: string;
  x: number;
  y: number;
  z: number;
  /** Hung heads point down; floor units point up. */
  mount: 'hang' | 'floor';
  /** World point a fixture with no pan/tilt is focused on. */
  aim: [number, number, number];
  /** Beam angle in degrees at zoom 0.5. */
  beamDeg: number;
  moves: boolean;
}

const BEAM_BY_CATEGORY: Partial<Record<FixtureCategory, number>> = { spot: 16, wash: 26, par: 30, bar: 24, dimmer: 34, strobe: 90, laser: 2, smart: 110, other: 30 };

const spread = (i: number, n: number, span: number) => (n <= 1 ? 0 : (i / (n - 1) - 0.5) * span);

/** Hang the patch in the venue: movers on the mover trusses, soft light on the rest, bars and fog on the floor. */
export function placeRig(venue: VenueSpec, fixtures: PatchedFixture[], custom: FixtureProfile[]): RigSpot[] {
  const placed: RigSpot[] = [];
  const stageY = venue.stage.height;
  const lit = fixtures.filter((f) => !f.run);
  const of = (f: PatchedFixture) => profileOf(f, custom);
  const beam = (p: FixtureProfile) => p.beamDeg ?? BEAM_BY_CATEGORY[p.category] ?? 30;

  const floorish = lit.filter((f) => ['bar', 'fog'].includes(of(f).category) && !canMove(of(f)));
  const hanging = lit.filter((f) => !floorish.includes(f));
  const movers = hanging.filter((f) => canMove(of(f)));
  const soft = hanging.filter((f) => !canMove(of(f)));

  const lines = (uses: TrussLine['use'][]) => venue.trusses.filter((t) => uses.includes(t.use));
  const hangOn = (group: PatchedFixture[], trusses: TrussLine[], focusZ: (t: TrussLine) => number) => {
    if (!trusses.length) return;
    const perLine = Math.ceil(group.length / trusses.length);
    group.forEach((f, i) => {
      const t = trusses[Math.floor(i / perLine)];
      const k = i % perLine, count = Math.min(perLine, group.length - Math.floor(i / perLine) * perLine);
      const x = spread(k, count, t.span);
      const p = of(f);
      placed.push({ fixtureId: f.id, x, y: t.y - 0.25, z: t.z, mount: 'hang', aim: [x * 0.8, stageY, focusZ(t)], beamDeg: beam(p), moves: canMove(p) });
    });
  };

  const trussMovers = lines(['movers']);
  hangOn(movers, trussMovers.length ? trussMovers : venue.trusses, () => -venue.stage.depth * 0.3);
  const front = lines(['front']), backline = lines(['wash', 'back']);
  const toFront = soft.filter((f, i) => front.length > 0 && (hasColor(of(f)) ? i % 2 === 0 : true));
  const toBack = soft.filter((f) => !toFront.includes(f));
  hangOn(toFront, front, () => -venue.stage.depth * 0.25);
  hangOn(toBack, backline.length ? backline : venue.trusses, () => -venue.stage.depth * 0.2);

  floorish.forEach((f, i) => {
    const x = spread(i, floorish.length, Math.max(venue.stage.width * 0.9, 3));
    const z = -venue.stage.depth + 0.8;
    placed.push({ fixtureId: f.id, x, y: stageY + 0.1, z, mount: 'floor', aim: [x, venue.height * 0.8, z - 0.5], beamDeg: beam(of(f)), moves: false });
  });

  // Rooms with no truss at all, like the house: units sit where somebody can see them.
  const homeless = lit.filter((f) => !placed.some((p) => p.fixtureId === f.id));
  homeless.forEach((f, i) => {
    const x = spread(i, homeless.length, venue.width * 0.5);
    placed.push({ fixtureId: f.id, x, y: 0.1, z: 3, mount: 'floor', aim: [x, 6, 0], beamDeg: beam(of(f)), moves: false });
  });
  return placed;
}

// ── Christmas house runs ────────────────────────────────────────────────────

export type BulbType = 'c9' | 'mini' | 'pixel';
export type BulbPattern = 'steady' | 'twinkle' | 'chase';

export const BULBS: Record<BulbType, { label: string; perMetre: number; watts: number; size: number }> = {
  c9: { label: 'C9 LED', perMetre: 3.3, watts: 0.5, size: 0.07 },
  mini: { label: 'Mini LED', perMetre: 10, watts: 0.07, size: 0.03 },
  pixel: { label: 'RGB pixel', perMetre: 10, watts: 0.3, size: 0.04 },
};

export interface HolidayRun {
  id: string;
  name: string;
  /** World-space polyline the string follows. */
  path: [number, number, number][];
  bulb: BulbType;
  pattern: BulbPattern;
}

const W = 7, D = 4.5, EAVE = 5.2, RIDGE = 8, FRONT = 0;

const spiral = (height: number, radius: number, cx: number, cz: number, turns: number): [number, number, number][] =>
  Array.from({ length: 121 }, (_, i) => {
    const t = i / 120, a = t * turns * Math.PI * 2, r = radius * (1 - t);
    return [cx + Math.cos(a) * r, 0.2 + t * height, cz + Math.sin(a) * r] as [number, number, number];
  });

const box = (cx: number, y: number, hw: number, hh: number): [number, number, number][] =>
  [[cx - hw, y - hh, FRONT + 0.06], [cx + hw, y - hh, FRONT + 0.06], [cx + hw, y + hh, FRONT + 0.06], [cx - hw, y + hh, FRONT + 0.06], [cx - hw, y - hh, FRONT + 0.06]];

export const HOLIDAY_RUNS: HolidayRun[] = [
  { id: 'roofline', name: 'Roofline', path: [[-W - 0.3, EAVE - 0.1, FRONT + 0.62], [0, RIDGE + 0.05, FRONT + 0.62], [W + 0.3, EAVE - 0.1, FRONT + 0.62]], bulb: 'c9', pattern: 'steady' },
  { id: 'gutter', name: 'Gutter icicles', path: [[-W, EAVE - 0.35, FRONT + 0.1], [W, EAVE - 0.35, FRONT + 0.1]], bulb: 'mini', pattern: 'twinkle' },
  { id: 'window-l', name: 'Left window', path: box(-4.2, 2.1, 1, 0.8), bulb: 'mini', pattern: 'steady' },
  { id: 'window-r', name: 'Right window', path: box(4.2, 2.1, 1, 0.8), bulb: 'mini', pattern: 'steady' },
  { id: 'door', name: 'Front door', path: [[-1, 0.1, FRONT + 0.06], [-1, 2.5, FRONT + 0.06], [1, 2.5, FRONT + 0.06], [1, 0.1, FRONT + 0.06]], bulb: 'c9', pattern: 'chase' },
  { id: 'tree', name: 'Yard tree', path: spiral(5.6, 2.25, -9.4, 6, 8), bulb: 'pixel', pattern: 'twinkle' },
  { id: 'bush-l', name: 'Left hedge', path: Array.from({ length: 19 }, (_, i) => [-6.8 + i * 0.25, 0.75 + Math.sin(i * 1.3) * 0.1, FRONT + 1.05] as [number, number, number]), bulb: 'mini', pattern: 'twinkle' },
  { id: 'bush-r', name: 'Right hedge', path: Array.from({ length: 19 }, (_, i) => [2.3 + i * 0.25, 0.75 + Math.sin(i * 1.3) * 0.1, FRONT + 1.05] as [number, number, number]), bulb: 'mini', pattern: 'twinkle' },
  { id: 'path', name: 'Walkway stakes', path: [[-1.3, 0.3, 1.4], [-1.3, 0.3, 12], [1.3, 0.3, 12], [1.3, 0.3, 1.4]], bulb: 'c9', pattern: 'steady' },
];

export const runLength = (path: [number, number, number][]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1], p[2] - path[i][2]), 0);

export interface RunEstimate { metres: number; bulbs: number; watts: number; amps120: number }

export function estimateRun(run: Pick<HolidayRun, 'path' | 'bulb'>): RunEstimate {
  const metres = runLength(run.path);
  const bulbs = Math.round(metres * BULBS[run.bulb].perMetre);
  const watts = bulbs * BULBS[run.bulb].watts;
  return { metres, bulbs, watts, amps120: watts / 120 };
}

/** Evenly spaced points along a polyline. */
export function pointsAlong(path: [number, number, number][], count: number): [number, number, number][] {
  const total = runLength(path);
  if (count <= 1 || total === 0) return [path[0]];
  const out: [number, number, number][] = [];
  let seg = 0, walked = 0;
  for (let i = 0; i < count; i++) {
    const want = (i / (count - 1)) * total;
    while (seg < path.length - 2) {
      const len = Math.hypot(path[seg + 1][0] - path[seg][0], path[seg + 1][1] - path[seg][1], path[seg + 1][2] - path[seg][2]);
      if (walked + len >= want) break;
      walked += len;
      seg++;
    }
    const a = path[seg], b = path[seg + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    const f = Math.min(1, (want - walked) / len);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  return out;
}
