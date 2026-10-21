// Post chain: scene (rendered at an internal resolution, 720p by default) → optional SSR
// → bloom → FXAA → FSR1 upscale + RCAS sharpen to the display → tone map/output.
// Intel's XeSS isn't reachable from the browser; FSR1 is the vendor-neutral equivalent
// that runs well on Arc iGPUs.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, metalness, roughness, velocity, vec2, directionToColor, colorToDirection, sample, blendColor } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';

export interface PostQuality { ssr: boolean; ssrScale: number; bloom: boolean; taa: boolean; smaa: boolean; upscale: boolean }

type V4 = THREE.Node<'vec4'>;

export function buildPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: PostQuality) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  // Extra G-buffer targets only when an effect reads them: on an iGPU every additional
  // render target is pure bandwidth.
  if (q.ssr || q.taa) {
    scenePass.setMRT(mrt({
      output,
      normal: directionToColor(normalView),
      metalrough: vec2(metalness, roughness),
      ...(q.taa ? { velocity } : {}),
    }));
  }
  const colorTex = scenePass.getTextureNode('output');
  const depthTex = scenePass.getTextureNode('depth');

  let composed = colorTex as unknown as V4;
  let ssrNode: ReturnType<typeof ssr> | null = null;
  if (q.ssr) {
    const normalTex = scenePass.getTextureNode('normal');
    const mrTex = scenePass.getTextureNode('metalrough');
    const sceneNormal = sample((uv) => colorToDirection(normalTex.sample(uv)));
    ssrNode = ssr(colorTex, depthTex, sceneNormal, mrTex.r, mrTex.g, camera);
    ssrNode.resolutionScale = q.ssrScale;
    ssrNode.maxDistance.value = 120;
    ssrNode.thickness.value = 0.25;
    ssrNode.quality.value = 0.5;
    ssrNode.opacity.value = 0.55;
    composed = blendColor(colorTex, ssrNode) as unknown as V4;
  }
  let bloomNode: ReturnType<typeof bloom> | null = null;
  if (q.bloom) {
    bloomNode = bloom(composed, 0.28, 0.18, 1.6);
    composed = composed.add(bloomNode) as unknown as V4;
  }
  // TRAA renders black into offscreen targets; SMAA breaks with two pipelines (r184).
  if (q.taa) composed = traa(composed, depthTex, scenePass.getTextureNode('velocity'), camera) as unknown as V4;
  else if (q.smaa) composed = fxaa(composed) as unknown as V4;
  // FSR1: edge-adaptive upscale to the drawing buffer + contrast-adaptive sharpening.
  if (q.upscale) composed = fsr1(composed, 0.25) as unknown as V4;
  pipeline.outputNode = composed;

  return {
    pipeline, ssrNode, bloomNode,
    /** Internal render scale relative to the drawing buffer (1 = native). */
    setInternalScale(s: number) { scenePass.setResolutionScale(s); },
  };
}
