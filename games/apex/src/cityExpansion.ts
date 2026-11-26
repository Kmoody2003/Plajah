/**
 * cityExpansion.ts — Expands Ironport's Suburbs, Industrial Zone, Coastline, and
 * Cross-River City District using 2048px photoreal PBR textures from /games/apex/tex/.
 */

import * as THREE from 'three';
import { buildRuralArchPbrMaterial } from './library/kit';

const TEX_BASE = '/games/apex/tex/';
const loader = new THREE.TextureLoader();

function loadPbr(
  stem: string,
  repX = 2,
  repY = 2,
  metalness = 0.04,
  roughness = 0.85
): THREE.MeshStandardMaterial {
  // Use 2K Neural PBR world-triplanar TSL on WebGPU (zero async clone crash + zero stretched UVs!) & safe cloned PBR on WebGL2
  if (stem.startsWith('tex-shared-')) {
    return buildRuralArchPbrMaterial(stem, {
      tileMeters: Math.max(2.6, 8.0 / Math.max(repX, 1)),
      repX,
      repY,
      metalness,
      roughness,
    });
  }
  const baseFile = stem.startsWith('ground_') ? `${stem}.png` : `${stem}_base.png`;
  const map = loader.load(`${TEX_BASE}${baseFile}`);
  const normalMap = loader.load(`${TEX_BASE}${stem}_normal.png`);
  const roughnessMap = loader.load(`${TEX_BASE}${stem}_roughness.png`);
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    t.anisotropy = 4;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, metalness, roughness });
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface CityExpansionOptions {
  ground: (x: number, z: number) => number;
  clearCheck: (x: number, z: number) => boolean;
}

