/**
 * forgeHaru.ts — Character Forge, first slice: Haru v3 (docs/character-forge.md "First slice").
 *
 *   npx tsx scripts/eraclash3d/forgeHaru.ts      → public/games/era-clash/3d/assets/characters/samurai_v3.glb
 *   FORGE_NAKED=1 …                              → the body alone, every corrective on the skin (samurai_v3_body.glb)
 *
 * Body from the human anatomy plan (Argilla), wardrobe fitted to its field, correctives baked from the anatomy,
 * face shapes from the VTuber rig builder, look from Haru's art. Intermediates go to D:\Plajah Runtime\eraclash3d\forge.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildHumanAnatomy, HARU_TUNE, HUMAN_JOINTS, PARENT, TWIST_JOINTS, qaxis, qrot,
  type HumanAnatomy, type HumanJoint, type HumanPose,
} from '../../services/argilla/creature/human';
import {
  meshField, bodyField, settleOnField, relaxMesh, compact, humanSkinWeights, bakeCorrective, nearestOnBody, neighbours,
  type BodyMesh, type CorrectiveSpec,
} from '../../services/argilla/creature/humanFinish';
import { buildHaruKit, quatFromBasis, unitBox, type MeshBuilder, type Wardrobe } from '../../services/argilla/creature/wardrobe';
import { nihonto, saya } from '../../services/argilla/creature/weapons';
import { forgeToGlb, type ForgeCharacter, type ForgeRigid, type ForgeSocket } from '../../services/argilla/creature/exportCreature';
import type { GPrim } from '../../services/argilla/creature/gltfWriter';
import { haruMaterials, MATERIAL_INDEX, paintHaru, cropArt, paintFromViews } from './forgeLook';
import * as THREE from 'three';
import { buildArkitShapes, ARKIT_SHAPES } from '../../services/vtuber/rigBuilder/arkitShapes';
import { transferFace } from '../../services/vtuber/rigBuilder/transferFace';
import type { Vec3 } from '../../services/argilla/engine';

export const WORK = process.env.FORGE_WORK ?? 'D:/Plajah Runtime/eraclash3d/forge';
fs.mkdirSync(WORK, { recursive: true });
const t0 = Date.now();
const log = (s: string) => console.log(`[forge ${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const NAKED = process.env.FORGE_NAKED === '1';

const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const D2R = Math.PI / 180;
type Skin = { skinIndex: Uint16Array; skinWeight: Float32Array };

async function main() {
  const anatomy = buildHumanAnatomy(HARU_TUNE);
  log(`anatomy: ${anatomy.bones.length} joints, ${anatomy.muscles.length} muscles, ${anatomy.parts.length} clay parts`);

  // ---- Body ----------------------------------------------------------------------------------------------
  const voxel = Number(process.env.FORGE_VOXEL ?? 0.0035);
  const field = bodyField(anatomy);
  const raw = meshField(field, [-0.75, -0.02, -0.25], [0.75, 1.82, 0.3], voxel);
  log(`surface nets @${voxel * 1000}mm: ${raw.positions.length / 3} verts`);
  relaxMesh(raw, 2, 0.5);
  settleOnField(raw, field, 2);
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const [simple] = MeshoptSimplifier.simplify(raw.indices, raw.positions, 3, Number(process.env.FORGE_TRIS ?? 60000) * 3, 0.002, ['LockBorder']);
  const body = compact({ positions: raw.positions, normals: raw.normals, indices: simple }).mesh;
  settleOnField(body, field, 2);
  log(`body: ${body.positions.length / 3} verts, ${body.indices.length / 3} tris`);
  const skin = humanSkinWeights(body, anatomy, field);

  // ---- Corrective shapes, baked from the anatomy ----------------------------------------------------------
  const { specs, drivers } = correctiveSpecs(anatomy);
  const correctives: Float32Array[] = [];
  for (const spec of specs) {
    const d = bakeCorrective(body, skin, anatomy, field, spec);
    correctives.push(d);
    let max = 0, moved = 0;
    for (let i = 0; i < d.length; i += 3) { const l = Math.hypot(d[i], d[i + 1], d[i + 2]); max = Math.max(max, l); if (l > 0.001) moved++; }
    log(`corrective ${spec.name}: ${moved} verts, max ${(max * 1000).toFixed(1)} mm`);
  }
  const morphNames = specs.map((s) => s.name);

  // ---- Head: its own mesh above a seam under the jaw, with the ARKit shapes and the face painted from the art ------
  const SEAM = 1.5;
  const Pb = (v: number): Vec3 => [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
  // correctives fade out just under the seam, so the head and the body never part
  for (const d of correctives) for (let v = 0; v < d.length / 3; v++) {
    const k = Math.max(0, Math.min(1, (SEAM - 0.004 - Pb(v)[1]) / 0.035));
    d[v * 3] *= k; d[v * 3 + 1] *= k; d[v * 3 + 2] *= k;
  }
  const inHead = (v: number) => Pb(v)[1] >= SEAM;
  const head = cutOffset(body, skin, [], inHead, 0);
  const arkit = faceShapes(head.mesh, anatomy);
  log(`head: ${head.mesh.positions.length / 3} verts, ${ARKIT_SHAPES.length} ARKit shapes from the canonical face`);

  // ---- Wardrobe ------------------------------------------------------------------------------------------
  const kit = buildHaruKit(anatomy, field);
  log(`wardrobe: ${kit.pieces.map((p) => p.id).join(', ')}; ${kit.bones.length} chain bones, ${kit.springs.length} spring chains`);
  const boneNames = [...HUMAN_JOINTS, ...kit.bones.map((b) => b.name)];
  const boneIndex = new Map(boneNames.map((n, i) => [n, i] as const));

  // garments cut from the body itself: they inherit its weights and correctives exactly
  const dominant = (v: number) => HUMAN_JOINTS[skin.skinIndex[v * 4]] as string;
  const P = (v: number): Vec3 => [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
  const collarY = (p: Vec3) => (p[2] > 0.0 ? Math.min(1.47, 1.33 + Math.abs(p[0]) * 1.5) : 1.47);
  const regions: Record<string, (v: number) => boolean> = {
    kosode: (v) => { const p = P(v), b = dominant(v); return p[1] > 0.93 && p[1] < collarY(p) && /^(Hips|Spine|Spine1|Spine2|Neck|LeftShoulder|RightShoulder)$/.test(b); },
    koteCloth: (v) => /^(Left|Right)(Arm|ArmTwist|ForeArm|ForeArmTwist)$/.test(dominant(v)),
    kyahan: (v) => /^(Left|Right)Leg$/.test(dominant(v)) && P(v)[1] < 0.36,
    tabi: (v) => /^(Left|Right)(Foot|ToeBase)$/.test(dominant(v)),
    hair: (v) => {
      const p = P(v);
      if (dominant(v) !== 'Head') return false;
      const scalp = p[1] > 1.705 || (p[2] < -0.005 && p[1] > 1.585) || (Math.abs(p[0]) > 0.066 && p[1] > 1.635 && p[2] < 0.035);
      return scalp;
    },
  };
  const OFFSET: Record<string, number> = { kosode: 0.009, koteCloth: 0.0075, kyahan: 0.013, tabi: 0.0035, hair: 0.0045 };
  const offsetPieces = Object.fromEntries(Object.entries(regions).map(([name, sel]) => [name, cutOffset(body, skin, correctives, sel, OFFSET[name])]));
  log(`body-cut garments: ${Object.entries(offsetPieces).map(([k, p]) => `${k} ${p.mesh.positions.length / 3}`).join(', ')}`);

  // the body under the clothes is never seen: drop it (fewer triangles, nothing to poke through)
  const keep = (v: number) => {
    const p = P(v), b = dominant(v);
    return NAKED || /Hand/.test(b) || b === 'Head' || /Eye$/.test(b) || (p[1] >= collarY(p) - 0.02 && p[1] > 1.3);
  };
  const keptTris: number[] = [];
  for (let i = 0; i < body.indices.length; i += 3) {
    const a = body.indices[i], b = body.indices[i + 1], c = body.indices[i + 2];
    if (!NAKED && inHead(a) && inHead(b) && inHead(c)) continue; // the head mesh has these
    if (keep(a) || keep(b) || keep(c)) keptTris.push(a, b, c);
  }
  const culled = compact({ ...body, indices: new Uint32Array(keptTris) }, [skinToFloat(skin), ...correctives]);
  const bodySkin = floatToSkin(culled.extra[0]);
  log(`body after cull: ${culled.mesh.positions.length / 3} verts, ${culled.mesh.indices.length / 3} tris`);

  // ---- Cloth skinning: from the nearest body vertex, smoothed, blended into the spring chains -------------
  const clothPrims: GPrim[] = [];
  for (const [mat, mb] of kit.cloth) clothPrims.push(skinCloth(mb, body, skin, correctives, kit, mat, boneIndex));
  for (const [name, piece] of Object.entries(offsetPieces)) {
    if (!piece.mesh.indices.length) continue;
    clothPrims.push({ ...prim(piece.mesh, piece.skin, MATERIAL_INDEX[name]), targets: piece.morphs });
  }
  log(`cloth: ${clothPrims.reduce((n, p) => n + p.positions.length / 3, 0)} verts in ${clothPrims.length} primitives`);

  // ---- Armour: rigid plates, one bone per vertex -------------------------------------------------------------
  const armourPrims: GPrim[] = [];
  for (const [mat, mb] of kit.armour) armourPrims.push(rigidPrim(mb, boneIndex, mat, 0));
  armourPrims.push(rigidPrim(kit.hair, boneIndex, 'hair', 0));
  log(`armour: ${armourPrims.reduce((n, p) => n + p.positions.length / 3, 0)} verts in ${armourPrims.length} primitives`);

  // the dō's kebiki lacing: one silk cord, GPU-instanced per row bone
  const box = unitBox();
  const cordPrim = rigidWorldPrim(box, 'silk');
  const lacing: ForgeRigid[] = kit.lacing.map((l) => ({
    name: `odoshi_${l.bone}`, bone: l.bone, prims: [cordPrim],
    instances: { translations: new Float32Array(l.t), rotations: new Float32Array(l.r), scales: new Float32Array(l.s) },
  }));
  log(`odoshi: ${kit.lacing.reduce((n, l) => n + l.t.length / 3, 0)} instanced cords on ${lacing.length} bones`);

  // ---- Sockets and swords --------------------------------------------------------------------------------
  const katana = nihonto({ nagasa: 0.7, tsuka: 0.25, sori: 0.016, width: 0.032, bone: '' });
  const sockets: ForgeSocket[] = kit.sockets.map((s) => {
    const z = cross(s.x, s.y);
    const meshes: ForgeSocket['meshes'] = [];
    if (s.name === 'socket_hand_R') meshes.push({ name: 'katana', at: [0, 0.05, 0], prims: localPrims(katana.meshes), markers: [{ name: 'katana_base', at: katana.base }, { name: 'katana_tip', at: katana.tip }] });
    if (s.name === 'socket_obi_katana') meshes.push({ name: 'katana_saya', prims: localPrims(saya({ length: 0.76, sori: 0.016, bone: '' })) });
    if (s.name === 'socket_obi_wakizashi') meshes.push({ name: 'wakizashi', prims: localPrims(saya({ length: 0.54, sori: 0.012, bone: '', hilt: 0.17 })) });
    return { name: s.name, bone: s.bone, at: s.at, rotation: quatFromBasis(s.x, s.y, z), meshes };
  });

  // ---- Assemble ------------------------------------------------------------------------------------------
  const bones = [
    ...HUMAN_JOINTS.map((j) => ({ name: j as string, parent: PARENT[j] as string | null, at: anatomy.byName[j].at })),
    ...kit.bones.map((b) => ({ name: b.name, parent: b.parent as string | null, at: b.at })),
  ];
  const bodyPrim: GPrim = { ...prim(culled.mesh, bodySkin, MATERIAL_INDEX.skin), targets: culled.extra.slice(1) };
  const kabuto = [...kit.kabuto].map(([mat, mb]) => rigidWorldPrim(mb, mat));
  const extras = {
    forge: {
      version: 3,
      height: 1.8, // crown with the topknot to the sole
      springs: kit.springs,
      capsules: anatomy.capsules.map((c) => ({ bone: c.bone, a: sub(c.a, anatomy.byName[c.bone].at), b: sub(c.b, anatomy.byName[c.bone].at), r: c.r })),
      drivers,
      twists: Object.entries(TWIST_JOINTS).map(([bone, t]) => ({ bone, driver: t.driver, share: t.share, axis: norm(sub(anatomy.byName[t.parent as HumanJoint].tip, anatomy.byName[t.parent as HumanJoint].at)) })),
      grips: grips(anatomy),
      hold: { Right: 'Right:katana', Left: 'Left:relaxed' },
      optional: { kabuto: process.env.FORGE_KABUTO === '1' },
      pieces: kit.pieces,
      tune: anatomy.tune,
      muscles: anatomy.muscles.map((m) => ({ id: m.id, label: m.label })),
    },
  };
  // the face, painted from the art: Haru's head is turned ~65° to his left in it, so it paints from there
  const crop = cropArt([150, 14, 305, 132], (x, y) => ((x - 228) / 74) ** 2 + ((y - 72) / 60) ** 2 < 1 && !(y > 104 && x < 205), path.join(WORK, 'head_view.png'));
  const painted = paintFromViews('head', head.mesh, [{ dir: 'yaw:-65', png: crop }], WORK, 1024);
  const headPrim = matchPainted(painted, head, arkit);
  log(`head painted: ${headPrim.positions.length / 3} verts on its atlas`);
  const extrasFace = { landmarks: anatomy.face.flat().map((x) => +x.toFixed(5)), shapes: ARKIT_SHAPES };
  const character: ForgeCharacter = {
    name: 'Haru',
    bones,
    skinned: NAKED
      ? [{ name: 'Haru_body', prims: [bodyPrim], targetNames: morphNames }]
      : [
        { name: 'Haru_head', prims: [headPrim], targetNames: [...ARKIT_SHAPES], extras: { face: extrasFace } },
        { name: 'Haru_body', prims: [bodyPrim], targetNames: morphNames },
        { name: 'Haru_cloth', prims: clothPrims, targetNames: morphNames },
        { name: 'Haru_armour', prims: armourPrims },
      ],
    rigid: NAKED ? [] : [{ name: 'kabuto', bone: 'Head', prims: kabuto }, ...lacing],
    sockets: NAKED ? sockets.filter((s) => s.name === 'socket_hand_R') : sockets,
    materials: haruMaterials(),
    images: [],
    extras,
  };
  await paintHaru(character, WORK, log);
  // the painted face's maps join the image list; its material is the skin's with the art on it
  const base = character.images.length;
  character.images.push(painted.base, painted.normal, painted.orm);
  const skinMat = character.materials[MATERIAL_INDEX.skin];
  character.materials.push({ ...skinMat, name: 'face', color: [1, 1, 1, 1], baseColorTexture: base, normalTexture: base + 1, normalScale: 0.2, roughness: 0.6 });
  headPrim.material = character.materials.length - 1;
  const glb = forgeToGlb(character);
  const out = process.env.FORGE_OUT ?? `public/games/era-clash/3d/assets/characters/${NAKED ? 'samurai_v3_body' : 'samurai_v3'}.glb`;
  fs.writeFileSync(out, glb);
  fs.writeFileSync(path.join(WORK, 'haru_v3_report.json'), JSON.stringify({
    joints: bones.length, muscles: anatomy.muscles.length, morphs: morphNames, springs: kit.springs.length,
    body: { verts: culled.mesh.positions.length / 3, tris: culled.mesh.indices.length / 3 },
    clothTris: clothPrims.reduce((n, p) => n + p.indices.length / 3, 0), armourTris: armourPrims.reduce((n, p) => n + p.indices.length / 3, 0),
    lacingInstances: kit.lacing.reduce((n, l) => n + l.t.length / 3, 0), pieces: kit.pieces,
  }, null, 2));
  log(`wrote ${out} (${(glb.length / 1e6).toFixed(1)} MB)`);
}

// ---- Correctives and their drivers -------------------------------------------------------------------------------

function correctiveSpecs(a: HumanAnatomy) {
  const specs: CorrectiveSpec[] = [];
  const drivers: { bone: string; space: string; rest: Vec3; keys: { dir: Vec3; morph: string }[] }[] = [];
  const dirOf = (j: HumanJoint) => norm(sub(a.byName[j].tip, a.byName[j].at));
  const add = (side: 'L' | 'R', joint: HumanJoint, space: string, reach: number, axis: Vec3, steps: [string, number][]) => {
    const rest = dirOf(joint);
    const keys: { dir: Vec3; morph: string }[] = [];
    for (const [label, deg] of steps) {
      const q = qaxis(axis, deg * D2R);
      const name = `cf_${label}_${side}`;
      specs.push({ name, pose: { [joint]: q } as HumanPose, joint, reach });
      keys.push({ dir: qrot(q, rest), morph: name });
    }
    drivers.push({ bone: joint, space, rest, keys });
  };
  for (const s of ['Left', 'Right'] as const) {
    const side = s[0] as 'L' | 'R';
    const J = (n: string) => `${s}${n}` as HumanJoint;
    const fore = dirOf(J('ForeArm')), arm = dirOf(J('Arm')), leg = dirOf(J('Leg')), thigh = dirOf(J('UpLeg'));
    add(side, J('ForeArm'), J('Arm'), 0.17, norm(cross(fore, [0, 0, 1])), [['elbow90', 90], ['elbow145', 145]]);
    add(side, J('Arm'), 'Spine2', 0.24, norm(cross(arm, [0, 1, 0])), [['shoulderUp60', 60], ['shoulderUp110', 110]]);
    add(side, J('Arm'), 'Spine2', 0.24, norm(cross(arm, [0, -1, 0])), [['shoulderDown', 38]]);
    add(side, J('Arm'), 'Spine2', 0.24, norm(cross(arm, [0, 0, 1])), [['shoulderFwd', 80]]);
    add(side, J('Leg'), J('UpLeg'), 0.17, norm(cross(leg, [0, 0, -1])), [['knee90', 90], ['knee130', 130]]);
    add(side, J('UpLeg'), 'Hips', 0.22, norm(cross(thigh, [0, 0, 1])), [['hip90', 90]]);
  }
  return { specs, drivers };
}

/** Hand poses as local finger rotations (rest orientation identity): katana grip, fist, relaxed. */
function grips(a: HumanAnatomy) {
  const out: Record<string, Record<string, [number, number, number, number]>> = {};
  const POSES: Record<string, Record<string, [number, number, number]>> = {
    katana: { Thumb: [18, 32, 28], Index: [48, 72, 42], Middle: [58, 80, 44], Ring: [64, 84, 44], Pinky: [70, 86, 44] },
    fist: { Thumb: [26, 44, 38], Index: [86, 96, 62], Middle: [88, 98, 62], Ring: [90, 98, 60], Pinky: [92, 98, 58] },
    relaxed: { Thumb: [6, 10, 8], Index: [12, 18, 10], Middle: [16, 22, 12], Ring: [20, 26, 14], Pinky: [24, 30, 16] },
  };
  for (const s of ['Left', 'Right'] as const) {
    const palm = a.grip[s].palm;
    for (const [pose, fingers] of Object.entries(POSES)) {
      const g: Record<string, [number, number, number, number]> = {};
      for (const [f, angles] of Object.entries(fingers)) {
        const j1 = a.byName[`${s}Hand${f}1` as HumanJoint];
        const dir = norm(sub(j1.tip, j1.at));
        const axis = norm(cross(dir, palm));
        angles.forEach((deg, k) => { g[`${s}Hand${f}${k + 1}`] = qaxis(axis, deg * D2R); });
      }
      out[`${s}:${pose}`] = g;
    }
  }
  return out;
}

