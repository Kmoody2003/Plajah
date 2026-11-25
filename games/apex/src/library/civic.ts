import * as THREE from 'three';
import { Kit, PAL, mat, seeded } from './kit';
import {
  buildBimCivicInteriorShell,
  buildNurbsCupolaDomeMesh,
  buildNurbsSailShellMesh,
  buildNurbsTensileCanopyMesh,
  buildNurbsYachtHullMesh,
  buildSubdClassicalCapitalMesh,
} from '../../../../playkit/world/architecturalForms';
import type { IndexedTriMesh } from '../../../../services/gamestudio/compiler/schema';

function indexedToGeo(m: IndexedTriMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
  if (m.normals) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.normals), 3));
  if (m.uvs) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
  if (!m.normals) g.computeVertexNormals();
  return g;
}

/**
 * Civic riverfront pieces for the Plajah asset library, sized from Kenne's sheets (D:\plajah game assets deign from promtps\racer\civic riverfront):
 * Grand_civic_buildings (grand civic building, modern opera hall, glass museum pavilions), Civic_buildings / botanical sheets (glasshouse conservatory),
 * Concert_stage / Outdoor_music_festival_stage sheets (arched stage rig, speaker towers, front of house), Urban_landscaping sheets (flower beds, fountains,
 * planters, benches, sculptures), the yacht and marina sheets (yachts, pontoons), and the promenade pieces (stone embankment, railing, lamp, palm, pier).
 * Metres, centred on the footprint, standing on y = 0, front toward +z. Each returns a THREE.Group named `lib:<id>`.
 */
const STONE = 0xd9d2c3, LIME = 0xe8e2d4, GLASS_CIV = 0x6f8fa3, WHITE_SHELL = 0xf4f2ec, BRONZE = 0x6b5a3a, WOOD = 0x8a5a36, SAND = 0xe3d3a8;

/** Swept double-curved NURBS architectural sail shell (replaces plain SphereGeometry slices) */
function shell(k: Kit, x: number, y: number, z: number, r: number, _phi: number, tilt: number, ry: number, m: THREE.Material): void {
  const g = indexedToGeo(buildNurbsSailShellMesh({ widthM: r * 1.45, heightM: r * 1.18, depthM: r * 1.35, segsU: 9, segsV: 10 }));
  const matDS = m.clone();
  matDS.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g, matDS);
  mesh.position.set(x, y, z);
  mesh.rotation.set(tilt * 0.25, ry + Math.PI, 0);
  mesh.castShadow = mesh.receiveShadow = true;
  k.g.add(mesh);
}

/** the modern opera hall: a stepped stone podium, glazed foyers and swept double-curved NURBS sail shells (about 180 x 120 m) */
export function operaHall(seed = 1): THREE.Group {
  const k = new Kit('lib:opera-hall'), podium = mat(0xc9b9a0, 0.8), white = mat(WHITE_SHELL, 0.32, 0.08), glass = mat(GLASS_CIV, 0.12, 0.38);
  k.slab(0, 0, 0, 180, 6, 120, podium);
  for (let i = 0; i < 8; i++) k.slab(0, i * 0.75, 60 + 4 + i * 1.2, 70, 0.75, 2.4, podium);              // the grand stair to the forecourt
  k.slab(-35, 6, 8, 46, 14, 60, glass); k.slab(35, 6, 8, 40, 12, 52, glass);                         // the two halls' glazed walls
  const sails: [number, number, number, number, number][] = [[-35, 40, 34, 1.1, -0.15], [-35, 20, 30, 1.0, -0.05], [-35, 0, 26, 0.95, 0.1], [35, 34, 30, 1.0, -0.12], [35, 14, 26, 0.95, 0], [35, -6, 22, 0.9, 0.12], [0, 52, 16, 0.9, -0.3]];
  for (const [x, z, r, phi, tilt] of sails) shell(k, x, 6, z, r, phi, -0.55 + tilt, Math.PI, white);
  return k.g;
}

