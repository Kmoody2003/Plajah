/**
 * dqSkinning.ts — a dual-quaternion skinning node for three's WebGPU renderer (docs/character-forge.md §2, §6).
 *
 * Linear blend skinning averages matrices, so a wrist rolled 90° collapses toward the bone (the candy wrapper) and a
 * bent elbow loses volume. Dual quaternions blend rigid transforms instead: the skin keeps its volume, and corrective
 * shapes only have to add the muscle, not undo the collapse.
 *
 * It is three's own SkinningNode with the blend replaced: the same per-object skeleton update and bone-matrix buffer,
 * each of a vertex's four bone matrices turned into a dual quaternion in the vertex stage, blended with the
 * antipodality fix, normalised, applied. The blend is computed once per vertex into shader variables and shared by
 * position, normal and tangent (TSL inlines expressions, so anything used twice is made a variable first).
 * Morph targets still apply first, in bind space. Uniform model scale is carried through; non-uniform isn't.
 */
import * as THREE from 'three/webgpu';
import { float, vec3, vec4, select, dot, cross, max, sqrt, length, morphReference, subBuild, positionLocal, normalLocal, tangentLocal, positionPrevious, nodeObject } from 'three/tsl';

type N = ReturnType<typeof vec4>;

/** A bone matrix (rotation · uniform scale + translation) as a unit dual quaternion and its scale. */
function dualQuat(m: N) {
  const mv = m.toVar();
  const c0 = mv.mul(vec4(1, 0, 0, 0)).xyz.toVar(), c1 = mv.mul(vec4(0, 1, 0, 0)).xyz.toVar(), c2 = mv.mul(vec4(0, 0, 1, 0)).xyz.toVar();
  const t = mv.mul(vec4(0, 0, 0, 1)).xyz.toVar();
  const s = length(c0).toVar();
  const inv = float(1).div(s);
  const a = c0.mul(inv).toVar(), b = c1.mul(inv).toVar(), c = c2.mul(inv).toVar();
  // rotation matrix → quaternion (branch-free; signs from the off-diagonals)
  const sgn = (v: N) => select(v.greaterThanEqual(0), float(1), float(-1));
  const w = sqrt(max(float(0), float(1).add(a.x).add(b.y).add(c.z))).mul(0.5);
  const x = sqrt(max(float(0), float(1).add(a.x).sub(b.y).sub(c.z))).mul(0.5).mul(sgn(b.z.sub(c.y)));
  const y = sqrt(max(float(0), float(1).sub(a.x).add(b.y).sub(c.z))).mul(0.5).mul(sgn(c.x.sub(a.z)));
  const z = sqrt(max(float(0), float(1).sub(a.x).sub(b.y).add(c.z))).mul(0.5).mul(sgn(a.y.sub(b.x)));
  const r = vec4(x, y, z, w).toVar();
  // dual part ½ · (t, 0) · r
  const d = vec4(t.mul(r.w).add(cross(t, r.xyz)), dot(t, r.xyz).negate()).mul(0.5).toVar();
  return { r, d, s };
}

export class DQSkinningNode extends THREE.SkinningNode {
  static get type() { return 'DQSkinningNode'; }

  /** Blended, normalised dual quaternion for this vertex, and the model's uniform scale. */
  private blend(boneMatrices = this.boneMatricesNode) {
    const idx = this.skinIndexNode, w = this.skinWeightNode;
    const q0 = dualQuat(boneMatrices.element(idx.x) as N), q1 = dualQuat(boneMatrices.element(idx.y) as N);
    const q2 = dualQuat(boneMatrices.element(idx.z) as N), q3 = dualQuat(boneMatrices.element(idx.w) as N);
    // antipodality: take each rotation on the same side as the first so the blend goes the short way round
    const s1 = select(dot(q0.r, q1.r).lessThan(0), float(-1), float(1)).mul(w.y);
    const s2 = select(dot(q0.r, q2.r).lessThan(0), float(-1), float(1)).mul(w.z);
    const s3 = select(dot(q0.r, q3.r).lessThan(0), float(-1), float(1)).mul(w.w);
    const br = q0.r.mul(w.x).add(q1.r.mul(s1)).add(q2.r.mul(s2)).add(q3.r.mul(s3)).toVar();
    const bd = q0.d.mul(w.x).add(q1.d.mul(s1)).add(q2.d.mul(s2)).add(q3.d.mul(s3)).toVar();
    const inv = float(1).div(length(br)).toVar();
    return { r: br.mul(inv).toVar(), d: bd.mul(inv).toVar(), s: q0.s };
  }

