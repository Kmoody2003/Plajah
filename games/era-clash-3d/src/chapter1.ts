// Chapter I, "Smoke Over the Valley" (The coastal villages): the shore where the wakō land, the village road
// with its storehouses burning and the watchtower bell, then the climb to the hilltop of the Kyoto Dusk painting
// (stage-japan.webp): the wooden platform, the five-storey pagoda and the cherry trees, with the painting itself
// hung as the far backdrop. +Z runs up the valley; sea level is y = 0.
import * as THREE from 'three/webgpu';
import { color, positionWorld, normalize, mix, smoothstep, vertexColor, texture, uv, vec2, vec3, time, sin, float, instancedBufferAttribute, uniform } from 'three/tsl';
import { collide } from './core/collision';
import { uvMaterial } from './core/materials';
import { foliagedTree, leafCardMaterial } from './core/foliage';
import { rng } from './core/kit';
import { buildTerrain, buildSea, type Splat } from './ground';
import { buildGrassField, type GrassField } from './grassField';
import { buildVillage, type Village } from './village';
import { buildLandmarks } from './landmarks';
import { buildOtsu, OTSU } from './otsu';

export interface Fire { group: THREE.Group; light: THREE.PointLight; flames: THREE.Mesh[]; smoke: THREE.Mesh[]; seed: number; size: number; raid: boolean }
export interface Section { name: string; zMin: number; zMax: number; spawn: THREE.Vector3[] }
export interface Chapter1World {
  group: THREE.Group;
  grass: GrassField | null;
  spawn: { position: THREE.Vector3; yaw: number };
  sections: Section[];
  fires: Fire[];
  bell: THREE.Object3D;
  petals: THREE.InstancedMesh;
  /** The village's loose props and the villagers' huddles (village.ts). */
  village: Village;
  heightAt(x: number, z: number): number;
  update(dt: number, t: number, camera: THREE.Camera): void;
  /** The raid at dusk (look.ts): 0 golden hour → 1 the town burning. Raid fires, embers, lantern glow. */
  setRaid(k: number): void;
}

const X_HALF = 75, Z_MIN = -120, Z_MAX = 175;

