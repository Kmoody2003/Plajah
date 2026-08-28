// TreeMesh — renders one procedurally grown tree.
//
// Two draw calls per tree: a merged branch mesh and an instanced leaf cloud.
// Geometry is rebuilt only when the skeleton or growth actually changes, so the
// scrubber can run at 60fps while a hall of trees stands still around it.

import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { growTree, skeletonAtGrowth, type TreeParams, type TreeSkeleton } from './TreeGrower';
import { buildTreeGeometry, buildLeafMatrices } from './treeGeometry';
import { barkTexture, barkNormal, leafCardTexture } from './textures';

/** Autumn ramp: leaves lerp from their summer colour toward the species' autumn. */
function seasonColor(leafHex: string, autumnHex: string | undefined, season: number): THREE.Color {
  const summer = new THREE.Color(leafHex);
  if (!autumnHex) return summer;
  return summer.lerp(new THREE.Color(autumnHex), Math.max(0, Math.min(1, season)));
}

export interface TreeMeshProps {
  params: TreeParams;
  seed?: number;
  /** 0 = seed, 1 = mature. */
  growth?: number;
  /** 0 = high summer, 1 = full autumn. */
  season?: number;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
  /** Sides per branch — drops on weak GPUs. */
  radialSegments?: number;
  /** Sway amplitude; 0 disables the wind entirely (reduced-motion). */
  wind?: number;
  onClick?: () => void;
}

export default function TreeMesh({
  params, seed = 1, growth = 1, season = 0,
  position = [0, 0, 0], rotation = 0, scale = 1,
  radialSegments = 5, wind = 1, onClick,
}: TreeMeshProps) {
  // The full-grown skeleton is the expensive part — grow it once per species+seed.
  const full: TreeSkeleton = useMemo(() => growTree(params, seed), [params, seed]);

  // Quantise growth so a dragging scrubber rebuilds ~40 times, not every frame.
  const gq = Math.round(Math.max(0, Math.min(1, growth)) * 40) / 40;
  const sk = useMemo(() => (gq >= 1 ? full : skeletonAtGrowth(full, gq)), [full, gq]);

  const geom = useMemo(() => {
    const b = buildTreeGeometry(sk, radialSegments);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [sk, radialSegments]);

  const leafData = useMemo(() => buildLeafMatrices(sk.leaves), [sk]);
  const leafGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Push the instance matrices straight into the buffer — no per-leaf objects.
  useLayoutEffect(() => {
    const m = leafRef.current;
    if (!m || leafData.count === 0) return;
    m.instanceMatrix.array.set(leafData.matrices.subarray(0, leafData.count * 16));
    m.instanceMatrix.needsUpdate = true;
    m.count = leafData.count;
    m.computeBoundingSphere();
  }, [leafData]);

  // Free GPU memory when the specimen changes or the hall unmounts.
  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);
  useLayoutEffect(() => () => { leafGeom.dispose(); }, [leafGeom]);

  // Species surfaces, baked once and cached across every tree of that species.
  const barkMap = useMemo(() => {
    const t = barkTexture(params.species, params.barkColor);
    if (t) { t.repeat.set(1.4, Math.max(2, params.trunkHeight * 0.9)); t.needsUpdate = true; }
    return t;
  }, [params.species, params.barkColor, params.trunkHeight]);
  const barkNrm = useMemo(() => {
    const t = barkNormal(params.species);
    if (t) { t.repeat.set(1.4, Math.max(2, params.trunkHeight * 0.9)); t.needsUpdate = true; }
    return t;
  }, [params.species, params.trunkHeight]);
  const normalScale = useMemo(() => new THREE.Vector2(1.1, 1.1), []);
  // Leaf CARDS: one quad carries a whole cluster, which is the only way to reach
  // canopy density in real time. Three variants so the crown isn't one repeated decal.
  const leafMap = useMemo(
    () => leafCardTexture(params.leafShape as never, params.leafColor, 512, 18, seed),
    [params.leafShape, params.leafColor, seed],
  );

  const barkColor = useMemo(() => new THREE.Color(params.barkColor), [params.barkColor]);
  const leafColor = useMemo(
    () => seasonColor(params.leafColor, params.autumnColor, season),
    [params.leafColor, params.autumnColor, season],
  );

  // A whole-tree sway: cheap, and enough to make a still frame feel alive.
  useFrame(({ clock }) => {
    if (!groupRef.current || wind <= 0) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.55 + seed) * 0.012 * wind;
    groupRef.current.rotation.x = Math.cos(t * 0.4 + seed * 1.7) * 0.008 * wind;
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]} scale={scale} onClick={onClick}>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial
          color={barkColor}
          map={barkMap ?? undefined}
          normalMap={barkNrm ?? undefined}
          normalScale={normalScale}
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      {leafData.count > 0 && (
        <instancedMesh
          ref={leafRef}
          args={[leafGeom, undefined as unknown as THREE.Material, leafData.count]}
          frustumCulled={false}
        >
          {/* NO alphaMap: three.js reads its GREEN channel, so dark-leaved species
              (oak 0x7d, pine 0x5d) fell under the cutoff and vanished while birch
              (0xb6) survived — the bare-tree bug. The canvas texture carries a real
              alpha channel, so map + alphaTest is both correct and cheaper. */}
          <meshStandardMaterial
            color={leafColor}
            map={leafMap ?? undefined}
            transparent
            alphaTest={0.28}
            roughness={0.65}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      )}
    </group>
  );
}
