import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneInst } from '../flux';
import { FluidSim } from './fluidSim';
import type { FluxDriven, FluxSpec } from '../../../../../services/fabula/fluxNode';

/**
 * Venetian Maiolica — rebuilt from the "Venetian_pottery_patterns_spinning" clips.
 *
 * A turned maiolica plate (lathe profile: well, rising rim, gold edge) in glossy cobalt glaze with
 * white / pale-blue floral bands, under studio reflections (PMREM RoomEnvironment). Over the glaze
 * flows LIQUID GOLD — a procedural height field displaced into the mesh and lit as polished metal
 * (MeshPhysicalMaterial, clearcoat glaze), so it reflects like the clips. The gold moves between
 * the clips' forms: spiral swirls with beads → sunburst spokes → kintsugi veins → filigree
 * scrollwork; on the drop the plate SHATTERS into real Voronoi shards that fly and spin, then
 * reassemble. Gold droplets splash off on kicks.
 *
 * The liquid is a real GPU fluid simulation (fluidSim.ts) living in the plate's frame: liquid gold
 * (dye R) and pale glaze marbling (dye G) are poured, swirled and dragged by the plate's spin, and the
 * velocity field warps the gold patterns so every form flows like the clips.
 *
 * The plate turns IN a pool of liquid marble, as in the clips: a second, frame-filling fluid sim whose dye
 * is true colour, seeded from frames of the clip itself (public/visualizers/venetian/pool-*.jpg) and kept
 * topped up from them while the plate's spin, kicks, voice and snares stir it. The clip's studio still is
 * the reflection environment (studio-env.jpg).
 *
 * Music: bass spins the plate and thickens the gold; kicks pulse the gold and splash beads; snares
 * kick the sunburst round; voice brightens the filigree; highs sparkle the glaze; sections every
 * 4 bars; spec.decoSeed >= 0 holds a moment (0 swirl · 1 sunburst · 2 kintsugi · 3 shatter · 4 filigree).
 */

const R = 3.2;
const POOL = 28;            // world size of the liquid-marble pool around the plate
const POOL_Y = 0.25;        // pool level: just under the plate's rim