  private apply(q: { r: N; d: N; s: N }, position: N) {
    const p = this.bindMatrixNode.mul(vec4(position, 1)).xyz.mul(q.s).toVar();
    const rv = q.r.xyz, rw = q.r.w;
    const rotated = p.add(cross(rv, cross(rv, p).add(p.mul(rw))).mul(2));
    const trans = rv.mul(q.d.w.negate()).add(q.d.xyz.mul(rw)).add(cross(rv, q.d.xyz)).mul(2);
    return this.bindMatrixInverseNode.mul(vec4(rotated.add(trans), 1)).xyz;
  }

  private turn(q: { r: N }, v: N) {
    const rv = q.r.xyz, rw = q.r.w;
    const n = this.bindMatrixNode.mul(vec4(v, 0)).xyz.toVar();
    const n2 = n.add(cross(rv, cross(rv, n).add(n.mul(rw))).mul(2));
    return this.bindMatrixInverseNode.mul(vec4(n2, 0)).xyz;
  }

  getSkinnedPosition(boneMatrices = this.boneMatricesNode, position = this.positionNode) {
    return this.apply(this.blend(boneMatrices), position as N);
  }

  setup(builder: THREE.NodeBuilder) {
    if (builder.needsPreviousData()) positionPrevious.assign(this.getPreviousSkinnedPosition(builder));
    const q = this.blend();
    const skinPosition = this.apply(q, this.positionNode as N).toVar();
    if (this.toPositionNode) this.toPositionNode.assign(skinPosition);
    if (builder.hasGeometryAttribute('normal')) {
      normalLocal.assign(this.turn(q, normalLocal as unknown as N));
      if (builder.hasGeometryAttribute('tangent')) tangentLocal.assign(this.turn(q, tangentLocal as unknown as N));
    }
    return skinPosition;
  }
}

/** Switch a skinned mesh's materials to dual-quaternion skinning. Safe on materials shared with other meshes. */
export function enableDualQuaternionSkinning(mesh: THREE.SkinnedMesh) {
  mesh.userData.dqSkinning = true;
  const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.NodeMaterial[];
  for (const mat of mats) {
    if (!(mat as THREE.NodeMaterial).isNodeMaterial || (mat as unknown as { _dq?: boolean })._dq) continue;
    (mat as unknown as { _dq?: boolean })._dq = true;
    const original = mat.setupPosition.bind(mat);
    (mat as unknown as { setupPosition: (b: { object: THREE.Object3D; geometry: THREE.BufferGeometry }) => unknown }).setupPosition = function (this: THREE.NodeMaterial, builder) {
      const { object, geometry } = builder;
      if (!(object as THREE.SkinnedMesh).isSkinnedMesh || !object.userData.dqSkinning) return original(builder as never);
      if (geometry.morphAttributes.position || geometry.morphAttributes.normal) morphReference(object as THREE.Mesh).toStack();
      nodeObject(new DQSkinningNode(object as THREE.SkinnedMesh)).toStack();
      if (this.positionNode !== null) positionLocal.assign(subBuild(this.positionNode, 'POSITION', 'vec3'));
      return positionLocal;
    };
    mat.needsUpdate = true;
  }
}

void vec3;
