// Creek and swamp water for the Elderwood Wilds (river, pool stream, the vale slough). Kenne via the shooter session
// (2026-11-22): "make the water look and move like a real creek or river, at least as good as the water in Apex".
//
// Apex (forth-horizon/src/water.ts) reads a baked flow map (current, depth, shoreline) and advects tileable ripple
// normals along it in two cross-fading phases, tints by depth, mirrors the sky with Fresnel plus sun glints, foams the
// banks and the fast water, feathers the shoreline by depth and draws rain rings. Here the same model rides the river
// ribbons themselves: every vertex carries its current (m/s), white water (rapids, rocks, falls), depth over the bed
// and closeness to the bank (`wflow`) and its downstream direction (`wdir`), baked by world/water.ts from the RIVER
// spline and the terrain. Beyond Apex, the high tier
//   • refracts the real bed through the surface (the scene behind the water, offset by the ripples) and absorbs it by
//     the water's real thickness from the depth buffer: clear and shallow at the edges, teal-dark in the pools;
//   • reflects the banks and trees by marching the reflected ray through the depth buffer (screen-space), falling back
//     to the sky (the level's night sky blended to a day sky with the clock);
//   • draws caustics on the shallow bed.
// The low tier keeps Apex's cheaper model: the baked depth tints and fades the water, the sky is the reflection.
// Swamp water (riftSwamp) is the opposite: still, murky (you see a hand's depth into it), dull, scum and duckweed
// drifting on it with the wind.
import * as THREE from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, attribute, cameraFar, cameraNear, cameraPosition, cameraProjectionMatrix, clamp, color, dot, exp, float, floor, fract, length, max, min, mix,
  mx_noise_float, normalize, perspectiveDepthToViewZ, positionView, positionViewDirection, positionWorld, pow, reflect, screenUV, select, sin, smoothstep, step,
  texture, time, transformNormalToView, uniform, uv, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import { onWaterSky, rippleTexture, waterSkyAt } from './water';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const dbgView = uniform(0);

/** World state the creek and swamp materials read (world/water.ts updates it each frame from the sky cycle). */
export const waterEnv = {
  /** 0 night … 1 full day: blends the reflected sky from the level's night sky to a day sky. */
  day: uniform(0),
  sunDir: uniform(new THREE.Vector3(0.6, 0.55, -0.58).normalize()),
  sunCol: uniform(new THREE.Color(1, 0.94, 0.83)),
  /** Haze at the horizon and the zenith colour of the day sky (reflections). */
  haze: uniform(new THREE.Color(0xa4b8b4)),
  zenith: uniform(new THREE.Color(0x5a86b8)),
  /** Light on the water body 0…1 (the sun by day, the moon and aurora at night). */
  light: uniform(0.35),
  /** Wind 0…1 (chop on still water, drift), rain 0…1 (rings). */
  wind: uniform(0.25),
  rain: uniform(0),
};

/** The day sky along a direction: haze at the horizon → zenith blue, a warm glow round the sun. */
function daySky(r: N): N {
  const up: N = clamp(r.y, 0, 1);
  const base: N = mix(waterEnv.haze, waterEnv.zenith, pow(up, float(0.6)));
  const s: N = max(dot(r, waterEnv.sunDir), 0);
  return base.add(waterEnv.sunCol.mul(pow(s, float(6)).mul(0.35).add(pow(s, float(400)).mul(4))));
}
/** The sky the water mirrors: the level's own sky (setWaterSky) at night, the day sky by day. */
function mirrorSky(r: N): N {
  const at = waterSkyAt();
  return at ? mix(at(r), daySky(r), waterEnv.day) : daySky(r);
}
const hash2 = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

/** Rain rings (Apex): a ring expanding in each 1.8 m cell now and then, as a slope to add to the ripples. */
function rainRings(q: N): N {
  const g: N = q.mul(0.55), id: N = floor(g), f: N = fract(g).sub(0.5);
  const t: N = fract(time.mul(0.85).add(hash2(id)));
  const r: N = length(f);
  const ring: N = smoothstep(0.045, 0.0, abs(r.sub(t.mul(0.46)))).mul(float(1).sub(t)).mul(step(hash2(id.add(7)), waterEnv.rain));
  return normalize(f.add(1e-4)).mul(ring).mul(0.9);
}

