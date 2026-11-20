// Ambient occlusion that reads the depth of what is actually on screen. The stock three.js occlusion passes re-render the scene with a plain material, which draws every
// leaf card, grass tuft and chain-link fence as a solid quad and leaves dark halos; this one takes the depth the main pass already wrote (alpha-cut leaves, grass and
// fences included) so only real geometry occludes. Half-resolution horizon-style sampling in a spiral, then a depth-aware blur at full resolution that also applies it.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const AO_FRAG = `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv; uniform mat4 uProj;
  uniform vec2 uRes; uniform float uRadius, uBias, uNear, uFar, uTime, uContactStr;
  uniform vec3 uSunDirView;
  varying vec2 vUv;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec3 viewPosFromDepth(vec2 uv, float d) {
    vec3 ndc = vec3(uv * 2.0 - 1.0, d * 2.0 - 1.0);
    float w = uProjInv[2][3] * ndc.z + uProjInv[3][3];
    float invW = 1.0 / (abs(w) < 1e-6 ? 1e-6 : w);
    return vec3(uProjInv[0][0] * ndc.x + uProjInv[3][0], uProjInv[1][1] * ndc.y + uProjInv[3][1], uProjInv[3][2]) * invW;
  }
  vec3 viewPos(vec2 uv) {
    return viewPosFromDepth(uv, texture2D(tDepth, uv).r);
  }
  void main() {
    float d0 = texture2D(tDepth, vUv).r;
    // B channel = sky occlusion mask (1.0 = sky, 0.0 = geometry) for depth-occluded volumetric sun shafts in cinePass
    if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); return; }
    vec3 P = viewPosFromDepth(vUv, d0);
    float dist = -P.z;
    if (!(dist > 0.0 && dist <= 165.0)) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
    vec2 px = 1.0 / uRes;
    // normal from the smaller depth step on each axis, so it does not smear across silhouettes
    vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0)), pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
    vec3 dx = abs(pr.z - P.z) < abs(pl.z - P.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(pd.z - P.z) ? pu - P : P - pd;
    vec3 cr = cross(dx, dy);
    float crLen = length(cr);
    vec3 N = crLen > 1e-6 ? (cr / crLen) : vec3(0.0, 0.0, 1.0);
    if (dot(N, -P) < 0.0) N = -N;
    // screen radius of uRadius metres at this depth (uRes matches half-res aoRT)
    float rpx = clamp(uRadius * uProj[1][1] * 0.5 * uRes.y / dist, 2.0, 32.0);
    float j1 = ign(gl_FragCoord.xy);
    float rot = j1 * 6.2831853;
    float occ = 0.0;
    const int N_S = 8;
    for (int i = 0; i < N_S; i++) {
      float t = (float(i) + 0.5) / float(N_S);
      float a = rot + float(i) * 2.399963;
      vec2 off = vec2(cos(a), sin(a)) * (t * t * 0.9 + 0.1) * rpx * px;
      float dQ = texture2D(tDepth, vUv + off).r;
      if (dQ >= 0.9999) continue;                                              // skip sky samples so tree crowns & car roofs never get black silhouette halos
      vec3 Q = viewPosFromDepth(vUv + off, dQ);
      vec3 v = Q - P;
      float vv = dot(v, v);
      float ndv = dot(N, v) * inversesqrt(vv + 1e-5);
      float range = 1.0 - smoothstep(uRadius * 0.55, uRadius * 1.45, sqrt(vv));
      occ += max(0.0, ndv - uBias) * range;
    }
    float ao = 1.0 - clamp(occ / float(N_S) * 2.0, 0.0, 0.92);
    ao = mix(ao, 1.0, smoothstep(85.0, 155.0, dist));

    // Screen-space contact shadow raymarch along sun vector (6 quadratic steps, half-res):
    // grounds tires, splitters, curbs, Jersey barriers and building plinths flush to asphalt.
    float cs = 1.0;
    if (uContactStr > 0.01 && dist < 68.0 && dot(N, uSunDirView) > 0.04) {
      float j2 = ign(gl_FragCoord.xy + vec2(17.0, 31.0));
      float marchLen = mix(0.65, 1.45, clamp(dist / 45.0, 0.0, 1.0));
      vec3 origin = P + N * (0.014 + dist * 0.0012);
      float thick = 0.045 + dist * 0.0065;
      float hit = 0.0;
      for (int i = 0; i < 6; i++) {
        float f = (float(i) + 0.3 + 0.7 * j2) / 6.0;
        vec3 S = origin + uSunDirView * (f * f * marchLen);
        vec4 clip = uProj * vec4(S, 1.0);
        vec2 suv = clip.xy / max(clip.w, 1e-4) * 0.5 + 0.5;
        float ds = texture2D(tDepth, clamp(suv, 0.002, 0.998)).r;
        if (S.z < -uNear && suv.x > 0.002 && suv.x < 0.998 && suv.y > 0.002 && suv.y < 0.998 && ds < 0.9998) {
          vec3 Qs = viewPosFromDepth(suv, ds);
          float dz = Qs.z - S.z;
          if (dz > 0.012 && dz < thick) {
            hit = max(hit, (1.0 - f * 0.5) * smoothstep(thick, thick * 0.25, dz));
          }
        }
      }
      hit *= (1.0 - smoothstep(42.0, 68.0, dist)) * uContactStr;
      cs = 1.0 - clamp(hit * 0.74, 0.0, 0.74);
    }

    gl_FragColor = vec4(ao, cs, 0.0, 1.0);
  }`;

const APPLY_FRAG = `
  uniform sampler2D tDiffuse, tAO, tDepth;
  uniform vec2 uHalf; uniform float uStrength, uNear, uFar;
  uniform vec4 uFog;                 // density at sea level (1/m), height falloff (1/m), max opacity, on
  uniform vec3 uFogCol, uSunCol, uSunDir, uCamPos;
  uniform mat4 uProjInv, uCamWorld, uPrevViewProj;
  uniform float uBlur;               // motion blur shutter (0 off, 0.5 = half the frame's camera motion)
  varying vec2 vUv;
  vec3 sanitizeHdr(vec3 c) {
    vec3 safe = vec3(
      (c.r >= 0.0 && c.r <= 65000.0) ? c.r : 0.0,
      (c.g >= 0.0 && c.g <= 65000.0) ? c.g : 0.0,
      (c.b >= 0.0 && c.b <= 65000.0) ? c.b : 0.0
    );
    return min(safe, vec3(48.0));
  }
  vec3 worldAt(float d) {
    vec3 ndc = vec3(vUv * 2.0 - 1.0, d * 2.0 - 1.0);
    float w = uProjInv[2][3] * ndc.z + uProjInv[3][3];
    float invW = 1.0 / (abs(w) < 1e-6 ? 1e-6 : w);
    vec3 vp = vec3(uProjInv[0][0] * ndc.x + uProjInv[3][0], uProjInv[1][1] * ndc.y + uProjInv[3][1], uProjInv[3][2]) * invW;
    return (uCamWorld * vec4(vp, 1.0)).xyz;
  }
  // Camera motion blur: where this pixel's world point was on screen last frame (depth + last frame's camera), smeared along that path.
  vec3 motionBlur(vec3 col, vec3 wp, float camDist) {
    if (uBlur < 0.001 || camDist < 9.0) return col;
    vec4 pc = uPrevViewProj * vec4(wp, 1.0);
    if (!(pc.w > 0.001)) return col;
    vec2 prev = pc.xy / pc.w * 0.5 + 0.5;
    vec2 vel = (vUv - prev) * uBlur * smoothstep(9.0, 24.0, camDist);
    float l = length(vel);
    if (!(l >= 0.0015 && l < 10.0)) return col;
    vel *= min(1.0, 0.03 / l);
    vec3 acc = col;
    for (int i = 1; i <= 6; i++) {
      float t = float(i) / 6.0 - 0.5;
      vec2 suv = clamp(vUv + vel * t, vec2(0.001), vec2(0.999));
      acc += sanitizeHdr(texture2D(tDiffuse, suv).rgb);
    }
    return acc * (1.0 / 7.0);
  }
  // Dual-layer AAA aerial perspective: cool Rayleigh height-fog + low river/valley mist + golden Mie forward-scattering toward sun.
  vec3 atmosphere(vec3 col, vec3 wp, vec3 ray, float dist) {
    if (uFog.w < 0.5) return col;
    vec3 dir = ray / max(dist, 1e-3);
    float b = uFog.y, dy = dir.y * dist;
    float seg = abs(b * dy) > 1e-4 ? (1.0 - exp(-clamp(b * dy, -30.0, 30.0))) / (b * dy) : 1.0;
    float amt = uFog.x * exp(-b * max(uCamPos.y, 0.0)) * dist * seg;
    // Valley & river low-altitude mist hugs terrain below ~48m (covered bridge, Finger Lake, canyons)
    float mb = 0.022;
    float mSeg = abs(mb * dy) > 1e-4 ? (1.0 - exp(-clamp(mb * dy, -30.0, 30.0))) / (mb * dy) : 1.0;
    float mist = uFog.x * 2.1 * exp(-mb * max(uCamPos.y, 0.0)) * dist * mSeg * smoothstep(85.0, 620.0, dist);
    float op = clamp(min(uFog.z, 1.0 - exp(-clamp(amt + mist * 0.58, 0.0, 30.0))), 0.0, 1.0);
    float sd = clamp(dot(dir, uSunDir), 0.0, 1.0);
    float sd2 = sd * sd;
    float sd3 = sd2 * sd;
    float sd6 = sd3 * sd3;
    float sd12 = sd6 * sd6;
    float sd24 = sd12 * sd12;
    float sd48 = sd24 * sd24;
    // Altitude-graded Rayleigh tint (higher distant towers & ridges pick up crisp sky-blue scatter while valley mist stays soft)
    float altTint = smoothstep(15.0, 140.0, max(wp.y, 0.0)) * 0.22;
    vec3 rayleighCol = mix(uFogCol, uFogCol * vec3(0.86, 0.94, 1.12), altTint);
    float mie = sd3 * 0.26 + sd12 * 0.56 + sd48 * 0.22;
    vec3 fc = mix(rayleighCol, uSunCol * 1.18, clamp(mie, 0.0, 0.82));
    return sanitizeHdr(mix(col, fc, op));
  }
  float lin(float d) { float z = d * 2.0 - 1.0; float denom = uFar + uNear - z * (uFar - uNear); return 2.0 * uNear * uFar / max(abs(denom), 1e-4); }
  void main() {
    vec4 col = texture2D(tDiffuse, vUv);
    col.rgb = sanitizeHdr(col.rgb);
    float dRaw = texture2D(tDepth, vUv).r;
    // Fast-exit sky pixels: sky dome already renders horizon scatter, saving inverse projections, blur & AO on ~35% of screen
    if (dRaw >= 0.99999) { gl_FragColor = vec4(col.rgb, 1.0); return; }
    vec3 wp = worldAt(dRaw);
    vec3 ray = wp - uCamPos;
    float dist = length(ray);
    col.rgb = motionBlur(col.rgb, wp, dist);
    // Beyond 158m AO is faded to 1.0: skip 8 bilateral depth/AO fetches on distant mountains, water & far skyline
    if (uStrength <= 0.001 || dist > 158.0) { gl_FragColor = vec4(atmosphere(col.rgb, wp, ray, dist), 1.0); return; }
    float d0 = lin(dRaw);
    vec2 sum = clamp(texture2D(tAO, vUv).rg, vec2(0.0), vec2(1.0)) * 1.6;
    float wsum = 1.6;
    float k = 1.0 / (0.04 * d0 * d0 + 0.01);
    vec2 taps[4];
    taps[0] = vec2(-uHalf.x, 0.0); taps[1] = vec2(uHalf.x, 0.0);
    taps[2] = vec2(0.0, -uHalf.y); taps[3] = vec2(0.0, uHalf.y);
    for (int i = 0; i < 4; i++) {
      vec2 uv = clamp(vUv + taps[i], vec2(0.001), vec2(0.999));
      float dz = lin(texture2D(tDepth, uv).r) - d0;
      float w = exp(-min(dz * dz * k, 40.0));
      sum += clamp(texture2D(tAO, uv).rg, vec2(0.0), vec2(1.0)) * w; wsum += w;
    }
    vec2 aocs = clamp(sum / max(wsum, 1e-4), vec2(0.0), vec2(1.0));
    float ao = aocs.x;
    float cs = aocs.y;
    // Physically bounced ambient tint in crevices (cool sky fill instead of muddy black crush)
    vec3 bounceAO = mix(vec3(0.28, 0.34, 0.44), vec3(1.0), ao);
    vec3 occ = mix(vec3(1.0), bounceAO, uStrength);
    // Contact shadow modulation with cool sky-ambient fill
    vec3 contactTint = mix(vec3(0.36, 0.42, 0.54), vec3(1.0), cs);
    occ *= contactTint;
    gl_FragColor = vec4(atmosphere(col.rgb * occ, wp, ray, dist), 1.0);
  }`;

export class AoPass extends Pass {
  private aoRT: THREE.WebGLRenderTarget;
  private aoMat: THREE.ShaderMaterial;
  private applyMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  /** half-res AO (r), screen-space contact shadow (g), and sky occlusion mask (b) */
  get maskTexture(): THREE.Texture { return this.aoRT.texture; }
  strength = 0.85;
  /** screen-space sun contact shadow strength (0 at night/overcast, ~0.85 in direct sun) */
  contactShadow = 0.85;
  /** ambient occlusion on/off (the pass itself stays on: it also draws the atmosphere) */
  aoOn = true;
  /** camera motion blur shutter: 0 off, 0.5 typical */
  blur = 0;
  private prevVP = new THREE.Matrix4();
  private prevPos = new THREE.Vector3();
  private sunView = new THREE.Vector3(0, 1, 0);
  private havePrev = false;
  /** height fog + sun in-scatter; colours are linear */
  fog = { on: true, density: 0.00012, falloff: 1 / 350, maxOpacity: 0.92, color: new THREE.Color(0.75, 0.8, 0.88), sunColor: new THREE.Color(1, 0.85, 0.6), sunDir: new THREE.Vector3(0, 1, 0) };
  constructor(private camera: THREE.PerspectiveCamera, w: number, h: number) {
    super();
    this.needsSwap = true;
    const aw = Math.min(960, Math.max(2, w >> 1));
    const ah = Math.min(540, Math.max(2, h >> 1));
    this.aoRT = new THREE.WebGLRenderTarget(aw, ah, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(aw, ah) }, uRadius: { value: 1.6 }, uBias: { value: 0.08 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: { value: 0 }, uSunDirView: { value: new THREE.Vector3(0, 1, 0) }, uContactStr: { value: 0.85 } },
    });
    this.applyMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: APPLY_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uPrevViewProj: { value: new THREE.Matrix4() }, uBlur: { value: 0 }, uFog: { value: new THREE.Vector4(0, 0, 0, 0) }, uFogCol: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uCamPos: { value: new THREE.Vector3() }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, tDiffuse: { value: null }, tAO: { value: this.aoRT.texture }, tDepth: { value: null }, uHalf: { value: new THREE.Vector2(1 / aw, 1 / ah) }, uStrength: { value: this.strength }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    });
    this.quad = new FullScreenQuad(this.aoMat);
  }
  setSize(w: number, h: number): void {
    const aw = Math.min(960, Math.max(2, w >> 1));
    const ah = Math.min(540, Math.max(2, h >> 1));
    this.aoRT.setSize(aw, ah);
    this.aoMat.uniforms.uRes.value.set(aw, ah);
    this.applyMat.uniforms.uHalf.value.set(1 / aw, 1 / ah);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const depth = readBuffer.depthTexture;
    const aoOn = !!depth && this.aoOn;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const u = this.aoMat.uniforms;
    u.tDepth.value = depth; u.uProj.value.copy(cam.projectionMatrix); u.uProjInv.value.copy(cam.projectionMatrixInverse); u.uNear.value = cam.near; u.uFar.value = cam.far;
    this.sunView.copy(this.fog.sunDir).normalize().transformDirection(cam.matrixWorldInverse);
    u.uSunDirView.value.copy(this.sunView);
    u.uContactStr.value = this.fog.sunDir.y > 0.03 ? this.contactShadow : 0;
    // 1) occlusion + screen-space contact shadows at half resolution from the depth the main pass wrote
    if (aoOn) {
      this.quad.material = this.aoMat;
      renderer.setRenderTarget(this.aoRT);
      this.quad.render(renderer);
    }
    // 2) depth-aware blur at full resolution, multiplied into the scene
    const a = this.applyMat.uniforms;
    a.tDiffuse.value = readBuffer.texture; a.tDepth.value = depth; a.uNear.value = cam.near; a.uFar.value = cam.far; a.uStrength.value = aoOn ? this.strength : 0;
    const f = this.fog;
    a.uFog.value.set(f.density, f.falloff, f.maxOpacity, f.on && depth ? 1 : 0); a.uFogCol.value.copy(f.color); a.uSunCol.value.copy(f.sunColor); a.uSunDir.value.copy(f.sunDir).normalize();
    a.uCamPos.value.setFromMatrixPosition(cam.matrixWorld); a.uProjInv.value.copy(cam.projectionMatrixInverse); a.uCamWorld.value.copy(cam.matrixWorld);
    // last frame's camera; a cut (the camera jumping more than 40 m) or any non-finite history matrix resets motion blur cleanly
    const prevFinite = this.havePrev && this.prevVP.elements.every(Number.isFinite) && Number.isFinite(this.prevPos.x) && Number.isFinite(a.uCamPos.value.x);
    const jump = !prevFinite || this.prevPos.distanceTo(a.uCamPos.value) > 40;
    a.uPrevViewProj.value.copy(this.prevVP); a.uBlur.value = jump || !depth ? 0 : this.blur;
    this.prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (this.prevVP.elements.every(Number.isFinite) && Number.isFinite(a.uCamPos.value.x)) {
      this.prevPos.copy(a.uCamPos.value);
      this.havePrev = true;
    } else {
      this.havePrev = false;
    }
    this.quad.material = this.applyMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose(): void { this.aoRT.dispose(); this.aoMat.dispose(); this.applyMat.dispose(); this.quad.dispose(); }
}
