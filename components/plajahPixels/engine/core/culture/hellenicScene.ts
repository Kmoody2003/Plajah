import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneInst } from '../flux';
import { buildPrecinct } from './hellenicArchitecture';
import type { FluxDriven, FluxSpec } from '../../../../../services/fabula/fluxNode';

/**
 * Hellenic Marble — rebuilt from the "Architectural_patterns_shifting" clip.
 *
 * A veined Carrara wall. Gold Greek-key meanders DRAW THEMSELVES outward from the centre in a cross
 * (tile by tile, each key traced along its own path, a glowing leading edge); a laurel wreath sweeps
 * round in raised gold; a gold inlay network spreads across the marble; a marble medallion rises out
 * of the wall carrying meander and laurel rings; fluted ionic columns and pediments rise into a
 * temple front. Physical materials (marble with clearcoat sheen, polished gold reflecting a studio
 * environment) and shadow maps.
 *
 * Music: the voice draws the meanders; kicks pulse the gold and bump the medallion; snares flash the
 * laurel; builds spread the inlay network; the drop raises the temple in a gold burst.
 * spec.decoSeed >= 0 holds a moment: 0 meander · 1 laurel · 2 inlay · 3 medallion · 4 temple.
 */

const DECOR_GLSL = `
uniform float uTime, uGrow, uWreath, uCirc, uGlow, uBurst, uLayout, uSpinM;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * nz(p); p *= 2.02; a *= 0.5; } return s; }
vec3 marble(vec2 p){
  float w = fb(p * 0.6) * 6.0;
  float v1 = pow(1.0 - abs(sin(p.x * 0.9 + p.y * 0.45 + w)), 22.0);
  float v2 = pow(1.0 - abs(sin(p.x * 2.6 - p.y * 1.7 + w * 1.6)), 40.0) * 0.6;
  float cloud = fb(p * 1.7) * 0.06;
  return vec3(0.88, 0.875, 0.86) - vec3(0.32, 0.31, 0.3) * (v1 * 0.8 + v2) - cloud;
}
// Distance to a Greek-key motif inside a unit tile, and how far along its path (0..1) that point is.
vec2 keyTile(vec2 q){
  vec2 P[9];
  P[0] = vec2(0.0, 0.08); P[1] = vec2(0.92, 0.08); P[2] = vec2(0.92, 0.92); P[3] = vec2(0.22, 0.92); P[4] = vec2(0.22, 0.36);
  P[5] = vec2(0.66, 0.36); P[6] = vec2(0.66, 0.66); P[7] = vec2(0.44, 0.66); P[8] = vec2(0.44, 0.56);
  float best = 9.0, along = 0.0, acc = 0.0, total = 4.62;
  for (int i = 0; i < 8; i++) {
    vec2 a = P[i], b = P[i + 1], ab = b - a; float L = length(ab);
    float t = clamp(dot(q - a, ab) / (L * L), 0.0, 1.0);
    float d = length(q - a - ab * t);
    if (d < best) { best = d; along = (acc + t * L) / total; }
    acc += L;
  }
  return vec2(best, along);
}
// Laurel leaves along a circle of radius R; returns leaf mask and the reveal angle param (0 bottom → 1 top).
vec2 laurel(vec2 p, float R, float leafL){
  float r = length(p), a = atan(p.x, -p.y);              // 0 at the bottom, ±pi at the top
  float side = sign(a); float aa = abs(a);
  float n = floor(aa / 0.21 + 0.5), ac = n * 0.21;
  float best = 0.0;
  for (int k = -1; k <= 1; k += 2) {
    float off = float(k) * 0.11 * R;
    vec2 c = vec2(sin(ac * side), -cos(ac * side)) * (R + off * 0.5);
    vec2 tdir = normalize(vec2(cos(ac * side) * side, sin(ac * side) * side));
    float ang = float(k) * 0.65;
    vec2 ld = vec2(tdir.x * cos(ang) - tdir.y * sin(ang), tdir.x * sin(ang) + tdir.y * cos(ang));
    vec2 d = p - c - ld * leafL * 0.5;
    vec2 lp = vec2(dot(d, ld), dot(d, vec2(-ld.y, ld.x)));
    float e = length(lp / vec2(leafL * 0.5, leafL * 0.17));
    best = max(best, 1.0 - smoothstep(0.85, 1.0, e));
  }
  float stem = 1.0 - smoothstep(0.012, 0.02, abs(r - R));
  return vec2(max(best, stem * 0.9), aa / 3.14159);
}
// Gold amount (x), raised height (y), growth glow (z) at wall / medallion coordinate p.
vec3 decor(vec2 p){
  float gold = 0.0, glow = 0.0;
  if (uLayout < 0.5) {
    // Meander cross drawing itself from the centre.
    float T = 0.62; vec2 tid = floor(p / T), q = fract(p / T);
    vec2 tc = (tid + 0.5) * T;
    bool arm = (abs(tc.y) < T * 1.6) || (abs(tc.x) < T * 1.6) || (max(abs(tc.x), abs(tc.y)) < T * 2.6);
    if (arm) {
      vec2 k = keyTile(mod(tid.x + tid.y, 2.0) < 1.0 ? q : vec2(1.0 - q.x, q.y));
      float dist = (abs(tc.x) + abs(tc.y)) / (T * 22.0);
      float param = dist + k.y * 0.035;
      float on = step(param, uGrow);
      float line = 1.0 - smoothstep(0.04, 0.06, k.x);
      gold = max(gold, line * on);
      glow = max(glow, line * exp(-pow((param - uGrow) * 60.0, 2.0)));
    }
    // Gold inlay network: grid lines with chamfered corners, spreading radially.
    float G = 1.86; vec2 g = abs(fract(p / G + 0.5) - 0.5) * G;
    float lineC = 1.0 - smoothstep(0.012, 0.024, min(g.x, g.y));
    float diag = 1.0 - smoothstep(0.012, 0.024, abs(g.x + g.y - 0.45));
    float seg = step(0.42, hh(floor(p / G + 0.5)));
    float rr = length(p) / 13.0;
    gold = max(gold, max(lineC * seg, diag * (1.0 - seg)) * step(rr, uCirc) * 0.95);
    glow = max(glow, max(lineC, diag) * exp(-pow((rr - uCirc) * 30.0, 2.0)) * step(0.001, uCirc));
    // Laurel wreath around the centre, sweeping up both sides.
    if (uWreath > 0.001) {
      vec2 lw = laurel(p, 3.0, 0.42);
      float on = step(lw.y, uWreath);
      gold = max(gold, lw.x * on);
      glow = max(glow, lw.x * exp(-pow((lw.y - uWreath) * 18.0, 2.0)));
    }
  } else {
    // Medallion: meander ring, laurel rings, rosette, rim lines — turning slowly.
    float c = cos(uSpinM), s = sin(uSpinM); p = mat2(c, -s, s, c) * p;
    float r = length(p), a = atan(p.y, p.x);
    if (r > 0.55 && r < 0.86) {
      vec2 mp = vec2((a + 3.14159) / 6.28318 * 18.0, (r - 0.55) / 0.31);
      vec2 k = keyTile(vec2(fract(mp.x), mp.y));
      gold = max(gold, 1.0 - smoothstep(0.05, 0.08, k.x));
    }
    gold = max(gold, laurel(p, 1.15, 0.2).x);
    gold = max(gold, laurel(p, 1.62, 0.22).x);
    float ros = 1.0 - smoothstep(0.02, 0.035, abs(r - 0.22 - 0.05 * cos(a * 8.0)));
    gold = max(gold, ros);
    gold = max(gold, 1.0 - smoothstep(0.012, 0.024, abs(r - 0.5)));
    gold = max(gold, 1.0 - smoothstep(0.012, 0.024, abs(r - 0.9)));
    gold = max(gold, 1.0 - smoothstep(0.015, 0.03, abs(r - 1.9)));
  }
  return vec3(gold, gold * 0.025, glow);
}`;

