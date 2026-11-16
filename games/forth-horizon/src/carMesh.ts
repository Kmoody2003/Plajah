import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CarSpec } from './manufacturers';

const carGltfLoader = new GLTFLoader();

export interface CarVisual {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheelSteerPivots: THREE.Group[]; // [FL, FR, RL, RR]
  wheelSpinGroups: THREE.Group[];  // [FL, FR, RL, RR]
  rotorMats: THREE.MeshStandardMaterial[]; // [FL, FR, RL, RR]
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightSpots: THREE.SpotLight[];
  setPaint: (hex: number) => void;
}

interface BodyStation {
  z: number;       // normalized -0.5 (rear) .. +0.5 (front)
  halfW: number;   // normalized to spec.width * 0.5
  yBottom: number; // meters above ground
  yBelt: number;   // beltline height (meters)
  yCrown: number;  // center hood/deck height (meters)
  archCut?: number; // 0..1 inward indent for wheel well
}

/**
 * Builds a smooth, sculpted, multi-station lofted car body shell with wheel-arch
 * cutouts and rounded fender shoulders (no boxy primitives).
 */
function createLoftedBodyGeometry(
  stations: BodyStation[],
  halfWidth: number,
  length: number
): THREE.BufferGeometry {
  // Cross-section ring points per station (12 points around half-profile, mirrored or full 16-pt ring)
  // Full 16-point closed loop around cross-section (bottom-center -> right rocker -> right belt -> right crown -> top center -> left crown -> left belt -> left rocker)
  const ringCount = 16;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < stations.length; s++) {
    const st = stations[s];
    const z = st.z * length;
    const arch = st.archCut ?? 0;
    const wBot = halfWidth * st.halfW * (0.86 - arch * 0.22);
    const wSill = halfWidth * st.halfW * (0.98 - arch * 0.18);
    const wBelt = halfWidth * st.halfW * (1.0 - arch * 0.06);
    const wShoulder = halfWidth * st.halfW * 0.80;
    const wCrown = halfWidth * st.halfW * 0.42;

    const yb = st.yBottom;
    const ySill = yb + (st.yBelt - yb) * 0.28;
    const yMid = yb + (st.yBelt - yb) * 0.65;
    const yBelt = st.yBelt;
    const ySh = THREE.MathUtils.lerp(yBelt, st.yCrown, 0.55);
    const yTop = st.yCrown;

    // 16-point symmetric cross-section (CCW looking from +Z)
    const ring: [number, number][] = [
      [0, yb],
      [wBot * 0.55, yb],
      [wBot, yb + 0.04],
      [wSill, ySill],
      [wBelt, yMid],
      [wBelt * 0.98, yBelt],
      [wShoulder, ySh],
      [wCrown, yTop - 0.02],
      [0, yTop],
      [-wCrown, yTop - 0.02],
      [-wShoulder, ySh],
      [-wBelt * 0.98, yBelt],
      [-wBelt, yMid],
      [-wSill, ySill],
      [-wBot, yb + 0.04],
      [-wBot * 0.55, yb],
    ];

    for (const [px, py] of ring) {
      positions.push(px, py, z);
    }

    if (s < stations.length - 1) {
      const a0 = s * ringCount;
      const b0 = (s + 1) * ringCount;
      for (let i = 0; i < ringCount; i++) {
        const iNext = (i + 1) % ringCount;
        indices.push(a0 + i, a0 + iNext, b0 + i);
        indices.push(a0 + iNext, b0 + iNext, b0 + i);
      }
    }
  }

  // Cap rear (s = 0) and front (s = stations.length - 1)
  const addCap = (sIdx: number, flip: boolean) => {
    const base = sIdx * ringCount;
    const centerIdx = positions.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < ringCount; i++) {
      cx += positions[(base + i) * 3];
      cy += positions[(base + i) * 3 + 1];
      cz += positions[(base + i) * 3 + 2];
    }
    positions.push(cx / ringCount, cy / ringCount, cz / ringCount);
    for (let i = 0; i < ringCount; i++) {
      const iNext = (i + 1) % ringCount;
      if (flip) indices.push(centerIdx, base + iNext, base + i);
      else indices.push(centerIdx, base + i, base + iNext);
    }
  };
  addCap(0, true);
  addCap(stations.length - 1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sleek lofted greenhouse / canopy (fastback for Kestrel, teardrop for Aurelia).
 */
function createCanopyGeometry(
  stations: { z: number; halfW: number; yBase: number; yRoof: number }[],
  halfWidth: number,
  length: number
): THREE.BufferGeometry {
  const ringCount = 8;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < stations.length; s++) {
    const st = stations[s];
    const z = st.z * length;
    const w = halfWidth * st.halfW;
    const yb = st.yBase;
    const ym = THREE.MathUtils.lerp(yb, st.yRoof, 0.58);
    const yt = st.yRoof;

    const ring: [number, number][] = [
      [0, yb],
      [w, yb],
      [w * 0.78, ym],
      [w * 0.42, yt - 0.02],
      [0, yt],
      [-w * 0.42, yt - 0.02],
      [-w * 0.78, ym],
      [-w, yb],
    ];
    for (const [px, py] of ring) positions.push(px, py, z);

    if (s < stations.length - 1) {
      const a0 = s * ringCount;
      const b0 = (s + 1) * ringCount;
      for (let i = 0; i < ringCount; i++) {
        const iNext = (i + 1) % ringCount;
        indices.push(a0 + i, a0 + iNext, b0 + i);
        indices.push(a0 + iNext, b0 + iNext, b0 + i);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildCarVisual(spec: CarSpec, withHeadlights = true, paintOverride?: number): CarVisual {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const isKestrel = spec.id === 'kestrel';
  const defaultPaint = isKestrel ? 0xb84314 : 0x115e96; // Burnt-orange GT-R vs Cerulean Zephyr Apex
  const paintColor = paintOverride ?? defaultPaint;

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: 0.78,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x15181e,
    metalness: 0.35,
    roughness: 0.36,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x070d14,
    metalness: 0.15,
    roughness: 0.04,
    clearcoat: 1.0,
    opacity: 0.88,
    transparent: true,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: isKestrel ? 0x4b4e57 : 0x2c323b,
    metalness: 0.9,
    roughness: 0.22,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121417,
    metalness: 0.04,
    roughness: 0.86,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color: isKestrel ? 0xeab308 : 0x00d4ff,
    metalness: 0.55,
    roughness: 0.25,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: isKestrel ? 0xd97706 : 0x00d4ff,
    emissive: isKestrel ? 0x451a03 : 0x006688,
    emissiveIntensity: 0.6,
    roughness: 0.25,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: isKestrel ? 0xeef6ff : 0x99f0ff,
    emissiveIntensity: withHeadlights ? 4.2 : 1.8,
    roughness: 0.08,
  });

  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0x990f0f,
    emissive: 0xff1e1e,
    emissiveIntensity: 1.2,
    roughness: 0.18,
  });

  const L = spec.length;
  const W = spec.width;
  const halfW = W * 0.5;
  const r = spec.wheelRadius;

  // ── 1. Sculpted Lofted Bodywork (Hero-specific profiles) ──
  const bodyStations: BodyStation[] = isKestrel
    ? [
        // Kestrel Sovereign GT-R: muscular long hood, flared haunches, aggressive rear fascia
        { z: -0.50, halfW: 0.88, yBottom: 0.24, yBelt: 0.86, yCrown: 0.90 },
        { z: -0.42, halfW: 0.97, yBottom: 0.20, yBelt: 0.90, yCrown: 0.94, archCut: 0.35 },
        { z: -0.29, halfW: 1.03, yBottom: 0.18, yBelt: 0.94, yCrown: 0.98, archCut: 0.65 }, // Rear wheel arch
        { z: -0.14, halfW: 0.96, yBottom: 0.16, yBelt: 0.90, yCrown: 0.93 },
        { z: 0.05,  halfW: 0.94, yBottom: 0.16, yBelt: 0.86, yCrown: 0.89 },
        { z: 0.20,  halfW: 0.98, yBottom: 0.17, yBelt: 0.85, yCrown: 0.88, archCut: 0.45 },
        { z: 0.30,  halfW: 1.00, yBottom: 0.17, yBelt: 0.82, yCrown: 0.84, archCut: 0.65 }, // Front wheel arch
        { z: 0.42,  halfW: 0.94, yBottom: 0.18, yBelt: 0.70, yCrown: 0.72 },
        { z: 0.50,  halfW: 0.84, yBottom: 0.19, yBelt: 0.56, yCrown: 0.58 },
      ]
    : [
        // Aurelia Zephyr Apex: ultra-low mid-engine wedge, sculpted waist, wide rear hips
        { z: -0.50, halfW: 0.90, yBottom: 0.22, yBelt: 0.82, yCrown: 0.85 },
        { z: -0.40, halfW: 1.00, yBottom: 0.17, yBelt: 0.86, yCrown: 0.89, archCut: 0.45 },
        { z: -0.29, halfW: 1.04, yBottom: 0.15, yBelt: 0.88, yCrown: 0.90, archCut: 0.68 }, // Rear arch
        { z: -0.12, halfW: 0.92, yBottom: 0.14, yBelt: 0.82, yCrown: 0.85 }, // Deep side-intake waist
        { z: 0.08,  halfW: 0.90, yBottom: 0.14, yBelt: 0.78, yCrown: 0.80 },
        { z: 0.22,  halfW: 0.97, yBottom: 0.14, yBelt: 0.76, yCrown: 0.78, archCut: 0.45 },
        { z: 0.30,  halfW: 0.98, yBottom: 0.15, yBelt: 0.72, yCrown: 0.74, archCut: 0.68 }, // Front arch
        { z: 0.42,  halfW: 0.91, yBottom: 0.15, yBelt: 0.58, yCrown: 0.60 },
        { z: 0.50,  halfW: 0.80, yBottom: 0.15, yBelt: 0.44, yCrown: 0.46 },
      ];

  // Try loading Tela 3D / Blender GLB (/cars/kestrel.glb, /cars/aurelia.glb); keep procedural shell as instant fallback
  const proceduralShell = new THREE.Group();
  bodyGroup.add(proceduralShell);

  const bodyGeo = createLoftedBodyGeometry(bodyStations, halfW, L);
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  proceduralShell.add(bodyMesh);

  // ── 2. Lofted Canopy / Greenhouse ──
  const canopyStations = isKestrel
    ? [
        { z: -0.36, halfW: 0.58, yBase: 0.91, yRoof: 0.97 },
        { z: -0.18, halfW: 0.70, yBase: 0.88, yRoof: 1.18 },
        { z: -0.02, halfW: 0.74, yBase: 0.85, yRoof: 1.25 },
        { z: 0.14,  halfW: 0.68, yBase: 0.83, yRoof: 1.12 },
        { z: 0.26,  halfW: 0.58, yBase: 0.82, yRoof: 0.86 },
      ]
    : [
        // Teardrop canopy forward-biased for mid-engine Aurelia
        { z: -0.26, halfW: 0.52, yBase: 0.84, yRoof: 0.94 },
        { z: -0.08, halfW: 0.68, yBase: 0.80, yRoof: 1.14 },
        { z: 0.08,  halfW: 0.72, yBase: 0.77, yRoof: 1.17 },
        { z: 0.22,  halfW: 0.66, yBase: 0.75, yRoof: 1.04 },
        { z: 0.34,  halfW: 0.54, yBase: 0.70, yRoof: 0.74 },
      ];

  const canopyMesh = new THREE.Mesh(createCanopyGeometry(canopyStations, halfW, L), glassMat);
  canopyMesh.castShadow = true;
  proceduralShell.add(canopyMesh);

  // Roof spine / halo trim
  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.46, 0.04, L * 0.24),
    isKestrel ? paintMat : carbonMat
  );
  roofCap.position.set(0, isKestrel ? 1.24 : 1.16, isKestrel ? -0.04 : 0.04);
  proceduralShell.add(roofCap);

  // ── 3. Aero Kit: Front Splitter, Dive Canards, Side Skirts, Multi-Fin Diffuser ──
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(W * 1.03, 0.045, L * 0.14), carbonMat);
  splitter.position.set(0, 0.15, L * 0.46);
  proceduralShell.add(splitter);

  if (!isKestrel) {
    // Cyan aero pin-stripe along splitter & side skirts
    const frontLip = new THREE.Mesh(new THREE.BoxGeometry(W * 1.04, 0.025, 0.06), accentMat);
    frontLip.position.set(0, 0.15, L * 0.525);
    proceduralShell.add(frontLip);
  }

  for (const sx of [-halfW * 0.96, halfW * 0.96]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, L * 0.54), carbonMat);
    skirt.position.set(sx, 0.15, 0);
    proceduralShell.add(skirt);

    // Side mirrors
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.12), carbonMat);
    mirror.position.set(sx * 0.92, isKestrel ? 0.92 : 0.84, L * 0.14);
    proceduralShell.add(mirror);

    // Dive-plane canards on front bumper
    const canard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.22), carbonMat);
    canard.position.set(sx * 0.93, 0.34, L * 0.44);
    canard.rotation.z = sx > 0 ? -0.25 : 0.25;
    proceduralShell.add(canard);
  }

  // Kestrel hood vents & fender louvers
  if (isKestrel) {
    for (const sx of [-0.34, 0.34]) {
      const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.52), carbonMat);
      hoodVent.position.set(sx, 0.78, L * 0.28);
      hoodVent.rotation.x = 0.24;
      proceduralShell.add(hoodVent);

      for (let v = 0; v < 4; v++) {
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.04), carbonMat);
        louver.position.set(sx > 0 ? halfW * 0.94 : -halfW * 0.94, 0.74, L * 0.18 + v * 0.07);
        proceduralShell.add(louver);
      }
    }
  }

  // Multi-fin Carbon Rear Diffuser + Twin/Quad Exhausts
  const diffuserBase = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.18, 0.24), carbonMat);
  diffuserBase.position.set(0, 0.24, -L * 0.48);
  proceduralShell.add(diffuserBase);
  for (let f = -2; f <= 2; f++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.28), carbonMat);
    fin.position.set(f * 0.28, 0.22, -L * 0.49);
    proceduralShell.add(fin);
  }

  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0xa1aab8, metalness: 0.92, roughness: 0.18 });
  for (const sx of [-0.26, -0.14, 0.14, 0.26]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.14, 12), exhaustMat);
    pipe.rotation.x = Math.PI * 0.5;
    pipe.position.set(sx, 0.34, -L * 0.50);
    proceduralShell.add(pipe);
  }

  // ── 4. Rear Wing (GT Decklid for Kestrel, Swan-Neck for Aurelia) ──
  const wingY = isKestrel ? 1.12 : 1.08;
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.038, 0.26), carbonMat);
  wingBlade.position.set(0, wingY, -L * 0.46);
  wingBlade.rotation.x = -0.10;
  wingBlade.castShadow = true;
  proceduralShell.add(wingBlade);

  for (const sx of [-0.46, 0.46]) {
    // Wing endplates
    const endplate = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.18, 0.34),
      isKestrel ? carbonMat : accentMat
    );
    endplate.position.set(sx > 0 ? W * 0.47 : -W * 0.47, wingY - 0.02, -L * 0.46);
    proceduralShell.add(endplate);

    // Pylons (swan-neck top-mount look for Aurelia)
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.14), carbonMat);
    pylon.position.set(sx, wingY - 0.11, -L * 0.44);
    pylon.rotation.x = isKestrel ? 0.18 : -0.25;
    proceduralShell.add(pylon);
  }

  // ── 5. Signature LED Headlights & Taillights ──
  for (const sx of [-W * 0.35, W * 0.35]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.08), headlightMat);
    hl.position.set(sx, isKestrel ? 0.56 : 0.48, L * 0.47);
    hl.rotation.y = sx > 0 ? -0.22 : 0.22;
    bodyGroup.add(hl);

    // Kestrel X-wing / Aurelia wide LED taillight
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.055, 0.06), brakeLightMat);
    tl.position.set(sx, isKestrel ? 0.74 : 0.70, -L * 0.495);
    bodyGroup.add(tl);
  }
  const centerLight = new THREE.Mesh(new THREE.BoxGeometry(W * 0.48, 0.028, 0.05), brakeLightMat);
  centerLight.position.set(0, isKestrel ? 0.80 : 0.72, -L * 0.496);
  bodyGroup.add(centerLight);

  // Headlight SpotLights
  const headlightSpots: THREE.SpotLight[] = [];
  if (withHeadlights) {
    for (const sx of [-W * 0.32, W * 0.32]) {
      const spot = new THREE.SpotLight(0xfff1d6, 18, 95, Math.PI / 5, 0.55, 1.4);
      spot.position.set(sx, 0.56, L * 0.48);
      spot.target.position.set(sx * 0.6, 0.1, L * 0.48 + 26);
      bodyGroup.add(spot);
      bodyGroup.add(spot.target);
      headlightSpots.push(spot);
    }
  }

  // ── 6. 4 Wheels + Visible Suspension Wishbones + Glowing Rotors + Y-Spoke Rims ──
  const halfTrack = spec.trackWidth * 0.5;
  const halfWb = spec.wheelbase * 0.5;
  const wheelCoords: [number, number][] = [
    [-halfTrack, halfWb],   // FL
    [halfTrack, halfWb],    // FR
    [-halfTrack, -halfWb],  // RL
    [halfTrack, -halfWb],   // RR
  ];

  const wheelSteerPivots: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];
  const rotorMats: THREE.MeshStandardMaterial[] = [];

  const tireGeo = new THREE.CylinderGeometry(r, r, 0.30, 28);
  tireGeo.rotateZ(Math.PI * 0.5);
  const rimBarrelGeo = new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.27, 24);
  rimBarrelGeo.rotateZ(Math.PI * 0.5);
  const discGeo = new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.08, 20);
  discGeo.rotateZ(Math.PI * 0.5);
  const hubGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.31, 12);
  hubGeo.rotateZ(Math.PI * 0.5);

  for (const [wx, wz] of wheelCoords) {
    // Visible double-wishbone control arms anchored to chassis
    const sideSign = wx > 0 ? 1 : -1;
    for (const armY of [r - 0.08, r + 0.09]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.16), carbonMat);
      arm.position.set(wx - sideSign * 0.22, armY, wz);
      root.add(arm);
    }
    const coilover = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), caliperMat);
    coilover.position.set(wx - sideSign * 0.18, r + 0.14, wz);
    coilover.rotation.z = sideSign * 0.22;
    root.add(coilover);

    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, r, wz);
    root.add(steerPivot);
    wheelSteerPivots.push(steerPivot);

    // 6/8-Piston Brake Caliper
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.13), caliperMat);
    caliper.position.set(sideSign * 0.04, 0.06, -0.11);
    steerPivot.add(caliper);

    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const barrel = new THREE.Mesh(rimBarrelGeo, carbonMat);
    spinGroup.add(barrel);

    const hub = new THREE.Mesh(hubGeo, accentMat);
    spinGroup.add(hub);

    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x454b54,
      metalness: 0.82,
      roughness: 0.32,
      emissive: 0xff3b00,
      emissiveIntensity: 0,
    });
    rotorMats.push(rotorMat);
    const disc = new THREE.Mesh(discGeo, rotorMat);
    disc.position.x = -sideSign * 0.04;
    spinGroup.add(disc);

    // 10-Y-Spoke Forged Alloy Rim
    for (let s = 0; s < 5; s++) {
      const baseAngle = (s / 5) * Math.PI * 2;
      for (const fork of [-0.14, 0.14]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, r * 0.68), rimMat);
        const a = baseAngle + fork * 0.5;
        spoke.position.set(sideSign * 0.135, Math.sin(a) * r * 0.35, Math.cos(a) * r * 0.35);
        spoke.rotation.x = -a;
        spinGroup.add(spoke);
      }
    }
  }

  // Attempt async GLB override from /cars/<id>.glb (cache-busted so Argilla-CAD rebuilds show immediately)
  void carGltfLoader
    .loadAsync(`/cars/${spec.id}.glb?v=${Date.now()}`)
    .then((gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if (m.name === 'Bodywork') {
            m.material = paintMat;
          }
        }
      });
      // Auto-fit GLB to spec.length along Z and rest tires flush on ground (y = 0)
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const longest = Math.max(size.x, size.z, 0.001);
      const scale = spec.length / longest;
      model.scale.setScalar(scale);
      if (size.x > size.z) {
        model.rotation.y = Math.PI * 0.5;
      }
      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = new THREE.Vector3();
      box2.getCenter(center2);
      model.position.set(-center2.x, -box2.min.y, -center2.z);

      // Hide static embedded showroom wheels so carMesh's animated steering/spinning wheels take over
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          if (
            m.name === 'TireRubber' ||
            m.name === 'ForgedRim' ||
            m.name === 'BrakeRotor' ||
            m.name === 'BrakeCaliper'
          ) {
            m.visible = false;
          }
        }
      });

      proceduralShell.visible = false;
      bodyGroup.add(model);
    })
    .catch(() => {
      // No GLB present yet — keep procedural shell visible
    });

  return {
    root,
    bodyGroup,
    wheelSteerPivots,
    wheelSpinGroups,
    rotorMats,
    brakeLightMat,
    headlightSpots,
    setPaint: (hex: number) => {
      paintMat.color.setHex(hex);
    },
  };
}
