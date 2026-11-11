// Chapter I, "Smoke Over the Valley" (The coastal villages): the shore where the wakō land, the village road
// with its storehouses burning and the watchtower bell, then the climb to the hilltop of the Kyoto Dusk painting
// (stage-japan.webp): the wooden platform, the five-storey pagoda and the cherry trees, with the painting itself
// hung as the far backdrop. +Z runs up the valley; sea level is y = 0.
import * as THREE from 'three/webgpu';
import { color, positionWorld, normalize, mix, smoothstep, vertexColor, texture, uv, vec2, vec3, time, sin, float, instancedBufferAttribute, uniform, attribute, normalMap } from 'three/tsl';
import { collide } from './core/collision';
import { uvMaterial, pbr, HIRES } from './core/materials';
import { Forest, type TreeSpot, type Species } from './core/forest';
import { rng } from './core/kit';
import { buildTerrain, buildSea, type Splat } from './ground';
import { buildGrassField, type GrassField } from './grassField';
import { buildVillage, boxGeo, type Village } from './village';
import { buildLandmarks } from './landmarks';
import { buildOtsu, OTSU, type Otsu } from './otsu';
import { buildCanal } from './canal';

export interface Fire { group: THREE.Group; flames: THREE.Mesh[]; smoke: THREE.Mesh[]; seed: number; size: number; raid: boolean }
export interface Section { name: string; zMin: number; zMax: number; spawn: THREE.Vector3[] }
export interface Chapter1World {
  group: THREE.Group;
  grass: GrassField | null;
  spawn: { position: THREE.Vector3; yaw: number };
  sections: Section[];
  fires: Fire[];
  bell: THREE.Object3D;
  petals: THREE.InstancedMesh;
  /** Quest places (otsu.ts) and the fires on the moored boats. */
  otsu: Otsu;
  boatFires: Fire[];
  /** Ravencrest's ez-tree forest: bake its impostors once the renderer is up, cull it each frame. */
  forest: Forest;
  /** The village's loose props and the villagers' huddles (village.ts). */
  village: Village;
  heightAt(x: number, z: number): number;
  update(dt: number, t: number, camera: THREE.Camera): void;
  /** The raid at dusk (look.ts): 0 golden hour → 1 the town burning. Raid fires, embers, lantern glow. */
  setRaid(k: number): void;
}

// The playable ground: the city opens west of the main road (the merchant quarter, the canal; the hillside and the
// west shore follow — docs/era-clash-3d-city-plan.md), the east side stays the valley wall.
const X_MIN = -185, X_MAX = 75, Z_MIN = -120, Z_MAX = 175;
/** The canal across the city (z of its centre line, half its width, its water and its bed), x from WEST to EAST. */
export const CANAL = { z: 42, half: 3.6, water: 0.95, bed: 0.15, west: -158, east: 34 };

/** Ground height: sea → beach → village terrace → hill → the painting's hilltop, with valley walls. */
export function heightAt(x: number, z: number): number {
  const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let y = -2.2 + 3.6 * ss(-100, -62, z);                  // the beach climbs out of the sea
  y += 0.8 * ss(-60, 30, z);                               // the village terrace, gently rising
  y += 14.8 * ss(42, 112, z);                              // the hill
  y += 0.35 * Math.sin(x * 0.11 + z * 0.07) * ss(-70, -40, z) + 0.25 * Math.sin(x * 0.23 - z * 0.13);
  const wall = x > 0 ? Math.max(0, x - 42) : Math.max(0, -x - 160);
  y += Math.pow(wall, 1.35) * 0.32;                        // the valley side (east), the hills (west)
  // the canal: a stone-banked channel across the city
  if (x > CANAL.west - 2 && x < CANAL.east + 2) {
    const k = ss(CANAL.half + 0.4, CANAL.half - 0.2, Math.abs(z - CANAL.z)) * ss(CANAL.west - 2, CANAL.west + 1, x) * ss(CANAL.east + 2, CANAL.east - 1, x);
    y = y + (CANAL.bed - y) * k;
  }
  return y;
}
/** Where the road runs (x for a given z). */
export const roadX = (z: number) => Math.sin(z * 0.028) * 7;

function puffTex(inner: string, outer: string) { return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }); }
/** Camera-facing quads drawn as one instanced batch (each Sprite was its own draw call on the iGPU). The
 *  scene keeps plain Object3D placeholders that the effects animate; `sync` copies them in each frame, with a
 *  per-instance fade from `userData.fade`. */
