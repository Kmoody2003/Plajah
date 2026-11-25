// Where the player's garage stands on the map. Two homes: a shop unit beside a downtown street, or a converted barn on a farm in the countryside.
// The search is pure (the game passes in what it knows about the ground, roads, buildings and trees), deterministic, and looks for a flat, clear plot with the bay door
// facing the nearest road, so the car rolls straight out of the door and onto the map.

export type Home = 'city' | 'farm';
export const HOMES: { id: Home; name: string; blurb: string }[] = [
  { id: 'city', name: 'City garage', blurb: 'A brick shop unit on a downtown Ironport street. The bay door opens straight onto the circuit streets.' },
  { id: 'farm', name: 'Farm garage', blurb: 'A converted barn on a farm in the countryside, with hay, a tractor and open fields. The track back to the road is gravel.' },
];

/** the building's footprint (metres): width across the door, depth front to back; and the bay door */
export const GARAGE_W = 12, GARAGE_D = 16, DOOR_W = 4.6, DOOR_H = 3.8;

export interface Site { home: Home; x: number; z: number; yaw: number; padY: number; roadX: number; roadZ: number }

export interface SiteCtx {
  ground(x: number, z: number): number;                    // terrain height
  road(x: number, z: number, pad: number): boolean;        // painted road or pavement within pad metres
  blocked(x: number, z: number, margin: number): boolean;  // inside a building
  tree?(x: number, z: number, r: number): boolean;         // a tree within r metres
  runs: { x: number; z: number }[][];                      // street centre lines
  center: { x: number; z: number };                        // downtown
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** is the rotated rectangle (centre, yaw, half sizes) clear and level enough to build on? Returns the median ground height, or null. */
export function plotOk(ctx: SiteCtx, cx: number, cz: number, yaw: number, hw: number, hd: number, maxRange: number, roadPad: number, minGround = 1.5): number | null {
  const s = Math.sin(yaw), c = Math.cos(yaw), hs: number[] = [];
  for (let i = -2; i <= 2; i++) for (let j = -3; j <= 3; j++) {
    const lx = (i / 2) * hw, lz = (j / 3) * hd;                    // local x across the door, z towards the exit
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    if (ctx.road(x, z, roadPad) || ctx.blocked(x, z, 1.5) || ctx.tree?.(x, z, 4)) return null;
    hs.push(ctx.ground(x, z));
  }
  const lo = Math.min(...hs), hi = Math.max(...hs);
  if (hi - lo > maxRange || lo < minGround) return null;
  hs.sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)];
}

export function findCitySite(ctx: SiteCtx): Site | null {
  let best: Site | null = null, bestScore = Infinity;
  for (const run of ctx.runs) {
    for (let i = 2; i < run.length - 2; i += 2) {
      const p = run[i], a = run[i - 2], b = run[i + 2];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz);
      if (tl < 1e-3) continue;
      const nx = -tz / tl, nz = tx / tl;
      const dc = Math.hypot(p.x - ctx.center.x, p.z - ctx.center.z);
      if (dc > 2200) continue;
      for (const side of [-1, 1]) for (const off of [18, 21, 25]) {
        const cx = p.x + nx * side * off, cz = p.z + nz * side * off;
        const yaw = Math.atan2(-nx * side, -nz * side);           // the door faces the street
        const pad = plotOk(ctx, cx, cz, yaw, GARAGE_W / 2 + 2, GARAGE_D / 2 + 2, 1.6, 2);
        if (pad === null) continue;
        const score = dc + off * 4;
        if (score < bestScore) { bestScore = score; best = { home: 'city', x: cx, z: cz, yaw, padY: pad, roadX: p.x, roadZ: p.z }; }
      }
    }
  }
  return best;
}

export function findFarmSite(ctx: SiteCtx): Site | null {
  let best: Site | null = null, bestScore = Infinity;
  const { minX, maxX, minZ, maxZ } = ctx.bounds;
  for (let x = minX; x <= maxX; x += 120) for (let z = minZ; z <= maxZ; z += 120) {
    const dc = Math.hypot(x - ctx.center.x, z - ctx.center.z);
    if (dc < 3000 || dc > 12000) continue;
    // the nearest road, found by looking outwards in sixteen directions
    let hit: { x: number; z: number; d: number } | null = null;
    for (let r = 30; r <= 230 && !hit; r += 20) for (let k = 0; k < 16 && !hit; k++) {
      const a = (k / 16) * Math.PI * 2, rx = x + Math.sin(a) * r, rz = z + Math.cos(a) * r;
      if (ctx.road(rx, rz, 2)) hit = { x: rx, z: rz, d: r };
    }
    if (!hit) continue;
    const yaw = Math.atan2(hit.x - x, hit.z - z);
    // the barn, its yard in front and the farm track to the road must be clear
    const pad = plotOk(ctx, x, z, yaw, GARAGE_W / 2 + 6, GARAGE_D / 2 + 8, 1.4, 4, 2);
    if (pad === null) continue;
    const score = Math.abs(hit.d - 90) + Math.abs(dc - 5000) * 0.004;
    if (score < bestScore) { bestScore = score; best = { home: 'farm', x, z, yaw, padY: pad, roadX: hit.x, roadZ: hit.z }; }
  }
  return best;
}

export function findSite(ctx: SiteCtx, home: Home): Site | null { return home === 'city' ? findCitySite(ctx) : findFarmSite(ctx); }

/** where the car appears when it leaves the garage: just outside the door, pointing away from it */
export function exitPoint(site: Site, ahead = 7): { x: number; z: number; yaw: number } {
  const d = GARAGE_D / 2 + ahead;
  return { x: site.x + Math.sin(site.yaw) * d, z: site.z + Math.cos(site.yaw) * d, yaw: site.yaw };
}

/** the building's walls as boxes in world space (centre, yaw, size), for the game's collision: back and side walls only, the front stays open for the bay door */
export function wallBoxes(site: Site): { x: number; z: number; rotY: number; w: number; d: number }[] {
  const s = Math.sin(site.yaw), c = Math.cos(site.yaw), W = GARAGE_W, D = GARAGE_D, t = 0.5;
  const at = (lx: number, lz: number): { x: number; z: number } => ({ x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c });
  return [
    { ...at(0, -D / 2 + t / 2), rotY: site.yaw, w: W, d: t },
    { ...at(-W / 2 + t / 2, 0), rotY: site.yaw, w: t, d: D },
    { ...at(W / 2 - t / 2, 0), rotY: site.yaw, w: t, d: D },
    { ...at(-(DOOR_W / 2 + (W / 2 - DOOR_W / 2) / 2), D / 2 - t / 2), rotY: site.yaw, w: W / 2 - DOOR_W / 2, d: t },     // front wall, left of the door
    { ...at(DOOR_W / 2 + (W / 2 - DOOR_W / 2) / 2, D / 2 - t / 2), rotY: site.yaw, w: W / 2 - DOOR_W / 2, d: t },        // and right of it
  ];
}
