// Post chain: scene (rendered at an internal resolution, 720p by default) → optional SSR
// → bloom → FXAA → FSR1 upscale + RCAS sharpen to the display → tone map/output.
// Intel's XeSS isn't reachable from the browser; FSR1 is the vendor-neutral equivalent
// that runs well on Arc iGPUs.
import * as THREE from 'three/webgpu';
import { pass, rtt, mrt, output, normalView, metalness, roughness, velocity, vec2, vec3, vec4, float, max, mix, dot, directionToColor, colorToDirection, sample, renderOutput, texture3D, uniform, screenUV, smoothstep } from 'three/tsl';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

// bloom 'full' = three's 5-mip UnrealBloom (12 passes); 'lean' = threshold + one quarter-res
// separable Gaussian (3 passes) — the iGPU tier, where each pass costs real CPU.
export interface PostQuality { ssr: boolean; ssrScale: number; bloom: 'full' | 'lean' | false; taa: boolean; smaa: boolean; upscale: boolean;
  /** Hardware MSAA on the scene pass (resolved before post): clean geometric edges at the internal resolution. */
  msaa?: number;
  /** Ambient occlusion (GTAO at half the internal resolution, normals rebuilt from depth): contact shadow under
   *  eaves, in alleys, where walls meet the street and round props and feet. */
  ao?: boolean;
  /** Sun shafts: ray-marched through the sun's shadow map, tinted with the sun's own colour. */
  rays?: THREE.DirectionalLight;
  /** CSM-compatible screen-space crepuscular sun shafts projected from the sky horizon (works alongside CSM shadows). */
  screenShafts?: { sun: THREE.DirectionalLight; reversedDepth?: boolean } }

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

/**
 * The fight's camera language (main.ts): `impact` (0…1, decays) is a hit's punch — a radial zoom smear and a colour
 * fringe from the frame centre; `drama` (0…1) is the kill-cam's grade — the colour drains a little and the corners
 * darken, so the blow and the blood-red sparks carry the frame.
 */
export const fightLook = { impact: uniform(0), drama: uniform(0) };

