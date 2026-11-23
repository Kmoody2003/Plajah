// Elderwood Wilds — the open world round Elderwood Hollow (docs/rift-realm-open-world.md, track 1). wildsHooks() is what
// elderwood.ts builds on: world height, the streamed terrain, the collision field, every place from the art,
// the rivers and falls, and the forest, undergrowth and grass across the 2 km map.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkyCycle, type SkyCycle, type SkyMode } from './skyCycle';
import { CYBER_FOREST_TREES, ELDERWOOD_TREES } from '../../../../services/vegetation/catalog/cyberForest';
import type { TreeSpot } from '../../../../services/vegetation/trees/forest';
import type { WildsBuilt, WildsCtx, WildsHooks } from './registry';
import { WorldTerrain, TerrainChunks, terrainMaterial, wildsMaps } from './terrain';
import { scatterWilds } from './eco';
import { makeKit, syncBeat, uniformBeat } from './kit';
import { buildPlaces } from './places';
import { CORE, HALF, PLACES, POOL_STREAM, RIVER, TRAILS, WATER_Y, plateauMask, polyNear, setCoreHeight, worldHeight } from './layout';
import { SHOTS } from './shots';

const MODELS = '/games/rift-realm/assets/elderwood/';

export function wildsHooks(): WildsHooks {
  const terrain = new WorldTerrain();
  return {
    half: HALF,
    fogDensity: 0.0032,
    height: (x, z) => terrain.surface(x, z),
    setCore(core) { setCoreHeight(core); terrain.baked = false; },
    terrain: () => terrain,
    build: (ctx) => buildWilds(ctx, terrain),
  };
}

