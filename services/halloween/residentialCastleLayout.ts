import { RAVENCREST_RESIDENTIAL_PLAN, type ResidentialRoom } from '../../data/ravencrestResidentialLayout';

export interface CastleBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface ResidentialWorldRoom extends ResidentialRoom {
  floorIndex: number; elevationY: number; floorLabel: string; bounds: CastleBounds;
  center: [number, number, number];
  doors: Array<{ side: 'north' | 'south' | 'east' | 'west'; at: number; width: number }>;
}
export interface CastleWall {
  x: number; y: number; z: number; width: number; height: number; depth: number;
  floorIndex: number; roomId?: string;
}
export interface CastleCollider extends CastleBounds { minY: number; maxY: number }

export function slideCastleCollisions(colliders: CastleCollider[], x: number, z: number, y: number, radius = 0.54): [number, number] {
  let rx = x, rz = z;
  for (const box of colliders) {
    if (y + 1.65 < box.minY || y + 0.35 > box.maxY) continue;
    const dx = rx - Math.max(box.minX, Math.min(rx, box.maxX));
    const dz = rz - Math.max(box.minZ, Math.min(rz, box.maxZ));
    const squared = dx * dx + dz * dz;
    if (squared >= radius * radius) continue;
    if (squared > 0.00001) {
      const length = Math.sqrt(squared), overlap = radius - length;
      rx += dx / length * overlap; rz += dz / length * overlap;
    } else {
      const distances = [rx - box.minX, box.maxX - rx, rz - box.minZ, box.maxZ - rz];
      const edge = distances.indexOf(Math.min(...distances));
      if (edge === 0) rx = box.minX - radius;
      else if (edge === 1) rx = box.maxX + radius;
      else if (edge === 2) rz = box.minZ - radius;
      else rz = box.maxZ + radius;
    }
  }
  return [rx, rz];
}
export interface CastleStair {
  id: string; fromFloor: number; toFloor: number; x: number; width: number;
  minZ: number; maxZ: number; lowerY: number; upperY: number; ascendingNorth: boolean;
}

export const RESIDENTIAL_METRICS = {
  width: 48, depth: 44, northZ: -80, entranceZ: -36, storeyHeight: 6,
  wallHeight: 5.65, wallThickness: 0.4, doorwayWidth: 2.6, doorwayHeight: 3.2,
} as const;
export const RESIDENTIAL_FLOORS = RAVENCREST_RESIDENTIAL_PLAN.floors.map((floor, index) => ({
  id: floor.id, index, name: floor.name, elevationY: (index - 1) * RESIDENTIAL_METRICS.storeyHeight,
}));
export const normalizedToCastle = (x: number, z: number): [number, number] => [
  (x - 0.5) * RESIDENTIAL_METRICS.width,
  RESIDENTIAL_METRICS.northZ + z * RESIDENTIAL_METRICS.depth,
];
export const RESIDENTIAL_WORLD_ROOMS: ResidentialWorldRoom[] = RAVENCREST_RESIDENTIAL_PLAN.floors.flatMap((floor, floorIndex) =>
  floor.rooms.map(room => {
    const [minX, minZ] = normalizedToCastle(room.rect[0], room.rect[1]);
    const [maxX, maxZ] = normalizedToCastle(room.rect[2], room.rect[3]);
    const x = (minX + maxX) / 2;
    const z = (minZ + maxZ) / 2;
    const elevationY = RESIDENTIAL_FLOORS[floorIndex].elevationY;
    // Inferred apertures face the shared central circulation. They are recorded
    // explicitly here; the concept sheet does not specify every door swing.
    const open = room.kind === 'hall' || room.kind === 'balcony' || room.kind === 'observatory' || room.id === 'recreation_gallery';
    const side = x < -9 ? 'east' : x > 9 ? 'west' : 'south';
    return { ...room, floorIndex, elevationY, floorLabel: floor.name,
      bounds: { minX, maxX, minZ, maxZ }, center: [x, elevationY, z] as [number, number, number],
      doors: open ? [] : [{ side, at: side === 'east' || side === 'west' ? z : x, width: RESIDENTIAL_METRICS.doorwayWidth }],
    };
  }),
);

/** Alternating flights keep both flanking stair lanes and a clear central route.
 * Exact flights/height are an explicit construction interpretation of the sheet.
 */
export const RESIDENTIAL_STAIRS: CastleStair[] = RESIDENTIAL_FLOORS.slice(0, -1).map((floor, index) => ({
  id: `${floor.id}_to_${RESIDENTIAL_FLOORS[index + 1].id}`,
  fromFloor: index, toFloor: index + 1, x: index % 2 === 0 ? -6.3 : 6.3,
  width: 3.1, minZ: -55, maxZ: -43, lowerY: floor.elevationY,
  upperY: floor.elevationY + RESIDENTIAL_METRICS.storeyHeight, ascendingNorth: index % 2 === 0,
}));
export const stairHeightAt = (stair: CastleStair, z: number) => {
  const southward = Math.max(0, Math.min(1, (z - stair.minZ) / (stair.maxZ - stair.minZ)));
  return stair.lowerY + (stair.ascendingNorth ? 1 - southward : southward) * (stair.upperY - stair.lowerY);
};
export const inStairFootprint = (stair: CastleStair, x: number, z: number, inset = 0) =>
  Math.abs(x - stair.x) < stair.width / 2 - inset && z > stair.minZ + inset && z < stair.maxZ - inset;

