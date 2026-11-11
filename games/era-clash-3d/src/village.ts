// Chapter I's village: a lived-in fishing village of two-storey row houses (machiya) packed along the road,
// a second row behind them so a narrow back alley runs the length of each side, with cross-alleys cut between
// the houses. Market stalls line the road (their tables and wares are loose props: kick the tables, throw the
// pots), barrels and crates sit at doors and down the alleys, lanterns and noren hang at the doorways, and
// firewood is stacked against the walls. Static pieces are merged per material (a few draw calls for the whole
// village, which matters on the iGPU); the loose props are returned for props.ts to simulate.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collide } from './core/collision';
import { rng } from './core/kit';
import { pbr, uvMaterial } from './core/materials';
import { attribute, texture, uv, vec3, mix, normalMap } from 'three/tsl';
import type { PropKind } from './props';

export interface VillageMats { wood: THREE.Material; darkWood: THREE.Material; plaster: THREE.Material; thatch: THREE.Material; tile: THREE.Material }
export interface Avoid { x: number; z: number; r: number }
export interface Village {
  /** Static, merged village (collision-tagged where solid). */
  group: THREE.Group;
  /** Loose props (origin at the base, placed in world space) for props.ts. */
  props: { mesh: THREE.Object3D; kind: PropKind }[];
  /** Where frightened villagers huddle, guarded by raiders (the rescue). */
  huddles: THREE.Vector3[];
  /** Building footprints (grass never grows inside them). */
  footprints: THREE.Box3[];
  /** Roof ridges where a cooking fire's smoke rises (the white plumes over the town in the shots). */
  smoke: THREE.Vector3[];
  /** Lanterns and lit shop interiors: their glow rises as dusk falls on the raid. */
  glow: { mat: THREE.MeshStandardNodeMaterial; base: number }[];
  /** Add a loose prop (for the harbour cargo and the like, built elsewhere). */
  addProp(kind: PropKind, x: number, z: number, yaw?: number, y?: number): THREE.Object3D;
}
/** The Grand Marketplace (Otsu-no-ura): an open square on the road, a ring of stalls round a well, shops facing in. */
export interface Plaza { x: number; z: number; r: number }

/** A box whose UVs run one unit per metre, so tiled materials keep their scale on any size of box. */
export function boxGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
/** A gabled roof, ridge along local X. */
export function gableGeo(w: number, d: number, h: number, over = 0.6) {
  const s = new THREE.Shape(); s.moveTo(-d / 2 - over, 0); s.lineTo(0, h); s.lineTo(d / 2 + over, 0); s.lineTo(-d / 2 - over, -0.12); s.lineTo(-d / 2 - over, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false });
  g.translate(0, 0, -(w + over * 2) / 2); g.rotateY(Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  return g;
}

export const CLAY = {
  terracotta: new THREE.MeshStandardNodeMaterial({ color: 0xa4623e, roughness: 0.85 }),
  iron: new THREE.MeshStandardNodeMaterial({ color: 0x2c1d16, roughness: 0.28 }),
  celadon: new THREE.MeshStandardNodeMaterial({ color: 0x7d9886, roughness: 0.32 }),
  ash: new THREE.MeshStandardNodeMaterial({ color: 0xb9a888, roughness: 0.6 }),
};
const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
/** Pot shapes: a small kitchen pot (throwable in one hand) and a tall storage jar. */
export const POT_GEO = {
  pot: lathe([[0.001, 0], [0.13, 0.01], [0.19, 0.12], [0.2, 0.22], [0.15, 0.33], [0.12, 0.36], [0.135, 0.39], [0.12, 0.4]]),
  jar: lathe([[0.001, 0], [0.16, 0.01], [0.3, 0.22], [0.32, 0.42], [0.26, 0.62], [0.16, 0.72], [0.17, 0.77], [0.15, 0.78]]),
};

