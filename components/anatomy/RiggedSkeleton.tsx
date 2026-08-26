'use client';
import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

/**
 * RiggedSkeleton — loads the Z-Biomechanics rigged skeleton (CC-BY-SA 4.0) and drives real joint
 * rotation for range-of-motion demos. Bone-parts are parented to named armature nodes, so rotating
 * a node bends that joint. We rotate each joint relative to its REST orientation (restQuat · delta)
 * around a configured local axis, clamped to a physiological range.
 */

export const RIG_URL = '/models/anatomy/skeleton-rigged.glb';

export interface Joint { id: string; label: string; node: string; axis: 'x' | 'y' | 'z'; dir: 1 | -1; min: number; max: number; group: string }

// Range-of-motion presets (degrees). Axis/dir are best-guess for the rig's local bone frames and
// can be tuned after a visual check — the mechanism (restQuat · axis-angle) is correct regardless.
export const JOINTS: Joint[] = [
  { id: 'elbowR', label: 'Right elbow', node: 'RightForeArm', axis: 'z', dir: 1, min: 0, max: 145, group: 'Arms' },
  { id: 'elbowL', label: 'Left elbow', node: 'LeftForeArm', axis: 'z', dir: -1, min: 0, max: 145, group: 'Arms' },
  { id: 'shoulderR', label: 'Right shoulder', node: 'RightArm', axis: 'x', dir: 1, min: -30, max: 170, group: 'Arms' },
  { id: 'shoulderL', label: 'Left shoulder', node: 'LeftArm', axis: 'x', dir: 1, min: -30, max: 170, group: 'Arms' },
  { id: 'hipR', label: 'Right hip', node: 'Femurr', axis: 'x', dir: 1, min: -20, max: 120, group: 'Legs' },
  { id: 'hipL', label: 'Left hip', node: 'Femurl', axis: 'x', dir: 1, min: -20, max: 120, group: 'Legs' },
  { id: 'kneeR', label: 'Right knee', node: 'Tibiar', axis: 'z', dir: 1, min: 0, max: 135, group: 'Legs' },
  { id: 'kneeL', label: 'Left knee', node: 'Tibial', axis: 'z', dir: 1, min: 0, max: 135, group: 'Legs' },
  { id: 'neck', label: 'Neck turn', node: 'Neck', axis: 'y', dir: 1, min: -70, max: 70, group: 'Spine' },
];

const AXIS: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
};

const RiggedSkeleton: React.FC<{ joints: Record<string, number> }> = ({ joints }) => {
  const { scene } = useGLTF(RIG_URL);
  const groupRef = useRef<THREE.Group>(null);
  const fittedRef = useRef(false);

  // Clone + tune materials once; index joint nodes and remember their rest orientation.
  const { node, jointRefs, restQuats } = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.material = new THREE.MeshStandardMaterial({ color: '#ece4d2', roughness: 0.72, metalness: 0, emissive: new THREE.Color('#2a2620'), emissiveIntensity: 0.5 });
        o.castShadow = false; o.receiveShadow = false;
      }
    });
    const jr: Record<string, THREE.Object3D> = {};
    const rq: Record<string, THREE.Quaternion> = {};
    for (const j of JOINTS) {
      const found = c.getObjectByName(j.node);
      if (found) { jr[j.id] = found; rq[j.id] = found.quaternion.clone(); }
    }
    return { node: c, jointRefs: jr, restQuats: rq };
  }, [scene]);

  useEffect(() => { fittedRef.current = false; }, [node]);

  const q = useRef(new THREE.Quaternion());
  useFrame(() => {
    // Apply joint rotations: rest · axis-angle.
    for (const j of JOINTS) {
      const o = jointRefs[j.id]; const rest = restQuats[j.id];
      if (!o || !rest) continue;
      const deg = joints[j.id] ?? 0;
      q.current.setFromAxisAngle(AXIS[j.axis], THREE.MathUtils.degToRad(deg * j.dir));
      o.quaternion.copy(rest).multiply(q.current);
    }
    // One-time fit to frame.
    const g = groupRef.current;
    if (g && !fittedRef.current) {
      g.scale.setScalar(1); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (isFinite(maxDim) && maxDim > 1e-4) {
        const s = 2.6 / maxDim; const center = new THREE.Vector3(); box.getCenter(center);
        g.scale.setScalar(s); g.position.set(-center.x * s, -center.y * s + 0.1, -center.z * s);
        fittedRef.current = true;
      }
    }
  });

  return <group ref={groupRef}><primitive object={node} /></group>;
};
useGLTF.preload(RIG_URL);

export default RiggedSkeleton;
