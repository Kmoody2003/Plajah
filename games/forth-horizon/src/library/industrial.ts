import * as THREE from 'three';
import { Kit, PAL, mat, seeded } from './kit';

/**
 * Industrial district pieces for the Plajah asset library, sized from Kenne's sheets (D:\plajah game assets deign from promtps\racer\industrial districts):
 * Industrial_buildings_asset_sheet (harbor control tower, customs and port inspection, manufacturing hall, logistics centre, bulk warehouse),
 * Locomotives_and_railway_asset_sheet (diesel locomotive, hopper, tanker, boxcar, container flatcar, ballasted track, signal gantry, relay hut,
 * buffer stop) and Coastal_oil_refinery_asset_sheet (distillation tower, Horton sphere, pipe rack, domed storage tank, flare).
 * Every piece: metres, centred on its footprint, standing on y = 0, front (doors, cab) toward +z. Returns a THREE.Group named `lib:<id>`.
 */

// ---------- buildings ----------

/** Heavy bulk warehouse and storage: corrugated walls, gable roof, a roller door and a silo on the gable end (w across, d deep) */
export function bulkWarehouse(seed = 1, w = 36, d = 60, h = 11): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:bulk-warehouse'), wall = mat(PAL.corrugated, 0.7, 0.35), roof = mat(PAL.roofDark, 0.6, 0.4);
  k.slab(0, 0, 0, w, h, d, wall);
  k.gable(0, h, 0, w + 0.6, d + 0.6, w * 0.16, roof);
  k.slab(0, 0, d / 2 + 0.05, w * 0.32, h * 0.62, 0.15, mat(PAL.darkSteel, 0.6, 0.5));           // roller door
  k.slab(w * 0.3, 0, d / 2 + 0.05, 1.1, 2.2, 0.15, mat(PAL.red, 0.6));                         // man door
  for (let i = 0; i < 4; i++) k.slab((i - 1.5) * w * 0.22, h * 0.72, d / 2 + 0.06, w * 0.14, 1.0, 0.1, mat(PAL.glass, 0.2, 0.3));
  if (r() < 0.8) { const sx = -w / 2 - 3.2; k.cyl(sx, 4, d / 2 - 6, 2.6, 12, mat(PAL.galvanized, 0.45, 0.6)); k.cyl(sx, 16, d / 2 - 6, 2.6, 2.2, mat(PAL.galvanized, 0.45, 0.6), 16, 0.4); for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) k.beam([sx + a, 0, d / 2 - 6 + b], [sx + a, 4, d / 2 - 6 + b], 0.18, mat(PAL.steel, 0.5, 0.6)); }
  return k.g;
}

/** Logistics facility and distribution centre: a long flat-roofed box with a row of dock doors and canopies on the front, an office block at one end */
export function logisticsCentre(seed = 1, w = 120, d = 70, h = 12): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:logistics-centre'), wall = mat(0xc9ccc9, 0.75, 0.1);
  k.slab(0, 0, 0, w, h, d, wall);
  k.slab(0, h, 0, w + 0.4, 0.6, d + 0.4, mat(PAL.darkConcrete, 0.8));                          // parapet
  const docks = Math.floor(w / 6) - 2;
  for (let i = 0; i < docks; i++) { const x = -w / 2 + 8 + i * 6; k.slab(x, 1.2, d / 2 + 0.05, 3.2, 3.4, 0.12, mat(PAL.darkSteel, 0.6, 0.5)); k.slab(x, 4.8, d / 2 + 0.9, 3.8, 0.2, 1.8, mat(PAL.galvanized, 0.5, 0.5)); }
  k.slab(-w / 2 + 6, 0, d / 2 + 0.4, 10, 1.2, 0.8, mat(PAL.concrete));                           // dock apron edge
  k.slab(w / 2 - 9, 0, d / 2 + 4, 16, 8, 8, mat(0xe0e0dc, 0.7));                                // office block
  for (let i = 0; i < 3; i++) k.slab(w / 2 - 9, 1.6 + i * 2.4, d / 2 + 8.05, 14, 1.2, 0.1, mat(PAL.glass, 0.2, 0.3));
  for (let i = 0; i < 4 + Math.floor(r() * 4); i++) k.slab(-w / 2 + 10 + r() * (w - 20), h + 0.6, -d / 2 + 6 + r() * (d - 12), 3, 1.6, 2.2, mat(PAL.galvanized, 0.5, 0.5));   // roof units
  return k.g;
}