/** Metres from the camera to the first opaque surface behind screen point `suv` (view-axis distance). */
const sceneDist = (suv: N): N => perspectiveDepthToViewZ(viewportDepthTexture(suv), cameraNear, cameraFar).negate();

/** High tier: march the reflected view ray through the depth buffer. Returns vec4(colour, hit 0…1). */
function ssr(nView: N, steps: number): N {
  return Fn(() => {
    const P0: N = positionView;
    const R: N = reflect(normalize(P0), nView).toVar();
    const hit: N = float(0).toVar(), huv: N = vec2(0.5).toVar();
    // per-pixel jitter on the start breaks the step bands up into fine noise
    const jit: N = hash2(screenUV.mul(vec2(1731.3, 1199.7)).add(fract(time.mul(7.13))));
    const t: N = float(0.25).add(jit.mul(0.4)).toVar(), stp: N = float(0.4).toVar();
    const project = (p: N): N => { const c: N = cameraProjectionMatrix.mul(vec4(p.x, p.y, p.z, 1)); const ndc: N = c.xy.div(c.w); return vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5)); };
    // a ray turning back toward the camera meets nothing on screen
    If(R.z.lessThan(0.3), () => {
      Loop(steps, () => {
        const p: N = P0.add(R.mul(t));
        const suv: N = project(p);
        If(suv.x.lessThan(0).or(suv.x.greaterThan(1)).or(suv.y.lessThan(0)).or(suv.y.greaterThan(1)), () => { Break(); });
        const behind: N = p.z.negate().sub(sceneDist(suv));
        If(behind.greaterThan(0).and(behind.lessThan(stp.mul(2.2).add(0.3))), () => {
          // refine: bisect back between the last miss and this hit
          const lo: N = t.sub(stp).toVar(), hi: N = t.toVar();
          Loop(5, () => {
            const mid: N = lo.add(hi).mul(0.5);
            const pm: N = P0.add(R.mul(mid));
            If(pm.z.negate().sub(sceneDist(project(pm))).greaterThan(0), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); });
          });
          const uvh: N = project(P0.add(R.mul(hi)));
          const e: N = min(min(uvh.x, float(1).sub(uvh.x)), min(uvh.y, float(1).sub(uvh.y)));
          hit.assign(smoothstep(0, 0.07, e).mul(float(1).sub(smoothstep(60, 110, t))));
          huv.assign(uvh);
          Break();
        });
        t.addAssign(stp); stp.mulAssign(1.3);
      });
    });
    return vec4(viewportSharedTexture(huv).rgb, hit);
  })();
}

export interface CreekOptions {
  lowTier?: boolean;
  /** Colour the water scatters back from depth (what a deep pool looks like). */
  deep: number;
  /** Shallow body colour (low tier only: the high tier sees the real bed instead). */
  shallow: number;
  /** Absorption per metre (r, g, b): red goes first, so deep water turns teal. */
  absorb?: [number, number, number];
  /** Bioluminescent crest glow (the Rift's look) at night, omit = none. */
  glow?: number; glowAmt?: number;
  /** Ripple strength multiplier (default 1). */
  chop?: number;
}

/** Ribbon water whose vertices carry `wflow` (speed, white, depth, bank) and `wdir` (downstream x, z), uv in metres
 *  (x across, y downstream); `wdir.z` is 0 mid-channel → 1 at the ribbon's edge. See the header. */
