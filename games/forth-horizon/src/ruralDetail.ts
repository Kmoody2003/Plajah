/**
 * ruralDetail.ts — High-detail Horizon-style rural open-world architecture & props:
 * weathered red-timber barns, corrugated-steel grain silos, split-rail timber fences,
 * dry-laid stone walls, and the rural Horizon Festival Outpost stage using photoreal PBR maps.
 */

import * as THREE from 'three';
import { sharedPbrTex } from './library/kit';

function loadPbr(stem: string, repX = 2, repY = 2, metalness = 0.04, roughness = 0.85): THREE.MeshStandardMaterial {
  const map = sharedPbrTex(stem, 'base').clone();
  const normalMap = sharedPbrTex(stem, 'nrm').clone();
  const roughnessMap = sharedPbrTex(stem, 'rgh').clone();
  for (const t of [map, normalMap, roughnessMap]) {
    t.repeat.set(repX, repY);
  }
  return new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.35, 1.35), roughnessMap, metalness, roughness });
}

export interface RuralDetailOptions {
  ground: (x: number, z: number) => number;
  clearCheck: (x: number, z: number) => boolean;
}

export function buildRuralOpenWorldDetail(opts: RuralDetailOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'RuralOpenWorldDetail';

  const redTimberMat = loadPbr('tex-shared-19-red-timber', 2, 2, 0.02, 0.88);
  const steelMat = loadPbr('tex-shared-21-corrugated-steel', 2, 2, 0.82, 0.44);
  const shingleMat = loadPbr('tex-shared-22-asphalt-shingle', 3, 2, 0.02, 0.90);
  const stoneWallMat = loadPbr('tex-shared-24-stone-rubble', 4, 1, 0.02, 0.92);
  const timberFenceMat = loadPbr('tex-shared-18-timber-siding', 2, 1, 0.02, 0.88);

  // Rural farmsteads (barns + galvanized grain silos + stone/timber perimeter fences)
  const farmSites: [number, number, number][] = [
    [-2100, -1450, 0.35],
    [-3450, 1180, -0.60],
    [-1250, -2650, 1.10],
    [1680, -2950, -0.25],
    [-4650, -780, 0.85],
    [2950, -1920, -0.95],
  ];

  for (const [fx, fz, rot] of farmSites) {
    if (!opts.clearCheck(fx, fz)) continue;
    const fy = opts.ground(fx, fz);
    const farm = new THREE.Group();
    farm.position.set(fx, fy, fz);
    farm.rotation.y = rot;

    // Red-timber barn body + asphalt-shingle pitched roof
    const barn = new THREE.Mesh(new THREE.BoxGeometry(14, 7.5, 20), redTimberMat);
    barn.position.set(0, 3.75, 0);
    barn.castShadow = true;
    barn.receiveShadow = true;
    farm.add(barn);

    const roofL = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 20.8), shingleMat);
    roofL.position.set(-3.8, 9.2, 0);
    roofL.rotation.z = 0.48;
    roofL.castShadow = true;
    farm.add(roofL);

    const roofR = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 20.8), shingleMat);
    roofR.position.set(3.8, 9.2, 0);
    roofR.rotation.z = -0.48;
    roofR.castShadow = true;
    farm.add(roofR);

    // Pair of corrugated galvanized steel grain silos
    for (const sz of [-5.5, 3.5]) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 16, 18), steelMat);
      silo.position.set(11.5, 8, sz);
      silo.castShadow = true;
      silo.receiveShadow = true;
      farm.add(silo);

      const dome = new THREE.Mesh(new THREE.ConeGeometry(3.35, 2.4, 18), steelMat);
      dome.position.set(11.5, 17.2, sz);
      farm.add(dome);
    }

    // Dry-stone wall & split-rail timber fence enclosing the yard
    const stoneWall = new THREE.Mesh(new THREE.BoxGeometry(36, 1.15, 0.65), stoneWallMat);
    stoneWall.position.set(4, 0.58, 16);
    stoneWall.castShadow = true;
    stoneWall.receiveShadow = true;
    farm.add(stoneWall);

    const railFence = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 32), timberFenceMat);
    railFence.position.set(-14, 0.55, 0);
    farm.add(railFence);

    group.add(farm);
  }

  // Horizon Rural Festival Outpost (Chora Stage + Illuminated Gantry near Pinewood/Dunes crossroads)
  const festX = -2850;
  const festZ = 950;
  if (opts.clearCheck(festX, festZ)) {
    const fy = opts.ground(festX, festZ);
    const outpost = new THREE.Group();
    outpost.position.set(festX, fy, festZ);

    const stageDeck = new THREE.Mesh(new THREE.BoxGeometry(28, 1.4, 16), steelMat);
    stageDeck.position.set(0, 0.7, 0);
    stageDeck.receiveShadow = true;
    outpost.add(stageDeck);

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.85, roughness: 0.35 });
    for (const sx of [-13, 13]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 12, 1.1), trussMat);
      tower.position.set(sx, 6, -6);
      tower.castShadow = true;
      outpost.add(tower);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(27.5, 2.6, 1.4), new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    }));
    header.position.set(0, 11.2, -6);
    outpost.add(header);

    group.add(outpost);
  }

  return group;
}