/** Industrial manufacturing building: brick walls, a sawtooth north-light roof in bays, chimney stacks and ducts on the side */
export function manufacturingHall(seed = 1, w = 48, d = 40, h = 9, bays = 4): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:manufacturing-hall'), brick = mat(PAL.brick, 0.9), roof = mat(PAL.corrugated, 0.65, 0.35), glass = mat(PAL.glass, 0.25, 0.3);
  k.slab(0, 0, 0, w, h, d, brick);
  const bd = d / bays;
  for (let b = 0; b < bays; b++) {
    const z = -d / 2 + bd * (b + 0.5);
    k.sawtooth(0, h, z, w, bd, 4.2, roof);
    k.slab(0, h, z - bd / 2 + 0.1, w - 0.4, 3.9, 0.12, glass);                                    // the glazed north face
  }
  const stacks = 1 + Math.floor(r() * 3);
  for (let i = 0; i < stacks; i++) k.cyl(-w / 2 + 4 + i * 3.4, 0, -d / 2 + 4, 0.9, h + 12 + r() * 6, mat(0x6d4434, 0.9), 12, 0.75);
  for (let i = 0; i < 3; i++) k.slab(-w / 4 + i * w / 4, 0, d / 2 + 0.05, 4.2, 4.6, 0.15, mat(PAL.darkSteel, 0.6, 0.5));
  k.cylX(w / 2 + 1.2, 5.5, 0, 0.7, 2.4, mat(PAL.galvanized, 0.45, 0.6)); k.cyl(w / 2 + 2.4, 0, 0, 0.7, 7.5, mat(PAL.galvanized, 0.45, 0.6));   // duct down the side
  return k.g;
}

/** Harbor control tower: a concrete shaft with an outside stair, a glazed control cab with a walkway, antennas, and a low annex */
export function controlTower(seed = 1, h = 26): THREE.Group {
  const k = new Kit('lib:harbor-control-tower'), conc = mat(PAL.concrete, 0.85), steel = mat(PAL.steel, 0.5, 0.6);
  k.slab(0, 0, 0, 7, h, 7, conc);
  k.slab(0, h, 0, 10, 0.6, 10, conc);
  k.slab(0, h + 0.6, 0, 9, 3.2, 9, mat(PAL.glass, 0.15, 0.4));                                   // the cab
  k.slab(0, h + 3.8, 0, 10.4, 0.6, 10.4, conc);
  for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) k.beam([a, h + 0.6, b], [a, h + 1.7, b], 0.05, steel);
  k.beam([3, h + 4.4, 3], [3, h + 12, 3], 0.12, steel); k.beam([-3, h + 4.4, -3], [-3, h + 8, -3], 0.08, steel);
  for (let i = 0; i < Math.floor(h / 3.2); i++) k.slab(3.9 + 0.6, i * 3.2, (i % 2 ? -1 : 1) * 1.2, 1.2, 0.2, 3, steel);   // outside stair landings
  k.slab(-8, 0, 2, 12, 4.5, 10, conc);                                                            // annex
  return k.g;
}

/** Customs and port inspection building: a two-storey office and a canopy over three inspection lanes with booths and barrier arms */
export function customsBuilding(seed = 1): THREE.Group {
  const k = new Kit('lib:customs-building'), conc = mat(0xd3d2cc, 0.8), canopy = mat(PAL.galvanized, 0.5, 0.5);
  k.slab(-16, 0, 0, 18, 7.5, 14, conc);
  for (let i = 0; i < 2; i++) k.slab(-16, 1.4 + i * 3.4, 7.05, 15, 1.4, 0.1, mat(PAL.glass, 0.2, 0.3));
  k.slab(8, 6.2, 0, 26, 0.6, 16, canopy);
  for (const x of [-4, 8, 20]) for (const z of [-6, 6]) k.cyl(x, 0, z, 0.3, 6.2, mat(PAL.steel, 0.5, 0.6), 10);
  for (const x of [-2, 8, 18]) { k.slab(x, 0, 0, 1.6, 2.6, 1.6, mat(0xe8e6e0, 0.6)); k.box(x + 3.4, 1.1, 0, 5, 0.12, 0.12, mat(PAL.red, 0.6)); }
  return k.g;
}

