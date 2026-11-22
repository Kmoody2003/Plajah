// Post stack (high tier): scene pass with normals → GTAO ambient occlusion → bloom → filmic grade + vignette.
// Tone mapping comes from the renderer.
import * as THREE from 'three/webgpu';
import {
  colorToDirection, directionToColor, reference, uniform, float, vec4, length, mix, mrt, normalView, output, pass, sample, screenUV, smoothstep, vec2, vec3, luminance,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';

export interface Post {
  render(): void;
  setBloom(strength: number): void;
}

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera): Post | null {
  try {
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: directionToColor(normalView) }));
    // sprites (snow, embers, fireflies) have no surface normal: give them a flat one for this MRT pass only
    // (set here, not in the levels: without the AO pass there is no normal target and the override breaks the pipeline)
    const flat = mrt({ output, normal: vec4(0.5, 0.5, 1.0, 1.0) });
    scene.traverse((o) => { const m = (o as THREE.Points).material as any; if ((o as THREE.Points).isPoints && m?.isNodeMaterial) m.mrtNode = flat; });
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const normalTex = scenePass.getTextureNode('normal');
    const sceneNormal = sample((uv: any) => colorToDirection(normalTex.sample(uv)));
    const aoPass = ao(depth, sceneNormal, camera);
    aoPass.resolutionScale = 0.5;
    const dbg = new URLSearchParams(location.search).get('post') ?? '';
    const occl = aoPass.getTextureNode().r;
    const lit = dbg.includes('noao') ? color.rgb : color.rgb.mul(mix(float(1), occl, 0.85));
    // sun shafts: a level that wants them tags its shadow-casting sun as scene.userData.godrays (Elderwood Wilds by day);
    // the godrays pass raymarches that light's shadow map, so the shafts are the real gaps in the canopy
    const sun = scene.userData.godrays as THREE.DirectionalLight | undefined;
    let rays: any = null;
    if (sun && sun.castShadow && !dbg.includes('norays')) {
      const g = godrays(depth, camera, sun); g.resolutionScale = 0.5; g.density.value = 1.0; g.maxDensity.value = 0.85; g.distanceAttenuation.value = 0.8;
      rays = g.getTextureNode().r.mul(uniform(sun.color)).mul(reference('intensity', 'float', sun).mul(1.6 / 5.2).min(2));
    }
    const glow = bloom(rays ? lit.add(rays) : lit, 0.45, 0.5, 0.82);
    let c: any = (rays ? lit.add(rays) : lit).add(glow);
    // grade: cool the shadows, keep highlights neutral-warm, gentle S-curve contrast
    const l = luminance(c);
    // (a saturation boost here turned the desaturated blue stone orange in the distance - keep the grade to a mild cool lift)
    if (!dbg.includes('nograde')) c = mix(c.mul(vec3(0.94, 0.98, 1.05)), c, smoothstep(float(0.05), float(0.5), l));
    const vig = smoothstep(float(0.95), float(0.35), length(screenUV.sub(vec2(0.5, 0.5))).mul(1.25)).mul(0.35).add(0.65);
    pipeline.outputNode = c.mul(vig);
    return {
      render: () => pipeline.render(),
      setBloom: (s: number) => { glow.strength.value = s; },
    };
  } catch (err) {
    console.warn('[rift-realm] post stack unavailable, rendering direct:', err);
    return null;
  }
}