/** a grand civic building: real CAD/BIM multi-room core (`bimTo3D`), recessed glazed bays, colonnade with Catmull-Clark SubD capitals (about 90 x 50 m) */
export function grandCivicBuilding(seed = 1, w = 90, d = 50, h = 24): THREE.Group {
  const k = new Kit('lib:grand-civic-building'), stone = mat(STONE, 0.85), lime = mat(LIME, 0.75), glass = mat(PAL.glass, 0.16, 0.35), slabMat = mat(0xbdb4a4, 0.82);
  k.slab(0, 0, 0, w, 2, d, mat(0xcfc6b4, 0.85));
  // Real CAD/BIM multi-room civic interior & recessed window wall shell (compiled via Plajah architecturePipeline + bimTo3D!)
  const bim = buildBimCivicInteriorShell({ id: `civic-${seed}`, name: 'Grand Civic Hall', widthM: w, depthM: d, stories: 3, storyHeightM: h / 3 });
  for (const wall of bim.walls) {
    const m = new THREE.Mesh(indexedToGeo(wall), stone);
    m.position.y = 2; m.castShadow = m.receiveShadow = true; k.g.add(m);
  }
  for (const sl of bim.slabs) {
    const m = new THREE.Mesh(indexedToGeo(sl), slabMat);
    m.position.y = 2; m.receiveShadow = true; k.g.add(m);
  }
  for (const win of bim.windows) {
    const m = new THREE.Mesh(indexedToGeo(win), glass);
    m.position.y = 2; k.g.add(m);
  }
  k.slab(0, 2 + h, 0, w + 1.4, 1.4, d + 1.4, mat(0xcbc2b0, 0.8));
  k.slab(0, 2 + h + 1.4, -d * 0.1, w * 0.45, 5, d * 0.5, stone);                                        // attic storey
  const cols = 10, cw = w * 0.42;
  const capGeo = indexedToGeo(buildSubdClassicalCapitalMesh({ radiusM: 0.95, heightM: 1.35, levels: 2 }));
  for (let i = 0; i < cols; i++) {
    const x = -cw / 2 + (i / (cols - 1)) * cw;
    k.cyl(x, 2, d / 2 + 3, 0.9, h - 3.2, lime, 16);
    const cap = new THREE.Mesh(capGeo, lime);
    cap.position.set(x, h - 1.25, d / 2 + 3);
    cap.castShadow = cap.receiveShadow = true;
    k.g.add(cap);
  }
  k.slab(0, h, d / 2 + 3, cw + 4.4, 2, 7.2, stone);                                                      // entablature
  for (let i = 0; i < 6; i++) k.slab(0, i * 0.35, d / 2 + 8 + i * 0.8, cw + 8, 0.35, 1.6, mat(0xcfc6b4, 0.85));
  for (const s of [-1, 1]) for (let f = 0; f < 5; f++) for (let c = 0; c < 4; c++) k.slab(s * (w / 2 - 6 - c * 6), 4 + f * 4.4, d / 2 + 0.08, 2.4, 2.8, 0.14, glass);
  for (const s of [-1, 1]) { k.beam([s * (cw / 2 + 8), 0, d / 2 + 14], [s * (cw / 2 + 8), 14, d / 2 + 14], 0.1, mat(PAL.steel, 0.4, 0.7)); k.slab(s * (cw / 2 + 8) + s * 1.3, 11.5, d / 2 + 14, 2.6, 1.6, 0.05, mat(s > 0 ? 0x2b4c8c : 0xb83a2e, 0.8)); }
  return k.g;
}