// ---------- rail ----------

/** a diesel freight locomotive (yellow body, navy roof and stripe), about 22 m long; along local z, cab at +z */
export function locomotive(seed = 1): THREE.Group {
  const k = new Kit('lib:locomotive'), yel = mat(PAL.yellow, 0.55, 0.25), navy = mat(PAL.navy, 0.55, 0.25), dark = mat(PAL.black, 0.7, 0.4), glass = mat(PAL.glass, 0.15, 0.3);
  k.slab(0, 1.15, 0, 3.1, 0.35, 22, dark);                                                        // deck frame
  k.slab(0, 1.5, -1.6, 2.9, 3.0, 17.2, yel);                                                      // long hood
  k.slab(0, 4.5, -1.6, 2.6, 0.35, 17.2, navy);
  k.slab(0, 1.5, 8.2, 3.1, 3.4, 3.6, yel);                                                        // cab
  k.slab(0, 4.9, 8.2, 3.1, 0.3, 3.6, navy);
  k.slab(0, 3.4, 10.05, 2.6, 1.1, 0.06, glass); for (const s of [-1, 1]) k.slab(s * 1.56, 3.4, 8.4, 0.06, 1.1, 2.2, glass);
  k.slab(0, 1.5, 10.6, 2.6, 1.5, 1.2, yel);                                                       // nose
  for (const z of [-7.2, 7.2]) { k.slab(0, 0.35, z, 2.8, 0.9, 4.2, dark); for (const dz of [-1.5, 0, 1.5]) for (const s of [-1, 1]) k.cylX(s * 1.25, 0.52, z + dz, 0.52, 0.18, dark, 14); }
  k.slab(0, 0.55, 0, 2.6, 0.6, 6, dark);                                                          // fuel tank
  return k.g;
}

export type WagonKind = 'hopper' | 'tanker' | 'boxcar' | 'flatcar';
/** a freight wagon about 16 m long along local z: 4-bay coal hopper, cylindrical tanker, 50 ft boxcar or flatcar with an intermodal container */
export function wagon(kind: WagonKind, seed = 1): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:wagon-' + kind), dark = mat(PAL.black, 0.7, 0.4);
  k.slab(0, 1.0, 0, 2.9, 0.3, 16, dark);
  for (const z of [-5.6, 5.6]) { k.slab(0, 0.3, z, 2.6, 0.7, 2.4, dark); for (const dz of [-0.9, 0.9]) for (const s of [-1, 1]) k.cylX(s * 1.2, 0.45, z + dz, 0.45, 0.16, dark, 12); }
  const body = [PAL.rust, 0x6b3a2a, 0x3c4a55, 0x7d6a4a][Math.floor(r() * 4)];
  if (kind === 'hopper') { k.slab(0, 1.3, 0, 3.0, 2.9, 15.2, mat(body, 0.85)); k.slab(0, 4.2, 0, 2.7, 0.35, 14.5, mat(0x1b1a19, 1)); }
  else if (kind === 'tanker') { k.cylZ(0, 2.7, 0, 1.45, 14.8, mat(r() < 0.5 ? PAL.black : 0xd8d6cf, 0.45, 0.35), 18); k.cyl(0, 4.1, 0, 0.5, 0.4, dark, 10); }
  else if (kind === 'boxcar') { k.slab(0, 1.3, 0, 3.0, 3.5, 15.4, mat(body, 0.85)); k.slab(1.52, 1.5, 0, 0.06, 3.0, 3.2, mat(0x2f2a26, 0.8)); }
  else { const c = [0x9a3b2e, 0x2c5c8a, 0x8a8f94, 0x3f6b3c, 0xc79a2a][Math.floor(r() * 5)]; k.slab(0, 1.15, 0, 2.44, 2.6, 12.2, mat(c, 0.75, 0.2)); }
  return k.g;
}