// Pool surface: albedo is the dye's true colour; gold-ish dye reads as metal, the rest as wet glaze.
const POOL_GLSL = `
uniform sampler2D uPoolDye, uRefl; uniform float uPoolT, uHole; uniform mat4 uReflMat;
vec4 poolDye(vec2 uv){ return texture2D(uPoolDye, uv); }
float goldness(vec3 c){ return smoothstep(0.06, 0.2, c.r - c.b) * smoothstep(0.12, 0.35, c.r); }
float poolH(vec2 uv){
  vec3 c = poolDye(uv).rgb; float r = length((uv - 0.5) * ${POOL.toFixed(1)});
  return dot(c, vec3(0.3, 0.5, 0.2)) * 0.12 + goldness(c) * 0.07 + 0.05 * exp(-max(r - ${R.toFixed(2)}, 0.0) * 4.0) * uHole;
}`;
function poolMaterial(THREE: any, uniforms: any) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 0.32 });
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${POOL_GLSL}
varying vec2 vPU; varying float vPR; varying vec4 vRefl;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPU = position.xz / ${POOL.toFixed(1)} + 0.5; vPR = length(position.xz);
        transformed.y += poolH(vPU);
        vRefl = uReflMat * vec4(transformed, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${POOL_GLSL}
varying vec2 vPU; varying float vPR; varying vec4 vRefl;`)
      .replace('#include <map_fragment>', `
        if (uHole > 0.5 && vPR < ${(R * 0.985).toFixed(3)}) discard;     // the plate sits in the hole (closed when it shatters)
        vec3 PC = poolDye(vPU).rgb; float pg = goldness(PC);
        float pl = dot(PC, vec3(0.299, 0.587, 0.114));
        PC = max(vec3(0.0), mix(vec3(pl), PC, 1.35)) * 0.9;            // keep the clip's cobalt / gold saturated
        diffuseColor.rgb = mix(PC, vec3(1.0, 0.66, 0.24) * (0.55 + pl), pg);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.1, 0.2, pg);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = pg;`)
      .replace('#include <normal_fragment_maps>', `
        float pe = 1.5 / 768.0, ps = ${POOL.toFixed(1)} * 2.0 * pe;
        float phx = poolH(vPU + vec2(pe, 0.0)) - poolH(vPU - vec2(pe, 0.0));
        float phz = poolH(vPU + vec2(0.0, pe)) - poolH(vPU - vec2(0.0, pe));
        vec3 nW = normalize(vec3(-phx / ps, 1.0, -phz / ps));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Planar reflection of the plate / shards / beads, rippled by the liquid surface.
        vec4 rc = vRefl; rc.xy += nW.xz * 0.06 * rc.w;
        vec4 refl = texture2DProj(uRefl, rc);
        float fres = 0.3 + 0.7 * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        totalEmissiveRadiance += refl.rgb * refl.a * fres * mix(0.75, 1.0, pg);`);
  };
  m.customProgramCacheKey = () => 'venetian-pool';
  return m;
}
const FIELD_GLSL = `
uniform sampler2D uDye, uVel;
uniform float uTime, uSpin, uSwirl, uThick, uPulse, uWSwirl, uWSun, uWVein, uWFil, uSunRot, uVoice, uSparkle;
float vh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vh(i), vh(i + vec2(1, 0)), f.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
vec2 vor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(vh(i + g), vh(i + g + 17.0));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }
// Gold amount (x) and gold height (y) at plate coordinate p (unit disc).
vec2 goldField(vec2 p){
  vec2 fuv = p * 0.5 + 0.5;
  vec4 dye = texture2D(uDye, fuv);
  p += texture2D(uVel, fuv).xy * 0.0016;          // the liquid drags the patterns with it
  float r = length(p);
  vec2 q = vec2(cos(uSpin), sin(uSpin)) ; p = mat2(q.x, -q.y, q.y, q.x) * p;
  float a = atan(p.y, p.x);
  float g = 0.0;
  // spiral swirl with beads — fluid lag behind the plate (uSwirl)
  if (uWSwirl > 0.01) {
    vec2 w = p + (vec2(fbm(p * 2.2 + uTime * 0.15), fbm(p * 2.2 - uTime * 0.12)) - 0.5) * 0.35;
    float rw = length(w), aw = atan(w.y, w.x);
    float band = 0.5 + 0.5 * sin(aw * 3.0 + log(max(rw, 0.02)) * 5.5 - uSwirl + fbm(w * 3.0) * 2.0);
    float sw = smoothstep(0.62 - uThick * 0.12, 0.8 - uThick * 0.1, band) * smoothstep(0.02, 0.12, rw);
    vec2 vb = vor(p * 16.0 + uTime * 0.2);
    float beads = smoothstep(0.16, 0.08, vb.x) * step(0.82, vh(floor(p * 16.0 + uTime * 0.2)));
    g = max(g, (sw + beads * 0.8) * uWSwirl);
  }
  // sunburst spokes
  if (uWSun > 0.01) {
    float sp = 0.5 + 0.5 * cos((a + uSunRot) * 8.0 + sin(r * 9.0 - uTime) * 0.35);
    float sun = smoothstep(0.55, 0.72, sp) * smoothstep(0.04, 0.2, r) * smoothstep(1.0, 0.75, r);
    g = max(g, sun * uWSun);
  }
  // kintsugi veins (voronoi cell borders)
  if (uWVein > 0.01) {
    vec2 vv = vor(p * 3.6 + vec2(3.1, 1.7));
    float e = vv.y - vv.x;
    float vein = 1.0 - smoothstep(0.03 + uThick * 0.03, 0.07 + uThick * 0.04, e);
    vec2 v2 = vor(p * 9.0 + 5.0); vein = max(vein, (1.0 - smoothstep(0.02, 0.04, v2.y - v2.x)) * 0.6 * smoothstep(0.9, 0.3, r));
    g = max(g, vein * uWVein);
  }
  // filigree scrollwork (polar tiles of curls)
  if (uWFil > 0.01) {
    float sec = 6.2831853 / 12.0; float aa = mod(a, sec) - sec * 0.5;
    vec2 t = vec2(cos(aa), sin(aa)) * r - vec2(0.62, 0.0);
    float rr = length(t), ta = atan(t.y, t.x);
    float curl = abs(fract(ta / 6.2831853 - log(max(rr, 0.01)) * 0.55) - 0.5);
    float fil = smoothstep(0.09, 0.04, curl) * smoothstep(0.26, 0.05, rr);
    float ringA = 1.0 - smoothstep(0.008, 0.02, abs(r - 0.36)), ringB = 1.0 - smoothstep(0.008, 0.02, abs(r - 0.9));
    g = max(g, max(fil, max(ringA, ringB)) * uWFil * (0.75 + uVoice * 0.5));
  }
  float liquid = smoothstep(0.3, 0.42, dye.r);
  float hgt = g * (0.045 + uThick * 0.04 + uPulse * 0.03) + smoothstep(0.0, 1.4, dye.r) * 0.022;
  g = max(g, liquid);
  g = max(g, 1.0 - smoothstep(0.012, 0.022, abs(r - 0.985)));   // gilded rim
  g = clamp(g, 0.0, 1.0);
  return vec2(g, hgt);
}
// Maiolica glaze: cobalt with pale blue / white floral bands and a central rosette.
vec3 majolica(vec2 p){
  float r = length(p), a = atan(p.y, p.x);
  vec3 cob = vec3(0.006, 0.016, 0.13), mid = vec3(0.025, 0.07, 0.32), pale = vec3(0.32, 0.42, 0.72);
  float fl = 0.0;
  float ros = smoothstep(0.02, 0.0, abs(r - 0.16 - 0.04 * cos(a * 8.0)) - 0.01);
  fl = max(fl, ros);
  float band1 = smoothstep(0.012, 0.0, abs(r - 0.42) - 0.006), band2 = smoothstep(0.012, 0.0, abs(r - 0.78) - 0.006);
  float pet = smoothstep(0.08, 0.0, abs(r - 0.6 - 0.07 * cos(a * 16.0)) - 0.02) * (0.5 + 0.5 * cos(a * 16.0));
  fl = max(fl, max(band1, band2) * 0.8); fl = max(fl, pet * 0.9);
  float speck = step(0.985, vh(floor(p * 140.0)));
  vec3 c = mix(cob, mid, fbm(p * 5.0) * 0.6);
  c = mix(c, pale, fl * 0.7);
  float glaze = texture2D(uDye, p * 0.5 + 0.5).g;   // poured white/pale-blue glaze marbling
  c = mix(c, mix(pale, vec3(0.85, 0.9, 1.0), smoothstep(0.6, 1.4, glaze)), smoothstep(0.08, 0.7, glaze) * 0.85);
  return c + vec3(0.6) * speck * 0.3;
}`;

function plateMaterial(THREE: any, uniforms: any) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 0.55 });
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${FIELD_GLSL}\nvarying vec2 vP; varying vec3 vTx; varying vec3 vTz; varying vec3 vNy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vP = position.xz / ${R.toFixed(2)};
        transformed.y += goldField(vP).y;
        vTx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0)); vTz = normalize(normalMatrix * vec3(0.0, 0.0, 1.0)); vNy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIELD_GLSL}\nvarying vec2 vP; varying vec3 vTx; varying vec3 vTz; varying vec3 vNy;`)
      .replace('#include <map_fragment>', `
        vec2 GF = goldField(vP);
        float goldAmt = smoothstep(0.35, 0.6, GF.x);
        diffuseColor.rgb = mix(majolica(vP), vec3(1.0, 0.62, 0.2), goldAmt);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.13, 0.22, goldAmt) + uSparkle * 0.0;`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = goldAmt;`)
      .replace('#include <normal_fragment_maps>', `
        float eps = 0.006;
        float hx = goldField(vP + vec2(eps, 0.0)).y - goldField(vP - vec2(eps, 0.0)).y;
        float hz = goldField(vP + vec2(0.0, eps)).y - goldField(vP - vec2(0.0, eps)).y;
        float sR = ${R.toFixed(2)} * 2.0 * eps;
        vec3 nn = normalize(vNy - vTx * (hx / sR) - vTz * (hz / sR));
        normal = faceDirection * nn;`);
  };
  return m;
}

export function buildVenetian(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050a1c');
  scene.fog = new THREE.Fog('#050a1c', 14, 30);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
  const owned: any[] = []; const own = <T>(x: T) => { owned.push(x); return x; };

  // Studio reflections for the glaze and the gold.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; owned.push(env); pmrem.dispose();
    scene.environment = env;
    (scene as any).environmentIntensity = 0.45;   // the room is bright; keep the cobalt deep
  } catch { /* falls back to the lights */ }
  scene.add(own(new THREE.HemisphereLight('#aac4ff', '#0a0d18', 0.25)));
  const key = own(new THREE.DirectionalLight('#fff1d6', 1.3)); key.position.set(4, 7, 3); scene.add(key);
  const rim = own(new THREE.DirectionalLight('#7aa2ff', 1.2)); rim.position.set(-6, 3, -5); scene.add(rim);
  scene.children.forEach((o: any) => { if (o.isLight) o.layers.enable(1); });   // lights must share the reflection camera's layer

  const U = {
    uTime: { value: 0 }, uSpin: { value: 0 }, uSwirl: { value: 0 }, uThick: { value: 0.3 }, uPulse: { value: 0 },
    uWSwirl: { value: 1 }, uWSun: { value: 0 }, uWVein: { value: 0 }, uWFil: { value: 0 }, uSunRot: { value: 0 },
    uVoice: { value: 0 }, uSparkle: { value: 0 }, uDye: { value: null as any }, uVel: { value: null as any },
  };
  const fluid = new FluidSim(THREE, renderer, { simRes: 128, dyeRes: 512, velDiss: 0.35, dyeDiss: 0.32, curl: 22, iters: 16 });
  U.uDye.value = fluid.dye; U.uVel.value = fluid.velocity;

  // ── the pool of liquid marble, seeded from the clip ──
  const pool = new FluidSim(THREE, renderer, { simRes: 128, dyeRes: 768, velDiss: 0.45, dyeDiss: 0, curl: 4, iters: 12 });
  const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 }); owned.push(reflRT);
  const PU = { uPoolDye: { value: pool.dye }, uPoolT: { value: 0 }, uHole: { value: 1 }, uRefl: { value: reflRT.texture }, uReflMat: { value: new THREE.Matrix4() } };
  const poolGeo = own(new THREE.PlaneGeometry(POOL, POOL, 320, 320)); poolGeo.rotateX(-Math.PI / 2);
  const poolMesh = new THREE.Mesh(poolGeo, own(poolMaterial(THREE, PU))); poolMesh.position.y = POOL_Y; scene.add(poolMesh);
  // Planar reflection (as three's Reflector): render layer-1 objects (plate, shards, beads) from the
  // camera mirrored in the pool plane, into reflRT, just before the pool draws.
  const REFL_LAYER = 1;
  const vCam = new THREE.PerspectiveCamera(); vCam.layers.set(REFL_LAYER);
  const rN = new THREE.Vector3(0, 1, 0), rP = new THREE.Vector3(), cP = new THREE.Vector3(), rotM = new THREE.Matrix4(), look = new THREE.Vector3(), vw = new THREE.Vector3(), tg = new THREE.Vector3(), upv = new THREE.Vector3(), clr = new THREE.Color();
  let reflWanted = false, reflDirty = false;
  poolMesh.onBeforeRender = (r: any, sc: any, cam: any) => {
    if (!reflWanted) {
      if (reflDirty) { const cur0 = r.getRenderTarget(), ca0 = r.getClearAlpha(); r.getClearColor(clr); r.setRenderTarget(reflRT); r.setClearColor(0x000000, 0); r.clear(); r.setRenderTarget(cur0); r.setClearColor(clr, ca0); reflDirty = false; }
      return;
    }
    reflDirty = true;
    rP.setFromMatrixPosition(poolMesh.matrixWorld); cP.setFromMatrixPosition(cam.matrixWorld);
    vw.subVectors(rP, cP); if (vw.dot(rN) > 0) return;
    vw.reflect(rN).negate().add(rP);
    rotM.extractRotation(cam.matrixWorld); look.set(0, 0, -1).applyMatrix4(rotM).add(cP);
    tg.subVectors(rP, look).reflect(rN).negate().add(rP);
    vCam.position.copy(vw); vCam.up.set(0, 1, 0).applyMatrix4(rotM).reflect(rN); vCam.lookAt(tg);
    vCam.near = cam.near; vCam.far = cam.far; vCam.updateMatrixWorld(); vCam.projectionMatrix.copy(cam.projectionMatrix);
    PU.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vCam.projectionMatrix).multiply(vCam.matrixWorldInverse).multiply(poolMesh.matrixWorld);
    const cur = r.getRenderTarget(); if (cur) { const w = Math.max(64, cur.width >> 1), h = Math.max(64, cur.height >> 1); if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h); }
    const bg = sc.background, ac = r.autoClear, ca = r.getClearAlpha(); r.getClearColor(clr);
    sc.background = null; poolMesh.visible = false;   // fog stays on: changing it would compile new program variants
    r.setRenderTarget(reflRT); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, vCam);
    r.setRenderTarget(cur); r.setClearColor(clr, ca); r.autoClear = ac; sc.background = bg; poolMesh.visible = true;
  };
  const assetBase = (globalThis as any).__PLAJAH_ASSET_BASE ?? '/visualizers/';
  const loader = new THREE.TextureLoader();
  const poolSeeds: any[] = [null, null]; let seeded = false;
  ['pool-swirl.jpg', 'pool-filigree.jpg'].forEach((f, i) => loader.load(assetBase + 'venetian/' + f, (tx: any) => { tx.colorSpace = THREE.SRGBColorSpace; owned.push(tx); poolSeeds[i] = tx; }));
  // The clip's studio still becomes the reflection environment once it loads.
  loader.load(assetBase + 'venetian/studio-env.jpg', (tx: any) => {
    try {
      tx.colorSpace = THREE.SRGBColorSpace; tx.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer); const envT = pm.fromEquirectangular(tx).texture; pm.dispose(); tx.dispose();
      owned.push(envT); scene.environment = envT; (scene as any).environmentIntensity = 0.55;
    } catch { /* keep the room environment */ }
  });
  let poolAng = 0, seedI = 0;

  // The plate: a lathe profile (well, cavetto, rising rim) with dense geometry for the gold relief.
  const prof: any[] = [];
  const pts = [[0, 0], [0.6, 0], [0.7, 0.03], [0.8, 0.1], [0.9, 0.16], [0.97, 0.19], [1.0, 0.18], [1.0, 0.13]];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 14; k++) { const f = k / 14; prof.push(new THREE.Vector2((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f) * R + 0.0001, (pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f) * R * 0.5)); }
  prof.push(new THREE.Vector2(R, 0.13 * R * 0.5));
  prof.reverse();   // outer → inner so the lathe's front faces point up at the camera
  const plateGeo = own(new THREE.LatheGeometry(prof, 256));
  const mat = own(plateMaterial(THREE, U));
  const plateGroup = new THREE.Group(); scene.add(plateGroup);
  const plate = new THREE.Mesh(plateGeo, mat); plateGroup.add(plate); plate.layers.enable(1);
  // underside so the plate reads as an object when it tilts
  const under = new THREE.Mesh(own(new THREE.CircleGeometry(R * 0.995, 96)), own(new THREE.MeshPhysicalMaterial({ color: '#0b1640', roughness: 0.3, clearcoat: 1 })));
  under.rotation.x = Math.PI / 2; under.position.y = -0.01; plateGroup.add(under);

  // Shards: a Voronoi fracture of the disc (convex cells clipped by half-planes), extruded.
  const rnd = (() => { let s = 4242; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const seeds: number[][] = []; for (let i = 0; i < 16; i++) { const rr = Math.sqrt(rnd()) * R * 0.95, aa = rnd() * Math.PI * 2; seeds.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); }
  const circle: number[][] = []; for (let i = 0; i < 48; i++) { const aa = i / 48 * Math.PI * 2; circle.push([Math.cos(aa) * R, Math.sin(aa) * R]); }
  const clip = (poly: number[][], nx: number, ny: number, c: number) => {
    const out: number[][] = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const da = A[0] * nx + A[1] * ny - c, db = B[0] * nx + B[1] * ny - c;
      if (da <= 0) out.push(A);
      if ((da <= 0) !== (db <= 0)) { const tt = da / (da - db); out.push([A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt]); }
    }
    return out;
  };
  const shards = seeds.map((sd, i) => {
    let poly = circle.slice();
    seeds.forEach((o, j) => { if (i === j) return; const nx = o[0] - sd[0], ny = o[1] - sd[1]; const mx = (o[0] + sd[0]) / 2, my = (o[1] + sd[1]) / 2; poly = clip(poly, nx, ny, nx * mx + ny * my - 0.02); });
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = own(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 1 }));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.visible = false; m.layers.enable(1); plateGroup.add(m);
    const cx = poly.reduce((s2, p) => s2 + p[0], 0) / poly.length, cz = poly.reduce((s2, p) => s2 + p[1], 0) / poly.length;
    return { m, dir: new THREE.Vector3(cx, 0, cz).normalize(), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), up: 0.6 + rnd() * 1.2 };
  });

  // Gold droplets splashed off on kicks.
  const BEADS = 90;
  const beadMat = own(new THREE.MeshPhysicalMaterial({ color: '#ffb54a', metalness: 1, roughness: 0.16 }));
  const beads = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 16, 12)), beadMat, BEADS));
  beads.frustumCulled = false; beads.layers.enable(1); scene.add(beads);
  const bead = Array.from({ length: BEADS }, () => ({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), s: 0, life: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3();

  let last = -1, clock = 0, section = -1, mode = 'swirl', modeT = 0, spin = 0, swirl = 0, sunRot = 0, shatter = 0, prevKick = 0, prevSnare = 0, eF = 0, eS = 0, lastDrop = -99;
  const W = { swirl: 1, sun: 0, vein: 0, fil: 0 };
  const MODES = ['swirl', 'sunburst', 'kintsugi', 'swirl', 'filigree', 'shatter'];
  const HELD = ['swirl', 'sunburst', 'kintsugi', 'shatter', 'filigree'];
  const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  return {
    scene, camera,
    cam: { target: [0, 0.1, 0], radius: 8.2, pitch: 46, yaw: 0, fov: 40 },
    exposure: 1.0, brightThreshold: 0.92, grain: 0.012,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const fresh = last < 0 || t < last || t - last > 2;
      const dt = fresh ? 1 / 60 : Math.min(0.2, Math.max(0, t - last)); last = t;
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass, voice = a.voice ?? 0, tre = a.tre;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
      if (fresh) { clock = 0; section = -1; eF = eS = energy; lastDrop = -99; shatter = 0; }
      clock += dt * (0.8 + energy * 0.6);
      const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : clock * 2;
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      eF += (energy - eF) * k1(0.35); eS += (energy - eS) * k1(8);
      const drop = eF - eS > 0.25 && beats - lastDrop > 16 && beats > 8;
      if (drop) lastDrop = beats;

      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? HELD[Math.floor(spec.decoSeed) % HELD.length] : null;
      const sec = Math.floor(beats / 16);
      if (held) { if (held !== mode) { mode = held; modeT = 0; } }
      else if (sec !== section || drop) { section = sec; mode = drop ? 'shatter' : MODES[Math.max(0, sec) % MODES.length]; modeT = 0; }
      modeT += dt;

      // Gold forms cross-fade between moments.
      const tw = { swirl: mode === 'swirl' ? 1 : 0, sun: mode === 'sunburst' ? 1 : 0, vein: mode === 'kintsugi' || mode === 'shatter' ? 1 : 0, fil: mode === 'filigree' ? 1 : 0 };
      (Object.keys(W) as (keyof typeof W)[]).forEach(k => { W[k] += (tw[k] - W[k]) * k1(0.8); });

      spin += dt * (0.25 + bass * 1.6) * (mode === 'sunburst' ? 1.6 : 1);
      swirl += dt * (0.6 + bass * 2.4 + kick * 1.5);
      const snareHit = snare > 0.45 && prevSnare <= 0.45; prevSnare = snare;
      if (snareHit) sunRot += Math.PI / 8;
      const kickHit = kick > 0.55 && prevKick <= 0.55; prevKick = kick;

      U.uTime.value = t; U.uSpin.value = -spin * 0.35;   // the gold lags the plate's turn a little
      U.uSwirl.value = swirl; U.uThick.value = 0.25 + bass * 0.6 + energy * 0.3;

      // Liquid: pour, drag and swirl. Positions are in the plate's own frame (0..1 across the disc).
      const pour = (r0: number, ang: number, fTan: number, fRad: number, gold: number, glaze: number, rad: number, sw = 0) => {
        const cx = 0.5 + Math.cos(ang) * r0 * 0.5, cy = 0.5 + Math.sin(ang) * r0 * 0.5;
        fluid.splat(cx, cy, -Math.sin(ang) * fTan + Math.cos(ang) * fRad, Math.cos(ang) * fTan + Math.sin(ang) * fRad, [gold, glaze, 0, 0], rad, sw);
      };
      const fl = mode === 'kintsugi' ? 0.45 : mode === 'shatter' ? 0.3 : 1;
      // Voice: a continuous pour from a slowly orbiting spout — the main ribbon of liquid gold.
      const arm = t * (0.9 + energy * 0.8);
      pour(0.42 + Math.sin(t * 0.37) * 0.22, arm, 260 + voice * 900, 0, (0.018 + voice * 0.12) * fl, 0, 0.0009 + voice * 0.0008);
      if (mode === 'swirl' || mode === 'filigree') pour(0.62, arm + Math.PI, 220 + bass * 500, 0, 0.03 * fl, 0.05 + tre * 0.2, 0.0007);
      // Kicks: two pools of gold dropped in, each with its own vortex.
      if (kickHit) for (let n = 0; n < 2; n++) pour(0.2 + hash(t * 5 + n) * 0.6, hash(t * 9 + n) * 6.283, 0, 0, 0.7 * fl + 0.15, 0, 0.003 + kick * 0.002, (n ? -1 : 1) * (700 + bass * 900));
      // Snares: a white glaze flick (sunburst: eight radial spokes of gold).
      if (snareHit) {
        if (mode === 'sunburst') for (let n = 0; n < 8; n++) pour(0.18, sunRot + n * Math.PI / 4, 0, 900, 0.5, 0, 0.0012);
        else pour(0.3 + hash(t * 3) * 0.5, hash(t * 11) * 6.283, 600, 300, 0, 1.2, 0.0018);
      }
      if (fresh || (modeT < dt * 1.5 && !held)) fluid.fadeDye(0.5);
      // The plate turns; the liquid lags behind it (counter-spin) and bass stirs harder.
      // Pool: pick the clip frame for this moment, keep the marbling topped up from it (turning with the
      // stir so it doesn't ghost), and stir it with the music.
      const wantSeed = mode === 'filigree' || mode === 'kintsugi' ? 1 : 0;
      const stir = 50 + bass * 260 + kick * 80;
      poolAng += dt * stir * 0.0035;
      const sd = poolSeeds[wantSeed] || poolSeeds[0];
      if (sd) {
        if (!seeded) { pool.blendTexture(sd, 1, 0); seeded = true; seedI = wantSeed; }
        const switching = seedI !== wantSeed && poolSeeds[wantSeed];
        pool.blendTexture(sd, switching ? 0.06 : 0.009, -poolAng);
        if (switching && modeT > 1.2) seedI = wantSeed;
      }
      const ppour = (r0: number, ang: number, fTan: number, fRad: number, c: [number, number, number], rad: number, sw = 0) => {
        const cx = 0.5 + Math.cos(ang) * r0, cy = 0.5 + Math.sin(ang) * r0;
        pool.splat(cx, cy, -Math.sin(ang) * fTan + Math.cos(ang) * fRad, Math.cos(ang) * fTan + Math.sin(ang) * fRad, [c[0], c[1], c[2], 1], rad, sw, true);
      };
      // voice: a white glaze ribbon poured from an orbiting spout outside the plate
      if (voice > 0.12) ppour(0.17 + Math.sin(t * 0.3) * 0.05, -t * 0.7, 260 + voice * 500, 0, hash(Math.floor(t * 2)) < 0.5 ? [0.3, 0.42, 0.78] : [0.62, 0.42, 0.12], 0.00012 + voice * 0.00015);
      // kicks: molten gold dropped into the pool with a vortex
      if (kickHit) for (let n = 0; n < 2; n++) ppour(0.14 + hash(t * 3 + n) * 0.3, hash(t * 5 + n) * 6.283, 0, 0, [0.75, 0.42, 0.1], 0.0008 + kick * 0.0006, (n ? -1 : 1) * (160 + bass * 240));
      // snares: a cobalt splash thrown outward
      if (snareHit) ppour(0.13 + hash(t * 7) * 0.2, hash(t * 11) * 6.283, 200, 700, [0.03, 0.08, 0.35], 0.0006);
      pool.step(dt, { spin: -stir, drift: 18 + energy * 40, time: t });
      PU.uPoolDye.value = pool.dye; PU.uPoolT.value = t;

      fluid.step(dt, { spin: -(40 + bass * 320) * (mode === 'sunburst' ? 0.4 : 1), drift: 30 + energy * 60, time: t });
      U.uDye.value = fluid.dye; U.uVel.value = fluid.velocity;
      U.uPulse.value = kick; U.uWSwirl.value = W.swirl; U.uWSun.value = W.sun; U.uWVein.value = W.vein; U.uWFil.value = W.fil;
      U.uSunRot.value += (sunRot - U.uSunRot.value) * k1(0.12); U.uVoice.value = voice; U.uSparkle.value = tre;

      // Shatter: the plate hides, shards fly apart and spin, then fall back together.
      const shTarget = mode === 'shatter' ? (modeT < 3.5 ? 1 : 0) : 0;
      shatter += (shTarget - shatter) * k1(shTarget > shatter ? 0.18 : 0.6);
      const broken = shatter > 0.02;
      plate.visible = !broken; under.visible = !broken; PU.uHole.value = broken ? 0 : 1;
      reflWanted = broken || bead.some(b => b.life > 0);
      shards.forEach((s, i) => {
        s.m.visible = broken;
        if (!broken) return;
        const k = shatter * (1.4 + i % 3 * 0.3);
        s.m.position.set(s.dir.x * k * 2.2, Math.sin(Math.min(1, shatter) * Math.PI * 0.5) * s.up * k * 0.9, s.dir.z * k * 2.2);
        s.m.rotation.set(s.spin.x * k * 2.5, s.spin.y * k * 2, s.spin.z * k * 2.5);
      });
      plateGroup.rotation.set(Math.sin(t * 0.3) * 0.05, spin, Math.cos(t * 0.27) * 0.05);

      // Beads: splash on kicks, arc under gravity, shrink away.
      if (kickHit) for (let n = 0; n < 10; n++) {
        const b = bead[Math.floor(hash(t * 13 + n) * BEADS)];
        const ang = hash(t * 7 + n) * Math.PI * 2, rr = 0.6 + hash(t * 3 + n) * 2.2;
        b.p.set(Math.cos(ang) * rr, 0.25, Math.sin(ang) * rr);
        b.v.set(Math.cos(ang) * (0.8 + hash(n * 9.1) * 1.5), 2.2 + hash(n * 4.4) * 2.4 + bass * 2, Math.sin(ang) * (0.8 + hash(n * 2.3) * 1.5));
        b.s = 0.05 + hash(n * 5.5) * 0.08; b.life = 1;
      }
      bead.forEach((b, i) => {
        if (b.life > 0) { b.life -= dt * 0.8; b.v.y -= 9.8 * dt * 0.55; b.p.addScaledVector(b.v, dt); if (b.p.y < 0.05) { b.p.y = 0.05; b.v.y *= -0.35; b.v.x *= 0.7; b.v.z *= 0.7; } }
        const sc = b.life > 0 ? b.s * Math.min(1, b.life * 3) : 0;
        m4.compose(b.p, q.setFromEuler(e3.set(0, 0, 0)), one.set(sc, sc * (1 + Math.min(0.6, Math.abs(b.v.y) * 0.05)), sc)); beads.setMatrixAt(i, m4);
      });
      beads.instanceMatrix.needsUpdate = true;
      key.intensity = 1.2 + kick * 0.8;
    },
    bloom: (a: FluxDriven) => 0.4 + Math.min(1, a.intensity ?? 0) * 0.25,
    dispose() { owned.forEach(o => o?.dispose?.()); fluid.dispose(); pool.dispose(); },
  };
}
