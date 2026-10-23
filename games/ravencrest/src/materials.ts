import * as THREE from 'three/webgpu';
import {
  texture, triplanarTexture, vec2, vec3, float, mrt, uv, positionWorld, normalWorld, normalMap, mix,
  mx_fractal_noise_float, smoothstep, time, color, transformNormalToView, luminance, Fn,
  positionView, normalView, faceDirection, dFdx, dFdy, uniform,
} from 'three/tsl';

const PH = '/games/ravencrest/assets/polyhaven/textures';
// Texture tier: '1k' for browsers / integrated GPUs (¼ the memory + bandwidth), '2k' for the
// desktop app on a discrete GPU. Set once by main.ts before any material is built.
let TIER: '1k' | '2k' = '1k';
export function setTextureTier(t: '1k' | '2k') { TIER = t; }
const sfx = () => (TIER === '1k' ? '_1k' : '');
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(path: string, srgb: boolean): THREE.Texture {
  const key = `${path}|${srgb}`;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return t;
}

// Only the maps shaders actually sample are loaded (diffuse, packed AO/rough/disp, normal).
export interface PbrSet { diff: THREE.Texture; nor: THREE.Texture; ard: THREE.Texture }

export function pbr(id: string): PbrSet {
  return {
    diff: tex(`${PH}/${id}/diff${sfx()}.jpg`, true),
    nor: tex(`${PH}/${id}/nor_gl${sfx()}.jpg`, false),
    ard: tex(`${PH}/${id}/ard${sfx()}.jpg`, false), // AO/rough/disp packed by scripts/ravencrest/pack_textures.py
  };
}

/**
 * SSR reads `metalrough` from the MRT (x = reflectivity, y = roughness). Only attach it when
 * the level's scene pass actually has that target — with SSR off there's no 'metalrough'
 * MRT, and a material writing to it fails to build (renders flat/untextured).
 */
let reflectMRT = true;
export function setReflectEnabled(on: boolean) { reflectMRT = on; }
export function setReflect(mat: THREE.NodeMaterial, reflectivity: THREE.Node | number, rough: THREE.Node | number) {
  if (!reflectMRT) return;
  mat.mrtNode = mrt({ metalrough: vec2(reflectivity as never, rough as never) });
}

export interface StoneOpts { metresPerTile?: number; tint?: THREE.ColorRepresentation; roughnessScale?: number; wetBase?: number; bump?: number; desat?: number }

/**
 * Bump from an already-evaluated height using screen-space derivatives (Mikkelsen).
 * three's bumpMap() re-samples its texture tree 3×, which for triplanar means 9 fetches.
 */
// TSL's typings don't cover derivative/sign ops on these node unions; the shader is
// type-checked at build time by three, so keep the cast local to this function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const bumpFromHeight: N = Fn(([h, scale]: N) => {
  const dHdxy: N = (vec2 as N)(dFdx(h), dFdy(h)).mul(scale);
  const vSigmaX: N = dFdx(positionView).normalize();
  const vSigmaY: N = dFdy(positionView).normalize();
  const R1: N = vSigmaY.cross(normalView);
  const R2: N = (normalView as N).cross(vSigmaX);
  const fDet: N = vSigmaX.dot(R1).mul(faceDirection);
  const vGrad: N = fDet.sign().mul(dHdxy.x.mul(R1).add(dHdxy.y.mul(R2)));
  return fDet.abs().mul(normalView).sub(vGrad).normalize();
});

/**
 * World-space triplanar PBR for procedural architecture and terrain.
 * 6 texture fetches per pixel: diffuse ×3 + packed AO/rough/disp ×3.
 */
const matCache = new Map<string, THREE.MeshStandardNodeMaterial>();
export function triplanarMaterial(id: string, o: StoneOpts = {}): THREE.MeshStandardNodeMaterial {
  // Identical requests share one instance so static batching can merge across modules.
  const key = id + JSON.stringify(o, Object.keys(o).sort());
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = buildTriplanar(id, o);
  matCache.set(key, m);
  return m;
}

function buildTriplanar(id: string, o: StoneOpts): THREE.MeshStandardNodeMaterial {
  const s = pbr(id);
  const scale = float(1 / (o.metresPerTile ?? 3));
  const tri = (t: THREE.Texture) => triplanarTexture(texture(t), null, null, scale, positionWorld, normalWorld);
  const m = new THREE.MeshStandardNodeMaterial();
  const raw = tri(s.diff).rgb;
  const ard = tri(s.ard);
  // Optional desaturation: several CC0 scans are warmer/yellower than the art's grey stone.
  const albedo = mix(raw, vec3(luminance(raw)), float(o.desat ?? 0)).mul(color(new THREE.Color(o.tint ?? 0xffffff)));
  const rough = ard.g.mul(o.roughnessScale ?? 1);
  m.aoNode = ard.r;
  // No authored UVs/tangents on procedural geometry: relief from the displacement channel.
  m.normalNode = bumpFromHeight(ard.b, float(o.bump ?? 1.2));
  m.metalness = 0;
  if (o.wetBase !== undefined) {
    // Damp stone near the waterline: darker, glossier.
    const wet = smoothstep(float(o.wetBase + 2.5), float(o.wetBase), positionWorld.y);
    m.colorNode = albedo.mul(mix(float(1), float(0.5), wet));
    m.roughnessNode = mix(rough, float(0.3), wet);
  } else {
    m.colorNode = albedo;
    m.roughnessNode = rough;
  }
  return m;
}

