// LightShafts — the god rays that make a forest photograph look like a forest.
//
// Every reference photo of woodland at low sun has them: shafts of light picked
// out by dust and moisture where the canopy breaks. They are the single cheapest
// thing that reads as "atmosphere", and real volumetrics are far too expensive
// for a Fire TV — so these are additive cones aimed along the sun, softened at
// both ends and gently drifting.
//
// Additive blending with depthWrite off means they never occlude a trunk; they
// only add light where they cross the frame, which is exactly how a real shaft
// behaves in a camera.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface LightShaftsProps {
  /** Where the sun is — shafts point away from it, toward the ground. */
  sunPosition: [number, number, number];
  count?: number;
  color?: string;
  /** Overall strength; 0 disables. */
  intensity?: number;
  /** Radius of the area the shafts land in. */
  spread?: number;
}

export default function LightShafts({
  sunPosition, count = 7, color = '#fff3d0', intensity = 1, spread = 22,
}: LightShaftsProps) {
  const group = useRef<THREE.Group>(null);

  // A cone, faded to nothing at the tip and the rim, so it has no hard edges.
  const geom = useMemo(() => new THREE.CylinderGeometry(0.15, 3.4, 34, 14, 1, true), []);

  const gradient = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 128;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');      // source: hidden in the canopy
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');      // dissolves before the ground
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
    const t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }, []);

  // Aim the whole set along the sun direction, then scatter the individual
  // shafts across the clearing.
  const shafts = useMemo(() => {
    const sun = new THREE.Vector3(...sunPosition).normalize();
    const out: { pos: [number, number, number]; quat: THREE.Quaternion; scale: number; phase: number }[] = [];
    // rotation that points +Y (the cylinder's axis) along the sun
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun);
    let seed = 8123;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.6;
      const r = 4 + rand() * spread;
      const tilt = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rand() - 0.5) * 0.22, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.22),
      );
      out.push({
        pos: [Math.cos(a) * r, 14 + rand() * 7, Math.sin(a) * r],
        quat: q.clone().multiply(tilt),
        scale: 0.55 + rand() * 0.85,
        phase: rand() * Math.PI * 2,
      });
    }
    return out;
  }, [sunPosition, count, spread]);

  // Breathe them slowly — dust moves, and a static shaft reads as a decal.
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const m = child as THREE.Mesh;
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = (0.1 + 0.055 * Math.sin(t * 0.22 + shafts[i]?.phase ?? 0)) * intensity;
    });
  });

  if (intensity <= 0) return null;

  return (
    <group ref={group}>
      {shafts.map((s, i) => (
        <mesh
          key={i}
          geometry={geom}
          position={s.pos}
          quaternion={s.quat}
          scale={[s.scale, 1, s.scale]}
          renderOrder={2}
        >
          <meshBasicMaterial
            map={gradient ?? undefined}
            color={color}
            transparent
            opacity={0.12 * intensity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
}
