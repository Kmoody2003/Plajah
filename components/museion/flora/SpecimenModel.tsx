// SpecimenModel — a real 3D model standing in the hall.
//
// The procedural grower gives the wing breadth (every species, growable, free).
// This gives it TRUTH: for hero specimens — the sequoia you walk up to, a
// mangrove's root tangle, a mushroom cluster — nothing beats a scanned or
// hand-modelled asset.
//
// Drop a draco-compressed .glb into public/models/flora/ and point a specimen's
// `model` at it; it appears here. The pattern (self-hosted GLB + useGLTF) is the
// one HumanBodyExperience already runs for the seven anatomy systems.
//
// Failure is never fatal: a missing or broken file logs once and renders
// nothing, so one bad asset can't take the wing down.

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export interface SpecimenModelProps {
  url: string;
  position?: [number, number, number];
  rotation?: number;
  /** Metres tall the specimen should stand — the model is scaled to match. */
  targetHeight?: number;
  wind?: number;
  seed?: number;
  onClick?: () => void;
}

export default function SpecimenModel({
  url, position = [0, 0, 0], rotation = 0, targetHeight, wind = 1, seed = 1, onClick,
}: SpecimenModelProps) {
  const { scene } = useGLTF(url);
  const group = useRef<THREE.Group>(null);

  // Clone so several specimens can share one loaded asset without fighting over
  // its transform, and so disposing one doesn't blank the others.
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // Scanned foliage almost always ships alpha-blended, which sorts badly
        // in a forest. Alpha-test instead: crisp edges, no sorting artefacts.
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && mat.transparent && mat.alphaTest === 0) {
          mat.alphaTest = 0.4;
          mat.transparent = false;
          mat.depthWrite = true;
        }
      }
    });
    return c;
  }, [scene]);

  // Normalise scale: a model authored in centimetres and one in metres should
  // both stand at the height the label claims.
  const scale = useMemo(() => {
    if (!targetHeight) return 1;
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    return h > 0.001 ? targetHeight / h : 1;
  }, [model, targetHeight]);

  // Sit it on the ground rather than trusting the exporter's origin.
  const yOffset = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    return -box.min.y * scale;
  }, [model, scale]);

  useFrame(({ clock }) => {
    if (!group.current || wind <= 0) return;
    const t = clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.5 + seed) * 0.01 * wind;
  });

  useEffect(() => () => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose?.();
    });
  }, [model]);

  return (
    <group
      ref={group}
      position={[position[0], position[1] + yOffset, position[2]]}
      rotation={[0, rotation, 0]}
      scale={scale}
      onClick={onClick}
    >
      <primitive object={model} />
    </group>
  );
}

/** Warm a model before the visitor reaches it. */
export function preloadSpecimen(url: string) {
  try { useGLTF.preload(url); } catch { /* a bad path must never break the hall */ }
}
