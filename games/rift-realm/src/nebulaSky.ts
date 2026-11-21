// Elderwood Hollow's sky: a colour nebula across the heavens, aurora curtains rippling over the treeline, stars and a
// pale moon — and the sky IS the lighting: the same function feeds the background, a baked environment map (so every
// surface reflects the nebula and is lit by its colours) and the coloured lights that follow the aurora as it breathes.
//
// All procedural (TSL): direction → colour. Nebula = domain-warped fractal noise concentrated along a tilted galactic
// band, coloured magenta → violet → cyan by two more noise fields, with dark dust lanes and bright knots. Aurora = two
// curtains (green-cyan at the foot, violet at the crown) whose foot wanders round the horizon, with vertical rays
// drifting along them. Stars = hashed direction cells, twinkling. Moon = a cratered disc in the moonlight's direction.
import * as THREE from 'three/webgpu';
import {
  abs, atan, cameraPosition, clamp, color, cos, densityFogFactor, dot, fog, exp, float, floor, fract, length, max, mix, mx_fractal_noise_float, normalize,
  pmremTexture, positionWorld, positionWorldDirection, pow, sin, smoothstep, time, uniform, vec3,
} from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface NebulaSkyOptions {
  /** Unit vector toward the moon (the moonlight's direction). */
  moonDir: THREE.Vector3;
  /** Azimuths (radians, atan2(x, z)) of the two aurora curtains' centres. */
  auroraAz?: [number, number];
  beat?: N;
}

const AURORA_A = 0x38ffb8, AURORA_B = 0x9a48ff, NEB_MAGENTA = 0xd048ff, NEB_CYAN = 0x30d8ff, NEB_VIOLET = 0x5a3cff;

/** How bright each aurora curtain is at time t (s) — the shader and the lights share this rhythm. */
export function auroraPulse(t: number, k: number) {
  return 0.65 + 0.25 * Math.sin(t * 0.23 + k * 2.1) + 0.1 * Math.sin(t * 0.71 + k * 4.3);
}