/** ballasted track along local z, `len` long: a ballast bed, sleepers every 0.65 m, two rails (standard gauge) */
export function railTrack(len: number): THREE.Group {
  const k = new Kit('lib:rail-track');
  const bed = new THREE.Shape(); bed.moveTo(-2.1, 0); bed.lineTo(2.1, 0); bed.lineTo(1.5, 0.45); bed.lineTo(-1.5, 0.45); bed.closePath();
  const g = new THREE.ExtrudeGeometry(bed, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
  const m = new THREE.Mesh(g, mat(PAL.ballast, 1)); m.receiveShadow = true; k.g.add(m);
  const n = Math.floor(len / 0.65), sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.18, 0.26), mat(PAL.sleeper, 0.95), n), m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) sl.setMatrixAt(i, m4.makeTranslation(0, 0.5, -len / 2 + 0.33 + i * 0.65));
  sl.receiveShadow = true; k.g.add(sl);
  for (const s of [-0.7175, 0.7175]) k.slab(s, 0.59, 0, 0.08, 0.16, len, mat(PAL.rail, 0.35, 0.8));
  return k.g;
}

/** an overhead cantilever signal gantry over `tracks` tracks 4.5 m apart (across local x) */
export function signalGantry(tracks = 3): THREE.Group {
  const k = new Kit('lib:signal-gantry'), steel = mat(PAL.galvanized, 0.5, 0.6), w = tracks * 4.5 + 2;
  for (const s of [-1, 1]) { k.slab(s * w / 2, 0, 0, 0.5, 7.5, 0.5, steel); k.slab(s * w / 2, 0, 0, 1.2, 0.4, 1.2, mat(PAL.concrete)); }
  k.slab(0, 7.0, 0, w + 0.6, 0.7, 0.8, steel);
  for (let t = 0; t < tracks; t++) { const x = -((tracks - 1) * 4.5) / 2 + t * 4.5; k.slab(x, 5.6, 0.2, 0.5, 1.4, 0.35, mat(PAL.black, 0.7)); }
  return k.g;
}

export function relayHut(): THREE.Group { const k = new Kit('lib:relay-hut'); k.slab(0, 0, 0, 3, 2.7, 2.4, mat(PAL.galvanized, 0.6, 0.5)); k.gable(0, 2.7, 0, 3.2, 2.6, 0.4, mat(PAL.roofDark, 0.6, 0.4), Math.PI / 2); return k.g; }
export function bufferStop(): THREE.Group { const k = new Kit('lib:buffer-stop'), w = mat(0x5a4330, 0.9); k.slab(0, 0, 0, 2.2, 1.1, 0.5, w); for (const s of [-0.7, 0.7]) k.beam([s, 0, -1.4], [s, 1.0, 0], 0.12, w); k.slab(0, 0.8, 0.3, 1.8, 0.35, 0.2, mat(PAL.red, 0.6)); return k.g; }

// ---------- refinery ----------

/** distillation (fractionating) tower: a tall column with ring platforms and a ladder, a side drum and pipes; on a concrete pad */
export function distillationTower(seed = 1, h = 38, r = 2.4): THREE.Group {
  const k = new Kit('lib:distillation-tower'), shell = mat(0xd8d7d2, 0.5, 0.4), steel = mat(PAL.safetyYellow, 0.6, 0.3), conc = mat(PAL.concrete);
  k.slab(0, 0, 0, 12, 0.4, 12, conc);
  k.cyl(0, 0.4, 0, r, h, shell, 20); k.dome(0, h + 0.4, 0, r, r * 0.6, shell);
  for (let y = 6; y < h; y += 7) { k.cyl(0, y, 0, r + 1.1, 0.2, steel, 20); }
  k.beam([r + 0.4, 0.4, 0], [r + 0.4, h, 0], 0.08, steel);
  k.cyl(-r - 2.6, 0.4, 2.4, 1.2, 6, shell, 14); k.dome(-r - 2.6, 6.4, 2.4, 1.2, 0.8, shell);
  k.cylX(-r - 1, h * 0.7, 0, 0.35, 3, mat(PAL.galvanized, 0.45, 0.6)); k.beam([-r - 2.5, h * 0.7, 0], [-r - 2.5, 0.4, 0], 0.35, mat(PAL.galvanized, 0.45, 0.6));
  return k.g;
}