/** glass museum pavilions: three to five faceted glass volumes on a stone plinth, joined by glazed bridges (about 110 x 70 m) */
export function glassMuseum(seed = 1): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:glass-museum'), glass = mat(0x8fb3c4, 0.08, 0.5), frame = mat(PAL.galvanized, 0.4, 0.7);
  k.slab(0, 0, 0, 110, 4, 70, mat(STONE, 0.85));
  const n = 4 + Math.floor(r() * 2), spots: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = -40 + (i / (n - 1)) * 80 + (r() - 0.5) * 8, z = (r() - 0.5) * 24, s = 13 + r() * 6;
    const g = new THREE.DodecahedronGeometry(s, 0); g.scale(1, 0.8 + r() * 0.35, 1);
    const m = new THREE.Mesh(g, glass); m.position.set(x, 4 + s * 0.7, z); m.rotation.y = r() * 3; m.castShadow = m.receiveShadow = true; k.g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xc8d0d4 })); e.position.copy(m.position); e.rotation.copy(m.rotation); k.g.add(e);
    spots.push([x, z]);
  }
  for (let i = 0; i < spots.length - 1; i++) { const a = spots[i], b = spots[i + 1]; k.slab((a[0] + b[0]) / 2, 6, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]), 4, 5, glass, -Math.atan2(b[1] - a[1], b[0] - a[0])); }
  k.slab(0, 4, 32, 30, 0.4, 6, frame);
  return k.g;
}

/** the botanical glasshouse conservatory: cross-plan glasshouse crowned by revolved ogival NURBS cupolas (about 120 x 120 m) */
export function botanicalGlasshouse(seed = 1): THREE.Group {
  const k = new Kit('lib:botanical-glasshouse'), glass = mat(0xa8c6c8, 0.06, 0.45), frame = mat(0xf0f0ea, 0.5, 0.3), base = mat(STONE, 0.85);
  for (const [w, d] of [[110, 26], [26, 110]]) { k.slab(0, 0, 0, w, 1.2, d, base); k.slab(0, 1.2, 0, w, 10, d, glass); const g = new THREE.CylinderGeometry(d / 2, d / 2, w, 20, 1, false, 0, Math.PI); const m = new THREE.Mesh(g, glass); m.rotation.set(0, w > d ? 0 : Math.PI / 2, Math.PI / 2); m.position.y = 11.2; k.g.add(m); }
  const mainCupola = new THREE.Mesh(indexedToGeo(buildNurbsCupolaDomeMesh({ radiusM: 22, heightM: 24, segments: 18 })), glass);
  mainCupola.position.y = 11.2; mainCupola.castShadow = true; k.g.add(mainCupola);
  const armCupolaGeo = indexedToGeo(buildNurbsCupolaDomeMesh({ radiusM: 11, heightM: 10.5, segments: 12 }));
  for (const [x, z] of [[50, 0], [-50, 0], [0, 50], [0, -50]]) {
    const am = new THREE.Mesh(armCupolaGeo, glass);
    am.position.set(x, 11.2, z); k.g.add(am);
  }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.beam([Math.cos(a) * 22, 11.2, Math.sin(a) * 22], [0, 36.5, 0], 0.18, frame); }
  return k.g;
}

/** the main arched festival stage rig (24 m roof system): deck, swept NURBS tensile canopy, truss towers, LED walls; faces +z */
export function festivalStage(seed = 1): THREE.Group {
  const k = new Kit('lib:festival-stage'), truss = mat(0xc8ccd0, 0.4, 0.75), black = mat(0x151617, 0.8), roof = mat(0xe6e6e2, 0.65), led = mat(0x101820, 0.3, 0.2, 0x2a4a80);
  k.slab(0, 0, 0, 30, 2, 18, black);                                                                    // deck
  for (const x of [-15, 15]) for (const z of [-8, 8]) k.slab(x, 0, z, 0.8, 16, 0.8, truss);
  const canopyMat = roof.clone();
  canopyMat.side = THREE.DoubleSide;
  const canopy = new THREE.Mesh(indexedToGeo(buildNurbsTensileCanopyMesh({ widthM: 32, depthM: 20, archRiseM: 6.2 })), canopyMat);
  canopy.position.set(0, 15.8, 0.5);
  canopy.castShadow = true;
  k.g.add(canopy);
  k.slab(0, 2, -8.6, 28, 13, 0.4, black);                                                               // back wall
  for (const s of [-1, 1]) { k.slab(s * 21, 4, 2, 10, 6, 0.4, led); k.slab(s * 19, 0, 6, 1, 20, 1, truss); k.slab(s * 19, 10, 7.2, 1.4, 8, 1.4, black); k.slab(s * 18.5, 0, 10, 4, 2.4, 2.4, black); }
  return k.g;
}

