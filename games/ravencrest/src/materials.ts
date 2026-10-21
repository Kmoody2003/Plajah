import * as THREE from 'three/webgpu';
import {
  texture, triplanarTexture, vec2, vec3, float, mrt, uv, positionWorld, normalWorld, normalMap, mix,
  mx_fractal_noise_float, smoothstep, time, color, transformNormalToView, luminance, Fn,
  positionView, normalView, faceDirection, dFdx, dFdy,
} from 'three/tsl';

const PH = '/games/ravencrest/assets/polyhaven/textures';
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

export interface PbrSet { diff: THREE.Texture; nor: THREE.Texture; rough: THREE.Texture; ao: THREE.Texture; disp: THREE.Texture; ard: THREE.Texture }

export function pbr(id: string): PbrSet {
  return {
    diff: tex(`${PH}/${id}/diff.jpg`, true),
    nor: tex(`${PH}/${id}/nor_gl.jpg`, false),
    rough: tex(`${PH}/${id}/rough.jpg`, false),
    ao: tex(`${PH}/${id}/ao.jpg`, false),
    disp: tex(`${PH}/${id}/disp.jpg`, false),
    ard: tex(`${PH}/${id}/ard.jpg`, false), // AO/rough/disp packed by scripts/ravencrest/pack_textures.py
  };
}

/** SSR reads `metalrough` from the MRT. x = reflectivity, y = roughness. */
export function setReflect(mat: THREE.NodeMaterial, reflectivity: THREE.Node | number, rough: THREE.Node | number) {
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
export function triplanarMaterial(id: string, o: StoneOpts = {}): THREE.MeshStandardNodeMaterial {
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

/**
 * Rain-soaked asphalt matching the art: near-black, mirror-like sheen with
 * broken puddles. Puddle mask is world-space noise so it never tiles visibly.
 */
export function wetAsphalt(repeat: [number, number], markings: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const s = pbr('asphalt_02');
  const m = new THREE.MeshStandardNodeMaterial();
  const u = uv().mul(vec2(...repeat));
  // Sparse puddle patches (world-space, so they never tile) + glossier wheel-track bands
  // in each lane — how the art's road catches the torchlight.
  // Stretched along the road (≈ −Z) so puddles read as long sheets, not round holes.
  const patches = smoothstep(float(0.25), float(0.5), mx_fractal_noise_float(positionWorld.xz.mul(vec2(0.3, 0.07)), 3, 2, 0.5, 1));
  const lane = uv().x.sub(0.5).abs();
  const tracks = smoothstep(float(0.07), float(0.0), lane.sub(0.12).abs()).add(smoothstep(float(0.07), float(0.0), lane.sub(0.36).abs())).clamp();
  const puddle = patches.mul(0.9).max(tracks.mul(0.45));
  const paint = texture(markings, uv());
  const base = texture(s.diff, u).rgb.mul(0.2);
  const painted = mix(base, paint.rgb.mul(0.8), paint.a);
  m.colorNode = mix(painted, painted.mul(0.85), puddle);
  const r = mix(texture(s.rough, u).r.mul(0.7).add(0.12), float(0.14), puddle);
  m.roughnessNode = r;
  m.normalNode = normalMap(texture(s.nor, u), vec2(mix(float(1), float(0.08), puddle)));
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

