/**
 * ruralDetail.ts — GPU-instanced Michigan countryside & redrawn farmland architecture:
 *   - 30+ road-aligned farmsteads (weathered red-timber barns, white clapboard farmhouses,
 *     paired corrugated galvanized grain silos with domes, machine sheds, dry-stone walls,
 *     stacked golden round hay bales, and breakable split-rail timber pasture fences)
 *   - Roadside pasture fencing & windbreaks following Ironport's real rural roads
 *   - Horizon Rural Festival Outpost stage near Pinewood/Dunes crossroads
 *
 * Batched into ~11 GPU InstancedMeshes for 60 FPS and exports solid/breakable colliders.
 */

import * as THREE from 'three';
import { buildRuralArchGlassMaterial, buildRuralArchPbrMaterial, registerRuralOmniFacadeMesh } from './library/kit';

function loadPbr(stem: string, repX = 2, repY = 2, metalness = 0.04, roughness = 0.85, tileMeters = 3.6): THREE.MeshStandardMaterial {
  return buildRuralArchPbrMaterial(stem, { repX, repY, metalness, roughness, tileMeters });
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface RuralSolidBox { x: number; z: number; hw: number; hd: number; rot: number; kind: 'building' | 'pillar' }
export interface RuralBreakable { x: number; y: number; z: number; kind: 'fence' | 'crate'; radius: number }

export interface RuralDetailOptions {
  ground: (x: number, z: number) => number;
  clearCheck: (x: number, z: number) => boolean;
  /** Optional rural/country road polylines so farmsteads & pasture fences tuck naturally alongside real farm roads. */
  ruralRoads?: number[][][];
}

export interface RuralDetailResult {
  group: THREE.Group;
  solids: RuralSolidBox[];
  breakables: RuralBreakable[];
  counts: Record<string, number>;
}

export function buildRuralOpenWorldDetail(opts: RuralDetailOptions): RuralDetailResult {
  const group = new THREE.Group();
  group.name = 'RuralOpenWorldDetail';
  const solids: RuralSolidBox[] = [];
  const breakables: RuralBreakable[] = [];
  const counts: Record<string, number> = { farmsteads: 0, hayBales: 0, roadsideFences: 0 };
  const rnd = makeRng(44197);

  const redTimberMat = loadPbr('tex-shared-19-red-timber', 2, 2, 0.02, 0.88, 3.4);
  const whiteClapMat = loadPbr('tex-shared-20-white-clapboard', 3, 2, 0.02, 0.82, 3.2);
  const steelMat = loadPbr('tex-shared-21-corrugated-steel', 2, 2, 0.82, 0.44, 3.0);
  const shingleMat = loadPbr('tex-shared-22-asphalt-shingle', 3, 2, 0.02, 0.90, 2.8);
  const stoneWallMat = loadPbr('tex-shared-24-stone-rubble', 4, 1, 0.02, 0.92, 3.0);
  const timberFenceMat = loadPbr('tex-shared-18-timber-siding', 2, 1, 0.02, 0.88, 2.6);
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xc9a34c, roughness: 0.96, metalness: 0.0 });
  const trimWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.62, metalness: 0.02 });
  const shutterMat = new THREE.MeshStandardMaterial({ color: 0x243b2f, roughness: 0.72, metalness: 0.02 });
  const brickChimneyMat = loadPbr('tex-shared-01-red-brick', 2, 2, 0.03, 0.88, 2.4);
  const winMat = buildRuralArchGlassMaterial('blue');

  // Collect candidate farmstead sites: 6 curated anchor farms + auto-discovered road-adjacent rural farmland plots
  const candidates: [number, number, number][] = [
    [-2100, -1450, 0.35],
    [-3450, 1180, -0.60],
    [-1250, -2650, 1.10],
    [1680, -2950, -0.25],
    [-4650, -780, 0.85],
    [2950, -1920, -0.95],
    [-2800, -2950, 0.2],
    [-850, -3450, -0.4],
    [650, -3250, 0.7],
    [-3900, -2350, 0.55],
    [-4800, 520, -0.35],
    [-2350, 2150, 0.9],
    [-1450, 1750, -0.8],
    [420, -2250, 0.15],
    [-3150, -450, 1.3],
    [-1850, -420, -0.5],
    [1420, -4450, 0.4],
    [-1620, -4650, -0.25],
    [-3600, -3850, 0.65],
    [2450, -3650, -0.75],
    [3550, -3100, 0.3],
    [-4250, 2180, 0.1],
    [-5150, 1650, -0.45],
    [-2650, 3200, 0.75],
  ];

  // Also mine clear farmland pads ~42 m off real rural roads so driving countryside roads reveals active Michigan farms
  const roadsideFenceM: THREE.Matrix4[] = [];
  if (opts.ruralRoads && opts.ruralRoads.length) {
    const stepSample = 28;
    for (let ri = 0; ri < opts.ruralRoads.length; ri++) {
      const road = opts.ruralRoads[ri];
      if (!road || road.length < 4) continue;
      for (let i = 2; i < road.length - 2; i += stepSample) {
        const a = road[i - 1], b = road[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
        const side = (ri + i) % 2 === 0 ? 1 : -1;
        const fx = road[i][0] + nx * side * 46;
        const fz = road[i][1] + nz * side * 46;
        // Keep farms in rural countryside (outside urban core & high alpine peaks)
        if (fx > 2800 && fz > -1600 && fz < 2600) continue;
        if (opts.ground(fx, fz) > 165 || opts.ground(fx, fz) < 4) continue;
        candidates.push([fx, fz, Math.atan2(ux, uz)]);
      }
      // Split-rail timber pasture fence segments running neatly along select rural roadsides (breakable!)
      for (let i = 4; i < road.length - 4; i += 9) {
        if ((ri * 7 + i) % 3 !== 0) continue;
        const a = road[i], b = road[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        if (L < 3 || L > 40) continue;
        const nx = -dz / L, nz = dx / L;
        const side = (ri + i) % 2 === 0 ? 1 : -1;
        const px = (a[0] + b[0]) * 0.5 + nx * side * 12.5;
        const pz = (a[1] + b[1]) * 0.5 + nz * side * 12.5;
        if (px > 2600 && pz > -1600 && pz < 2600) continue;
        if (!opts.clearCheck(px, pz)) continue;
        const py = opts.ground(px, pz);
        if (py < 4 || py > 140) continue;
        const ang = Math.atan2(dx, dz);
        roadsideFenceM.push(new THREE.Matrix4().compose(
          new THREE.Vector3(px, py + 0.58, pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang),
          new THREE.Vector3(0.24, 1.12, Math.min(18, L + 0.5)),
        ));
        breakables.push({ x: px, y: py, z: pz, kind: 'fence', radius: 1.0 });
        counts.roadsideFences++;
        if (counts.roadsideFences >= 280) break;
      }
    }
  }

  // Instance matrix buckets
  const barnBodyM: THREE.Matrix4[] = [];
  const barnGableM: THREE.Matrix4[] = [];
  const houseBodyM: THREE.Matrix4[] = [];
  const houseGableM: THREE.Matrix4[] = [];
  const roofM: THREE.Matrix4[] = [];
  const siloCylM: THREE.Matrix4[] = [];
  const siloDomeM: THREE.Matrix4[] = [];
  const stoneM: THREE.Matrix4[] = [];
  const fenceM: THREE.Matrix4[] = [...roadsideFenceM];
  const hayM: THREE.Matrix4[] = [];
  const winM: THREE.Matrix4[] = [];
  const trimWhiteM: THREE.Matrix4[] = [];
  const shutterM: THREE.Matrix4[] = [];
  const chimneyM: THREE.Matrix4[] = [];
  const omniBarnM: THREE.Matrix4[] = [];
  const omniHouseM: THREE.Matrix4[] = [];

  const lotM = new THREE.Matrix4();
  const pM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3();

  const pushLocal = (list: THREE.Matrix4[], lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): void => {
    eul.set(rx, ry, rz);
    q.setFromEuler(eul);
    pM.compose(vP.set(lx, ly, lz), q, vS.set(sx, sy, sz));
    list.push(lotM.clone().multiply(pM));
  };

  const placedFarms: { x: number; z: number }[] = [];
  for (const [fx, fz, rot] of candidates) {
    if (counts.farmsteads >= 36) break;
    if (!opts.clearCheck(fx, fz)) continue;
    const fy = opts.ground(fx, fz);
    if (fy < 4.5 || fy > 175) continue;
    // Skip steep mountain slopes so barns sit level on farmland
    const sMax = Math.max(
      Math.abs(opts.ground(fx + 14, fz) - fy),
      Math.abs(opts.ground(fx - 14, fz) - fy),
      Math.abs(opts.ground(fx, fz + 14) - fy),
      Math.abs(opts.ground(fx, fz - 14) - fy),
    );
    if (sMax > 3.6) continue;
    if (placedFarms.some((p) => Math.hypot(p.x - fx, p.z - fz) < 280)) continue;
    placedFarms.push({ x: fx, z: fz });
    counts.farmsteads++;

    lotM.makeTranslation(fx, fy, fz).multiply(new THREE.Matrix4().makeRotationY(rot));

    // 1. Classic Michigan Red-Timber Barn + Sealed Gable Ends + White X-Braced Sliding Doors + Hayloft + Roof Cupola
    pushLocal(stoneM, 0, -0.7, 0, 0, 0, 0, 14.8, 2.2, 20.8);
    pushLocal(barnBodyM, 0, 3.75, 0, 0, 0, 0, 14, 7.5, 20);
    pushLocal(omniBarnM, 0, 3.75, 10.025, 0, 0, 0, 14, 7.5, 1);
    pushLocal(omniBarnM, 0, 3.75, -10.025, 0, Math.PI, 0, 14, 7.5, 1);
    pushLocal(barnGableM, 0, 9.35, 0, 0, 0, 0, 14, 3.7, 20);
    pushLocal(roofM, -3.85, 9.2, 0, 0, 0, 0.48, 9.0, 0.35, 21.4);
    pushLocal(roofM, 3.85, 9.2, 0, 0, 0, -0.48, 9.0, 0.35, 21.4);
    // White-trimmed X-braced double sliding barn doors (front & back) + upper hayloft door + corner trim boards
    for (const dz of [-10.06, 10.06]) {
      pushLocal(trimWhiteM, 0, 4.45, dz, 0, 0, 0, 4.9, 0.22, 0.14);
      pushLocal(trimWhiteM, -2.35, 2.25, dz, 0, 0, 0, 0.22, 4.5, 0.14);
      pushLocal(trimWhiteM, 2.35, 2.25, dz, 0, 0, 0, 0.22, 4.5, 0.14);
      pushLocal(trimWhiteM, 0, 2.25, dz, 0, 0, 0, 0.18, 4.5, 0.14);
      for (const sx of [-1.18, 1.18]) {
        pushLocal(trimWhiteM, sx, 2.25, dz + (dz > 0 ? 0.04 : -0.04), 0, 0, 0.56, 0.15, 4.3, 0.08);
        pushLocal(trimWhiteM, sx, 2.25, dz + (dz > 0 ? 0.04 : -0.04), 0, 0, -0.56, 0.15, 4.3, 0.08);
      }
      // Hayloft door + white trim frame
      pushLocal(trimWhiteM, 0, 7.45, dz, 0, 0, 0, 2.35, 2.35, 0.14);
      pushLocal(barnBodyM, 0, 7.45, dz + (dz > 0 ? 0.04 : -0.04), 0, 0, 0, 1.95, 1.95, 0.10);
    }
    // White corner vertical trim boards & side barn windows
    for (const cx of [-7.04, 7.04]) {
      for (const cz of [-10.04, 10.04]) pushLocal(trimWhiteM, cx, 3.75, cz, 0, 0, 0, 0.24, 7.5, 0.24);
      for (const wz of [-5.5, 0, 5.5]) {
        pushLocal(winM, cx + (cx > 0 ? 0.04 : -0.04), 4.6, wz, 0, Math.PI * 0.5, 0, 1.35, 1.35, 0.08);
        pushLocal(trimWhiteM, cx + (cx > 0 ? 0.07 : -0.07), 5.3, wz, 0, Math.PI * 0.5, 0, 1.55, 0.14, 0.10);
        pushLocal(trimWhiteM, cx + (cx > 0 ? 0.07 : -0.07), 3.9, wz, 0, Math.PI * 0.5, 0, 1.55, 0.14, 0.10);
      }
    }
    // Classic ventilated barn rooftop cupola
    pushLocal(trimWhiteM, 0, 11.75, 0, 0, 0, 0, 2.1, 1.9, 2.1);
    pushLocal(roofM, 0, 13.0, 0, 0, 0, 0, 2.6, 0.65, 2.6);
    solids.push({ x: fx, z: fz, hw: 7.5, hd: 10.5, rot, kind: 'building' });

    // 2. Twin Corrugated Galvanized Steel Grain Silos + Conical Domes + External Unload Chute
    const siloCount = rnd() > 0.35 ? 2 : 1;
    for (let si = 0; si < siloCount; si++) {
      const sz = si === 0 ? -5.5 : 3.5;
      const sh = 14 + rnd() * 4;
      pushLocal(siloCylM, 11.5, sh * 0.5, sz, 0, 0, 0, 3.2, sh, 3.2);
      pushLocal(siloDomeM, 11.5, sh + 1.2, sz, 0, 0, 0, 3.35, 2.4, 3.35);
      pushLocal(trimWhiteM, 8.2, sh * 0.5, sz, 0, 0, 0, 0.65, sh - 1.2, 0.65); // vertical unload chute
      const sxW = fx + Math.cos(rot) * 11.5 + Math.sin(rot) * sz;
      const szW = fz - Math.sin(rot) * 11.5 + Math.cos(rot) * sz;
      solids.push({ x: sxW, z: szW, hw: 3.4, hd: 3.4, rot: 0, kind: 'pillar' });
    }

    // 3. White Clapboard Michigan Farmhouse (Sealed gables, covered front porch, shuttered multi-pane windows & brick chimney!)
    if (rnd() > 0.25) {
      pushLocal(stoneM, -19, -0.6, -5, 0, 0, 0, 11.4, 2.0, 9.4);
      pushLocal(houseBodyM, -19, 2.8, -5, 0, 0, 0, 10.8, 5.6, 8.8);
      pushLocal(omniHouseM, -19, 2.8, -0.575, 0, 0, 0, 10.8, 5.6, 1);
      pushLocal(houseGableM, -19, 6.72, -5, 0, Math.PI * 0.5, 0, 8.8, 2.28, 10.8);
      pushLocal(roofM, -19, 6.9, -7.2, -0.48, 0, 0, 11.8, 0.32, 6.0);
      pushLocal(roofM, -19, 6.9, -2.8, 0.48, 0, 0, 11.8, 0.32, 6.0);
      pushLocal(chimneyM, -16.2, 8.3, -6.2, 0, 0, 0, 0.95, 2.5, 0.95);
      // Covered front porch deck, posts & roof
      pushLocal(stoneM, -19, 0.22, 0.5, 0, 0, 0, 7.6, 0.45, 2.3);
      pushLocal(roofM, -19, 3.15, 0.65, 0.22, 0, 0, 8.0, 0.18, 2.7);
      for (const px of [-22.3, -19, -15.7]) pushLocal(trimWhiteM, px, 1.68, 1.5, 0, 0, 0, 0.18, 2.6, 0.18);
      // Paired shuttered multi-pane front & side windows
      for (const wx of [-22.1, -15.9]) {
        pushLocal(winM, wx, 3.55, -0.56, 0, 0, 0, 1.35, 1.65, 0.10);
        pushLocal(trimWhiteM, wx, 4.42, -0.52, 0, 0, 0, 1.55, 0.14, 0.14);
        pushLocal(trimWhiteM, wx, 2.68, -0.52, 0, 0, 0, 1.65, 0.14, 0.18);
        pushLocal(shutterM, wx - 0.92, 3.55, -0.54, 0, 0, 0, 0.42, 1.68, 0.08);
        pushLocal(shutterM, wx + 0.92, 3.55, -0.54, 0, 0, 0, 0.42, 1.68, 0.08);
      }
      const hxW = fx + Math.cos(rot) * -19 + Math.sin(rot) * -5;
      const hzW = fz - Math.sin(rot) * -19 + Math.cos(rot) * -5;
      solids.push({ x: hxW, z: hzW, hw: 5.8, hd: 4.8, rot, kind: 'building' });
    }

    // 4. Dry-stone wall & split-rail timber perimeter fences
    pushLocal(stoneM, 4, 0.58, 16, 0, 0, 0, 36, 1.15, 0.65);
    pushLocal(fenceM, -14, 0.55, 8, 0, 0, 0, 0.28, 1.1, 22);
    pushLocal(fenceM, 20, 0.55, 0, 0, 0, 0, 0.28, 1.1, 30);

    // 5. Stacked golden round hay bales in adjacent pasture (breakable crash-through!)
    const baleCount = 4 + Math.floor(rnd() * 5);
    for (let b = 0; b < baleCount; b++) {
      const bx = -8 + (b % 4) * 3.4 + (rnd() - 0.5) * 0.9;
      const bz = 21 + Math.floor(b / 4) * 3.6 + (rnd() - 0.5) * 0.9;
      pushLocal(hayM, bx, 0.95, bz, Math.PI * 0.5, rnd() * 0.4, 0, 1.0, 1.65, 1.0);
      const bxW = fx + Math.cos(rot) * bx + Math.sin(rot) * bz;
      const bzW = fz - Math.sin(rot) * bx + Math.cos(rot) * bz;
      breakables.push({ x: bxW, y: fy, z: bzW, kind: 'crate', radius: 1.05 });
      counts.hayBales++;
    }
  }

  const emit = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], mat: THREE.Material, cast = true, recv = true): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = cast;
    im.receiveShadow = recv;
    group.add(im);
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const gShape = new THREE.Shape();
  gShape.moveTo(-0.5, -0.5);
  gShape.lineTo(0.5, -0.5);
  gShape.lineTo(0, 0.5);
  gShape.closePath();
  const unitGable = new THREE.ExtrudeGeometry(gShape, { depth: 1, bevelEnabled: false });
  unitGable.translate(0, 0, -0.5);

  emit(unitBox, barnBodyM, redTimberMat, true, true);
  emit(unitGable, barnGableM, redTimberMat, true, true);
  emit(unitBox, houseBodyM, whiteClapMat, true, true);
  emit(unitGable, houseGableM, whiteClapMat, true, true);
  emit(unitBox, roofM, shingleMat, true, true);
  emit(new THREE.CylinderGeometry(1, 1, 1, 16), siloCylM, steelMat, true, true);
  emit(new THREE.ConeGeometry(1, 1, 16), siloDomeM, steelMat, true, false);
  emit(unitBox, stoneM, stoneWallMat, true, true);
  emit(unitBox, fenceM, timberFenceMat, false, true);
  emit(new THREE.CylinderGeometry(0.95, 0.95, 1, 12), hayM, hayMat, true, true);
  emit(unitBox, winM, winMat, false, false);
  emit(unitBox, trimWhiteM, trimWhiteMat, false, true);
  emit(unitBox, shutterM, shutterMat, false, true);
  emit(unitBox, chimneyM, brickChimneyMat, true, true);

  // UV-locked Colab Omni/FLUX 2K rural facade overlays (hidden until `v4-manifest.json` lists `ruralTextures`)
  const unitFacadePlane = new THREE.PlaneGeometry(1, 1);
  for (const [arch, list] of [['rural_barn_red', omniBarnM], ['rural_farmhouse_clapboard', omniHouseM]] as const) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(unitFacadePlane, trimWhiteMat, list.length);
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    registerRuralOmniFacadeMesh(arch, im);
    group.add(im);
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

  return { group, solids, breakables, counts };
}