/** amphitheatre seating: concentric terraces in a half bowl of radius r0..r1 facing the stage at the origin (the stage stands at z < 0) */
export function amphitheatreBowl(r0 = 28, r1 = 90, rows = 24): THREE.Group {
  const k = new Kit('lib:amphitheatre-bowl'), conc = mat(0xc4beb2, 0.85), seat = mat(0x6d8a5a, 0.9);
  // each row: a flat ring step (the tread) at its height and the riser below it, over 0.84 of a half turn, opening toward the stage (-z)
  // a ring's angle runs in its own plane (rotated flat, +z is angle -90 deg); a cylinder's from +z (angle 0): both centred on +z, where the seats are
  const t0 = -Math.PI * 0.5 - Math.PI * 0.42, tl = Math.PI * 0.84, c0 = -Math.PI * 0.42;
  for (let i = 0; i < rows; i++) {
    const r = r0 + (r1 - r0) * (i / rows), h = 0.45 * (i + 1), w = (r1 - r0) / rows, m = i % 6 === 5 ? conc : seat;
    const tread = new THREE.RingGeometry(r, r + w, 48, 1, t0, tl); tread.rotateX(-Math.PI / 2);
    const tm = new THREE.Mesh(tread, m); tm.position.y = h; tm.receiveShadow = true; k.g.add(tm);
    const riser = new THREE.CylinderGeometry(r, r, h, 48, 1, true, c0, tl); const rm = new THREE.Mesh(riser, conc); rm.position.y = h / 2; (rm.material as THREE.Material).side = THREE.DoubleSide; k.g.add(rm);
  }
  return k.g;
}

/** a luxury motor yacht along local z (bow at +z): flared double-curved NURBS hull, multi-deck superstructure, mast; 20-60 m long */
export function yacht(seed = 1, len = 30): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:yacht'), hull = mat(r() < 0.7 ? 0xf4f4f2 : 0x1f2a36, 0.25, 0.24), deck = mat(0xbf9a6a, 0.7), glass = mat(0x1d2a33, 0.08, 0.45), white = mat(0xf7f7f5, 0.35, 0.1);
  const w = len * 0.21;
  const hullMat = hull.clone();
  hullMat.side = THREE.DoubleSide;
  const hm = new THREE.Mesh(indexedToGeo(buildNurbsYachtHullMesh({ lengthM: len, beamM: w, freeboardM: len * 0.085 })), hullMat);
  hm.castShadow = hm.receiveShadow = true;
  k.g.add(hm);
  k.slab(0, len * 0.068, -len * 0.05, w * 0.86, 0.12, len * 0.82, deck);
  const decks = len > 35 ? 3 : 2;
  for (let i = 0; i < decks; i++) { const dl = len * (0.5 - i * 0.12), dw = w * (0.78 - i * 0.1), y = len * 0.072 + i * 2.6; k.slab(0, y, -len * 0.06 - i * len * 0.02, dw, 2.5, dl, white); k.slab(0, y + 0.8, -len * 0.06 - i * len * 0.02 + 0.05, dw + 0.06, 0.9, dl * 0.9, glass); }
  k.beam([0, len * 0.072 + decks * 2.6, -len * 0.1], [0, len * 0.072 + decks * 2.6 + 4, -len * 0.12], 0.08, white);
  return k.g;
}

/** a marina pontoon along local z with finger berths either side every 6 m */
export function pontoon(len = 120, finger = 14): THREE.Group {
  const k = new Kit('lib:marina-pontoon'), deck = mat(0xb08a5e, 0.8);
  k.slab(0, 0, 0, 3, 0.5, len, deck);
  for (let z = -len / 2 + 4; z < len / 2 - 2; z += 6) for (const s of [-1, 1]) k.slab(s * (1.5 + finger / 2), 0, z, finger, 0.4, 1.2, deck);
  return k.g;
}

