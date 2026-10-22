// Arrival slice: wet road → sign → drawbridge → gatehouse, castle on the crag.
// Every landmark is anchored to its pixel in concept art creation_3752929161
// (1280×724 space) through the calibrated ArtAnchor camera.
import * as THREE from 'three/webgpu';
import { loadModel } from './assets';
import { collide } from './collision';
import { flameMaterial } from './fx';
import { color, float, mix, smoothstep, positionWorld, normalWorld, mx_fractal_noise_float, time, vec3, uv } from 'three/tsl';
import { ArtAnchor } from './artAnchor';
import { triplanarMaterial, uvMaterial, wetAsphalt, moatWater, setReflect } from './materials';
import { KitMaterials, crenellatedWall, roundTower, gatehouse, spireTurret, bareTree, coniferForest, rng } from './kit';

const WATER_Y = -1.2;

export interface ArrivalWorld {
  group: THREE.Group;
  torches: THREE.PointLight[];
  flames: THREE.Mesh[];
  moonDir: THREE.Vector3;
  /** Spawn on the road; yaw is body facing (model +Z). */
  spawn: { position: THREE.Vector3; yaw: number };
  gateCentre: THREE.Vector3;
  /** Fortress frame: origin = gate face centre at deck level; local −Z runs into the castle. */
  fortress: { origin: THREE.Vector3; yaw: number; gateDepth: number; gateWidth: number; wallTop: number };
}