export function nebulaSky(o: NebulaSkyOptions) {
  const md = o.moonDir.clone().normalize();
  const moon: N = uniform(md);
  const beat: N = o.beat ?? uniform(0);
  const [azA, azB] = o.auroraAz ?? [0.6, -2.2];

  const sky = (dirIn: N): N => {
    const dir: N = normalize(dirIn), el: N = dir.y;
    // ── base: deep indigo zenith → teal horizon glow over the forest → dark below ──
    const zen: N = mix(color(0x0e3440), color(0x060a1e), smoothstep(float(-0.02), float(0.65), el));
    let c: N = mix(color(0x04100c), zen, smoothstep(float(-0.12), float(0.02), el));
    c = c.add(color(0x1a6a6a).mul(exp(abs(el).mul(-14)).mul(0.35)));
    // ── nebula: warped fractal noise along a tilted band ──
    const bandN: N = normalize(vec3(0.35, 0.82, -0.45));
    const band: N = exp(pow(dot(dir, bandN), 2).mul(-5.5));
    const p: N = dir.mul(2.1);
    const warp: N = vec3(mx_fractal_noise_float(p.add(3.1), 3, 2.0, 0.5), mx_fractal_noise_float(p.add(7.7), 3, 2.0, 0.5), mx_fractal_noise_float(p.add(12.4), 3, 2.0, 0.5));
    const q: N = p.add(warp.mul(1.3));
    const n1: N = mx_fractal_noise_float(q, 5, 2.1, 0.55).mul(0.5).add(0.5);
    const n2: N = mx_fractal_noise_float(q.mul(1.7).add(5.3), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const n3: N = mx_fractal_noise_float(q.mul(3.1).add(9.1), 4, 2.0, 0.5).mul(0.5).add(0.5);
    const dens: N = smoothstep(float(0.38), float(0.85), n1).mul(band.mul(0.85).add(0.15)).mul(smoothstep(float(-0.05), float(0.25), el));
    const hue: N = mix(mix(color(NEB_VIOLET), color(NEB_MAGENTA), smoothstep(float(0.35), float(0.75), n2)), color(NEB_CYAN), smoothstep(float(0.55), float(0.85), n3).mul(0.7));
    const dust: N = smoothstep(float(0.52), float(0.72), n3).mul(dens).mul(0.75);
    c = c.add(hue.mul(pow(dens, 1.4).mul(0.95))).mul(float(1).sub(dust));
    c = c.add(mix(hue, color(0xffffff), 0.5).mul(pow(dens, 5).mul(1.6)));          // bright knots
    // ── stars: hashed cells, dimmer behind the nebula, twinkling ──
    const sp: N = dir.mul(170), cell: N = floor(sp), f: N = fract(sp).sub(0.5);
    const h: N = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const star: N = step997(h).mul(smoothstep(float(0.28), float(0.0), length(f))).mul(sin(time.mul(2.7).add(h.mul(90))).mul(0.35).add(0.75));
    c = c.add(mix(color(0xbfe0ff), color(0xffe6c8), fract(h.mul(7.3))).mul(star.mul(float(1).sub(dens.mul(0.7))).mul(1.6)).mul(smoothstep(float(-0.02), float(0.1), el)));
    // ── aurora: two curtains whose foot wanders round the horizon, rays drifting along them ──
    const az: N = atan(dir.x, dir.z);
    const curtain = (azC: number, k: number, ca: number, cb: number) => {
      const dAz: N = atan(sin(az.sub(azC)), cos(az.sub(azC)));   // azimuth offset, wrapped to ±π
      const win: N = smoothstep(float(1.25), float(0.3), abs(dAz));
      const fold: N = sin(dAz.mul(5).add(time.mul(0.12 + k * 0.05)).add(k * 3)).mul(0.035).add(sin(dAz.mul(13).sub(time.mul(0.2))).mul(0.012));
      const foot: N = float(0.08 + k * 0.05).add(fold);
      const up: N = el.sub(foot);
      const body: N = smoothstep(float(-0.004), float(0.02), up).mul(exp(up.mul(-6.5))).mul(smoothstep(float(0.5), float(0.15), up));
      const rays: N = mx_fractal_noise_float(vec3(dAz.mul(26).add(time.mul(0.25)), up.mul(1.2), time.mul(0.06).add(k * 10)), 3, 2.0, 0.5).mul(0.5).add(0.5);
      const ray: N = smoothstep(float(0.35), float(0.8), rays);
      const breathe: N = sin(time.mul(0.23).add(k * 2.1)).mul(0.25).add(sin(time.mul(0.71).add(k * 4.3)).mul(0.1)).add(0.65).add(beat.mul(0.25));
      const col: N = mix(color(ca), color(cb), smoothstep(float(0.0), float(0.28), up));
      return col.mul(body.mul(ray.mul(0.8).add(0.25)).mul(win).mul(breathe).mul(1.5));
    };
    c = c.add(curtain(azA, 0, AURORA_A, AURORA_B)).add(curtain(azB, 1, 0x40e8ff, 0xd04aff).mul(0.8));
    // ── moon: a cratered disc with a soft halo, where the moonlight comes from ──
    const dm: N = dot(dir, moon);
    const disc: N = smoothstep(float(0.99935), float(0.99955), dm);
    const crat: N = mx_fractal_noise_float(dir.mul(260), 3, 2.0, 0.5).mul(0.5).add(0.5);
    c = mix(c, color(0xdcecff).mul(crat.mul(0.35).add(0.75)), disc);
    c = c.add(color(0x9ac8ff).mul(pow(max(dm, float(0)), float(900)).mul(0.6).add(pow(max(dm, float(0)), float(18)).mul(0.07))));
    return clamp(c, float(0), float(8));
  };

  const node: N = sky(positionWorldDirection);

  /** Background + baked environment (reflections and image-based light from the same sky). Call once the renderer is up. */
  const apply = (scene: THREE.Scene) => { (scene as unknown as { backgroundNode: N }).backgroundNode = node; };
  const bakeEnvironment = (renderer: THREE.WebGPURenderer, scene: THREE.Scene, intensity = 1) => {
    const s = new THREE.Scene();
    (s as unknown as { backgroundNode: N }).backgroundNode = node;
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(s, 0.02, 0.1, 100);
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    pm.dispose();
  };
  /** Lights that come from the sky: the two aurora curtains' coloured glow (they breathe with the curtains). */
  const lights = (group: THREE.Object3D) => {
    const mk = (az: number, col: number) => {
      const l = new THREE.DirectionalLight(col, 0);
      l.position.set(Math.sin(az) * 100, 38, Math.cos(az) * 100);
      group.add(l);
      return l;
    };
    const a = mk(azA, AURORA_A), b = mk(azB, 0x40e8ff);
    return (t: number, beatV = 0) => { a.intensity = 1.1 * auroraPulse(t, 0) + beatV * 0.3; b.intensity = 0.7 * auroraPulse(t, 1) + beatV * 0.2; };
  };
  /** Fog that fades into the (blurred) sky in each view direction, not a flat colour: far trees melt into the nebula
   *  and aurora behind them instead of turning into dark cut-outs. Needs the baked environment. */
  const fogNode = (env: THREE.Texture, density: number, k = 0.85): N => {
    const d: N = normalize(positionWorld.sub(cameraPosition));
    const dir: N = normalize(vec3(d.x, max(d.y, float(0.05)), d.z));
    return fog((pmremTexture(env as N, dir, float(0.55)) as N).mul(k), densityFogFactor(float(density)));
  };
  return { node, apply, bakeEnvironment, lights, fogNode, horizon: new THREE.Color(0x0f3038) };
}

/** 1 for roughly 0.3% of cells (the stars). */
function step997(h: N): N { return smoothstep(float(0.9965), float(0.9975), h); }