/** a pier on piles along local z, `len` long and `w` wide, with railings and lamps */
export function pier(len = 140, w = 10): THREE.Group {
  const k = new Kit('lib:pier'), deck = mat(0x9b7652, 0.85), pile = mat(0x4b3d30, 0.9), rail = mat(0xe8e6e0, 0.5, 0.3);
  k.slab(0, 2.6, 0, w, 0.6, len, deck);
  for (let z = -len / 2; z <= len / 2; z += 8) for (const s of [-1, 1]) k.cyl(s * (w / 2 - 0.6), -6, z, 0.35, 9, pile, 8);
  for (const s of [-1, 1]) { k.slab(s * w / 2, 3.2, 0, 0.12, 0.12, len, rail); k.slab(s * w / 2, 3.8, 0, 0.12, 0.12, len, rail); for (let z = -len / 2; z <= len / 2; z += 3) k.slab(s * w / 2, 3.2, z, 0.1, 1.1, 0.1, rail); }
  for (let z = -len / 2 + 10; z < len / 2; z += 20) k.slab(w / 2 - 0.4, 3.2, z, 0.18, 4.5, 0.18, mat(0x2d3134, 0.5, 0.6));
  return k.g;
}

/** a stretch of Mediterranean stone embankment along local x, `len` long: a dressed stone river wall with a coping and a promenade railing */
export function stoneEmbankment(len = 40, h = 4): THREE.Group {
  const k = new Kit('lib:stone-embankment'), stone = mat(0xcdbf9f, 0.9), coping = mat(0xe3d8bf, 0.8), rail = mat(0x2d3134, 0.5, 0.6);
  k.slab(0, -h, 0, len, h, 2.2, stone);
  k.slab(0, 0, 0, len, 0.4, 2.6, coping);
  for (let x = -len / 2; x <= len / 2; x += 2.5) k.slab(x, 0.4, 0.6, 0.08, 1.05, 0.08, rail);
  k.slab(0, 1.45, 0.6, len, 0.08, 0.1, rail);
  return k.g;
}

/** a promenade lamp: a black cast post with a lantern */
export function promenadeLamp(): THREE.Group { const k = new Kit('lib:promenade-lamp'), iron = mat(0x24272a, 0.5, 0.6); k.cyl(0, 0, 0, 0.12, 4.6, iron, 8, 0.08); k.cyl(0, 4.6, 0, 0.32, 0.6, mat(0xf3e6c4, 0.3, 0, 0xffe2a8), 8, 0.22); k.cyl(0, 5.2, 0, 0.34, 0.2, iron, 8, 0.05); return k.g; }

/** a palm tree: a curved ringed trunk and a lush crown of arched drooping multi-segment tapered fronds */
export function palmTree(seed = 1, h = 11): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:palm-tree'), trunk = mat(0x8a7356, 0.95), frond = mat(0x3f6b2e, 0.78);
  const lean = (r() - 0.5) * 1.5;
  for (let i = 0; i < 6; i++) { const y0 = (i / 6) * h, y1 = ((i + 1) / 6) * h; k.beam([lean * (i / 6) ** 2, y0, 0], [lean * ((i + 1) / 6) ** 2, y1, 0], 0.34 - i * 0.028, trunk); }
  // Build one arched tapered palm frond geometry (4 curved segments with V-folded leaflets)
  const buildFrond = (len: number, w: number, droop: number): THREE.BufferGeometry => {
    const segs = 4, pos: number[] = [], idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const z = t * len;
      const y = Math.sin(t * Math.PI * 0.65) * 0.95 - t * t * droop;
      const hw = w * Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.52;
      const dip = hw * 0.38;
      pos.push(-hw, y - dip, z, 0, y, z, hw, y - dip, z);
    }
    for (let s = 0; s < segs; s++) {
      const a = s * 3, b = a + 3;
      idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  frond.side = THREE.DoubleSide;
  const gLower = buildFrond(4.9, 1.45, 2.35), gUpper = buildFrond(3.8, 1.25, 1.15);
  for (let i = 0; i < 11; i++) {
    const upper = i >= 6;
    const a = ((upper ? i - 6 : i) / (upper ? 5 : 6)) * Math.PI * 2 + (upper ? 0.55 : 0) + (r() - 0.5) * 0.28;
    const m = new THREE.Mesh(upper ? gUpper : gLower, frond);
    m.position.set(lean, h + (upper ? 0.25 : -0.05), 0);
    m.rotation.set(upper ? -0.25 : 0.08, a, 0);
    m.castShadow = true; m.receiveShadow = true;
    k.g.add(m);
  }
  return k.g;
}

