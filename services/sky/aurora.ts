// Plajah Sky — aurora curtains (WebGPU / TSL), from the sky dome references (Shooter/sky domes: curtains, ribbons,
// swirls; emerald, turquoise, violet and silver).
//
// A shell at the far plane, additive over the sky and under the clouds. Each pixel walks up through a stack of thin
// layers along its view ray; in every layer the curtains are where a slowly domain-warped noise field crosses its
// middle value — so they fold, loop and curl into the vortices the art shows, and the folds drift and wave over time.
// Fine ray striations run up the curtains; each curtain is brightest at its sharp lower edge and fades upward while its
// colour climbs from the low colour (green/cyan) to the high one (violet/pink). The music's beat brightens it a little.
import * as THREE from 'three/webgpu';
import { Fn, Loop, abs, cameraPosition, exp, float, fract, mix, modelViewProjection, mx_noise_float, normalize, positionWorld, screenCoordinate, sin, dot, smoothstep, time, uniform, vec2, vec3, vec4, int } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Curtain colours from the references: [lower edge, upper fringe]. */
export const AURORA_PALETTES: Record<string, [number, number]> = {
  emerald: [0x3dff9e, 0x9a4dff],
  turquoise: [0x2ff2dc, 0x3a6dff],
  violet: [0xb46cff, 0xff62c9],
  silver: [0xe6f2ff, 0xa778ff],
  cyan: [0x40e8ff, 0x6a7dff],
};

export interface AuroraLayer {
  mesh: THREE.Mesh;
  u: { intensity: N; low: N; high: N; low2: N; beat: N; speed: N };
  /** Blend the curtain colours toward a palette (0…1 per call, for slow changes). */
  setPalette(name: string, k?: number, second?: string): void;
}

export function auroraCurtains(o: { lo?: boolean; beat?: N } = {}): AuroraLayer {
  const layers = o.lo ? 16 : 30;
  const uLayers = (uniform as N)(layers, 'int');                          // a uniform bound: no unrolling (compile time)
  const pal = AURORA_PALETTES.emerald, pal2 = AURORA_PALETTES.turquoise;
  const u = {
    intensity: uniform(1), low: uniform(new THREE.Color(pal[0])), high: uniform(new THREE.Color(pal[1])), low2: uniform(new THREE.Color(pal2[0])),
    beat: o.beat ?? uniform(0), speed: uniform(1),
  };
  const color = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const acc = vec3(0).toVar();
    const up = dir.y.max(0.04);
    const jitter = fract(sin(dot(screenCoordinate.xy, vec2(41.31, 289.17))).mul(23758.5453));
    const tt = time.mul(u.speed);
    (Loop as N)({ start: int(0), end: uLayers, type: 'int', condition: '<' }, ({ i }: N) => {
      const k = float(i).add(jitter).div(layers);                       // 0 lower edge … 1 top of the curtains
      const hgt = mix(float(1.0), float(2.6), k);
      const p = dir.xz.mul(hgt.div(up)).mul(0.95);
      // the folds: noise warped by noise, drifting — curtains loop and curl
      const w = vec2(mx_noise_float(vec3(p.mul(0.35), tt.mul(0.035))), mx_noise_float(vec3(p.mul(0.35).add(7.3), tt.mul(0.03).add(3.1))));
      const n = mx_noise_float(vec3(p.mul(0.55).add(w.mul(1.9)), tt.mul(0.02)));
      const curtain = exp(abs(n).mul(-34));                              // thin bands where the field crosses zero
      // striations running up the curtain (constant along a curtain's height, shimmering along its length)
      const rays = mx_noise_float(vec3(p.mul(5.5).add(w.mul(9)), tt.mul(0.25))).mul(0.5).add(0.5).pow(1.6).mul(1.3).add(0.15);
      const profile = exp(k.mul(-3.4)).mul(smoothstep(0.0, 0.05, k));   // sharp bright lower edge, fading up
      const second = smoothstep(0.2, 0.7, mx_noise_float(vec3(p.mul(0.12), tt.mul(0.01))).mul(0.5).add(0.5));
      const lowC = mix(u.low, u.low2, second);
      const c = mix(lowC, u.high, smoothstep(0.05, 0.75, k));
      acc.addAssign(c.mul(curtain.mul(rays).mul(profile)));
    });
    const horizon = smoothstep(0.02, 0.22, dir.y);
    const gain = u.intensity.mul(float(1).add(u.beat.mul(0.35))).mul(horizon).mul(3.2 / layers);
    return vec4(acc.mul(gain), 1);
  })();
  const m = new THREE.NodeMaterial();
  m.side = THREE.BackSide; m.depthWrite = false; m.transparent = true; m.blending = THREE.AdditiveBlending; (m as unknown as { fog: boolean }).fog = false;
  m.vertexNode = Fn(() => { const p: N = modelViewProjection; p.z.assign(p.w); return p; })();
  (m as unknown as { colorNode: N }).colorNode = color;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
  mesh.scale.setScalar(450000); mesh.frustumCulled = false; mesh.renderOrder = -8; mesh.name = 'sky-aurora';
  return {
    mesh, u,
    setPalette(name, k = 1, second) {
      const p = AURORA_PALETTES[name]; if (!p) return;
      (u.low.value as THREE.Color).lerp(new THREE.Color(p[0]), k); (u.high.value as THREE.Color).lerp(new THREE.Color(p[1]), k);
      const q = AURORA_PALETTES[second ?? name]; (u.low2.value as THREE.Color).lerp(new THREE.Color(q[0]), k);
    },
  };
}