export function buildCityExpansion(opts: CityExpansionOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = 'IronportCityExpansion';

  // ── Shared 2048px Photoreal PBR Materials ──
  // Suburbs
  const whiteClapboardMat = loadPbr('tex-shared-20-white-clapboard', 3, 2, 0.02, 0.82);
  const timberSidingMat = loadPbr('tex-shared-18-timber-siding', 3, 2, 0.02, 0.86);
  const asphaltShingleMat = loadPbr('tex-shared-22-asphalt-shingle', 3, 2, 0.02, 0.90);
  const slateRoofMat = loadPbr('tex-shared-23-slate-roof', 3, 2, 0.05, 0.78);

  // Industrial Zone
  const corrugatedSteelMat = loadPbr('tex-shared-21-corrugated-steel', 3, 2, 0.78, 0.46);
  const steelPanelMat = loadPbr('tex-shared-14-steel-panel', 2, 2, 0.82, 0.38);
  const orangeBrickMat = loadPbr('tex-shared-03-orange-brick', 3, 2, 0.02, 0.88);
  const concreteBoardMat = loadPbr('tex-shared-15-concrete-boardformed', 2, 2, 0.03, 0.88);

  // Cross-River City
  const glassBlueMat = loadPbr('tex-shared-07-glass-curtain-blue', 3, 5, 0.72, 0.18);
  const glassCeruleanMat = loadPbr('tex-shared-08-glass-curtain-cerulean', 3, 5, 0.72, 0.18);
  const glassBronzeMat = loadPbr('tex-shared-09-glass-curtain-bronze', 3, 5, 0.75, 0.20);
  const limestoneMat = loadPbr('tex-shared-04-limestone', 2, 2, 0.03, 0.82);

  const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x222830, metalness: 0.7, roughness: 0.4 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff3b1f,
    emissive: 0xff2a00,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });

  // ── 1. SUBURBS — Batched into InstancedMeshes (~5 draw calls for 160 homes instead of ~960!) ──
  const suburbsGroup = new THREE.Group();
  suburbsGroup.name = 'SuburbsExpansion';
  const randSub = makeRng(4011);

  const houseCandidates: [number, number, number][] = [];
  for (let gx = 3300; gx <= 5250; gx += 95) {
    for (let gz = -2000; gz <= -420; gz += 95) {
      const jx = gx + (randSub() - 0.5) * 34;
      const jz = gz + (randSub() - 0.5) * 34;
      houseCandidates.push([jx, jz, (randSub() - 0.5) * 0.45 + Math.floor(randSub() * 4) * (Math.PI * 0.5)]);
    }
  }
  for (let gx = 2150; gx <= 3180; gx += 115) {
    for (let gz = -860; gz <= -180; gz += 110) {
      const jx = gx + (randSub() - 0.5) * 38;
      const jz = gz + (randSub() - 0.5) * 38;
      houseCandidates.push([jx, jz, (randSub() - 0.5) * 0.35]);
    }
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matsWhiteWall: THREE.Matrix4[] = [];
  const matsTimberWall: THREE.Matrix4[] = [];
  const matsShingleRoof: THREE.Matrix4[] = [];
  const matsSlateRoof: THREE.Matrix4[] = [];
  const matsDoorTrim: THREE.Matrix4[] = [];

  const lotM = new THREE.Matrix4();
  const partM = new THREE.Matrix4();
  const qRot = new THREE.Quaternion();
  const eRot = new THREE.Euler();
  const vPos = new THREE.Vector3();
  const vScale = new THREE.Vector3();

  const pushPart = (
    list: THREE.Matrix4[],
    lx: number, ly: number, lz: number,
    rx: number, ry: number, rz: number,
    sx: number, sy: number, sz: number
  ) => {
    eRot.set(rx, ry, rz);
    qRot.setFromEuler(eRot);
    partM.compose(vPos.set(lx, ly, lz), qRot, vScale.set(sx, sy, sz));
    list.push(lotM.clone().multiply(partM));
  };

  let houseCount = 0;
  for (const [hx, hz, rot] of houseCandidates) {
    if (houseCount >= 160) break;
    if (!opts.clearCheck(hx, hz)) continue;
    houseCount++;

    const hy = opts.ground(hx, hz);
    lotM.makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeRotationY(rot));

    const w = 10 + randSub() * 5;
    const d = 8.5 + randSub() * 4;
    const h = 4.2 + randSub() * 2.4;
    const wallList = randSub() > 0.38 ? matsWhiteWall : matsTimberWall;
    const roofList = randSub() > 0.42 ? matsShingleRoof : matsSlateRoof;

    // Main house & garage volumes
    pushPart(wallList, 0, h * 0.5, 0, 0, 0, 0, w, h, d);
    const slopeLen = (d * 0.5 + 0.7) / Math.cos(0.46);
    const roofY = h + Math.sin(0.46) * (slopeLen * 0.5) - 0.15;
    pushPart(roofList, 0, roofY, -d * 0.25 - 0.15, -0.46, 0, 0, w + 0.8, 0.3, slopeLen);
    pushPart(roofList, 0, roofY, d * 0.25 + 0.15, 0.46, 0, 0, w + 0.8, 0.3, slopeLen);

    const gw = 5.6, gd = 6.2, gh = 3.2;
    const gxOff = w * 0.5 + gw * 0.5 - 0.2;
    pushPart(wallList, gxOff, gh * 0.5, 0.6, 0, 0, 0, gw, gh, gd);
    pushPart(roofList, gxOff, gh + 0.45, 0.6, 0.18, 0, 0, gw + 0.6, 0.28, gd + 0.6);
    pushPart(matsDoorTrim, gxOff, gh * 0.38, 0.6 + gd * 0.5 + 0.04, 0, 0, 0, gw * 0.74, gh * 0.72, 0.14);
  }

  const emitBatch = (
    targetGroup: THREE.Group,
    geom: THREE.BufferGeometry,
    matrices: THREE.Matrix4[],
    mat: THREE.Material,
    castShadow: boolean,
    receiveShadow = true
  ) => {
    if (!matrices.length) return;
    const im = new THREE.InstancedMesh(geom, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    targetGroup.add(im);
  };
  emitBatch(suburbsGroup, unitBox, matsWhiteWall, whiteClapboardMat, true);
  emitBatch(suburbsGroup, unitBox, matsTimberWall, timberSidingMat, true);
  emitBatch(suburbsGroup, unitBox, matsShingleRoof, asphaltShingleMat, true);
  emitBatch(suburbsGroup, unitBox, matsSlateRoof, slateRoofMat, true);
  emitBatch(suburbsGroup, unitBox, matsDoorTrim, darkTrimMat, false);
  root.add(suburbsGroup);

  // ── 2. INDUSTRIAL ZONE (Batched into InstancedMeshes: ~10 draw calls instead of ~220!) ──
  const industrialGroup = new THREE.Group();
  industrialGroup.name = 'IndustrialZoneExpansion';
  const randInd = makeRng(7022);

  const indSites: [number, number, number][] = [
    [5920, 560, 0.05],
    [6050, 960, -0.08],
    [6450, 1080, 0.0],
    [6880, 1050, 0.12],
    [7320, 1020, -0.04],
    [7620, 740, 0.15],
    [7580, 1180, -0.1],
    [6320, 560, 0.02],
    [6850, 540, -0.05],
    [7280, 520, 0.08],
  ];

  const indConcretePads: THREE.Matrix4[] = [];
  const indBrickWalls: THREE.Matrix4[] = [];
  const indCorrWalls: THREE.Matrix4[] = [];
  const indSteelBoxes: THREE.Matrix4[] = [];
  const indDarkTrim: THREE.Matrix4[] = [];
  const indTankSteel: THREE.Matrix4[] = [];
  const indTankCorr: THREE.Matrix4[] = [];
  const indTankCaps: THREE.Matrix4[] = [];
  const indStackBrick: THREE.Matrix4[] = [];
  const indStackConcrete: THREE.Matrix4[] = [];
  const indBeacons: THREE.Matrix4[] = [];

  for (let i = 0; i < indSites.length; i++) {
    const [ix, iz, rot] = indSites[i];
    if (!opts.clearCheck(ix, iz)) continue;

    const iy = opts.ground(ix, iz);
    lotM.makeTranslation(ix, iy, iz).multiply(partM.makeRotationY(rot));

    // Concrete yard pad
    pushPart(indConcretePads, 0, 0.2, 0, 0, 0, 0, 58, 0.4, 44);

    // Sawtooth-roof warehouse (brick lower wall + corrugated upper cladding + 4 sawtooth bays)
    const whW = 36;
    const whD = 22;
    pushPart(indBrickWalls, -8, 2.3, -6, 0, 0, 0, whW, 4.2, whD);
    pushPart(indCorrWalls, -8, 7.1, -6, 0, 0, 0, whW, 5.4, whD);

    const bayCount = 4;
    const bayW = whW / bayCount;
    for (let b = 0; b < bayCount; b++) {
      const bx = -8 - whW * 0.5 + (b + 0.5) * bayW;
      pushPart(indSteelBoxes, bx, 11.2, -6, 0, 0, -0.34, bayW + 0.4, 0.35, whD + 0.6);
    }

    // Cylindrical storage tanks on concrete containment pad
    for (let t = 0; t < 2; t++) {
      const tx = 17 + t * 9.2;
      const tz = -8 + (t % 2) * 3;
      const tankH = 12 + randInd() * 4;
      pushPart(t % 2 === 0 ? indTankSteel : indTankCorr, tx, 0.4 + tankH * 0.5, tz, 0, 0, 0, 1, tankH, 1);
      pushPart(indTankCaps, tx, 0.4 + tankH + 0.9, tz, 0, 0, 0, 1, 1, 1);
    }

    // Smokestack on every second site
    if (i % 2 === 0) {
      const stackH = 34 + randInd() * 10;
      pushPart(i % 4 === 0 ? indStackBrick : indStackConcrete, 20, 0.4 + stackH * 0.5, 10, 0, 0, 0, 1, stackH, 1);
      pushPart(indBeacons, 20, 0.4 + stackH + 0.3, 10, 0, 0, 0, 1, 1, 1);
    }

    // Steel gantry frame spanning loading bay (offset -4, 0.4, 12 in site space)
    for (const gx of [-12, 12]) {
      for (const gz of [-4, 4]) {
        pushPart(indSteelBoxes, -4 + gx, 6.15, 12 + gz, 0, 0, 0, 0.75, 11.5, 0.75);
      }
      pushPart(indDarkTrim, -4 + gx, 11.9, 12, 0, 0, 0, 0.9, 0.9, 9.2);
    }
    pushPart(indSteelBoxes, -4, 12.6, 12, 0, 0, 0, 25.2, 1.1, 1.2);
  }

  emitBatch(industrialGroup, unitBox, indConcretePads, concreteBoardMat, false, true);
  emitBatch(industrialGroup, unitBox, indBrickWalls, orangeBrickMat, true, true);
  emitBatch(industrialGroup, unitBox, indCorrWalls, corrugatedSteelMat, true, true);
  emitBatch(industrialGroup, unitBox, indSteelBoxes, steelPanelMat, true, false);
  emitBatch(industrialGroup, unitBox, indDarkTrim, darkTrimMat, false, false);
  if (indTankSteel.length || indTankCorr.length) {
    const unitTankCyl = new THREE.CylinderGeometry(3.8, 3.8, 1, 18);
    emitBatch(industrialGroup, unitTankCyl, indTankSteel, steelPanelMat, true, true);
    emitBatch(industrialGroup, unitTankCyl, indTankCorr, corrugatedSteelMat, true, true);
    emitBatch(industrialGroup, new THREE.ConeGeometry(3.95, 1.8, 18), indTankCaps, steelPanelMat, false, false);
  }
  if (indStackBrick.length || indStackConcrete.length) {
    const unitStackCyl = new THREE.CylinderGeometry(1.3, 2.2, 1, 14);
    emitBatch(industrialGroup, unitStackCyl, indStackBrick, orangeBrickMat, true, false);
    emitBatch(industrialGroup, unitStackCyl, indStackConcrete, concreteBoardMat, true, false);
    emitBatch(industrialGroup, new THREE.SphereGeometry(0.45, 8, 8), indBeacons, beaconMat, false, false);
  }
  root.add(industrialGroup);

  // ── 3. CROSS-RIVER CITY SKYLINE DISTRICT (Coastline & Riverfront Seawalls/Piers now built to exact contours in coastalWorld.ts & riverfrontWorld.ts) ──
  const coastCityGroup = new THREE.Group();
  coastCityGroup.name = 'CrossRiverCity';

  const riverLimestone: THREE.Matrix4[] = [];
  const riverGlassBatches: [THREE.Matrix4[], THREE.Matrix4[], THREE.Matrix4[]] = [[], [], []];

  // Cross-River City Mid-Rise & High-Rise Towers (North bank z: -1800..-240, South bank z: 280..1180)
  const randCity = makeRng(9055);
  const glassMats = [glassBlueMat, glassCeruleanMat, glassBronzeMat];

  const towerBlocks: [number, number, number, number, number][] = [
    // North Bank Cross-River Skyline
    [6240, -240, 26, 24, 68],
    [6420, -250, 30, 26, 86],
    [6820, -245, 28, 28, 94],
    [7040, -255, 24, 22, 62],
    [7620, -250, 32, 26, 78],
    [7760, -520, 26, 24, 72],
    [6320, -940, 24, 24, 58],
    [6940, -1120, 28, 24, 66],
    [7340, -1380, 26, 26, 74],
    // South Bank Cross-River District
    [6280, 320, 26, 22, 54],
    [6480, 310, 28, 24, 64],
    [6840, 310, 30, 24, 72],
    [7080, 325, 24, 22, 52],
    [7280, 330, 28, 24, 60],
    [7620, 340, 26, 26, 68],
    [6620, 960, 24, 22, 46],
    [7020, 940, 26, 22, 50],
  ];

  for (let i = 0; i < towerBlocks.length; i++) {
    const [tx, tz, tw, td, th] = towerBlocks[i];
    if (!opts.clearCheck(tx, tz)) continue;

    const ty = opts.ground(tx, tz);
    lotM.makeTranslation(tx, ty, tz);

    const glassBucket = riverGlassBatches[i % glassMats.length];
    const podiumH = 9 + randCity() * 4;
    const shaftH = th - podiumH;
    const crownH = 8 + randCity() * 6;

    pushPart(riverLimestone, 0, podiumH * 0.5, 0, 0, 0, 0, tw + 4, podiumH, td + 4);
    pushPart(glassBucket, 0, podiumH + shaftH * 0.5, 0, 0, 0, 0, tw, shaftH, td);
    pushPart(glassBucket, 0, th + crownH * 0.5, 0, 0, 0, 0, tw * 0.72, crownH, td * 0.72);
    pushPart(riverLimestone, 0, th + crownH + 1.6, 0, 0, 0, 0, tw * 0.36, 3.2, td * 0.36);
  }

  emitBatch(coastCityGroup, unitBox, riverLimestone, limestoneMat, true, true);
  for (let g = 0; g < glassMats.length; g++) {
    emitBatch(coastCityGroup, unitBox, riverGlassBatches[g], glassMats[g], true, true);
  }

  root.add(coastCityGroup);
  return root;
}