function decoratedMarble(THREE: any, U: any, layout: number, scale: number) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.6 });
  // Same onBeforeCompile source for both layouts — key the program by layout or three reuses the wall's.
  m.customProgramCacheKey = () => 'hellenic-decor-' + layout;
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, U, { uLayout: { value: layout } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vDP; varying vec3 vTx; varying vec3 vTy; varying vec3 vNz;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDP = (${layout < 0.5 ? 'position.xy' : 'vec2(position.x, -position.z)'}) * ${scale.toFixed(3)};
        vTx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
        vTy = normalize(normalMatrix * ${layout < 0.5 ? 'vec3(0.0, 1.0, 0.0)' : 'vec3(0.0, 0.0, -1.0)'});
        vNz = normalize(normalMatrix * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECOR_GLSL}\nvarying vec2 vDP; varying vec3 vTx; varying vec3 vTy; varying vec3 vNz;`)
      .replace('#include <map_fragment>', `
        vec3 DC = decor(vDP);
        float goldAmt = DC.x;
        diffuseColor.rgb = mix(marble(vDP * 1.3), vec3(1.0, 0.68, 0.26), goldAmt);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.34, 0.2, goldAmt);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = goldAmt;`)
      .replace('#include <normal_fragment_maps>', `
        // Screen-space bump (three's perturbNormalArb): one decor() per pixel instead of five.
        if (abs(dot(vNz, normal)) > 0.5) {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dhx = dFdx(DC.y), dhy = dFdy(DC.y);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.75, 0.38) * (DC.z * (1.6 + uGlow * 2.0) + goldAmt * uBurst * 1.5);`);
  };
  return m;
}

// Statue marble with a per-statue carve/dissolve: fragments above uReveal (feet → head) are cut away
// along a noisy edge that glows gold, so one sculpture dissolves while the next is carved up.
function statueMarble(THREE: any) {
  const U = { uReveal: { value: 1 }, uBaseY: { value: 0 }, uH: { value: 3.7 } };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWS;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWS = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DECOR_GLSL}\nuniform float uReveal, uBaseY, uH;\nvarying vec3 vWS;`)
      .replace('#include <map_fragment>', `
        float cutH = (vWS.y - uBaseY) / uH + (nz(vWS.xz * 7.0 + vWS.y * 4.0) - 0.5) * 0.1;
        float cutAt = uReveal * 1.15 - 0.05;
        if (cutH > cutAt) discard;
        diffuseColor.rgb *= marble(vWS.xy * 1.4 + vWS.z * 0.7);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.35) * smoothstep(0.07, 0.0, cutAt - cutH) * step(uReveal, 0.999) * 3.0;`);
  };
  m.customProgramCacheKey = () => 'hellenic-statue';
  m.userData.U = U;
  return m;
}