export function buildVillage(o: { heightAt: (x: number, z: number) => number; roadX: (z: number) => number; avoid: Avoid[]; mats: VillageMats; seed?: number;
  /** Rows run from z0 to z1; `rows` are their distances from the road (three rows make the alley maze). */
  z0?: number; z1?: number; rows?: number[]; plaza?: Plaza; huddleZ?: number[] }): Village {
  const { heightAt, roadX, avoid, mats } = o;
  const R = rng(o.seed ?? 4242);
  const stone = new THREE.MeshStandardNodeMaterial({ color: 0x6d675f, roughness: 0.95 });
  // footing stone: darker and greened (damp moss) where it meets the ground
  {
    const gm = attribute<'float'>('grime', 'float'), S = pbr('japanese_stone_wall');
    const sc = texture(S.diff, uv().mul(0.6)).rgb.mul(vec3(0.75, 0.72, 0.68));
    stone.colorNode = mix(sc, sc.mul(vec3(0.55, 0.68, 0.42)), gm.mul(0.8));
    stone.normalNode = normalMap(texture(S.nor, uv().mul(0.6)));
  }
  const char = new THREE.MeshStandardNodeMaterial({ color: 0x1c1512, roughness: 0.95 });
  // cloth: indigo noren with a family crest (mon) resist-dyed white, a slubby weave; undyed hemp with its own weave
  const clothTex = (base: string, weave: string, crest: boolean) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = weave; g.globalAlpha = 0.08 + ((i * 37) % 10) / 60; g.fillRect((i * 53) % 128, (i * 97) % 256, 1 + (i % 3), 1); }
    g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 128, 1);
    g.globalAlpha = 1;
    if (crest) {
      g.strokeStyle = '#e8e4da'; g.fillStyle = '#e8e4da'; g.lineWidth = 7;
      g.beginPath(); g.arc(64, 96, 34, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.ellipse(64 + Math.cos(a) * 14, 96 + Math.sin(a) * 14, 13, 8, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(232,228,218,0.85)'; g.fillRect(0, 238, 128, 4);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const indigo = new THREE.MeshStandardNodeMaterial({ map: clothTex('#1f2f4a', '#7a8aa8', true), roughness: 0.95, side: THREE.DoubleSide });
  const hemp = new THREE.MeshStandardNodeMaterial({ map: clothTex('#c2ad86', '#6a5a3a', false), roughness: 1, side: THREE.DoubleSide });
  // chōchin: paper over bamboo ribs with a brushed character, glowing from the candle inside (the ribs stay dark)
  const lanternTex = (paper: string, ink: string, ch: string) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, paper); gr.addColorStop(0.5, '#fff6e0'); gr.addColorStop(1, paper);
    g.fillStyle = paper; g.fillRect(0, 0, 256, 128); g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(0, 0, 256, 128); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(40,24,14,0.55)'; g.lineWidth = 2;
    for (let y = 6; y < 128; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.fillStyle = ink; g.font = 'bold 70px "Yu Mincho","MS Mincho","Noto Serif JP",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 64, 66); g.fillText(ch, 192, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const lanternMat = (paper: string, ink: string, ch: string, glow: number) => {
    const t = lanternTex(paper, ink, ch);
    const m = new THREE.MeshStandardNodeMaterial({ map: t, emissiveMap: t, emissive: glow, emissiveIntensity: 0.9, roughness: 0.75 });
    return m;
  };
  const lanternRed = lanternMat('#b8321e', '#1a0c08', '祭', 0xff7a3a);
  const lanternWhite = lanternMat('#e8dcc0', '#1a120c', '御', 0xffc070);
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 });
  const logs = new THREE.MeshStandardNodeMaterial({ color: 0x6a4a32, roughness: 0.95 });

  // Buckets: material × solid → geometries in world space, merged at the end.
  const buckets = new Map<THREE.Material, { solid: THREE.BufferGeometry[]; decor: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
  /** Place `g` (local to a house frame `frame`) in the bucket for `mat`. */
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, frame: THREE.Matrix4, local: { x?: number; y?: number; z?: number; ry?: number; rx?: number; rz?: number }, solid = true) => {
    e.set(local.rx ?? 0, local.ry ?? 0, local.rz ?? 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(local.x ?? 0, local.y ?? 0, local.z ?? 0), q, sc).premultiply(frame);
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    c.setAttribute('grime', grimeFor(c));
    let b = buckets.get(mat); if (!b) { b = { solid: [], decor: [] }; buckets.set(mat, b); }
    (solid ? b.solid : b.decor).push(c);
  };
  /** Dirt splashed up the foot of every wall and footing: 1 at the ground, gone by 1.3 m (baked per vertex). */
  const grimeFor = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position as THREE.BufferAttribute, a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const above = p.getY(i) - heightAt(p.getX(i), p.getZ(i)); a[i] = Math.max(0, Math.min(1, 1 - above / 1.3)); }
    return new THREE.BufferAttribute(a, 1);
  };
  const frameAt = (x: number, z: number, yaw: number, y = heightAt(x, z)) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), sc);

  const props: Village['props'] = [];
  const smoke: THREE.Vector3[] = [];
  // ridge caps and onigawara: the kawara scan, darker (the ridge tiles are fired darker and stand proud)
  const ridge = uvMaterial('grey_roof_tiles', [1.6, 1.6], { tint: 0x5c606a });
  const footprints: THREE.Box3[] = [];
  const blocked = (x: number, z: number, r: number) => avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + r);
  const potMats = [CLAY.terracotta, CLAY.terracotta, CLAY.iron, CLAY.celadon, CLAY.ash];
  const tableGeo = (() => {
    const parts = [boxGeo(1.5, 0.08, 0.8).translate(0, 0.72, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxGeo(0.08, 0.7, 0.08).translate(sx * 0.66, 0.35, sz * 0.32));
    parts.push(boxGeo(1.3, 0.05, 0.05).translate(0, 0.2, 0.32), boxGeo(1.3, 0.05, 0.05).translate(0, 0.2, -0.32));
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  })();
  const crateGeo = boxGeo(0.7, 0.62, 0.7).translate(0, 0.31, 0);
  const barrelGeo = (() => {
    const body = new THREE.CylinderGeometry(0.31, 0.31, 0.82, 14).translate(0, 0.41, 0).toNonIndexed();
    const bands = [0.12, 0.7].map((y) => new THREE.CylinderGeometry(0.325, 0.325, 0.06, 14, 1, true).translate(0, y, 0).toNonIndexed());
    const g = mergeGeometries([body, ...bands], true)!;
    return g;
  })();
  const addProp = (kind: PropKind, x: number, z: number, yaw = R() * Math.PI * 2, y?: number) => {
    let mesh: THREE.Mesh;
    if (kind === 'table') mesh = new THREE.Mesh(tableGeo, mats.wood);
    else if (kind === 'crate') mesh = new THREE.Mesh(crateGeo, mats.wood);
    else if (kind === 'barrel') mesh = new THREE.Mesh(barrelGeo, [mats.darkWood, iron]);
    else mesh = new THREE.Mesh(POT_GEO[kind as 'pot' | 'jar'], potMats[(R() * potMats.length) | 0]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(x, y ?? heightAt(x, z), z); mesh.rotation.y = yaw;
    props.push({ mesh, kind });
    return mesh;
  };

  // ── A machiya: stone footing, a slatted shopfront with a pent roof, a plaster upper storey, a tiled roof ──
  // Shop signs (kanban): brushed kanji on dark boards, one texture per trade.
  const TRADES = ['酒', '米', '茶', '薬', '魚', '呉服', '宿', '油', '塩', '鍛冶', '豆腐', '傘'];
  const signMats = TRADES.map((t, i) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 192;
    const g = c.getContext('2d')!;
    g.fillStyle = i % 3 === 2 ? '#d8c8a4' : '#2a1c12'; g.fillRect(0, 0, 64, 192);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; g.strokeRect(2, 2, 60, 188);
    g.fillStyle = i % 3 === 2 ? '#1a120c' : '#e8dcc0';
    const n = [...t].length, size = Math.min(52, 160 / n);
    g.font = `bold ${size}px "Yu Mincho","MS Mincho","Hiragino Mincho ProN","Noto Serif JP",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...t].forEach((ch, k) => g.fillText(ch, 32, 96 + (k - (n - 1) / 2) * size * 1.05));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8 });
  });
  // ── Machiya detail kit (the reference street shots) ──────────────────────────────────────────────
  // nokigawara: the round tile ends lining an eave (a short half-pipe facing out)
  const tileEnd = new THREE.CylinderGeometry(0.085, 0.085, 0.14, 4, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI);   // 8 triangles: thousands of them line the town
  // sudare: a split-bamboo blind (canvas stripes, see-through slits)
  const sudareMat = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 128; y += 4) { g.fillStyle = `rgba(${150 + (y * 7) % 30},${118 + (y * 5) % 24},72,0.92)`; g.fillRect(0, y, 64, 3); }
    g.fillStyle = 'rgba(60,40,24,0.95)'; for (const x of [12, 52]) g.fillRect(x, 0, 2, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardNodeMaterial({ map: t, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.9 });
  })();
  const bucketRed = new THREE.MeshStandardNodeMaterial({ color: 0x8a2a1c, roughness: 0.75 });
  const feltRed = new THREE.MeshStandardNodeMaterial({ color: 0x9a2418, roughness: 1 });
  const bucket = new THREE.CylinderGeometry(0.17, 0.14, 0.26, 10);
  const interior = new THREE.MeshStandardNodeMaterial({ color: 0x24170e, emissive: 0x6a3a14, emissiveIntensity: 0.55, roughness: 1 });
  const canvasMat = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rough = 0.9) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return new THREE.MeshStandardNodeMaterial({ map: t, roughness: rough });
  };
  // indigo cloth (kasuri: white flecks in rows), straw (tawara weave), a tea chest (paper label, brushed mark)
  const clothMats = ['#22324e', '#5a2a24', '#3e4a32'].map((base) => canvasMat(64, 64, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(230,226,214,0.85)';
    for (let y = 4; y < 64; y += 10) for (let x = (y / 10) % 2 ? 2 : 7; x < 64; x += 10) g.fillRect(x, y, 4, 2);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < 64; x += 3) g.fillRect(x, 0, 1, 64);
  }));
  const strawMat = canvasMat(64, 64, (g) => {
    g.fillStyle = '#b89a5a'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${90 + (i * 37) % 80},${70 + (i * 23) % 60},30,0.5)`; g.beginPath(); const x = (i * 13) % 64, y = (i * 7) % 64; g.moveTo(x, y); g.lineTo(x + 10, y + 2); g.stroke(); }
    g.fillStyle = 'rgba(60,40,20,0.7)'; g.fillRect(0, 14, 64, 3); g.fillRect(0, 46, 64, 3);
  });
  const teaMat = canvasMat(64, 64, (g) => {
    g.fillStyle = '#6a4a2a'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 1);
    g.fillStyle = '#e8dcc0'; g.fillRect(16, 12, 32, 40);
    g.fillStyle = '#1a120c'; g.font = 'bold 26px "Yu Mincho","MS Mincho",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('茶', 32, 32);
  });
  const goods = [...clothMats, strawMat, teaMat];
  const bolt = new THREE.CylinderGeometry(0.075, 0.075, 0.28, 10).rotateZ(Math.PI / 2);
  const bale = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 10).rotateZ(Math.PI / 2);
  const chest = boxGeo(0.2, 0.2, 0.18);
  const shelfPot = POT_GEO.pot.clone().scale(0.55, 0.55, 0.55);
  void goods;
  const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);

  // ── A machiya (after the asset sheet and the street shot): stone footing; a timber-posted shopfront with
  //    lattice, an open shop bay lit warm inside and goods on the shelves; a deep tiled pent roof with rafter
  //    ends; a timber-framed plaster upper storey with slatted windows (sometimes a balcony); a kawara roof
  //    with deep eaves, fascia and rafter ends; noren, lantern and a hanging shop sign. ──────────────────────
  const house = (x: number, z: number, yaw: number, w: number, d: number, burnt: boolean) => {
    const y0 = Math.min(heightAt(x - 2, z - 2), heightAt(x + 2, z + 2), heightAt(x - 2, z + 2), heightAt(x + 2, z - 2)) - 0.15;
    const F = frameAt(x, z, yaw, y0);
    const W = burnt ? char : mats.wood, P = burnt ? char : mats.plaster, D = burnt ? char : mats.darkWood, TL = burnt ? char : mats.tile;
    const two = !burnt && R() < 0.75, shop = !burnt && R() < 0.65;
    const fz = d / 2;   // the street face
    put(boxGeo(w + 0.2, 0.5, d + 0.2), stone, F, { y: 0.25 });
    put(boxGeo(w, 2.5, d), W, F, { y: 0.5 + 1.25 });
    // posts and lintel
    for (const px of [-w / 2 + 0.09, w / 2 - 0.09, ...(w > 5.4 ? [0] : [])]) put(boxGeo(0.2, 2.6, 0.2), D, F, { x: px, y: 0.5 + 1.3, z: fz + 0.06 });
    put(boxGeo(w + 0.05, 0.24, 0.22), D, F, { y: 0.5 + 2.48, z: fz + 0.07 }, false);
    // the shop bay (open, lit inside) or the door; lattice over the rest of the front
    const door = (R() - 0.5) * Math.max(0, w - 3.2);
    const bayW = shop ? Math.min(2.6, w - 1.6) : 1.1;
    if (shop) {
      put(plane(bayW, 2.05), interior, F, { x: door, y: 0.5 + 1.08, z: fz + 0.012 }, false);
      for (const sy of [0.85, 1.45]) {
        put(boxGeo(bayW - 0.2, 0.05, 0.3), D, F, { x: door, y: 0.5 + sy, z: fz + 0.15 }, false);
        // each shelf one trade's stock: cloth bolts, rice bales, tea chests or small pots
        const kind = (R() * 4) | 0;
        for (let gx = -bayW / 2 + 0.3; gx < bayW / 2 - 0.2; gx += 0.3 + R() * 0.08) {
          const at = { x: door + gx, y: 0.5 + sy + 0.03, z: fz + 0.15 };
          if (kind === 0) { put(bolt, clothMats[(R() * 3) | 0], F, { ...at, y: at.y + 0.075 }, false); if (R() < 0.5) put(bolt, clothMats[(R() * 3) | 0], F, { ...at, y: at.y + 0.22 }, false); }
          else if (kind === 1) put(bale, strawMat, F, { ...at, y: at.y + 0.11 }, false);
          else if (kind === 2) put(chest, teaMat, F, { ...at, y: at.y + 0.1 }, false);
          else put(shelfPot, potMats[(R() * potMats.length) | 0], F, { ...at, y: at.y + 0.02, ry: R() * 6 }, false);
        }
      }
    } else put(boxGeo(1.1, 2.0, 0.06), D, F, { x: door, y: 0.5 + 1.0, z: fz + 0.02 }, false);
    for (let sx = -w / 2 + 0.3; sx < w / 2 - 0.25; sx += 0.15) {
      if (Math.abs(sx - door) < bayW / 2 + 0.12) continue;
      put(boxGeo(0.05, 2.15, 0.05), D, F, { x: sx, y: 0.5 + 1.1, z: fz + 0.06 }, false);
    }
    put(boxGeo(w - 0.4, 0.06, 0.06), D, F, { y: 0.5 + 0.35, z: fz + 0.08 }, false);
    // the pent roof (hisashi): deep, tiled, rafter ends and a fascia board along its edge
    put(boxGeo(w + 0.5, 0.1, 1.45), TL, F, { y: 3.12, z: fz + 0.62, rx: 0.3 }, false);
    put(boxGeo(w + 0.5, 0.16, 0.07), D, F, { y: 2.86, z: fz + 1.32 }, false);
    for (let rx = -w / 2; rx <= w / 2; rx += 0.42) put(boxGeo(0.08, 0.08, 1.25), D, F, { x: rx, y: 2.94, z: fz + 0.6, rx: 0.3 }, false);
    if (!burnt) for (let tx = -w / 2 - 0.2; tx <= w / 2 + 0.2; tx += 0.27) put(tileEnd, ridge, F, { x: tx, y: 2.9, z: fz + 1.36 }, false);
    let top = 3.0;
    if (two) {
      const uz = -0.3, ud = d - 0.8, uf = uz + ud / 2;
      put(boxGeo(w - 0.2, 1.75, ud), P, F, { y: 3.0 + 0.875, z: uz });
      // timber frame on the plaster
      for (const px of [-w / 2 + 0.2, w / 2 - 0.2, -w / 6, w / 6]) put(boxGeo(0.14, 1.75, 0.08), D, F, { x: px, y: 3.0 + 0.875, z: uf + 0.03 }, false);
      put(boxGeo(w - 0.2, 0.14, 0.08), D, F, { y: 4.62, z: uf + 0.03 }, false);
      // mushiko slatted window, or a balcony with its railing
      if (R() < 0.3) {
        put(boxGeo(w - 0.5, 0.08, 0.08), D, F, { y: 3.6, z: uf + 0.42 }, false);
        put(boxGeo(w - 0.5, 0.08, 0.5), D, F, { y: 3.08, z: uf + 0.22 }, false);
        for (let bx = -w / 2 + 0.3; bx <= w / 2 - 0.3; bx += 0.22) put(boxGeo(0.05, 0.5, 0.05), D, F, { x: bx, y: 3.35, z: uf + 0.42 }, false);
        put(plane(w * 0.5, 1.1), interior, F, { y: 3.85, z: uf + 0.012 }, false);
      } else {
        const ww = Math.min(2.2, w * 0.45);
        put(plane(ww, 0.62), interior, F, { y: 3.95, z: uf + 0.012 }, false);
        for (let sx = -ww / 2 + 0.06; sx <= ww / 2; sx += 0.16) put(boxGeo(0.07, 0.66, 0.07), mats.plaster, F, { x: sx, y: 3.95, z: uf + 0.05 }, false);
      }
      // udatsu: a plastered firewall wing at each end of the upper storey, under its own little tiled roof
      if (R() < 0.35) for (const ex of [-1, 1]) {
        put(boxGeo(0.28, 1.6, 1.3), P, F, { x: ex * (w / 2 - 0.1), y: 3.0 + 0.8, z: uf - 0.4 });
        put(boxGeo(0.3, 0.12, 1.36), D, F, { x: ex * (w / 2 - 0.1), y: 3.0 + 1.62, z: uf - 0.4 }, false);
        put(gableGeo(1.3, 0.3, 0.22, 0.12).rotateY(Math.PI / 2), TL, F, { x: ex * (w / 2 - 0.1), y: 3.0 + 1.66, z: uf - 0.4 }, false);
      }
      // a sudare blind let down over the upper window
      if (R() < 0.4) put(plane(Math.min(2.0, w * 0.4), 0.95), sudareMat, F, { y: 3.85, z: uf + 0.12 }, false);
      top = 4.75;
    }
    const roofH = two ? 1.5 : 1.9, roofed = !burnt || R() < 0.5;
    const rz = two ? -0.3 : 0, rd = two ? d - 0.8 : d, OVER = 0.9;
    if (roofed) {
      put(gableGeo(w, rd, roofH, OVER), burnt ? char : (R() < 0.92 ? mats.tile : mats.thatch), F, { y: top, z: rz });
      // deep eaves: fascia board and rafter ends along the street side
      put(boxGeo(w + OVER * 2 + 0.1, 0.17, 0.08), D, F, { y: top - 0.04, z: rz + rd / 2 + OVER }, false);
      for (let rx = -w / 2 - OVER + 0.2; rx <= w / 2 + OVER - 0.2; rx += 0.45) put(boxGeo(0.09, 0.09, OVER + 0.2), D, F, { x: rx, y: top - 0.1, z: rz + rd / 2 + OVER / 2 }, false);
      // nokigawara: round tile ends all along the street eave
      if (!burnt) for (let tx = -w / 2 - OVER + 0.12; tx <= w / 2 + OVER - 0.1; tx += 0.27) put(tileEnd, ridge, F, { x: tx, y: top - 0.02, z: rz + rd / 2 + OVER + 0.04 }, false);
      // kawara ridge: a heavy cap along the ridge and an onigawara block at each end
      put(boxGeo(w + OVER * 2 + 0.05, 0.34, 0.46), ridge, F, { y: top + roofH + 0.08, z: rz });
      for (const ex of [-1, 1]) put(boxGeo(0.34, 0.66, 0.52), ridge, F, { x: ex * (w / 2 + OVER), y: top + roofH + 0.24, z: rz }, false);
      if (!burnt && R() < 0.38) smoke.push(new THREE.Vector3(-w * 0.25 + R() * w * 0.5, top + roofH + 0.3, rz).applyMatrix4(F));
    }
    else for (let k = 0; k < 4; k++) put(boxGeo(0.18, 0.18, d + 0.6), char, F, { x: -w / 2 + 0.5 + k * (w - 1) / 3, y: top + 0.6, rx: 0.1 * (k - 1.5) }, false);   // roof burnt off: charred rafters
    if (!burnt) {
      // noren across the shop bay (or the door), a lantern, a hanging sign
      const nw = shop ? bayW : 1.1, np = Math.max(2, Math.round(nw / 0.48));
      const cloth = R() < 0.6 ? indigo : hemp;
      for (let k = 0; k < np; k++) put(plane(nw / np - 0.03, 0.78), cloth, F, { x: door - nw / 2 + (k + 0.5) * (nw / np), y: 0.5 + 2.0, z: fz + 0.2 }, false);
      put(boxGeo(nw + 0.2, 0.04, 0.04), D, F, { x: door, y: 0.5 + 2.4, z: fz + 0.2 }, false);
      if (R() < 0.6) {
        const lg = new THREE.SphereGeometry(0.2, 14, 10); lg.scale(1, 1.35, 1);
        const lx = door + nw / 2 + 0.45;
        put(lg, R() < 0.5 ? lanternRed : lanternWhite, F, { x: lx, y: 2.45, z: fz + 0.4, ry: Math.PI / 2 }, false);
        for (const cy of [2.45 + 0.26, 2.45 - 0.26]) put(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), char, F, { x: lx, y: cy, z: fz + 0.4 }, false);
        put(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), char, F, { x: lx, y: 2.86, z: fz + 0.4 }, false);
      }
      if (shop && R() < 0.8) {
        const sm = signMats[(R() * signMats.length) | 0], sx = door + (R() < 0.5 ? -1 : 1) * (nw / 2 + 0.35);
        put(boxGeo(0.42, 1.24, 0.05), D, F, { x: sx, y: 0.5 + 1.55, z: fz + 0.24 }, false);
        put(plane(0.36, 1.12), sm, F, { x: sx, y: 0.5 + 1.55, z: fz + 0.27 }, false);
      }
    }
    // inuyarai: curved bamboo guards leaning out from the foot of the front wall
    if (!burnt && !shop && R() < 0.55) {
      const span = Math.min(w - 0.8, 3.2), cx0 = door > 0 ? -w / 4 : w / 4;
      for (let k = 0; k <= Math.round(span / 0.09); k++) put(boxGeo(0.035, 0.85, 0.035), D, F, { x: cx0 - span / 2 + k * 0.09, y: 0.5 + 0.38, z: fz + 0.28, rx: 0.45 }, false);
      put(boxGeo(span, 0.05, 0.05), D, F, { x: cx0, y: 0.5 + 0.06, z: fz + 0.5 }, false);
    }
    // tensui-oke: a pyramid of fire buckets on a stand by the door (3 · 2 · 1)
    if (!burnt && R() < 0.18) {
      const bx = door - (shop ? bayW : 1.1) / 2 - 0.55;
      put(boxGeo(0.62, 0.42, 0.24), D, F, { x: bx, y: 0.21, z: fz + 0.32 }, false);
      [[-0.2, 0], [0, 0], [0.2, 0], [-0.1, 1], [0.1, 1], [0, 2]].forEach(([ox, row]) => put(bucket, bucketRed, F, { x: bx + ox, y: 0.42 + 0.13 + row * 0.24, z: fz + 0.32 }, false));
    }
    // shōgi: a bench spread with red felt outside a tea shop
    if (!burnt && shop && R() < 0.3) {
      const bx = door + (R() < 0.5 ? -1 : 1) * (bayW / 2 + 1.0);
      put(boxGeo(1.5, 0.07, 0.55), W, F, { x: bx, y: 0.46, z: fz + 1.05 }, false);
      for (const lx of [-0.65, 0.65]) for (const lz of [-0.2, 0.2]) put(boxGeo(0.06, 0.44, 0.06), D, F, { x: bx + lx, y: 0.22, z: fz + 1.05 + lz }, false);
      put(boxGeo(1.42, 0.02, 0.5), feltRed, F, { x: bx, y: 0.505, z: fz + 1.05 }, false);
    }
    // firewood against the side wall
    if (R() < 0.4) for (let k = 0; k < 9; k++) {
      const c = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6);
      put(c, logs, F, { x: w / 2 + 0.2, y: 0.6 + Math.floor(k / 3) * 0.14, z: -d / 2 + 0.6 + (k % 3) * 0.15, rx: Math.PI / 2 }, true);
    }
    const b = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y0, z), new THREE.Vector3(Math.abs(Math.cos(yaw)) * w + Math.abs(Math.sin(yaw)) * d, 10, Math.abs(Math.sin(yaw)) * w + Math.abs(Math.cos(yaw)) * d));
    footprints.push(b.expandByScalar(0.6));
    // things at the door and the side: a rain barrel, a crate, a pot or two (all loose)
    const fx = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, 0, z));
    if (R() < 0.55) { const p = fx(-w / 2 + 0.5, d / 2 + 0.55); addProp('barrel', p.x, p.z); }
    if (R() < 0.45) { const p = fx(w / 2 - 0.6, d / 2 + 0.6); addProp('crate', p.x, p.z); if (R() < 0.5) addProp('pot', p.x, p.z, undefined, heightAt(p.x, p.z) + 0.62); }
    if (R() < 0.5) { const p = fx(door + bayW / 2 + 0.9, d / 2 + 0.5); addProp(R() < 0.5 ? 'jar' : 'pot', p.x, p.z); }
    // the back: something left in the alley
    if (R() < 0.5) { const p = fx((R() - 0.5) * w, -d / 2 - 0.6); addProp(R() < 0.5 ? 'crate' : 'jar', p.x, p.z); }
  };

  // ── The rows: a front row on the road, a back row behind it with a 3 m alley, cross-alleys between ─────
  const FRONT = 7.6, BACK = 15.8, DEPTH = 5;
  const Z0 = o.z0 ?? -38, Z1 = o.z1 ?? 44, PZ = o.plaza;
  // the market square: rows keep out of it and a ring of shops faces in instead
  if (PZ) avoid.push({ x: PZ.x, z: PZ.z, r: PZ.r + 7.5 });
  let burntLeft = 3;
  for (const side of [-1, 1]) for (const off of o.rows ?? [FRONT, BACK]) {
    let z = Z0 + R() * 2, run = 0;
    while (z < Z1) {
      const w = 4.6 + R() * 2.2;
      const cz = z + w / 2, cx = roadX(cz) + side * off;
      const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (!blocked(cx, cz, Math.max(w, DEPTH) / 2 + 0.5)) {
        house(cx, cz, yaw, w, DEPTH, burntLeft > 0 && off === FRONT && R() < 0.12 && !!burntLeft--);
        run++;
      } else run = 0;
      // row houses touch; every two or three a cross-alley opens (deeper rows: more often, and they jog)
      const gap = run >= (off > BACK ? 1 : 2) + (R() < 0.5 ? 1 : 0) ? (run = 0, 2.4 + R() * 0.8) : 0.25;
      z += w + gap;
    }
  }

  // ── The Grand Marketplace: shops round the square facing in (the gaps between them are alley mouths), a ring
  //    of stalls with awnings round a roofed well, nobori banners between the stalls. The road runs through. ──
  if (PZ) {
    const C = new THREE.Vector3(PZ.x, 0, PZ.z);
    const roadDirs = [PZ.z - PZ.r, PZ.z + PZ.r].map((zz) => Math.atan2(roadX(zz) - PZ.x, zz - PZ.z));
    const nearRoad = (a: number, w: number) => roadDirs.some((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < w);
    const ringN = 13, ringR = PZ.r + 3.2;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + 0.11;
      if (nearRoad(a, 0.36)) continue;
      const x = PZ.x + Math.sin(a) * ringR, z = PZ.z + Math.cos(a) * ringR;
      house(x, z, a + Math.PI, 5.0 + R() * 0.9, DEPTH, false);
    }
    const stallN = 11, sr = PZ.r * 0.6;
    const madder = new THREE.MeshStandardNodeMaterial({ color: 0x7a2418, roughness: 1, side: THREE.DoubleSide });
    const banners = [indigo, hemp, madder];
    for (let i = 0; i < stallN; i++) {
      const a = (i / stallN) * Math.PI * 2;
      if (nearRoad(a, 0.42)) continue;
      const x = PZ.x + Math.sin(a) * sr, z = PZ.z + Math.cos(a) * sr;
      const yaw = Math.atan2(PZ.x - x, PZ.z - z);   // the counter faces the well
      const F = frameAt(x, z, yaw);
      for (const sx of [-1, 1]) put(boxGeo(0.1, 2.3, 0.1), mats.darkWood, F, { x: sx * 1.0, y: 1.15, z: -0.6 }, false);
      put(boxGeo(2.4, 0.04, 1.6), banners[i % 3], F, { y: 2.25, z: -0.1, rx: 0.22 }, false);
      addProp('table', x, z, yaw);
      const ty = heightAt(x, z) + 0.76, side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (let k = 0; k < 3; k++) { const t = (k - 1) * 0.45; addProp(R() < 0.7 ? 'pot' : 'jar', x + side.x * t, z + side.z * t, undefined, ty); }
      const back = new THREE.Vector3(x, 0, z).add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-1.3));
      addProp(R() < 0.5 ? 'crate' : 'barrel', back.x + (R() - 0.5) * 0.6, back.z + (R() - 0.5) * 0.6);
      // a nobori banner beside each stall
      const ba = a + Math.PI / stallN, bx = PZ.x + Math.sin(ba) * (sr + 1.4), bz = PZ.z + Math.cos(ba) * (sr + 1.4);
      const BF = frameAt(bx, bz, ba);
      put(new THREE.CylinderGeometry(0.05, 0.06, 4.6, 6), mats.darkWood, BF, { y: 2.3 }, false);
      put(boxGeo(0.62, 0.04, 0.04), mats.darkWood, BF, { x: 0.31, y: 4.4 }, false);
      put(plane(0.56, 2.7), banners[(i + 1) % 3], BF, { x: 0.33, y: 2.95 }, false);
    }
    // the well: a stone ring, two posts, a beam and a small tiled roof
    const WF = frameAt(PZ.x, PZ.z, 0.4);
    put(new THREE.CylinderGeometry(0.95, 1.0, 0.8, 18, 1, true), stone, WF, { y: 0.4 });
    put(new THREE.CylinderGeometry(0.98, 0.98, 0.12, 18), stone, WF, { y: 0.82 }, false);
    put(new THREE.CircleGeometry(0.9, 18), char, WF, { y: 0.7, rx: -Math.PI / 2 }, false);
    for (const sx of [-1, 1]) put(boxGeo(0.14, 2.4, 0.14), mats.darkWood, WF, { x: sx * 1.0, y: 1.2 }, false);
    put(boxGeo(2.3, 0.12, 0.12), mats.darkWood, WF, { y: 2.3 }, false);
    put(gableGeo(2.2, 1.6, 0.6, 0.2), mats.tile, WF, { y: 2.38 }, false);
    footprints.push(new THREE.Box3().setFromCenterAndSize(C.clone().setY(heightAt(PZ.x, PZ.z)), new THREE.Vector3(PZ.r * 2 + 4, 10, PZ.r * 2 + 4)));
  }

  // ── Market stalls on the road edge: an awning on two posts, a table of wares (loose: kick it, throw them) ──
  const stalls: [number, number][] = [[-1, -26], [1, -18], [-1, -2], [1, 14], [-1, 28], [1, -32], [1, 30]];
  for (const [side, z] of stalls) {
    if (z < Z0 || z > Z1 || (PZ && Math.abs(z - PZ.z) < PZ.r + 8)) continue;
    const x = roadX(z) + side * 4.6;
    if (blocked(x, z, 1.2)) continue;
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const F = frameAt(x, z, yaw);
    for (const sx of [-1, 1]) put(boxGeo(0.1, 2.3, 0.1), mats.darkWood, F, { x: sx * 1.0, y: 1.15, z: -0.6 }, false);
    put(boxGeo(2.4, 0.04, 1.6), R() < 0.5 ? indigo : hemp, F, { y: 2.25, z: -0.1, rx: 0.22 }, false);
    addProp('table', x, z, yaw);
    const ty = heightAt(x, z) + 0.76;
    const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));   // local +x in world
    for (let k = 0; k < 3; k++) { const t = (k - 1) * 0.45; addProp(R() < 0.75 ? 'pot' : 'jar', x + fwd.x * t, z + fwd.z * t, undefined, ty); }
    if (R() < 0.7) { const p = new THREE.Vector3(x, 0, z).addScaledVector(fwd, 1.3); addProp('crate', p.x + (R() - 0.5) * 0.4, p.z + (R() - 0.5) * 0.4); }
  }

  // ── Merge per material ───────────────────────────────────────────────────────────────────────────
  const group = new THREE.Group(); group.name = 'village';
  for (const [mat, b] of buckets) for (const solid of [true, false]) {
    const list = solid ? b.solid : b.decor; if (!list.length) continue;
    const g = mergeGeometries(list, false); if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(solid ? collide(mesh) : mesh);
  }

  // ── Huddles: where the raiders hold villagers (one per stretch of the road) ───────────────────────
  const huddles = (o.huddleZ ?? [-24, 4, 31]).map((z, i) => {
    // in the square the captives kneel off the road, by the well; on the street, at the roadside
    const x = PZ && Math.abs(z - PZ.z) < PZ.r ? PZ.x + 3.4 : roadX(z) + (i % 2 ? 2.2 : -2.2);
    return new THREE.Vector3(x, heightAt(x, z), z);
  });
  const glow = [lanternRed, lanternWhite, interior].map((mat) => ({ mat, base: mat.emissiveIntensity }));
  return { group, props, huddles, footprints, smoke, addProp, glow };
}
