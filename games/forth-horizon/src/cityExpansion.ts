/**
 * cityExpansion.ts — Expands Ironport's Suburbs, Industrial Zone, Coastline, and
 * Cross-River City District using 2048px photoreal PBR textures from /games/forth-horizon/tex/.
 */

import * as THREE from 'three';

const TEX_BASE = '/games/forth-horizon/tex/';
const loader = new THREE.TextureLoader();

function loadPbr(
  stem: string,
  repX = 2,
  repY = 2,
  metalness = 0.04,
  roughness = 0.85
): THREE.MeshStandardMaterial {
  const baseFile = stem.startsWith('ground_') ? `${stem}.png` : `${stem}_base.png`;
  const map = loader.load(`${TEX_BASE}${baseFile}`);
  const normalMap = loader.load(`${TEX_BASE}${stem}_normal.png`);
  const roughnessMap = loader.load(`${TEX_BASE}${stem}_roughness.png`);
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    t.anisotropy = 8;
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

  // Coastline & Cross-River City
  const paverBrickMat = loadPbr('ground_paver_brick', 6, 3, 0.02, 0.86);
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

  // ── 1. SUBURBS (Suburban Loop x: 3250..5350, z: -2050..-350 & Outer Suburbs x: 2100..3200, z: -900..-150) ──
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

  let houseCount = 0;
  for (const [hx, hz, rot] of houseCandidates) {
    if (houseCount >= 160) break;
    if (!opts.clearCheck(hx, hz)) continue;
    houseCount++;

    const hy = opts.ground(hx, hz);
    const lot = new THREE.Group();
    lot.position.set(hx, hy, hz);
    lot.rotation.y = rot;

    const w = 10 + randSub() * 5;
    const d = 8.5 + randSub() * 4;
    const h = 4.2 + randSub() * 2.4;
    const wallMat = randSub() > 0.38 ? whiteClapboardMat : timberSidingMat;
    const roofMat = randSub() > 0.42 ? asphaltShingleMat : slateRoofMat;

    // Main house volume
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.set(0, h * 0.5, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    lot.add(body);

    // Pitched gable roof (two angled planes)
    const slopeLen = (d * 0.5 + 0.7) / Math.cos(0.46);
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.3, slopeLen), roofMat);
    roofL.position.set(0, h + Math.sin(0.46) * (slopeLen * 0.5) - 0.15, -d * 0.25 - 0.15);
    roofL.rotation.x = -0.46;
    roofL.castShadow = true;
    lot.add(roofL);

    const roofR = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.3, slopeLen), roofMat);
    roofR.position.set(0, h + Math.sin(0.46) * (slopeLen * 0.5) - 0.15, d * 0.25 + 0.15);
    roofR.rotation.x = 0.46;
    roofR.castShadow = true;
    lot.add(roofR);

    // Attached garage wing
    const gw = 5.6;
    const gd = 6.2;
    const gh = 3.2;
    const garage = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), wallMat);
    garage.position.set(w * 0.5 + gw * 0.5 - 0.2, gh * 0.5, 0.6);
    garage.castShadow = true;
    garage.receiveShadow = true;
    lot.add(garage);

    const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.6, 0.28, gd + 0.6), roofMat);
    garageRoof.position.set(w * 0.5 + gw * 0.5 - 0.2, gh + 0.45, 0.6);
    garageRoof.rotation.x = 0.18;
    garageRoof.castShadow = true;
    lot.add(garageRoof);

    // Garage door panel
    const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.74, gh * 0.72, 0.14), darkTrimMat);
    gDoor.position.set(w * 0.5 + gw * 0.5 - 0.2, gh * 0.38, 0.6 + gd * 0.5 + 0.04);
    lot.add(gDoor);

    suburbsGroup.add(lot);
  }
  root.add(suburbsGroup);

  // ── 2. INDUSTRIAL ZONE (Ironport South / Foundry & Steelworks x: 5750..7850, z: 400..1450) ──
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

  for (let i = 0; i < indSites.length; i++) {
    const [ix, iz, rot] = indSites[i];
    if (!opts.clearCheck(ix, iz)) continue;

    const iy = opts.ground(ix, iz);
    const site = new THREE.Group();
    site.position.set(ix, iy, iz);
    site.rotation.y = rot;

    // Concrete yard pad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(58, 0.4, 44), concreteBoardMat);
    pad.position.set(0, 0.2, 0);
    pad.receiveShadow = true;
    site.add(pad);

    // Sawtooth-roof warehouse (brick lower wall + corrugated upper cladding + 4 sawtooth bays)
    const whW = 36;
    const whD = 22;
    const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(whW, 4.2, whD), orangeBrickMat);
    lowerWall.position.set(-8, 2.3, -6);
    lowerWall.castShadow = true;
    lowerWall.receiveShadow = true;
    site.add(lowerWall);

    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(whW, 5.4, whD), corrugatedSteelMat);
    upperWall.position.set(-8, 7.1, -6);
    upperWall.castShadow = true;
    upperWall.receiveShadow = true;
    site.add(upperWall);

    const bayCount = 4;
    const bayW = whW / bayCount;
    for (let b = 0; b < bayCount; b++) {
      const bx = -8 - whW * 0.5 + (b + 0.5) * bayW;
      const saw = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.4, 0.35, whD + 0.6), steelPanelMat);
      saw.position.set(bx, 11.2, -6);
      saw.rotation.z = -0.34;
      saw.castShadow = true;
      site.add(saw);
    }

    // Cylindrical storage tanks on concrete containment pad
    for (let t = 0; t < 2; t++) {
      const tx = 17 + t * 9.2;
      const tz = -8 + (t % 2) * 3;
      const tankH = 12 + randInd() * 4;
      const tankR = 3.8;
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(tankR, tankR, tankH, 20),
        t % 2 === 0 ? steelPanelMat : corrugatedSteelMat
      );
      tank.position.set(tx, 0.4 + tankH * 0.5, tz);
      tank.castShadow = true;
      tank.receiveShadow = true;
      site.add(tank);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(tankR + 0.15, 1.8, 20), steelPanelMat);
      cap.position.set(tx, 0.4 + tankH + 0.9, tz);
      site.add(cap);
    }

    // Smokestack on every second site
    if (i % 2 === 0) {
      const stackH = 34 + randInd() * 10;
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 2.2, stackH, 16),
        i % 4 === 0 ? orangeBrickMat : concreteBoardMat
      );
      stack.position.set(20, 0.4 + stackH * 0.5, 10);
      stack.castShadow = true;
      site.add(stack);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), beaconMat);
      beacon.position.set(20, 0.4 + stackH + 0.3, 10);
      site.add(beacon);
    }

    // Steel gantry frame spanning loading bay
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(-4, 0.4, 12);
    for (const gx of [-12, 12]) {
      for (const gz of [-4, 4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.75, 11.5, 0.75), steelPanelMat);
        leg.position.set(gx, 5.75, gz);
        leg.castShadow = true;
        gantryGroup.add(leg);
      }
      const endBeam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 9.2), darkTrimMat);
      endBeam.position.set(gx, 11.5, 0);
      gantryGroup.add(endBeam);
    }
    const bridgeGirder = new THREE.Mesh(new THREE.BoxGeometry(25.2, 1.1, 1.2), steelPanelMat);
    bridgeGirder.position.set(0, 12.2, 0);
    bridgeGirder.castShadow = true;
    gantryGroup.add(bridgeGirder);
    site.add(gantryGroup);

    industrialGroup.add(site);
  }
  root.add(industrialGroup);

  // ── 3. COASTLINE & CROSS-RIVER CITY DISTRICT ──
  const coastCityGroup = new THREE.Group();
  coastCityGroup.name = 'CoastlineAndCrossRiverCity';

  // 3A. Lake Michigan Coastline Seawalls, Boardwalks & Piers (x: -7650..-6950, z: -3300..1500)
  const pierLocations: [number, number, number, number][] = [
    [-7020, 980, 48, 12],   // Harborfest Waterfront main pier
    [-7060, 1160, 38, 10],  // Harborfest South pier
    [-7560, -1180, 42, 10], // Lakeshore Bluffs Mid pier
    [-7320, -3250, 36, 9],  // Lighthouse Point pier
  ];

  for (const [px, pz, len, wid] of pierLocations) {
    const py = Math.max(opts.ground(px, pz), 1.4);
    const pier = new THREE.Group();
    pier.position.set(px, py, pz);

    // Concrete seawall bulkhead
    const seawall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, wid + 22), concreteBoardMat);
    seawall.position.set(len * 0.5 - 2, -1.0, 0);
    seawall.castShadow = true;
    seawall.receiveShadow = true;
    pier.add(seawall);

    // Brick-paver waterfront promenade apron behind seawall
    const apron = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, wid + 24), paverBrickMat);
    apron.position.set(len * 0.5 + 6, 0.25, 0);
    apron.receiveShadow = true;
    pier.add(apron);

    // Timber boardwalk deck extending west over the water
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, wid), timberSidingMat);
    deck.position.set(0, 0.65, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    pier.add(deck);

    // Timber pilings supporting the pier
    for (let x = -len * 0.45; x <= len * 0.45; x += 8) {
      for (const zOff of [-wid * 0.42, wid * 0.42]) {
        const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 5.2, 10), timberSidingMat);
        piling.position.set(x, -1.6, zOff);
        pier.add(piling);
      }
    }

    coastCityGroup.add(pier);
  }

  // 3B. Ironport Riverfront Seawalls & Brick-Paver Riverwalk (North & South banks at x: 6150..7750)
  for (let rx = 6200; rx <= 7680; rx += 160) {
    // River center around x=6400..7600 is z ≈ 120..180
    for (const side of [-1, 1]) {
      const rz = 155 + side * 68;
      if (!opts.clearCheck(rx, rz)) continue;
      const ry = Math.max(opts.ground(rx, rz), 1.2);
      const walk = new THREE.Group();
      walk.position.set(rx, ry, rz);

      const wall = new THREE.Mesh(new THREE.BoxGeometry(148, 3.2, 2.8), concreteBoardMat);
      wall.position.set(0, -1.0, -side * 4.5);
      wall.receiveShadow = true;
      walk.add(wall);

      const promenade = new THREE.Mesh(new THREE.BoxGeometry(148, 0.35, 9), paverBrickMat);
      promenade.position.set(0, 0.2, 0);
      promenade.receiveShadow = true;
      walk.add(promenade);

      coastCityGroup.add(walk);
    }
  }

  // 3C. Cross-River City Mid-Rise & High-Rise Towers (North bank z: -1800..-240, South bank z: 280..1180)
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
    const tower = new THREE.Group();
    tower.position.set(tx, ty, tz);

    const glassMat = glassMats[i % glassMats.length];

    // Limestone podium base
    const podiumH = 9 + randCity() * 4;
    const podium = new THREE.Mesh(new THREE.BoxGeometry(tw + 4, podiumH, td + 4), limestoneMat);
    podium.position.set(0, podiumH * 0.5, 0);
    podium.castShadow = true;
    podium.receiveShadow = true;
    tower.add(podium);

    // Main glass curtain-wall shaft
    const shaftH = th - podiumH;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(tw, shaftH, td), glassMat);
    shaft.position.set(0, podiumH + shaftH * 0.5, 0);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    tower.add(shaft);

    // Upper setback crown + rooftop mechanical penthouse
    const crownH = 8 + randCity() * 6;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.72, crownH, td * 0.72), glassMat);
    crown.position.set(0, th + crownH * 0.5, 0);
    crown.castShadow = true;
    tower.add(crown);

    const mech = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.36, 3.2, td * 0.36), limestoneMat);
    mech.position.set(0, th + crownH + 1.6, 0);
    tower.add(mech);

    coastCityGroup.add(tower);
  }

  root.add(coastCityGroup);
  return root;
}
