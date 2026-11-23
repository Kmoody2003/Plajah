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
    // forest scale: the default 0.25 m radius only darkened creases; trunk feet, roots, slabs on the ground and the
    // underside of the canopy need a metre or two of reach (the art's soft dark contact shadows everywhere)
    const look = (scene.userData.look ?? {}) as { aoRadius?: number; aoScale?: number; contrast?: number; toe?: number; warm?: number; rays?: number };
    aoPass.radius.value = look.aoRadius ?? 0.25; aoPass.thickness.value = Math.max(1, (look.aoRadius ?? 0.25) * 2);
    aoPass.scale.value = look.aoScale ?? 1; aoPass.distanceFallOff.value = 0.6;
    const dbg = new URLSearchParams(location.search).get('post') ?? '';
    const occl = aoPass.getTextureNode().r;
    const lit = dbg.includes('noao') ? color.rgb : color.rgb.mul(mix(float(1), occl, 0.85));
    // sun shafts: a level that wants them tags its shadow-casting sun as scene.userData.godrays (Elderwood Wilds by day);
    // the godrays pass raymarches that light's shadow map, so the shafts are the real gaps in the canopy
    const sun = scene.userData.godrays as THREE.DirectionalLight | undefined;
    let rays: any = null;
    if (sun && sun.castShadow && !dbg.includes('norays')) {
      // light builds up with the length of lit air the ray crosses inside the shadow box: at density 1 an open view of the
      // box (from a deck, a ridge, the sky) saturated into a white block with hard edges, worst under the moon. Lower
      // density and cap: the shafts between trunks still read, open air is a soft haze, the box edge is gone.
      const g = godrays(depth, camera, sun); g.resolutionScale = 0.5; g.density.value = 0.4; g.maxDensity.value = 0.45; g.distanceAttenuation.value = 2;
      // a level can ask for stronger shafts (look.rays): the Wilds' low fill leaves room for them without the white block
      rays = g.getTextureNode().r.mul(uniform(sun.color)).mul(reference('intensity', 'float', sun).mul(1.2 / 5.2).min(1)).mul(look.rays ?? 1);
      // a level can fade them (the Wilds' day cycle: full by day, gone at night — under the moon the lit shadow box
      // still read as a pale block over the forest)
      const gain = scene.userData.godraysGain as { value: number } | undefined;
      if (gain) rays = rays.mul(reference('value', 'float', gain));
    }
    const glow = bloom(rays ? lit.add(rays) : lit, 0.45, 0.5, 0.82);
    let c: any = (rays ? lit.add(rays) : lit).add(glow);
    // grade: cool the shadows, keep highlights neutral-warm, gentle S-curve contrast
    const l = luminance(c);
    // (a saturation boost here turned the desaturated blue stone orange in the distance - keep the grade to a mild cool lift)
    if (!dbg.includes('nograde')) c = mix(c.mul(vec3(0.94, 0.98, 1.05)), c, smoothstep(float(0.05), float(0.5), l));
    // a level can ask for a contrast curve around mid grey (the Wilds: deep shade, bright shafts) and a darker toe
    if (!dbg.includes('nograde') && (look.contrast || look.toe)) {
      const k = float(look.contrast ?? 1), mid = float(0.18);
      c = c.max(1e-4).div(mid).pow(k).mul(mid);
      if (look.toe) c = c.mul(smoothstep(float(0), float(look.toe), luminance(c)).mul(0.35).add(0.65));
      // warm mids and highlights over the cool shade (the art's gold sun through green, teal in the shadows)
      if (look.warm) c = mix(c, c.mul(vec3(1.07, 1.0, 0.84)), smoothstep(float(0.08), float(0.6), luminance(c)).mul(look.warm));
    }
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
