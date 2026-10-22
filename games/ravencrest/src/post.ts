// Post chain: scene (rendered at an internal resolution, 720p by default) → optional SSR
// → bloom → FXAA → FSR1 upscale + RCAS sharpen to the display → tone map/output.
// Intel's XeSS isn't reachable from the browser; FSR1 is the vendor-neutral equivalent
// that runs well on Arc iGPUs.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, metalness, roughness, velocity, vec2, vec4, float, max, directionToColor, colorToDirection, sample } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

// bloom 'full' = three's 5-mip UnrealBloom (12 passes); 'lean' = threshold + one quarter-res
// separable Gaussian (3 passes) — the iGPU tier, where each pass costs real CPU.
export interface PostQuality { ssr: boolean; ssrScale: number; bloom: 'full' | 'lean' | false; taa: boolean; smaa: boolean; upscale: boolean }

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
    // Additive, not replace: reflections only ever add light (torch streaks, sky sheen), as in
    // the art. Replace-blending let reflected dark geometry punch black blobs into wet roads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sr = ssrNode as any;
    composed = (colorTex as any).add(vec4(sr.rgb.mul(sr.a).mul(0.7), 0)) as V4;
  }
  let bloomNode: ReturnType<typeof bloom> | null = null;
  if (q.bloom === 'full') {
    bloomNode = bloom(composed, 0.28, 0.18, 1.6);
    composed = composed.add(bloomNode) as unknown as V4;
  } else if (q.bloom === 'lean') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = composed as any;
    const bright = (vec4 as any)((max as any)(c.rgb.sub(float(1.4)), float(0)), 1);
    const glow = gaussianBlur(bright as never, float(2.2) as never, 6, { resolutionScale: 0.25 });
    composed = c.add(vec4(glow.rgb.mul(0.32), 0)) as V4;
  }
  // TRAA renders black into offscreen targets; SMAA breaks with two pipelines (r184).
  if (q.taa) composed = traa(composed, depthTex, scenePass.getTextureNode('velocity'), camera) as unknown as V4;
  // FSR's edge-adaptive upscale covers edges; FXAA only when rendering at native size.
  else if (q.smaa && !q.upscale) composed = fxaa(composed) as unknown as V4;
  // FSR1: edge-adaptive upscale to the drawing buffer + contrast-adaptive sharpening.
  if (q.upscale) composed = fsr1(composed, 0.25) as unknown as V4;
  pipeline.outputNode = composed;

  return {
    pipeline, ssrNode, bloomNode,
    /** Internal render scale relative to the drawing buffer (1 = native). */
    setInternalScale(s: number) { scenePass.setResolutionScale(s); },
  };
}
