// Atmosphere — the limb glow that separates a photographed planet from a
// textured ball.
//
// Look at any real image of Earth from orbit: the surface texture is not what
// tells you it is a world. It is the thin bright arc at the edge, brightest
// exactly where you are looking through the most air, fading to nothing at the
// centre of the disc. That is Rayleigh scattering, and its silhouette is what
// the eye reads as "atmosphere" — without it a planet reads as a marble.
//
// The cheap and correct way to draw it is a FRESNEL term on a shell slightly
// larger than the planet, rendered from the inside (BackSide) and added rather
// than blended, so it brightens the limb without darkening the disc:
//
//     intensity = pow(1 − |view · normal|, falloff)
//
// view · normal is ~1 facing the camera (disc centre, no glow) and ~0 at the
// silhouette (maximum path length through air, full glow) — which is exactly
// the physical behaviour, arrived at for free from the geometry.
//
// A second term multiplies in the SUN direction, so the glow is strongest on the
// lit limb and dies across the terminator. Without it the night side glows too,
// which instantly reads as fake.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface AtmosphereProps {
  /** Planet radius. The shell sits just outside it. */
  radius: number;
  color?: string;
  /** How far out the shell stands, as a fraction of radius. */
  thickness?: number;
  /** Higher = tighter, thinner rim. Earth ~3, gas giants ~2. */
  falloff?: number;
  intensity?: number;
  /** World-space sun position, so only the lit limb glows. */
  sunPosition?: [number, number, number];
}

const VERT = `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = `
uniform vec3 uColor;
uniform vec3 uSun;
uniform float uFalloff;
uniform float uIntensity;
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
  // Drawn on the INSIDE of the shell, so the interpolated normal points away
  // from the camera and has to be flipped before the Fresnel term means anything.
  vec3 n = normalize(-vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);

  // Fresnel: 0 at the centre of the disc, 1 at the silhouette — the same shape
  // as the amount of atmosphere the line of sight actually passes through.
  float rim = pow(1.0 - clamp(dot(v, n), 0.0, 1.0), uFalloff);

  // Only the lit limb glows. Allowing a little wrap past the terminator keeps
  // the twilight band that a hard cut would remove.
  vec3 s = normalize(uSun - vPosW);
  float lit = clamp(dot(n, s) * 0.65 + 0.35, 0.0, 1.0);

  gl_FragColor = vec4(uColor * rim * lit * uIntensity, rim * lit);
}
`;

export default function Atmosphere({
  radius, color = '#5aa9ff', thickness = 0.045, falloff = 3.0,
  intensity = 1.1, sunPosition = [0, 0, 0],
}: AtmosphereProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uSun: { value: new THREE.Vector3(...sunPosition) },
    uFalloff: { value: falloff },
    uIntensity: { value: intensity },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The planet orbits, so its position relative to the Sun changes every frame.
  // Driving the uniform here keeps the terminator correct without re-rendering.
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uSun.value.set(sunPosition[0], sunPosition[1], sunPosition[2]);
    m.uniforms.uColor.value.set(color);
    m.uniforms.uFalloff.value = falloff;
    m.uniforms.uIntensity.value = intensity;
  });

  return (
    <mesh scale={1 + thickness}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        // Additive, because air scatters light TOWARD you — it never subtracts.
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Per-body atmospheres. Colour is the real scattering colour, not a stylistic
 * pick: Earth's blue and Mars's thin butterscotch haze come from what each
 * atmosphere is actually made of, and the airless worlds are absent on purpose.
 */
export const ATMOSPHERES: Record<
  string, { color: string; thickness: number; falloff: number; intensity: number }
> = {
  Venus:   { color: '#ffd9a0', thickness: 0.075, falloff: 2.4, intensity: 1.5 },
  Earth:   { color: '#5aa9ff', thickness: 0.045, falloff: 3.2, intensity: 1.5 },
  Mars:    { color: '#e0a070', thickness: 0.028, falloff: 3.6, intensity: 0.75 },
  Jupiter: { color: '#e8c9a0', thickness: 0.035, falloff: 2.8, intensity: 0.85 },
  Saturn:  { color: '#f0dcb0', thickness: 0.035, falloff: 2.8, intensity: 0.7 },
  Uranus:  { color: '#9fe6ee', thickness: 0.05, falloff: 2.6, intensity: 0.95 },
  Neptune: { color: '#6f9bff', thickness: 0.05, falloff: 2.6, intensity: 1.05 },
  // Mercury and the Moon have no atmosphere, so they get no rim. Adding one
  // "because it looks nice" is the kind of detail that quietly teaches something
  // false in a classroom module.
};
