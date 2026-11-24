// Elderwood Wilds — the places. Each one is built to read like its shot in the art (layout.ts says which), at the scale
// the art implies, and joined to the rest by trails, rope bridges, stairs or the river.
import * as THREE from 'three/webgpu';
import { atan, color, float, mix, positionWorld, sin, smoothstep, time, uv, vec2 } from 'three/tsl';
import type { TreeSpot } from '../../../../services/vegetation/trees/forest';
import { CF_PLATFORM_OAK, CF_REDWOOD, CYBER_FOREST_TREES } from '../../../../services/vegetation/catalog/cyberForest';
import { PLANT_FOREST_FERN, PLANT_UNDERGROWTH } from '../../../../services/vegetation/catalog/cyberForestPlants';
import type { WildsCtx } from './registry';
import type { WorldTerrain } from './terrain';
import { type Kit, uniformBeat } from './kit';
import { GREAT_FALLS, NEON_FALLS, POOL_FALLS, POOL_STREAM, RIVER, gorgeX, place, placeY, polyNear } from './layout';
import {
  buildBimStoneTower,
  buildNurbsArchBridge,
  buildNurbsKneeBrace,
  buildNurbsPortalFrame,
  buildNurbsVaultRibs,
  buildSubdCarvedConsole,
} from '../../../../playkit/world/canopyArchitecture';

// the hollow's Great Oak deck (elderwood.ts OAK / DECK_R / DECK_Y)
const OAK = { x: 2, z: -36 }, DECK_R = 22, DECK_Y = 12;

export interface PlaceOut {
  trees: TreeSpot[];
  /** Keep scattered trees and plants out of these circles [x, z, r]. */
  clear: number[][];
  models: { file: string; x: number; z: number; yaw: number; h: number; y?: number; length?: number }[];
  /** Spots the moths circle and the light pool lights. */
  glows: THREE.Vector3[];
}