export function buildPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: PostQuality) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...(q.msaa ? { samples: q.msaa } : {}) });
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

  // three's blur/TRAA/FSR wrap non-texture inputs in an RTT sized to the drawing buffer, so the
  // whole chain after the scene silently ran at display res (FSR upscaled 1080p → 1080p). Bake
  // intermediates at the scene pass's internal size (× scale) instead.
  const sceneRT = scenePass.renderTarget;
  const displaySize = new THREE.Vector2();
  const internal = (node: unknown, scale = 1, of: 'scene' | 'display' = 'scene') => {
    const t = rtt(node as never);
    const update = t.updateBefore.bind(t);
    t.updateBefore = (frame) => {
      const src = of === 'scene' ? sceneRT : frame.renderer!.getDrawingBufferSize(displaySize);
      const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
      if (t.width !== w || t.height !== h) t.setSize(w, h);
      return update(frame);
    };
    return t as unknown as V4;
  };

  // Resolve MSAA depth once if SSR, GTAO, or screen-space shafts read it: multisampled depth breaks
  // `textureDimensions(depth, level)` and depth sampling in WGSL.
  let resolvedDepth: unknown = depthTex;
  if (q.msaa && (q.ssr || q.ao || q.screenShafts)) {
    const t = rtt(depthTex as never, null, null, { type: THREE.FloatType });
    if (t.renderTarget) t.renderTarget.texture.minFilter = t.renderTarget.texture.magFilter = THREE.NearestFilter;
    const update = t.updateBefore.bind(t);
    t.updateBefore = (frame) => {
      if (t.width !== sceneRT.width || t.height !== sceneRT.height) t.setSize(sceneRT.width, sceneRT.height);
      return update(frame);
    };
    resolvedDepth = t;
  }

  let composed = colorTex as unknown as V4;
  let ssrNode: ReturnType<typeof ssr> | null = null;
  if (q.ssr) {
    const normalTex = scenePass.getTextureNode('normal');
    const mrTex = scenePass.getTextureNode('metalrough');
    const sceneNormal = sample((uv) => colorToDirection(normalTex.sample(uv)));
    ssrNode = ssr(colorTex, resolvedDepth as never, sceneNormal, mrTex.r, mrTex.g, camera);
    ssrNode.resolutionScale = q.ssrScale;
    ssrNode.maxDistance.value = 140;
    ssrNode.thickness.value = 0.25;
    ssrNode.quality.value = q.ssrScale > 0.6 ? 0.7 : 0.5;
    ssrNode.opacity.value = 0.68;
    // Additive, not replace: reflections only ever add light (torch streaks, sky sheen), as in
    // the art. Replace-blending let reflected dark geometry punch black blobs into wet roads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sr = ssrNode as any;
    composed = (colorTex as any).add(vec4(sr.rgb.mul(sr.a).mul(0.75), 0)) as V4;
  }
  let aoNode: ReturnType<typeof ao> | null = null;
  if (q.ao) {
    aoNode = ao(resolvedDepth as never, null as never, camera);   // no normal target: GTAO rebuilds normals from depth
    aoNode.resolutionScale = 0.5;
    aoNode.samples.value = 10;
    aoNode.radius.value = 1.05;
    aoNode.distanceExponent.value = 1.65;
    aoNode.thickness.value = 1.25;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // GTAO samples a 4×4 noise pattern; without a blur that pattern prints as a regular dot grid on walls and the far
    // hills (worst after the upscale + sharpen). A small blur at the AO's own resolution resolves it.
    const occ = (gaussianBlur((aoNode as any).getTextureNode(), float(1) as never, 2) as any).r;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    composed = (composed as any).mul(vec4(vec3(mix(float(1), occ, 0.88)), 1)) as V4;
  }
  let raysNode: ReturnType<typeof godrays> | null = null;
  if (q.rays) {
    const sun = q.rays;
    raysNode = godrays(depthTex, camera, sun);
    raysNode.resolutionScale = 0.25;
    raysNode.raymarchSteps.value = 28;
    // gentle: shafts through the eaves and smoke, not a wall of light (at quarter resolution a strong setting
    // printed hard vertical columns where the march left the sun's shadow frustum)
    raysNode.density.value = 0.32;
    raysNode.maxDensity.value = 0.28;
    raysNode.distanceAttenuation.value = 2.6;
    const tint = uniform(new THREE.Color()).onFrameUpdate(() => new THREE.Color().copy(sun.color).multiplyScalar(sun.intensity * 0.09));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shaft = (raysNode as any).getTextureNode().r;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    composed = (composed as any).add(vec4(tint.mul(shaft), 0)) as V4;
  } else if (q.screenShafts) {
    // CSM-compatible crepuscular sun shafts: 10 radial depth-sky occlusion taps at quarter res.
    const { sun, reversedDepth = true } = q.screenShafts;
    const sunUV = uniform(new THREE.Vector2(0.5, 0.5));
    const shaftTint = uniform(new THREE.Color());
    const sunDirW = new THREE.Vector3();
    const sunFarW = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    const shaftColor = new THREE.Color();
    const shaftBase = { sunUV, shaftTint };
    void shaftBase;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = screenUV;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dTex: any = resolvedDepth;
    const stepDelta = sunUV.sub(u).mul(1 / 12);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let acc: any = float(0);
    const TAPS = 10;
    for (let i = 0; i < TAPS; i++) {
      const suv = u.add(stepDelta.mul(i + 0.5));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = dTex.sample(suv).r;
      const isSky = reversedDepth ? smoothstep(float(0.004), float(0.0002), d) : smoothstep(float(0.996), float(0.9998), d);
      const fade = float(1 - (i / TAPS) * 0.65);
      acc = acc.add(isSky.mul(fade));
    }
    const radialFade = smoothstep(float(1.15), float(0.08), sunUV.sub(u).length());
    const rawShaft = vec4(vec3(acc.div(TAPS).mul(radialFade)), 1);
    const softShaft = gaussianBlur(internal(rawShaft, 0.3, 'scene') as never, float(1.8) as never, 4);
    const shaftGain = uniform(0).onFrameUpdate(() => {
      camera.updateMatrixWorld();
      sunDirW.copy(sun.position).sub(sun.target.position).normalize();
      camera.getWorldDirection(camFwd);
      const facing = Math.max(0, camFwd.dot(sunDirW));
      sunFarW.copy(camera.position).addScaledVector(sunDirW, 4000).project(camera);
      (sunUV as unknown as { value: THREE.Vector2 }).value.set(sunFarW.x * 0.5 + 0.5, 0.5 - sunFarW.y * 0.5);
      shaftColor.copy(sun.color).multiplyScalar(0.11 * Math.min(3.5, sun.intensity) * Math.pow(facing, 1.3));
      (shaftTint as unknown as { value: THREE.Color }).value.copy(shaftColor);
      return 1;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    composed = (composed as any).add(vec4(shaftTint.mul((softShaft as any).r).mul(shaftGain), 0)) as V4;
  }
  let bloomNode: ReturnType<typeof bloom> | null = null;
  if (q.bloom === 'full') {
    bloomNode = bloom(composed, 0.26, 0.36, 1.15);
    composed = composed.add(bloomNode) as unknown as V4;
  } else if (q.bloom === 'lean') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = composed as any;
    const bright = (vec4 as any)((max as any)(c.rgb.sub(float(1.4)), float(0)), 1);
    // Threshold straight into the quarter-display target the blur used to downsample into
    // (same 480×270 at 1080p, so the glow looks identical) instead of a full-res RTT.
    const glow = gaussianBlur(internal(bright, 0.25, 'display') as never, float(2.2) as never, 6);
    composed = c.add(vec4(glow.rgb.mul(0.32), 0)) as V4;
  }
  // Temporal AA (default in play): accumulates jittered frames, so edges stop crawling and
  // shimmering when the camera turns. (It renders black into offscreen targets; captures use the
  // canvas copy.)
  if (q.taa) {
    const t = traa(composed === colorTex ? composed : internal(composed), depthTex, scenePass.getTextureNode('velocity'), camera);
    // TRAA only copies scene depth into its history when the history matches the drawing buffer;
    // at internal res it never would (and the old full-res history made that copy invalid every
    // frame). Copy it whenever the sizes really match.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tr = t as any, traaUpdate = t.updateBefore.bind(t);
    t.updateBefore = (frame) => {
      const r = traaUpdate(frame);
      const hist = tr._historyRenderTarget, depth = tr.depthNode.value;
      const dpy = frame.renderer!.getDrawingBufferSize(displaySize);
      const matches = hist.width === sceneRT.width && hist.height === sceneRT.height;
      if (matches && (dpy.width !== hist.width || dpy.height !== hist.height)) {
        frame.renderer!.copyTextureToTexture(depth, hist.depthTexture);
        tr._previousDepthNode.value = hist.depthTexture;
      }
      return r;
    };
    composed = tr.getTextureNode() as V4;   // untyped in @types/three; avoids an FSR-input RTT copy
  }
  // Anti-alias at the internal resolution first: FSR1 expects AA'd input, and upscaling raw
  // aliased edges (then sharpening them) made thin geometry and textures shimmer.
  else if (q.smaa) composed = internal(fxaa(composed === colorTex ? composed : internal(composed))) as unknown as V4;
  // Impact smear + kill-cam grade (fightLook), at the internal resolution before the upscale: 6 taps along the ray
  // from the frame centre (zoom blur), red and blue pulled apart along it (fringe), then drain and vignette.
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src: any = composed === colorTex ? colorTex : internal(composed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = screenUV, dir: any = u.sub(0.5), im: any = fightLook.impact, dr: any = fightLook.drama;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let acc: any = src.sample(u);
    for (let i = 1; i < 6; i++) acc = acc.add(src.sample(u.sub(dir.mul(im.mul(0.045 * i / 5)))));
    acc = acc.div(6);
    const fr = dir.mul(im.mul(0.012).add(dr.mul(0.003)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let c: any = vec3(src.sample(u.add(fr)).r, acc.g, src.sample(u.sub(fr)).b);
    c = mix(acc.rgb, c, im.add(dr).min(1));
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(lum), dr.mul(0.45));
    c = c.mul(float(1).sub(dr.mul(0.55).mul(smoothstep(0.25, 0.75, dir.length()))));
    composed = internal(vec4(c, 1));   // FSR needs a texture at the internal size (see internal())
  }
  // FSR1: edge-adaptive upscale + gentle RCAS (0 = sharpest, 2 = none) with denoise, so
  // sharpening doesn't re-amplify texture sparkle.
  if (q.upscale) composed = fsr1(composed, 0.35, true) as unknown as V4;
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