/** a spherical gas storage tank (Horton sphere) on legs with a ring of bracing and a stair to the top */
export function hortonSphere(seed = 1, r = 8): THREE.Group {
  const k = new Kit('lib:horton-sphere'), white = mat(PAL.tankWhite, 0.45, 0.3), steel = mat(PAL.steel, 0.5, 0.6), yc = r + 4;
  k.cyl(0, 0, 0, r + 4, 0.4, mat(PAL.concrete), 28);
  k.sphere(0, yc, 0, r, white, 28);
  const legs = 8;
  for (let i = 0; i < legs; i++) { const a = (i / legs) * Math.PI * 2, x = Math.cos(a) * r * 0.86, z = Math.sin(a) * r * 0.86; k.beam([x, 0.4, z], [x, yc, z], 0.3, steel); }
  k.cyl(0, yc + r - 0.2, 0, 1.6, 0.3, mat(PAL.safetyYellow, 0.6, 0.3), 14);
  for (let i = 0; i < 12; i++) { const a = i * 0.26, y = 0.4 + i * (yc + r - 0.4) / 12; k.slab(Math.cos(a) * (r + 1.2), y, Math.sin(a) * (r + 1.2), 1, 0.12, 1, mat(PAL.safetyYellow, 0.6, 0.3)); }
  return k.g;
}

/** a domed (or floating-roof) vertical storage tank in its bund wall */
export function storageTank(seed = 1, r = 14, h = 15, domed = true): THREE.Group {
  const k = new Kit('lib:storage-tank'), white = mat(PAL.tankWhite, 0.5, 0.25);
  k.cyl(0, 0, 0, r, h, white, 32);
  if (domed) k.dome(0, h, 0, r, r * 0.22, white); else k.cyl(0, h - 0.6, 0, r - 0.3, 0.3, mat(0x9a9890, 0.6, 0.3), 32);
  k.slab(r + 0.3, 0, 0, 0.5, h, 1, mat(PAL.safetyYellow, 0.6, 0.3));
  const bw = r * 2 + 12;
  for (const s of [-1, 1]) { k.slab(0, 0, s * bw / 2, bw, 1.1, 0.7, mat(PAL.concrete)); k.slab(s * bw / 2, 0, 0, 0.7, 1.1, bw, mat(PAL.concrete)); }
  return k.g;
}

/** a pipe bridge / pipe rack `len` long along local x: portal frames every 8 m carrying a bundle of pipes in two tiers */
export function pipeRack(len: number, seed = 1): THREE.Group {
  const k = new Kit('lib:pipe-rack'), steel = mat(PAL.darkSteel, 0.55, 0.6), pipeM = [mat(PAL.galvanized, 0.45, 0.6), mat(0xb8a24a, 0.5, 0.4), mat(0x8a3a2c, 0.6, 0.3)];
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 8) { for (const z of [-1.8, 1.8]) k.slab(x, 0, z, 0.35, 7, 0.35, steel); k.slab(x, 4.2, 0, 0.3, 0.3, 4, steel); k.slab(x, 6.8, 0, 0.3, 0.3, 4, steel); }
  for (let i = 0; i < 6; i++) k.cylX(0, i < 3 ? 4.6 : 7.2, -1.3 + (i % 3) * 1.3, 0.28 + (i % 2) * 0.12, len, pipeM[i % 3], 10);
  return k.g;
}

