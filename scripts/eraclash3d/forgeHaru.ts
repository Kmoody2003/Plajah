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
import { buildHaruKit, quatFromBasis, unitBox, MeshBuilder, type Wardrobe } from '../../services/argilla/creature/wardrobe';
import { PNG } from 'pngjs';
import { ear } from '../../services/argilla/creature/ears';
import { nihonto, saya } from '../../services/argilla/creature/weapons';
import { forgeToGlb, type ForgeCharacter, type ForgeRigid, type ForgeSocket } from '../../services/argilla/creature/exportCreature';
import type { GPrim } from '../../services/argilla/creature/gltfWriter';
import { haruMaterials, MATERIAL_INDEX, paintHaru, rgbaPng, paintFace, paintFaceFromArt, type ArtLandmarks } from './forgeLook';
import { CANONICAL_INDICES } from '../../services/vtuber/rigBuilder/canonicalFace';
import { fitScalp, ponytail, strandAtlas, hairlineAt } from '../../services/argilla/creature/hairSystem';
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
  // the head keeps far more of its detail than the body (the face is what the camera looks at); the two are simplified
  // apart with their shared border locked, so the seam stays closed
  const headTris: number[] = [], restTris: number[] = [];
  for (let i = 0; i < raw.indices.length; i += 3) {
    const y = (raw.positions[raw.indices[i] * 3 + 1] + raw.positions[raw.indices[i + 1] * 3 + 1] + raw.positions[raw.indices[i + 2] * 3 + 1]) / 3;
    (y > 1.47 ? headTris : restTris).push(raw.indices[i], raw.indices[i + 1], raw.indices[i + 2]);
  }
  const [simpleHead] = MeshoptSimplifier.simplify(new Uint32Array(headTris), raw.positions, 3, Number(process.env.FORGE_HEAD_TRIS ?? 22000) * 3, 0.0008, ['LockBorder']);
  const [simpleRest] = MeshoptSimplifier.simplify(new Uint32Array(restTris), raw.positions, 3, Number(process.env.FORGE_TRIS ?? 50000) * 3, 0.002, ['LockBorder']);
  const simple = new Uint32Array(simpleHead.length + simpleRest.length); simple.set(simpleHead); simple.set(simpleRest, simpleHead.length);
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

  // ---- Head: its own mesh above a seam under the jaw, the ARKit shapes on its canonical face, painted from its landmarks
  const SEAM = 1.5;
  const Pb = (v: number): Vec3 => [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
  // correctives fade out just under the seam, so the head and the body never part
  for (const d of correctives) for (let v = 0; v < d.length / 3; v++) {
    const k = Math.max(0, Math.min(1, (SEAM - 0.004 - Pb(v)[1]) / 0.035));
    d[v * 3] *= k; d[v * 3 + 1] *= k; d[v * 3 + 2] *= k;
  }
  const inHead = (v: number) => Pb(v)[1] >= SEAM;
  const head = cutOffset(body, skin, [], inHead, 0);
  const arkit = faceShapes(head.mesh, anatomy.face);
  let crownY = -Infinity, zLo = Infinity, zHi = -Infinity;
  for (let v = 0; v < head.mesh.positions.length / 3; v++) { crownY = Math.max(crownY, head.mesh.positions[v * 3 + 1]); zLo = Math.min(zLo, head.mesh.positions[v * 3 + 2]); zHi = Math.max(zHi, head.mesh.positions[v * 3 + 2]); }
  log(`head: ${head.mesh.positions.length / 3} verts, ${ARKIT_SHAPES.length} ARKit shapes from the canonical face`);

  // ---- Wardrobe ------------------------------------------------------------------------------------------
  const kit = buildHaruKit(anatomy, field);
  log(`wardrobe: ${kit.pieces.map((p) => p.id).join(', ')}; ${kit.bones.length} chain bones, ${kit.springs.length} spring chains`);
  // hair: strand cards over the painted scalp, swept back to a tied ponytail on a spring chain (Muse turnaround)
  const scalp = fitScalp(head.mesh.positions, crownY, anatomy.face[9][1]); // landmark 9: between the brows
  const snap = (p: Vec3, lift: number) => {
    let q: Vec3 = [...p];
    for (let i = 0; i < 4; i++) { const d = field.d(q[0], q[1], q[2]) - lift; const g = field.grad(q[0], q[1], q[2]); q = [q[0] - g[0] * d, q[1] - g[1] * d, q[2] - g[2] * d]; }
    return { p: q, n: field.grad(q[0], q[1], q[2]) };
  };
  const hair = ponytail(scalp, { headBone: 'Head', columns: 4, snap });
  // ears (the canonical face has none): on the side of the head, top at the brow, a little behind the head's middle
  const ears = new MeshBuilder();
  for (const sx of [1, -1]) {
    const root = snap([sx * 0.12, anatomy.face[9][1] - 0.028, (zLo + zHi) / 2 - 0.012], 0);
    ear(ears, { at: root.p, normal: root.n, bone: 'Head' });
  }
  kit.bones.push(...hair.bones);
  kit.springs.push(...hair.springs);
  log(`hair: ${hair.guides} strand cards, ${hair.springs.length} spring chains`);
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
  };
  const OFFSET: Record<string, number> = { kosode: 0.009, koteCloth: 0.0075, kyahan: 0.013, tabi: 0.0035 };
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
  armourPrims.push(rigidPrim(hair.mesh, boneIndex, 'hairCards', 0), rigidPrim(hair.cord, boneIndex, 'silk', 0), rigidPrim(ears, boneIndex, 'skin', 0));
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
  // painted hair at the back stops just under where the cards end, so the front/back split never shows
  // the procedural paint underneath (hair at the back, skin where the art has background), then Muse's front art
  // warped onto the face along MediaPipe's landmarks when it is there (engines/tela-3d/face_landmarks.py)
  const procFace = paintFace(anatomy.face, crownY, anatomy.face[9][1] - 0.1, (zLo + zHi) / 2, 1024);
  const REF = process.env.FORGE_FACE_ART ?? 'D:/Plajah Runtime/forge/haru-ref/front.png';
  const refMarks = REF.replace(/\.png$/, '.landmarks.json');
  const fromArt = fs.existsSync(REF) && fs.existsSync(refMarks)
    ? paintFaceFromArt(procFace, anatomy.face, REF, JSON.parse(fs.readFileSync(refMarks, 'utf8')) as ArtLandmarks, CANONICAL_INDICES)
    : null;
  const atlasFace = fromArt ?? procFace;
  log(fromArt ? `face: painted from ${REF}` : 'face: procedural (no front art)');
  fs.writeFileSync(path.join(WORK, 'face_atlas.png'), atlasFace.png);
  const browY = anatomy.face[9][1], centreZ = (zLo + zHi) / 2;
  /** Hair grows above the art's hairline (hairSystem.hairlineAt), the same line the strand roots start on. */
  // ... and wherever the painted art is hair above the brows (its own hairline), so paint and scalp meet exactly
  const atlasPx = PNG.sync.read(Buffer.from(atlasFace.png));
  const paintedHair = (p: Vec3) => {
    if (p[1] < browY + 0.02 || p[2] < centreZ) return false;
    const [u, v] = atlasFace.uvOf(p, false);
    const x = Math.min(atlasPx.width - 1, Math.max(0, Math.round(u * atlasPx.width))), y = Math.min(atlasPx.height - 1, Math.max(0, Math.round(v * atlasPx.height)));
    const i = (y * atlasPx.width + x) * 4;
    return 0.3 * atlasPx.data[i] + 0.59 * atlasPx.data[i + 1] + 0.11 * atlasPx.data[i + 2] < 62;
  };
  const onScalp = (p: Vec3) => p[1] > browY + hairlineAt(Math.atan2(p[0], p[2] - centreZ)) + 0.002 || paintedHair(p);
  const headPrim = faceUvPrim(head, arkit, atlasFace.uvOf, centreZ);
  const scalpPrim = splitBy(headPrim, onScalp);
  const extrasFace = { landmarks: anatomy.face.flat().map((x) => +x.toFixed(5)), shapes: ARKIT_SHAPES };
  const character: ForgeCharacter = {
    name: 'Haru',
    bones,
    skinned: NAKED
      ? [{ name: 'Haru_body', prims: [bodyPrim], targetNames: morphNames }]
      : [
        { name: 'Haru_head', prims: [headPrim, scalpPrim], targetNames: [...ARKIT_SHAPES], extras: { face: extrasFace } },
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
  // the face's own painting; the hair cards get the generated strand atlas
  const base = character.images.length;
  character.images.push(atlasFace.png);
  const skinMat = character.materials[MATERIAL_INDEX.skin];
  character.materials.push({ ...skinMat, name: 'face', color: [1, 1, 1, 1], baseColorTexture: base, roughness: 0.55, specular: { factor: 0.45 } });
  headPrim.material = character.materials.length - 1;
  // the scalp under the strand cards: the hair's colour, matte, with the cord normal map running along the strands
  character.materials.push({ name: 'scalp', color: [0.014, 0.011, 0.01, 1], metallic: 0, roughness: 0.7, sheen: { color: [0.06, 0.05, 0.045], roughness: 0.4 } });
  scalpPrim.material = character.materials.length - 1;
  // skin elsewhere (hands, neck) in the face's tone
  character.materials[MATERIAL_INDEX.skin] = { ...character.materials[MATERIAL_INDEX.skin], color: [...(fromArt?.skin ?? [0.55, 0.29, 0.16]), 1] as [number, number, number, number] };
  const atlas = character.images.length;
  character.images.push(rgbaPng(strandAtlas(512, 4), 512));
  const hc = character.materials[MATERIAL_INDEX.hairCards];
  character.materials[MATERIAL_INDEX.hairCards] = { ...hc, color: [0.016, 0.013, 0.012, 1], baseColorTexture: atlas, roughness: 0.55, specular: { factor: 0.2 }, anisotropy: undefined };
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
function faceShapes(m: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, landmarks: Vec3[]): Float32Array[] {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals.slice(), 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices.slice(), 1));
  const mesh = new THREE.Mesh(geo) as unknown as THREE.SkinnedMesh;
  const P = landmarks.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
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

/**
 * The head with its atlas UVs: triangles facing forward take the front projection, the back of the head its own strip;
 * a vertex used by both sides is split so neither stretches across the atlas.
 */
/** Move the triangles that pass a test out of a primitive into a new one (same vertices, same morphs). */
function splitBy(p: GPrim, test: (c: Vec3) => boolean): GPrim {
  const keep: number[] = [], moved: number[] = [];
  for (let t = 0; t < p.indices.length; t += 3) {
    const c: Vec3 = [0, 0, 0];
    for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) c[k] += p.positions[p.indices[t + e] * 3 + k] / 3;
    (test(c) ? moved : keep).push(p.indices[t], p.indices[t + 1], p.indices[t + 2]);
  }
  p.indices = new Uint32Array(keep);
  return { ...p, indices: new Uint32Array(moved) };
}