// ---- Face -------------------------------------------------------------------------------------------------------

/** The VTuber rig builder's 43 ARKit shapes, authored on the canonical face (the landmarks this head was built on). */
function faceShapes(m: BodyMesh, a: HumanAnatomy): Float32Array[] {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals.slice(), 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices.slice(), 1));
  const mesh = new THREE.Mesh(geo) as unknown as THREE.SkinnedMesh;
  const P = a.face.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const { frame, shapes } = buildArkitShapes(P);
  transferFace(mesh, P, frame, shapes, { eyes: false, mouth: false });
  return (geo.morphAttributes.position ?? []).map((attr) => attr.array as Float32Array);
}

/** Carry weights and shapes onto the painter's vertices (it splits them along its UV seams; positions are untouched). */
function matchPainted(p: ReturnType<typeof paintFromViews>, head: ReturnType<typeof cutOffset>, morphs: Float32Array[]): GPrim {
  const key = (x: number, y: number, z: number) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
  const src = new Map<string, number>();
  const hp = head.mesh.positions;
  for (let v = 0; v < hp.length / 3; v++) src.set(key(hp[v * 3], hp[v * 3 + 1], hp[v * 3 + 2]), v);
  const n = p.positions.length / 3;
  const near = nearestOnBody(head.mesh, p.positions);
  const from = new Int32Array(n);
  let exact = 0;
  for (let v = 0; v < n; v++) {
    const k = src.get(key(p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]));
    if (k !== undefined) exact++;
    from[v] = k ?? near[v];
  }
  const normals = new Float32Array(n * 3), joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  const targets = morphs.map(() => new Float32Array(n * 3));
  for (let v = 0; v < n; v++) {
    const s = from[v];
    normals.set(head.mesh.normals.subarray(s * 3, s * 3 + 3), v * 3);
    joints.set(head.skin.skinIndex.subarray(s * 4, s * 4 + 4), v * 4);
    weights.set(head.skin.skinWeight.subarray(s * 4, s * 4 + 4), v * 4);
    morphs.forEach((m, i) => targets[i].set(m.subarray(s * 3, s * 3 + 3), v * 3));
  }
  if (exact < n * 0.98) console.warn(`[forge] painted head: only ${exact}/${n} vertices matched exactly`);
  return { positions: p.positions, normals, uvs: p.uvs, indices: p.indices, joints, weights, material: 0, targets };
}