/** a flare stack: a lattice-braced column with a flame bulb */
export function flareStack(h = 45): THREE.Group {
  const k = new Kit('lib:flare-stack'), steel = mat(PAL.steel, 0.5, 0.6);
  k.cyl(0, 0, 0, 0.9, h, mat(0xc4c2bc, 0.5, 0.4), 12, 0.7);
  for (let y = 0; y < h - 4; y += 6) for (const a of [0, 2.09, 4.19]) k.beam([Math.cos(a) * 3, y, Math.sin(a) * 3], [Math.cos(a + 2.09) * 3, y + 6, Math.sin(a + 2.09) * 3], 0.1, steel);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 })); fl.position.y = h + 1.2; fl.name = 'flare-flame'; k.g.add(fl);
  return k.g;
}

// ---------- port ----------

/** a block of 40 ft containers: `cols` along local x (12.2 m each), `rows` across (2.44 m, 0.3 m gaps), stacked 1-`tiers` high at random */
export function containerBlock(seed = 1, cols = 4, rows = 6, tiers = 4): THREE.Group {
  const r = seeded(seed), k = new Kit('lib:container-block');
  const colours = [0x9a3b2e, 0x2c5c8a, 0x8a8f94, 0x3f6b3c, 0xc79a2a, 0x6b2f5a, 0xd0d0cc, 0x1f4f6f, 0xb4532a];
  const geo = new THREE.BoxGeometry(12.1, 2.55, 2.4), m4 = new THREE.Matrix4(), col = new THREE.Color();
  const cells: [number, number, number, number][] = [];
  for (let c = 0; c < cols; c++) for (let w = 0; w < rows; w++) { const h = 1 + Math.floor(r() * tiers); for (let t = 0; t < h; t++) cells.push([c, w, t, colours[Math.floor(r() * colours.length)]]); }
  const im = new THREE.InstancedMesh(geo, mat(0xffffff, 0.7, 0.25), cells.length);
  cells.forEach(([c, w, t, cc], i) => { im.setMatrixAt(i, m4.makeTranslation(-(cols - 1) * 6.3 + c * 12.6, 1.3 + t * 2.6, -(rows - 1) * 1.35 + w * 2.7)); im.setColorAt(i, col.setHex(cc)); });
  im.castShadow = im.receiveShadow = true; im.name = 'containers'; k.g.add(im);
  return k.g;
}

/** a ship-to-shore container crane: legs straddling the quay rails (local x along the quay), the boom reaching over the water toward +z */
export function quayCrane(seed = 1): THREE.Group {
  const k = new Kit('lib:quay-crane'), blue = mat(0x2f5f8f, 0.55, 0.45), white = mat(PAL.white, 0.6, 0.3), red = mat(0xb4532a, 0.55, 0.4);
  const span = 30, gauge = 16, H = 42;
  for (const x of [-gauge / 2, gauge / 2]) for (const z of [-span / 2, span / 2 - 6]) { k.slab(x, 0, z, 1.6, H, 1.6, blue); k.slab(x, 0, z, 2.4, 1.2, 3.2, mat(PAL.darkSteel, 0.6, 0.5)); }
  for (const z of [-span / 2, span / 2 - 6]) k.slab(0, H * 0.45, z, gauge + 1.6, 1.4, 1.4, blue);
  k.slab(0, H, -4, gauge + 2.4, 2.4, span + 52, blue);                                           // boom over the quay and the water
  k.slab(0, H + 1.2, 6, 5, 2.4, 6, white);                                                        // machinery house
  k.slab(0, H - 3, 10, 3.2, 2.6, 3.2, mat(PAL.glass, 0.2, 0.3));                                  // trolley cab
  k.slab(0, H + 2.4, -span / 2 - 2, 3, 14, 3, red);                                              // A-frame top
  k.beam([0, H + 16, -span / 2 - 2], [0, H + 1.2, 40], 0.18, mat(PAL.darkSteel, 0.5, 0.6));
  k.beam([0, H + 16, -span / 2 - 2], [0, H + 1.2, -30], 0.18, mat(PAL.darkSteel, 0.5, 0.6));
  return k.g;
}