export function floorHasOpening(floorIndex: number, x: number, z: number) {
  return RESIDENTIAL_STAIRS.some(stair => (stair.fromFloor === floorIndex || stair.toFloor === floorIndex) && inStairFootprint(stair, x, z, 0.05));
}

/** Walkable support uses the SAME flight dimensions as visible treads and slabs.
 * A mismatched height at a stair opening is unsupported, never an invisible floor.
 */
export function residentialSupportAt(x: number, z: number, previousY: number): { y: number; stair: boolean } | null {
  if (z >= RESIDENTIAL_METRICS.entranceZ + 0.2 && Math.abs(previousY) < 1.2) return { y: 0, stair: false };
  for (const stair of RESIDENTIAL_STAIRS) {
    if (!inStairFootprint(stair, x, z)) continue;
    const y = stairHeightAt(stair, z);
    if (Math.abs(y - previousY) < 1.0) return { y, stair: true };
  }
  const floor = RESIDENTIAL_FLOORS.reduce((closest, candidate) => Math.abs(candidate.elevationY - previousY) < Math.abs(closest.elevationY - previousY) ? candidate : closest);
  if (Math.abs(floor.elevationY - previousY) > 1.0 || floorHasOpening(floor.index, x, z)) return null;
  const body = x >= -24 && x <= 24 && z >= (floor.index === 0 || Math.abs(x) <= 8.4 ? -80 : -73) && z <= -36;
  const southProjection = (floor.index === 2 || floor.index === 3) && Math.abs(x) <= 8.5 && z > -36 && z <= -32;
  const dome = floor.index === 4 && Math.hypot(x, z + 41.5) < 8.5;
  return body || southProjection || dome ? { y: floor.elevationY, stair: false } : null;
}

export function roomAtResidentialPosition(x: number, y: number, z: number) {
  return RESIDENTIAL_WORLD_ROOMS.find(room => Math.abs(y - room.elevationY) < 1.2 && x >= room.bounds.minX && x <= room.bounds.maxX && z >= room.bounds.minZ && z <= room.bounds.maxZ) ?? null;
}

export function buildResidentialWalls(): CastleWall[] {
  const walls: CastleWall[] = [];
  const { wallHeight: h, wallThickness: t, doorwayHeight: dh } = RESIDENTIAL_METRICS;
  const addSide = (floorIndex: number, roomId: string | undefined, side: 'north' | 'south' | 'east' | 'west', fixed: number, start: number, end: number, doors: Array<{ at: number; width: number }>, baseY: number, height = h) => {
    const alongX = side === 'north' || side === 'south';
    const emit = (lo: number, hi: number, y: number, wallH: number) => {
      if (hi - lo < 0.01) return;
      walls.push({ x: alongX ? (lo + hi) / 2 : fixed, y: y + wallH / 2, z: alongX ? fixed : (lo + hi) / 2,
        width: alongX ? hi - lo : t, depth: alongX ? t : hi - lo, height: wallH, floorIndex, roomId });
    };
    let cursor = start;
    for (const door of [...doors].sort((a, b) => a.at - b.at)) {
      const lo = Math.max(start, door.at - door.width / 2);
      const hi = Math.min(end, door.at + door.width / 2);
      emit(cursor, lo, baseY, height);
      emit(lo, hi, baseY + dh, height - dh);
      cursor = hi;
    }
    emit(cursor, end, baseY, height);
  };
  for (const room of RESIDENTIAL_WORLD_ROOMS) {
    if (room.kind === 'hall' || room.kind === 'balcony' || room.kind === 'observatory' || room.id === 'recreation_gallery') continue;
    const { minX, maxX, minZ, maxZ } = room.bounds;
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      const alongX = side === 'north' || side === 'south';
      addSide(room.floorIndex, room.id, side, side === 'north' ? minZ : side === 'south' ? maxZ : side === 'west' ? minX : maxX,
        alongX ? minX : minZ, alongX ? maxX : maxZ, room.doors.filter(door => door.side === side), room.elevationY);
    }
  }
  // Exterior envelope with gate aperture; upper central doors open to balconies.
  for (const floor of RESIDENTIAL_FLOORS) {
    if (floor.index === 0) {
      addSide(floor.index, undefined, 'north', -80, -24, 24, [], floor.elevationY);
    } else {
      addSide(floor.index, undefined, 'north', -80, -8.4, 8.4, [], floor.elevationY);
      addSide(floor.index, undefined, 'north', -73, -24, -8.4, [], floor.elevationY);
      addSide(floor.index, undefined, 'north', -73, 8.4, 24, [], floor.elevationY);
      addSide(floor.index, undefined, 'west', -8.4, -80, -73, [], floor.elevationY);
      addSide(floor.index, undefined, 'east', 8.4, -80, -73, [], floor.elevationY);
    }
    addSide(floor.index, undefined, 'west', -24, floor.index === 0 ? -80 : -73, -36, [], floor.elevationY);
    addSide(floor.index, undefined, 'east', 24, floor.index === 0 ? -80 : -73, -36, [], floor.elevationY);
    addSide(floor.index, undefined, 'south', -36, -24, 24, floor.index === 0 ? [] : [{ at: 0, width: floor.index === 1 ? 5 : 7 }], floor.elevationY);
  }
  return walls;
}

export const RESIDENTIAL_WALLS = buildResidentialWalls();
