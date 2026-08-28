// GroundCover — the layer between the grass and the canopy.
//
// A floor of nothing but blade-grass still reads as a shader demo, because a
// real woodland floor is not a lawn. It is layered: grass at ankle height, then
// broad-leaved undergrowth — ferns, bracken, low herbs — then the trunks. That
// MIDDLE layer is what the eye uses to judge that the ground has depth, and its
// absence is most of why a clearing looks like a stage.
//
// Each plant is a pair of CROSSED QUADS carrying a leaf-card texture, the same
// trick the canopy uses: one quad holds a whole cluster of leaves, so a few
// hundred plants read as dense undergrowth. Crossing them at 90° means the plant
// keeps volume from any viewing angle instead of turning into a flat sheet.
//
// The wind matches GrassField's — same cantilever bend, same travelling gusts —
// but slower and heavier, because a broad leaf has more mass than a blade.

import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { leafCardTexture } from './textures';
import type { LeafShape } from './leafShapes';

export interface GroundCoverProps {
  count?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** Leaf outline the clumps are built from. */
  shape?: LeafShape;
  color?: string;
  dryColor?: string;
  wind?: number;
  season?: number;
  sunPosition?: [number, number, number];
}

/**
 * Two quads crossed at 90°, standing on the ground. Cheaper than any real plant
 * mesh and, at this distance and density, indistinguishable from one.
 */
