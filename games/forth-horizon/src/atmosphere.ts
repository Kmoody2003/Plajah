import * as THREE from 'three';

/** Mean exponential density along a segment, symmetric and stable at the horizon.
 * Heights are relative to the lake; density is bounded below lake level.
 */
export function meanHeightDensity(a: number, b: number, falloff: number): number {
  const lo = Math.max(0, Math.min(a, b)) * falloff;
  const delta = Math.abs(Math.max(0, a) - Math.max(0, b)) * falloff;
  return Math.exp(-lo) * (delta < 0.001 ? 1 - delta * 0.5 + delta * delta / 6 : -Math.expm1(-delta) / delta);
}

export const ATMOSPHERE_GLSL = `
  uniform vec4 apexAtmosphere;
  uniform vec3 apexFogSun, apexFogSunColor;
  vec3 apexRadiance(vec3 direction, vec3 fogColor) {
    float facing = max(0.0, dot(direction, apexFogSun));
    return mix(fogColor, apexFogSunColor, pow(facing, 8.0) * apexAtmosphere.w);
  }
  vec3 apexApplyFog(vec3 color, vec3 world, vec3 eye, vec3 fogColor, float fogFactor) {
    if (apexAtmosphere.x <= 0.0) return mix(color, fogColor, fogFactor);
    vec3 ray = world - eye;
    float distanceToEye = length(ray);
    float lowHeight = max(0.0, min(eye.y, world.y));
    float heightDelta = abs(max(0.0, eye.y) - max(0.0, world.y)) * apexAtmosphere.z;
    float segmentDensity = heightDelta < 0.001
      ? 1.0 - heightDelta * 0.5 + heightDelta * heightDelta / 6.0
      : (1.0 - exp(-heightDelta)) / max(heightDelta, 0.000001);
    segmentDensity *= exp(-lowHeight * apexAtmosphere.z);
    float opticalDepth = distanceToEye * (apexAtmosphere.x + apexAtmosphere.y * segmentDensity);
    // Preserve opaque far-distance coverage of the original fog. This replaces
    // its blend rather than fogging the same surface twice.
    float atmosphereAmount = max(fogFactor, 1.0 - exp(-min(opticalDepth, 16.0)));
    return mix(color, apexRadiance(ray / max(distanceToEye, 0.001), fogColor), atmosphereAmount);
  }
`;
export const ATMOSPHERE_FRAGMENT = `
  gl_FragColor.rgb = apexApplyFog(gl_FragColor.rgb, apexFogWorld, cameraPosition, fogColor, fogFactor);
`;

/** Local shader patches only: never mutate Three.ShaderChunk or renderer state. */
export class Atmosphere {
  readonly uniforms = {
    apexAtmosphere: { value: new THREE.Vector4() },
    apexFogSun: { value: new THREE.Vector3(0, 1, 0) },
    apexFogSunColor: { value: new THREE.Color() },
    apexCameraWorld: { value: new THREE.Matrix4() },
  };
  private patched = new WeakSet<THREE.Material>();
  private watched = new WeakSet<THREE.Object3D>();