/** Road markings: double yellow centre line, white edge lines, worn by noise. */
function roadMarkings(widthM: number, uL: number): THREE.CanvasTexture {
  const W = 512, H = 8192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const px = (m: number) => ((m - uL) / widthM) * W;
  const line = (u: number, w: number, col: string) => { g.fillStyle = col; g.fillRect(px(u - w / 2), 0, px(u + w / 2) - px(u - w / 2), H); };
  line(-0.11, 0.1, '#c9a22c');
  line(0.11, 0.1, '#c9a22c');
  line(uL + 0.35, 0.14, '#cfd2d4');
  line(uL + widthM - 0.35, 0.14, '#cfd2d4');
  // Wear: punch transparent flecks so the asphalt shows through.
  g.globalCompositeOperation = 'destination-out';
  const r = rng(9);
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = 0.25 + r() * 0.6;
    g.fillRect(r() * W, r() * H, 1 + r() * 5, 1 + r() * 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** "RAVENCREST / 12 MILES" weathered sign face. */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1d2226'); grad.addColorStop(1, '#121518');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = '#3a4046'; g.lineWidth = 14; g.strokeRect(14, 14, 996, 484);
  g.fillStyle = '#9aa1a6';
  g.textAlign = 'center';
  g.font = '600 104px Georgia, "Times New Roman", serif';
  g.fillText('RAVENCREST', 512, 230);
  g.font = '600 78px Georgia, "Times New Roman", serif';
  g.fillText('12 MILES', 512, 360);
  const r = rng(4);
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${40 + r() * 30},${30 + r() * 20},${20 + r() * 15},${0.08 + r() * 0.2})`;
    g.beginPath(); g.ellipse(r() * 1024, r() * 512, 2 + r() * 30, 1 + r() * 8, r() * 3, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


export async function buildArrival(A: ArtAnchor, renderer: THREE.WebGPURenderer): Promise<ArrivalWorld> {
  const group = new THREE.Group();
  group.name = 'arrival';
  const R = rng(1234);

  // ── Materials ───────────────────────────────────────────────────────────
  // Grey coursed stone (the art's fortress masonry). castle_brick_07 is red clay brick — wrong.
  const stone = triplanarMaterial('castle_wall_slates', { metresPerTile: 3.6, tint: 0x8e959f, desat: 0.45, roughnessScale: 1.05, wetBase: WATER_Y });
  const distantStone = triplanarMaterial('castle_wall_slates', { metresPerTile: 6, tint: 0x6b7280 });
  const roof = triplanarMaterial('roof_slates_02', { metresPerTile: 2.4, tint: 0x5d6673, roughnessScale: 0.7, bump: 0.8 });
  const rock = triplanarMaterial('cliff_side', { metresPerTile: 8, tint: 0x5a606a });
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.9 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x020304, roughness: 1 });
  const windowGlow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffa04a).multiplyScalar(4) });
  const K: KitMaterials = { stone, roof, dark, iron, windowGlow };
  const Kd: KitMaterials = { ...K, stone: distantStone };

  // ── Road (anchored to the yellow centre line and both edge lines) ─────
  const P0 = A.onY(578, 724, 0);
  const P1 = A.onY(640, 505, 0);
  const fwd = new THREE.Vector3(P1.x - P0.x, 0, P1.z - P0.z).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const toLocal = (p: THREE.Vector3) => { const d = p.clone().sub(P0); return { u: d.dot(right), v: d.dot(fwd) }; };
  const fromLocal = (u: number, v: number, y = 0) => P0.clone().addScaledVector(right, u).addScaledVector(fwd, v).setY(y);
  // Edge lines read from the art: left white line exits frame ~(-200,724), right ~(1180,724).
  const uL = toLocal(A.onY(-200, 724, 0)).u;
  const uR = toLocal(A.onY(1180, 724, 0)).u;
  const vEnd = toLocal(P1).v;
  const vStart = -40;
  const roadW = uR - uL;
  const roadLen = vEnd - vStart;
  {
    const geo = new THREE.PlaneGeometry(roadW, roadLen, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = wetAsphalt([roadW / 3, roadLen / 3], roadMarkings(roadW, uL));
    const road = new THREE.Mesh(geo, m);
    const c = fromLocal((uL + uR) / 2, (vStart + vEnd) / 2, 0.02);
    road.position.copy(c);
    road.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    road.receiveShadow = true;
    group.add(collide(road));
  }

  // ── Bridge / apron anchors ──────────────────────────────────────────────
  const bridgeStartL = A.onY(662, 491, 0.15);
  const bridgeStartR = A.onY(838, 491, 0.15);
  const gateBase = A.onY(770, 437, 0.15);
  const bridgeStart = bridgeStartL.clone().lerp(bridgeStartR, 0.5);
  const bridgeW = bridgeStartL.distanceTo(bridgeStartR);

  // ── Terrain (road-local shaping: left bank, right drop to the moat) ────
  const heightLocal = (u: number, v: number) => {
    const offL = uL - u;
    let h = 0;
    if (offL > 0) h += smooth(0, 11, offL) * 6.5 * (1 - smooth(vEnd - 6, vEnd + 4, v));
    const offR = u - (uR + 0.6);
    let drop = 0;
    if (offR > 0) drop = Math.min(drop, -smooth(0, 3, offR) * 4);
    if (v > vEnd + 0.5 && offL < 0) drop = Math.min(drop, -smooth(0, 3, v - vEnd - 0.5) * 4);
    h += drop;
    const off = Math.max(offL, offR, v - vEnd);
    if (off > 0) h += (fbm2(u * 0.18, v * 0.18) - 0.5) * 1.6 * smooth(0, 3, off);
    return h;
  };
  {
    const uMin = -60, uMax = 50, v0 = -40, v1 = vEnd + 40;
    const geo = new THREE.PlaneGeometry(uMax - uMin, v1 - v0, 220, 160);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = uMin + (pos.getX(i) + (uMax - uMin) / 2);
      const v = v0 + (pos.getY(i) + (v1 - v0) / 2);
      const w = fromLocal(u, v, heightLocal(u, v) - 0.03);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    geo.computeVertexNormals();
    const ground = triplanarMaterial('forest_ground_04', { metresPerTile: 3.5, tint: 0x6d6a62 });
    const rocky = triplanarMaterial('cliff_side', { metresPerTile: 5, tint: 0x4a4f57 });
    const m = new THREE.MeshStandardNodeMaterial();
    const slope = smoothstep(float(0.85), float(0.6), normalWorld.y);
    type V3 = ReturnType<typeof vec3>;
    type F1 = ReturnType<typeof float>;
    m.colorNode = mix(ground.colorNode as V3, rocky.colorNode as V3, slope).mul(0.22);
    m.roughnessNode = mix(ground.roughnessNode as F1, rocky.roughnessNode as F1, slope);
    m.normalNode = rocky.normalNode;
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    group.add(collide(mesh));
  }

  // ── Moat ────────────────────────────────────────────────────────────────
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 900), moatWater());
    water.rotation.x = -Math.PI / 2;
    water.position.set(gateBase.x, WATER_Y, gateBase.z + 200);
    group.add(water);
  }

  // ── Apron between road end and drawbridge ──────────────────────────────
  {
    const apronFar = toLocal(bridgeStart).v + 0.4;
    const uA = Math.min(uL, toLocal(bridgeStartL).u - 3.5);
    const uB = Math.max(uR, toLocal(bridgeStartR).u + 3.5);
    const geo = new THREE.BoxGeometry(uB - uA, 5, apronFar - vEnd + 0.5);
    const m = triplanarMaterial('cobblestone_floor_04', { metresPerTile: 2.5, tint: 0x5d6067, roughnessScale: 0.45 });
    setReflect(m, 0.6, 0.15);
    const apron = new THREE.Mesh(geo, m);
    apron.position.copy(fromLocal((uA + uB) / 2, (vEnd - 0.5 + apronFar) / 2, -2.49));
    apron.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    apron.receiveShadow = true;
    group.add(collide(apron));
  }

  // ── Drawbridge deck, rails, chains ──────────────────────────────────────
  const bridgeDir = new THREE.Vector3().subVectors(gateBase, bridgeStart).setY(0);
  const bridgeLen = bridgeDir.length();
  bridgeDir.normalize();
  const bridgeYaw = Math.atan2(-bridgeDir.x, -bridgeDir.z);
  {
    const deck = new THREE.Group();
    const planks = uvMaterial('weathered_planks', [1, bridgeLen / 2.4], { tint: 0x7a6d60, roughnessScale: 0.55 });
    setReflect(planks, 0.45, 0.25);
    const d = new THREE.Mesh(new THREE.BoxGeometry(bridgeW, 0.35, bridgeLen), planks);
    d.position.set(0, 0, -bridgeLen / 2);
    d.receiveShadow = true;
    deck.add(d);
    const beamMat = uvMaterial('weathered_planks', [0.3, 4], { tint: 0x4f463e });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, bridgeLen), beamMat);
      rail.position.set(side * (bridgeW / 2 - 0.1), 1.05, -bridgeLen / 2);
      deck.add(rail);
      for (let s = 0; s <= bridgeLen; s += 2.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), beamMat);
        post.position.set(side * (bridgeW / 2 - 0.1), 0.55, -s);
        deck.add(post);
      }
      // Drawbridge chain: from the deck's outer edge up into the gate towers.
      const a = new THREE.Vector3(side * (bridgeW / 2 - 0.1), 1.1, -bridgeLen * 0.12);
      const b = new THREE.Vector3(side * (bridgeW / 2 + 0.4), A.heightAt(side < 0 ? 713 : 803, 327, gateBase), -bridgeLen + 0.5);
      const links = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.8, 0)), b]), 64, 0.07, 6);
      deck.add(new THREE.Mesh(links, iron));
    }
    // Support piers into the water.
    for (let s = 6; s < bridgeLen - 2; s += 9) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(bridgeW * 0.9, 4, 1.2), stone);
      pier.position.set(0, -2.2, -s);
      deck.add(pier);
    }
    deck.position.copy(bridgeStart).setY(0.0);
    deck.rotation.y = bridgeYaw;
    group.add(collide(deck));
  }

  // ── Torch pillars (braziers) flanking the bridge ────────────────────────
  const torches: THREE.PointLight[] = [];
  const flames: THREE.Mesh[] = [];
  const flameMat = flameMaterial();
  const addFlame = (p: THREE.Vector3, size: number, intensity: number) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.6, size), flameMat);
    f.position.copy(p).add(new THREE.Vector3(0, size / 2, 0));
    flames.push(f);
    group.add(f);
    const l = new THREE.PointLight(0xff8a3c, intensity, 0, 2);
    l.position.copy(p).add(new THREE.Vector3(0, size * 0.9, 0));
    torches.push(l);
    group.add(l);
  };
  for (const [cx, lx, rx, topY] of [[626, 600, 653, 430], [883, 851, 915, 432]] as const) {
    const base = A.onY(cx, 494, 0);
    const w = A.widthAt(lx, rx, 494, base);
    const h = A.heightAt(cx, topY, base);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(w, h + 4, w), stone);
    pillar.position.copy(base).setY((h - 4) / 2);
    group.add(collide(pillar));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, 0.3, w * 1.12), stone);
    cap.position.copy(base).setY(h + 0.15);
    group.add(collide(cap));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.2, 0.45, 12, 1, true), iron);
    bowl.position.copy(base).setY(h + 0.5);
    group.add(bowl);
    addFlame(base.clone().setY(h + 0.45), 0.85, 45);
  }

  // ── Gatehouse, gate towers, curtain walls, corner towers ───────────────
  const facade = gateBase.clone().setY(WATER_Y);
  const facadeYaw = Math.atan2(-(gateBase.x - A.camera.position.x), -(gateBase.z - A.camera.position.z));
  const facadeRight = new THREE.Vector3(Math.cos(facadeYaw), 0, -Math.sin(facadeYaw));
  const towardEye = new THREE.Vector3(Math.sin(facadeYaw), 0, Math.cos(facadeYaw));
  const onFacade = (px: number, depthOffset = 0) => {
    const p = A.onFacade(px, 437, gateBase).setY(WATER_Y);
    return p.addScaledVector(towardEye, depthOffset);
  };
  const H = (px: number, py: number) => A.heightAt(px, py, gateBase) - WATER_Y;
  const W = (a: number, b: number) => A.widthAt(a, b, 437, gateBase);
  {
    const gw = W(719, 825);
    const gh = H(772, 299);
    const gh0 = new THREE.Group();
    const deckRise = 0.15 - WATER_Y;
    const gate = gatehouse(K, gw, gh - deckRise, 12, W(730, 810), A.heightAt(770, 345, gateBase) - 0.15);
    gate.position.y = deckRise; // arch springs from deck level
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(gw, deckRise, 12), stone);
    plinth.position.set(0, deckRise / 2, -6);
    gh0.add(gate, plinth);
    gh0.position.copy(onFacade(772));
    gh0.rotation.y = facadeYaw;
    group.add(collide(gh0));
    // Portcullis half-raised inside the arch (Poly Haven large_iron_gate).
    // Portcullis raised into its slot: the bottom bars hang just inside the arch crown.
    loadModel('large_iron_gate').then((g) => {
      fitTo(g, W(732, 808), undefined);
      g.rotation.y = facadeYaw;
      g.position.copy(onFacade(770, -1.5));
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g);
      g.position.y += (A.heightAt(770, 345, gateBase) - 0.5) - b.min.y;
      group.add(g);
    }).catch(() => {});
  }
  const towers: [number, number, number, number, number][] = [
    // cx, left px, right px, parapet top py, cone tip py
    [682, 645, 719, 272, 230],
    [868, 825, 911, 263, 220],
  ];
  for (const [cx, l, r, top, tip] of towers) {
    const radius = W(l, r) / 2;
    const h = H(cx, top) - 3.5;
    const roofH = H(cx, tip) - H(cx, top) + 1.2;
    const t = roundTower(K, radius, h, roofH, { slits: 3 });
    t.position.copy(onFacade(cx, radius * 0.55));
    t.rotation.y = facadeYaw;
    group.add(collide(t));
  }
  // Raven banners — cut from the supplied concept art sheets.
  const bannerTex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const bannerMat = new THREE.MeshStandardNodeMaterial({ map: bannerTex, transparent: true, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide });
  for (const [l, r, top, bot, tower] of [[663, 688, 310, 390, 0], [855, 883, 300, 383, 1]] as const) {
    const [cx, tl, tr] = towers[tower];
    const radius = W(tl, tr) / 2;
    const bw = W(l, r), bh = H((l + r) / 2, top) - H((l + r) / 2, bot);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh, 1, 8), bannerMat);
    b.position.copy(onFacade((l + r) / 2, radius * 1.6)).setY(WATER_Y + H((l + r) / 2, bot) + bh / 2);
    b.rotation.y = facadeYaw;
    void cx;
    group.add(b);
  }
  // Curtain walls (top heights read from the art's merlon line).
  const walls: [number, number, number, number][] = [
    // left px, right px, top py, recess (m behind the gate face)
    [300, 416, 333, 2],
    [478, 646, 327, 0],
    [910, 1038, 320, 0],
    [1099, 1162, 345, 6],
    [1198, 1400, 350, 10],
  ];
  for (const [l, r, top, recess] of walls) {
    const len = W(l, r);
    const h = H((l + r) / 2, top) - 1.3;
    const w = new THREE.Mesh(crenellatedWall(len, h, 4), stone);
    w.position.copy(onFacade((l + r) / 2, -recess));
    w.rotation.y = facadeYaw;
    // Fortress pieces don't cast moon shadows: the low backlight would black out the
    // whole road, which the art (sensibly) ignores.
    w.receiveShadow = true;
    group.add(collide(w));
  }
  for (const [cx, l, r, top, tip, recess] of [[447, 415, 479, 303, 257, 0], [1068, 1037, 1100, 307, 267, 2], [1180, 1160, 1200, 337, 310, 8]] as const) {
    const radius = W(l, r) / 2;
    const t = roundTower(K, radius, H(cx, top) - 3.5, H(cx, tip) - H(cx, top) + 1.2);
    t.position.copy(onFacade(cx, radius * 0.4 - recess));
    t.rotation.y = facadeYaw;
    group.add(collide(t));
  }
  // Gate lanterns.
  for (const [px, py] of [[721, 323], [820, 321], [708, 393], [821, 393]] as const) {
    const p = A.onFacade(px, py, gateBase).addScaledVector(towardEye, 0.6);
    addFlame(p.clone().add(new THREE.Vector3(0, -0.25, 0)), 0.45, 5);
  }

  // ── Crag + distant castle (D ≈ 430 m) ───────────────────────────────────
  const D = 430;
  {
    const ridge: [number, number][] = [
      [250, 360], [380, 330], [470, 306], [560, 286], [620, 262], [690, 238], [735, 222], [790, 214], [880, 210],
      [960, 214], [1030, 226], [1090, 238], [1150, 250], [1210, 258], [1280, 262], [1400, 270],
    ];
    const top = ridge.map(([px, py]) => A.atDistance(px, py, D));
    const cols = top.length, rows = 14;
    const geo = new THREE.BufferGeometry();
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const t = j / (rows - 1);
        const p = top[i].clone();
        const toward = new THREE.Vector3().subVectors(A.camera.position, p).setY(0).normalize();
        // Slope falls toward the viewer and down to the moat behind the wall.
        p.addScaledVector(toward, t * 150);
        p.y = THREE.MathUtils.lerp(p.y, -10, Math.pow(t, 0.7)) + (fbm2(i * 0.7, j * 0.9) - 0.5) * 18 * Math.sin(t * Math.PI);
        verts.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const crag = new THREE.Mesh(geo, rock);
    crag.name = 'crag';
    crag.material.side = THREE.DoubleSide;
    group.add(crag);
    // Conifer silhouettes along the crag (right side and lower slopes in the art).
    const pines: { p: THREE.Vector3; h: number }[] = [];
    for (let i = 0; i < 700; i++) {
      const c = Math.floor(R() * (cols - 1)), j = 1 + Math.floor(R() * (rows * 0.55));
      const a = new THREE.Vector3(verts[(c * rows + j) * 3], verts[(c * rows + j) * 3 + 1], verts[(c * rows + j) * 3 + 2]);
      const b = new THREE.Vector3(verts[((c + 1) * rows + j) * 3], verts[((c + 1) * rows + j) * 3 + 1], verts[((c + 1) * rows + j) * 3 + 2]);
      pines.push({ p: a.lerp(b, R()), h: 7 + R() * 6 });
    }
    group.add(coniferForest(pines, new THREE.MeshStandardNodeMaterial({ color: 0x0b1012, roughness: 1 })));
  }
  {
    // Castle pieces: [kind, centre px, left px, right px, body-top py, tip py, base py]
    type Piece = ['spire' | 'square' | 'hall', number, number, number, number, number, number];
    const pieces: Piece[] = [
      ['spire', 959, 945, 973, 102, 58, 215],   // main keep, tallest, right of the moon
      ['spire', 816, 800, 833, 127, 83, 217],   // left great tower
      ['spire', 872, 857, 888, 127, 80, 215],   // centre tower
      ['spire', 926, 920, 933, 123, 105, 160],  // slim spire over the hall
      ['spire', 803, 798, 808, 128, 117, 165],  // flanking turrets
      ['spire', 836, 831, 841, 130, 118, 165],
      ['spire', 857, 852, 862, 125, 112, 165],
      ['spire', 888, 883, 893, 125, 112, 165],
      ['spire', 758, 752, 765, 172, 153, 222],  // left wing turret
      ['spire', 999, 985, 1013, 170, 143, 232], // right wing tower
      ['spire', 977, 972, 983, 160, 147, 222],
      ['spire', 1075, 1062, 1087, 202, 185, 258], // far right tower
      ['spire', 1048, 1044, 1053, 210, 203, 250],
      ['hall', 918, 888, 947, 137, 120, 215],   // main hall with pitched roof
      ['square', 772, 745, 800, 180, 172, 226], // left wing block
      ['square', 895, 790, 1000, 165, 160, 225],// connecting mass
      ['square', 1030, 1013, 1062, 205, 198, 250],
      // Smaller pinnacle turrets visible in the art crop (roofline clutter that sells the scale).
      ['spire', 790, 786, 795, 150, 136, 176],
      ['spire', 905, 902, 909, 128, 116, 150],
      ['spire', 946, 943, 950, 126, 113, 150],
      ['spire', 1012, 1008, 1016, 158, 146, 182],
      ['spire', 1088, 1085, 1091, 214, 205, 236],
      ['spire', 742, 739, 746, 190, 178, 212],
    ];
    const castle = new THREE.Group();
    const windows: THREE.Vector3[] = [];
    for (const [kind, cx, l, r, topY, tipY, baseY] of pieces) {
      const base = A.atDistance(cx, baseY, D);
      const w = A.widthAt(l, r, baseY, base);
      const bodyH = A.heightAt(cx, topY, base) - base.y;
      const roofH = A.heightAt(cx, tipY, base) - A.heightAt(cx, topY, base);
      let obj: THREE.Object3D;
      if (kind === 'spire') obj = spireTurret(Kd, w / 2, bodyH, roofH);
      else if (kind === 'square') {
        const block = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, Math.min(w, 30)), distantStone);
        body.position.y = bodyH / 2;
        const crown = new THREE.Mesh(crenellatedWall(w, 0.01, 1.5, 2.2, 1.6, 2.2), distantStone);
        crown.position.set(0, bodyH, Math.min(w, 30) / 2);
        block.add(body, crown);
        obj = block;
      }
      else {
        const hall = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, w * 0.6), distantStone);
        body.position.y = bodyH / 2;
        const tri = new THREE.Shape();
        tri.moveTo(-w * 0.3, 0); tri.lineTo(w * 0.3, 0); tri.lineTo(0, roofH); tri.closePath();
        const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: w * 0.98, bevelEnabled: false });
        roofGeo.translate(0, 0, -w * 0.49);
        roofGeo.rotateY(Math.PI / 2);
        const rf = new THREE.Mesh(roofGeo, roof);
        rf.position.y = bodyH;
        hall.add(body, rf);
        obj = hall;
      }
      obj.position.copy(base);
      obj.lookAt(A.camera.position.x, base.y, A.camera.position.z);
      castle.add(obj);
      // Lancet windows in storeys and bays on the face toward the viewer; ~45% lit (art).
      const toEye = new THREE.Vector3().subVectors(A.camera.position, base).setY(0).normalize();
      const side = toEye.clone().cross(new THREE.Vector3(0, 1, 0));
      const faceOff = kind === 'spire' ? w * 0.5 : kind === 'hall' ? w * 0.3 : Math.min(w, 30) / 2;
      const cols = Math.max(1, Math.floor(w / 4.6)), rows = Math.max(1, Math.floor(bodyH / 7.5));
      for (let ry = 0; ry < rows; ry++) for (let cx2 = 0; cx2 < cols; cx2++) {
        if (R() > 0.45) continue;
        const u = cols === 1 ? 0 : (cx2 / (cols - 1) - 0.5) * w * 0.72;
        const p = base.clone().add(new THREE.Vector3(0, bodyH * ((ry + 0.55) / (rows + 0.3)), 0)).addScaledVector(toEye, faceOff + 0.2).addScaledVector(side, u);
        windows.push(p);
      }
      // Roofline clutter: ridge pinnacles on the hall, corner turrets on square masses.
      if (kind === 'hall') {
        for (let k = -2; k <= 2; k++) {
          const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 6), roof);
          pin.position.copy(base).add(new THREE.Vector3(0, bodyH + roofH + 1.5, 0)).addScaledVector(side, k * w * 0.18);
          castle.add(pin);
        }
      } else if (kind === 'square' && w > 15) {
        for (const sgn of [-1, 1]) {
          const t = spireTurret(Kd, 1.6, 4, 6, 6);
          t.position.copy(base).add(new THREE.Vector3(0, bodyH, 0)).addScaledVector(side, sgn * (w / 2 - 1.6)).addScaledVector(toEye, Math.min(w, 30) / 2 - 1.6);
          castle.add(t);
        }
      }
    }
    // Base curtain wall ringing the crag top (art: crenellated outer ward below the castle).
    {
      const ring: [number, number][] = [[735, 228], [800, 232], [880, 230], [960, 234], [1030, 244], [1095, 256]];
      for (let k = 0; k < ring.length - 1; k++) {
        const a = A.atDistance(ring[k][0], ring[k][1], D - 25), b = A.atDistance(ring[k + 1][0], ring[k + 1][1], D - 25);
        const len = a.distanceTo(b);
        const wall = new THREE.Mesh(crenellatedWall(len, 10, 3, 2.2, 1.6, 2.2), distantStone);
        wall.position.copy(a.clone().lerp(b, 0.5)).setY(Math.min(a.y, b.y) - 2);
        wall.lookAt(A.camera.position.x, wall.position.y, A.camera.position.z); // distant: segments just face the viewer
        castle.add(wall);
        if (k % 2 === 0) windows.push(wall.position.clone().add(new THREE.Vector3(0, 5, 0)).addScaledVector(new THREE.Vector3().subVectors(A.camera.position, wall.position).setY(0).normalize(), 1.7));
      }
    }
    const winGeo = new THREE.PlaneGeometry(1.0, 2.4);
    const win = new THREE.InstancedMesh(winGeo, windowGlow, windows.length);
    const mm = new THREE.Matrix4();
    windows.forEach((p, i) => {
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(A.camera.position.clone().setY(p.y), p, new THREE.Vector3(0, 1, 0)));
      mm.compose(p, q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + R() * 0.5));
      win.setMatrixAt(i, mm);
    });
    castle.add(win);
    group.add(castle);
  }

  // ── Left bank: sign, raven, bare oaks, rocks ────────────────────────────
  const signBaseL = A.onY(122, 522, 0.4);
  const signBaseR = A.onY(278, 522, 0.4);
  {
    const sign = new THREE.Group();
    const mid = signBaseL.clone().lerp(signBaseR, 0.5);
    const w = signBaseL.distanceTo(signBaseR) * 1.18;
    const top = A.heightAt(200, 288, mid), bot = A.heightAt(200, 398, mid);
    const postMat = uvMaterial('weathered_planks', [0.3, 2], { tint: 0x3c3a37 });
    for (const p of [signBaseL, signBaseR]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, top + 0.4, 0.16), postMat);
      post.position.copy(p).setY((top + 0.4) / 2);
      sign.add(post);
    }
    const face = new THREE.MeshStandardNodeMaterial({ map: signTexture(), roughness: 0.55, metalness: 0.35 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, top - bot, 0.08), [postMat, postMat, postMat, postMat, face, postMat]);
    board.position.copy(mid).setY((top + bot) / 2);
    board.lookAt(A.camera.position.x, board.position.y, A.camera.position.z);
    sign.add(board);
    sign.children.forEach((c) => { c.castShadow = true; });
    group.add(collide(sign));
    // Raven perched on the top-right corner of the sign.
    const raven = makeRaven();
    raven.position.copy(A.onFacade(246, 288, mid)).setY(top + 0.02);
    raven.lookAt(A.camera.position.x, raven.position.y, A.camera.position.z);
    raven.rotateY(-0.9);
    group.add(raven);
  }
  {
    const bark = triplanarMaterial('rock_face', { metresPerTile: 1.5, tint: 0x141312, roughnessScale: 1 });
    for (const [px, py, d, h, seed] of [[30, 395, 22, 17, 3], [185, 330, 34, 15, 8], [300, 395, 40, 9, 12], [-60, 420, 14, 16, 21], [470, 330, 70, 8, 5]] as const) {
      const p = A.atDistance(px, py, d);
      const loc = toLocal(p);
      p.y = heightLocal(loc.u, loc.v) - 0.4;
      const t = bareTree(seed, h, bark);
      t.position.copy(p);
      t.rotation.y = seed;
      group.add(t);
    }
    // Poly Haven rock scans on the bank.
    const rockSpots: [string, number, number, number, number][] = [
      ['boulder_01', 395, 512, 0.7, 0.4]
    ];
    for (const [id, px, py, scale, rotY] of rockSpots) {
      loadModel(id).then((g) => {
        const p = A.atDistance(px, py, 9 + scale * 6);
        const loc = toLocal(p);
        g.position.copy(p).setY(heightLocal(loc.u, loc.v) - 0.3);
        g.scale.multiplyScalar(scale);
        g.rotation.y = rotY;
        // Scans are daylight-albedo sandstone; the art's bank is near-black wet slate.
        g.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (mat?.color) { mat.color.setRGB(0.07, 0.075, 0.085); mat.roughness = 0.55; if ('emissive' in mat) mat.emissive.setRGB(0, 0, 0); }
        });
        group.add(collide(g));
      }).catch(() => {});
    }
  }

  // ── Guardrail along the right edge to the bridge ────────────────────────
  {
    const pts = [[1400, 655], [1280, 620], [1150, 570], [1000, 538], [880, 520], [795, 508]].map(([px, py]) => A.onY(px, py, 0.72));
    const near = fromLocal(uR + 0.55, vStart, 0.72);
    const railPath = new THREE.CatmullRomCurve3([near, ...pts]);
    const prof = new THREE.Shape();
    // W-beam cross-section (metres).
    prof.moveTo(0, -0.17); prof.lineTo(0.04, -0.12); prof.lineTo(0, -0.04); prof.lineTo(0.04, 0.04); prof.lineTo(0, 0.12); prof.lineTo(0.04, 0.17);
    prof.lineTo(0.06, 0.17); prof.lineTo(0.02, 0.12); prof.lineTo(0.06, 0.04); prof.lineTo(0.02, -0.04); prof.lineTo(0.06, -0.12); prof.lineTo(0.02, -0.17); prof.closePath();
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { steps: 160, extrudePath: railPath, bevelEnabled: false }), new THREE.MeshStandardNodeMaterial({ color: 0x5f6469, roughness: 0.5, metalness: 0.75 }));
    rail.castShadow = true;
    group.add(collide(rail));
    const postGeo = new THREE.BoxGeometry(0.12, 0.95, 0.12);
    const postMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a4d50, roughness: 0.5, metalness: 0.8 });
    const reflMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3) });
    const n = Math.floor(railPath.getLength() / 2);
    const posts = new THREE.InstancedMesh(postGeo, postMat, n);
    const refl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), reflMat, Math.ceil(n / 3));
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = railPath.getPointAt(i / n);
      m.makeTranslation(p.x + right.x * 0.12, p.y - 0.3, p.z + right.z * 0.12);
      posts.setMatrixAt(i, m);
      if (i % 3 === 0) { m.makeTranslation(p.x - right.x * 0.05, p.y + 0.02, p.z - right.z * 0.05); refl.setMatrixAt(i / 3, m); }
    }
    group.add(posts, refl);
  }

  // ── Low fog banks hugging the moat and the crag ─────────────────────────
  group.add(fogBanks(A, gateBase, D));

  const moonDir = A.rayAt(920, 75).direction.clone().normalize();
  void renderer;
  return {
    group, torches, flames, moonDir,
    spawn: { position: fromLocal(0.5 * uR, 6, 0.05), yaw: Math.atan2(fwd.x, fwd.z) },
    gateCentre: gateBase,
    fortress: {
      origin: onFacade(772).setY(0.15),
      yaw: facadeYaw,
      gateDepth: 12,
      gateWidth: W(719, 825),
      wallTop: A.heightAt(560, 327, gateBase),
    },
  };
}

// ── helpers ────────────────────────────────────────────────────────────────
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x: number, y: number) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s / 0.9375;
}

function fitTo(obj: THREE.Object3D, width: number, height?: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = height ? Math.min(width / size.x, height / size.y) : width / size.x;
  obj.scale.multiplyScalar(s);
}

/** Simple low-poly raven silhouette (stand-in until the hero raven is built). */
function makeRaven(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x07080a, roughness: 0.35, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m);
  body.scale.set(0.8, 0.85, 1.6);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), m);
  head.position.set(0, 0.36, 0.2);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 6), m);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.35, 0.33);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.28), m);
  tail.position.set(0, 0.13, -0.3);
  tail.rotation.x = -0.4;
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1), m);
    leg.position.set(s * 0.04, 0.05, 0);
    g.add(leg);
  }
  g.add(body, head, beak, tail);
  return g;
}

/** Soft, slowly drifting fog cards along the moat and at the crag's foot. */
function fogBanks(A: ArtAnchor, gate: THREE.Vector3, D: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const u = uv();
  const n = mx_fractal_noise_float(vec3(u.x.mul(4).add(time.mul(0.012)).add(positionWorld.x.mul(0.004)), u.y.mul(1.5), time.mul(0.02)), 3, 2, 0.5, 1);
  const edge = smoothstep(float(0), float(0.25), u.x).mul(smoothstep(float(1), float(0.75), u.x)).mul(smoothstep(float(0), float(0.3), u.y)).mul(smoothstep(float(1), float(0.35), u.y));
  mat.colorNode = color(0x8193ad).mul(0.55);
  mat.opacityNode = smoothstep(float(-0.2), float(0.7), n).mul(edge).mul(0.3);
  const R = rng(55);
  const add = (centre: THREE.Vector3, w: number, h: number) => {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    card.position.copy(centre);
    card.lookAt(A.camera.position.x, centre.y, A.camera.position.z);
    g.add(card);
  };
  for (let i = 0; i < 10; i++) {
    const px = 200 + i * 120 + R() * 60;
    add(A.onFacade(px, 430, gate).setY(WATER_Y + 1.8 + R() * 2.5).addScaledVector(new THREE.Vector3(0, 0, 1), 4 + R() * 14), 55 + R() * 25, 7 + R() * 4);
  }
  for (let i = 0; i < 5; i++) {
    const px = 450 + i * 190 + R() * 50;
    const p = A.atDistance(px, 280 + R() * 30, D * (0.7 + R() * 0.2));
    add(p, 140, 40);
  }
  return g;
}
