// GrassField — a living ground, not a lawn of triangles.
//
// The first pass rotated the WHOLE instanced mesh to fake wind. That is the
// giveaway: real grass never sways in unison, it ripples. Wind arrives as
// travelling gusts, every blade answers with its own stiffness and phase, and a
// blade bends like a cantilever — barely at the root, most at the tip.
//
// So the motion moved into a VERTEX SHADER, injected into MeshStandardMaterial
// via onBeforeCompile so the grass still takes the scene's HDRI lighting, fog
// and shadows. Cost is two uniforms a frame for tens of thousands of blades.
//
// Three things sell it beyond the motion:
//   · CANTILEVER BEND — displacement scales with height SQUARED, the shape a
//     blade actually takes under load. Linear bending reads as rubber.
//   · TRANSLUCENCY — grass is thin enough to glow when backlit. Adding light
//     when the view direction agrees with the sun is what makes a field look
//     sunlit rather than merely green.
//   · ROOT DARKENING — light doesn't reach the base of a sward. Without it the
//     field looks like it is hovering above the ground.

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
  /** Where the sun is — drives the backlit translucency. */
  sunPosition?: [number, number, number];
}

/**
 * One blade: a tapered strip that curves forward. Segments bunch toward the tip,
 * where all the bending happens, so the curve stays smooth on fewer vertices
 * than an even split would need.
 */
function bladeGeometry(segments = 5, height = 1, width = 0.022): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = Math.pow(i / segments, 0.85);            // denser near the tip
    const w = width * (1 - t) * (1 - t * 0.4) + 0.0015;
    const y = t * height;
    const bend = t * t * 0.3;                          // resting forward curve
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
  count = 24000, innerRadius = 0, outerRadius = 26,
  color = '#4f9a34', dryColor = '#a8933f', wind = 1, season = 0,
  sunPosition = [30, 26, 16],
}: GrassFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => bladeGeometry(5, 1, 0.022), []);

  // Uniforms the injected shader reads. Held in one stable object so useFrame can
  // drive them without React ever re-rendering.
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWind: { value: wind },
    uSun: { value: new THREE.Vector3(30, 26, 16).normalize() },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { uniforms.uWind.value = wind; }, [wind, uniforms]);
  useLayoutEffect(() => {
    uniforms.uSun.value.set(sunPosition[0], sunPosition[1], sunPosition[2]).normalize();
  }, [sunPosition, uniforms]);

  // Scatter once — deterministic, so the floor doesn't reshuffle on re-render.
  const { matrices, blades } = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const mats = new Float32Array(count * 16);
    const bl = new Float32Array(count * 2);            // [tint, stiffness]
    let seed = 20260828;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) {
      // sqrt spreads density evenly across the disc instead of clumping at centre
      const r = innerRadius + Math.sqrt(rand()) * (outerRadius - innerRadius);
      const a = rand() * Math.PI * 2;
      // Most blades short, a few tall. A uniform height is what reads as turf.
      const h = 0.15 + Math.pow(rand(), 1.7) * 0.55;
      v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      e.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
      q.setFromEuler(e);
      sc.set(0.7 + rand() * 0.8, h, 0.7 + rand() * 0.8);
      m.compose(v, q, sc);
      m.toArray(mats, i * 16);
      bl[i * 2] = rand();                              // colour variance
      bl[i * 2 + 1] = 0.6 + rand() * 0.8;              // per-blade stiffness
    }
    return { matrices: mats, blades: bl };
  }, [count, innerRadius, outerRadius]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
    mesh.geometry.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blades, 2));
    mesh.computeBoundingSphere();
  }, [matrices, blades, count]);

  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);

  useFrame(({ clock }) => { uniforms.uTime.value = clock.elapsedTime; });

  const blend = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color(dryColor), Math.max(0, Math.min(1, season))),
    [color, dryColor, season],
  );

  // Wind, translucency and root shading grafted onto the standard material, so
  // the grass keeps HDRI lighting, fog and shadow receipt for free.
  const onBeforeCompile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uSun = uniforms.uSun;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uTime;',
        'uniform float uWind;',
        'attribute vec2 aBlade;',
        'varying float vBladeH;',
        'varying float vTint;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '// Height along the blade: 0 at the root, 1 at the tip.',
        '// Height comes from position.y, NOT uv.y. three.js only declares the',
        '// uv attribute when the material carries a map, so reading uv here',
        '// fails to compile on any un-mapped material and takes the whole',
        '// frame down with it. position is always declared.',
        'float bladeH = clamp(position.y, 0.0, 1.0);',
        'vBladeH = bladeH;',
        'vTint = aBlade.x;',
        '// Where this blade STANDS, so gusts travel across the field instead of',
        '// every blade moving in lockstep.',
        'vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
        'float stiff = aBlade.y;',
        'float phase = aBlade.x * 6.2831;',
        '// Two scales of wind: a slow gust front crossing the clearing, and a',
        '// faster ripple riding on top of it.',
        'float gust = sin(wp.x * 0.09 + wp.z * 0.06 - uTime * 0.55 + phase) * 0.5 + 0.5;',
        'gust = pow(gust, 2.0);   // gusts arrive in waves, not evenly',
        'float ripple = sin(wp.x * 0.7 + wp.z * 0.55 - uTime * 2.4 + phase * 2.0);',
        'float sway = (gust * 0.85 + ripple * 0.22) * uWind / stiff;',
        '// CANTILEVER: displacement grows with the SQUARE of height — the shape a',
        '// real blade takes under load. Linear bending looks like rubber.',
        'float bend = bladeH * bladeH * sway * 0.42;',
        'transformed.x += bend;',
        'transformed.z += bend * 0.55;',
        '// A bending blade also loses height; without this it visibly stretches.',
        'transformed.y -= abs(bend) * 0.16 * bladeH;',
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uSun;',
        'varying float vBladeH;',
        'varying float vTint;',
      ].join('\n'))
      .replace('#include <dithering_fragment>', [
        '#include <dithering_fragment>',
        '// Root darkening: light does not reach the base of a sward, and without',
        '// it the field looks like it is hovering above the ground.',
        'float root = smoothstep(0.0, 0.45, vBladeH);',
        'gl_FragColor.rgb *= mix(0.42, 1.0, root);',
        '// Per-blade colour variance, so the sward is not one flat green.',
        'gl_FragColor.rgb *= mix(0.84, 1.16, vTint);',
        '// TRANSLUCENCY: a blade is thin enough to glow when the sun is behind it.',
        '// This is most of what makes a real field look sunlit rather than green.',
        'float backlit = max(0.0, dot(normalize(vViewPosition), uSun));',
        'gl_FragColor.rgb += vec3(0.34, 0.44, 0.16) * pow(backlit, 3.0) * root * 0.5;',
      ].join('\n'));
  }, [uniforms]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, undefined as unknown as THREE.Material, count]}
      frustumCulled={false}
      receiveShadow
    >
      <meshStandardMaterial
        color={blend}
        roughness={0.86}
        metalness={0}
        side={THREE.DoubleSide}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}