export function buildPlaces(ctx: WildsCtx, T: WorldTerrain, K: Kit): PlaceOut {
  const terrain = T;
  const out: PlaceOut = { trees: [], clear: [], models: [], glows: [] };
  const H = (x: number, z: number) => T.surface(x, z);
  const { kit, B, mats, group, lo } = ctx;
  const beat = uniformBeat(ctx);
  const giant = (x: number, z: number, top: number, species = 5) => {
    const gy = H(x, z), sp = species === 5 ? CF_PLATFORM_OAK : species === 6 ? CF_REDWOOD : CYBER_FOREST_TREES[species];
    // grown species look wrong much past 1.6× (crowns swallow the courts they ring)
    out.trees.push({ x, y: gy - 0.3, z, yaw: x * 0.37 + z, species, scale: Math.min(species < 4 ? 1.6 : species === 6 ? 1.4 : 9, Math.max(0.6, (top - gy) / sp.height)) });
  };
  /** A platform oak through a deck: its crown starts well above the deck, so the deck stays open under the canopy. */
  const deckOak = (x: number, z: number, deckY: number) => {
    const gy = H(x, z), base = CF_PLATFORM_OAK.trunk.crownBase;
    out.trees.push({ x, y: gy - 0.3, z, yaw: x * 0.37 + z, species: 5, scale: Math.max(0.7, (deckY + 7 - gy) / (base * CF_PLATFORM_OAK.height)) });
  };
  const fungus = (species: number, x: number, z: number, h: number, y = H(x, z)) => {
    const h0 = [1.16, 1.48, 3.88, 1.63, 1][species];
    ctx.fungusSpots.push({ x, y: y - 0.08, z, yaw: x * 1.7 + z, species, scale: h / h0 });
  };
  const plant = (species: number, x: number, z: number, s: number, y = H(x, z)) => ctx.plantSpots.push({ x, y: y - 0.05, z, yaw: x + z * 1.3, species, scale: s });
  let seed = 77; const R = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const ringOf = (x: number, z: number, r0: number, r1: number) => { const a = R() * 6.283, d = r0 + R() * (r1 - r0); return [x + Math.sin(a) * d, z + Math.cos(a) * d]; };
  const glowAt = (x: number, y: number, z: number) => out.glows.push(new THREE.Vector3(x, y, z));

  // the village's treehouses (7 round its plaza); the east one takes the canopy bridge from the West Rune Oak side
  const village = place('village');
  const houses = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2 + 0.3; return { x: village.x + Math.sin(a) * 31, z: village.z + Math.cos(a) * 31, a }; });
  const VILLAGE_E = houses[1];
  const canopy = new Map<string, ReturnType<Kit['deck']>>();

  // ═══ the High Canopy: decks and bridges north of the Great Oak, out to the village and the Sunken Ruins ═════════
  {
    type Node = { id: string; x: number; z: number; up: number; r: number; o?: Parameters<Kit['deck']>[4]; fixedY?: number };
    const nodes: Node[] = [
      { id: 'n1', x: 8, z: -120, up: 14, r: 7.5, o: { crenel: true, hut: 2.6 } },
      { id: 'junction', x: 22, z: -200, up: 22, r: 8.5, o: { hut: 0.9, trunkR: 2.4 } },
      { id: 'rune-west', x: -160, z: -150, up: 13, r: 8, o: { rune: 0x7fe0ff, crenel: false } },
      { id: 'rune-east', x: 175, z: -170, up: 13, r: 8, o: { rune: 0x58b4ff } },
      { id: 'mid-west', x: -238, z: -168, up: 14, r: 6.5, o: { crenel: true } },
      { id: 'combat', x: -205, z: -250, up: 12, r: 8.5, o: { square: true, trunk: false, rail: true } },
      { id: 'ct1', x: -238, z: -222, up: 12, r: 5.5, o: { hut: 1.2 } },
      { id: 'ct2', x: -172, z: -286, up: 12, r: 5.5, o: { hut: 4.1 } },
      { id: 'pit-west', x: -138, z: -280, up: 14, r: 6.5, o: { crenel: true } },
      { id: 'pit-tower', x: -92, z: -276, up: 0, r: 5.5, fixedY: 0, o: { trunk: false, crenel: true } },
      { id: 'pit-east', x: -46, z: -268, up: 14, r: 6.5, o: { crenel: true, hut: 1.5 } },
      { id: 'seedpods', x: 118, z: -262, up: 9, r: 4.5, o: { lamp: false } },
    ];
    const N = new Map(nodes.map((n) => [n.id, n]));
    const y = (n: Node) => n.fixedY ?? H(n.x, n.z) + n.up;
    // the pit tower's deck sits level with the rims round it
    N.get('pit-tower')!.fixedY = (H(-138, -280) + H(-46, -268)) / 2 + 14;
    const edges: [string, string, { broken?: boolean; sag?: number }?][] = [
      ['n1', 'junction'], ['junction', 'rune-west'], ['junction', 'rune-east'], ['junction', 'seedpods'], ['junction', 'pit-east'],
      ['rune-west', 'mid-west'], ['rune-west', 'combat'], ['combat', 'ct1'], ['combat', 'ct2'], ['combat', 'pit-west'], ['mid-west', 'ct1'],
      ['pit-west', 'pit-tower', { broken: true }], ['pit-tower', 'pit-east'],
    ];
    const opens = new Map<string, number[]>(nodes.map((n) => [n.id, []]));
    const ang = (a: Node, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);
    for (const [a, b] of edges) { opens.get(a)!.push(ang(N.get(a)!, N.get(b)!)); opens.get(b)!.push(ang(N.get(b)!, N.get(a)!)); }
    // from the Great Oak's deck north to the first platform
    const n1 = N.get('n1')!;
    opens.get('n1')!.push(ang(n1, OAK));
    // stairs down to the forest floor from these decks (angle of the flight's top)
    const stairs: [string, number, 'stone' | 'wood'][] = [['n1', 1.9, 'stone'], ['junction', -2.2, 'wood'], ['rune-west', 2.6, 'wood'], ['rune-east', -0.6, 'wood'], ['combat', 0.785 + Math.PI, 'wood'], ['pit-east', 2.4, 'stone'], ['seedpods', 0.4, 'wood']];
    for (const [id, a] of stairs) opens.get(id)!.push(a);
    opens.get('mid-west')!.push(ang(N.get('mid-west')!, VILLAGE_E));
    const decks = canopy;
    for (const n of nodes) {
      const dy = y(n);
      decks.set(n.id, K.deck(n.x, n.z, dy, n.r, { ...n.o, open: opens.get(n.id) }));
      if (n.o?.trunk !== false) deckOak(n.x, n.z, dy);
      out.clear.push([n.x, n.z, n.r + 4]);
      glowAt(n.x, dy + 1.5, n.z);
    }
    for (const [a, b, o] of edges) K.link(decks.get(a)!, decks.get(b)!, o ?? {});
    {
      const d = decks.get('n1')!, a0 = Math.atan2(d.x - OAK.x, d.z - OAK.z);
      K.bridge({ x: OAK.x + Math.sin(a0) * (DECK_R - 0.2), y: DECK_Y, z: OAK.z + Math.cos(a0) * (DECK_R - 0.2) }, d.rim(ang(n1, OAK)));
    }
    for (const [id, a, kind] of stairs) stairDown(decks.get(id)!, a, kind === 'stone' ? mats.stone : mats.wood);
    // the pit tower: an old stone tower rising from the ruins below, its top is the deck
    {
      const t = N.get('pit-tower')!, ty = y(t), gy = H(t.x, t.z);
      kit.prism(mats.stone, 8, 5.2, 6.2, ty - gy - 0.4, t.x, gy - 1, t.z, Math.PI / 8, { tpm: 0.4 });
      for (let k = 0; k < 6; k++) { const a = k * 1.05, r = 6 + R() * 3; K.ruinWall(t.x + Math.sin(a) * r * 2.2, t.z + Math.cos(a) * r * 1.4, a, 6 + R() * 6, 3 + R() * 5, k); }
      K.rocks(t.x, t.z, 14, 26, [0.8, 2.4], 11);
      out.clear.push([t.x, t.z, 34]);
      for (let k = 0; k < 6; k++) { const [x, z] = ringOf(t.x, t.z, 8, 24); K.pillar(x, z, 2 + R() * 6, 0.8); }
      // a way back up out of the pit: a broken stair up its west wall
      const sx = -122, sz = -292, sy = H(sx, sz);
      B.flight(mats.stone, sx + 14, H(sx + 14, sz), sz, -Math.PI / 2, sy + 0.5, 3, 0.3, 0.4);
    }
    // seedpods: vines over the lookout hung with glowing pods (eh-11) — instanced via K.batcher (1 draw call)
    {
      const s = N.get('seedpods')!, sy = y(s);
      const podGeo = new THREE.SphereGeometry(0.28, 10, 8);
      for (let k = 0; k < 14; k++) {
        const a = R() * 6.283, r = 1 + R() * 6, px = s.x + Math.sin(a) * r, pz = s.z + Math.cos(a) * r, top = sy + 9 + R() * 4, len = 2 + R() * 5;
        ctx.plantSpots.push({ x: px, y: top, z: pz, yaw: R() * 6.28, species: 3, scale: len / 5 });
        K.batcher.addTRS('wilds-seedpods', podGeo, K.mats.goldGlow, px, top - len - 0.3, pz, 0, 0, 0, 1, 1.7, 1, { castShadow: false, receiveShadow: false, name: 'wilds-seedpods:instanced' });
      }
      K.lamp(s.x + 1.5, sy + 2.2, s.z, 0xffd27a, 18);
    }
  }

  // ═══ Treehouse Village: the round rune plaza in the canopy, treehouses round it (Treehouse_village, elderwood-hollow) ══
  {
    const v = village, vy = H(v.x, v.z) + 14;
    const mw = canopy.get('mid-west')!;
    const plazaOpen = houses.map((h) => Math.atan2(h.x - v.x, h.z - v.z));
    const plaza = K.deck(v.x, v.z, vy, 16, { sides: 24, trunk: false, open: [...plazaOpen, 2.35], rune: null, lamp: false });
    K.runeCircle(v.x, vy, v.z, 8.5, 0xc8ff9a); K.ring(v.x, vy, v.z, 11.2, 11.6, K.mats.goldGlow);
    const hd = houses.map((h, k) => {
      const toP = Math.atan2(v.x - h.x, v.z - h.z), next = houses[(k + 1) % houses.length];
      const op = [toP, Math.atan2(next.x - h.x, next.z - h.z), Math.atan2(houses[(k + 6) % 7].x - h.x, houses[(k + 6) % 7].z - h.z)];
      if (h === VILLAGE_E) op.push(Math.atan2(mw.x - h.x, mw.z - h.z));
      const d = K.deck(h.x, h.z, vy + (k % 3) * 1.5, 6.5, { open: op, hut: toP + Math.PI, trunkR: 2.2 });
      deckOak(h.x, h.z, vy + (k % 3) * 1.5);
      ctx.fungusSpots.push({ x: h.x + 2, y: vy + (k % 3) * 1.5 + 4, z: h.z + 2.2, yaw: 0.5, species: 4, scale: 1.6 });
      return d;
    });
    hd.forEach((d, k) => { K.link(plaza, d, { sag: 0.6 }); if (k % 2 === 0) K.link(d, hd[(k + 1) % hd.length]); });
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283; K.lamp(v.x + Math.sin(a) * 14.5, vy + 1.6, v.z + Math.cos(a) * 14.5, 0xffc070, 14); }
    stairDown(plaza, 2.35, mats.wood);
    // the canopy route from the West Rune Oak arrives at the village's east treehouse
    const east = hd[1];
    K.link(mw, east, { sag: 1.2 });
    out.clear.push([v.x, v.z, 44]);
    glowAt(v.x, vy + 1, v.z);
    for (let k = 0; k < 30; k++) { const [x, z] = ringOf(v.x, v.z, 18, 46); fungus(k % 2, x, z, 1 + R() * 1.6); }
  }

  // ═══ the Settlement: walk-in CAD/BIM stone tower houses, treehouses, bridges, cable path, crystals ═══════════════
  {
    const s = place('settlement'), sy = placeY(s);
    const towers = [[-14, -10, 8, 18, 0.2], [10, -16, 7, 22, -0.3], [16, 10, 9, 14, 0.5]] as const;
    for (const [dx, dz, w, h, yaw] of towers) {
      const x = s.x + dx, z = s.z + dz;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), sxv = Math.cos(yaw), szv = -Math.sin(yaw);
      // Real multi-story walk-in CAD/BIM Stone Tower (bimTo3D walls/entry/recessed windows + SubD battlements + NURBS balcony braces)
      const built = buildBimStoneTower({ widthM: w, heightM: h, balconyHeightM: 8, lowTier: lo });
      for (const g of built.stoneGeos) { kit.place(g, x, sy - 0.3, z, yaw); kit.add(mats.stone, g, { tpm: 0.42 }); }
      for (const g of built.timberGeos) { kit.place(g, x, sy - 0.3, z, yaw); kit.add(mats.darkWood, g, { tpm: 0.5 }); }
      for (const g of built.windowGlowGeos) { kit.place(g, x, sy - 0.3, z, yaw); kit.add(K.mats.amberGlow, g, { solid: false, shadow: false }); }
      for (const g of built.metalGeos) { kit.place(g, x, sy - 0.3, z, yaw); kit.add(K.mats.metal, g, { solid: false, shadow: false }); }
      K.hut(x, sy + h + 0.05, z, yaw, w * 0.68, w * 0.58, 3.2);
      B.steelStair(K.mats.metal, x - sxv * (w / 2 + 1) - fx * (w / 2 - 0.5), sy, z - szv * (w / 2 + 1) - fz * (w / 2 - 0.5), yaw, sy + 7.8, 1.4);
      K.lamp(x + fx * (w / 2 + 0.8), sy + 3.4, z + fz * (w / 2 + 0.8));
      K.lights.push({ x, y: sy + 2.4, z, c: 0xffa850, i: 18, d: 12 });
      K.giProbes.push({ x, y: sy + 2.2, z, kind: 'interior' });
    }
    const t1 = K.deck(s.x - 26, s.z + 18, sy + 10, 5.5, { hut: 0.8, open: [0.6, 2.4] });
    const t2 = K.deck(s.x + 30, s.z - 26, sy + 12, 5.5, { hut: 2.9, open: [-1.6, 2.6] });
    deckOak(s.x - 26, s.z + 18, sy + 10); deckOak(s.x + 30, s.z - 26, sy + 12);
    K.bridge(t1.rim(0.6), { x: s.x - 14 + 3, y: sy + 18, z: s.z - 10 + 3 });
    K.bridge(t2.rim(-1.6), { x: s.x + 10 + 3.5, y: sy + 22.2, z: s.z - 16 - 2 });
    stairDown(t1, 2.4, mats.wood); stairDown(t2, 2.6, mats.wood);
    for (let k = 0; k < 7; k++) { const [x, z] = ringOf(s.x, s.z, 14, 30); K.crystal(x, z, 1.4 + R() * 1.6, H(x, z), k + 3); }
    K.crates(s.x - 4, s.z + 4, 0.4, 4, sy); K.crates(s.x + 4, s.z - 2, 1.2, 3, sy);
    out.clear.push([s.x, s.z, 36]);
    glowAt(s.x, sy + 2, s.z);
  }

  // ═══ Glowcap Hollow: giant mushrooms round a sunken clearing ringed with circuit lines, stairs and arches ══════════
  {
    const g = place('glowcap-hollow'), gy = placeY(g);
    const fy = H(g.x, g.z);
    K.ring(g.x, fy, g.z, 13.5, 14.0, K.mats.goldGlow); K.ring(g.x, fy, g.z, 16.2, 16.5);
    for (let k = 0; k < 6; k++) K.circuit(g.x + Math.sin(k * 1.047) * 8, fy, g.z + Math.cos(k * 1.047) * 8, 9, 12, k * 1.047, k % 2 ? 0x2ae6ff : 0xffc864, 30 + k);
    for (const a of [0.4, 2.6, 4.4]) { const r = 25, x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r; K.arch(x, z, a + Math.PI / 2, 4.2, 4.5, { pointed: true, broken: a > 4 ? 3 : 0 }); }
    for (const a of [1.5, 5.4]) { const x = g.x + Math.sin(a) * 17, z = g.z + Math.cos(a) * 17; B.flight(mats.stone, x + Math.sin(a) * 9, H(x + Math.sin(a) * 9, z + Math.cos(a) * 9), z + Math.cos(a) * 9, a + Math.PI, fy + 0.02, 4, 0.25, 0.42, false); void gy; }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283 + 0.2, r = 24 + R() * 10; fungus(2, g.x + Math.sin(a) * r, g.z + Math.cos(a) * r, 8 + R() * 6); }
    for (let k = 0; k < 40; k++) { const [x, z] = ringOf(g.x, g.z, 15, 40); fungus(k % 3 === 0 ? 1 : 0, x, z, 1 + R() * 1.4); }
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3; K.pillar(g.x + Math.sin(a) * 20, g.z + Math.cos(a) * 20, 1.5 + R() * 3, 0.55); }
    out.models.push({ file: 'mushroom_cluster.glb', x: g.x + 12, z: g.z - 20, yaw: 1, h: 5 }, { file: 'mushroom_cluster.glb', x: g.x - 22, z: g.z + 6, yaw: 2.2, h: 6 });
    out.clear.push([g.x, g.z, 30]);
    glowAt(g.x, fy + 2, g.z);
  }

  // ═══ the Titan Tree: a hollow trunk across the escarpment, the bunker rings and spiral ramp inside ════════════════
  titanTree();

  // ═══ the river: Glowcap Stream's ravine, the Digital Bridge, falls ══════════════════════════════════════════════
  {
    const s = place('glowcap-stream');
    for (let k = 0; k < 16; k++) {
      const z = 90 + k * 10 + R() * 4, n = polyNear(RIVER, 250, z), rp = riverAt(z);
      for (const side of [-1, 1]) if (R() < 0.7) { const d = 9 + R() * 8; fungus(2, rp.x + side * d, z, 4 + R() * 6); }
      if (R() < 0.6) fungus(1, rp.x + (R() - 0.5) * 18, z, 1.3 + R());
      void n;
    }
    // the old pipes along the east ledge (the art's half-buried machinery), cyan bands glowing
    const pts: THREE.Vector3[] = [];
    for (let z = 96; z <= 250; z += 8) { const rp = riverAt(z); const x = rp.x + 6.5; pts.push(new THREE.Vector3(x, H(x, z) + 0.45, z)); }
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.55, 10), K.mats.metal);
    pipe.castShadow = !lo; pipe.receiveShadow = true; group.add(pipe);
    for (let k = 1; k < pts.length - 1; k += 2) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 16), K.mats.cyanGlow); b.position.copy(pts[k]); b.lookAt(pts[k + 1]); group.add(b); }
    for (let z = 100; z < 240; z += 14) { const rp = riverAt(z); K.rocks(rp.x, z, 3, 3, [0.5, 1.3], z); }
    glowAt(s.x, H(s.x, s.z) + 2, s.z);
  }
  {
    // the Digital Bridge: sculpted twin-arch NURBS stone span over the river with SubD pier capital & cyan conduit rails
    const b = place('digital-bridge'), n = polyNear(RIVER, b.x, b.z), a = RIVER[n.i], c = RIVER[n.i + 1];
    const flow = Math.atan2(c[0] - a[0], c[1] - a[1]), across = flow + Math.PI / 2, L = 34;
    const y = Math.max(H(b.x + Math.sin(across) * L / 2, b.z + Math.cos(across) * L / 2), H(b.x - Math.sin(across) * L / 2, b.z - Math.cos(across) * L / 2)) + 0.3;
    const pierH = Math.max(5, y - H(b.x, b.z) + 2);
    const bridgeBuilt = buildNurbsArchBridge({ lengthM: L, widthM: 5.4, pierHeightM: pierH, lowTier: lo });
    for (const g of bridgeBuilt.stoneGeos) { kit.place(g, b.x, y, b.z, across); kit.add(mats.stone, g, { tpm: 0.42 }); }
    for (const g of bridgeBuilt.glowGeos) { kit.place(g, b.x, y, b.z, across); kit.add(K.mats.cyanGlow, g, { solid: false, shadow: false }); }
    for (const g of bridgeBuilt.metalGeos) { kit.place(g, b.x, y, b.z, across); kit.add(K.mats.metal, g, { solid: false, shadow: false }); }
    for (const s of [-1, 1]) {
      const ox = Math.cos(across) * s * 2.45, oz = -Math.sin(across) * s * 2.45;
      kit.box(B.invisible, 0.3, 1.2, L, b.x + ox, y + 0.6, b.z + oz, across, { shadow: false });
    }
    K.lights.push({ x: b.x, y: y + 1.8, z: b.z, c: 0x2ae6ff, i: 22, d: 18 });
    out.clear.push([b.x, b.z, 18]);
  }
  // the falls: Neon Falls (Highland rim), the Great Falls (head of the Gorge), the pool stream into the Gorge
  for (const [pts, f, w] of [[RIVER, NEON_FALLS, 10], [RIVER, GREAT_FALLS, 12], [POOL_STREAM, POOL_FALLS, 4]] as const) {
    const a = pts[f.lip], b = pts[f.foot];
    K.waterfall({ x: a[0], y: a[2] + 0.9, z: a[1] }, { x: b[0], y: b[2] + 0.7, z: b[1] }, w);
  }

  // ═══ the Gorge: Zone 05 Outpost on the rim, Sniper Nest Z-06, the arena on the floor, the vaults behind the falls ═══
  gorge();
  // ═══ the vale: the Mangrove Mire's boardwalks ══════════════════════════════════════════════════════════════════
  mire();
  // ═══ the Redwood Ruins ═════════════════════════════════════════════════════════════════════════════════════════
  ruins();

  return out;

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function riverAt(z: number) { // the river's centre x at z (searching its polyline)
    for (let i = 0; i < RIVER.length - 1; i++) { const a = RIVER[i], b = RIVER[i + 1]; if ((z - a[1]) * (z - b[1]) <= 0 && a[1] !== b[1]) { const t = (z - a[1]) / (b[1] - a[1]); return { x: a[0] + (b[0] - a[0]) * t, y: a[2] + (b[2] - a[2]) * t }; } }
    return { x: RIVER[0][0], y: RIVER[0][2] };
  }

  /** A straight flight from the forest floor up to a deck's rim at angle a (the deck must be open there). */
  function stairDown(d: { x: number; y: number; z: number; rim: (a: number, i?: number) => { x: number; z: number } }, a: number, mat: THREE.Material) {
    const p = d.rim(a, 0.25), ux = Math.sin(a), uz = Math.cos(a);
    let L = (d.y - H(p.x, p.z)) / 0.6;
    for (let k = 0; k < 2; k++) L = Math.max(2, (d.y - H(p.x + ux * L, p.z + uz * L)) / 0.6);
    const sx = p.x + ux * L, sz = p.z + uz * L, sy = H(sx, sz);
    B.flight(mat, sx, sy - 0.15, sz, a + Math.PI, d.y, 2.6, 0.26, (L / Math.max(1, Math.round((d.y - sy) / 0.26))), true);
    out.clear.push([(sx + p.x) / 2, (sz + p.z) / 2, L / 2 + 3]);
  }

  /** A cylinder shell of bark with door/window gaps (radians round, heights), seen from inside and out. */
  function shell(x: number, z: number, r: number, y0: number, y1: number, gaps: { a: number; w: number; y0: number; y1: number }[]) {
    const rad = lo ? 40 : 64, hs = Math.ceil((y1 - y0) / 2.2), pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let j = 0; j <= hs; j++) for (let i = 0; i <= rad; i++) {
      const a = (i / rad) * Math.PI * 2, yy = y0 + ((y1 - y0) * j) / hs;
      const rr = r * (1 + 0.035 * Math.sin(a * 7 + yy * 0.2) + 0.025 * Math.sin(a * 17 - yy * 0.5)) * (1 + 0.25 * Math.max(0, 1 - (yy - y0) / 10));
      pos.push(x + Math.sin(a) * rr, yy, z + Math.cos(a) * rr); uvs.push((i / rad) * r * 2.2, (yy - y0) * 0.35);
    }
    const cut = (a: number, yy: number) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a))) < g.w && yy > g.y0 && yy < g.y1);
    for (let j = 0; j < hs; j++) for (let i = 0; i < rad; i++) {
      const a = ((i + 0.5) / rad) * Math.PI * 2, yy = y0 + ((y1 - y0) * (j + 0.5)) / hs;
      if (cut(a, yy)) continue;
      const k = i + j * (rad + 1); idx.push(k, k + 1, k + rad + 1, k + 1, k + rad + 2, k + rad + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const bm = mats.bark as THREE.MeshStandardNodeMaterial;
    const m = new THREE.MeshStandardNodeMaterial({ map: bm.map, normalMap: bm.normalMap, roughness: 0.92, color: 0x8d8a84, side: THREE.DoubleSide });
    m.emissiveNode = bm.emissiveNode;
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = !lo; mesh.receiveShadow = true; group.add(mesh);
    // collision: wall segments round the ring, skipping the gaps
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      const runs: [number, number][] = []; let s0 = y0;
      for (const g2 of gaps.filter((g3) => Math.abs(Math.atan2(Math.sin(a - g3.a), Math.cos(a - g3.a))) < g3.w).sort((p, q) => p.y0 - q.y0)) { if (g2.y0 > s0) runs.push([s0, g2.y0]); s0 = Math.max(s0, g2.y1); }
      if (s0 < y1) runs.push([s0, y1]);
      for (const [ya, yb] of runs) kit.box(B.invisible, (2 * Math.PI * r) / segs + 0.3, yb - ya, 1.2, x + Math.sin(a) * (r + 0.4), (ya + yb) / 2, z + Math.cos(a) * (r + 0.4), a + Math.PI / 2, { shadow: false });
    }
  }

  function titanTree() {
    const t = place('titan'), R0 = 13;
    const north = { x: t.x, z: t.z - R0 - 3 }, south = { x: t.x, z: t.z + R0 + 3 };
    const yTop = H(north.x, north.z), yBot = H(south.x, south.z);
    const yCrown = yTop + 34;
    shell(t.x, t.z, R0, yBot - 3, yCrown, [
      { a: Math.PI, w: 0.2, y0: yTop - 0.5, y1: yTop + 4.2 },     // the plateau door (north)
      { a: 0, w: 0.2, y0: yBot - 0.5, y1: yBot + 4.6 },           // the vale door (south)
      { a: 0.5, w: 0.08, y0: yBot + 18, y1: yBot + 21 },          // windows over the vale and the falls
      { a: -0.6, w: 0.08, y0: yTop + 6, y1: yTop + 9 },
      { a: 1.9, w: 0.07, y0: yTop + 16, y1: yTop + 19 },
      { a: 0.1, w: 0.1, y0: yTop + 22, y1: yTop + 26 },           // the top balcony's opening
    ]);
    // the crown: a great oak's crown grown on top, and the trunk's buttress roots on the vale side
    out.trees.push({ x: t.x, y: yCrown - 62 * 0.42, z: t.z, yaw: 0.3, species: 4, scale: 0.85 });
    // inside: the floor in the vale, a spiral ramp up the wall, bunker rings at the plateau door and above
    K.discPave(t.x, t.z, R0 - 0.2, yBot, 40);
    const r0 = R0 - 4.2, r1 = R0 - 0.6, turnRise = 9, turns = (yTop + 24 - yBot) / turnRise, segN = Math.ceil(turns * 28);
    for (let i = 0; i < segN; i++) {
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2, yy0 = yBot + (i / 28) * turnRise, yy1 = yBot + ((i + 1) / 28) * turnRise;
      const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, len = (a1 - a0) * rm + 0.15;
      kit.box(mats.wood, r1 - r0, 0.3, len, t.x + Math.sin(am) * rm, (yy0 + yy1) / 2 - 0.15, t.z + Math.cos(am) * rm, am + Math.PI / 2, { tpm: 0.6, rx: -Math.atan2(yy1 - yy0, len) });
      kit.box(mats.darkWood, 0.15, 1.0, len, t.x + Math.sin(am) * (r0 + 0.1), (yy0 + yy1) / 2 + 0.5, t.z + Math.cos(am) * (r0 + 0.1), am + Math.PI / 2, { tpm: 1, rx: -Math.atan2(yy1 - yy0, len) });
      if (i % 3 === 0) kit.box(mats.darkWood, 0.18, 1.1, 0.18, t.x + Math.sin(a0) * (r0 + 0.1), yy0 + 0.55, t.z + Math.cos(a0) * (r0 + 0.1), a0, { tpm: 1 });
    }
    const consoleGeo = buildSubdCarvedConsole(1.45, 1.05, 0.78, lo);
    const innerBrace = buildNurbsKneeBrace({ spanM: 3.4, riseM: 3.2, widthM: 0.28, depthM: 0.34, lowTier: lo });
    for (const [ry, label] of [[yTop, 'BUNKER'], [yTop + 12, 'COMMS'], [yTop + 24, 'LOOKOUT']] as const) {
      // an annulus floor at the door level, open in the middle (the void with the glowing conduits)
      const ring: [number, number][] = [], hole: [number, number][] = [];
      for (let k = 0; k < 40; k++) { const a = (k / 40) * 6.283; ring.push([t.x + Math.sin(a) * (R0 - 0.3), t.z + Math.cos(a) * (R0 - 0.3)]); }
      for (let k = 39; k >= 0; k--) { const a = (k / 40) * 6.283; hole.push([t.x + Math.sin(a) * 4.5, t.z + Math.cos(a) * 4.5]); }
      const d = polyRing(ring, hole, ry);
      void d;
      // Curved NURBS timber ribs supporting each hollow annulus ring from the inner bark wall
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const br = innerBrace.clone();
        kit.place(br, t.x + Math.sin(a) * (R0 - 0.6), ry - 3.3, t.z + Math.cos(a) * (R0 - 0.6), a + Math.PI);
        kit.add(mats.darkWood, br, { tpm: 0.55, solid: false });
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.PI + 0.9 + k * 0.5, px = t.x + Math.sin(a) * (R0 - 2), pz = t.z + Math.cos(a) * (R0 - 2);
        K.screen(px, ry + 1.6, pz, a + Math.PI, 1.6, 0.9, [label, `NODE ${k + 1}`, 'SIGNAL OK'], '#5dff9c');
        const cg = consoleGeo.clone();
        kit.place(cg, px, ry, pz, a + Math.PI);
        kit.add(K.mats.metal, cg, { tpm: 0.8 });
      }
      K.sandbags(t.x + Math.sin(-2.2) * (R0 - 2.5), t.z + Math.cos(-2.2) * (R0 - 2.5), -2.2 + Math.PI / 2, 4, ry);
      K.crates(t.x + Math.sin(-1.4) * (R0 - 2.5), t.z + Math.cos(-1.4) * (R0 - 2.5), -1.4, 3, ry);
      K.lamp(t.x + Math.sin(2.4) * (R0 - 1), ry + 3.2, t.z + Math.cos(2.4) * (R0 - 1), 0xc8ffb0, 18);
      // a rail round the void
      for (let k = 0; k < 24; k++) { const a = ((k + 0.5) / 24) * 6.283; kit.box(B.invisible, 1.3, 1.1, 0.2, t.x + Math.sin(a) * 4.6, ry + 0.55, t.z + Math.cos(a) * 4.6, a + Math.PI / 2, { shadow: false }); kit.box(mats.darkWood, 0.12, 1.0, 1.2, t.x + Math.sin(a) * 4.6, ry + 0.5, t.z + Math.cos(a) * 4.6, a, { solid: false }); }
    }
    // the green conduits up the middle (the bunker interior's glowing tubes)
    const green = new THREE.MeshStandardNodeMaterial({ color: 0x0a1a0c, roughness: 0.3, transparent: true, opacity: 0.85 });
    green.emissiveNode = color(0x5dff7a).mul(float(0.9).add(sin(time.mul(2).add(positionWorld.y.mul(0.4))).mul(0.3)).add(beat.mul(0.5)));
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, yCrown - yBot - 4, 10), green); c.position.set(t.x + Math.sin(a) * 2.2, (yCrown + yBot) / 2, t.z + Math.cos(a) * 2.2); group.add(c); }
    K.bridge({ x: north.x, y: yTop + 0.05, z: north.z - 6 }, { x: north.x, y: yTop + 0.05, z: north.z + 1 }, { width: 3, sag: 0 });
    K.lookVolumes.push({ id: 'titan-tree-bunker', name: 'Titan Tree Hollow', center: [t.x, yTop + 8, t.z], radiusM: R0 + 1, featherM: 6, preset: 'titan-bunker' });
    out.clear.push([t.x, t.z, R0 + 8]);
    glowAt(t.x, yTop + 2, t.z);
  }

  /** An annulus deck (solid) at y. */
  function polyRing(outer: [number, number][], hole: [number, number][], y: number) {
    const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, z))); s.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(Math.PI / 2); g.translate(0, y, 0);
    kit.add(mats.wood, g, { tpm: 0.4 });
    return g;
  }

  function gorge() {
    // ── Zone 05 Outpost: a balcony hung on the Gorge's east rim beside the falls, over the vale ──
    const o = place('overlook'), oy = placeY(o);
    const bx = o.x - 9, bz = o.z;                               // the balcony's centre, out over the rim
    kit.box(K.mats.metal, 12, 0.35, 9, bx, oy - 0.18, bz, 0, { tpm: 0.5 });
    kit.box(mats.darkWood, 14, 0.25, 11, o.x + 2, oy - 0.1, o.z, 0, { tpm: 0.5 });
    for (const [dx, dz, w, d] of [[-6, 0, 0.2, 9], [0, -4.5, 12, 0.2], [0, 4.5, 12, 0.2]] as const) {
      kit.box(mats.darkWood, Math.max(w, 0.15), 1.1, Math.max(d, 0.15), bx + dx, oy + 0.55, bz + dz, 0, { tpm: 0.8 });
    }
    const cliffBrace = buildNurbsKneeBrace({ spanM: 5.2, riseM: 7.5, widthM: 0.34, depthM: 0.42, lowTier: lo });
    for (let k = 0; k < 4; k++) {
      const z = bz - 4 + k * 2.6;
      const g = cliffBrace.clone();
      kit.place(g, o.x - 3.6, oy - 7.8, z, -Math.PI / 2);
      kit.add(K.mats.metal, g, { tpm: 0.5, solid: false });
    }
    kit.box(mats.darkWood, 0.4, 4.2, 9, o.x + 6, oy + 2.1, o.z, 0, { tpm: 0.6 });   // the shelter's back wall
    kit.box(mats.wood, 6, 0.25, 10, o.x + 3.4, oy + 4.3, o.z, 0, { tpm: 0.6, rz: 0.18 });
    K.screen(o.x + 5.6, oy + 2.3, o.z - 1.5, -Math.PI / 2, 3, 1.7, ['ZONE 05 OUTPOST', 'PERIMETER 98%', 'FALLS SECTOR'], '#46e8ff');
    K.screen(o.x + 5.6, oy + 2.0, o.z + 2.2, -Math.PI / 2, 1.6, 1.2, ['RADAR', 'SWEEP'], '#46e8ff');
    K.crates(o.x + 3.5, o.z + 3.5, 0, 3, oy); K.crates(o.x + 4.5, o.z - 3.8, 0.4, 2, oy);
    K.lamp(bx - 5.5, oy + 1.4, bz - 4.3, 0xffb050, 16); K.lamp(bx - 5.5, oy + 1.4, bz + 4.3, 0xffb050, 16); K.lamp(o.x + 5.5, oy + 3.6, o.z, 0xffc070, 20);
    // the cliff spring beside it, falling over the Crystal Vault's mouth
    K.waterfall({ x: 251, y: oy - 1.5, z: 356 }, { x: 243, y: H(243, 356) + 0.5, z: 356 }, 7);
    out.clear.push([o.x, o.z, 14]);
    glowAt(bx, oy + 1, bz);

    // ── Sniper Nest Z-06: a deck high in a rim tree, a rope bridge to the rim deck, a scaffold stair down the wall ──
    const s = place('sniper'), sy = H(s.x, s.z) + 20;
    const rimX = gorgeX(446) - 40, rimDeck = K.deck(rimX, 446, H(rimX, 446) + 2.5, 5, { trunk: false, open: [Math.PI / 2 + 0.1, -Math.PI / 2 - 0.3, 0.2], lamp: true });
    const nest = K.deck(s.x, s.z, sy, 6, { open: [Math.atan2(rimDeck.x - s.x, rimDeck.z - s.z), -2.4], trunkR: 1.8, lamp: false });
    deckOak(s.x, s.z, sy + 3.5);
    K.link(nest, rimDeck, { sag: 1.6 });
    stairDown(nest, -2.4, mats.wood);
    const ny = sy;
    K.sandbags(s.x + 3.8, s.z + 1.5, 1.2, 3.5, ny); K.sandbags(s.x + 1.5, s.z + 4.2, -0.4, 3, ny);
    K.crates(s.x - 2.5, s.z + 3, 0.3, 3, ny);
    K.screen(s.x - 1.5, ny + 2.6, s.z - 3.8, 0.4, 2.4, 0.8, ['Z-06 / OVERLOOK', 'WIND 2.1 m/s'], '#ffb347');
    K.screen(s.x + 2.8, ny + 1.6, s.z - 2.4, -0.6, 1.2, 0.8, ['SCOPE', 'RNG 112m'], '#46e8ff');
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) kit.box(K.mats.metal, 0.15, 3.2, 0.15, s.x + dx, ny + 1.6, s.z + dz, 0, {});
    kit.box(K.mats.canvasMat, 8, 0.15, 8, s.x, ny + 3.25, s.z, 0, { solid: false, rx: 0.1 });
    K.lamp(s.x - 3, ny + 2.8, s.z - 3, 0xffb050, 14);
    // the scaffold stair down the Gorge's west wall to its floor (flights of 4 m, switching back)
    {
      const x0 = rimX + 6, z0 = 452, top = H(rimX, 446) + 2.5;
      let yy = top, dir = 1, zz = z0 - 6, k = 0;
      const floor = H(gorgeX(470) - 18, 470);
      while (yy - 4 > floor && k < 14) {
        const xx = x0 + 2 + k * 0.9;
        B.steelStair(K.mats.metal, xx, yy - 4, zz + (dir > 0 ? 0 : 7.5), dir > 0 ? 0 : Math.PI, yy, 1.6);
        kit.box(K.mats.metal, 2.2, 0.15, 2.2, xx, yy - 4, zz + (dir > 0 ? -1 : 8.5), 0, {});
        yy -= 4; dir = -dir; k++;
        if (k === 1) kit.box(K.mats.metal, 6, 0.15, 2.2, x0 - 1, top, z0 - 6.5, 0, {});
      }
    }
    glowAt(s.x, ny + 1.5, s.z);

    // ── the Gorge Arena: a ring of light on a raised stone floor between the falls ──
    const a = place('gorge-arena'), ay = H(a.x, a.z) + 1.4;
    kit.prism(mats.stone, 36, 14, 15.5, ay - H(a.x, a.z) + 2, a.x, H(a.x, a.z) - 2, a.z, 0, { tpm: 0.3 });
    K.ring(a.x, ay, a.z, 12.6, 13.4); K.ring(a.x, ay, a.z, 9.4, 9.9, K.mats.amberGlow); K.ring(a.x, ay, a.z, 5.8, 6.2, K.mats.violetGlow);
    K.runeCircle(a.x, ay, a.z, 4.6, 0xffd8a0);
    for (let k = 0; k < 4; k++) {
      const an = k * Math.PI / 2 + Math.PI / 4;
      K.circuit(a.x + Math.sin(an) * 9, ay, a.z + Math.cos(an) * 9, 4, 6, an, 0x2ae6ff, 50 + k);
      const px = a.x + Math.sin(an) * 14.2, pz = a.z + Math.cos(an) * 14.2;
      kit.box(mats.stone, 1.2, 4.5, 1.2, px, ay + 2.25, pz, an, { tpm: 0.6 });
      kit.box(K.mats.cyanGlow, 0.3, 3.6, 0.3, px - Math.sin(an) * 0.65, ay + 2.4, pz - Math.cos(an) * 0.65, an, { solid: false });
    }
    for (const an of [0, Math.PI]) B.flight(mats.stone, a.x + Math.sin(an) * 19, H(a.x + Math.sin(an) * 19, a.z + Math.cos(an) * 19), a.z + Math.cos(an) * 19, an + Math.PI, ay, 4, 0.25, 0.42);
    // side falls on both walls (the sniper shots' twin cascades)
    for (const [fx, fz, w] of [[gorgeX(500) + 37, 500, 6], [gorgeX(520) - 37, 520, 5]] as const) {
      const side = fx > gorgeX(fz) ? 1 : -1;
      K.waterfall({ x: fx + side * 4, y: H(fx + side * 6, fz) - 0.5, z: fz }, { x: fx - side * 6, y: H(fx - side * 6, fz) + 0.3, z: fz }, w);
    }
    out.clear.push([a.x, a.z, 22]);
    glowAt(a.x, ay + 2, a.z);

    vaults();
  }

  function vaults() {
    // ── the Crystal Vault: the cave behind the cliff spring, crystals and an armoury; the Rift Vault beyond ──
    const FY = -45.5;
    const rockWall = (x: number, z: number, w: number, d: number, h: number, yaw = 0) => kit.box(mats.rock, w, h, d, x, FY + h / 2 - 0.4, z, yaw, { tpm: 0.25 });
    // the mouth tunnel (x 243→257, z 354), 6 m wide, 6 m high
    const mouthFloor = H(241, 354);
    {
      const run = 14, x0 = 243;
      const g = new THREE.BoxGeometry(run, 0.6, 6); kit.place(g, x0 + run / 2, (mouthFloor + FY) / 2 - 0.3, 354, 0, 0, Math.atan2(FY - mouthFloor, run)); kit.add(mats.stone, g, { tpm: 0.4 });
      for (const s of [-1, 1]) rockWall(x0 + run / 2, 354 + s * 3.6, run, 1.6, 9);
      kit.box(mats.rock, run, 2, 9, x0 + run / 2, FY + 7.2, 354, 0, { tpm: 0.25 });
    }
    // the hall: 22 × 16, 8 m high — vaulted with swept NURBS cavern ribs & SubD boss keystones!
    const cx = 268, cz = 354;
    kit.box(mats.stone, 22, 0.6, 16, cx, FY - 0.3, cz, 0, { tpm: 0.35 });
    kit.box(mats.rock, 24, 2, 18, cx, FY + 9, cz, 0, { tpm: 0.25 });
    rockWall(cx + 11.8, cz, 1.6, 18, 9); rockWall(cx, cz + 8.8, 24, 1.6, 9);
    rockWall(cx - 11.8, cz + 5.5, 1.6, 7, 9); rockWall(cx - 11.8, cz - 5.5, 1.6, 7, 9);
    rockWall(cx - 6, cz - 8.8, 12, 1.6, 9); rockWall(cx + 8, cz - 8.8, 8, 1.6, 9);   // a gap north to the Rift Vault corridor
    const crystalRibs = buildNurbsVaultRibs({ spanWidthM: 21, hallLengthM: 15, springHeightM: 3.4, vaultRiseM: 5.0, bays: 3, pointed: false, lowTier: lo });
    for (const g of crystalRibs.stoneGeos) { kit.place(g, cx, FY, cz, 0); kit.add(mats.stone, g, { tpm: 0.42, solid: false }); }
    for (const g of crystalRibs.accentGeos) { kit.place(g, cx, FY, cz, 0); kit.add(K.mats.cyanGlow, g, { solid: false, shadow: false }); }
    K.rocks(cx, cz, 10, 9, [0.6, 1.4], 91);
    for (const [dx, dz, h] of [[-8, 5, 4], [6, 6, 5], [9, -5, 3.5], [-4, -6, 3], [2, 1, 2.2]] as const) K.crystal(cx + dx, cz + dz, h, FY, dx * 10 + dz);
    for (let k = 0; k < 4; k++) { // the armoury lockers along the east wall, AMMO screens
      const z = cz - 5 + k * 3.2; kit.box(K.mats.metal, 1.0, 2.2, 2.6, cx + 10.3, FY + 1.1, z, 0, {});
      K.screen(cx + 9.75, FY + 1.6, z, -Math.PI / 2, 1.2, 0.7, ['AMMO', 'RIFLE 240'], '#5dffb0');
    }
    for (let k = 0; k < 3; k++) kit.box(K.mats.metal, 3.2, 0.08, 2.4, cx - 3 + k * 3.4, FY + 0.04, cz + 1, 0, { solid: false });
    K.crates(cx - 6, cz + 6.5, 0.3, 4, FY);
    K.lamp(cx, FY + 6.8, cz, 0x9ff6ff, 24);
    K.lookVolumes.push({ id: 'crystal-vault', name: 'Crystal Vault', center: [cx, FY + 3.5, cz], radiusM: 14, featherM: 6, preset: 'crystal-vault' });
    // the corridor north and the Rift Vault: vaulted gothic NURBS nave, rune pillars, gold circuit lines, sculpted NURBS portal
    kit.box(mats.stone, 5, 0.6, 12, 270, FY - 0.3, 342, 0, { tpm: 0.35 });
    for (const s of [-1, 1]) rockWall(270 + s * 3.3, 342, 1.6, 12, 7);
    kit.box(mats.rock, 8, 2, 12, 270, FY + 7, 342, 0, { tpm: 0.25 });
    const rx = 272, rz = 322;
    kit.box(mats.stone, 18, 0.6, 30, rx, FY - 0.3, rz, 0, { tpm: 0.33 });
    kit.box(mats.stone, 20, 2, 32, rx, FY + 11, rz, 0, { tpm: 0.3 });
    for (const s of [-1, 1]) B.gothicWall(mats.stone, rx + s * 9.5, rz, Math.PI / 2, 30, 10, 4, FY, 1.6, 0.75);
    const riftRibs = buildNurbsVaultRibs({ spanWidthM: 17.4, hallLengthM: 28, springHeightM: 4.5, vaultRiseM: 5.8, bays: 5, pointed: true, lowTier: lo });
    for (const g of riftRibs.stoneGeos) { kit.place(g, rx, FY, rz, 0); kit.add(mats.stone, g, { tpm: 0.42, solid: false }); }
    for (const g of riftRibs.accentGeos) { kit.place(g, rx, FY, rz, 0); kit.add(K.mats.goldGlow, g, { solid: false, shadow: false }); }
    kit.box(mats.stone, 20, 10, 1.6, rx, FY + 5, rz - 15.5, 0, { tpm: 0.35 });
    kit.box(mats.stone, 7, 10, 1.6, rx - 6.5, FY + 5, rz + 15.5, 0, { tpm: 0.35 }); kit.box(mats.stone, 7, 10, 1.6, rx + 6.5, FY + 5, rz + 15.5, 0, { tpm: 0.35 });
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const pz = rz + 9 - k * 6; K.pillar(rx + s * 6, pz, 9, 0.7, FY);
      kit.box(K.mats.goldGlow, 0.08, 1.4, 0.5, rx + s * 5.25, FY + 3 + (k % 2), pz, 0, { solid: false });
    }
    K.circuit(rx, FY, rz + 4, 8, 16, Math.PI, 0xffc864, 71); K.circuit(rx, FY, rz - 6, 8, 10, Math.PI, 0xffc864, 72);
    B.flight(mats.stone, rx, FY, rz - 7, Math.PI, FY + 1.5, 8, 0.25, 0.4);
    kit.box(mats.stone, 12, 1.5, 6, rx, FY + 0.75, rz - 12, 0, { tpm: 0.4 });
    // the portal: sculpted fluted NURBS monolith ring + inner glowing rune collar + swirling disc of light
    const portalBuilt = buildNurbsPortalFrame(4.2, 0.72, lo);
    kit.place(portalBuilt.stoneFrame, rx, FY + 6.4, rz - 13.5, 0);
    kit.add(mats.stone, portalBuilt.stoneFrame, { tpm: 0.45 });
    kit.place(portalBuilt.runeRing, rx, FY + 6.4, rz - 13.5, 0);
    kit.add(K.mats.cyanGlow, portalBuilt.runeRing, { solid: false, shadow: false });
    const swirl = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const c = uv().sub(vec2(0.5)), r = c.length(), ang = atan(c.y, c.x);
    const arms = sin(ang.mul(3).add(r.mul(18)).sub(time.mul(2.2))).mul(0.5).add(0.5);
    swirl.colorNode = mix(color(0x3a4cff), color(0xf2f6ff), arms.mul(smoothstep(float(0.5), float(0.0), r))).mul(float(1.6).add(beat.mul(0.6)));
    swirl.opacityNode = smoothstep(float(0.5), float(0.42), r).mul(0.92);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.0, 48), swirl); disc.position.set(rx, FY + 6.4, rz - 13.5); group.add(disc);
    const cardGeo = new THREE.PlaneGeometry(0.7, 1.0);
    for (let k = 0; k < 10; k++) { // floating rune cards — batched into 1 instanced draw call
      const a = (k / 10) * 6.283;
      K.batcher.addTRS('rift-rune-cards', cardGeo, K.mats.cyanGlow, rx + Math.sin(a) * 6, FY + 3 + (k % 3) * 1.4, rz - 10 + Math.cos(a) * 3, 0, a, 0, 1, 1, 1, { castShadow: false, receiveShadow: false, name: 'rift-rune-cards:instanced' });
    }
    K.lamp(rx - 7, FY + 2.2, rz - 13, 0x9fe8ff, 18); K.lamp(rx + 7, FY + 2.2, rz - 13, 0x9fe8ff, 18);
    K.lookVolumes.push({ id: 'rift-vault', name: 'Rift Sanctum', center: [rx, FY + 4.5, rz], radiusM: 17, featherM: 7, preset: 'rift-sanctum' });
    glowAt(cx, FY + 3, cz); glowAt(rx, FY + 4, rz - 10);
  }

  function tubeOf(c: THREE.Curve<THREE.Vector3>, r: number) { return new THREE.TubeGeometry(c, 2, r, 6); }

  function mire() {
    const m = place('mire'), W = -48.6, deckY = W + 1.0;
    // boardwalk lines through the mire: planks on stilts, rope rails on posts with green rail lights
    const walks: number[][][] = [
      [[-150, 345], [-200, 420], [-250, 500], [-300, 570], [-330, 620]],
      [[-330, 620], [-400, 640], [-450, 700]],
      [[-330, 620], [-300, 690], [-240, 730]],
      [[-330, 620], [-250, 615], [-160, 640]],
    ];
    const plankGeoY = (x: number, z: number) => Math.max(deckY, H(x, z) + 0.6);
    for (const w of walks) {
      for (let i = 0; i < w.length - 1; i++) {
        const [ax, az] = w[i], [bx, bz] = w[i + 1], L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), n = Math.ceil(L / 0.6);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          kit.box(k % 2 ? mats.wood : mats.darkWood, 2.4, 0.1, 0.56, x, plankGeoY(x, z), z, yaw, { tpm: 0.8 });
          if (k % 5 === 0) for (const s of [-1, 1]) {
            const px = x + Math.cos(yaw) * s * 1.3, pz = z - Math.sin(yaw) * s * 1.3, py = plankGeoY(x, z);
            K.barkGeos.push(tubeOf(new THREE.LineCurve3(new THREE.Vector3(px, H(px, pz) - 1, pz), new THREE.Vector3(px, py + 1.1, pz)), 0.09));
            if (k % 10 === 0) kit.box(K.mats.cyanGlow, 0.1, 0.1, 3, px, py + 1.0, pz, yaw, { solid: false, shadow: false });
          }
        }
        for (const s of [-1, 1]) kit.box(B.invisible, 0.2, 1.1, L, (ax + bx) / 2 + Math.cos(yaw) * s * 1.35, plankGeoY((ax + bx) / 2, (az + bz) / 2) + 0.6, (az + bz) / 2 - Math.sin(yaw) * s * 1.35, yaw, { shadow: false });
        out.clear.push([(ax + bx) / 2, (az + bz) / 2, 3]);
      }
    }
    // stilt huts and the terminal platforms at the junctions
    const mireConsole = buildSubdCarvedConsole(1.25, 1.08, 0.65, lo);
    for (const [x, z, yaw] of [[-330, 620, 0.3], [-450, 700, 2.0], [-240, 730, -0.5], [-160, 640, 1.2], [-250, 500, 0.8]] as const) {
      const d = K.deck(x, z, deckY + 0.2, 5, { trunk: false, sides: 6, open: [0, 1, 2, 3, 4, 5].map((k) => k * 1.047), lamp: true });
      void d;
      K.hut(x + Math.sin(yaw) * 1.5, deckY + 0.2, z + Math.cos(yaw) * 1.5, yaw, 3.6, 3, 2.6);
      const cg = mireConsole.clone();
      kit.place(cg, x - Math.sin(yaw) * 2.5, deckY + 0.2, z - Math.cos(yaw) * 2.5, yaw);
      kit.add(K.mats.metal, cg, { tpm: 0.8 });
      K.screen(x - Math.sin(yaw) * 2.5, deckY + 1.9, z - Math.cos(yaw) * 2.5, yaw, 1.6, 1.0, ['MIRE NODE', 'FLOW 0.4', 'LINK OK'], '#5dffb0');
      out.clear.push([x, z, 8]);
      glowAt(x, deckY + 2, z);
    }
    // the walkway through a giant trunk
    {
      const x = -275, z = 535;
      shell(x, z, 5.5, H(x, z) - 2, deckY + 18, [{ a: Math.atan2(-50, -70) + Math.PI, w: 0.35, y0: deckY - 1, y1: deckY + 3.4 }, { a: Math.atan2(-50, -70), w: 0.35, y0: deckY - 1, y1: deckY + 3.4 }]);
      out.trees.push({ x, y: deckY + 18 - 62 * 0.36 * 0.45, z, yaw: 1, species: 4, scale: 0.45 });
      K.lamp(x + 3, deckY + 2.8, z - 4, 0xffb050, 16);
    }
    // mangroves and willows crowd the water
    for (let k = 0; k < (lo ? 50 : 120); k++) {
      const [x, z] = ringOf(m.x, m.z, 6, 170); if (walks.some((w) => polyNear(w, x, z).d < 4)) continue;
      out.trees.push({ x, y: H(x, z) - 0.2, z, yaw: R() * 6.28, species: R() < 0.7 ? 3 : 1, scale: 0.8 + R() * 0.6 });
    }
    out.clear.push([m.x, m.z, 6]);
  }

  function ruins() {
    // ── Portal Plaza (Bioluminescent_cyber_forest_spawn), composed from the shot's own camera: columnar redwood trunks
    //    4–5 m across frame it; 31 m out a ruined wall line crosses the view (a tall pointed arch left, the portal gate
    //    right of centre between broken arches); broken paving with puddles and circuit lines; machinery wreck in the
    //    near corners. Scored with scripts/riftrealm/wilds_depth.py. ──
    {
      const p = place('portal-plaza'), py = placeY(p);
      // the shot's camera (shots.ts): f = forward, r = screen right; at(d, s) = d metres ahead, s to the right
      const cam = { x: 380, z: -96 }, fl = Math.hypot(38, -26), f = { x: 38 / fl, z: -26 / fl }, r = { x: -f.z, z: f.x };
      const at = (d: number, s: number) => ({ x: cam.x + f.x * d + r.x * s, z: cam.z + f.z * d + r.z * s });
      const wallYaw = Math.atan2(-r.z, r.x);                     // kit walls and arches run along (cos yaw, -sin yaw) = r
      // flagstones, sunk in hollows where puddles stand (the art's wet floor catching the glow)
      K.discPave(p.x, p.z, 30, py, 48, { seed: 61, pits: ([[9, 2, 1.4], [14, 6, 1.0], [17, -3, 1.2], [20, 3, 0.8], [12, -5, 0.7], [6, 4, 0.6]] as const).map(([d, s0, rad]) => { const q = at(d, s0); return [q.x, q.z, rad * 1.3]; }) });
      // circuit lines: in from the bottom-left of the frame toward the portal, and a ring of them round the plaza
      { const q = at(7, -3.5); K.circuit(q.x, py, q.z, 3.5, 9, Math.atan2(f.x, f.z) + 0.9, 0x2ae6ff, 81); }
      for (let k = 0; k < 3; k++) K.circuit(p.x + Math.sin(k * 2.1 + 2) * 20, py, p.z + Math.cos(k * 2.1 + 2) * 20, 4, 9, k * 2.1, 0x2ae6ff, 83 + k);
      // the ruin line across the view: [s right, opening, pier height, broken stones]
      const WD = 24;
      for (const [sx, w, h, br] of [[-12.5, 2.5, 4.8, 2], [-7, 4.0, 7.8, 0], [3.5, 3.6, 6.8, 0], [9.5, 2.5, 4.4, 3]] as const) {
        const q = at(WD, sx); K.arch(q.x, q.z, wallYaw, w, h, { y: py, pointed: true, depth: 1.6, broken: br });
      }
      for (const [s0, s1, h] of [[-16.5, -14.4, 4.0], [-10.2, -9.6, 8.2], [-4.6, -1.8, 6.5], [5.8, 7.8, 6.0], [11.2, 14, 3.2]] as const) {
        const q = at(WD + 0.3, (s0 + s1) / 2); K.ruinWall(q.x, q.z, wallYaw, s1 - s0 + 0.4, h, s0 * 3 + 7);
      }
      // a second, lower line further back (the deeper arches in the haze)
      for (const sx of [-4, 7, 16]) { const q = at(46, sx); K.arch(q.x, q.z, wallYaw, 3, 4.6, { y: H(q.x, q.z), pointed: true, broken: sx > 10 ? 2 : 0 }); }
      // the portal, filling the arch right of centre (pointed top)
      const g = at(WD, 3.5);
      const portal = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const pu = uv(); const shimmer = sin(pu.y.mul(30).sub(time.mul(3))).mul(0.15).add(0.85);
      const archShape = smoothstep(float(0.5), float(0.4), pu.x.sub(0.5).abs()).mul(smoothstep(float(1.0), float(0.82), pu.y.add(pu.x.sub(0.5).abs().mul(0.9))));
      portal.colorNode = mix(color(0x7ff0ff), color(0xf4ffff), smoothstep(float(0.35), float(0.0), pu.x.sub(0.5).abs())).mul(shimmer).mul(float(1.9).add(beat.mul(0.8)));
      portal.opacityNode = archShape.mul(0.9);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 8.2), portal); pm.position.set(g.x, py + 4.1, g.z); pm.rotation.y = Math.atan2(-f.x, -f.z); group.add(pm);
      // the redwoods: [d, s, radius] — trunks that run out of the top of the frame, buttress roots, glowing shelf fungi
      const trunks: [number, number, number][] = [[8, -13, 2.3], [10, 14, 2.5], [36, -1.5, 2.7], [40, 10, 2.5], [38, -18, 2.4], [48, -9, 2.2], [26, 22, 2.6], [55, 3, 2.0], [-6, -15, 2.4], [-4, 17, 2.4],
        // the deeper stand behind the ruins (the art's haze of trunks, no open sky between them)
        [62, -14, 2.2], [66, -4, 1.9], [70, 6, 2.1], [64, 15, 2.0], [78, -22, 2.3], [82, 0, 2.0], [86, 14, 2.2], [74, 24, 2.0], [58, -26, 2.0], [92, -10, 2.1]];
      for (const [d, sx, rad] of trunks) {
        const q = at(d, sx), gy = H(q.x, q.z), scale = Math.min(1.4, Math.max(0.85, rad / 2.05)), tr = CF_REDWOOD.trunk.radius * scale;
        out.trees.push({ x: q.x, y: gy - 0.4, z: q.z, yaw: d * 1.7 + sx, species: 6, scale });
        for (let k = 0; k < 7; k++) { const a = R() * 6.283, hh = 3.5 + R() * 7; ctx.fungusSpots.push({ x: q.x + Math.sin(a) * tr * 0.9, y: gy + hh, z: q.z + Math.cos(a) * tr * 0.9, yaw: a, species: 4, scale: 1.4 + R() * 1.4 }); }
      }
      // vines down the arches, ferns and bushes along the walls and the sides
      for (let k = 0; k < 16; k++) { const q = at(30 + R() * 2, -16 + R() * 32); ctx.plantSpots.push({ x: q.x, y: py + 5 + R() * 4, z: q.z, yaw: R() * 6.28, species: 3, scale: 0.6 + R() * 0.6 }); }
      // the overgrowth at the foot of the ruins and down both sides: bush and fern masses 2–4 m high, as in the art
      //   moss mounds and green leafy masses only IN FRONT of the wall line (d < WD), the portal's mouth kept open
      const UG = PLANT_UNDERGROWTH, FF = PLANT_FOREST_FERN;
      const greenery = (d: number, sx: number, rad: number, hh: number, n: number) => {
        const q = at(d, sx); K.mound(q.x, q.z, rad, hh, py, d * 3 + sx);
        for (let k = 0; k < n; k++) { const a = R() * 6.283, e = rad * (0.15 + R() * 0.75), px = q.x + Math.sin(a) * e, pz = q.z + Math.cos(a) * e; plant(R() < 0.6 ? UG : FF, px, pz, 0.75 + R() * 0.6, py + hh * (1 - (e / (rad * 1.05)) ** 2) * 0.95); }   // on the mound's surface
      };
      for (let sx = -17; sx <= 15; sx += 2.2) { if (sx > 1.5 && sx < 5.8) continue; greenery(WD - 2.2 - R() * 1.6, sx + (R() - 0.5), 2.0 + R() * 1.4, 1.1 + R() * 1.0, 5); }
      for (let k = 0; k < 16; k++) { const sd = R() < 0.5 ? -1 : 1, d = 4 + R() * 16; greenery(d, sd * (d * 0.55 + 2 + R() * 4), 1.6 + R() * 1.4, 0.8 + R() * 1.0, 4); }   // along both edges of the frame
      for (const [d, sx] of [[5.5, -5.2], [6, 5.8], [8, -6.5], [8.5, 7]] as const) greenery(d, sx, 1.4 + R() * 0.5, 0.7 + R() * 0.4, 2);   // the near corners
      // machinery wreck and rubble in the near corners (the art's half-buried tech, bottom left and right)
      for (const [d, sx, n] of [[4.6, -5.8, 1], [4.8, 6.2, 2]] as const) {
        const q = at(d, sx);
        K.rocks(q.x, q.z, 8, 2.0, [0.4, 0.9], 300 + n);
        for (let k = 0; k < 6; k++) { const e = at(d + R() * 3, sx + (R() - 0.5) * 4); plant(R() < 0.6 ? 0 : 1, e.x, e.z, 1.6 + R() * 0.9, py); }
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.2, 14, 1, true), K.mats.metal);
        tube.position.set(q.x, py + 0.55, q.z); tube.rotation.set(Math.PI / 2, n, 0.4 * n); tube.castShadow = !lo; group.add(tube);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.09, 6, 18), K.mats.cyanGlow); band.position.copy(tube.position); band.rotation.copy(tube.rotation); group.add(band);
      }
      for (let k = 0; k < 12; k++) { const q = at(4 + R() * 26, -14 + R() * 28); K.rocks(q.x, q.z, 1, 0.1, [0.2, 0.5], 400 + k); }
      // the overgrown floor: moss, heaved flagstones, roots, ferns and grass in the cracks (the walk to the portal kept clear)
      const toPortal = (x: number, z: number) => { const dx = x - cam.x, dz = z - cam.z, d = dx * f.x + dz * f.z, sx = dx * r.x + dz * r.z; return d > 2 && d < 23 && Math.abs(sx - 3.5 * d / 24) < 1.6; };
      K.clutter(p.x, p.z, 32, py, { moss: 40, slabs: 10, roots: 8, plants: 60, vines: 28, seed: 41, keepClear: toPortal });
      out.clear.push([p.x, p.z, 34]);
      glowAt(g.x, py + 3, g.z);
      K.lamp(g.x - f.x * 2, py + 3.5, g.z - f.z * 2, 0x9ff8ff, 34);
    }
    // ── Circuit Court: a square court, lines converging on a stele on round steps, ruin walls ──
    {
      const c = place('circuit-court'), cy = placeY(c);
      K.paving([[c.x - 18, c.z - 18], [c.x + 18, c.z - 18], [c.x + 18, c.z + 18], [c.x - 18, c.z + 18]], cy);
      for (let k = 0; k < 4; k++) K.circuit(c.x + Math.sin(k * 1.571) * 10, cy, c.z + Math.cos(k * 1.571) * 10, 10, 14, k * 1.571 + Math.PI, 0x2ae6ff, 90 + k);
      for (let k = 0; k < 3; k++) K.discPave(c.x, c.z, 4.6 - k * 1.3, cy + 0.35 * (k + 1), 28);
      out.models.push({ file: 'rune_monolith.glb', x: c.x, z: c.z, yaw: 0.2, h: 5.2, y: cy + 1.05 });
      for (const [dx, dz, yaw, len] of [[-17, -4, Math.PI / 2, 16], [17, 6, Math.PI / 2, 12], [-6, -17, 0, 14], [8, 17, 0, 10]] as const) K.ruinWall(c.x + dx, c.z + dz, yaw, len, 4 + R() * 3, dx + dz);
      for (const [dx, dz] of [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, -15]]) K.pillar(c.x + dx, c.z + dz, 2 + R() * 4, 0.7, cy);
      K.arch(c.x + 17, c.z - 10, Math.PI / 2, 4, 5, { y: cy, pointed: false, broken: 3 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283, r = 32 + R() * 10; giant(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, cy + 40 + R() * 12, 6); }
      out.clear.push([c.x, c.z, 24]);
      glowAt(c.x, cy + 2, c.z);
    }
    // ── Elder Cathedral: a roofless nave, arcades, the rose window, roots through the floor ──
    {
      const k0 = place('cathedral'), ky = placeY(k0), L = 46, Wd = 18;
      K.paving([[k0.x - Wd / 2, k0.z - L / 2], [k0.x + Wd / 2, k0.z - L / 2], [k0.x + Wd / 2, k0.z + L / 2], [k0.x - Wd / 2, k0.z + L / 2]], ky);
      for (const s of [-1, 1]) B.gothicWall(mats.stone, k0.x + s * Wd / 2, k0.z, Math.PI / 2, L, 15, 6, ky, 1.6, 0.7);
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) K.pillar(k0.x + s * 4.6, k0.z - L / 2 + 6 + k * 7, 12 + (k % 2) * 1.5, 0.75, ky);
      // the west front: a doorway arch; the east end wall with the rose window high up
      kit.box(mats.stone, Wd, 16, 1.6, k0.x, ky + 8, k0.z - L / 2, 0, { tpm: 0.35 });
      for (const s of [-1, 1]) kit.box(mats.stone, 6.5, 16, 1.6, k0.x + s * 5.75, ky + 8, k0.z + L / 2, 0, { tpm: 0.35 });
      kit.box(mats.stone, 5, 8, 1.6, k0.x, ky + 12, k0.z + L / 2, 0, { tpm: 0.35 });
      const rose = new THREE.MeshBasicNodeMaterial({ map: roseTex(), transparent: true, side: THREE.DoubleSide });
      const rm = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), rose); rm.position.set(k0.x, ky + 11.5, k0.z - L / 2 + 0.85); group.add(rm);
      const lancet = new THREE.MeshBasicNodeMaterial({ color: 0x8fb8ff });
      for (const s of [-1, 0, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.4), lancet); g.position.set(k0.x + s * 1.8, ky + 5, k0.z - L / 2 + 0.85); group.add(g); }
      for (const [dx, dz, len] of [[-3, 4, 6], [4, -6, 5], [-2, -12, 4]] as const) K.ruinWall(k0.x + dx, k0.z + dz, 0.1, len, 2.2, dx);
      for (let k = 0; k < 4; k++) K.circuit(k0.x, ky, k0.z - 14 + k * 9, 8, 9, k * 0.3, 0x2ae6ff, 100 + k);
      for (let k = 0; k < 5; k++) { // roots through the broken floor
        const a = R() * 6.283, x = k0.x + (R() - 0.5) * 12, z = k0.z + (R() - 0.5) * 36;
        K.trimGeos.push(tubeRoot(x, z, a, ky));
      }
      for (let k = 0; k < 18; k++) fungus(0, k0.x + (R() - 0.5) * 16, k0.z + (R() - 0.5) * 42, 0.9 + R() * 0.9, ky);
      giant(k0.x - 6.8, k0.z - 4, ky + 28, 0);   // the tree that broke through the nave (kept off the aisle)
      K.lamp(k0.x, ky + 9, k0.z - L / 2 + 4, 0x9fc8ff, 28);
      // Swept pointed NURBS gothic vault ribs spanning the cathedral nave + cool blue Cathedral GI look volume!
      const cathRibs = buildNurbsVaultRibs({ spanWidthM: Wd - 1.2, hallLengthM: L - 6, springHeightM: 12.2, vaultRiseM: 6.2, bays: 4, pointed: true, lowTier: lo });
      for (const g of cathRibs.stoneGeos) { kit.place(g, k0.x, ky, k0.z, 0); kit.add(mats.stone, g, { tpm: 0.4, solid: false }); }
      for (const g of cathRibs.accentGeos) { kit.place(g, k0.x, ky, k0.z, 0); kit.add(K.mats.cyanGlow, g, { solid: false, shadow: false }); }
      K.lookVolumes.push({ id: 'elder-cathedral', name: 'Elder Cathedral', center: [k0.x, ky + 5, k0.z], radiusM: 22, featherM: 10, preset: 'cathedral-blue' });
      out.clear.push([k0.x, k0.z, 28]);
      glowAt(k0.x, ky + 2, k0.z);
    }
    // ── Zone 10 Temple: a stepped platform, an arch between two statues, a ZONE 10 pillar ──
    {
      const z0 = place('zone10'), zy = placeY(z0);
      for (let k = 0; k < 3; k++) kit.box(mats.stone, 20 - k * 4, 0.6, 14 - k * 3, z0.x, zy + 0.3 + k * 0.6, z0.z - 4, 0, { tpm: 0.4 });
      K.arch(z0.x, z0.z - 7, 0, 5, 6, { y: zy + 1.8, pointed: false, depth: 2 });
      for (const s of [-1, 1]) {
        kit.box(mats.stone, 2.6, 1.6, 2.6, z0.x + s * 7, zy + 2.6, z0.z - 4, 0, { tpm: 0.5 });
        out.models.push({ file: 'rune_monolith.glb', x: z0.x + s * 7, z: z0.z - 4, yaw: s * 0.3, h: 7.5, y: zy + 3.4 });
      }
      kit.prism(mats.stone, 8, 1.1, 1.3, 9, z0.x - 13, zy - 0.2, z0.z + 2, 0, { tpm: 0.4 });
      K.screen(z0.x - 13 + 1.25, zy + 6.5, z0.z + 2, Math.PI / 2, 1.8, 1.0, ['ZONE', '10'], '#cfe6ff');
      for (let k = 0; k < 6; k++) K.ruinWall(z0.x + (R() - 0.5) * 30, z0.z + (R() - 0.5) * 30, R() * 3, 4 + R() * 6, 2 + R() * 3, k + 40);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283, r = 30 + R() * 10; giant(z0.x + Math.sin(a) * r, z0.z + Math.cos(a) * r, zy + 34 + R() * 8, k % 2 ? 6 : 0); }
      for (let k = 0; k < 24; k++) { const [x, z] = ringOf(z0.x, z0.z, 6, 22); fungus(k % 4 === 0 ? 4 : 0, x, z, 0.8 + R()); }
      out.clear.push([z0.x, z0.z, 20]);
      glowAt(z0.x, zy + 3, z0.z - 4);
    }
    // ── Neon Gate Ruins: holo gates and a neon grid floor before the Neon Falls ──
    {
      const n = place('neon-gate'), ny = placeY(n);
      const grid = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const gp = positionWorld.xz.div(2.2), fx = gp.x.fract().sub(0.5).abs(), fz = gp.y.fract().sub(0.5).abs();
      const line = smoothstep(float(0.44), float(0.5), fx.max(fz));
      const fade = smoothstep(float(26), float(8), positionWorld.xz.sub(vec2(n.x, n.z)).length());
      grid.colorNode = color(0x2a8cff).mul(line).mul(fade).mul(float(1.4).add(beat.mul(1.0)).add(sin(time.mul(1.5).add(positionWorld.x.mul(0.2))).mul(0.3)));
      const gm = new THREE.Mesh(new THREE.CircleGeometry(26, 48), grid); gm.rotation.x = -Math.PI / 2; gm.position.set(n.x, ny + 0.06, n.z); group.add(gm);
      K.paving(Array.from({ length: 24 }, (_, k) => [n.x + Math.sin(k * 0.2618) * 25, n.z + Math.cos(k * 0.2618) * 25] as [number, number]), ny - 0.02);
      for (const s of [-1, 1]) { // the holo gates: frames of light bars either side of the way to the falls
        const gx = n.x + s * 9, gz = n.z - 8;
        for (const o of [-2.2, 2.2]) kit.box(mats.stone, 0.8, 4.4, 0.8, gx + o, ny + 2.2, gz, 0, { tpm: 0.6 });
        for (let k = 0; k < 4; k++) kit.box(K.mats.cyanGlow, 4.2, 0.12, 0.12, gx, ny + 0.9 + k * 0.95, gz, 0, { solid: false, shadow: false });
      }
      K.arch(n.x, n.z - 16, 0, 4.4, 5.5, { y: ny, pointed: true, depth: 1.6 });
      K.arch(n.x - 15, n.z - 4, Math.PI / 2, 3.6, 4.6, { y: ny, pointed: true, broken: 2 });
      for (const [dx, dz, t] of [[-5, -10, ['ACCESS', 'GRID 7']], [6, -11, ['ᚱ ᚦ ᛟ', 'SYNC']], [0, -18, ['NEON GATE', 'OPEN']]] as const) K.screen(n.x + dx, ny + 3.2, n.z + dz, 0, 1.6, 1.1, [...t], '#46c8ff');
      for (let k = 0; k < 5; k++) K.ruinWall(n.x + (R() - 0.5) * 40, n.z + (R() - 0.5) * 26, R() * 3, 4 + R() * 5, 2 + R() * 3, k + 60);
      // more falls off the Highland rim behind (the art's veil of cascades)
      for (const [fx, w] of [[455, 7], [490, 5], [610, 6]] as const) {
        const top = { x: fx, y: H(fx, -538) - 0.4, z: -538 }, bot = { x: fx, y: H(fx, -506) + 0.4, z: -508 };
        K.waterfall(top, bot, w);
      }
      out.clear.push([n.x, n.z, 27]);
      glowAt(n.x, ny + 2, n.z - 8);
    }
    // ── the Anomaly Shrine: a sunken octagon, a crystal pillar under a beam of light, scaffold galleries ──
    {
      const s = place('shrine'), sy = placeY(s);
      const oct = (r: number) => Array.from({ length: 8 }, (_, k) => [s.x + Math.sin(k * 0.785 + 0.3927) * r, s.z + Math.cos(k * 0.785 + 0.3927) * r] as [number, number]);
      K.paving(oct(22), sy);
      for (let k = 0; k < 8; k++) { // retaining walls with gaps for four stairs
        const a = k * 0.785, r = 23.2, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
        if (k % 2 === 0) { for (const o of [-1, 1]) kit.box(mats.stone, 6, 4.6, 1.4, x + Math.cos(a) * o * 6.2, sy + 2.3, z - Math.sin(a) * o * 6.2, a + Math.PI / 2, { tpm: 0.4 }); B.flight(mats.stone, s.x + Math.sin(a) * 30, H(s.x + Math.sin(a) * 30, s.z + Math.cos(a) * 30), s.z + Math.cos(a) * 30, a + Math.PI, sy + 0.02, 5, 0.25, 0.42, false); }
        else kit.box(mats.stone, 18.5, 4.6, 1.4, x, sy + 2.3, z, a + Math.PI / 2, { tpm: 0.4 });
      }
      kit.prism(mats.stone, 8, 8, 8.6, 0.8, s.x, sy, s.z, 0.3927, { tpm: 0.4 });
      K.crystal(s.x, s.z, 9, sy + 0.8, 7); K.crystal(s.x + 1.5, s.z - 1, 6, sy + 0.8, 8);
      const beam = new THREE.MeshBasicNodeMaterial({ color: 0x7ff4ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 70, 20, 1, true), beam); bm.position.set(s.x, sy + 35, s.z); group.add(bm);
      K.ring(s.x, sy + 0.8, s.z, 6.4, 6.8);
      for (let k = 0; k < 8; k++) { const a = k * 0.785 + 0.39, r = 13; kit.box(mats.stone, 1.2, 3 + (k % 3), 0.8, s.x + Math.sin(a) * r, sy + 1.5, s.z + Math.cos(a) * r, a, { tpm: 0.6 }); kit.box(K.mats.cyanGlow, 0.3, 1.6, 0.06, s.x + Math.sin(a) * (r - 0.43), sy + 2, s.z + Math.cos(a) * (r - 0.43), a, { solid: false }); }
      for (let k = 0; k < 4; k++) K.circuit(s.x + Math.sin(k * 1.571 + 0.785) * 15, sy, s.z + Math.cos(k * 1.571 + 0.785) * 15, 6, 10, k * 1.571 + 0.785, 0x2ae6ff, 120 + k);
      for (const a of [1.18, 4.32]) { // scaffold galleries on two sides with steel stairs
        const gx = s.x + Math.sin(a) * 18.5, gz = s.z + Math.cos(a) * 18.5;
        kit.box(K.mats.metal, 12, 0.25, 4, gx, sy + 5, gz, a + Math.PI / 2, {});
        for (const o of [-5.5, 5.5]) for (const d of [-1.8, 1.8]) kit.box(K.mats.metal, 0.2, 5, 0.2, gx + Math.cos(a) * o + Math.sin(a) * d, sy + 2.5, gz - Math.sin(a) * o + Math.cos(a) * d, a, {});
        B.steelStair(K.mats.metal, gx + Math.cos(a) * 6 - Math.sin(a) * 4, sy, gz - Math.sin(a) * 6 - Math.cos(a) * 4, a + Math.PI / 2 + Math.PI, sy + 5, 1.4);
        K.lamp(gx, sy + 6.6, gz, 0xffb050, 16);
      }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283, r = 40 + R() * 10; giant(s.x + Math.sin(a) * r, s.z + Math.cos(a) * r, sy + 30 + R() * 10, k % 2 ? 6 : 0); }
      out.clear.push([s.x, s.z, 34]);
      glowAt(s.x, sy + 3, s.z);
      K.lamp(s.x, sy + 6, s.z, 0x40e8ff, 40);
    }
  }

  function tubeRoot(x: number, z: number, a: number, y: number) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y - 0.6, z), new THREE.Vector3(x + Math.sin(a) * 2, y + 0.5, z + Math.cos(a) * 2), new THREE.Vector3(x + Math.sin(a) * 5, y + 0.2, z + Math.cos(a) * 5), new THREE.Vector3(x + Math.sin(a) * 7, y - 0.5, z + Math.cos(a) * 7)]);
    return new THREE.TubeGeometry(c, 12, 0.35, 7);
  }
}

let rose: THREE.Texture | null = null;
function roseTex() {
  if (rose) return rose;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
  g.translate(256, 256);
  const grad = g.createRadialGradient(0, 0, 10, 0, 0, 250); grad.addColorStop(0, '#e8f4ff'); grad.addColorStop(0.5, '#7aa8ff'); grad.addColorStop(1, '#3a4cc8');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1f2a'; g.lineWidth = 12;
  for (let k = 0; k < 12; k++) { g.save(); g.rotate((k / 12) * Math.PI * 2); g.beginPath(); g.moveTo(0, 40); g.lineTo(0, 250); g.stroke(); g.beginPath(); g.arc(0, 160, 52, 0, Math.PI * 2); g.stroke(); g.restore(); }
  for (const r of [40, 110, 250]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  rose = new THREE.CanvasTexture(c); rose.colorSpace = THREE.SRGBColorSpace; return rose;
}
