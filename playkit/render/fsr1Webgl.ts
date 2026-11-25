// playkit/render/fsr1Webgl.ts
//
// Shared Playkit WebGL2 AMD FidelityFX Super Resolution 1.0 (FSR 1) Pass:
//   Stage 1: EASU (Edge-Adaptive Spatial Upsampling) — 12-tap cross-neighbourhood
//            directional Lanczos2 elliptical upscaler with anti-ringing clamping.
//   Stage 2: RCAS (Robust Contrast-Adaptive Sharpening) — 5-tap edge-preserving
//            sharpening (zero ringing/halos on fine mullions, cables, and brick mortar).
//
// Matches Vesselbound's `fsr1(aaTex, 0.25)` WebGPU node (`games/rift-realm/src/post.ts`)
// so WebGL2 games running on Intel Arc / integrated GPUs can render 3D + AO + POM + Bloom
// at an adaptive internal scale (e.g. 0.72–0.88x) while presenting crisp native resolution!

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// AMD FidelityFX FSR 1.0 EASU (12-tap directional Lanczos2 + local min/max anti-ringing)
const EASU_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uInRes;
uniform vec2 uOutRes;
varying vec2 vUv;

float luma(vec3 c) { return c.b * 0.5 + (c.r * 0.5 + c.g); }

void easuSet(
  inout vec2 dir, inout float len,
  vec2 pp, bool biS, bool biT, bool biU, bool biV,
  float lA, float lB, float lC, float lD, float lE
) {
  float w = 0.0;
  if (biS) w = (1.0 - pp.x) * (1.0 - pp.y);
  if (biT) w = pp.x * (1.0 - pp.y);
  if (biU) w = (1.0 - pp.x) * pp.y;
  if (biV) w = pp.x * pp.y;

  float dc = lD - lC;
  float cb = lC - lB;
  float lenX = max(abs(dc), abs(cb));
  lenX = lenX > 1e-5 ? (1.0 / lenX) : 0.0;
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  lenX *= lenX;
  len += lenX * w;

  float ec = lE - lC;
  float ca = lC - lA;
  float lenY = max(abs(ec), abs(ca));
  lenY = lenY > 1e-5 ? (1.0 / lenY) : 0.0;
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  lenY *= lenY;
  len += lenY * w;
}