// ---- Mesh plumbing -----------------------------------------------------------------------------------------------

function skinToFloat(s: Skin) {
  const f = new Float32Array(s.skinIndex.length * 2);
  for (let i = 0; i < s.skinIndex.length / 4; i++) for (let k = 0; k < 4; k++) { f[i * 8 + k] = s.skinIndex[i * 4 + k]; f[i * 8 + 4 + k] = s.skinWeight[i * 4 + k]; }
  return f;
}
function floatToSkin(f: Float32Array): Skin {
  const n = f.length / 8;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = f[i * 8 + k]; skinWeight[i * 4 + k] = f[i * 8 + 4 + k]; }
  return { skinIndex, skinWeight };
}

function prim(m: BodyMesh & { uvs?: Float32Array }, s: Skin, material: number): GPrim {
  return { positions: m.positions, normals: m.normals, uvs: m.uvs ?? boxUv(m.positions, m.normals), indices: m.indices, joints: s.skinIndex, weights: s.skinWeight, material };
}
/** Box-projected UVs in metres for tiling materials (cloth weave), each face picks its dominant axis. */
function boxUv(p: Float32Array, n: Float32Array) {
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i++) {
    const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]), az = Math.abs(n[i * 3 + 2]);
    const [u, v] = ax > ay && ax > az ? [p[i * 3 + 2], p[i * 3 + 1]] : ay > az ? [p[i * 3], p[i * 3 + 2]] : [p[i * 3], p[i * 3 + 1]];
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  return uv;
}