export function riftCreek(o: CreekOptions): THREE.MeshStandardNodeMaterial {
  const lo = !!o.lowTier;
  const m: THREE.MeshStandardNodeMaterial = lo
    ? new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.06, transparent: true })
    : new THREE.MeshPhysicalNodeMaterial({ metalness: 0, roughness: 0.04, ior: 1.33, specularIntensity: 1, transparent: true });
  m.name = 'creek-water';
  m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  (m as N).receivedShadowNode = Fn(([sh]: [N]) => sh.mul(0.4).add(0.6));
  if (!lo) m.envMapIntensity = 0;             // reflections are composed below (screen-space + sky): no double mirror
  const tex = rippleTexture();
  const A: N = attribute('wflow', 'vec4'), D3: N = attribute('wdir', 'vec3'), D: N = D3.xy, across: N = D3.z;
  const spd: N = A.x, white: N = A.y, dep: N = A.z, bank: N = A.w;
  const q: N = uv();                          // metres: x across, y downstream

  // ── flow: two phases offset along the current, cross-faded (Apex); streaks stretch along fast water ──
  const T = 2.0;
  const ph0: N = fract(time.div(T)), ph1: N = fract(time.div(T).add(0.5)), wgt: N = abs(ph0.mul(2).sub(1));
  const stn: N = float(1).add(spd.mul(0.08));         // ripples: barely stretched (more read as radial lines at grazing angles)
  const adv = (s: number, k: number, ph: N, o2: [number, number]): N => vec2(q.x.div(s), q.y.sub(spd.mul(k).mul(ph).mul(T)).div(stn.mul(s))).add(vec2(o2[0], o2[1]));
  const tA0: N = texture(tex, adv(5, 1, ph0, [0, 0])), tA1: N = texture(tex, adv(5, 1, ph1, [0.5, 0.21]));
  const tB0: N = texture(tex, adv(1.6, 1.3, ph0, [0.37, 0.11])), tB1: N = texture(tex, adv(1.6, 1.3, ph1, [0.81, 0.43]));
  const qr: N = vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8)));
  const tC: N = texture(tex, qr.div(23).sub(vec2(0, time.mul(0.012))).add(vec2(0.19, 0.63)));
  // rapids chop: small, fast and steep, only where the water is white
  const tD0: N = texture(tex, adv(0.8, 1.7, ph0, [0.13, 0.71])), tD1: N = texture(tex, adv(0.8, 1.7, ph1, [0.59, 0.27]));
  const nA: N = mix(tA0.xyz, tA1.xyz, wgt).mul(2).sub(1), nB: N = mix(tB0.xyz, tB1.xyz, wgt).mul(2).sub(1);
  const nC: N = tC.xyz.mul(2).sub(1), nD: N = mix(tD0.xyz, tD1.xyz, wgt).mul(2).sub(1);
  const dist: N = length(cameraPosition.sub(positionWorld));
  const nearFade: N = float(1).sub(smoothstep(30, 160, dist).mul(0.8)), midFade: N = float(1).sub(smoothstep(140, 700, dist).mul(0.6));
  const choppy: N = float(0.16).add(spd.mul(0.09)).add(white.mul(0.35)).add(waterEnv.wind.mul(0.12)).mul(o.chop ?? 1);
  const slope: N = nA.xy.mul(0.6).add(nB.xy.mul(0.45)).mul(nearFade).add(nC.xy.mul(0.4).mul(midFade)).add(nD.xy.mul(white).mul(0.9).mul(nearFade)).mul(choppy)
    .add(rainRings(q).mul(0.35));
  // flow frame → world: uv.x grows toward (dz, -dx), uv.y runs downstream (dx, dz)
  const dn: N = normalize(D.add(vec2(1e-5, 0)));
  const toWorld = (s: N): N => vec3(s.x.mul(dn.y).add(s.y.mul(dn.x)), float(1), s.x.mul(dn.x.negate()).add(s.y.mul(dn.y)));
  const nW: N = normalize(toWorld(slope));
  const nV: N = transformNormalToView(nW);
  m.normalNode = nV;
  // the mirror uses a calmer normal: reflections shimmer, they don't shatter
  const nRW: N = normalize(toWorld(nA.xy.mul(0.22).add(nB.xy.mul(0.16)).mul(nearFade).mul(spd.mul(0.25).add(0.75)).add(nC.xy.mul(0.08)).add(nD.xy.mul(white).mul(0.3)).add(rainRings(q).mul(0.25))));
  const nRV: N = transformNormalToView(nRW);
  const FR: N = float(0.02).add(pow(float(1).sub(clamp(dot(nRV, positionViewDirection), 0, 1)), 5).mul(0.98));

  // ── foam: banks, fast crests, rapids / rocks / falls (white), streaked down the current ──
  const hh: N = mix(tA0.w, tA1.w, wgt).mul(tC.w.mul(0.35).add(0.82));
  // foam streaks: fine, stretched along the current, so white water reads as torn streaks, not marbling
  const advF = (ph: N, o2: [number, number]): N => vec2(q.x.div(0.9), q.y.sub(spd.mul(1.05).mul(ph).mul(T)).div(stn.mul(1.5))).add(vec2(o2[0], o2[1]));
  const fs0: N = texture(tex, advF(ph0, [0.27, 0.9])).w, fs1: N = texture(tex, advF(ph1, [0.77, 0.35])).w;
  const fstreak: N = mix(fs0, fs1, wgt).mul(0.9).add(hh.mul(0.15));
  let foam: N = bank.mul(smoothstep(0.5, 0.82, hh.add(0.08))).mul(spd.mul(0.15).add(0.25));
  foam = foam.add(smoothstep(1.4, 2.6, spd).mul(smoothstep(0.62, 0.85, hh)).mul(0.5));
  const fine: N = mix(tD0.w, tD1.w, wgt);
  // coverage grows with `white` but the pattern always stays torn (never a solid white disc)
  foam = foam.add(smoothstep(float(0.95).sub(white.mul(0.45)), float(1.0).sub(white.mul(0.35)), fstreak.add(fine.mul(0.6)).sub(0.12)).mul(white.mul(2).min(1)));
  foam = clamp(foam, 0, 1);

  // ── body: what's under the surface ──
  const deep: N = color(o.deep).mul(waterEnv.light.mul(0.8).add(0.2));
  let under: N, opacity: N, thickDbg: N = float(0), foamPre: N = foam;
  if (!lo) {
    const ab = o.absorb ?? [0.62, 0.2, 0.14];
    // Thickness: the baked depth over the bed along the view ray. (The depth buffer can't be read here: the scene pass
    // renders with MSAA and WebGPU can't copy a multisampled depth target, so viewportDepthTexture comes back empty.)
    const ndvB: N = clamp(dot(nV, positionViewDirection), 0, 1);
    const thick: N = dep.div(max(ndvB, 0.3)).min(6);
    const wz: N = positionView.z.negate();
    const off: N = nV.xy.mul(0.06).mul(clamp(dep, 0, 1)).div(wz.mul(0.04).add(1));
    const bed: N = viewportSharedTexture(screenUV.add(vec2(off.x, off.y.negate()))).rgb;
    const Tr: N = exp(vec3(ab[0], ab[1], ab[2]).mul(thick).negate() as N);
    // caustics on the shallow bed: two drifting height fields, their difference sharpened into bright webs
    const c1: N = texture(tex, positionWorld.xz.div(1.7).add(vec2(time.mul(0.05), time.mul(0.033)))).w;
    const c2: N = texture(tex, positionWorld.xz.div(1.3).sub(vec2(time.mul(0.04), time.mul(-0.05))).add(0.5)).w;
    const caus: N = smoothstep(0.8, 0.97, float(1).sub(abs(c1.sub(c2)).mul(4))).mul(smoothstep(0.02, 0.25, thick)).mul(waterEnv.day.mul(0.9).add(0.1))
      .mul(float(1).sub(smoothstep(10, 40, dist)));
    // the bed reads darker and a little silty through the water even where it's shallow
    const silt: N = float(1).sub(exp(thick.mul(-1.6) as N)).mul(0.35).add(0.08);
    under = mix(bed.mul(0.78).mul(Tr).mul(caus.mul(1.3).add(1)), deep, silt).add(deep.mul(float(1).sub(Tr.g)).mul(0.6));
    thickDbg = thick; foamPre = foam;
    foam = foam.mul(smoothstep(0.0, 0.3, thick));   // a thin film at the waterline: no foam, no hard edge
    opacity = smoothstep(1.0, 0.8, across);
  } else {
    const tdeep: N = float(1).sub(exp(dep.mul(-0.5)));
    under = mix(color(o.shallow).mul(waterEnv.light.mul(0.6).add(0.4)), deep, tdeep);
    opacity = clamp(float(0.32).add(tdeep.mul(0.6)).add(FR.mul(0.35)).add(foam.mul(0.5)), 0, 0.96).mul(smoothstep(0.02, 0.45, dep)).mul(smoothstep(1.0, 0.8, across));
  }

  // lit foam is the only diffuse part; the water itself is what's under it and what it mirrors
  m.colorNode = mix(vec3(0.01, 0.012, 0.012), color(0xe6f2f2), foam);
  m.roughnessNode = mix(float(lo ? 0.06 : 0.04), float(0.6), foam);
  m.opacityNode = opacity;
  // ── reflection: banks and trees through the depth buffer, the sky beyond (rebuilt when the level sky arrives) ──
  const build = () => {
    const view: N = normalize(positionWorld.sub(cameraPosition));
    const rW: N = reflect(view, nRW);
    let refl: N = mirrorSky(normalize(vec3(rW.x, max(rW.y, float(0.02)), rW.z)));
    if (!lo) { const s: N = ssr(nRV, 18); refl = mix(refl, s.xyz, s.w); }
    // foam scatters the sky's light too: white water stays white in a shaded gorge, not just where the sun hits it
    const foamAmb: N = mix(color(0x9fb4bc), waterEnv.haze, waterEnv.day).mul(waterEnv.light.mul(0.45).add(0.08));
    let em: N = under.mul(float(1).sub(FR)).add(refl.mul(FR)).mul(float(1).sub(foam.mul(0.9))).add(foamAmb.mul(foam));
    if (o.glow !== undefined) {
      const crest: N = smoothstep(0.6, 0.85, hh).mul(nearFade);
      em = em.add(color(o.glow).mul(crest.mul(o.glowAmt ?? 0.12).add(foam.mul((o.glowAmt ?? 0.12) * 0.5))).mul(float(1).sub(waterEnv.day.mul(0.8))));
    }
    // ?wdbg: tuning views, switched live with window.__wdbg('white'|'speed'|'depth'|'foam'|'foampre'|'thick'|'bank'|'off')
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('wdbg')) {
      const views: N[] = [white, spd.div(4), dep.div(1.5), foam, foamPre, thickDbg.div(2), bank, sceneDist(screenUV).div(100), positionView.z.negate().div(100)];
      let v: N = em;
      views.forEach((x, k) => { v = select(dbgView.equal(float(k + 1)), vec3(x), v); });
      em = v;
      const names = ['white', 'speed', 'depth', 'foam', 'foampre', 'thick', 'bank', 'scene', 'self'];
      (globalThis as unknown as { __wdbg?: (n: string) => void }).__wdbg = (n) => { dbgView.value = names.indexOf(n) + 1; };
    }
    m.emissiveNode = em;
    m.needsUpdate = true;
  };
  build();
  onWaterSky(build);
  return m;
}

