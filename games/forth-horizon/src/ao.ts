// Ambient occlusion that reads the depth of what is actually on screen. The stock three.js occlusion passes re-render the scene with a plain material, which draws every
// leaf card, grass tuft and chain-link fence as a solid quad and leaves dark halos; this one takes the depth the main pass already wrote (alpha-cut leaves, grass and
// fences included) so only real geometry occludes. Half-resolution horizon-style sampling in a spiral, then a depth-aware blur at full resolution that also applies it.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const AO_FRAG = `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv; uniform mat4 uProj;
  uniform vec2 uRes; uniform float uRadius, uBias, uNear, uFar, uTime;
  varying vec2 vUv;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
  void main() {
    float d0 = texture2D(tDepth, vUv).r;
    if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv);
    float dist = -P.z;
    if (dist > 220.0) { gl_FragColor = vec4(1.0); return; }
    vec2 px = 1.0 / uRes;
    // normal from the smaller depth step on each axis, so it does not smear across silhouettes
    vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0)), pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
    vec3 dx = abs(pr.z - P.z) < abs(pl.z - P.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(pd.z - P.z) ? pu - P : P - pd;
    vec3 N = normalize(cross(dx, dy));
    if (dot(N, -P) < 0.0) N = -N;
    // screen radius of uRadius metres at this depth
    float rpx = clamp(uRadius * uProj[1][1] * 0.5 * uRes.y / dist, 3.0, 70.0);
    float rot = ign(gl_FragCoord.xy) * 6.2831853;
    float occ = 0.0;
    const int N_S = 14;
    for (int i = 0; i < N_S; i++) {
      float t = (float(i) + 0.5) / float(N_S);
      float a = rot + float(i) * 2.399963;
      vec2 off = vec2(cos(a), sin(a)) * (t * t * 0.9 + 0.1) * rpx * px;
      vec3 Q = viewPos(vUv + off);
      vec3 v = Q - P;
      float vv = dot(v, v);
      float ndv = dot(N, v) * inversesqrt(vv + 1e-5);
      float range = 1.0 - smoothstep(uRadius * 0.6, uRadius * 1.6, sqrt(vv));      // ignore things far in front or behind: no halo around silhouettes
      occ += max(0.0, ndv - uBias) * range;
    }
    float ao = 1.0 - clamp(occ / float(N_S) * 2.2, 0.0, 1.0);
    ao = mix(ao, 1.0, smoothstep(120.0, 220.0, dist));
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }`;

const APPLY_FRAG = `
  uniform sampler2D tDiffuse, tAO, tDepth;
  uniform vec2 uHalf; uniform float uStrength, uNear, uFar;
  varying vec2 vUv;
  float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  void main() {
    vec4 col = texture2D(tDiffuse, vUv);
    float d0 = lin(texture2D(tDepth, vUv).r);
    float sum = 0.0, wsum = 0.0;
    for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uHalf;
      float dz = abs(lin(texture2D(tDepth, uv).r) - d0);
      float w = exp(-dz * dz / (0.04 * d0 * d0 + 0.01)) * (1.0 - 0.12 * length(vec2(float(x), float(y))));
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    float ao = sum / max(wsum, 1e-4);
    // occlusion darkens the ambient part of the light most; applied to the final colour it is slightly strong, so keep it soft and tinted warm-dark rather than grey
    vec3 occ = mix(vec3(1.0), vec3(ao) * vec3(0.96, 0.97, 1.0), uStrength);
    gl_FragColor = vec4(col.rgb * occ, col.a);
  }`;

export class AoPass extends Pass {
  private aoRT: THREE.WebGLRenderTarget;
  private aoMat: THREE.ShaderMaterial;
  private applyMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  strength = 0.85;
  constructor(private camera: THREE.PerspectiveCamera, w: number, h: number) {
    super();
    this.needsSwap = true;
    this.aoRT = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(w, h) }, uRadius: { value: 1.6 }, uBias: { value: 0.08 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: { value: 0 } },
    });
    this.applyMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: APPLY_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, tAO: { value: this.aoRT.texture }, tDepth: { value: null }, uHalf: { value: new THREE.Vector2(2 / w, 2 / h) }, uStrength: { value: this.strength }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
    });
    this.quad = new FullScreenQuad(this.aoMat);
  }
  setSize(w: number, h: number): void {
    this.aoRT.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.aoMat.uniforms.uRes.value.set(w, h);
    this.applyMat.uniforms.uHalf.value.set(2 / w, 2 / h);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const depth = readBuffer.depthTexture;
    if (!depth || !this.enabled) { this.quad.material = this.applyMat; this.applyMat.uniforms.uStrength.value = 0; }
    const cam = this.camera;
    cam.updateMatrixWorld();
    const u = this.aoMat.uniforms;
    u.tDepth.value = depth; u.uProj.value.copy(cam.projectionMatrix); u.uProjInv.value.copy(cam.projectionMatrixInverse); u.uNear.value = cam.near; u.uFar.value = cam.far;
    // 1) occlusion at half resolution from the depth the main pass wrote
    if (depth && this.enabled) {
      this.quad.material = this.aoMat;
      renderer.setRenderTarget(this.aoRT);
      this.quad.render(renderer);
    }
    // 2) depth-aware blur at full resolution, multiplied into the scene
    const a = this.applyMat.uniforms;
    a.tDiffuse.value = readBuffer.texture; a.tDepth.value = depth; a.uNear.value = cam.near; a.uFar.value = cam.far; a.uStrength.value = depth && this.enabled ? this.strength : 0;
    this.quad.material = this.applyMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose(): void { this.aoRT.dispose(); this.aoMat.dispose(); this.applyMat.dispose(); this.quad.dispose(); }
}
