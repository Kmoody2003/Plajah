// games/apex/src/tsl/carPaintTsl.ts
//
// Unified WebGPU / TSL port of Apex's OEM automotive scan-car paint & multi-zone body shader
// (`games/apex/src/scancar.ts`). Preserves 100% of Apex's automotive look on `three/webgpu`:
//   - Multi-stage OEM metallic basecoat + grazing lacquer flop + iridescent pearl shift
//   - Anti-aliased metallic flake sparkle + 4 finishes (gloss metallic, satin, matte, mirror chrome)
//   - Ground, wheel-arch & underbody contact ambient occlusion
//   - Recessed hex honeycomb / truck-slat front grille + lower air intake + darkened frame
//   - Smoked exterior glass (for opponent/uncut shells), headlamp/taillamp housings, carbon rear wing,
//     textured satin trim (bumpers, side skirts, wheel arch lips), and optional SDF panel-gap seams
//   - Wheel-arch cutout (alphaTest) so real modelled wheels & glowing brake discs sit cleanly inside
//   - Full compatibility with `CarProbe` reflections (`userData.allowCarProbe = true`) and
//     Playkit L2 SH9 GI bounce (`enhanceMaterialWithPlaykitGi`).

import * as THREE from 'three/webgpu';
import {
  abs, cameraPosition, clamp, dot, float, floor, fract, frontFacing, length, max, min, mix, mod,
  normalView, normalWorld, normalize, positionLocal, positionViewDirection, positionWorld, pow,
  reflect, sign, sin, smoothstep, step, uniform, vec2, vec3,
} from 'three/tsl';
import {
  enhanceMaterialWithPlaykitGi,
  type PlaykitGiUniforms,
} from '../../../../playkit/render/liveLighting';
import type { ScanSpec } from '../scancar';

export interface ApexCarPaintUpdate {
  color?: number | string;
  pearl?: number | string;
  pearlAmount?: number;
  flake?: number;
  finish?: number;
}

export interface ApexCarPaintTslOptions {
  spec: ScanSpec;
  origin: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  paintHex?: number | string;
  bakedMap?: THREE.Texture | null;
  /** True for hero player cars with cut doors/hood/trunk & glass; false for single-pass opponent shells. */
  cuts?: boolean;
  /** Discard baked scan wheels (default true). */
  discardWheels?: boolean;
  /** Opponent simplified mode (skips fine panel-seam SDF and flake micro-sparkle for extra GPU speed). */
  opponent?: boolean;
  /** Optional SDF panel seam boxes [min, max] (up to 4). */
  panelBoxes?: { min: Array<{ x: number; y: number; z: number }>; max: Array<{ x: number; y: number; z: number }> };
  /** Optional Playkit SH9 GI uniforms so car lower panels pick up canyon/tunnel bounce. */
  gi?: PlaykitGiUniforms;
}

export interface ApexCarPaintTslHandle {
  material: THREE.MeshPhysicalNodeMaterial;
  setPaint(o: ApexCarPaintUpdate): void;
}