export interface SwampOptions {
  lowTier?: boolean;
  /** Murk colour (silt and tannin) and the scum / duckweed colour floating on it. */
  murk: number; scum: number;
  /** Faint marsh-gas light in the murk at night (omit = none). */
  glow?: number;
}

/** Still swamp water: barely moving, nearly opaque with silt and tannin, rafts of scum and duckweed drifting on a
 *  dull surface, slow wind ripples. Nothing like the creek: no current, no foam, a murky short view into it. */
export function riftSwamp(o: SwampOptions): THREE.MeshStandardNodeMaterial {
  const lo = !!o.lowTier;
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.12, transparent: true });
  m.name = 'swamp-water';
  m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  if (!lo) m.envMapIntensity = 0;
  const tex = rippleTexture();
  const p: N = positionWorld.xz;
  const drift: N = vec2(time.mul(0.012), time.mul(0.007)).mul(waterEnv.wind.mul(2).add(0.5));
  const t1: N = texture(tex, p.div(4.5).sub(drift.mul(1 / 4.5)));
  const t2: N = texture(tex, p.div(1.4).add(vec2(time.mul(0.01), time.mul(-0.016))).add(0.33));
  const dist: N = length(cameraPosition.sub(positionWorld));
  const nearFade: N = float(1).sub(smoothstep(20, 120, dist).mul(0.85));
  // scum rafts and duckweed: big slow patches, fine specks round their edges, drifting with the wind
  const pd: N = p.sub(drift.mul(6));
  const big: N = mx_noise_float(pd.mul(0.09));
  const raft: N = smoothstep(0.05, 0.4, big.mul(0.6).add(mx_noise_float(pd.mul(0.31)).mul(0.4)));
  const speck: N = step(0.55, mx_noise_float(pd.mul(3.1))).mul(smoothstep(-0.1, 0.2, big));
  const scum: N = clamp(raft.add(speck.mul(0.8)), 0, 1).mul(float(1).sub(smoothstep(150, 400, dist).mul(0.5)));
  const chop: N = float(0.05).add(waterEnv.wind.mul(0.18)).mul(float(1).sub(scum.mul(0.85)));
  const slope: N = t1.xy.mul(2).sub(1).mul(0.6).add(t2.xy.mul(2).sub(1).mul(0.4)).mul(chop).mul(nearFade)
    .add(rainRings(p).mul(float(1).sub(scum.mul(0.7))).mul(0.3));
  const nW: N = normalize(vec3(slope.x, float(1), slope.y));
  const nV: N = transformNormalToView(nW);
  m.normalNode = nV;
  const ndv: N = clamp(dot(nV, positionViewDirection), 0, 1);
  const F: N = float(0.02).add(pow(float(1).sub(ndv), 5).mul(0.98)).mul(float(1).sub(scum.mul(0.8)));
  const murk: N = color(o.murk).mul(waterEnv.light.mul(0.8).add(0.2));
  let under: N;
  if (!lo) {
    // a hand's depth into it: the bed and the boardwalk posts only just show through the murk
    under = mix(viewportSharedTexture(screenUV.add(nV.xy.mul(0.01))).rgb.mul(0.6), murk, 0.82);
  } else under = murk;
  // the scum is a lit, matte, floating layer; the open water is murk under a dull mirror
  const scumCol: N = mix(color(o.scum), color(o.scum).mul(1.35), t2.w);
  m.colorNode = mix(vec3(0.01, 0.012, 0.01), scumCol, scum);
  m.roughnessNode = mix(float(0.12), float(0.85), scum);
  m.opacityNode = lo ? clamp(float(0.9).add(F.mul(0.1)), 0, 0.98) : float(1);
  const build = () => {
    const view: N = normalize(positionWorld.sub(cameraPosition));
    const rW: N = reflect(view, nW);
    let refl: N = mirrorSky(normalize(vec3(rW.x, max(rW.y, float(0.02)), rW.z))).mul(0.85);
    if (!lo) { const s: N = ssr(nV, 14); refl = mix(refl, s.xyz.mul(0.9), s.w); }
    let em: N = under.mul(float(1).sub(F)).add(refl.mul(F)).mul(float(1).sub(scum));
    if (o.glow !== undefined) em = em.add(color(o.glow).mul(float(1).sub(waterEnv.day)).mul(0.02).mul(float(1).sub(scum)));
    m.emissiveNode = em;
    m.needsUpdate = true;
  };
  build();
  onWaterSky(build);
  return m;
}