function faceUvPrim(head: ReturnType<typeof cutOffset>, morphs: Float32Array[], uvOf: (p: Vec3, back: boolean) => [number, number], centreZ: number): GPrim {
  const m = head.mesh;
  const P = (v: number): Vec3 => [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
  const key = new Map<number, number>();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], jn: number[] = [], wt: number[] = [], idx: number[] = [];
  const mt = morphs.map(() => [] as number[]);
  for (let t = 0; t < m.indices.length; t += 3) {
    const vs = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const nz = vs.reduce((a, v) => a + m.normals[v * 3 + 2], 0) / 3, cz = vs.reduce((a, v) => a + m.positions[v * 3 + 2], 0) / 3;
    const back = nz < -0.15 && cz < centreZ;
    for (const v of vs) {
      const k = v * 2 + (back ? 1 : 0);
      let i = key.get(k);
      if (i === undefined) {
        i = pos.length / 3; key.set(k, i);
        pos.push(...P(v)); nor.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]); uv.push(...uvOf(P(v), back));
        for (let c = 0; c < 4; c++) { jn.push(head.skin.skinIndex[v * 4 + c]); wt.push(head.skin.skinWeight[v * 4 + c]); }
        morphs.forEach((d, j) => mt[j].push(d[v * 3], d[v * 3 + 1], d[v * 3 + 2]));
      }
      idx.push(i);
    }
  }
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), indices: new Uint32Array(idx),
    joints: new Uint16Array(jn), weights: new Float32Array(wt), material: 0, targets: mt.map((a) => new Float32Array(a)),
  };
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