function buildWilds(ctx: WildsCtx, terrain: WorldTerrain): WildsBuilt {
  const t0 = performance.now();
  const { group, lo, mats } = ctx;
  if (!terrain.baked) terrain.bake();
  const H = (x: number, z: number) => terrain.surface(x, z);

  // ── terrain ──
  const tm = terrainMaterial(ctx.beat);
  const chunks = new TerrainChunks(terrain, tm.material, lo);
  group.add(chunks.group);
  chunks.update(new THREE.Vector3(0, 0, 0), 1, true);

  // ── water: the river and the pool stream as ribbons, the vale's standing water ──
  const ribbon = (pts: readonly (readonly number[])[], pad: number) => {
    const P: number[] = [], I: number[] = [], U: number[] = [];
    let row = 0, prevSteep = true, sAcc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steep = Math.abs(b[2] - a[2]) / L > 0.5;                       // a fall: drawn as a sheet, not a ribbon
      if (steep) { prevSteep = true; continue; }
      const n = Math.max(1, Math.ceil(L / 3)), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      for (let k = prevSteep ? 0 : 1; k <= n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, w = (a[3] + (b[3] - a[3]) * t) / 2 + pad, y = a[2] + (b[2] - a[2]) * t + 0.85;
        P.push(x - dz * w, y, z + dx * w, x + dz * w, y, z - dx * w); U.push(0, (sAcc + L * t) / 6, 1, (sAcc + L * t) / 6);
        if (!(prevSteep && k === 0)) I.push((row - 1) * 2, row * 2, (row - 1) * 2 + 1, (row - 1) * 2 + 1, row * 2, row * 2 + 1);
        row++;
      }
      prevSteep = false; sAcc += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.river ?? mats.water); m.receiveShadow = true; m.name = 'wilds-river'; group.add(m);
  };
  ribbon(RIVER, 1.5); ribbon(POOL_STREAM, 0.8);
  {
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 760, 1, 1), mats.water);
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, WATER_Y, 620); lake.name = 'wilds-vale-water'; group.add(lake);
  }

  // ── the places ──
  const K = makeKit(ctx, terrain);
  const placed = buildPlaces(ctx, terrain, K);
  K.finish();
  placed.clear.push(...K.clears);

  // ── a coarse mask of where the forest keeps off: trails, the rivers, the places (4 m cells) ──
  const MC = 4, MN = Math.round((HALF * 2) / MC);
  const mask = new Float32Array(MN * MN);           // distance to the nearest trail/river edge/place edge (capped at 12)
  const inPlace = new Uint8Array(MN * MN);          // 1 inside a place's footprint (no grass through decks and paving)
  {
    const clears = placed.clear;
    // the danger zones (lava rifts, vents, thorn and swamp patches) keep trees off too: games/rift-realm/src/danger/spots.ts
    // registers dangerClearings() here when it loads (a hook, so the world builds with or without it)
    // [x, z, r, noGrass?]: a 4th value of 1 also keeps the grass out (lava, vents, toxic pools; not forage or herd spots)
    const danger = (globalThis as unknown as { __wildsClearings?: () => number[][] }).__wildsClearings?.() ?? [];
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
      const x = -HALF + (i + 0.5) * MC, z = -HALF + (j + 0.5) * MC;
      let d = 12;
      for (const tr of TRAILS) { const n = polyNear(tr, x, z); if (n.d < d) d = n.d; }
      for (const pts of [RIVER, POOL_STREAM]) { const n = polyNear(pts, x, z); const w = pts[n.i][3] / 2 + 1.5; if (n.d - w < d) d = Math.max(0, n.d - w); }
      for (const c of clears) { const e = Math.hypot(x - c[0], z - c[1]) - c[2]; if (e < d) d = Math.max(0, e); if (e < -2) inPlace[i + j * MN] = 1; }
      for (const c of danger) { const e = Math.hypot(x - c[0], z - c[1]) - c[2]; if (e < d) d = Math.max(0, e); if (c[3] === 1 && e < 1) inPlace[i + j * MN] = 1; }
      mask[i + j * MN] = d;
    }
  }
  const cellOf = (x: number, z: number) => Math.min(MN - 1, Math.max(0, Math.floor((x + HALF) / MC))) + Math.min(MN - 1, Math.max(0, Math.floor((z + HALF) / MC))) * MN;
  const clearance = (x: number, z: number) => mask[cellOf(x, z)];

  // ── the forest across the world: species by region, trunks into the collision grid ──
  let seed = 9091; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trees: TreeSpot[] = [...placed.trees];
  // The forest from the EcoSystem rules (services/terrain/eco, world/eco.ts: canopy, undergrowth and fungi round the
  // trees, riverside flowers; with ?erosion=1 the land's wetness/flow/deposition maps join in). Default since the A/B
  // (2026-11-22: same look, frame rate within noise, ~11k fewer draw calls); ?eco=0 brings back the hand placement below.
  const ECO = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('eco') === '0');
  if (ECO) {
    const m = wildsMaps(), t0e = performance.now();
    const eco = scatterWilds({ height: H, normal: (x, z) => terrain.normal(x, z, 2), clearance, lowTier: lo, maps: m ? { wet: m.wetness, flow: m.flow, dep: m.deposition } : null, existingTrees: placed.trees });
    trees.push(...eco.trees); ctx.plantSpots.push(...eco.plants); ctx.fungusSpots.push(...eco.fungi);
    console.info(`[wilds] eco rules: ${eco.trees.length} trees, ${eco.plants.length} plants, ${eco.fungi.length} fungi in ${Math.round(performance.now() - t0e)} ms`);
  } else {
  const cell = lo ? 15 : 10.5;
  for (let gz = -HALF + 40; gz < HALF - 40; gz += cell) for (let gx = -HALF + 40; gx < HALF - 40; gx += cell) {
    const x = gx + (R() - 0.5) * cell * 0.95, z = gz + (R() - 0.5) * cell * 0.95;
    if (Math.abs(x) < CORE + 6 && Math.abs(z) < CORE + 6) continue;
    const c = clearance(x, z);
    if (c < 5) continue;
    const y = H(x, z);
    const n = terrain.normal(x, z, 2);
    if (n[1] < 0.8) continue;                                       // cliffs and gorge walls stay bare rock
    const wet = y < WATER_Y + 0.4, r = Math.max(Math.abs(x), Math.abs(z));
    const P = plateauMask(x, z), riverD = polyNear(RIVER, x, z).d;
    let dens = 0.82, k = R() < 0.5 ? 2 : 0, s = 0.85 + R() * 0.55;
    if (wet) { if (R() > 0.35) continue; k = 3; }
    else if (P < 0.5) { k = R() < 0.72 ? 0 : R() < 0.5 ? 1 : 2; dens = 0.9; }                     // the Violet Vale
    else if (z < -470) { k = R() < 0.6 ? 2 : 0; dens = 0.7; }                                       // the Highland
    else if (x > 220 && z < 40) { k = R() < 0.7 ? 6 : 2; s = k === 6 ? 0.75 + R() * 0.5 : 1.25 + R() * 0.7; dens = 0.62; }     // the Redwood Ruins: grown redwoods
    if (riverD < 34 && !wet && R() < 0.45) k = 1;                                                    // willows by the river
    if (r > 880) dens = 0.55;
    if (R() > dens) continue;
    trees.push({ x, y: y - 0.25, z, yaw: R() * 6.283, species: k, scale: s });
  }
  }
  for (const t of trees) {
    if (t.species >= 4 && t.species !== 6) continue;
    const sp = ELDERWOOD_TREES[t.species];
    terrain.addTrunk(t.x, t.z, sp.trunk.radius * t.scale * 0.85, t.y - 1, t.y + sp.height * t.scale * sp.trunk.crownBase);
  }

  // ── undergrowth round the trees (ferns, bushes, glowcaps), glow flowers and crystals by the water ──
  if (!ECO) {
    const near = (x: number, z: number) => Math.hypot(x, z) < HALF * 0.95;
    for (const t of trees) {
      if ((t.species >= 4 && t.species !== 6) || !near(t.x, t.z)) continue;
      if (t.species === 6) { // a redwood: ferns and leafy undergrowth crowding its buttress roots, shelf fungi up the trunk
        const tr = ELDERWOOD_TREES[6].trunk.radius * t.scale;
        for (let k = 0, m = lo ? 3 : 7; k < m; k++) {
          const a = R() * 6.283, d = tr * (1.6 + R() * 2.6), x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
          if (clearance(x, z) < 1.5) continue;
          ctx.plantSpots.push({ x, y: H(x, z) - 0.05, z, yaw: R() * 6.283, species: R() < 0.55 ? 8 : 7, scale: 0.9 + R() * 0.9 });
        }
        for (let k = 0; k < 3; k++) { const a = R() * 6.283; ctx.fungusSpots.push({ x: t.x + Math.sin(a) * tr * 0.9, y: t.y + tr * 2 + R() * 6, z: t.z + Math.cos(a) * tr * 0.9, yaw: a, species: 4, scale: 1.2 + R() * 1.2 }); }
        continue;
      }
      if (R() > (lo ? 0.3 : 0.65)) continue;
      for (let k = 0, m = 1 + Math.floor(R() * 2); k < m; k++) {
        const a = R() * 6.283, d = 2.5 + R() * 5, x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
        if (clearance(x, z) < 2) continue;
        ctx.plantSpots.push({ x, y: H(x, z) - 0.05, z, yaw: R() * 6.283, species: R() < 0.6 ? 0 : 1, scale: 0.9 + R() * 0.9 });
      }
      if (R() < 0.22) { const a = R() * 6.283, d = 2 + R() * 3, x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d; const sp = R() < 0.7 ? 0 : 1; ctx.fungusSpots.push({ x, y: H(x, z) - 0.08, z, yaw: R() * 6.283, species: sp, scale: (1 + R() * 1.2) / [1.16, 1.48][sp] }); }
      if (R() < 0.12) { const tr = CYBER_FOREST_TREES[t.species].trunk.radius * t.scale, a = R() * 6.283; ctx.fungusSpots.push({ x: t.x + Math.sin(a) * tr * 0.95, y: t.y + tr * 3.4 + R() * 2, z: t.z + Math.cos(a) * tr * 0.95, yaw: a, species: 4, scale: 1.1 + R() * 0.8 }); }
    }
    for (let k = 0; k < (lo ? 500 : 1400); k++) { // by the rivers
      const pts = R() < 0.8 ? RIVER : POOL_STREAM, i = Math.floor(R() * (pts.length - 1)), t = R(), a = pts[i], b = pts[i + 1];
      if (Math.abs(b[2] - a[2]) > 10) continue;
      const side = R() < 0.5 ? -1 : 1, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, w = (a[3] + (b[3] - a[3]) * t) / 2 + 2 + R() * 7;
      const x = a[0] + (b[0] - a[0]) * t + side * (-(b[1] - a[1]) / L) * w, z = a[1] + (b[1] - a[1]) * t + side * ((b[0] - a[0]) / L) * w;
      ctx.plantSpots.push({ x, y: H(x, z) - 0.05, z, yaw: R() * 6.283, species: R() < 0.75 ? 2 : 4, scale: 0.9 + R() * 0.9 });
    }
  }

  // ── grass: the world's rule outside the hollow ──
  const grassCover = (x: number, z: number): [number, number] | null => {
    if (Math.abs(x) < CORE + 20 && Math.abs(z) < CORE + 20) return null;
    const y = H(x, z);
    if (y < WATER_Y + 0.25) return [0, 0];
    if (inPlace[cellOf(x, z)]) {
      // overgrown floors (kit.clutter) take grass back in their cracks; everything else in a place stays bare
      for (const g of K.grassy) if ((x - g[0]) ** 2 + (z - g[1]) ** 2 < g[2] * g[2]) return [0.25 * g[3], g[3]];
      return [0, 0];
    }
    const c = clearance(x, z);
    if (c < 0.6) return [0, 0.12];
    const n = terrain.normal(x, z, 2);
    if (n[1] < 0.8) return [0, 0];
    const path = Math.min(1, c / 4);
    return [0.55 * path, 0.85 * Math.max(0.3, path)];
  };

  // ── structures with a sheet-built model, placed as art ──
  {
    const loader = new GLTFLoader(), cache = new Map<string, Promise<THREE.Object3D>>();
    const get = (f: string) => { let p = cache.get(f); if (!p) { p = new Promise((res, rej) => loader.load(MODELS + f, (g) => res(g.scene), undefined, rej)); cache.set(f, p); } return p; };
    for (const m of placed.models) {
      get(m.file).then((src) => {
        const root = src.clone(true);
        const b0 = new THREE.Box3().setFromObject(root), k = m.h / Math.max(1e-3, b0.max.y - b0.min.y);
        root.scale.setScalar(k);
        const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3());
        root.position.set(-c.x, -b.min.y, -c.z);
        const pivot = new THREE.Group(); pivot.position.set(m.x, m.y ?? H(m.x, m.z), m.z); pivot.rotation.y = m.yaw; pivot.add(root);
        root.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = !lo; mm.receiveShadow = true; } });
        group.add(pivot);
      }).catch(() => { /* not built yet: the spot keeps its colliders */ });
    }
  }

  // ── a small pool of point lights handed to the lamps and glows nearest the camera ──
  const lampSpecs = K.lights;
  const pool: THREE.PointLight[] = [];
  for (let k = 0; k < (lo ? 3 : 7); k++) { const l = new THREE.PointLight(0xffb050, 0, 14, 2); group.add(l); pool.push(l); }
  let lt = 1;
  const cam = new THREE.Vector3();

  // ── time of day and weather (skyCycle.ts): a 4-minute day, night → day → dusk → evening, and sporadic weather.
  //    ?time=day pins the art's daylight (the shots are lit this way), ?time=night the level's own night. ──
  const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const tq = qs.get('time'), DAY = tq === 'day';
  const skyMode: SkyMode = DAY ? 'day' : tq === 'night' ? 'night' : 'cycle';
  let cycle: SkyCycle | null = null;

  console.info(`[wilds] ${PLACES.length} places, ${trees.length} trees, ${ctx.plantSpots.length} plants, ${ctx.fungusSpots.length} fungi; built in ${Math.round(performance.now() - t0)} ms`);
  (globalThis as unknown as { __wilds?: unknown }).__wilds = { terrain, chunks, places: PLACES, shots: SHOTS, height: worldHeight, trees: trees.length,
    /** The clock and weather now (danger: night spawns follow the real sky). */
    sky: () => cycle?.state() ?? null,
    /** Water at (x, z): its surface height and kind (danger: drinking). The river, the pool stream and their falls are
     *  clean; the vale's standing water (the slough round the Mangrove Mire) is swamp. Null on dry ground. */
    waterAt: (x: number, z: number): { y: number; kind: 'clean' | 'swamp' } | null => {
      for (const [pts, pad] of [[RIVER, 1.5], [POOL_STREAM, 0.8]] as const) {
        const n = polyNear(pts, x, z), a = pts[n.i], b = pts[Math.min(pts.length - 1, n.i + 1)];
        if (n.d < (a[3] + (b[3] - a[3]) * n.t) / 2 + pad) return { y: a[2] + (b[2] - a[2]) * n.t + 0.85, kind: 'clean' };
      }
      if (Math.abs(z - 620) < 380 && terrain.surface(x, z) < WATER_Y) return { y: WATER_Y, kind: 'swamp' };
      return null;
    } };

  return {
    treeSpots: trees,
    grassCover,
    vineKeep: (t) => t.species < 4 && Math.abs(t.x) < 700 && Math.abs(t.z) < 700 && ((t.x * 13 + t.z * 7) % 9 + 9) % 9 < 1,
    wind: () => cycle?.wind() ?? 0.55,
    update(dt, view, player, pulse) {
      syncBeat(ctx); tm.setBeat();
      cycle?.update(dt, (view as THREE.Camera | null) ?? null, player);
      if (view) {
        view.getWorldPosition(cam);
        // the game sets the camera's far plane after prepare(); the open world needs it out to the mountains
        const pc = view as THREE.PerspectiveCamera;
        if (pc.isPerspectiveCamera && pc.far < 1600) { pc.far = 1600; pc.updateProjectionMatrix(); }
      } else cam.copy(player);
      chunks.update(cam, dt);
      if ((lt += dt) > 0.4) {
        lt = 0;
        const near = lampSpecs.map((l) => ({ l, d: (l.x - cam.x) ** 2 + (l.y - cam.y) ** 2 + (l.z - cam.z) ** 2 })).filter((e) => e.d < 70 * 70).sort((a, b) => a.d - b.d);
        pool.forEach((p, k) => { const e = near[k]; if (!e) { p.intensity = 0; return; } p.position.set(e.l.x, e.l.y, e.l.z); p.color.setHex(e.l.c); p.distance = e.l.d; p.userData.base = e.l.i; });
      }
      for (const p of pool) if (p.userData.base) p.intensity = p.userData.base * (1 + pulse * 0.25);
    },
    async prepare(r, camera) { chunks.update(cam, 1, true);
      // before compiling: the cycle replaces the fog node, and changing it later would recompile every material
      if (!cycle) {
        cycle = createSkyCycle(ctx.scene, group, r, {
          mode: skyMode, cycleSeconds: Number(qs.get('cycle')) || 240, start: Number(qs.get('clock') ?? 0.2) % 1,
          weather: qs.get('weather') ?? (DAY ? 'off' : 'auto'), lo, ground: (x, z) => terrain.surface(x, z), beat: uniformBeat(ctx),
        });
        cycle.update(0, camera as THREE.Camera, cam);
      }
      if (qs.has('compileprof')) { // which objects' shaders take the time (each compiled on its own, slowest first)
        const prof: [string, number][] = [];
        const walk = async (o: THREE.Object3D, depth: number) => {
          if (depth < 2 && o.children.length > 3) { for (const c of o.children) await walk(c, depth + 1); return; }
          const t = performance.now(); try { await r.compileAsync(o, camera, ctx.scene); } catch { /* skip */ }
          prof.push([`${o.name || o.type}${(o as THREE.Mesh).material ? ':' + (((o as THREE.Mesh).material as THREE.Material).type) : ''}`, Math.round(performance.now() - t)]);
        };
        for (const c of ctx.scene.children) await walk(c, 0);
        prof.sort((a, b) => b[1] - a[1]);
        console.info(`[wilds] compile profile: ${prof.length} objects, ${prof.reduce((t, p) => t + p[1], 0)} ms total`);
        for (const [n, ms] of prof.slice(0, 14)) console.info(`[wilds]   ${ms} ms ${n}`);
      }
      const tc = performance.now(); console.info('[wilds] compiling');
      try { await r.compileAsync(ctx.scene, camera); } catch (e) { console.warn('[wilds] precompile', e); }
      console.info(`[wilds] compiled in ${Math.round(performance.now() - tc)} ms`);
    },
  };
}