/** Ground height: sea → beach → village terrace → hill → the painting's hilltop, with valley walls. */
export function heightAt(x: number, z: number): number {
  const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let y = -2.2 + 3.6 * ss(-100, -62, z);                  // the beach climbs out of the sea
  y += 0.8 * ss(-60, 30, z);                               // the village terrace, gently rising
  y += 14.8 * ss(42, 112, z);                              // the hill
  y += 0.35 * Math.sin(x * 0.11 + z * 0.07) * ss(-70, -40, z) + 0.25 * Math.sin(x * 0.23 - z * 0.13);
  const wall = Math.max(0, Math.abs(x) - 42);
  y += Math.pow(wall, 1.35) * 0.32;                        // valley sides
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
/** Cherry blossom clusters for the leaf cards (alpha-tested). */
function blossomTex() {
  return canvasTex(256, 256, (g) => {
    const r = rng(11);
    for (let i = 0; i < 220; i++) {
      const x = 20 + r() * 216, y = 20 + r() * 216, s = 4 + r() * 9;
      g.fillStyle = ['#f6c1cf', '#f9d9e2', '#e89ab0', '#fbe6ec', '#d98aa2'][(r() * 5) | 0];
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
  });
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
    const town = ss(OTSU.wallZ - 1, OTSU.wallZ + 1, z) * (1 - ss(OTSU.townZ1 + 2, OTSU.townZ1 + 6, z)) * (1 - ss(28, 32, dr));
    const dirt = Math.max((1 - ss(1.6, 2.6, dr)) * onRoad, town);
    const gravel = (ss(1.4, 2.2, dr) * (1 - ss(3.2, 4.4, dr))) * onRoad * 0.9 * (1 - town);
    const grass = Math.max(0, 1 - sand - dirt - gravel);
    return { grass, dirt, gravel, sand };
  };
  const ground = buildTerrain({ xHalf: X_HALF, zMin: Z_MIN, zMax: Z_MAX, segX: 150, segZ: 300, heightAt, splatAt });
  group.add(collide(ground));
  group.add(buildSea());

  const wood = uvMaterial('weathered_planks', [2, 2], { tint: 0xb8a088 });
  const darkWood = uvMaterial('dark_wooden_planks', [2, 2]);
  const plaster = new THREE.MeshStandardNodeMaterial({ color: 0xe8dcc4, roughness: 0.95 });
  const thatch = uvMaterial('roof_slates_02', [3, 3], { tint: 0x8a6a3a });
  // kawara: CC0 grey roof tiles (one texture repeat per 2 m of roof)
  const tile = uvMaterial('grey_roof_tiles', [1, 1], { tint: 0x9aa0aa });
  const red = new THREE.MeshStandardNodeMaterial({ color: 0x9a2a1e, roughness: 0.7 });

  const at = (o: THREE.Object3D, x: number, z: number, yaw = 0, lift = 0) => { o.position.set(x, heightAt(x, z) + lift, z); o.rotation.y = yaw; group.add(o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, y = h / 2) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y; b.castShadow = b.receiveShadow = true; return b; };
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
  const PLAZA = { x: roadX(OTSU.plaza.z), z: OTSU.plaza.z, r: OTSU.plaza.r };
  const village = buildVillage({
    heightAt, roadX, mats: { wood, darkWood, plaster, thatch, tile },
    z0: OTSU.wallZ + 3, z1: OTSU.townZ1, rows: [7.6, 15.8, 24.2], plaza: PLAZA, huddleZ: [OTSU.plaza.z, 8, 31],
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
  // the landmarks of the reference shots: the volcano, the castle on its hill, forested hills between
  const landmarks = buildLandmarks({ inner: { xHalf: X_HALF, zMin: Z_MIN, zMax: Z_MAX }, heightAt });
  group.add(landmarks.group);

  // ── The street: big irregular flagstones wall to wall through the town, with kerb stones (the shots) ───
  const STREET_Z0 = OTSU.wallZ - 3, STREET_Z1 = 118, STREET_W = 4.7;
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
    const street = new THREE.Mesh(g, uvMaterial('cobblestone_large_01', [1, 1], { tint: 0xc8bcae }));
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
    // Fire lights are pooled (update below): every real point light costs on every pixel on the iGPU.
    const light = new THREE.PointLight(0xff8a3a, 0, 22 * size, 1.6);
    light.position.y = 2.5 * size; light.visible = false; g.add(light);
    at(g, x, z, 0, lift);
    if (raid) g.visible = false;
    fires.push({ group: g, light, flames, smoke, seed: R() * 10, size, raid });
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

  // ── The hilltop of the painting: the wooden platform with its railings ─────────────────────────
  const topZ = 128, topY = heightAt(0, topZ);
  const plat = new THREE.Group();
  const deckW = 14, deckD = 11;
  plat.add(box(deckW, 0.3, deckD, wood, 0.22));   // a step up from the grass (the controller climbs 0.4 m)
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { const p = box(0.4, 0.6, 0.4, darkWood, 0.0); p.position.set(px * (deckW / 2 - 0.3), 0.0, pz * (deckD / 2 - 0.3)); plat.add(p); }
  const rail = (len: number, x: number, z: number, along: 'x' | 'z') => {
    const top = box(along === 'x' ? len : 0.18, 0.16, along === 'x' ? 0.18 : len, darkWood, 1.35); top.position.x = x; top.position.z = z; plat.add(top);
    const mid = box(along === 'x' ? len : 0.12, 0.1, along === 'x' ? 0.12 : len, darkWood, 0.9); mid.position.x = x; mid.position.z = z; plat.add(mid);
    for (let i = 0; i <= Math.round(len / 2.2); i++) {
      const t = -len / 2 + (i * len) / Math.round(len / 2.2);
      const p = box(0.2, 1.05, 0.2, darkWood, 0.85); p.position.set(along === 'x' ? x + t : x, 0.85, along === 'z' ? z + t : z); plat.add(p);
    }
  };
  rail(deckW, 0, deckD / 2, 'x'); rail(deckD * 0.45, -deckW / 2, deckD * 0.27, 'z'); rail(deckD * 0.45, deckW / 2, deckD * 0.27, 'z');   // open at the front, like the painting
  plat.position.set(0, topY, topZ);
  group.add(collide(plat));

  // ── The five-storey pagoda behind the platform, off to the right as in the painting ────────────
  const pagoda = new THREE.Group();
  const lacquer = new THREE.MeshStandardNodeMaterial({ color: 0x7a2a1e, roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const w = 7.2 - i * 0.95, y = i * 3.4;
    pagoda.add(box(w, 2.6, w, lacquer, y + 1.3));
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.9, 0.9, 4, 1), tile); eave.rotation.y = Math.PI / 4; eave.position.y = y + 3.0; eave.castShadow = true; pagoda.add(eave);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 7, 8), new THREE.MeshStandardNodeMaterial({ color: 0x4a4a52, metalness: 0.6, roughness: 0.4 }));
  spire.position.y = 5 * 3.4 + 3.5; pagoda.add(spire);
  at(collide(pagoda), 26, 152);

  // ── Cherry trees: on the hill, round the hilltop and along the road ─────────────────────────────
  const blossom = leafCardMaterial(blossomTex(), 0.18);
  const tree = (x: number, z: number, h: number, seed: number) => {
    const t = foliagedTree(seed, h, { cards: 46, spread: 1.25 });
    t.foliage.material = blossom;
    // the builder tints its cards green per instance: blossom pinks instead
    const pinks = [0xffffff, 0xfff0f4, 0xffe2ea, 0xf8d8e2].map((c) => new THREE.Color(c));
    for (let i = 0; i < t.foliage.count; i++) t.foliage.setColorAt(i, pinks[i % pinks.length]);
    if (t.foliage.instanceColor) t.foliage.instanceColor.needsUpdate = true;
    (t.trunk.material as THREE.MeshStandardMaterial).color?.set?.(0x3a2a24);
    at(t.group, x, z);
  };
  const spots: [number, number, number][] = [[-12, 132, 8], [-18, 138, 9], [14, 134, 7], [-9, 148, 8.5], [10, 146, 7], [-24, 104, 7],
    [-20, 78, 6], [-22, 14, 6], [22, -18, 5.5], [-26, -34, 6]];
  const noTrees = new URLSearchParams(location.search).has('notrees');
  if (!noTrees) spots.forEach(([x, z, h], i) => tree(x, z, h, 40 + i));
  // the samurai yards: a blossom tree or a garden pine in each
  if (!noTrees) otsu.yardTrees.forEach((t, i) => {
    if (t.blossom) { tree(t.x, t.z, t.h, 80 + i); return; }
    const p = foliagedTree(120 + i, t.h, { cards: 40, spread: 1.6 });
    for (let k = 0; k < p.foliage.count; k++) p.foliage.setColorAt(k, new THREE.Color().setHSL(0.27, 0.35, 0.28 + (k % 5) * 0.03));
    if (p.foliage.instanceColor) p.foliage.instanceColor.needsUpdate = true;
    at(p.group, t.x, t.z);
  });

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
    { name: 'The Grand Marketplace', zMin: OTSU.wallZ, zMax: OTSU.samuraiGateZ - 2, spawn: [new THREE.Vector3(roadX(-2) + 1, 0, -2), new THREE.Vector3(roadX(30) + 1.2, 0, 30), new THREE.Vector3(roadX(41) - 1.2, 0, 41)] },
    { name: 'The Castle Approach', zMin: OTSU.samuraiGateZ - 2, zMax: 165, spawn: [new THREE.Vector3(8, 0, 140), new THREE.Vector3(-6, 0, 144)] },
  ];
  for (const s of sections) for (const p of s.spawn) p.y = heightAt(p.x, p.z);

  // ── Grass blades (grassField.ts): everywhere the meadow is, but never under a building, on a road or a cliff ─
  const blocked: THREE.Box3[] = [...village.footprints, ...otsu.footprints];
  group.updateMatrixWorld(true);
  for (const o of group.children) {
    if (o === ground || !o.userData.collide) continue;
    const b0 = new THREE.Box3().setFromObject(o); if (b0.isEmpty() || b0.max.x - b0.min.x > 60) continue;
    blocked.push(b0.expandByScalar(0.5));
  }
  const grassAt = (x: number, z: number) => {
    if (z > STREET_Z0 - 1 && z < STREET_Z1 + 1 && Math.abs(x - roadX(z)) < STREET_W + 1.2) return 0;   // the paved town
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 3.5) return 0;   // the market square
    const sp = splatAt(x, z); if (sp.grass < 0.3) return 0;
    const slope = Math.hypot(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
    if (slope > 0.95) return 0;
    for (const b0 of blocked) if (x > b0.min.x && x < b0.max.x && z > b0.min.z && z < b0.max.z) return 0;
    return sp.grass * (1 - Math.min(1, slope / 0.95) * 0.5);
  };
  const params0 = new URLSearchParams(location.search);
  const grass: GrassField | null = params0.has('nograss') ? null : buildGrassField(heightAt, grassAt, Number(params0.get('grass')) || 2200);
  if (grass) group.add(grass.group);

  const spawn = { position: new THREE.Vector3(roadX(-66), heightAt(roadX(-66), -66), -66), yaw: 0 };

  return {
    group, grass, spawn, sections, fires, bell, petals, heightAt, village,
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
      // the fires nearest the camera carry the real lights (two; three once the town is burning)
      const cpos = camera.position, nLights = raidK > 0.5 ? 3 : 2;
      const order = fires.filter((f) => f.group.visible).sort((a, b) => a.group.position.distanceToSquared(cpos) - b.group.position.distanceToSquared(cpos));
      for (const f of fires) if (!order.includes(f)) f.light.visible = false;
      order.forEach((f, i) => {
        const on = i < nLights, g = f.raid ? Math.min(1, raidK * 1.4) : 1;
        f.light.visible = on; f.light.intensity = on ? (26 + 10 * Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2)) * g * (1 + raidK * 0.6) : 0;
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