/** UV-mapped PBR (for meshes with authored UVs, e.g. the road strip). */
export function uvMaterial(id: string, repeat: [number, number], o: StoneOpts = {}): THREE.MeshStandardNodeMaterial {
  const s = pbr(id);
  const m = new THREE.MeshStandardNodeMaterial();
  const u = uv().mul(vec2(...repeat));
  m.colorNode = texture(s.diff, u).rgb.mul(color(new THREE.Color(o.tint ?? 0xffffff)));
  const ard = texture(s.ard, u);
  m.roughnessNode = ard.g.mul(o.roughnessScale ?? 1);
  m.aoNode = ard.r;
  m.normalNode = normalMap(texture(s.nor, u));
  return m;
}

/** Rain on the world (0…1): weather.ts sets it; puddles ripple while it falls. */
export const rainAmount = uniform(0);

/**
 * Rain-soaked country asphalt: near-black, mirror-sheened, with real wear — patched and cracked
 * sections (the damaged-road scan blended in by world-space noise), muddy verges with leaf litter,
 * fallen leaves across the lanes, glossy wheel tracks and broken puddles that ripple in the rain.
 */
export function wetAsphalt(repeat: [number, number], markings: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const s = pbr('asphalt_02');
  const d = pbr('road_damaged');
  const m = new THREE.MeshStandardNodeMaterial();
  const u = uv().mul(vec2(...repeat));
  const wp = positionWorld.xz;
  // Patched / broken sections: large world-space blobs of the cracked-road scan.
  const damage = smoothstep(float(0.18), float(0.42), mx_fractal_noise_float(wp.mul(0.045), 3, 2, 0.5, 1));
  // Macro tone: resurfaced strips and weathered areas so the asphalt never reads as one tile.
  const macro = mx_fractal_noise_float(wp.mul(vec2(0.02, 0.006)), 2, 2, 0.5, 1).mul(0.25).add(1);
  // Verges: the outer 7% each side — mud, needles and leaf litter, rough and dull.
  const lane = uv().x.sub(0.5).abs();
  const verge = smoothstep(float(0.43), float(0.5), lane);
  // Fallen leaves: sparse rust/ochre specks, thicker toward the verges.
  // Leaf-sized specks (~10 cm), clustered by a slower noise so they drift in patches.
  const leafN = mx_fractal_noise_float(wp.mul(9), 1, 2, 0.5, 1).add(mx_fractal_noise_float(wp.mul(0.6), 1, 2, 0.5, 1).mul(0.35));
  const leaves = smoothstep(float(0.62).sub(verge.mul(0.3)), float(0.7).sub(verge.mul(0.3)), leafN).mul(0.75);
  const leafCol = mix(vec3(0.16, 0.07, 0.03), vec3(0.24, 0.15, 0.04), mx_fractal_noise_float(wp.mul(7.3), 1, 2, 0.5, 1).mul(0.5).add(0.5));
  // Puddles (stretched along the road) + glossy wheel tracks in each lane.
  const patches = smoothstep(float(0.25), float(0.5), mx_fractal_noise_float(wp.mul(vec2(0.3, 0.07)), 3, 2, 0.5, 1));
  const tracks = smoothstep(float(0.07), float(0.0), lane.sub(0.12).abs()).add(smoothstep(float(0.07), float(0.0), lane.sub(0.36).abs())).clamp();
  const puddle = patches.mul(0.9).max(tracks.mul(0.45)).mul(float(1).sub(verge.mul(0.6)));
  const paint = texture(markings, uv());
  const asphalt = mix(texture(s.diff, u).rgb.mul(0.2), texture(d.diff, u.mul(0.7)).rgb.mul(0.24), damage).mul(macro);
  const mud = mix(asphalt, vec3(0.05, 0.04, 0.03), verge.mul(0.85));
  const littered = mix(mud, leafCol, leaves.mul(0.85));
  const painted = mix(littered, paint.rgb.mul(0.8), paint.a.mul(float(1).sub(leaves.mul(0.7))));
  m.colorNode = mix(painted, painted.mul(0.82), puddle);
  const baseRough = mix(texture(s.ard, u).g.mul(0.7).add(0.12), texture(d.ard, u.mul(0.7)).g.mul(0.75).add(0.1), damage);
  const r = mix(mix(baseRough, float(0.85), verge.max(leaves).mul(0.8)), float(0.12), puddle);
  m.roughnessNode = r;
  // Rain ripples: fine animated noise in the puddles while it rains.
  const rip = mx_fractal_noise_float(vec3(wp.mul(6), time.mul(3.5)), 2, 2, 0.5, 1).mul(rainAmount).mul(puddle).mul(0.35);
  const nTex = mix(texture(s.nor, u), texture(d.nor, u.mul(0.7)), damage);
  m.normalNode = normalMap(nTex, vec2(mix(float(1), float(0.08), puddle).add(rip)));
  m.metalness = 0;
  setReflect(m, mix(float(0.0), float(0.35), puddle), r);
  return m;
}

/** Still, inky moat water with slow wind ripples. */
export function moatWater(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const t = time.mul(0.05);
  const n1 = mx_fractal_noise_float(vec3(p.mul(0.12), t), 3, 2, 0.5, 1);
  const n2 = mx_fractal_noise_float(vec3(p.mul(0.12).add(0.37), t), 3, 2, 0.5, 1);
  m.colorNode = vec3(0.006, 0.009, 0.013);
  m.roughnessNode = float(0.03);
  m.metalness = 0;
  m.normalNode = transformNormalToView(vec3(n1.mul(0.05), 1, n2.mul(0.05)).normalize());
  setReflect(m, 1, 0.03);
  return m;
}