function billboards(tex: THREE.Texture, max: number, o: { additive?: boolean; shade?: any } = {}) {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const tx = texture(tex);
  mat.colorNode = o.shade ? tx.rgb.mul(o.shade) : tx.rgb;
  mat.opacityNode = tx.a.mul(instancedBufferAttribute(fade));
  mat.fog = !o.additive;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = o.additive ? 3 : 2;
  const p = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
  return {
    mesh,
    sync(items: THREE.Object3D[], camQ: THREE.Quaternion) {
      let i = 0;
      for (const it of items) {
        if (i >= max) break;
        const par = it.parent;
        const shown = it.visible && (!par || par.visible);
        p.copy(it.position); if (par && par.type !== 'Scene' && par.name !== 'chapter1') p.add(par.position);
        m4.compose(p, camQ, s.set(it.scale.x, it.scale.y, 1));
        mesh.setMatrixAt(i, m4); fade.setX(i, shown ? (it.userData.fade ?? 1) : 0); i++;
      }
      mesh.count = i; mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    },
  };
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function buildChapter1(): Promise<Chapter1World> {
  const group = new THREE.Group();
  group.name = 'chapter1';
  const R = rng(1570);

  // ── Sky and the painting as the far backdrop ─────────────────────────────────────────────────
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const dirY = normalize(positionWorld).y;
  skyMat.colorNode = mix(mix(color(0xe0704a), color(0x9a4a6a), smoothstep(0.0, 0.18, dirY)), color(0x2a2a5a), smoothstep(0.16, 0.55, dirY));
  skyMat.fog = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.name = 'paintedSky';
  sky.renderOrder = -10;
  group.add(sky);
  const paint = await new THREE.TextureLoader().loadAsync('/games/era-clash/assets/stage-japan.webp');
  paint.colorSpace = THREE.SRGBColorSpace;
  // The painting's upper 70% (sky, Fuji, the folded hills) on a 150° arc up the valley, faded at its edges
  // and at its foot into the haze so the 3D hilltop sits in front of it.
  const arc = (150 * Math.PI) / 180, rad = 900, hgt = rad * arc * (0.7 * 1280 / 1920) / 1;
  const backMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
  const u2 = uv();
  const edge = smoothstep(0, 0.12, u2.x).mul(smoothstep(1, 0.88, u2.x)).mul(smoothstep(0.0, 0.18, u2.y));
  backMat.colorNode = texture(paint, vec2(u2.x, u2.y.mul(0.7).add(0.3))).rgb.mul(0.92);
  backMat.opacityNode = edge;
  backMat.fog = false;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 64, 1, true, -arc / 2, arc), backMat);
  back.position.set(0, hgt / 2 - 60, 120);
  back.name = 'paintedBackdrop';
  back.renderOrder = -9;
  group.add(back);

  // ── Terrain and sea (ground.ts): CC0 surfaces blended by area and slope; a sea that mirrors the sky ─────
  const ss = (a0: number, b0: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a0) / (b0 - a0))); return t * t * (3 - 2 * t); };
  const splatAt = (x: number, z: number): Splat => {
    const sand = 1 - ss(-66, -54, z);
    const dr = Math.abs(x - roadX(z)), onRoad = z > -64 ? 1 : 0;
    // inside the Outer Wall the town is packed earth wall to wall (the alleys are dirt, not meadow)
    const town = ss(OTSU.wallZ - 1, OTSU.wallZ + 1, z) * (1 - ss(CANAL.z + CANAL.half + 9, CANAL.z + CANAL.half + 13, z)) * (x < roadX(z) ? ss(-164, -158, x) : 1 - ss(28, 32, dr));
    const dirt = Math.max((1 - ss(1.6, 2.6, dr)) * onRoad, town);
    const gravel = (ss(1.4, 2.2, dr) * (1 - ss(3.2, 4.4, dr))) * onRoad * 0.9 * (1 - town);
    const grass = Math.max(0, 1 - sand - dirt - gravel);
    return { grass, dirt, gravel, sand };
  };
  const ground = buildTerrain({ xMin: X_MIN, xMax: X_MAX, zMin: Z_MIN, zMax: Z_MAX, segX: 260, segZ: 300, heightAt, splatAt });
  group.add(collide(ground));
  group.add(buildSea());

  // The town's surfaces (CC0 scans): sugi (Japanese cedar) boarding on the shopfronts, charred-black planks for
  // posts, beams and the kura's base boarding, white lime plaster above. Each is weathered by a large-scale
  // world-space pass (its own texture sampled huge, plus rain-streak darkening that fades up the wall).
  for (const id of ['japanese_cedar_planks', 'painted_plaster_wall', 'grey_roof_tiles', 'black_painted_planks']) HIRES.add(id);
  const weather = (m: THREE.MeshStandardNodeMaterial, id: string, amount = 0.5, desat = 0, stain = 0.3) => {
    const big = texture(pbr(id).diff, positionWorld.xz.mul(1 / 31).add(vec2(positionWorld.y.mul(0.013), 0))).rgb.dot(vec3(0.33, 0.33, 0.33));
    const streak = texture(pbr(id).diff, vec2(positionWorld.x.add(positionWorld.z).mul(0.21), positionWorld.y.mul(0.02))).rgb.dot(vec3(0.33, 0.33, 0.33));
    const c0 = m.colorNode as ReturnType<typeof vec3>;
    // weathered timber goes silver-grey: pull its colour toward its own brightness
    const c1 = desat > 0 ? mix(c0, vec3(c0.dot(vec3(0.3, 0.59, 0.11))), desat) : c0;
    // splashed dirt up the foot of the walls (village.ts / otsu.ts bake 'grime' per vertex; 0 elsewhere)
    const grime = attribute<'float'>('grime', 'float');
    // rain stains: thin vertical runs (a stretched sample of the scan), stronger the higher up the wall (under the eaves)
    const runs = texture(pbr(id).diff, vec2(positionWorld.x.add(positionWorld.z).mul(0.9), positionWorld.y.mul(0.05))).rgb.dot(vec3(0.33, 0.33, 0.33));
    const stainK = smoothstep(0.35, 0.15, runs).mul(stain);
    const weathered = c1.mul(big.mul(amount).add(1 - amount * 0.5)).mul(streak.mul(0.3).add(0.85)).mul(float(1).sub(stainK.mul(0.45)));
    m.colorNode = mix(weathered, vec3(0.16, 0.13, 0.1), grime.mul(grime).mul(0.55));
    return m;
  };
  const wood = weather(uvMaterial('japanese_cedar_planks', [1.1, 1.1], { tint: 0x9a8670 }), 'japanese_cedar_planks', 0.5, 0.45);
  const darkWood = weather(uvMaterial('black_painted_planks', [1.2, 1.2], { tint: 0x9a8e84 }), 'black_painted_planks', 0.4, 0.2);
  const plaster = weather(uvMaterial('painted_plaster_wall', [0.45, 0.45], { tint: 0xf2eadc, roughnessScale: 1.1 }), 'painted_plaster_wall', 0.45, 0, 1.0);
  const thatch = uvMaterial('roof_slates_02', [3, 3], { tint: 0x8a6a3a });
  // kawara: CC0 grey roof tiles (one texture repeat per 2 m of roof)
  const tile = uvMaterial('grey_roof_tiles', [1, 1], { tint: 0x9aa0aa });
  const red = new THREE.MeshStandardNodeMaterial({ color: 0x9a2a1e, roughness: 0.7 });

  const at = (o: THREE.Object3D, x: number, z: number, yaw = 0, lift = 0) => { o.position.set(x, heightAt(x, z) + lift, z); o.rotation.y = yaw; group.add(o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, y = h / 2) => { const b = new THREE.Mesh(boxGeo(w, h, d), m); b.position.y = y; b.castShadow = b.receiveShadow = true; return b; };
  /** A gabled roof (ridge along X). */
  const gable = (w: number, d: number, h: number, m: THREE.Material, over = 0.5) => {
    const s = new THREE.Shape(); s.moveTo(-d / 2 - over, 0); s.lineTo(0, h); s.lineTo(d / 2 + over, 0); s.lineTo(-d / 2 - over, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false });
    g.translate(0, 0, -(w + over * 2) / 2); g.rotateY(Math.PI / 2);
    const r = new THREE.Mesh(g, m); r.castShadow = true; return r;
  };

  // ── The wakō boats, run up on the beach ─────────────────────────────────────────────────────────
  for (const [x, z, yaw] of [[-5, -79, 0.35], [10, -82, -0.25], [24, -90, 0.1]] as const) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.0, 11, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), darkWood);
    hull.rotation.z = Math.PI; hull.position.y = 1.3; hull.castShadow = true;
    const mast = box(0.22, 7, 0.22, darkWood, 4.2);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.6), new THREE.MeshStandardNodeMaterial({ color: 0xc8b48a, roughness: 1, side: THREE.DoubleSide }));
    sail.position.set(0, 5, 0.3); sail.rotation.y = Math.PI / 2;
    b.add(hull, mast, sail);
    at(collide(b), x, z, yaw, -0.6);
  }

  // ── The village: houses either side of the road ────────────────────────────────────────────────
  const house = (w: number, d: number, burnt = false) => {
    const h = new THREE.Group();
    h.add(box(w, 2.8, d, burnt ? darkWood : wood));
    const roof = gable(w, d, 2.2, burnt ? darkWood : thatch); roof.position.y = 2.8; h.add(roof);
    const door = box(1.1, 1.9, 0.08, darkWood, 0.95); door.position.z = d / 2 + 0.03; h.add(door);
    return collide(h);
  };
  void house;
  // Otsu-no-ura (otsu.ts, village.ts): inside the Outer Wall, the Grand Marketplace (a square on the road with
  // a ring of stalls round a well) and then the Maze of Alleyways (three rows a side, cross-alleys between);
  // the burning storehouses stand in the alleys, the watchtower and the road trees keep their ground.
  const KURA: [number, number][] = [[-11, 4], [12, 17], [-13, 28]];
  // the merchant quarter (west of the main road): four streets running up toward the canal, two cross-streets, a
  // promenade along the canal's south bank and a street along its north bank
  const MERCHANT_STREETS = [
    ...[-52, -86, -120, -152].map((x) => ({ x0: x, z0: OTSU.wallZ + 3, x1: x, z1: CANAL.z - CANAL.half - 1.4 })),
    { x0: -158, z0: -12, x1: -38, z1: -12 }, { x0: -158, z0: 12, x1: -38, z1: 12 },
    { x0: -158, z0: CANAL.z - CANAL.half - 4.6, x1: -36, z1: CANAL.z - CANAL.half - 4.6 },
    { x0: -156, z0: CANAL.z + CANAL.half + 4.6, x1: -52, z1: CANAL.z + CANAL.half + 4.6 },
  ];
  const PLAZA = { x: roadX(OTSU.plaza.z), z: OTSU.plaza.z, r: OTSU.plaza.r };
  const village = buildVillage({
    heightAt, roadX, mats: { wood, darkWood, plaster, thatch, tile },
    z0: OTSU.wallZ + 3, z1: OTSU.townZ1, rows: [7.6, 15.8, 24.2], plaza: PLAZA, huddleZ: [OTSU.plaza.z, 8, 31],
    streets: MERCHANT_STREETS,
    keepOut: (x, z, r) => Math.abs(z - CANAL.z) < CANAL.half + 1.4 + r && x > CANAL.west - 3 && x < CANAL.east + 3,
    avoid: [
      ...KURA.map(([x, z]) => ({ x: roadX(z) + x, z, r: 4.6 })),
      { x: roadX(36) + 6, z: 36, r: 3.4 },
      { x: -22, z: 14, r: 2 }, { x: 22, z: -18, r: 2 }, { x: -26, z: -34, r: 2 },
    ],
  });
  group.add(village.group);
  const stoneMat = uvMaterial('japanese_stone_wall', [0.7, 0.7], { tint: 0xb4aca0 });
  const quayMat = uvMaterial('japanese_stone_wall', [0.4, 0.4], { tint: 0x9a948a });
  const otsu = buildOtsu({ heightAt, roadX, village, mats: { wood, darkWood, plaster, tile, stone: stoneMat, quay: quayMat } });
  group.add(otsu.group);
  // the canal and its bridges: the main road and the three inner streets of the grid cross it
  const canal = buildCanal({ spec: CANAL, heightAt, mats: { stone: stoneMat, wood, darkWood },
    bridges: [{ x: roadX(CANAL.z), width: 7.2 }, ...[-52, -86, -120].map((x) => ({ x, width: 4.2 }))] });
  group.add(canal.group);
  /** The ground anything walks on: the terrain, or a bridge deck over the canal. */
  const groundAt = (x: number, z: number) => Math.max(heightAt(x, z), canal.deckAt(x, z));
  // the landmarks of the reference shots: the volcano, the castle on its hill, forested hills between
  const landmarks = buildLandmarks({ inner: { xMin: X_MIN, xMax: X_MAX, zMin: Z_MIN, zMax: Z_MAX }, heightAt });
  group.add(landmarks.group);

  // ── The street: big irregular flagstones wall to wall through the town, with kerb stones (the shots) ───
  const STREET_Z0 = OTSU.wallZ - 3, STREET_Z1 = OTSU.masugata.z1, STREET_W = 4.7;
  {
    const nz = Math.round((STREET_Z1 - STREET_Z0) / 0.5), nx = 10;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) {
      const z = STREET_Z0 + (j / nz) * (STREET_Z1 - STREET_Z0), cx = roadX(z);
      for (let i = 0; i <= nx; i++) {
        const x = cx - STREET_W + (i / nx) * STREET_W * 2;
        pos.push(x, heightAt(x, z) + 0.05, z); uvs.push(x / 3.2, z / 3.2);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    // the cobbles, with puddles lying in their low spots (the scan's own displacement), patchy across the town:
    // dark, mirror-smooth water that catches the sky by day and the fires at dusk; damp rims round each one
    const stMat = uvMaterial('cobblestone_large_01', [1, 1], { tint: 0xc8bcae });
    {
      const CB = pbr('cobblestone_large_01');
      const disp = texture(CB.ard, uv()).b;
      const patch = texture(pbr('aerial_grass_rock').diff, positionWorld.xz.mul(1 / 14)).rgb.dot(vec3(0.33, 0.33, 0.33));
      // pools in scattered hollows (the water stands over the stones), elsewhere only the joints hold water
      const pool = smoothstep(0.125, 0.165, patch);                                  // (linear values: ~10% of the street)
      const fill = pool.mul(0.7).add(0.38);                                         // how high the water stands here
      const water = smoothstep(fill.sub(0.04), fill.sub(0.12), disp);            // under the waterline → puddle
      const damp = smoothstep(fill.add(0.14), fill.sub(0.04), disp).mul(smoothstep(0.07, 0.13, patch).mul(0.7).add(0.3));
      const base = stMat.colorNode as ReturnType<typeof vec3>;
      stMat.colorNode = mix(mix(base, base.mul(0.62), damp), base.mul(0.22), water);
      stMat.roughnessNode = mix(mix(stMat.roughnessNode as ReturnType<typeof float>, float(0.35), damp), float(0.04), water);
      stMat.normalNode = normalMap(mix(texture(CB.nor, uv()).rgb, vec3(0.5, 0.5, 1), water));   // still water lies flat
    }
    const street = new THREE.Mesh(g, stMat);
    street.receiveShadow = true; group.add(street);
    // kerb stones along both edges
    const kerbMat = uvMaterial('japanese_stone_wall', [0.6, 0.6], { tint: 0xb0aaa0 });
    const n = Math.round((STREET_Z1 - STREET_Z0) / 0.95);
    const kerb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.2, 0.9), kerbMat, n * 2);
    const m4k = new THREE.Matrix4(), qk = new THREE.Quaternion();
    let k = 0;
    for (let j = 0; j < n; j++) for (const sd of [-1, 1]) {
      const z = STREET_Z0 + j * 0.95 + 0.47, x = roadX(z) + sd * (STREET_W + 0.17);
      qk.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan(Math.cos(z * 0.028) * 0.028 * 7) + (R() - 0.5) * 0.06);
      m4k.compose(new THREE.Vector3(x, heightAt(x, z) + 0.07, z), qk, new THREE.Vector3(1, 0.8 + R() * 0.4, 1)); kerb.setMatrixAt(k++, m4k);
    }
    kerb.castShadow = kerb.receiveShadow = true; group.add(kerb);
    // the market square, paved wall to wall
    const disc = new THREE.CircleGeometry(PLAZA.r + 3.2, 48).rotateX(-Math.PI / 2);
    const dp = disc.attributes.position as THREE.BufferAttribute, du = disc.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) { const x = dp.getX(i) + PLAZA.x, z = dp.getZ(i) + PLAZA.z; dp.setXYZ(i, x, heightAt(x, z) + 0.045, z); du.setXY(i, x / 3.2, z / 3.2); }
    disc.computeVertexNormals();
    const sq = new THREE.Mesh(disc, street.material); sq.receiveShadow = true; group.add(sq);
    // the forecourt under the keep: big dressed stone flags, wall to wall
    const C = OTSU.forecourt, gx = roadX(OTSU.otemonZ), fw = C.half * 2 - 1.2, fd = C.z1 - C.z0 + 2.2;
    const fg = new THREE.PlaneGeometry(fw, fd, 36, 40).rotateX(-Math.PI / 2);
    const fp = fg.attributes.position as THREE.BufferAttribute, fu = fg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i) + gx, z = fp.getZ(i) + (C.z0 + C.z1) / 2; fp.setXYZ(i, x, heightAt(x, z) + 0.05, z); fu.setXY(i, x / 2.4, z / 2.4); }
    fg.computeVertexNormals();
    const flags = new THREE.Mesh(fg, uvMaterial('stone_tiles_02', [1, 1], { tint: 0xc8c0b4 })); flags.receiveShadow = true; group.add(flags);
    // the masugata's floor: the same flags
    const M = OTSU.masugata, mg = new THREE.PlaneGeometry(M.half * 2 - 1, M.z1 - M.z0 + 1, 18, 14).rotateX(-Math.PI / 2);
    const mp = mg.attributes.position as THREE.BufferAttribute, mu = mg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) { const x = mp.getX(i) + gx, z = mp.getZ(i) + (M.z0 + M.z1) / 2; mp.setXYZ(i, x, heightAt(x, z) + 0.06, z); mu.setXY(i, x / 2.4, z / 2.4); }
    mg.computeVertexNormals();
    const mflags = new THREE.Mesh(mg, flags.material); mflags.receiveShadow = true; group.add(mflags);
  }

  // ── Cooking smoke: soft white plumes rising from the town's roofs and leaning with the wind ─────────
  const steamTex = puffTex('rgba(236,226,212,0.38)', 'rgba(236,226,212,0)');
  // (one instanced batch for all of them: up to 20 plumes of 5)
  const steamShade = uniform(1.0);
  const steamBoard = billboards(steamTex, 100, { shade: steamShade });
  group.add(steamBoard.mesh);
  const steamItems: THREE.Object3D[] = [];
  const plumes = village.smoke.slice(0, 20).map((p, i) => {
    const sprites: THREE.Object3D[] = [];
    for (let k = 0; k < 5; k++) { const sp = new THREE.Object3D(); sp.position.copy(p); sprites.push(sp); steamItems.push(sp); }
    return { p, sprites, seed: i * 1.7 };
  });
  // the raiders' plunder on the beach: crates and barrels hauled off the boats
  for (const [x, z] of [[-10, -72], [-8.5, -71], [-11, -70.5], [12, -75], [13.5, -74], [6, -70], [-4, -68], [16, -71]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 0.7).translate(0, 0.31, 0), wood); m.castShadow = true;
    m.position.set(x, heightAt(x, z), z); m.rotation.y = R() * 3; village.props.push({ mesh: m, kind: 'crate' });
  }
  for (const [x, z] of [[-6, -73], [9, -72], [14, -69]] as const) {
    const m = village.props.find((p) => p.kind === 'barrel')?.mesh.clone() as THREE.Mesh | undefined;
    if (m) { m.position.set(x, heightAt(x, z), z); village.props.push({ mesh: m, kind: 'barrel' }); }
  }

  // ── The storehouses (kura) the raiders fired: white walls, dark tile, burning ───────────────────
  const fires: Fire[] = [];
  // Fire light: a fixed pool of three point lights that never switch on or off, only move to the nearest fires and
  // fade. (Turning a light's visibility on or off changes the scene's light set, and every lit material in the
  // scene recompiles its shader: a freeze of up to seconds each time the nearest fires changed.)
  const firePool = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 22, 1.6); group.add(l); return l; });
  const puff = (inner: string, outer: string) => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  // a flame: a tongue of fire that fades to nothing well inside the card (no square edges): a hot core low
  // down, a licking body drawn as stacked soft blobs narrowing upward
  const flameTex = canvasTex(128, 256, (g) => {
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {
      const y = 206 - k * 19, r = 46 - k * 4.2, x = 64 + Math.sin(k * 1.9) * k * 1.6;
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      const a = 0.42 - k * 0.03;
      gr.addColorStop(0, k < 3 ? `rgba(255,236,170,${a + 0.2})` : `rgba(255,150,60,${a})`); gr.addColorStop(0.55, `rgba(230,90,30,${a * 0.6})`); gr.addColorStop(1, 'rgba(160,30,10,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  const flameBoard = billboards(flameTex, 160, { additive: true });
  const smokeBoard = billboards(puff('rgba(40,32,34,0.55)', 'rgba(40,32,34,0)'), 180);
  group.add(smokeBoard.mesh, flameBoard.mesh);
  const flameItems: THREE.Object3D[] = [], smokeItems: THREE.Object3D[] = [];
  const fire = (x: number, z: number, size: number, raid = false, lift = 0) => {
    const g = new THREE.Group();
    const flames: THREE.Mesh[] = [], smoke: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Object3D() as THREE.Mesh; flameItems.push(f);
      f.scale.set(1.8 * size, 3.4 * size, 1);
      f.position.set((R() - 0.5) * 2.4 * size, 1.6 * size, (R() - 0.5) * 2 * size); flames.push(f); g.add(f);
    }
    for (let i = 0; i < 8; i++) { const s = new THREE.Object3D() as THREE.Mesh; smoke.push(s); g.add(s); smokeItems.push(s); }
    at(g, x, z, 0, lift);
    if (raid) g.visible = false;
    fires.push({ group: g, flames, smoke, seed: R() * 10, size, raid });
  };
  for (const [x, z] of KURA) {
    const k = new THREE.Group();
    k.add(box(5, 3.6, 4, plaster));
    const roof = gable(5, 4, 1.6, tile); roof.position.y = 3.6; k.add(roof);
    at(collide(k), roadX(z) + x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    fire(roadX(z) + x, z, 1.1);
  }

  // ── The raid's fires (they catch as dusk falls, setRaid): roofs along the street, stalls in the square, a dock
  //    warehouse, a beached boat, the gate's outworks, a samurai gate. Their smoke climbs into tall columns. ───
  const RAID_FIRES: [number, number, number, number][] = [   // x, z, size, lift (a roof fire sits up on the roof)
    [roadX(2) + 7.6, 2, 1.2, 4.2], [roadX(13) - 7.6, 13, 1.0, 4.2], [roadX(24) + 7.6, 24, 1.3, 4.4], [roadX(38) - 7.6, 38, 1.1, 4.2],
    [PLAZA.x + 6, PLAZA.z + 3, 0.8, 0], [PLAZA.x - 5.5, PLAZA.z - 4, 0.75, 0],
    [-31.5, -56.5, 1.5, 6.2], [10, -82, 1.0, 0.4], [roadX(-40) - 8, -40, 0.8, 0], [roadX(-10) + 1.5, -10, 0.55, 0],
    [roadX(70) + 6.4, 70, 0.9, 1.2], [roadX(91) - 6.4, 91, 0.8, 1.0],
  ];
  for (const [x, z, s, lift] of RAID_FIRES) fire(x, z, s, true, lift);
  const boatFires = otsu.spots.boats.map((b) => { fire(b.boat.x, b.boat.z, 0.75, false, b.boat.y + 0.4 - heightAt(b.boat.x, b.boat.z)); return fires[fires.length - 1]; });
  // embers: one instanced draw, swirling up round the camera
  const emberMat = new THREE.MeshBasicNodeMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  emberMat.colorNode = vec3(2.6, 1.15, 0.35);
  const EMBERS = 280;
  const embers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.06), emberMat, EMBERS);
  embers.frustumCulled = false; embers.visible = false; embers.count = 0;
  const ev = Array.from({ length: EMBERS }, () => ({ p: new THREE.Vector3((R() - 0.5) * 36, R() * 16, (R() - 0.5) * 36), s: 0.5 + R() * 1.2, ph: R() * 6, k: 0.5 + R() }));
  group.add(embers);
  let raidK = 0;

  // ── The watchtower and its bell, where the village road meets the hill ───────────────────────
  const tower = new THREE.Group();
  for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const p = box(0.3, 7, 0.3, darkWood, 3.5); p.position.x = px; p.position.z = pz; tower.add(p); }
  const deck = box(3.6, 0.25, 3.6, wood, 6.2); tower.add(deck);
  const troof = gable(3.8, 3.8, 1.4, thatch); troof.position.y = 8.6; tower.add(troof);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.9, 16, 1, true), new THREE.MeshStandardNodeMaterial({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }));
  bell.position.y = 7.6; tower.add(bell);
  at(collide(tower), roadX(36) + 6, 36);

  // ── The torii at the foot of the climb ──────────────────────────────────────────────────────────
  const torii = new THREE.Group();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 6, 12), red); p.position.set(s * 2.6, 3, 0); p.castShadow = true; torii.add(p); }
  torii.add(Object.assign(box(7.4, 0.45, 0.6, red, 6.1)), Object.assign(box(8.6, 0.35, 0.7, darkWood, 6.5)), Object.assign(box(6.2, 0.3, 0.4, red, 5.0)));
  at(collide(torii), 22, 140, -0.7);   // on the path to the mountain shrine (the pagoda)

  // (The painting's wooden viewing deck and its railings are gone: the castle approach's masugata and forecourt
  //  stand on the hilltop now — otsu.ts.)

  // ── The five-storey pagoda behind the platform, off to the right as in the painting ────────────
  const pagoda = new THREE.Group();
  const lacquer = weather(uvMaterial('japanese_cedar_planks', [1.1, 1.1], { tint: 0x9a3a2a }), 'japanese_cedar_planks', 0.4);
  for (let i = 0; i < 5; i++) {
    const w = 7.2 - i * 0.95, y = i * 3.4;
    pagoda.add(box(w, 2.6, w, lacquer, y + 1.3));
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.9, 0.9, 4, 1), tile); eave.rotation.y = Math.PI / 4; eave.position.y = y + 3.0; eave.castShadow = true; pagoda.add(eave);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 7, 8), new THREE.MeshStandardNodeMaterial({ color: 0x4a4a52, metalness: 0.6, roughness: 0.4 }));
  spire.position.y = 5 * 3.4 + 3.5; pagoda.add(spire);
  at(collide(pagoda), 26, 152);

  // ── Trees: Ravencrest's ez-tree forest (core/forest.ts) with the shots' species. Flowering cherries on the
  //    hill, round the hilltop, along the road and in the samurai yards; umbrella pines in the yards and full 3D
  //    on the valley walls; baked impostors over the far hills and round the castle. ────────────────────
  const forest = new Forest();
  const noTrees = new URLSearchParams(location.search).has('notrees');
  if (!noTrees) {
    const V = (x: number, z: number, lift = 0) => new THREE.Vector3(x, heightAt(x, z) + lift, z);
    const cherries: [number, number, number][] = [[-30, 150, 8.5], [30, 160, 7.5], [-24, 104, 7],
      [-20, 78, 6], [-22, 14, 6], [22, -18, 5.5], [-26, -34, 6]];
    const near: TreeSpot[] = cherries.map(([x, z, h]) => ({ p: V(x, z), h: h * 1.1, species: 'cherry' as const }));
    for (const t of canal.cherries) near.push({ p: V(t.x, t.z), h: t.h * 1.1, species: 'cherry' });
    for (const t of otsu.yardTrees) near.push({ p: V(t.x, t.z), h: t.blossom ? t.h * 1.1 : t.h * 1.15, species: t.blossom ? 'cherry' : 'umbrella' });
    // the valley walls: about two in five full 3D (the nearest rank), the rest impostors like the far hills
    const wallFar: TreeSpot[] = [];
    const hillSpecies = (t: { x: number; y: number; z: number }) => {
      const r = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1;
      if (t.y > 34) return r < 0.6 ? 'umbrella' : 'pine';
      if (t.y > 12) return r < 0.5 ? 'pine' : r < 0.78 ? 'umbrella' : r < 0.9 ? 'oak' : 'ash';
      return r < 0.35 ? 'pine' : r < 0.55 ? 'umbrella' : r < 0.8 ? 'oak' : r < 0.92 ? 'ash' : 'aspen';
    };
    landmarks.treeNear.forEach((t, i) => {
      const spot = { p: new THREE.Vector3(t.x, t.y + 0.3, t.z), h: t.h * (hillSpecies(t) === 'pine' ? 1.35 : 1), species: hillSpecies(t) as Species };
      if (Math.abs(t.x) < 56 && i % 5 < 3) near.push(spot); else wallFar.push(spot);
    });
    forest.plant(near, { umbrella: 1 }, 1570);
    forest.plantFar([...wallFar, ...landmarks.treeFar.map((t) => ({ p: new THREE.Vector3(t.x, t.y + 0.3, t.z), h: t.h * (hillSpecies(t) === 'pine' ? 1.35 : 1), species: hillSpecies(t) as Species }))], ['umbrella']);
  }
  group.add(forest.group);

  // ── Drifting petals, carried round the camera ──────────────────────────────────────────────────
  const petalMat = new THREE.MeshBasicNodeMaterial({ color: 0xf6c1cf, side: THREE.DoubleSide });
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.045), petalMat, 360);
  petals.frustumCulled = false;
  const pv = Array.from({ length: 360 }, () => ({ p: new THREE.Vector3((R() - 0.5) * 40, R() * 14, (R() - 0.5) * 40), s: 0.6 + R() * 0.8, ph: R() * 6 }));
  group.add(petals);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);

  // ── Sections: the warband fights its way shore → village → hilltop ─────────────────────────────
  const sections: Section[] = [
    { name: "Fisherman's Harbour", zMin: -100, zMax: OTSU.wallZ, spawn: [new THREE.Vector3(2, 0, -76), new THREE.Vector3(10, 0, -78), new THREE.Vector3(-28, 0, -64)] },
    // on the road and in the square: the rows either side are solid
    { name: 'The Grand Marketplace', zMin: OTSU.wallZ, zMax: OTSU.otemonZ, spawn: [new THREE.Vector3(roadX(-2) + 1, 0, -2), new THREE.Vector3(roadX(30) + 1.2, 0, 30), new THREE.Vector3(roadX(41) - 1.2, 0, 41)] },
    { name: 'The Castle Forecourt', zMin: OTSU.otemonZ + 6, zMax: 166, spawn: [otsu.spots.forecourt.clone().add(new THREE.Vector3(0, 0, 4)), otsu.spots.forecourt.clone().add(new THREE.Vector3(8, 0, 9)), otsu.spots.forecourt.clone().add(new THREE.Vector3(-8, 0, 8))] },
  ];
  for (const s of sections) for (const p of s.spawn) p.y = heightAt(p.x, p.z);

  // ── Grass blades (grassField.ts): everywhere the meadow is, but never under a building, on a road or a cliff ─
  const blocked: THREE.Box3[] = [...village.footprints, ...otsu.footprints, ...canal.footprints];
  group.updateMatrixWorld(true);
  for (const o of group.children) {
    if (o === ground || !o.userData.collide) continue;
    const b0 = new THREE.Box3().setFromObject(o); if (b0.isEmpty() || b0.max.x - b0.min.x > 60) continue;
    blocked.push(b0.expandByScalar(0.5));
  }
  // footprints bucketed on an 8 m grid: each blade checks a handful of boxes, not all ~400
  const BG = 8, bgrid = new Map<number, THREE.Box3[]>(), bkey = (i: number, j: number) => i * 100003 + j;
  for (const b0 of blocked) {
    for (let i = Math.floor(b0.min.x / BG); i <= Math.floor(b0.max.x / BG); i++) for (let j = Math.floor(b0.min.z / BG); j <= Math.floor(b0.max.z / BG); j++) {
      const k = bkey(i, j); (bgrid.get(k) ?? bgrid.set(k, []).get(k)!).push(b0);
    }
  }
  const none: THREE.Box3[] = [];
  const blockedNear = (x: number, z: number) => bgrid.get(bkey(Math.floor(x / BG), Math.floor(z / BG))) ?? none;
  const grassAt = (x: number, z: number) => {
    if (z > STREET_Z0 - 1 && z < STREET_Z1 + 1 && Math.abs(x - roadX(z)) < STREET_W + 1.2) return 0;   // the paved town
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 3.5) return 0;   // the market square
    const sp = splatAt(x, z); if (sp.grass < 0.3) return 0;
    const slope = Math.hypot(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
    if (slope > 0.95) return 0;
    for (const b0 of blockedNear(x, z)) if (x > b0.min.x && x < b0.max.x && z > b0.min.z && z < b0.max.z) return 0;
    return sp.grass * (1 - Math.min(1, slope / 0.95) * 0.5);
  };
  const params0 = new URLSearchParams(location.search);
  const grass: GrassField | null = params0.has('nograss') ? null : buildGrassField(heightAt, grassAt, Number(params0.get('grass')) || 2200);
  if (grass) group.add(grass.group);

  const spawn = { position: new THREE.Vector3(roadX(-66), heightAt(roadX(-66), -66), -66), yaw: 0 };

  return {
    group, grass, spawn, sections, fires, bell, petals, heightAt: groundAt, village, forest, otsu, boatFires,
    setRaid(k) {
      raidK = THREE.MathUtils.clamp(k, 0, 1);
      for (const f of fires) if (f.raid) f.group.visible = raidK > 0.03;
      embers.visible = raidK > 0.05; embers.count = Math.round(EMBERS * raidK);
      for (const gl of village.glow) gl.mat.emissiveIntensity = gl.base * (1 + raidK * 2.4);
    },
    update(dt, t, camera) {
      grass?.update(camera.position);
      for (const pl of plumes) pl.sprites.forEach((sp, k) => {
        const ph = ((t * 0.07 + k / pl.sprites.length + pl.seed) % 1);
        sp.position.set(pl.p.x + ph * ph * 7 + Math.sin(t * 0.4 + k + pl.seed) * 0.4, pl.p.y + ph * 14, pl.p.z + ph * 2.5);
        sp.scale.setScalar(0.8 + ph * 6);
        // at dusk the pale cooking smoke goes grey and thin (white puffs would glow against the slate sky)
        sp.userData.fade = Math.min(1, ph * 6) * (1 - ph) * (1 - raidK * 0.55);
      });
      for (const f of fires) {
        if (!f.group.visible) continue;
        const grow = f.raid ? Math.min(1, raidK * 1.4) : 1, s = f.size * grow;
        // raid fires send their smoke up in tall columns (the battle shots)
        const rise = f.raid ? 16 + 26 * raidK : 16, puff = f.raid ? 1 + raidK * 0.9 : 1;
        f.flames.forEach((m, i) => { const k = 0.8 + 0.3 * Math.sin(t * (9 + i) + f.seed + i * 1.7); m.scale.set(1.8 * s * (0.9 + 0.2 * Math.sin(t * 7 + i)), 3.4 * s * k, 1); });
        f.smoke.forEach((m, i) => { const ph = ((t * 0.12 + i / f.smoke.length) % 1); m.userData.fade = Math.min(1, ph * 8) * (1 - ph * ph); m.position.set(Math.sin(i * 2.1 + t * 0.3) * 1.2 + ph * 2 * puff, 3 + ph * rise, ph * 3 * puff); m.scale.setScalar((2.5 + ph * 7) * puff * Math.max(0.3, grow)); });
      }
      steamShade.value = 1 - raidK * 0.72;
      const cq = (camera as THREE.Camera).quaternion;
      steamBoard.sync(steamItems, cq); smokeBoard.sync(smokeItems, cq); flameBoard.sync(flameItems, cq);
      // the fires nearest the camera carry the pooled lights (two; the third joins once the town is burning)
      const cpos = camera.position, nLights = raidK > 0.5 ? 3 : 2;
      const order = fires.filter((f) => f.group.visible).sort((a, b) => a.group.position.distanceToSquared(cpos) - b.group.position.distanceToSquared(cpos));
      firePool.forEach((l, i) => {
        const f = order[i];
        if (!f || i >= nLights) { l.intensity = 0; return; }
        const g = f.raid ? Math.min(1, raidK * 1.4) : 1;
        l.position.copy(f.group.position); l.position.y += 2.5 * f.size; l.distance = 22 * f.size;
        l.intensity = (26 + 10 * Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2)) * g * (1 + raidK * 0.6);
      });
      // embers
      if (embers.visible) {
        const cp = camera.position, cq = (camera as THREE.Camera).quaternion;
        for (let i = 0; i < embers.count; i++) {
          const v = ev[i];
          v.p.x += Math.sin(t * 1.7 + v.ph) * 0.9 * dt + 0.6 * dt; v.p.y += 1.1 * v.k * dt; v.p.z += Math.cos(t * 1.3 + v.ph * 1.7) * 0.9 * dt;
          if (v.p.y > 16) { v.p.y = -1; v.p.x = (R() - 0.5) * 36; v.p.z = (R() - 0.5) * 36; }
          if (v.p.x < -18) v.p.x += 36; if (v.p.x > 18) v.p.x -= 36; if (v.p.z < -18) v.p.z += 36; if (v.p.z > 18) v.p.z -= 36;
          const fl = 0.6 + 0.4 * Math.sin(t * 9 + v.ph * 3);
          m4.compose(new THREE.Vector3(cp.x + v.p.x, cp.y - 3 + v.p.y, cp.z + v.p.z), cq, new THREE.Vector3(v.s * fl, v.s * fl, 1));
          embers.setMatrixAt(i, m4);
        }
        embers.instanceMatrix.needsUpdate = true;
      }
      const c = camera.position;
      for (let i = 0; i < pv.length; i++) {
        const v = pv[i];
        v.p.x += (Math.sin(t * 0.7 + v.ph) * 0.4 - 0.9) * dt * v.s; v.p.y -= 0.55 * dt * v.s; v.p.z += Math.cos(t * 0.5 + v.ph) * 0.3 * dt;
        if (v.p.y < -2) { v.p.y = 14; }
        if (v.p.x < -20) v.p.x += 40; if (v.p.x > 20) v.p.x -= 40; if (v.p.z < -20) v.p.z += 40; if (v.p.z > 20) v.p.z -= 40;
        e.set(t * 2 + v.ph, t * 1.3 + v.ph, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(c.x + v.p.x, c.y - 4 + v.p.y, c.z + v.p.z), q, one);
        petals.setMatrixAt(i, m4);
      }
      petals.instanceMatrix.needsUpdate = true;
      void dt;
    },
  };
}