void easuTap(
  inout vec3 aC, inout float aW,
  vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c
) {
  vec2 v;
  v.x = (off.x * dir.x) + (off.y * dir.y);
  v.y = (off.x * (-dir.y)) + (off.y * dir.x);
  v *= len;
  float d2 = min(dot(v, v), clp);
  // Fast 2-lobe Lanczos2 approximation from AMD FidelityFX FSR 1.0
  float wB = 0.4 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

void main() {
  vec2 invIn = 1.0 / max(uInRes, vec2(1.0));
  vec2 pp = vUv * uInRes - 0.5;
  vec2 fp = floor(pp);
  pp -= fp;

  vec2 p0 = (fp + 0.5) * invIn;
  // 12-tap FSR 1.0 cross neighbourhood:
  //      b c
  //    e f g h
  //    i j k l
  //      n o
  vec3 b = texture2D(tDiffuse, clamp(p0 + vec2( 0.0, -1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 c = texture2D(tDiffuse, clamp(p0 + vec2( 1.0, -1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 e = texture2D(tDiffuse, clamp(p0 + vec2(-1.0,  0.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 f = texture2D(tDiffuse, clamp(p0 + vec2( 0.0,  0.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 g = texture2D(tDiffuse, clamp(p0 + vec2( 1.0,  0.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 h = texture2D(tDiffuse, clamp(p0 + vec2( 2.0,  0.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 i = texture2D(tDiffuse, clamp(p0 + vec2(-1.0,  1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 j = texture2D(tDiffuse, clamp(p0 + vec2( 0.0,  1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 k = texture2D(tDiffuse, clamp(p0 + vec2( 1.0,  1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 l = texture2D(tDiffuse, clamp(p0 + vec2( 2.0,  1.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 n = texture2D(tDiffuse, clamp(p0 + vec2( 0.0,  2.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;
  vec3 o = texture2D(tDiffuse, clamp(p0 + vec2( 1.0,  2.0) * invIn, invIn * 0.5, 1.0 - invIn * 0.5)).rgb;

  float bL = luma(b), cL = luma(c), eL = luma(e), fL = luma(f);
  float gL = luma(g), hL = luma(h), iL = luma(i), jL = luma(j);
  float kL = luma(k), lL = luma(l), nL = luma(n), oL = luma(o);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, pp, true,  false, false, false, bL, eL, fL, gL, jL);
  easuSet(dir, len, pp, false, true,  false, false, cL, fL, gL, hL, kL);
  easuSet(dir, len, pp, false, false, true,  false, fL, iL, jL, kL, nL);
  easuSet(dir, len, pp, false, false, false, true,  gL, jL, kL, lL, oL);

  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = zro ? 1.0 : inversesqrt(dirR);
  dir = zro ? vec2(1.0, 0.0) : (dir * dirR);

  len *= 0.5;
  len *= len;
  float stretch = (dir.x * dir.x + dir.y * dir.y) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / max(lob, 0.04);

  vec3 min4 = min(min(f, g), min(j, k));
  vec3 max4 = max(max(f, g), max(j, k));

  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2( 0.0, -1.0) - pp, dir, len2, lob, clp, b);
  easuTap(aC, aW, vec2( 1.0, -1.0) - pp, dir, len2, lob, clp, c);
  easuTap(aC, aW, vec2(-1.0,  0.0) - pp, dir, len2, lob, clp, e);
  easuTap(aC, aW, vec2( 0.0,  0.0) - pp, dir, len2, lob, clp, f);
  easuTap(aC, aW, vec2( 1.0,  0.0) - pp, dir, len2, lob, clp, g);
  easuTap(aC, aW, vec2( 2.0,  0.0) - pp, dir, len2, lob, clp, h);
  easuTap(aC, aW, vec2(-1.0,  1.0) - pp, dir, len2, lob, clp, i);
  easuTap(aC, aW, vec2( 0.0,  1.0) - pp, dir, len2, lob, clp, j);
  easuTap(aC, aW, vec2( 1.0,  1.0) - pp, dir, len2, lob, clp, k);
  easuTap(aC, aW, vec2( 2.0,  1.0) - pp, dir, len2, lob, clp, l);
  easuTap(aC, aW, vec2( 0.0,  2.0) - pp, dir, len2, lob, clp, n);
  easuTap(aC, aW, vec2( 1.0,  2.0) - pp, dir, len2, lob, clp, o);

  vec3 pix = clamp(aC / max(aW, 1e-5), min4, max4);
  gl_FragColor = vec4(pix, 1.0);
}
`;

// AMD FidelityFX FSR 1.0 RCAS (5-tap Robust Contrast-Adaptive Sharpening, anti-ringing)
const RCAS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uInvRes;
uniform float uSharpness;
varying vec2 vUv;

void main() {
  vec3 e = texture2D(tDiffuse, vUv).rgb;
  if (uSharpness <= 0.001) {
    gl_FragColor = vec4(e, 1.0);
    return;
  }
  vec3 b = texture2D(tDiffuse, clamp(vUv + vec2( 0.0, -uInvRes.y), uInvRes * 0.5, 1.0 - uInvRes * 0.5)).rgb;
  vec3 d = texture2D(tDiffuse, clamp(vUv + vec2(-uInvRes.x,  0.0), uInvRes * 0.5, 1.0 - uInvRes * 0.5)).rgb;
  vec3 f = texture2D(tDiffuse, clamp(vUv + vec2( uInvRes.x,  0.0), uInvRes * 0.5, 1.0 - uInvRes * 0.5)).rgb;
  vec3 h = texture2D(tDiffuse, clamp(vUv + vec2( 0.0,  uInvRes.y), uInvRes * 0.5, 1.0 - uInvRes * 0.5)).rgb;

  float bL = b.b * 0.5 + (b.r * 0.5 + b.g);
  float dL = d.b * 0.5 + (d.r * 0.5 + d.g);
  float eL = e.b * 0.5 + (e.r * 0.5 + e.g);
  float fL = f.b * 0.5 + (f.r * 0.5 + f.g);
  float hL = h.b * 0.5 + (h.r * 0.5 + h.g);

  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float rangeL = max(max(max(bL, dL), max(fL, hL)), eL) - min(min(min(bL, dL), min(fL, hL)), eL);
  nz = clamp(abs(nz) / max(rangeL, 1e-4), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;

  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 mn5 = min(mn4, e);
  vec3 mx5 = max(mx4, e);

  vec3 hitMin = mn5 / max(4.0 * mx4, vec3(1e-4));
  // Guard division sign cleanly (4 - 4*mn4 >= 0)
  vec3 lobeRgb = max(-hitMin, -(1.0 - mx5) / max(4.0 - 4.0 * mn4, vec3(1e-4)));
  float lobe = max(-0.1875, min(max(lobeRgb.r, max(lobeRgb.g, lobeRgb.b)), 0.0)) * uSharpness * nz;

  vec3 col = (lobe * (b + d + f + h) + e) / max(4.0 * lobe + 1.0, 1e-4);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface Fsr1PassOptions {
  /** RCAS sharpening strength in [0..1] (0.25 matches Vesselbound's FSR 1 profile; 0.35 for crisp architecture). */
  sharpness?: number;
}

/**
 * WebGL2 `EffectComposer` pass providing AMD FidelityFX FSR 1.0 (EASU upscale + RCAS sharpen).
 *
 * When the composer runs at a scaled internal resolution (`composer.setPixelRatio(nativePr * scale)`)
 * while the canvas remains at native resolution (`renderer.setPixelRatio(nativePr)`), placing
 * `Fsr1Pass` as the final pass upscales sharply into the full native drawing buffer with zero
 * browser CSS blur. When input resolution already matches native resolution, EASU is skipped
 * automatically and only lightweight 5-tap RCAS runs.
 */
export class Fsr1WebGLPass extends Pass {
  sharpness: number;
  private easuMat: THREE.ShaderMaterial;
  private rcasMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private easuRT: THREE.WebGLRenderTarget | null = null;
  private outSize = new THREE.Vector2();
  lastUpscaled = false;

  constructor(opts: Fsr1PassOptions = {}) {
    super();
    this.needsSwap = true;
    this.sharpness = opts.sharpness ?? 0.32;

    this.easuMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: EASU_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uInRes: { value: new THREE.Vector2(1, 1) },
        uOutRes: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.rcasMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: RCAS_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uInvRes: { value: new THREE.Vector2(1, 1) },
        uSharpness: { value: this.sharpness },
      },
    });
    this.quad = new FullScreenQuad(this.rcasMat);
  }

  private ensureEasuTarget(w: number, h: number): THREE.WebGLRenderTarget {
    if (!this.easuRT) {
      this.easuRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    } else if (this.easuRT.width !== w || this.easuRT.height !== h) {
      this.easuRT.setSize(w, h);
    }
    return this.easuRT;
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const inW = Math.max(1, readBuffer.width);
    const inH = Math.max(1, readBuffer.height);
    const outTarget = this.renderToScreen ? null : writeBuffer;

    let outW: number;
    let outH: number;
    if (outTarget) {
      outW = Math.max(1, outTarget.width);
      outH = Math.max(1, outTarget.height);
    } else {
      renderer.getDrawingBufferSize(this.outSize);
      outW = Math.max(1, Math.floor(this.outSize.x));
      outH = Math.max(1, Math.floor(this.outSize.y));
    }

    const needsUpscale = inW < outW - 1 || inH < outH - 1;
    this.lastUpscaled = needsUpscale;

    if (needsUpscale) {
      // Stage 1: Edge-Adaptive Spatial Upsampling (internal res -> native res)
      const rt = this.ensureEasuTarget(outW, outH);
      this.easuMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.easuMat.uniforms.uInRes.value.set(inW, inH);
      this.easuMat.uniforms.uOutRes.value.set(outW, outH);
      this.quad.material = this.easuMat;
      renderer.setRenderTarget(rt);
      this.quad.render(renderer);

      // Stage 2: Robust Contrast-Adaptive Sharpening (native res -> screen)
      this.rcasMat.uniforms.tDiffuse.value = rt.texture;
      this.rcasMat.uniforms.uInvRes.value.set(1 / outW, 1 / outH);
      this.rcasMat.uniforms.uSharpness.value = this.sharpness;
      this.quad.material = this.rcasMat;
      renderer.setRenderTarget(outTarget);
      this.quad.render(renderer);
    } else {
      // Native resolution: skip EASU and run lightweight 5-tap RCAS directly to screen
      this.rcasMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.rcasMat.uniforms.uInvRes.value.set(1 / inW, 1 / inH);
      this.rcasMat.uniforms.uSharpness.value = this.sharpness * 0.72;
      this.quad.material = this.rcasMat;
      renderer.setRenderTarget(outTarget);
      this.quad.render(renderer);
    }
  }

  dispose(): void {
    this.easuRT?.dispose();
    this.easuRT = null;
    this.easuMat.dispose();
    this.rcasMat.dispose();
    this.quad.dispose();
  }
}