/** Falls sheet, upgraded: streaks falling down uv.y (1 = top) that speed up as they drop (gravity), a glassy smooth
 *  tongue at the lip, broken white water below it, thinner and see-through at the sides. */
export function riftFallSheet(o: { tint: number; white?: number; opacity?: number }): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.name = 'falls-sheet';
  const tex = rippleTexture();
  const y: N = uv().y, x: N = uv().x;
  const drop: N = float(1).sub(y);                    // 0 at the lip → 1 at the foot
  // distance fallen grows with the square of time: stretch the streak coordinate so they accelerate down the sheet
  const fall: N = drop.mul(drop).mul(1.4).add(drop.mul(0.6));
  const s1: N = texture(tex, vec2(x.mul(2.2), fall.mul(0.9).sub(time.mul(0.9)))).w;
  const s2: N = texture(tex, vec2(x.mul(6.1).add(0.31), fall.mul(1.8).sub(time.mul(1.6)))).w;
  const s3: N = texture(tex, vec2(x.mul(13.7).add(0.7), fall.mul(3.2).sub(time.mul(2.4)))).w;
  const broken: N = smoothstep(0.05, 0.4, drop);       // glassy at the lip, white lower down
  const streak: N = smoothstep(float(0.62).sub(broken.mul(0.2)), float(0.9).sub(broken.mul(0.15)), s1.mul(0.45).add(s2.mul(0.4)).add(s3.mul(0.3)));
  const foot: N = smoothstep(0.75, 1.0, drop);
  const white: N = clamp(streak.mul(broken.mul(0.8).add(0.2)).add(foot.mul(0.7)), 0, 1);
  m.colorNode = mix(color(o.tint).mul(waterEnv.light.mul(0.7).add(0.3)), color(o.white ?? 0xf2fbff).mul(waterEnv.light.mul(0.6).add(0.45)), white);
  const sides: N = smoothstep(0.0, 0.18, x).mul(smoothstep(1.0, 0.82, x));
  const holes: N = smoothstep(0.25, 0.5, s2.add(broken.mul(0.2)));   // gaps in the sheet where it breaks up
  m.opacityNode = sides.mul(float(o.opacity ?? 0.8)).mul(mix(float(0.55), holes.mul(0.6).add(0.4), broken)).mul(white.mul(0.4).add(0.6));
  return m;
}