function parseColorInput(raw: number | string | undefined, fallback = 0x1b4f8c): THREE.Color {
  if (raw === undefined || raw === null) return new THREE.Color(fallback);
  if (typeof raw === 'number') return new THREE.Color(raw);
  if (/^0x/i.test(raw.trim())) return new THREE.Color(Number(raw.trim()));
  return new THREE.Color(raw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function h31Tsl(p: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p0: any = fract(p.mul(0.1031));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p1: any = p0.add(dot(p0, p0.yzx.add(33.33)));
  return fract(p1.x.add(p1.y).mul(p1.z));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hexEdgeTsl(p: any, s: number): any {
  const q = p.div(s);
  const r = vec2(1.0, 1.7320508);
  const h = r.mul(0.5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = mod(q, r).sub(h);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = mod(q.sub(h), r).sub(h);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickA: any = step(dot(a, a), dot(b, b));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = mix(b, a, pickA);
  return max(abs(g.x).mul(0.866).add(abs(g.y).mul(0.5)), abs(g.y));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sdBoxTsl(p: any, lo: any, hi: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = lo.add(hi).mul(0.5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = hi.sub(lo).mul(0.5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = abs(p.sub(c)).sub(h);
  return length(max(q, vec3(0.0))).add(min(max(q.x, max(q.y, q.z)), float(0.0)));
}

/** Float boolean helpers using pure branchless `step` (100% WGSL-safe, zero ConditionalNode type issues). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fGt = (a: any, b: any): any => step(b, a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fLt = (a: any, b: any): any => float(1.0).sub(step(b, a));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fOr = (a: any, b: any): any => clamp(a.add(b), 0.0, 1.0);

/**
 * Create a WebGPU/TSL `MeshPhysicalNodeMaterial` matching `scancar.ts`'s calibrated OEM car paint,
 * glass, grille, trim, and panel seams.
 */
export function createApexCarPaintTslMaterial(opts: ApexCarPaintTslOptions): ApexCarPaintTslHandle {
  const { spec, origin, size } = opts;
  const W = spec.wheels;
  const cuts = opts.cuts ?? (spec.cuts !== false && !opts.opponent);
  const discardWheels = opts.discardWheels !== false;
  const isOpponent = !!opts.opponent;

  const initPaint = parseColorInput(opts.paintHex ?? spec.paint, 0x1b4f8c);
  const uPaint = uniform(initPaint.clone());
  const uPearl = uniform(initPaint.clone());
  const uPearlAmt = uniform(0);
  const uFlake = uniform(isOpponent ? 0.36 : 0.30);
  const uFinish = uniform(0);

  const uOrg = uniform(new THREE.Vector3(origin.x, origin.y, origin.z));
  const uLen = float(Math.max(0.1, size.z));
  const uWid = float(Math.max(0.1, size.x));

  const grilleStyleNum = spec.shader?.grilleStyle === 'ev' ? 0 : spec.shader?.grilleStyle === 'truck' ? 2 : 1;
  const gLoY = spec.shader?.grilleLoY ?? (grilleStyleNum === 2 ? 0.52 : 0.34);
  const gHiY = spec.shader?.grilleHiY ?? (grilleStyleNum === 2 ? 1.02 : 0.60);
  const gMinY = grilleStyleNum === 2 ? 0.28 : 0.14;
  const hasPhysOpenings = !isOpponent && cuts && spec.front.openings.length > 0;

  const hdS = spec.lamps?.head;
  const tlS = spec.lamps?.tail;
  const headX0 = hdS ? hdS.x - 0.04 : 0.54;
  const headX1 = hdS ? hdS.x + hdS.w + 0.02 : 0.88;
  const headY0 = hdS ? hdS.y - 0.02 : 0.60;
  const headY1 = hdS ? hdS.y + hdS.h + 0.02 : 0.70;
  const headSlope = hdS ? (hdS.tilt ?? 0.045) / Math.max(0.1, hdS.w) : 0.25;
  const tailX0 = tlS ? (tlS.style === 'full-blade' ? 0.0 : Math.max(0, tlS.x - tlS.len * 0.52)) : 0.34;
  const tailX1 = tlS ? tlS.x + tlS.len * 0.52 : 0.78;
  const tailY0 = tlS ? tlS.y - 0.04 : 0.765;
  const tailY1 = tlS ? tlS.y + 0.04 : 0.835;

  const bumperFrontY = spec.shader?.bumperFrontY ?? 0.58;
  const bumperRearY = spec.shader?.bumperRearY ?? 0.62;
  const skirtY = spec.shader?.skirtY ?? 0.30;
  const archLipAdd = spec.shader?.archLipAdd ?? 0.095;
  const wingCarbonZ = spec.shader?.wingCarbonZ ?? -9.0;
  const wingCarbonY = spec.shader?.wingCarbonY ?? 9.0;

  const mat = new THREE.MeshPhysicalNodeMaterial({
    metalness: 0.62,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.038,
    ior: 1.54,
    specularIntensity: 1.0,
    envMapIntensity: isOpponent ? 1.45 : 2.15,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  mat.userData.allowCarProbe = true;

  // Car-frame coordinates: x across (+left), y up, z along (+nose)
  const cp = positionLocal.sub(uOrg);
  const zN = cp.z.div(uLen);
  const ax = abs(cp.x);
  const dw = min(
    length(vec2(cp.z.sub(W.frontZ), cp.y.sub(W.centreY))),
    length(vec2(cp.z.sub(W.rearZ), cp.y.sub(W.centreY))),
  );

  // Branchless wheel-arch & nose-backface cutout mask (1 = keep, 0 = discard)
  const isFront = float(frontFacing);
  const wheelDiscM = discardWheels ? fGt(ax, uWid.mul(0.22)).mul(fLt(dw, float(W.discardR))) : float(0.0);
  const backNoseDiscM = float(1.0).sub(isFront).mul(fGt(zN, float(0.30))).mul(fGt(cp.y, float(0.5)));
  const keepMask = float(1.0).sub(fOr(wheelDiscM, backNoseDiscM));

  // Base OEM metallic paint (color uniform in linear RGB)
  const paintRgb = vec3(uPaint.r, uPaint.g, uPaint.b);
  const pearlRgb = vec3(uPearl.r, uPearl.g, uPearl.b);
  const pLum = dot(paintRgb, vec3(0.299, 0.587, 0.114));
  const paintMix = smoothstep(float(0.22), float(0.68), pLum);

  const ao = mix(float(0.56), float(1.0), smoothstep(float(0.04), float(0.34), cp.y))
    .mul(mix(float(0.62), float(1.0), smoothstep(float(W.tyreR), float(W.tyreR + 0.15), dw)))
    .mul(mix(float(0.66), float(1.0), smoothstep(float(-0.55), float(0.15), normalWorld.y)));

  const ndv = clamp(abs(dot(normalize(normalView), normalize(positionViewDirection))), 0.001, 1.0);
  const flop = mix(float(0.76), float(1.12), pow(ndv, float(0.55)));
  const isGloss = fLt(uFinish, float(0.5));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let colNode: any = paintRgb.mul(mix(float(1.0), flop, isGloss));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bodyNode: any = float(1.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let metalNode: any = mix(float(0.46), float(0.28), paintMix);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roughNode: any = mix(float(0.24), float(0.34), paintMix);

  if (!isOpponent) {
    const pearlBand = smoothstep(float(-0.8), float(0.8), cp.x.mul(sign(cp.z.add(0.01))).add(cp.y.mul(0.4)));
    colNode = mix(colNode, pearlRgb, uPearlAmt.mul(pearlBand));
    const fl = h31Tsl(floor(cp.mul(1100.0)));
    const flakeMask = fLt(uFinish, float(1.5)).mul(0.65);
    colNode = colNode.mul(float(1.0).add(uFlake.mul(fl.sub(0.5)).mul(0.42).mul(flakeMask)));
    roughNode = clamp(roughNode.add(fl.sub(0.5).mul(0.04).mul(uFlake).mul(flakeMask)), 0.12, 0.90);

    // Finish overrides (1=satin, 2=matte, 3=mirror chrome)
    const mSatin = fGt(uFinish, float(0.5)).mul(fLt(uFinish, float(1.5)));
    const mMatte = fGt(uFinish, float(1.5)).mul(fLt(uFinish, float(2.5)));
    const mChrome = fGt(uFinish, float(2.5));
    metalNode = mix(mix(mix(metalNode, float(0.40), mSatin), float(0.12), mMatte), float(1.0), mChrome);
    roughNode = mix(mix(mix(roughNode, float(0.42), mSatin), float(0.78), mMatte), float(0.07), mChrome);
    bodyNode = mix(mix(mix(bodyNode, float(0.28), mSatin), float(0.0), mMatte), float(0.0), mChrome);
  }
  colNode = colNode.mul(mix(float(0.78), float(1.0), ao));

  // Optional SDF panel seam grooves (only when caller provides explicit panelBoxes)
  if (!isOpponent && opts.panelBoxes && opts.panelBoxes.min.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sd: any = float(9.0);
    const nBoxes = Math.min(4, opts.panelBoxes.min.length, opts.panelBoxes.max.length);
    for (let i = 0; i < nBoxes; i++) {
      const lo = opts.panelBoxes.min[i];
      const hi = opts.panelBoxes.max[i];
      sd = min(sd, abs(sdBoxTsl(cp, vec3(lo.x, lo.y, lo.z), vec3(hi.x, hi.y, hi.z))));
    }
    const seam = float(1.0).sub(smoothstep(float(0.0012), float(0.0028), sd));
    const bevel = smoothstep(float(0.0028), float(0.0045), sd).mul(float(1.0).sub(smoothstep(float(0.0045), float(0.009), sd)));
    colNode = mix(colNode, vec3(0.010, 0.010, 0.010), seam).mul(float(1.0).add(bevel.mul(0.16)));
    bodyNode = bodyNode.mul(float(1.0).sub(seam));
    roughNode = mix(roughNode, float(0.72), seam);
  }

  // Zone masks (layered lowest -> highest priority matching scancar.ts if/else-if chain)
  const mTrim = fOr(
    fOr(fGt(zN, float(0.44)).mul(fLt(cp.y, float(bumperFrontY))), fLt(zN, float(-0.44)).mul(fLt(cp.y, float(bumperRearY)))),
    fOr(
      fGt(ax, uWid.mul(0.32)).mul(fLt(cp.y, float(skirtY))).mul(fLt(abs(zN), float(0.30))),
      fGt(ax, uWid.mul(0.30)).mul(fLt(dw, float(W.tyreR + archLipAdd))),
    ),
  );
  const grain = h31Tsl(floor(cp.mul(420.0))).sub(0.5).mul(0.008);
  const trimCol = vec3(float(0.018).add(grain), float(0.019).add(grain), float(0.022).add(grain)).mul(mix(float(0.68), float(1.0), ao));
  colNode = mix(colNode, trimCol, mTrim);
  bodyNode = mix(bodyNode, float(0.10), mTrim);
  metalNode = mix(metalNode, float(0.12), mTrim);
  roughNode = mix(roughNode, float(0.62), mTrim);

  // Carbon rear wing
  const mCarbonWing = fLt(cp.z, float(wingCarbonZ)).mul(fGt(cp.y, float(wingCarbonY)));
  const cw = step(float(0.5), fract(cp.x.add(cp.z).mul(55.0))).mul(0.008);
  colNode = mix(colNode, vec3(float(0.022).add(cw), float(0.024).add(cw), float(0.028).add(cw)), mCarbonWing);
  bodyNode = mix(bodyNode, float(0.55), mCarbonWing);
  metalNode = mix(metalNode, float(0.28), mCarbonWing);
  roughNode = mix(roughNode, float(0.28), mCarbonWing);

  // Recessed honeycomb / chrome-slat front grille & lower intake (when not physically cut open)
  const mNose = fGt(zN, float(0.42));
  if (!hasPhysOpenings) {
    const gHalfW = grilleStyleNum > 1.5 ? uWid.mul(0.30) : uWid.mul(0.24);
    const mGrille = grilleStyleNum > 0.5
      ? mNose.mul(fLt(ax, gHalfW)).mul(fGt(cp.y, float(gLoY))).mul(fLt(cp.y, float(gHiY)))
      : float(0.0);
    const mIntake = mNose.mul(fLt(ax, uWid.mul(0.36))).mul(fGt(cp.y, float(gMinY))).mul(fLt(cp.y, float(gLoY - 0.03)));
    const mGrilleZone = fOr(mGrille, mIntake);
    const feGrille = min(min(gHalfW.sub(ax), cp.y.sub(gLoY)), float(gHiY).sub(cp.y));
    const feIntake = min(min(uWid.mul(0.36).sub(ax), cp.y.sub(gMinY)), float(gLoY - 0.03).sub(cp.y));
    const fe = mix(feIntake, feGrille, mGrille);
    const wire = smoothstep(float(0.35), float(0.43), hexEdgeTsl(vec2(cp.x, cp.y), 0.024));
    const depth = smoothstep(float(0.0), float(0.09), fe);
    const bars = mGrille.mul(smoothstep(float(0.80), float(0.94), sin(cp.y.mul(grilleStyleNum > 1.5 ? 62.0 : 95.0)).mul(0.5).add(0.5)));
    const frame = float(1.0).sub(smoothstep(float(0.014), float(0.026), fe));
    const wireBase = grilleStyleNum > 1.5 ? vec3(0.46, 0.48, 0.52) : vec3(0.28, 0.30, 0.34);
    const wireC = wireBase.mul(float(0.32).add(float(1.0).sub(depth.mul(0.65)).mul(0.68)));
    const grilleInner = mix(vec3(0.004, 0.004, 0.005), wireC, max(wire.mul(0.80), bars.mul(grilleStyleNum > 1.5 ? 0.92 : 0.65)));
    const frameC = grilleStyleNum > 1.5 ? vec3(0.22, 0.24, 0.27) : vec3(0.022, 0.024, 0.028);
    const grilleCol = mix(grilleInner, frameC, frame);
    const gWire = max(wire, bars);
    colNode = mix(colNode, grilleCol, mGrilleZone);
    bodyNode = mix(bodyNode, float(0.0), mGrilleZone);
    metalNode = mix(metalNode, mix(float(0.12), float(0.92), gWire.mul(float(1.0).sub(frame))), mGrilleZone);
    roughNode = mix(roughNode, mix(float(0.82), float(0.26), gWire), mGrilleZone);
  }

  // Recessed headlamp & taillamp housings
  const mTailL = fLt(zN, float(-0.40)).mul(fGt(ax, float(tailX0))).mul(fLt(ax, float(tailX1)))
    .mul(fGt(cp.y, float(tailY0))).mul(fLt(cp.y, float(tailY1)));
  colNode = mix(colNode, vec3(0.022, 0.005, 0.005), mTailL);
  bodyNode = mix(bodyNode, float(0.25), mTailL);
  metalNode = mix(metalNode, float(0.20), mTailL);
  roughNode = mix(roughNode, float(0.10), mTailL);

  const headYShift = ax.sub(headX0).mul(headSlope);
  const mHeadL = mNose.mul(fGt(ax, float(headX0))).mul(fLt(ax, float(headX1)))
    .mul(fGt(cp.y, float(headY0).add(headYShift))).mul(fLt(cp.y, float(headY1).add(headYShift)));
  colNode = mix(colNode, vec3(0.012, 0.014, 0.018), mHeadL);
  bodyNode = mix(bodyNode, float(0.25), mHeadL);
  metalNode = mix(metalNode, float(0.35), mHeadL);
  roughNode = mix(roughNode, float(0.10), mHeadL);

  // Smoked exterior glass (for opponent / uncut shells without separate cut glass meshes)
  if (!cuts) {
    const pSide = vec2(cp.z, cp.y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inSideM: any = float(1.0);
    const pts = spec.glass.sideWindow;
    const nPts = Math.min(8, pts.length);
    for (let i = 0; i < nPts; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % nPts];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const cross = dot(vec2(ey, -ex), pSide.sub(vec2(a[0], a[1])));
      inSideM = inSideM.mul(fLt(cross, float(0.0001)));
    }
    const windMinY = spec.glass.belt - (isOpponent ? 0.05 : 0.04);
    const rearMinY = spec.glass.belt + (isOpponent ? -0.01 : 0.04);
    const windHW = (spec.glass.windHalfW ?? 0.58) + (isOpponent ? 0.04 : 0);
    const rearHW = (spec.glass.rearHalfW ?? 0.52) + (isOpponent ? 0.05 : 0);
    const mSideG = fGt(ax, float(0.45)).mul(inSideM);
    const mWindG = fGt(cp.z, float(spec.glass.windTop)).mul(fLt(cp.z, float(spec.glass.windBase)))
      .mul(fLt(ax, float(windHW - 0.08).add(cp.z.sub(spec.glass.windTop).mul(0.13))))
      .mul(fGt(cp.y, float(windMinY)));
    const mRearG = fGt(cp.z, float(spec.glass.rearBase2)).mul(fLt(cp.z, float(spec.glass.rearTop)))
      .mul(fLt(ax, float(rearHW)))
      .mul(fGt(cp.y, float(rearMinY)));
    const mGlass = fOr(mSideG, fOr(mWindG, mRearG));
    const glassCol = mix(vec3(0.025, 0.036, 0.052), vec3(0.005, 0.007, 0.011), pow(ndv, float(0.7)));
    colNode = mix(colNode, glassCol, mGlass);
    bodyNode = mix(bodyNode, float(0.75), mGlass);
    metalNode = mix(metalNode, float(0.04), mGlass);
    roughNode = mix(roughNode, float(0.06), mGlass);
  }

  // Uncut baked wheels fallback (when discardWheels === false)
  const mWheelZone = fGt(ax, uWid.mul(0.27)).mul(fLt(dw, float(W.tyreR)));
  const mRim = mWheelZone.mul(fLt(dw, float(W.rimR)));
  const mTyre = mWheelZone.mul(fGt(dw, float(W.rimR)));
  colNode = mix(colNode, vec3(0.04, 0.04, 0.04), mRim);
  bodyNode = mix(bodyNode, float(0.0), mRim);
  metalNode = mix(metalNode, float(0.92), mRim);
  roughNode = mix(roughNode, float(0.30), mRim);

  colNode = mix(colNode, vec3(0.016, 0.016, 0.018), mTyre);
  bodyNode = mix(bodyNode, float(0.0), mTyre);
  metalNode = mix(metalNode, float(0.0), mTyre);
  roughNode = mix(roughNode, float(0.88), mTyre);

  // Subtle interior backface darkening
  colNode = colNode.mul(mix(float(0.88), float(1.0), isFront));

  mat.colorNode = colNode;
  mat.roughnessNode = clamp(roughNode.mul(0.68), 0.04, 0.96);
  mat.metalnessNode = clamp(metalNode.mul(1.22), 0.0, 1.0);
  mat.clearcoatNode = clamp(bodyNode, 0.0, 1.0);
  mat.opacityNode = keepMask;

  // Showroom clearcoat reflection layer: crisp sky/horizon dome + moving overhead streetlamp/skyline specular
  // ribbons gliding across the hood, roof & fenders as you drive through the city canyon (day & night!)
  const rdW = normalize(positionWorld.sub(cameraPosition));
  const nW = normalize(normalWorld);
  const reflW = reflect(rdW, nW);
  const envSky = mix(
    vec3(0.08, 0.10, 0.14),
    mix(vec3(0.72, 0.80, 0.92), vec3(0.24, 0.44, 0.78), smoothstep(float(0.0), float(0.60), reflW.y)),
    smoothstep(float(-0.14), float(0.10), reflW.y),
  );
  // Subtle crisp skyline & overhead street-light reflection bands moving smoothly in world space
  const streetBand = smoothstep(float(0.78), float(0.98), sin(positionWorld.x.mul(0.16).add(reflW.x.mul(4.5))).mul(sin(positionWorld.z.mul(0.16).add(reflW.z.mul(4.5)))));
  const horizonBand = smoothstep(float(-0.04), float(0.06), reflW.y).mul(float(1.0).sub(smoothstep(float(0.06), float(0.28), reflW.y)));
  const cityStreak = vec3(1.00, 0.88, 0.70).mul(streetBand.mul(smoothstep(float(0.12), float(0.72), reflW.y)).mul(0.55))
    .add(vec3(0.76, 0.86, 1.00).mul(horizonBand.mul(0.45)));
  const fresClear = float(0.04).add(pow(max(float(0.001), float(1.0).sub(ndv)), float(3.4)).mul(0.86));
  mat.emissiveNode = envSky.mul(0.22).add(cityStreak.mul(0.32)).mul(fresClear).mul(bodyNode);

  if (opts.gi) {
    enhanceMaterialWithPlaykitGi(mat, opts.gi, { detailStrength: 0, giBounceStrength: 0.03 });
  }

  return {
    material: mat,
    setPaint(o: ApexCarPaintUpdate) {
      if (o.color !== undefined) {
        const c = parseColorInput(o.color);
        uPaint.value.copy(c);
        if (o.pearl === undefined) uPearl.value.copy(c);
      }
      if (o.pearl !== undefined) {
        uPearl.value.copy(parseColorInput(o.pearl));
      }
      if (o.pearlAmount !== undefined) uPearlAmt.value = o.pearlAmount;
      if (o.flake !== undefined) uFlake.value = o.flake;
      if (o.finish !== undefined) uFinish.value = o.finish;
    },
  };
}