function crossedQuads(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const w = 0.5;
  for (let q = 0; q < 2; q++) {
    const a = (q * Math.PI) / 2;
    const cx = Math.cos(a) * w;
    const cz = Math.sin(a) * w;
    const base = q * 4;
    pos.push(-cx, 0, -cz, cx, 0, cz, -cx, 1, -cz, cx, 1, cz);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function GroundCover({
  count = 900, innerRadius = 1.5, outerRadius = 26,
  shape = 'broad', color = '#3f7233', dryColor = '#8a7534',
  wind = 1, season = 0, sunPosition = [30, 26, 16],
}: GroundCoverProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => crossedQuads(), []);

  const blend = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color(dryColor), Math.max(0, Math.min(1, season))),
    [color, dryColor, season],
  );

  // A denser card than the canopy uses: undergrowth clumps are read from above
  // and need to fill their quad, or the crossed pair shows as two rectangles.
  const card = useMemo(
    () => leafCardTexture(shape, '#ffffff', 512, 26, 4241),
    [shape],
  );

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWind: { value: wind },
    uSun: { value: new THREE.Vector3(30, 26, 16).normalize() },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { uniforms.uWind.value = wind; }, [wind, uniforms]);
  useLayoutEffect(() => {
    uniforms.uSun.value.set(sunPosition[0], sunPosition[1], sunPosition[2]).normalize();
  }, [sunPosition, uniforms]);

  // Undergrowth grows in PATCHES, not evenly — it follows light and damp. So the
  // scatter picks a handful of centres and clusters around them, which is what
  // stops it looking sprinkled.
  const { matrices, plants } = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const mats = new Float32Array(count * 16);
    const pl = new Float32Array(count * 2);
    let seed = 776611;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    const patches = 26;
    const centres: [number, number][] = [];
    for (let p = 0; p < patches; p++) {
      const r = innerRadius + Math.sqrt(rand()) * (outerRadius - innerRadius);
      const a = rand() * Math.PI * 2;
      centres.push([Math.cos(a) * r, Math.sin(a) * r]);
    }

    for (let i = 0; i < count; i++) {
      const c = centres[Math.floor(rand() * patches)] ?? [0, 0];
      // Gaussian-ish spread around the patch centre from two uniforms.
      const spread = 2.2 + rand() * 2.6;
      const ox = (rand() + rand() - 1) * spread;
      const oz = (rand() + rand() - 1) * spread;
      const x = c[0] + ox;
      const z = c[1] + oz;
      const d = Math.hypot(x, z);
      if (d > outerRadius || d < innerRadius) { // pushed outside — pull it back in
        const k = Math.max(innerRadius, Math.min(outerRadius, d)) / (d || 1);
        v.set(x * k, 0, z * k);
      } else {
        v.set(x, 0, z);
      }
      const h = 0.35 + Math.pow(rand(), 1.4) * 0.85;
      e.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
      q.setFromEuler(e);
      sc.set(h * (0.8 + rand() * 0.5), h, h * (0.8 + rand() * 0.5));
      m.compose(v, q, sc);
      m.toArray(mats, i * 16);
      pl[i * 2] = rand();                        // tint
      pl[i * 2 + 1] = 0.7 + rand() * 0.7;        // stiffness
    }
    return { matrices: mats, plants: pl };
  }, [count, innerRadius, outerRadius]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
    mesh.geometry.setAttribute('aPlant', new THREE.InstancedBufferAttribute(plants, 2));
    mesh.computeBoundingSphere();
  }, [matrices, plants, count]);

  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);

  useFrame(({ clock }) => { uniforms.uTime.value = clock.elapsedTime; });

  const onBeforeCompile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uSun = uniforms.uSun;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uTime;',
        'uniform float uWind;',
        'attribute vec2 aPlant;',
        'varying float vPlantH;',
        'varying float vTint;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '// Height comes from position.y, NOT uv.y. three.js only declares the',
        '// uv attribute when the material carries a map, so reading uv here',
        '// fails to compile on any un-mapped material and takes the whole',
        '// frame down with it. position is always declared.',
        'float plantH = clamp(position.y, 0.0, 1.0);',
        'vPlantH = plantH;',
        'vTint = aPlant.x;',
        'vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
        'float stiff = aPlant.y;',
        'float phase = aPlant.x * 6.2831;',
        '// Same travelling gust as the grass, so the two layers agree — but',
        '// slower, because a broad leaf carries more mass than a blade.',
        'float gust = sin(wp.x * 0.09 + wp.z * 0.06 - uTime * 0.42 + phase) * 0.5 + 0.5;',
        'gust = pow(gust, 2.0);',
        'float ripple = sin(wp.x * 0.5 + wp.z * 0.4 - uTime * 1.5 + phase * 2.0);',
        'float sway = (gust * 0.7 + ripple * 0.18) * uWind / stiff;',
        'float bend = plantH * plantH * sway * 0.26;',
        'transformed.x += bend;',
        'transformed.z += bend * 0.5;',
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uSun;',
        'varying float vPlantH;',
        'varying float vTint;',
      ].join('\n'))
      .replace('#include <dithering_fragment>', [
        '#include <dithering_fragment>',
        '// Undergrowth sits in its own shade; the base of a clump is always',
        '// darker than its crown, and skipping this makes it look pasted on.',
        'float root = smoothstep(0.0, 0.4, vPlantH);',
        'gl_FragColor.rgb *= mix(0.4, 1.0, root);',
        'gl_FragColor.rgb *= mix(0.82, 1.18, vTint);',
        'float backlit = max(0.0, dot(normalize(vViewPosition), uSun));',
        'gl_FragColor.rgb += vec3(0.3, 0.4, 0.14) * pow(backlit, 3.0) * root * 0.45;',
      ].join('\n'));
  }, [uniforms]);

  if (!card) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, undefined as unknown as THREE.Material, count]}
      frustumCulled={false}
      castShadow
      receiveShadow
    >
      {/* alphaTest, not blending: undergrowth overlaps itself constantly and
          alpha-blended quads sort wrongly against each other every frame.
          No alphaMap — three.js samples its GREEN channel, which silently culls
          dark-leaved cards. That was the bare-canopy bug; do not reintroduce it. */}
      <meshStandardMaterial
        color={blend}
        map={card}
        transparent
        alphaTest={0.3}
        roughness={0.72}
        metalness={0}
        side={THREE.DoubleSide}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}
