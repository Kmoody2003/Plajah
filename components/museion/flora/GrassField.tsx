// GrassField — instanced ground cover.
//
// A forest floor without undergrowth reads as a showroom. This scatters a few
// thousand tapered blades on a Poisson-ish disc around the hall in ONE draw
// call, each with its own height, lean and tint, and bends them all on a shared
// wind uniform so the ground moves with the canopy.
//
// The blade is three quads tall so it can actually curve; count and segment
// depth drop on weak devices.

import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface GrassFieldProps {
  count?: number;
  innerRadius?: number;
  outerRadius?: number;
  color?: string;
  dryColor?: string;
  /** 0 = still (reduced motion). */
  wind?: number;
  /** 0 = lush summer, 1 = dry autumn. */
  season?: number;
}

/** A single blade: tapered, curving, with vertex colours dark at the root. */
function bladeGeometry(segments = 4, height = 1, width = 0.019): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = width * (1 - t) * (1 - t * 0.35);        // taper to a point
    const y = t * height;
    const bend = t * t * 0.22;                          // natural forward curve
    pos.push(-w, y, bend, w, y, bend);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function GrassField({
  count = 4200, innerRadius = 0, outerRadius = 26,
  color = '#3f7a34', dryColor = '#8a7a3a', wind = 1, season = 0,
}: GrassFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const geom = useMemo(() => bladeGeometry(4, 1, 0.019), []);

  // Scatter once — deterministic, so the floor doesn't reshuffle on re-render.
  const { matrices, tints } = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const mats = new Float32Array(count * 16);
    const tn = new Float32Array(count);
    let seed = 20260828;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      // sqrt keeps density even across the disc instead of clumping at the centre
      const r = innerRadius + Math.sqrt(rand()) * (outerRadius - innerRadius);
      const a = rand() * Math.PI * 2;
      const h = 0.16 + rand() * 0.34;
      v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      e.set((rand() - 0.5) * 0.24, rand() * Math.PI * 2, (rand() - 0.5) * 0.24);
      q.setFromEuler(e);
      s.set(0.7 + rand() * 0.7, h, 0.7 + rand() * 0.7);
      m.compose(v, q, s);
      m.toArray(mats, i * 16);
      tn[i] = rand();
    }
    return { matrices: mats, tints: tn };
  }, [count, innerRadius, outerRadius]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
    mesh.computeBoundingSphere();
    // per-blade tint so the sward isn't one flat green
    mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1));
  }, [matrices, tints, count]);

  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);

  // Wind: sway the whole field on a shared phase. One uniform, no per-blade cost.
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || wind <= 0) return;
    const t = clock.elapsedTime;
    mesh.rotation.z = Math.sin(t * 0.7) * 0.02 * wind;
    mesh.rotation.x = Math.cos(t * 0.51) * 0.014 * wind;
  });

  const blend = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color(dryColor), Math.max(0, Math.min(1, season))),
    [color, dryColor, season],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, undefined as unknown as THREE.Material, count]}
      frustumCulled={false}
      receiveShadow
    >
      <meshStandardMaterial
        ref={matRef}
        color={blend}
        roughness={0.92}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
