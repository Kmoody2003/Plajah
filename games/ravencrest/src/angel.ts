// The orbs' halo summons an angel: the armored warrior-angel from Muse's sheet (built and rigged
// locally, assets/characters/halo_angel.glb: helm with a crown of spikes, white-gold plate over
// ragged robes, folded wings, the sunburst sword in his right hand), lit from within so the armor
// reads as holy light in the storm, with great spread wings of radiant feathers and a halo above.
// Until the model has loaded a figure of light stands in. On screen for a few seconds at a time,
// moving faster than the eye can follow.
import * as THREE from 'three/webgpu';
import { color, float, mix, positionLocal, smoothstep, time, uv, sin } from 'three/tsl';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './character';

const MODEL = '/games/ravencrest/assets/characters/halo_angel.glb';
const HEIGHT = 2.4;
let modelP: ReturnType<typeof loadGLB> | null = null;
/** Start fetching the angel early (the halo can't wait for a 13 MB download). */
export function preloadAngel() { modelP ??= loadGLB(MODEL); }

export type WingPose = 'closed' | 'spread' | 'swept';
/**
 * Wing bones for the model's folded wings (they were skinned to the back as plain body). Each wing
 * gets a root at the shoulder blade and a mid bone two-thirds down, parented to Spine2; the wing's
 * vertices (behind the back plate, between mid-body and the shoulders) are re-weighted along that
 * chain. Poses are rotations in body space: closed = the turnaround's folded rest; spread = out and
 * up, as in the front/back flight views; swept = back and up, the side-on speed pose.
 */
function rigWings(root: THREE.Object3D) {
  const sm = root.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh | undefined;
  const spine = sm?.skeleton.bones.find((b) => b.name === 'Spine2');
  if (!sm || !spine) return null;
  root.updateMatrixWorld(true);
  const pos = sm.geometry.getAttribute('position') as THREE.BufferAttribute;
  const si = sm.geometry.getAttribute('skinIndex') as THREE.BufferAttribute, sw = sm.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const H = box.max.y - box.min.y, y0 = box.min.y;
  const yTop = y0 + 0.86 * H, yMid = y0 + 0.68 * H, yTip = y0 + 0.47 * H, zBack = -0.14 * (H / 1.99);
  const toWorld = (v: THREE.Vector3) => v.applyMatrix4(sm.bindMatrix);
  const bones: { side: number; root: THREE.Bone; mid: THREE.Bone }[] = [];
  const all = [...sm.skeleton.bones];
  for (const side of [-1, 1]) {
    const r = new THREE.Bone(), m = new THREE.Bone();
    r.name = side < 0 ? 'WingRoot_L' : 'WingRoot_R'; m.name = side < 0 ? 'WingMid_L' : 'WingMid_R';
    spine.add(r);
    r.position.copy(spine.worldToLocal(toWorld(new THREE.Vector3(side * 0.11 * (H / 1.99), yTop, zBack - 0.02))));
    r.add(m);
    r.updateMatrixWorld(true);
    m.position.copy(r.worldToLocal(toWorld(new THREE.Vector3(side * 0.16 * (H / 1.99), yMid, zBack - 0.06))));
    bones.push({ side, root: r, mid: m });
    all.push(r, m);
  }
  const spineIdx = sm.skeleton.bones.indexOf(spine);
  const v = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.z > zBack || v.y < yTip - 0.04 * H || v.y > yTop + 0.03 * H) continue;
    const b = bones[v.x < 0 ? 0 : 1];
    const rootIdx = all.indexOf(b.root), midIdx = all.indexOf(b.mid);
    const t = THREE.MathUtils.clamp((yTop - v.y) / (yTop - yTip), 0, 1);
    // Near the shoulder the wing stays partly with the back; down the wing it follows root → mid.
    const wSpine = THREE.MathUtils.clamp(1 - t * 5, 0, 1) * 0.6;
    const wMid = THREE.MathUtils.smoothstep(t, 0.35, 0.8) * (1 - wSpine);
    const wRoot = 1 - wSpine - wMid;
    si.setXYZW(i, rootIdx, midIdx, spineIdx, 0);
    sw.setXYZW(i, wRoot, wMid, wSpine, 0);
    n++;
  }
  si.needsUpdate = sw.needsUpdate = true;
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(all);
  skel.calculateInverses();
  sm.bind(skel, sm.bindMatrix);
  return n > 200 ? bones : null;
}

