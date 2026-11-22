// Plajah Terrain — the ground material painted by the land (docs/plajah-terrain.md, phase 4).
//
// A level gives a stack of layers (what moss, rock, scree, mud… look like) and rules for where each one goes; the
// service supplies what the land says at every pixel: how steep (the normal), how high, and — when an erosion bake is
// loaded — how wet, how much water flows through, and where fresh sediment lies. Layers are painted in order, each
// mixed over the ones below by the product of its rule's ranges. No level writes blend code of its own.
import * as THREE from 'three/webgpu';
import { abs, clamp, float, mix, normalize, normalMap, normalView, normalWorld, positionWorld, sqrt, texture as tslTexture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import type { HeightGrid } from './field';

// TSL nodes are dynamically typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** What the land says at a pixel (TSL nodes). Map values are 0…1 and read 0 when no erosion bake is loaded. */
export interface SplatContext {
  /** World position. */
  pos: N;
  /** World normal. */
  normal: N;
  /** |normal.y|: 1 = flat, 0 = vertical. */
  up: N;
  /** World height (m). */
  height: N;
  wet: N;
  flow: N;
  dep: N;
  /** True when an erosion bake's maps are wired in (layers can skip map rules without them). */
  hasMaps: boolean;
}

/** smoothstep ranges per input; [from, to] with from > to inverts (e.g. up: [0.78, 0.6] = "steeper than ~40°"). */
export interface LayerRule {
  up?: [number, number];
  height?: [number, number];
  wet?: [number, number];
  flow?: [number, number];
  dep?: [number, number];
  /** Extra factor from the level (noise, a mask…), 0…1. */
  custom?: (c: SplatContext) => N;
  /** Overall opacity (default 1). */
  strength?: number;
}

export interface TerrainLayer {
  name: string;
  color: (c: SplatContext) => N;
  /** Mixed like the colour; layers without one keep what is below. */
  roughness?: number | ((c: SplatContext) => N);
  emissive?: (c: SplatContext) => N;
  /** Omit for the base layer (covers everything). */
  where?: LayerRule;
  /** Only when an erosion bake is loaded (maps-driven layers). */
  needsMaps?: boolean;
}

export interface TerrainMaps { flow?: HeightGrid | null; wetness?: HeightGrid | null; deposition?: HeightGrid | null }

/** Shade with normals from the height field instead of the mesh's: far chunks are meshed coarsely (12.5 m) and would
 *  lose gullies and rills; the field keeps its full resolution. `geometryInside` = a square where the mesh is finer
 *  than the field (e.g. a 1 m arena), shaded by the mesh as before. */
export interface NormalField { grid: HeightGrid; geometryInside?: { x0: number; z0: number; size: number; fade?: number } }

export interface TerrainMaterialOptions {
  layers: TerrainLayer[];
  maps?: TerrainMaps | null;
  normalField?: NormalField | null;
  normalMap?: THREE.Texture | null;
  normalScale?: number;
  /** Base roughness when no layer sets one. */
  roughness?: number;
}

/** smoothstep that also accepts from > to (falls instead of rising). */
export function ramp(from: number, to: number, x: N): N {
  const t = clamp(x.sub(from).div(to - from), 0, 1);
  return t.mul(t).mul(float(3).sub(t.mul(2)));
}

/** A 0…1 map grid as a linear-filtered single-channel texture over its world square. */
export function mapTexture(g: HeightGrid): THREE.DataTexture {
  const data = new Uint8Array(g.n * g.n);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, g.data[i])) * 255);
  const t = new THREE.DataTexture(data, g.n, g.n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A height grid's normals as a two-channel texture (x, z in 0…1; y is rebuilt), mipmapped for distance. */
export function normalTexture(g: HeightGrid): THREE.DataTexture {
  const n = g.n, d = g.data, data = new Uint8Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const xl = Math.max(0, i - 1), xr = Math.min(n - 1, i + 1), zl = Math.max(0, j - 1), zr = Math.min(n - 1, j + 1);
    const gx = (d[xr + j * n] - d[xl + j * n]) / ((xr - xl) * g.cell), gz = (d[i + zr * n] - d[i + zl * n]) / ((zr - zl) * g.cell);
    const l = Math.hypot(gx, 1, gz), k = (i + j * n) * 2;
    data[k] = Math.round((-gx / l * 0.5 + 0.5) * 255); data[k + 1] = Math.round((-gz / l * 0.5 + 0.5) * 255);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

/** World xz → texture uv for a grid (samples sit on texel centres). */
function gridUv(g: HeightGrid, pos: N): N {
  const k = (g.n - 1) / (g.n * g.size), b = 0.5 / g.n;
  return vec2(pos.x.sub(g.x0).mul(k).add(b), pos.z.sub(g.z0).mul(k).add(b));
}

/** Weight of a rule at a pixel. */
export function ruleWeight(r: LayerRule | undefined, c: SplatContext): N {
  if (!r) return float(1);
  let w: N = float(r.strength ?? 1);
  if (r.up) w = w.mul(ramp(r.up[0], r.up[1], c.up));
  if (r.height) w = w.mul(ramp(r.height[0], r.height[1], c.height));
  if (r.wet) w = w.mul(ramp(r.wet[0], r.wet[1], c.wet));
  if (r.flow) w = w.mul(ramp(r.flow[0], r.flow[1], c.flow));
  if (r.dep) w = w.mul(ramp(r.dep[0], r.dep[1], c.dep));
  if (r.custom) w = w.mul(r.custom(c));
  return w;
}

/** Layers that take part with or without maps (map-only layers drop out when no bake is loaded). */
export function activeLayers(layers: TerrainLayer[], hasMaps: boolean) {
  return layers.filter((l, i) => i === 0 || !l.needsMaps || hasMaps);
}

/** Build the ground material from a layer stack and (optionally) an erosion bake's maps. */
export function terrainSplatMaterial(o: TerrainMaterialOptions) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: o.roughness ?? 0.95, normalMap: o.normalMap ?? null });
  if (o.normalMap) m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
  const textures: THREE.DataTexture[] = [];
  const pos = positionWorld;
  const sample = (g: HeightGrid | null | undefined): N => {
    if (!g) return float(0);
    const t = mapTexture(g); textures.push(t);
    return tslTexture(t, gridUv(g, pos)).r;
  };
  const maps = o.maps ?? null, hasMaps = !!(maps && (maps.flow || maps.wetness || maps.deposition));
  // the surface normal: the height field's (full resolution at any distance) or the mesh's
  let nW: N = normalWorld;
  const nf = o.normalField;
  if (nf) {
    const t = normalTexture(nf.grid); textures.push(t);
    const e = tslTexture(t, gridUv(nf.grid, pos)).rg.mul(2).sub(1).toVar();
    let field: N = vec3(e.x, sqrt(clamp(float(1).sub(e.x.mul(e.x)).sub(e.y.mul(e.y)), 0.0001, 1)), e.y);
    const gi = nf.geometryInside;
    if (gi) {
      const f = gi.fade ?? 16;
      const inX = ramp(gi.x0, gi.x0 + f, pos.x).mul(ramp(gi.x0 + gi.size, gi.x0 + gi.size - f, pos.x));
      const inZ = ramp(gi.z0, gi.z0 + f, pos.z).mul(ramp(gi.z0 + gi.size, gi.z0 + gi.size - f, pos.z));
      field = normalize(mix(field, normalWorld, inX.mul(inZ)));
    }
    nW = field.toVar();
  }
  const c: SplatContext = {
    pos, normal: nW, up: abs(nW.y), height: pos.y,
    wet: sample(maps?.wetness).toVar(), flow: sample(maps?.flow).toVar(), dep: sample(maps?.deposition).toVar(), hasMaps,
  };
  const layers = activeLayers(o.layers, hasMaps);
  if (!layers.length) throw new Error('terrain material needs at least one layer');
  const rough = (l: TerrainLayer) => (typeof l.roughness === 'function' ? l.roughness(c) : float(l.roughness!));
  const base = layers[0];
  let col: N = base.color(c), em: N = base.emissive ? base.emissive(c) : null, ro: N = base.roughness !== undefined ? rough(base) : null;
  for (const l of layers.slice(1)) {
    const w = ruleWeight(l.where, c).toVar();
    col = mix(col, l.color(c), w);
    if (l.emissive) em = mix(em ?? vec3(0), l.emissive(c), w);
    if (l.roughness !== undefined) ro = mix(ro ?? float(o.roughness ?? 0.95), rough(l), w);
  }
  if (nf) {
    // shade with the field normal; the detail normal map (if any) rides on top of it
    const macroV = transformNormalToView(nW);
    m.normalNode = o.normalMap ? normalize((normalMap(tslTexture(o.normalMap), vec2(o.normalScale ?? 1)) as N).add(macroV.sub(normalView))) : normalize(macroV);
  }
  m.colorNode = col;
  if (em) m.emissiveNode = em;
  if (ro) m.roughnessNode = ro;
  return { material: m, hasMaps, layers: layers.map((l) => l.name), dispose: () => { for (const t of textures) t.dispose(); m.dispose(); } };
}