/** urban landscaping: a raised flower bed (corten, stone or brick), a tiered fountain, a bench, a bronze sculpture */
export function flowerBed(seed = 1, w = 6, d = 2): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:flower-bed'), edge = mat([0x8a4a2a, 0xb8ad98, 0x8a4a35][Math.floor(r() * 3)], 0.85);
  k.slab(0, 0, 0, w, 0.55, d, edge); k.slab(0, 0.5, 0, w - 0.2, 0.15, d - 0.2, mat(0x3c2c20, 1));
  const colours = [0x8a4fb0, 0xd94c6a, 0xf2c43a, 0xf28a3a, 0xe8e8f0, 0x5aa04a];
  for (let i = 0; i < Math.round(w * d * 2.2); i++) { const s = 0.25 + r() * 0.3; k.sphere(-w / 2 + 0.3 + r() * (w - 0.6), 0.75 + s * 0.4, -d / 2 + 0.3 + r() * (d - 0.6), s, mat(colours[Math.floor(r() * colours.length)], 0.9), 6); }
  return k.g;
}
export function fountain(r0 = 5): THREE.Group {
  const k = new Kit('lib:fountain'), stone = mat(LIME, 0.75), water = mat(0x4f7f95, 0.05, 0.2);
  k.cyl(0, 0, 0, r0, 0.7, stone, 32); k.cyl(0, 0.5, 0, r0 - 0.4, 0.25, water, 32);
  k.cyl(0, 0.7, 0, 0.5, 1.8, stone, 12); k.cyl(0, 2.5, 0, r0 * 0.4, 0.35, stone, 24); k.cyl(0, 2.85, 0, 0.3, 1.2, stone, 10); k.cyl(0, 4, 0, r0 * 0.2, 0.25, stone, 18);
  k.cyl(0, 4.2, 0, 0.12, 1.4, mat(0xdff2ff, 0.05, 0, 0x7fb3d0), 8);
  return k.g;
}
export function bench(): THREE.Group { const k = new Kit('lib:bench'), wood = mat(WOOD, 0.8), iron = mat(0x2a2d30, 0.5, 0.6); k.slab(0, 0.42, 0, 1.8, 0.06, 0.45, wood); k.slab(0, 0.5, -0.24, 1.8, 0.45, 0.05, wood); for (const s of [-0.8, 0.8]) k.slab(s, 0, 0, 0.06, 0.45, 0.5, iron); return k.g; }
export function sculpture(seed = 1): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:sculpture'), bronze = mat(BRONZE, 0.4, 0.8);
  k.slab(0, 0, 0, 1.6, 1.0, 1.6, mat(0x3a3b3d, 0.6)); const g = new THREE.TorusKnotGeometry(0.9, 0.22, 80, 10, 2 + Math.floor(r() * 2), 3); const m = new THREE.Mesh(g, bronze); m.position.y = 2.3; m.castShadow = true; k.g.add(m);
  return k.g;
}
/** a civic monument: a stepped plinth, a tall obelisk-like shaft and a bronze crown */
export function monument(h = 30): THREE.Group {
  const k = new Kit('lib:civic-monument'), stone = mat(LIME, 0.75);
  for (let i = 0; i < 3; i++) k.slab(0, i * 0.6, 0, 16 - i * 3, 0.6, 16 - i * 3, stone);
  k.cyl(0, 1.8, 0, 2.6, h, stone, 4, 1.4); k.sphere(0, h + 2.6, 0, 1.6, mat(BRONZE, 0.4, 0.8), 14);
  return k.g;
}
export const SAND_COLOUR = SAND;