export function buildAngel() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  const radiant = (c: number, k: number) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    m.colorNode = color(c).mul(k);
    return m;
  };
  // Robe: a lathe that flares to the hem, brighter at the top, shimmering toward the hem.
  const prof = [[0, 0], [0.42, 0.02], [0.36, 0.5], [0.24, 1.05], [0.2, 1.4], [0.16, 1.55], [0.0, 1.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const robeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const ripple = sin(positionLocal.y.mul(9).sub(time.mul(6))).mul(0.15).add(0.85);
  robeMat.colorNode = mix(color(0xffe6b0), color(0xffffff), smoothstep(float(0.2), float(1.5), positionLocal.y)).mul(ripple).mul(2.2);
  const robe = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), robeMat);
  g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), radiant(0xfff4dc, 3));
  head.position.y = 1.78;
  g.add(head);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 40), radiant(0xffd76a, 6));
  halo.rotation.x = Math.PI / 2; halo.position.y = 2.0;
  g.add(halo);
  // Wings: each a fan of long primary feathers and shorter coverts, every feather a soft-edged
  // blade of light (bright quill, barbs fading to the edges and the tip), so the wing reads as
  // feathers made of radiance rather than a cut-out.
  const featherMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const across = uv().x.sub(0.5).abs().mul(2);
  const quill = smoothstep(float(0.12), float(0.0), across);
  const barbs = sin(uv().y.mul(70).add(across.mul(18))).mul(0.25).add(0.75);
  const body = smoothstep(float(1.0), float(0.35), across).mul(smoothstep(float(1.0), float(0.6), uv().y)).mul(smoothstep(float(0.0), float(0.08), uv().y));
  featherMat.colorNode = mix(color(0xffd79a), color(0xffffff), quill).mul(body.mul(barbs).add(quill.mul(0.6))).mul(1.5);
  const featherGeo = new THREE.PlaneGeometry(1, 1);
  featherGeo.translate(0, 0.5, 0);                // base at the origin, growing up the local +Y
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0.1 * side, 1.5, -0.14);
    const fan = (n: number, a0: number, a1: number, len: (k: number) => number, width: number, along: number) => {
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const f = new THREE.Mesh(featherGeo, featherMat);
        f.scale.set(width, len(k), 1);
        // Roots spread along the wing's arm, fanning from up-and-out to down-and-out.
        f.position.set(side * (0.15 + along * k), 0.35 * (1 - k), 0);
        f.rotation.z = -side * (a0 + (a1 - a0) * k);
        w.add(f);
      }
    };
    fan(11, 0.25, 2.0, (k) => 1.0 + 1.1 * Math.sin(Math.PI * (0.25 + 0.6 * k)), 0.36, 0.9);   // primaries
    fan(8, 0.6, 1.9, (k) => 0.55 + 0.35 * Math.sin(Math.PI * k), 0.4, 0.6);                  // coverts
    g.add(w);
    wings.push(w);
  }
  // The sword: a long blade of white lightning.
  const swordMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  swordMat.colorNode = mix(color(0x9fd2ff), color(0xffffff), smoothstep(float(0.35), float(0.5), uv().x).mul(smoothstep(float(0.65), float(0.5), uv().x))).mul(sin(time.mul(60)).mul(0.2).add(1)).mul(5);
  const sword = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 1.7), swordMat);
  sword.position.set(0.42, 1.3, 0.35);
  sword.rotation.x = -0.9;
  g.add(sword);
  // The armored angel replaces the stand-in figure (robe, head, light-sword) once loaded.
  const standIn = [robe, head, sword];
  let wingBones: ReturnType<typeof rigWings> = null;
  const wingK = { spread: 0, swept: 0 };
  let mixer: THREE.AnimationMixer | null = null;
  modelP ??= loadGLB(MODEL);
  modelP.then((file) => {
    const body = cloneSkinned(file.scene);
    wingBones = rigWings(body);
    const idle = file.animations.find((a) => a.name === 'idle');
    if (idle) { mixer = new THREE.AnimationMixer(body); mixer.clipAction(idle).play(); }
    const box = new THREE.Box3().setFromObject(body);
    const k = HEIGHT / Math.max(0.1, box.max.y - box.min.y);
    body.scale.setScalar(k);
    body.position.y = -box.min.y * k;
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      // Lit from within: the painted armor glows warm white-gold (bloom carries it), still shaded.
      const mat = new THREE.MeshStandardNodeMaterial({ map: src.map ?? null, roughness: 0.35, metalness: 0.55 });
      mat.emissive = new THREE.Color(0xfff0d0);
      mat.emissiveMap = src.map ?? null;
      mat.emissiveIntensity = 1.3;
      m.material = mat;
    });
    g.add(body);
    for (const o of standIn) o.visible = false;
    halo.position.y = HEIGHT + 0.12;
    // The model's own wings carry it now; the light-feather wings only stand in if the rig failed.
    for (const w of wings) { w.position.y = HEIGHT * 0.68; w.position.z = -0.22; w.scale.multiplyScalar(1.15); w.visible = !wingBones; }
  }).catch(() => { /* keep the figure of light */ });
  return {
    group: g,
    /** Beat the wings and swing the sword (`strike` 0 → 1 raises then cuts); `wing` picks the wing
     *  pose family (blended over ~0.3 s), with a slow beat while spread. */
    pose(t: number, strike = 0, wing: WingPose = 'spread', dt = 1 / 60) {
      mixer?.update(dt);
      if (wingBones) {
        wingK.spread += ((wing === 'spread' ? 1 : 0) - wingK.spread) * Math.min(1, dt * 7);
        wingK.swept += ((wing === 'swept' ? 1 : 0) - wingK.swept) * Math.min(1, dt * 7);
        const beat = Math.sin(t * 4.5) * 0.18 * wingK.spread;
        const gq = g.getWorldQuaternion(new THREE.Quaternion());
        for (const b of wingBones) {
          // Body-space rotations: spread = roll out and up about the forward axis, opened a little;
          // swept = pitched back and up, tucked slightly out.
          const sd = b.side;
          const qSpread = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, -sd * 0.35, sd * (2.0 + beat), 'ZYX'));
          const qSwept = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.75, 0, sd * 0.45, 'ZYX'));
          const body = new THREE.Quaternion().slerp(qSpread, wingK.spread).slerp(qSwept, wingK.swept);
          const parentQ = b.root.parent!.getWorldQuaternion(new THREE.Quaternion());
          const world = gq.clone().multiply(body).multiply(gq.clone().invert());
          b.root.quaternion.copy(parentQ.clone().invert().multiply(world).multiply(parentQ));
          // The outer wing follows a little further (a soft curl on the spread, flat when swept).
          b.mid.quaternion.setFromEuler(new THREE.Euler(0, 0, sd * 0.25 * wingK.spread));
        }
      }
      const beat = Math.sin(t * 5) * 0.35;
      wings[0].rotation.y = -(0.35 + beat); wings[1].rotation.y = 0.35 + beat;
      sword.rotation.x = -0.9 - 1.6 * Math.sin(Math.PI * Math.min(1, strike)) + 2.2 * Math.max(0, strike - 0.5);
      halo.rotation.z = t * 2;
    },
  };
}