function marbleOnly(THREE: any, color = 0xffffff) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh: any) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DECOR_GLSL}\nvarying vec3 vWP;`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= marble(vWP.xy * 1.4 + vWP.z * 0.7);');
  };
  return m;
}

export function buildHellenic(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d7d2');
  scene.fog = new THREE.Fog('#e6ddd0', 26, 70);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
  const owned: any[] = []; const own = <T>(x: T) => { owned.push(x); return x; };
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch { /* */ }
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; owned.push(env); pmrem.dispose();
    scene.environment = env; (scene as any).environmentIntensity = 0.38;
  } catch { /* */ }
  scene.add(own(new THREE.HemisphereLight('#dfe8ff', '#a89c8a', 0.4)));
  const key = own(new THREE.DirectionalLight('#ffeed6', 1.9));
  key.position.set(-8, 10, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 16, bottom: -10, near: 1, far: 50 }); key.shadow.bias = -0.0005;
  scene.add(key);

  const U = { uTime: { value: 0 }, uGrow: { value: 0 }, uWreath: { value: 0 }, uCirc: { value: 0 }, uGlow: { value: 0 }, uBurst: { value: 0 }, uSpinM: { value: 0 } };
  const wallMat = own(decoratedMarble(THREE, U, 0, 1));
  const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(30, 16, 1, 1)), wallMat); wall.receiveShadow = true; scene.add(wall);
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 20)), own(marbleOnly(THREE)));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -5, 8); floor.receiveShadow = true; scene.add(floor);

  // Medallion: a marble disc that rises out of the wall carrying meander and laurel rings.
  const medMat = own(decoratedMarble(THREE, U, 1, 1 / 1.0));
  const medGeo = own(new THREE.CylinderGeometry(2.0, 2.0, 0.5, 96));
  const medallion = new THREE.Mesh(medGeo, [own(marbleOnly(THREE)), medMat, own(marbleOnly(THREE))]);
  medallion.rotation.x = Math.PI / 2; medallion.position.set(0, 0, -0.6); medallion.castShadow = true; scene.add(medallion);

  // Classical precinct: Corinthian colonnade, entablature, niches with statues, pediment (precinct module).
  const goldMat = own(new THREE.MeshPhysicalMaterial({ color: '#ffc46b', metalness: 1, roughness: 0.22, clearcoat: 0.3 }));
  const precinct = buildPrecinct(THREE, scene, own(marbleOnly(THREE, 0xf4f1ea)), own(marbleOnly(THREE, 0xb9b3aa)), goldMat, -5, () => own(statueMarble(THREE)));
  // Mediterranean sky dome, visible on the wide and low shots.
  const skyMat = own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vD; void main(){ float h = clamp(vD.y * 1.6 + 0.1, 0.0, 1.0); vec3 c = mix(vec3(0.95, 0.88, 0.78), vec3(0.42, 0.62, 0.86), pow(h, 0.7)); gl_FragColor = vec4(c, 1.0); }' }));
  scene.add(new THREE.Mesh(own(new THREE.SphereGeometry(60, 32, 16)), skyMat));

  let last = -1, clock = 0, section = -1, mode = 'meander', modeT = 0, eF = 0, eS = 0, lastDrop = -99, prevKick = 0, prevSnare = 0;
  let grow = 0, wreath = 0, circ = 0, glow = 0, burst = 0, medZ = -0.6, spinM = 0;
  const MODES = ['meander', 'laurel', 'inlay', 'medallion', 'temple'];
  return {
    scene, camera,
    cam: { target: [0, 1.2, 0], radius: 18, pitch: 5, yaw: 0, fov: 42 },
    exposure: 0.62, brightThreshold: 1.0, grain: 0.01,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const fresh = last < 0 || t < last || t - last > 2;
      const dt = fresh ? 1 / 60 : Math.min(0.2, Math.max(0, t - last)); last = t;
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass, voice = a.voice ?? 0;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
      if (fresh) { clock = 0; section = -1; eF = eS = energy; lastDrop = -99; grow = wreath = circ = 0; burst = 0; }
      clock += dt * (0.8 + energy * 0.6);
      const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : clock * 2;
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      eF += (energy - eF) * k1(0.35); eS += (energy - eS) * k1(8);
      const build = Math.min(1, Math.max(0, (eF - eS) * 4));
      const drop = eF - eS > 0.25 && beats - lastDrop > 16 && beats > 8;
      if (drop) { lastDrop = beats; burst = 1; }
      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? MODES[Math.floor(spec.decoSeed) % MODES.length] : null;
      const sec = Math.floor(beats / 16);
      if (held) { if (held !== mode) { mode = held; modeT = 0; } }
      else if (sec !== section || drop) { section = sec; mode = drop ? 'temple' : MODES[Math.max(0, sec) % MODES.length]; modeT = 0; if (mode === 'meander') grow = 0; }
      modeT += dt;

      // The meander keeps drawing while the voice sings; later moments keep it complete.
      const growRate = 0.05 + voice * 0.25 + energy * 0.05;
      grow = mode === 'meander' ? Math.min(1.2, grow + dt * growRate) : Math.min(1.2, grow + dt * 0.4);
      wreath += ((mode === 'laurel' || mode === 'medallion' || mode === 'temple' ? 1.05 : (mode === 'meander' ? 0 : wreath)) - wreath) * k1(1.6);
      circ += ((mode === 'inlay' || mode === 'temple' ? 1.1 : (mode === 'medallion' ? circ : 0)) * (0.6 + build * 0.6) - circ) * k1(1.8);
      const kickHit = kick > 0.55 && prevKick <= 0.55; prevKick = kick;
      const snareHit = snare > 0.45 && prevSnare <= 0.45; prevSnare = snare;
      glow += ((kickHit ? 1 : 0) - glow) * k1(0.15); if (snareHit) glow = 1;
      burst *= Math.exp(-dt / 0.8);
      U.uTime.value = t; U.uGrow.value = grow; U.uWreath.value = wreath; U.uCirc.value = circ; U.uGlow.value = glow + kick * 0.4; U.uBurst.value = burst;

      // Medallion rises out of the wall (and bumps on kicks); temple rises in its moment / on drops.
      const medTarget = mode === 'medallion' || mode === 'temple' ? 0.35 + kick * 0.12 : -0.6;
      medZ += (medTarget - medZ) * k1(0.35); medallion.position.z = medZ;
      spinM += dt * (0.08 + bass * 0.3); U.uSpinM.value = spinM;
      precinct.update(t, dt, { kick, bass, voice, temple: mode === 'temple' ? 1 : 0, beats, snareHit, drop, section: sec });
      goldMat.emissive.setRGB(1, 0.7, 0.3).multiplyScalar(glow * 0.6 + burst);
      key.intensity = 1.8 + bass * 0.5 + burst * 0.8;
    },
    bloom: (a: FluxDriven) => 0.3 + Math.min(1, a.intensity ?? 0) * 0.2,
    dispose() { owned.forEach(o => o?.dispose?.()); },
  };
}
