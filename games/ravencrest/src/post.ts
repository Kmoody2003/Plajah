// Post chain: scene (rendered at an internal resolution, 720p by default) → optional SSR
// → bloom → FXAA → FSR1 upscale + RCAS sharpen to the display → tone map/output.
// Intel's XeSS isn't reachable from the browser; FSR1 is the vendor-neutral equivalent
// that runs well on Arc iGPUs.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, metalness, roughness, velocity, vec2, vec4, float, max, directionToColor, colorToDirection, sample, renderOutput, texture3D, uniform } from 'three/tsl';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
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

// Shared colour grade (looks.ts): one 3D LUT + strength for every level's pipeline, applied in
// display space after tone mapping. Identity (strength 0) until a LUT is picked.
const LUT_SIZE = 33;
const identity = (() => {
  const n = 2, d = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) d.set([r * 255, g * 255, b * 255, 255], ((b * n + g) * n + r) * 4);
  const t = new THREE.Data3DTexture(d, n, n, n);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
})();
const lutTex = texture3D(identity);
const lutAmount = uniform(0);
export function setLut(tex: THREE.Data3DTexture | null, amount: number) {
  lutTex.value = tex ?? identity;
  lutAmount.value = tex ? amount : 0;
}

export function buildPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: PostQuality) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  // Extra G-buffer targets only when an effect reads them: on an iGPU every additional
  // render target is pure bandwidth.
  if (q.ssr || q.taa) {
    // Normals + metal/roughness only feed SSR; TAA alone needs just velocity (two fewer targets).
    scenePass.setMRT(mrt({
      output,
      ...(q.ssr ? { normal: directionToColor(normalView), metalrough: vec2(metalness, roughness) } : {}),
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
  // Temporal AA (default in play): accumulates jittered frames, so edges stop crawling and
  // shimmering when the camera turns. (It renders black into offscreen targets; captures use the
  // canvas copy.)
  if (q.taa) composed = traa(composed, depthTex, scenePass.getTextureNode('velocity'), camera) as unknown as V4;
  // Anti-alias at the internal resolution first: FSR1 expects AA'd input, and upscaling raw
  // aliased edges (then sharpening them) made thin geometry and textures shimmer.
  else if (q.smaa) composed = fxaa(composed) as unknown as V4;
  // FSR1: edge-adaptive upscale + gentle RCAS (0 = sharpest, 2 = none) with denoise, so
  // sharpening doesn't re-amplify texture sparkle.
  if (q.upscale) composed = fsr1(composed, 0.6, true) as unknown as V4;
  // Tone map + sRGB here (not implicitly) so the LUT grades display-referred colour.
  pipeline.outputColorTransform = false;
  composed = renderOutput(composed) as unknown as V4;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  composed = lut3D(composed as any, lutTex as any, LUT_SIZE, lutAmount as any) as unknown as V4;
  pipeline.outputNode = composed;

  return {
    pipeline, ssrNode, bloomNode,
    /** Internal render scale relative to the drawing buffer (1 = native). */
    setInternalScale(s: number) { scenePass.setResolutionScale(s); },
  };
}
