import * as THREE from 'three';
import {
  RESIDENTIAL_FLOORS, RESIDENTIAL_METRICS, RESIDENTIAL_STAIRS, RESIDENTIAL_WALLS,
  RESIDENTIAL_WORLD_ROOMS, stairHeightAt,
} from '../../../services/halloween/residentialCastleLayout';

export interface ResidentialCastleMaterials {
  stone: THREE.Material; floor: THREE.Material; wood: THREE.Material; trim: THREE.Material; carpet: THREE.Material;
}
export function buildResidentialCastle(
  materials: ResidentialCastleMaterials,
  registerCollider: (x: number, y: number, z: number, width: number, height: number, depth: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'Ravencrest_Residential_Five_Level_Blockout';
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = materials.stone, collision = false) => {
    const object = mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
    if (collision) registerCollider(x, y, z, w, h, d);
    return object;
  };
  const floorGroups: THREE.Group[] = [];
  const floorLights: THREE.PointLight[] = [];
  const stairGroups: THREE.Group[] = [];
  const cameraOccluders: THREE.Object3D[] = [];
  const exterior = new THREE.Group();
  exterior.name = 'Exterior_Blockout';
  group.add(exterior);
  for (const floor of RESIDENTIAL_FLOORS) {
    const floorGroup = new THREE.Group();
    floorGroup.name = `Floor_${floor.id}`;
    floorGroups.push(floorGroup);
    group.add(floorGroup);
    const shape = new THREE.Shape();
    const outline = floor.index === 0
      ? [[-24, -80], [24, -80], [24, -36], [-24, -36]]
      : [[-24, -73], [-8.4, -73], [-8.4, -80], [8.4, -80], [8.4, -73], [24, -73], [24, -36], [-24, -36]];
    outline.forEach(([x, z], index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z));
    shape.closePath();
    for (const stair of RESIDENTIAL_STAIRS.filter(stair => stair.fromFloor === floor.index || stair.toFloor === floor.index)) {
      // The lower tread begins at floor height; opening the whole shaft prevents
      // the old invisible floor from covering the stairs above the player's head.
      const hole = new THREE.Path();
      const west = stair.x - stair.width / 2 + 0.05;
      const east = stair.x + stair.width / 2 - 0.05;
      hole.moveTo(west, -stair.minZ - 0.05);
      hole.lineTo(east, -stair.minZ - 0.05);
      hole.lineTo(east, -stair.maxZ + 0.05);
      hole.lineTo(west, -stair.maxZ + 0.05);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const slab = mesh(geometry, floor.index === 0 ? materials.stone : materials.floor, 0, floor.elevationY - 0.35, 0, floorGroup);
    slab.name = `WalkableSlab_${floor.id}`;
    cameraOccluders.push(slab);
    for (const wall of RESIDENTIAL_WALLS.filter(wall => wall.floorIndex === floor.index)) {
      const object = box(wall.width, wall.height, wall.depth, wall.x, wall.y, wall.z, materials.stone, true);
      floorGroup.attach(object);
      cameraOccluders.push(object);
      object.name = wall.roomId ? `Wall_${wall.roomId}` : `Envelope_${floor.id}`;
    }
    // A clear center runner leaves both stair lanes and room doors readable.
    if (floor.index > 0) floorGroup.attach(box(3.4, 0.035, 18, 0, floor.elevationY + 0.018, -47, materials.carpet));
    if (floor.index === 2 || floor.index === 3) {
      floorGroup.attach(box(17, 0.35, 4, 0, floor.elevationY - 0.175, -34, materials.floor));
      floorGroup.attach(box(17, 1.05, 0.3, 0, floor.elevationY + 0.525, -32, materials.trim, true));
      for (const x of [-8.5, 8.5]) floorGroup.attach(box(0.3, 1.05, 4, x, floor.elevationY + 0.525, -34, materials.trim, true));
    }
    const light = new THREE.PointLight('#ffbf7b', 18, 22, 2);
    light.position.set(0, floor.elevationY + 4, -61);
    floorGroup.add(light);
    floorLights.push(light);
  }

  for (const stair of RESIDENTIAL_STAIRS) {
    const stairGroup = new THREE.Group();
    stairGroup.name = `Stair_${stair.id}`;
    stairGroup.userData = { fromFloor: stair.fromFloor, toFloor: stair.toFloor };
    group.add(stairGroup);
    stairGroups.push(stairGroup);
    const count = 30;
    const treadDepth = (stair.maxZ - stair.minZ) / count;
    for (let index = 0; index < count; index++) {
      const z = stair.minZ + (index + 0.5) * treadDepth;
      const top = stairHeightAt(stair, z);
      const tread = box(stair.width, 0.24, treadDepth + 0.015, stair.x, top - 0.12, z, materials.stone);
      tread.name = `Tread_${stair.id}_${index}`;
      stairGroup.attach(tread);
    }
    for (const side of [-1, 1]) {
      const x = stair.x + side * (stair.width / 2 + 0.1);
      const rail = mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.hypot(12, 6), 8), materials.trim,
        x, (stair.lowerY + stair.upperY) / 2 + 1, (stair.minZ + stair.maxZ) / 2, stairGroup);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, stair.upperY - stair.lowerY, stair.ascendingNorth ? -12 : 12).normalize());
      for (let index = 0; index <= 6; index++) {
        const z = stair.minZ + index * 2;
        stairGroup.attach(box(0.12, 1, 0.12, x, stairHeightAt(stair, z) + 0.5, z, materials.trim));
      }
      // Shaft guards span floors so a player cannot cross through a stair's side.
      registerCollider(x, (stair.lowerY + stair.upperY) / 2 + 0.6, (stair.minZ + stair.maxZ) / 2, 0.22, 7.2, 11.8);
    }
  }

  const roofMat = new THREE.MeshStandardMaterial({ color: '#26343e', roughness: 0.88 });
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-8.8, 0); roofShape.lineTo(0, 7); roofShape.lineTo(8.8, 0); roofShape.closePath();
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 26, bevelEnabled: false });
  exterior.add(mesh(roof, roofMat, 0, 23.8, -81));
  // Simple tower masses establish the four corners; carved masonry and roof
  // detailing are the next exterior-art pass, not claimed finished assets.
  for (const x of [-22, 22]) for (const z of [-72, -37.8]) {
    const tower = mesh(new THREE.CylinderGeometry(3.1, 3.5, 25.5, 16), materials.stone, x, 12.3, z);
    tower.name = 'CornerTower_Blockout';
    exterior.add(tower);
    exterior.add(mesh(new THREE.ConeGeometry(4, 11, 16), roofMat, x, 30.5, z));
    cameraOccluders.push(tower);
    registerCollider(x, 12.3, z, 5.6, 25.5, 5.6);
  }
  // Only add the projecting circular segment: a full disk here would cover the
  // top staircase shaft with an invisible support/visible ceiling mismatch.
  const segment = new THREE.Shape();
  const angle = Math.asin(5.5 / 8.5);
  segment.absarc(0, 41.5, 8.5, Math.PI + angle, Math.PI * 2 - angle, false);
  segment.closePath();
  const segmentGeometry = new THREE.ExtrudeGeometry(segment, { depth: 0.35, bevelEnabled: false });
  segmentGeometry.rotateX(-Math.PI / 2);
  const observatoryFloor = mesh(segmentGeometry, materials.floor, 0, 17.65, 0, floorGroups[4]);
  observatoryFloor.name = 'Observatory_Projection';
  cameraOccluders.push(observatoryFloor);
  // The dome remains open in this circulation phase so the reference floor
  // arrangement and telescope placement can be inspected before roof detailing.
  for (let index = 0; index < 24; index++) {
    const angle = Math.PI + (index / 23) * Math.PI;
    const x = Math.cos(angle) * 8.5;
    const z = -41.5 - Math.sin(angle) * 8.5;
    floorGroups[4].attach(box(0.3, 1.05, 0.3, x, 18.525, z, materials.trim, true));
  }

  return { group, floorGroups, floorLights, stairGroups, exterior, cameraOccluders, rooms: RESIDENTIAL_WORLD_ROOMS };
}
