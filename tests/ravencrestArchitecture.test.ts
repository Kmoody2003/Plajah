import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  RESIDENTIAL_FLOORS, RESIDENTIAL_WORLD_ROOMS, RESIDENTIAL_STAIRS,
  residentialSupportAt, stairHeightAt,
} from '../services/halloween/residentialCastleLayout';
import { buildResidentialCastle } from '../components/taleo/ravencrest/buildResidentialCastle';

interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }
const colliders: Collider[] = [];
const material = new THREE.MeshStandardMaterial();
const castle = buildResidentialCastle({ stone: material, floor: material, wood: material, trim: material, carpet: material }, (x,y,z,w,h,d) => {
  colliders.push({ minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2 });
});
castle.group.updateMatrixWorld(true);
function clear(x: number, y: number, z: number, radius = 0.54) {
  return colliders.every(box => {
    if (y + 1.65 < box.minY || y + 0.35 > box.maxY) return true;
    return Math.hypot(x - Math.max(box.minX, Math.min(x, box.maxX)), z - Math.max(box.minZ, Math.min(z, box.maxZ))) >= radius;
  });
}

test('selected plan supplies five real floor groups, 37 destinations and twelve bedrooms', () => {
  assert.equal(castle.floorGroups.length, 5);
  assert.equal(RESIDENTIAL_WORLD_ROOMS.length, 37);
  assert.equal(RESIDENTIAL_WORLD_ROOMS.filter(room => room.kind === 'bedroom').length, 12);
  for (const room of RESIDENTIAL_WORLD_ROOMS) {
    assert.equal(residentialSupportAt(room.center[0], room.center[2], room.elevationY)?.y, room.elevationY, room.id);
    assert(clear(room.center[0], room.elevationY, room.center[2]), `Blocked destination: ${room.id}`);
  }
});

test('each stair can be walked continuously up and down without teleporting', () => {
  for (const stair of RESIDENTIAL_STAIRS) {
    for (const ascending of [true, false]) {
      let y = ascending ? stair.lowerY : stair.upperY;
      const startZ = ascending === stair.ascendingNorth ? stair.maxZ + 0.65 : stair.minZ - 0.65;
      const endZ = ascending === stair.ascendingNorth ? stair.minZ - 0.65 : stair.maxZ + 0.65;
      for (let i = 0; i <= 160; i++) {
        const z = startZ + (endZ - startZ) * i / 160;
        assert(clear(stair.x, y, z), `${stair.id}: blocked at ${z}`);
        const support = residentialSupportAt(stair.x, z, y);
        assert(support, `${stair.id}: unsupported at ${z}, ${y}`);
        assert(Math.abs(support.y - y) < 0.25, `${stair.id}: vertical jump`);
        y = support.y;
      }
      assert.equal(y, ascending ? stair.upperY : stair.lowerY);
    }
  }
});

test('every room connects to central circulation with player-width clearance', () => {
  const spacing = 0.25;
  const columns = 193, rows = 193;
  for (const floor of RESIDENTIAL_FLOORS) {
    const start = [96, 92]; // world (0, -57), central landing
    const visited = new Set<number>();
    const queue = [start];
    while (queue.length) {
      const [column, row] = queue.pop()!;
      const key = row * columns + column;
      if (column < 0 || column >= columns || row < 0 || row >= rows || visited.has(key)) continue;
      const x = -24 + column * spacing, z = -80 + row * spacing;
      const support = residentialSupportAt(x, z, floor.elevationY);
      if (!support || support.stair || !clear(x, floor.elevationY, z)) continue;
      visited.add(key);
      queue.push([column + 1,row],[column - 1,row],[column,row + 1],[column,row - 1]);
    }
    for (const room of RESIDENTIAL_WORLD_ROOMS.filter(room => room.floorIndex === floor.index)) {
      const column = Math.round((room.center[0] + 24) / spacing);
      const row = Math.round((room.center[2] + 80) / spacing);
      assert(visited.has(row * columns + column), `Unreachable ${floor.name}: ${room.id}`);
    }
    for (const stair of RESIDENTIAL_STAIRS) {
      if (stair.fromFloor !== floor.index && stair.toFloor !== floor.index) continue;
      const lower = stair.fromFloor === floor.index;
      const z = lower === stair.ascendingNorth ? stair.maxZ + 0.65 : stair.minZ - 0.65;
      const column = Math.round((stair.x + 24) / spacing);
      const row = Math.round((z + 80) / spacing);
      assert(visited.has(row * columns + column), `Disconnected stair landing: ${stair.id} on ${floor.name}`);
    }
  }
});

test('visible stair shafts have no floor slab covering the flight above', () => {
  const ray = new THREE.Raycaster();
  for (const stair of RESIDENTIAL_STAIRS) {
    for (const progress of [0.2, 0.5, 0.8]) {
      const z = stair.minZ + progress * (stair.maxZ - stair.minZ);
      const y = stairHeightAt(stair, z);
      ray.set(new THREE.Vector3(stair.x, y + 1.7, z), new THREE.Vector3(0,1,0));
      ray.far = 1.8;
      assert.equal(ray.intersectObjects(castle.cameraOccluders, false).length, 0, `Ceiling blocks ${stair.id}`);
    }
  }
});
