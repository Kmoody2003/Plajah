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
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  buildHumanAnatomy, HARU_TUNE, HUMAN_JOINTS, PARENT, TWIST_JOINTS, qaxis, qrot,
  type HumanAnatomy, type HumanJoint, type HumanPose, type HumanTune,
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
import { exportKit } from './forgeKit';
import { fitFaceToArt, paintHeadFromSheet, HARU_SHEET, loadHeadWarp, headWarpMap, warpField, HEAD_WARP_FILE } from './forgeFaceFit';
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
/** Haru's head against the turnaround: the cranium a little larger, higher and forward of the average head, the neck thicker. */
const HARU_HEAD = { forward: Number(process.env.FORGE_HEAD_FWD ?? 0.022), up: Number(process.env.FORGE_HEAD_UP ?? 0.012), scale: Number(process.env.FORGE_HEAD_SCALE ?? 1.07), width: Number(process.env.FORGE_HEAD_WIDTH ?? 0.95), neck: 1.18 };
type Skin = { skinIndex: Uint16Array; skinWeight: Float32Array };

async function main() {
  // the face's shape from Muse's art (forgeFaceFit.ts), and the head grown and moved forward to meet it as the
  // turnaround's side view has it; the average face when the art is not on this machine
  const REF = process.env.FORGE_FACE_ART ?? 'D:/Plajah Runtime/forge/haru-ref/front.png';
  const refMarks = REF.replace(/\.png$/, '.landmarks.json');
  let tune: HumanTune = HARU_TUNE;
  if (fs.existsSync(refMarks) && fs.existsSync(HARU_SHEET.path) && process.env.FORGE_FACE_FIT !== '0') {
    const fit = await fitFaceToArt({ landmarks: refMarks, chinY: 1.537 });
    tune = { ...HARU_TUNE, face: fit.points, head: HARU_HEAD };
    log(`face fitted to the art: ${JSON.stringify(fit.report)}`);
  }
  const anatomy = buildHumanAnatomy(tune);
  log(`anatomy: ${anatomy.bones.length} joints, ${anatomy.muscles.length} muscles, ${anatomy.parts.length} clay parts`);

  // ---- Body ----------------------------------------------------------------------------------------------
  const voxel = Number(process.env.FORGE_VOXEL ?? 0.0035);
  let field = bodyField(anatomy);
  // the fidelity loop's measured corrections (forgeFidelity.ts --update-warp): the head's field bent to the art's
  // outlines, and the landmarks and eyes carried with it so the face's paint and rig stay on the surface
  const warp = process.env.FORGE_WARP === '0' ? null : loadHeadWarp(process.env.FORGE_WARP_FILE ?? HEAD_WARP_FILE);
  if (warp) {
    const map = headWarpMap(warp, anatomy.face[9][1], anatomy.byName.Head.tip[1]);
    field = warpField(field, map.inverse);
    anatomy.face = anatomy.face.map((p) => map.forward(p));
    for (const e of ['LeftEye', 'RightEye'] as const) { const b = anatomy.byName[e]; b.at = map.forward(b.at); b.tip = map.forward(b.tip); }
    log(`head warp: ${warp.passes} passes from the fidelity loop`);
  }
  // the body, its weights and correctives depend only on the anatomy, the head warp and the mesh settings: cached, so a
  // wardrobe-only change (the armour fit) rebuilds in seconds instead of a minute
  const { specs, drivers } = correctiveSpecs(anatomy);
  const bodyKey = createHash('sha1').update(JSON.stringify([tune, warp, voxel, process.env.FORGE_TRIS, process.env.FORGE_HEAD_TRIS,
    ...['services/argilla/creature/human.ts', 'services/argilla/creature/humanFinish.ts', 'services/argilla/bake.ts'].map((f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')])).digest('hex').slice(0, 16);
  const cacheFile = path.join(WORK, `body_${bodyKey}.bin`);
  const cached = process.env.FORGE_BODY_CACHE !== '0' ? loadBody(cacheFile) : null;
  const { body, skin, correctives } = cached ?? await (async () => {
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
    const correctives: Float32Array[] = [];
    for (const spec of specs) {
      const d = bakeCorrective(body, skin, anatomy, field, spec);
      correctives.push(d);
      let max = 0, moved = 0;
      for (let i = 0; i < d.length; i += 3) { const l = Math.hypot(d[i], d[i + 1], d[i + 2]); max = Math.max(max, l); if (l > 0.001) moved++; }
      log(`corrective ${spec.name}: ${moved} verts, max ${(max * 1000).toFixed(1)} mm`);
    }
    return { body, skin, correctives };
  })();
  if (cached) log(`body from cache (${path.basename(cacheFile)}): ${body.positions.length / 3} verts`);
  else saveBody(cacheFile, body, skin, correctives);
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
  rigFaceToHead(head.mesh.positions, head.skin, anatomy);
  const arkit = faceShapes(head.mesh, anatomy.face);
  let crownY = -Infinity, zLo = Infinity, zHi = -Infinity;
  for (let v = 0; v < head.mesh.positions.length / 3; v++) { crownY = Math.max(crownY, head.mesh.positions[v * 3 + 1]); zLo = Math.min(zLo, head.mesh.positions[v * 3 + 2]); zHi = Math.max(zHi, head.mesh.positions[v * 3 + 2]); }
  log(`head: ${head.mesh.positions.length / 3} verts, ${ARKIT_SHAPES.length} ARKit shapes from the canonical face`);

  // ---- Wardrobe ------------------------------------------------------------------------------------------
  // the armour's fitted shape (forgeArmourFit.ts searches it against the art)
  const ARMOUR_FIT_FILE = process.env.FORGE_ARMOUR_FIT ?? 'scripts/eraclash3d/data/haru_armour_fit.json';
  const armourFit = fs.existsSync(ARMOUR_FIT_FILE) ? JSON.parse(fs.readFileSync(ARMOUR_FIT_FILE, 'utf8')) : {};
  const kit = buildHaruKit(anatomy, field, armourFit);
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
    // just behind the face's outline at the cheekbone (234/454), as the side view has it
    const side = anatomy.face[sx > 0 ? 454 : 234];
    const root = snap([sx * 0.12, anatomy.face[9][1] - 0.028, side[2] - 0.04], 0);
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
    // the sleeve runs on into a fingerless glove over the palm and the back of the hand (the art's navy tekko gloves)
    koteCloth: (v) => /^(Left|Right)(Arm|ArmTwist|ForeArm|ForeArmTwist|Hand)$/.test(dominant(v)),
    kyahan: (v) => /^(Left|Right)Leg$/.test(dominant(v)) && P(v)[1] < 0.5, // up to the hakama's gather under the knee
    tabi: (v) => /^(Left|Right)(Foot|ToeBase)$/.test(dominant(v)),
  };
  const OFFSET: Record<string, number> = { kosode: 0.009, koteCloth: 0.0075, kyahan: 0.03, tabi: 0.0035 };
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
    // (the art shows one sword: the wakizashi is there with FORGE_WAKIZASHI=1)
    if (s.name === 'socket_obi_wakizashi' && process.env.FORGE_WAKIZASHI === '1') meshes.push({ name: 'wakizashi', prims: localPrims(saya({ length: 0.54, sori: 0.012, bone: '', hilt: 0.17 })) });
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
      cloth: kit.clothSims,
      capsules: anatomy.capsules.map((c) => ({ bone: c.bone, a: sub(c.a, anatomy.byName[c.bone].at), b: sub(c.b, anatomy.byName[c.bone].at), r: c.r })),
      drivers,
      twists: Object.entries(TWIST_JOINTS).map(([bone, t]) => ({ bone, driver: t.driver, share: t.share, axis: norm(sub(anatomy.byName[t.parent as HumanJoint].tip, anatomy.byName[t.parent as HumanJoint].at)) })),
      grips: grips(anatomy),
      hold: { Right: 'Right:katana', Left: 'Left:relaxed' },
      optional: { kabuto: process.env.FORGE_KABUTO === '1' },
      pieces: kit.pieces,
      tune: { ...anatomy.tune, face: undefined },
      muscles: anatomy.muscles.map((m) => ({ id: m.id, label: m.label })),
    },
  };
  // painted hair at the back stops just under where the cards end, so the front/back split never shows
  // the procedural paint underneath (hair at the back, skin where the art has background), then Muse's front art
  // warped onto the face along MediaPipe's landmarks when it is there (engines/tela-3d/face_landmarks.py)
  const procFace = paintFace(anatomy.face, crownY, anatomy.face[9][1] - 0.1, (zLo + zHi) / 2, 1024);
  const fromArt = fs.existsSync(REF) && fs.existsSync(refMarks)
    ? paintFaceFromArt(procFace, anatomy.face, REF, JSON.parse(fs.readFileSync(refMarks, 'utf8')) as ArtLandmarks, CANONICAL_INDICES)
    : null;
  let atlasFace = fromArt ?? procFace;
  log(fromArt ? `face: painted from ${REF}` : 'face: procedural (no front art)');
  const browY = anatomy.face[9][1], centreZ = (zLo + zHi) / 2;
  // the unrolled strip takes what is behind the face's outline (its cheekbone points, 234/454) and turned away, or
  // behind the head's middle and facing back; everything on the face stays in the front projection
  const sideZ = Math.min(anatomy.face[234][2], anatomy.face[454][2]) + 0.006;
  // (never the throat's midline in front of the middle: the strip wraps round there)
  const onStrip = (c: Vec3, nz: number) => !(Math.abs(c[0]) < 0.035 && c[2] > centreZ) && ((nz < 0.25 && c[2] < sideZ) || (nz < -0.15 && c[2] < centreZ));
  const headPrim = faceUvPrim(head, arkit, atlasFace.uvOf, onStrip);
  // the sides and back of the head from the turnaround's side and back views
  if (fromArt && fs.existsSync(HARU_SHEET.path)) {
    const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
    atlasFace = { ...atlasFace, png: await paintHeadFromSheet(atlasFace.png, { ...headPrim, uvs: headPrim.uvs! }, { chinY: 1.537, frontSkin: fromArt.skin.map(toSrgb), front: 0.72, faceZ: sideZ - 0.005, browY, seamY: SEAM }) /* behind the face's outline only: the profile's cheek highlight must not stripe the face */ };
    log('head: sides and back painted from the sheet');
  }
  fs.writeFileSync(path.join(WORK, 'face_atlas.png'), atlasFace.png);
  /** Hair grows above the art's hairline (hairSystem.hairlineAt), the same line the strand roots start on. */
  // ... and wherever the painted art is hair above the brows (its own hairline), so paint and scalp meet exactly
  const atlasPx = PNG.sync.read(Buffer.from(atlasFace.png));
  // (the atlas holds the art's hair all round now: in front above the brows, at the sides down the sideburns, at the
  // back to the nape; beard and moustache are dark too, so the height limits keep them skin)
  const paintedHair = (p: Vec3, nz: number) => {
    const back = onStrip(p, nz);
    // never on the face itself (its brows and nostril shadows are dark too): above the forehead, or behind the face
    if (p[2] > sideZ + 0.02 && p[1] < browY + 0.035) return false;
    // (down to the nape only at the back: the jaw's underside behind the chin is dark with beard, not hair)
    const floor = nz > 0.6 ? 0.035 : nz > -0.3 || p[2] > centreZ - 0.02 ? -0.06 : -0.13;
    if (p[1] < browY + floor) return false;
    const [u, v] = atlasFace.uvOf(p, back);
    const x = Math.min(atlasPx.width - 1, Math.max(0, Math.round(u * atlasPx.width))), y = Math.min(atlasPx.height - 1, Math.max(0, Math.round(v * atlasPx.height)));
    const i = (y * atlasPx.width + x) * 4;
    return 0.3 * atlasPx.data[i] + 0.59 * atlasPx.data[i + 1] + 0.11 * atlasPx.data[i + 2] < 62;
  };
  // (the table decides only above the brows; lower down, at the sideburns and the nape, the art's own paint does, so
  // the dark scalp never scatters into the skin triangle by triangle)
  const onScalp = (p: Vec3, nz: number) => (p[1] > browY - 0.01 && p[1] > browY + hairlineAt(Math.atan2(p[0], p[2] - centreZ)) + 0.002) || paintedHair(p, nz);
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
  character.materials.push({ ...skinMat, name: 'face', color: [1, 1, 1, 1], baseColorTexture: base }); // the body's own gloss: no shading step at the neck
  headPrim.material = character.materials.length - 1;
  // the scalp under the strand cards: the hair's colour, matte, with the cord normal map running along the strands
  // (painted with the art's own hair from the face atlas, front, sides and back; glossier than skin, a soft sheen)
  character.materials.push({ name: 'scalp', color: [1, 1, 1, 1], baseColorTexture: base, metallic: 0, roughness: 0.5, specular: { factor: 0.35 }, sheen: { color: [0.06, 0.05, 0.045], roughness: 0.4 } });
  scalpPrim.material = character.materials.length - 1;
  // skin elsewhere (hands, neck) in the face's tone
  character.materials[MATERIAL_INDEX.skin] = { ...character.materials[MATERIAL_INDEX.skin], color: [...(fromArt?.skin ?? [0.55, 0.29, 0.16]), 1] as [number, number, number, number] };
  const atlas = character.images.length;
  character.images.push(rgbaPng(strandAtlas(512, 4), 512));
  const hc = character.materials[MATERIAL_INDEX.hairCards];
  character.materials[MATERIAL_INDEX.hairCards] = { ...hc, color: [0.016, 0.013, 0.012, 1], baseColorTexture: atlas, roughness: 0.55, specular: { factor: 0.2 }, anisotropy: undefined };
  // every armour, garment and weapon piece also as its own asset (forgeKit.ts)
  if (process.env.FORGE_KIT !== '0' && !NAKED) {
    const assets = exportKit({ kit, materials: character.materials, images: character.images, materialIndex: MATERIAL_INDEX, outDir: 'public/games/era-clash/3d/assets/props/haru', character: 'Haru' });
    log(`kit: ${assets.length} assets -> public/games/era-clash/3d/assets/props/haru (${assets.map((a) => a.id).join(', ')})`);
  }
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

// ---- The body cache ---------------------------------------------------------------------------------------------

function saveBody(file: string, body: BodyMesh, skin: Skin, correctives: Float32Array[]) {
  const parts: ArrayBufferView[] = [body.positions, body.normals, body.indices, skin.skinIndex, skin.skinWeight, ...correctives];
  const head = Buffer.from(JSON.stringify(parts.map((p) => [p.constructor.name, p.byteLength])));
  fs.writeFileSync(file, Buffer.concat([Buffer.from(String(head.length).padStart(10, '0')), head, ...parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))]));
}
function loadBody(file: string): { body: BodyMesh; skin: Skin; correctives: Float32Array[] } | null {
  if (!fs.existsSync(file)) return null;
  const b = fs.readFileSync(file), hl = Number(b.subarray(0, 10).toString());
  const meta = JSON.parse(b.subarray(10, 10 + hl).toString()) as [string, number][];
  let off = 10 + hl;
  const T: Record<string, new (buf: ArrayBuffer) => ArrayBufferView> = { Float32Array, Uint32Array, Uint16Array };
  const arrs = meta.map(([name, len]) => { const a = new T[name](b.buffer.slice(b.byteOffset + off, b.byteOffset + off + len)); off += len; return a; });
  const [positions, normals, indices, skinIndex, skinWeight, ...cor] = arrs as [Float32Array, Float32Array, Uint32Array, Uint16Array, Float32Array, ...Float32Array[]];
  return { body: { positions, normals, indices }, skin: { skinIndex, skinWeight }, correctives: cor };
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

/**
 * Everything above the jaw line moves with the head alone. The anatomy's weights blend the neck and upper spine far up
 * into the cheeks and mouth (its neck cone reaches the jaw), so the face sheared whenever the neck bent. The line runs
 * chin (152) to the jaw's angle (58/288) and on round the skull's base; the throat under it keeps the anatomy's blend.
 * Eyeballs keep their own bones.
 */
function rigFaceToHead(pos: Float32Array, s: Skin, a: HumanAnatomy) {
  const H = HUMAN_JOINTS.indexOf('Head'), eyes = new Set([HUMAN_JOINTS.indexOf('LeftEye'), HUMAN_JOINTS.indexOf('RightEye')]);
  const chin = a.face[152], gon = a.face[58];
  const jawY = (z: number) => z >= chin[2] ? chin[1] : z <= gon[2] ? gon[1] + 0.006 : gon[1] + (chin[1] - gon[1]) * ((z - gon[2]) / (chin[2] - gon[2]));
  for (let v = 0; v < pos.length / 3; v++) {
    const t = Math.max(0, Math.min(1, (pos[v * 3 + 1] - (jawY(pos[v * 3 + 2]) - 0.012)) / 0.02));
    const w = t * t * (3 - 2 * t);
    if (w <= 0) continue;
    if ([0, 1, 2, 3].some((k) => eyes.has(s.skinIndex[v * 4 + k]) && s.skinWeight[v * 4 + k] > 0.5)) continue;
    const m = new Map<number, number>();
    for (let k = 0; k < 4; k++) if (s.skinWeight[v * 4 + k] > 0) m.set(s.skinIndex[v * 4 + k], (m.get(s.skinIndex[v * 4 + k]) ?? 0) + s.skinWeight[v * 4 + k] * (1 - w));
    m.set(H, (m.get(H) ?? 0) + w);
    const top = [...m].sort((p, q) => q[1] - p[1]).slice(0, 4), sum = top.reduce((acc, [, x]) => acc + x, 0) || 1;
    for (let k = 0; k < 4; k++) { s.skinIndex[v * 4 + k] = top[k]?.[0] ?? 0; s.skinWeight[v * 4 + k] = (top[k]?.[1] ?? 0) / sum; }
  }
}

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
function splitBy(p: GPrim, test: (c: Vec3, nz: number) => boolean): GPrim {
  const keep: number[] = [], moved: number[] = [];
  for (let t = 0; t < p.indices.length; t += 3) {
    const c: Vec3 = [0, 0, 0];
    let nz = 0;
    for (let e = 0; e < 3; e++) { for (let k = 0; k < 3; k++) c[k] += p.positions[p.indices[t + e] * 3 + k] / 3; nz += p.normals[p.indices[t + e] * 3 + 2] / 3; }
    (test(c, nz) ? moved : keep).push(p.indices[t], p.indices[t + 1], p.indices[t + 2]);
  }
  p.indices = new Uint32Array(keep);
  return { ...p, indices: new Uint32Array(moved) };
}

function faceUvPrim(head: ReturnType<typeof cutOffset>, morphs: Float32Array[], uvOf: (p: Vec3, back: boolean) => [number, number], onStrip: (c: Vec3, nz: number) => boolean): GPrim {
  const m = head.mesh;
  const P = (v: number): Vec3 => [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
  const key = new Map<number, number>();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], jn: number[] = [], wt: number[] = [], idx: number[] = [];
  const mt = morphs.map(() => [] as number[]);
  for (let t = 0; t < m.indices.length; t += 3) {
    const vs = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const nz = vs.reduce((a, v) => a + m.normals[v * 3 + 2], 0) / 3, cz = vs.reduce((a, v) => a + m.positions[v * 3 + 2], 0) / 3;
    const cx = vs.reduce((a, v) => a + m.positions[v * 3], 0) / 3, cy = vs.reduce((a, v) => a + m.positions[v * 3 + 1], 0) / 3;
    const back = onStrip([cx, cy, cz], nz);
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