  /** Observe additions before warmup instead of traversing the scene during driving.
   * Call prepare(mesh) explicitly when replacing an attached mesh's material. */
  prepare(root: THREE.Object3D): void {
    const material = (root as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach(m => this.patchMaterial(m));
    else if (material) this.patchMaterial(material);
    if (this.watched.has(root)) return;
    this.watched.add(root);
    root.addEventListener('childadded', event => this.prepare(event.child));
    root.children.forEach(child => this.prepare(child));
  }

  patchCustom(material: THREE.ShaderMaterial, kind: 'water' | 'sky'): void {
    if (this.patched.has(material)) return;
    const target = kind === 'water' ? 'col = mix(col, uFog, fg);'
      : 'col = mix(col, uFog, clamp(hz * (0.18 + uFogAmt * 0.82), 0.0, 1.0));';
    if (!material.fragmentShader.includes(target)) throw new Error(`Atmosphere ${kind} integration changed`);
    const replacement = kind === 'water'
      ? 'col = apexApplyFog(col, vW, cameraPosition, uFog, fg);'
      : `if (apexAtmosphere.x > 0.0) {
          float horizon = 1.0 - smoothstep(0.0, 0.18, max(dir.y, 0.0));
          col = mix(col, apexRadiance(dir, uFog), horizon);
        } else { ${target} }`;
    material.fragmentShader = ATMOSPHERE_GLSL + material.fragmentShader.replace(target, replacement);
    if (kind === 'sky') material.fragmentShader = material.fragmentShader.replace(
      'if (dir.y < 0.0) col = mix(col, uFog, smoothstep(0.0, -0.12, dir.y));',
      'if (dir.y < 0.0 && apexAtmosphere.x <= 0.0) col = mix(col, uFog, smoothstep(0.0, 0.12, -dir.y));');
    Object.assign(material.uniforms, this.uniforms);
    this.patched.add(material);
    material.needsUpdate = true;
  }

  patchMaterial(material: THREE.Material): boolean {
    // Custom shaders with the standard fog contract (rain) can share this hook.
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial ||
      (material instanceof THREE.ShaderMaterial && material.vertexShader.includes('#include <fog_vertex>') &&
       material.fragmentShader.includes('#include <fog_fragment>'))) ||
      !material.fog || this.patched.has(material)) return false;
    this.patched.add(material);
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey.bind(material);
    // The default cache key derives from onBeforeCompile: capture it before wrapping.
    const defaultKey = material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
    const fixedKey = defaultKey ? previousKey() : '';
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      if (!shader.vertexShader.includes('#include <fog_vertex>') ||
          !shader.fragmentShader.includes('#include <fog_fragment>')) return;
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 apexFogWorld;\nuniform mat4 apexCameraWorld;\n#endif')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_FOG\napexFogWorld = (apexCameraWorld * mvPosition).xyz;\n#endif');
      const originalFog = THREE.ShaderChunk.fog_fragment;
      const blend = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
      if (!originalFog.includes(blend)) throw new Error('Apex atmosphere: Three fog chunk changed; review integration');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying vec3 apexFogWorld;\n${ATMOSPHERE_GLSL}\n#endif`)
        .replace('#include <fog_fragment>', originalFog.replace(blend, ATMOSPHERE_FRAGMENT));
      // Blend linear light before the display transform, matching water and sky.
      const fogCode = originalFog.replace(blend, ATMOSPHERE_FRAGMENT);
      if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(fogCode, '')
          .replace('#include <tonemapping_fragment>', fogCode + '\n#include <tonemapping_fragment>');
      }
    };
    material.customProgramCacheKey = () => `${defaultKey ? fixedKey : previousKey()}|apex-atmosphere-v2`;
    material.needsUpdate = true;
    return true;
  }

  update(scene: THREE.Scene, camera: THREE.Camera, sun: THREE.Vector3, sunColor: THREE.Color,
    fogginess: number, sunlight: number, night: number, mapMode: boolean, now: number): void {
    camera.updateMatrixWorld();
    this.uniforms.apexCameraWorld.value.copy(camera.matrixWorld);
    this.uniforms.apexFogSun.value.copy(sun).normalize();
    this.uniforms.apexFogSunColor.value.copy(sunColor);
    const fog = THREE.MathUtils.clamp(fogginess, 0, 1);
    this.uniforms.apexAtmosphere.value.set(
      mapMode ? 0 : 0.000012 + fog * 0.000055,
      0.000025 + fog * fog * 0.0012,
      1 / (24 + fog * 46),
      0.18 * THREE.MathUtils.clamp(sunlight, 0, 1) * (1 - THREE.MathUtils.clamp(night, 0, 1)) * (1 - fog),
    );
    this.prepare(scene);
  }
}
