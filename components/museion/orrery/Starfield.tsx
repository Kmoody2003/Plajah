// Starfield — the real sky, not scattered dots.
//
// The module drew 30,000 procedural point sprites on black. Two problems with
// that: the stars are in the wrong places, and — more visibly — there is no
// MILKY WAY. The band of our own galaxy is the dominant feature of a dark sky,
// and its absence is why a black background reads as "space scene" rather than
// as being somewhere.
//
// public/textures/solar/2k_stars_milky_way.jpg was fetched during the texture
// rescue and then never wired up. It is an equirectangular panorama of the real
// sky, so it goes on the inside of a very large sphere and gives every star its
// correct position for free.
//
// Procedural points stay ON TOP, at low count, for one reason the panorama can't
// supply: a texture cannot twinkle, and a completely static sky reads as a
// painted backdrop the moment the camera moves.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export interface StarfieldProps {
  radius?: number;
  /** Panorama brightness. The real sky is dimmer than people expect. */
  intensity?: number;
  /** Nearby twinkling stars drawn over the panorama. */
  sparkleCount?: number;
}

const MILKY_WAY = '/textures/solar/2k_stars_milky_way.jpg';

function Sparkles({ count, radius }: { count: number; radius: number }) {
  const ref = useRef<THREE.Points>(null);

  const { geometry, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const ph = new Float32Array(count);
    let seed = 90210;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) {
      // Evenly over a sphere: acos of a uniform, NOT a uniform angle, which
      // would crowd the poles.
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const d = radius * (0.92 + rand() * 0.06);
      pos[i * 3] = Math.cos(theta) * r * d;
      pos[i * 3 + 1] = u * d;
      pos[i * 3 + 2] = Math.sin(theta) * r * d;
      // Most stars are faint; a handful are bright. A uniform size distribution
      // is the giveaway of a procedural sky.
      size[i] = Math.pow(rand(), 3) * 2.6 + 0.35;
      ph[i] = rand() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    return { geometry: g, phases: ph };
  }, [count, radius]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Twinkle: each star on its own phase, derived from its position so it
        // needs no extra attribute.
        float ph = position.x * 0.7 + position.y * 1.3 + position.z * 0.4;
        vAlpha = 0.55 + 0.45 * sin(uTime * 1.6 + ph);
        gl_PointSize = aSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        // Round off the point sprite and give it a soft falloff, so stars are
        // discs of light rather than the squares a bare gl_PointCoord gives.
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * glow, glow * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime; });

  useMemo(() => phases, [phases]);   // keep the seed stable across re-renders

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />;
}

function Panorama({ radius, intensity }: { radius: number; intensity: number }) {
  const tex = useTexture(MILKY_WAY);

  useMemo(() => {
    if (!tex) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }, [tex]);

  return (
    <mesh renderOrder={-100}>
      <sphereGeometry args={[radius, 48, 32]} />
      {/* Basic material and depthWrite off: the sky is infinitely far away, is
          not lit by anything in the scene, and must never occlude a planet. */}
      <meshBasicMaterial
        map={tex}
        side={THREE.BackSide}
        depthWrite={false}
        color={new THREE.Color(intensity, intensity, intensity)}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function Starfield({
  radius = 600, intensity = 0.55, sparkleCount = 1400,
}: StarfieldProps) {
  return (
    <group>
      <Panorama radius={radius} intensity={intensity} />
      <Sparkles count={sparkleCount} radius={radius * 0.82} />
    </group>
  );
}
