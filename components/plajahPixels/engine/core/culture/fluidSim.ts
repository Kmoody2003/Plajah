/**
 * Small GPU stable-fluids solver (semi-Lagrangian advection, vorticity confinement, Jacobi pressure)
 * shared by the culture scenes that need real liquid motion: Venetian gold/glaze flow and Japanese ink.
 *
 * Velocity lives on a coarse grid (simRes), dye on a finer one (dyeRes). Dye is RGBA half-float, so a
 * scene can carry up to four independent "inks" (e.g. gold amount, glaze tint, wetness) and read them
 * in its own material via `sim.dye`. All passes render with the scene's own WebGLRenderer and restore
 * its render target afterwards, so `step()` is safe to call from SceneInst.update().
 */

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ADVECT = `uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uDiss; varying vec2 vUv;
void main(){ vec2 p = vUv - uDt * texture2D(uVel, vUv).xy * uTexel; gl_FragColor = texture2D(uSrc, p) / (1.0 + uDiss * uDt); }`;

const CURL = `uniform sampler2D uVel; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  float L = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).x, T = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORT = `uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uCurlAmt, uDt; varying vec2 vUv;
void main(){
  float L = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x, T = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + 1e-4; f *= uCurlAmt * C; f.y *= -1.0;
  vec2 v = texture2D(uVel, vUv).xy + f * uDt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const DIVERGE = `uniform sampler2D uVel; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  float L = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).x, R = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).y, T = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).y;
  vec2 C = texture2D(uVel, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) L = -C.x; if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y - uTexel.y < 0.0) B = -C.y; if (vUv.y + uTexel.y > 1.0) T = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const PRESSURE = `uniform sampler2D uP, uDiv; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  float L = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x, T = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4((L + R + B + T - texture2D(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADSUB = `uniform sampler2D uP, uVel; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  float L = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x, T = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(texture2D(uVel, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}`;

const SCALE = `uniform sampler2D uSrc; uniform float uK; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uSrc, vUv) * uK; }`;

// Gaussian splat. uMode 0 = add, 1 = blend the colour in (dye "max"), and uSwirl adds a rotational
// component around the centre so one splat makes a vortex.
const SPLAT = `uniform sampler2D uSrc; uniform vec2 uPoint; uniform vec4 uColor; uniform float uRadius, uAspect, uSwirl, uMode; varying vec2 vUv;
void main(){
  vec2 d = vUv - uPoint; d.x *= uAspect;
  float g = exp(-dot(d, d) / uRadius);
  vec4 base = texture2D(uSrc, vUv);
  vec4 add = uColor * g; add.xy += vec2(-d.y, d.x) * uSwirl * g / sqrt(uRadius);
  gl_FragColor = uMode < 0.5 ? base + add : mix(base, max(base, uColor), g);
}`;

// Pull the dye toward an image (rotated about the centre so it can turn with a stirred pool).
const BLEND = `uniform sampler2D uSrc, uImg; uniform float uK, uRot; varying vec2 vUv;
void main(){
  vec2 d = vUv - 0.5; float c = cos(uRot), s = sin(uRot); vec2 q = vec2(c * d.x - s * d.y, s * d.x + c * d.y) + 0.5;
  vec4 img = texture2D(uImg, q);
  gl_FragColor = mix(texture2D(uSrc, vUv), vec4(img.rgb, 1.0), uK);
}`;

/** Optional extra force: a whole-field swirl / drift texture-free term (e.g. a spinning plate). */
const FORCE = `uniform sampler2D uVel; uniform vec2 uCenter; uniform float uSpin, uDrift, uDt, uTime; varying vec2 vUv;
void main(){
  vec2 v = texture2D(uVel, vUv).xy, d = vUv - uCenter;
  v += vec2(-d.y, d.x) * uSpin * uDt;
  v += vec2(sin(vUv.y * 9.0 + uTime * 0.7), cos(vUv.x * 7.0 - uTime * 0.6)) * uDrift * uDt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

export interface FluidOptions { simRes?: number; dyeRes?: number; velDiss?: number; dyeDiss?: number; curl?: number; iters?: number; aspect?: number }

export class FluidSim {
  dyeDiss: number; velDiss: number; curl: number; iters: number; aspect: number;
  private T: any; private r: any; private cam: any; private quad: any; private sceneQ: any;
  private vel: any[]; private dyeRT: any[]; private prs: any[]; private div: any; private crl: any;
  private mats: Record<string, any> = {};
  private simTexel: any; private dyeTexel: any;

  constructor(THREE: any, renderer: any, o: FluidOptions = {}) {
    this.T = THREE; this.r = renderer;
    const simRes = o.simRes ?? 128, dyeRes = o.dyeRes ?? 512;
    this.aspect = o.aspect ?? 1; this.velDiss = o.velDiss ?? 0.25; this.dyeDiss = o.dyeDiss ?? 0.05; this.curl = o.curl ?? 18; this.iters = o.iters ?? 18;
    const sw = Math.round(simRes * this.aspect), sh = simRes, dw = Math.round(dyeRes * this.aspect), dh = dyeRes;
    const rt = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });
    this.vel = [rt(sw, sh), rt(sw, sh)]; this.dyeRT = [rt(dw, dh), rt(dw, dh)]; this.prs = [rt(sw, sh), rt(sw, sh)];
    this.div = rt(sw, sh); this.crl = rt(sw, sh);
    this.simTexel = new THREE.Vector2(1 / sw, 1 / sh); this.dyeTexel = new THREE.Vector2(1 / dw, 1 / dh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.sceneQ = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.sceneQ.add(this.quad);
    const mk = (name: string, frag: string, uniforms: Record<string, any>) => {
      this.mats[name] = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    };
    mk('advect', ADVECT, { uVel: { value: null }, uSrc: { value: null }, uTexel: { value: this.simTexel }, uDt: { value: 0 }, uDiss: { value: 0 } });
    mk('curl', CURL, { uVel: { value: null }, uTexel: { value: this.simTexel } });
    mk('vort', VORT, { uVel: { value: null }, uCurl: { value: null }, uTexel: { value: this.simTexel }, uCurlAmt: { value: 0 }, uDt: { value: 0 } });
    mk('div', DIVERGE, { uVel: { value: null }, uTexel: { value: this.simTexel } });
    mk('prs', PRESSURE, { uP: { value: null }, uDiv: { value: null }, uTexel: { value: this.simTexel } });
    mk('grad', GRADSUB, { uP: { value: null }, uVel: { value: null }, uTexel: { value: this.simTexel } });
    mk('scale', SCALE, { uSrc: { value: null }, uK: { value: 0.8 } });
    mk('splat', SPLAT, { uSrc: { value: null }, uPoint: { value: new THREE.Vector2() }, uColor: { value: new THREE.Vector4() }, uRadius: { value: 0.001 }, uAspect: { value: this.aspect }, uSwirl: { value: 0 }, uMode: { value: 0 } });
    mk('blend', BLEND, { uSrc: { value: null }, uImg: { value: null }, uK: { value: 0 }, uRot: { value: 0 } });
    mk('force', FORCE, { uVel: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uSpin: { value: 0 }, uDrift: { value: 0 }, uDt: { value: 0 }, uTime: { value: 0 } });
  }

  /** Dye texture (RGBA). Read it in a material; it changes object every step, so re-assign per frame. */
  get dye() { return this.dyeRT[0].texture; }
  get velocity() { return this.vel[0].texture; }

  private pass(name: string, target: any) {
    this.quad.material = this.mats[name];
    this.r.setRenderTarget(target); this.r.render(this.sceneQ, this.cam);
  }
  private run(fn: () => void) {
    const prev = this.r.getRenderTarget(), ac = this.r.autoClear, xr = this.r.xr?.enabled;
    this.r.autoClear = false; if (this.r.xr) this.r.xr.enabled = false;
    try { fn(); } finally { this.r.setRenderTarget(prev); this.r.autoClear = ac; if (this.r.xr) this.r.xr.enabled = xr; }
  }

  /**
   * Inject velocity + dye at (x, y) in 0..1 sim space. `force` is in texels/second of the sim grid,
   * `color` adds to the dye (or blends toward it when `blend`), `radius` ~0.0005–0.01, `swirl` adds a vortex.
   */
  splat(x: number, y: number, fx: number, fy: number, color: [number, number, number, number], radius = 0.002, swirl = 0, blend = false) {
    this.run(() => {
      const m = this.mats.splat.uniforms;
      m.uPoint.value.set(x, y); m.uRadius.value = radius; m.uSwirl.value = swirl; m.uMode.value = 0;
      m.uSrc.value = this.vel[0].texture; m.uColor.value.set(fx, fy, 0, 0);
      this.pass('splat', this.vel[1]); this.vel.reverse();
      m.uSwirl.value = 0; m.uMode.value = blend ? 1 : 0;
      m.uSrc.value = this.dyeRT[0].texture; m.uColor.value.set(color[0], color[1], color[2], color[3]);
      this.pass('splat', this.dyeRT[1]); this.dyeRT.reverse();
    });
  }

  /** Advance the simulation. spin = whole-field rotation (rad/s-ish), drift = gentle ambient flow. */
  step(dt: number, opts: { spin?: number; drift?: number; time?: number; center?: [number, number] } = {}) {
    dt = Math.min(1 / 30, Math.max(0, dt)); if (dt <= 0) return;
    this.run(() => {
      const U = this.mats;
      if (opts.spin || opts.drift) {
        const f = U.force.uniforms; f.uVel.value = this.vel[0].texture; f.uSpin.value = opts.spin ?? 0; f.uDrift.value = opts.drift ?? 0;
        f.uDt.value = dt; f.uTime.value = opts.time ?? 0; if (opts.center) f.uCenter.value.set(opts.center[0], opts.center[1]);
        this.pass('force', this.vel[1]); this.vel.reverse();
      }
      U.curl.uniforms.uVel.value = this.vel[0].texture; this.pass('curl', this.crl);
      const v = U.vort.uniforms; v.uVel.value = this.vel[0].texture; v.uCurl.value = this.crl.texture; v.uCurlAmt.value = this.curl; v.uDt.value = dt;
      this.pass('vort', this.vel[1]); this.vel.reverse();
      U.div.uniforms.uVel.value = this.vel[0].texture; this.pass('div', this.div);
      U.scale.uniforms.uSrc.value = this.prs[0].texture; U.scale.uniforms.uK.value = 0.8; this.pass('scale', this.prs[1]); this.prs.reverse();
      const p = U.prs.uniforms; p.uDiv.value = this.div.texture;
      for (let i = 0; i < this.iters; i++) { p.uP.value = this.prs[0].texture; this.pass('prs', this.prs[1]); this.prs.reverse(); }
      const g = U.grad.uniforms; g.uP.value = this.prs[0].texture; g.uVel.value = this.vel[0].texture; this.pass('grad', this.vel[1]); this.vel.reverse();
      const a = U.advect.uniforms; a.uTexel.value = this.simTexel; a.uDt.value = dt;
      a.uVel.value = this.vel[0].texture; a.uSrc.value = this.vel[0].texture; a.uDiss.value = this.velDiss; this.pass('advect', this.vel[1]); this.vel.reverse();
      a.uVel.value = this.vel[0].texture; a.uSrc.value = this.dyeRT[0].texture; a.uDiss.value = this.dyeDiss; this.pass('advect', this.dyeRT[1]); this.dyeRT.reverse();
    });
  }

  /** Blend the dye toward an image texture by k (0..1), the image rotated by `rot` radians about the centre. */
  blendTexture(tex: any, k: number, rot = 0) {
    this.run(() => { const b = this.mats.blend.uniforms; b.uSrc.value = this.dyeRT[0].texture; b.uImg.value = tex; b.uK.value = Math.min(1, Math.max(0, k)); b.uRot.value = rot; this.pass('blend', this.dyeRT[1]); this.dyeRT.reverse(); });
  }

  /** Multiply the dye (fade it out quickly, e.g. on a section change). */
  fadeDye(k: number) {
    this.run(() => { const s = this.mats.scale.uniforms; s.uSrc.value = this.dyeRT[0].texture; s.uK.value = k; this.pass('scale', this.dyeRT[1]); this.dyeRT.reverse(); });
  }

  dispose() {
    [...this.vel, ...this.dyeRT, ...this.prs, this.div, this.crl].forEach(t => t.dispose());
    Object.values(this.mats).forEach(m => m.dispose()); this.quad.geometry.dispose();
  }
}
