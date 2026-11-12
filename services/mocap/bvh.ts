// MotionClip ⇄ BVH, and MotionClip → a three.js skeleton + AnimationClip for previews.
//
// BVH is the hand-off format: Blender, Maya, MotionBuilder and our own game retargeters all read it, and with
// CMU/DAZ joint names a capture drops into the same path as the CMU shelf. Units are centimetres, rotations are
// ZXY Euler degrees (three's BVHLoader composes channels in the order listed, so this round-trips exactly).
import * as THREE from 'three';
import type { MotionClip } from './types';
import { clipFrame } from './solve';

const CM = 100;

/** Standing hip height of the rest skeleton: down the left leg to the sole. The BVH root rests here, so a reader's
 *  rest pose stands on the floor (three's BVHLoader and most DCCs add the root OFFSET to every frame's position;
 *  a zero offset made retargeters read the hips' standing height as a jump). */
export function restHipHeight(clip: MotionClip): number {
  const j = clip.skeleton.joints, by = (n: string) => j.find((x) => x.name === n);
  const shin = by('lShin'), foot = by('lFoot');
  if (!shin || !foot) return 0;
  return -(shin.offset[1] + foot.offset[1] + (foot.end?.[1] ?? 0));
}
const f4 = (n: number) => (Math.abs(n) < 5e-5 ? '0' : n.toFixed(4));

export function clipToBvh(clip: MotionClip, range?: { start: number; end: number }): string {
  const joints = clip.skeleton.joints;
  const children = joints.map((_, i) => joints.map((j, k) => (j.parent === i ? k : -1)).filter((k) => k >= 0));
  const hipH = restHipHeight(clip);
  const lines: string[] = ['HIERARCHY'];
  const write = (i: number, depth: number) => {
    const pad = '\t'.repeat(depth), j = joints[i];
    lines.push(`${pad}${j.parent < 0 ? 'ROOT' : 'JOINT'} ${j.name}`, `${pad}{`);
    const o = j.parent < 0 ? [0, hipH, 0] : j.offset;
    lines.push(`${pad}\tOFFSET ${o.map((v) => f4(v * CM)).join(' ')}`);
    lines.push(j.parent < 0
      ? `${pad}\tCHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`
      : `${pad}\tCHANNELS 3 Zrotation Xrotation Yrotation`);
    for (const c of children[i]) write(c, depth + 1);
    if (!children[i].length) {
      const e = j.end ?? [0, 0.05, 0];
      lines.push(`${pad}\tEnd Site`, `${pad}\t{`, `${pad}\t\tOFFSET ${e.map((v) => f4(v * CM)).join(' ')}`, `${pad}\t}`);
    }
    lines.push(`${pad}}`);
  };
  write(0, 0);
  const a = range?.start ?? 0, b = range?.end ?? clip.frames - 1;
  lines.push('MOTION', `Frames: ${b - a + 1}`, `Frame Time: ${(1 / clip.fps).toFixed(6)}`);
  const order: number[] = [];
  const walk = (i: number) => { order.push(i); children[i].forEach(walk); };
  walk(0);
  const e = new THREE.Euler();
  for (let f = a; f <= b; f++) {
    const { local, root } = clipFrame(clip, f);
    const row: string[] = [];
    for (const i of order) {
      if (joints[i].parent < 0) row.push(f4(root.x * CM), f4((root.y - hipH) * CM), f4(root.z * CM));
      e.setFromQuaternion(local[i], 'ZXY');
      row.push(f4(THREE.MathUtils.radToDeg(e.z)), f4(THREE.MathUtils.radToDeg(e.x)), f4(THREE.MathUtils.radToDeg(e.y)));
    }
    lines.push(row.join(' '));
  }
  return lines.join('\n') + '\n';
}

/** A three.js bone tree in the clip's rest pose (metres) plus its animation, for previews and glTF export. */
export function clipToThree(clip: MotionClip, range?: { start: number; end: number }): { root: THREE.Bone; bones: THREE.Bone[]; animation: THREE.AnimationClip } {
  const joints = clip.skeleton.joints;
  const bones = joints.map((j) => { const b = new THREE.Bone(); b.name = j.name; b.position.set(...j.offset); return b; });
  joints.forEach((j, i) => { if (j.parent >= 0) bones[j.parent].add(bones[i]); });
  bones[0].position.set(0, restHipHeight(clip), 0);
  const a = range?.start ?? 0, b = range?.end ?? clip.frames - 1;
  const times: number[] = [];
  const q: number[][] = joints.map(() => []);
  const p: number[] = [];
  for (let f = a; f <= b; f++) {
    times.push((f - a) / clip.fps);
    const { local, root } = clipFrame(clip, f);
    local.forEach((r, i) => q[i].push(r.x, r.y, r.z, r.w));
    p.push(root.x, root.y, root.z);
  }
  const tracks: THREE.KeyframeTrack[] = joints.map((j, i) => new THREE.QuaternionKeyframeTrack(`${j.name}.quaternion`, times, q[i]));
  tracks.push(new THREE.VectorKeyframeTrack(`${joints[0].name}.position`, times, p));
  return { root: bones[0], bones, animation: new THREE.AnimationClip(clip.name, (b - a) / clip.fps, tracks) };
}