/** A garment cut from the body's own surface and pushed out along its normals. */
function cutOffset(body: BodyMesh, skin: Skin, morphs: Float32Array[], select: (v: number) => boolean, offset: number) {
  const tris: number[] = [];
  for (let i = 0; i < body.indices.length; i += 3) {
    const a = body.indices[i], b = body.indices[i + 1], c = body.indices[i + 2];
    if (select(a) && select(b) && select(c)) tris.push(a, b, c);
  }
  const cut = compact({ ...body, indices: new Uint32Array(tris) }, [skinToFloat(skin), ...morphs]);
  const m = cut.mesh;
  for (let v = 0; v < m.positions.length; v += 3) for (let k = 0; k < 3; k++) m.positions[v + k] += m.normals[v + k] * offset;
  return { mesh: m, skin: floatToSkin(cut.extra[0]), morphs: cut.extra.slice(1) };
}

/** Skin a cloth piece: nearest body vertex's weights and correctives, smoothed over the cloth, then the chains. */
function skinCloth(mb: MeshBuilder, body: BodyMesh, skin: Skin, morphs: Float32Array[], kit: Wardrobe, mat: string, boneIndex: Map<string, number>): GPrim {
  const n = mb.count;
  const pos = new Float32Array(mb.pos), nor = new Float32Array(mb.nor);
  const near = nearestOnBody(body, pos);
  const J = HUMAN_JOINTS.length + kit.bones.length;
  const dense = new Float32Array(n * J);
  for (let v = 0; v < n; v++) {
    const b = near[v];
    if (b < 0) { dense[v * J] = 1; continue; }
    for (let k = 0; k < 4; k++) dense[v * J + skin.skinIndex[b * 4 + k]] += skin.skinWeight[b * 4 + k];
  }
  // loose cloth follows the limb as a whole: smooth its weights across the garment
  const idx = new Uint32Array(mb.idx);
  const nb = neighbours(idx, n);
  for (let pass = 0; pass < 6; pass++) {
    const next = dense.slice();
    for (let v = 0; v < n; v++) {
      if (!nb[v].length) continue;
      for (let j = 0; j < HUMAN_JOINTS.length; j++) {
        let s = 0; for (const o of nb[v]) s += dense[o * J + j];
        next[v * J + j] = dense[v * J + j] * 0.4 + (s / nb[v].length) * 0.6;
      }
    }
    dense.set(next);
  }
  const chains = kit.clothChains.get(mat);
  if (chains) for (const [v, ws] of chains) {
    const total = ws.reduce((t, [, w]) => t + w, 0);
    if (total <= 0) continue;
    const k = Math.min(1, total);
    for (let j = 0; j < J; j++) dense[v * J + j] *= 1 - k;
    for (const [b, w] of ws) dense[v * J + boneIndex.get(b)!] += (w / total) * k;
  }
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const top: [number, number][] = [];
    for (let j = 0; j < J; j++) if (dense[v * J + j] > 1e-3) top.push([j, dense[v * J + j]]);
    top.sort((a, b) => b[1] - a[1]);
    const t4 = top.slice(0, 4), sum = t4.reduce((s, [, w]) => s + w, 0) || 1;
    t4.forEach(([j, w], k) => { joints[v * 4 + k] = j; weights[v * 4 + k] = w / sum; });
    if (!t4.length) { joints[v * 4] = 0; weights[v * 4] = 1; }
  }
  const targets = morphs.map((d) => {
    const t = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { const b = near[v]; if (b < 0) continue; t[v * 3] = d[b * 3]; t[v * 3 + 1] = d[b * 3 + 1]; t[v * 3 + 2] = d[b * 3 + 2]; }
    return t;
  });
  return { positions: pos, normals: nor, uvs: new Float32Array(mb.uv), indices: idx, joints, weights, material: MATERIAL_INDEX[mat], targets };
}

/** Rigid pieces: every vertex on its one bone. Zero morph targets keep the mesh's target count consistent. */
function rigidPrim(mb: MeshBuilder, boneIndex: Map<string, number>, mat: string, targetCount: number): GPrim {
  const n = mb.count;
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { joints[v * 4] = boneIndex.get(mb.bone[v]) ?? 0; weights[v * 4] = 1; }
  const zero = new Float32Array(n * 3);
  return { positions: new Float32Array(mb.pos), normals: new Float32Array(mb.nor), uvs: new Float32Array(mb.uv), indices: new Uint32Array(mb.idx), joints, weights, material: MATERIAL_INDEX[mat], targets: Array.from({ length: targetCount }, () => zero) };
}
function rigidWorldPrim(mb: MeshBuilder, mat: string): GPrim {
  return { positions: new Float32Array(mb.pos), normals: new Float32Array(mb.nor), uvs: new Float32Array(mb.uv), indices: new Uint32Array(mb.idx), material: MATERIAL_INDEX[mat] };
}
function localPrims(meshes: Map<string, MeshBuilder>): GPrim[] {
  return [...meshes].map(([mat, mb]) => rigidWorldPrim(mb, mat));
}

main().catch((e) => { console.error(e); process.exit(1); });
