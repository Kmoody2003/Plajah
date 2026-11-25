import * as THREE from 'three';

/**
 * Shared helpers for the Plajah asset library pieces (src/library/*): a seeded random, a cached PBR material palette
 * wired directly to Ironport's curated photographic v3 architectural texture sets (albedo + normal + roughness),
 * world-metre UV scaling on every primitive (zero stretched brick/steel/concrete on 120 m warehouses), and box /
 * cylinder / prism / beam builders. Every material stays cached so mergeByMaterial keeps draw calls minimal.
 */
export type Rand = () => number;
export function seeded(seed: number): Rand { let s = (seed | 0) % 2147483647 || 1; if (s < 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const SHARED_V3 = '/games/apex/ironport/textures-v3/shared/';
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

export function sharedPbrTex(stem: string, kind: 'base' | 'nrm' | 'rgh'): THREE.Texture {
  const key = `${stem}_${kind}`;
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(`${SHARED_V3}${stem}_${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = kind === 'base' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texCache.set(key, t);
  }
  return t;
}

interface PbrSpec {
  stem: string;
  normalScale: number;
  tintMix: number;     // 0 = pure texture colour, 1 = full palette tint
  roughMul?: number;
  metalOverride?: number;
  isGlass?: boolean;
}

/** Map PAL & civic/industrial architectural colours to their matching photoreal v3 PBR texture triplet. */
function pbrFor(color: number, rough: number, metal: number, emissive: number): PbrSpec | null {
  if (emissive) return null;
  // Architectural glass (industrial windows, control tower cab, civic opera/museums, yachts)
  if (color === 0x2b3d4a || color === 0x6f8fa3 || color === 0x8fb3c4 || color === 0xa8c6c8 || color === 0x1d2a33) {
    return { stem: 'tex-shared-07-glass-curtain-blue', normalScale: 0.55, tintMix: 0.35, roughMul: 0.45, metalOverride: 0.22, isGlass: true };
  }
  // Brick & masonry (manufacturing halls, chimneys, flower beds)
  if (color === 0x8a4a35 || color === 0x6d4434 || color === 0x8a4a2a) {
    return { stem: color === 0x6d4434 ? 'tex-shared-02-weathered-brick' : 'tex-shared-01-red-brick', normalScale: 1.55, tintMix: 0.30 };
  }
  // Corrugated steel walls & industrial roofs
  if (color === 0x9ea5a8 || color === 0x55595c) {
    return { stem: 'tex-shared-21-corrugated-steel', normalScale: 1.45, tintMix: 0.38 };
  }
  // Painted steel panels, galvanized cladding, storage tanks, silos, ducts, logistics hulls
  if (color === 0x8b9298 || color === 0x4b5157 || color === 0xb4b9bc || color === 0xe6e4de || color === 0xd8d7d2 || color === 0xe0e0dc || color === 0xe8e6e0 || color === 0xc8ccd0 || color === 0xd8d6cf) {
    return { stem: 'tex-shared-14-steel-panel', normalScale: 1.15, tintMix: 0.42 };
  }
  // Weathered & board-formed architectural concrete (control towers, aprons, parapets, logistics walls, amphitheatre)
  if (color === 0xa9a7a0 || color === 0x7d7c78 || color === 0xc9ccc9 || color === 0xd3d2cc || color === 0xc4beb2) {
    return { stem: color === 0xc9ccc9 || color === 0xd3d2cc ? 'tex-shared-15-concrete-boardformed' : 'tex-shared-16-concrete-weathered', normalScale: 1.35, tintMix: 0.32 };
  }
  // Civic limestone, stone embankments, grand civic buildings, marble opera shells
  if (color === 0xd9d2c3 || color === 0xe8e2d4 || color === 0xcfc6b4 || color === 0xcbc2b0 || color === 0xc9b9a0 || color === 0xcdbf9f || color === 0xe3d8bf || color === 0xb8ad98) {
    return { stem: color === 0xcdbf9f ? 'tex-shared-24-stone-rubble' : 'tex-shared-04-limestone', normalScale: 1.30, tintMix: 0.28 };
  }
  if (color === 0xf4f2ec || color === 0xf0f0ea || color === 0xe6e6e2) {
    return { stem: 'tex-shared-05-white-marble', normalScale: 0.85, tintMix: 0.25 };
  }
  // Timber decks, piers, pontoons, rail sleepers, palm trunks
  if (color === 0x8a5a36 || color === 0xbf9a6a || color === 0xb08a5e || color === 0x9b7652 || color === 0x4a3a2e || color === 0x4b3d30 || color === 0x5a4330 || color === 0x8a7356) {
    return { stem: 'tex-shared-18-timber-siding', normalScale: 1.40, tintMix: 0.45 };
  }
  // Rail ballast & dark granite/asphalt
  if (color === 0x6f6a63 || color === 0x2f3133) {
    return { stem: 'tex-shared-24-stone-rubble', normalScale: 1.45, tintMix: 0.55 };
  }
  // Corrugated freight containers & painted steel wagons / rust
  if (color === 0x7a3b23 || color === 0x6b3a2a || color === 0x3c4a55 || color === 0x7d6a4a || color === 0x9a3b2e || color === 0x2c5c8a || color === 0x8a8f94 || color === 0x3f6b3c || color === 0xc79a2a) {
    return { stem: 'tex-shared-21-corrugated-steel', normalScale: 1.25, tintMix: 0.72 };
  }
  // General painted industrial steel/concrete fallback for mid-tone surfaces
  if (metal >= 0.35 && rough <= 0.65) {
    return { stem: 'tex-shared-14-steel-panel', normalScale: 0.90, tintMix: 0.68 };
  }
  return null;
}

/** Add subtle world-space architectural weathering & sky-mirror reflections for glass without extra draw calls. */
function enhanceKitMaterial(m: THREE.MeshStandardMaterial, isGlass: boolean): void {
  if (isGlass) {
    m.envMapIntensity = 1.45;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKitW; varying vec3 vKitN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvKitW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvKitN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKitW; varying vec3 vKitN;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 Vw = normalize(cameraPosition - vKitW);
          vec3 Nw = normalize(vKitN);
          vec3 R = reflect(-Vw, Nw);
          float ndv = clamp(abs(dot(Nw, Vw)), 0.0, 1.0);
          float om = 1.0 - ndv;
          float fres = 0.08 + 0.82 * (om * om * om);
          vec3 skyRefl = mix(vec3(0.18, 0.22, 0.26), mix(vec3(0.76, 0.82, 0.90), vec3(0.28, 0.46, 0.72), clamp(R.y * 1.4, 0.0, 1.0)), smoothstep(-0.08, 0.14, R.y));
          // Subtle warm interior room grid behind glazed bays
          vec2 pane = floor(vec2((vKitW.x + vKitW.z) * 0.32, vKitW.y * 0.28));
          float lit = step(0.58, fract(sin(dot(pane, vec2(127.1, 311.7))) * 43758.5453));
          vec3 roomGlow = vec3(0.92, 0.76, 0.52) * lit * 0.22 * (1.0 - fres * 0.65);
          reflectedLight.indirectSpecular += skyRefl * fres * 0.62;
          reflectedLight.directDiffuse += roomGlow;
        }`);
    };
    m.customProgramCacheKey = () => 'kit-arch-glass-v1';
    return;
  }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvKitW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        // Macro architectural weathering & tonal variation across large walls (breaks repetition on 80-120 m halls)
        float macro = 0.90 + 0.20 * sin(vKitW.x * 0.045 + sin(vKitW.z * 0.038) * 1.8) * cos(vKitW.y * 0.09);
        float streak = 0.94 + 0.08 * sin(vKitW.x * 0.42 + vKitW.z * 0.37);
        diffuseColor.rgb *= macro * streak;
      }`);
  };
  m.customProgramCacheKey = () => 'kit-arch-pbr-v1';
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** One PBR material per colour / roughness / metalness, shared by every piece so merged batches stay few. */
export function mat(color: number, rough = 0.85, metal = 0, emissive = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}|${metal}|${emissive}`;
  let m = mats.get(k);
  if (!m) {
    const spec = pbrFor(color, rough, metal, emissive);
    if (spec) {
      // Blend requested palette colour toward neutral white so photographic albedo stays crisp and never double-darkens
      const baseCol = new THREE.Color(0xffffff).lerp(new THREE.Color(color), spec.tintMix);
      m = new THREE.MeshStandardMaterial({
        color: baseCol,
        map: sharedPbrTex(spec.stem, 'base'),
        normalMap: sharedPbrTex(spec.stem, 'nrm'),
        normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
        roughnessMap: sharedPbrTex(spec.stem, 'rgh'),
        roughness: Math.min(1, rough * (spec.roughMul ?? 1.0)),
        metalness: spec.metalOverride ?? metal,
      });
      enhanceKitMaterial(m, !!spec.isGlass);
    } else {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
        emissive: emissive ? new THREE.Color(emissive) : undefined,
        emissiveIntensity: emissive ? 1 : 0,
      });
    }
    mats.set(k, m);
  }
  return m;
}

export const PAL = {
  concrete: 0xa9a7a0, darkConcrete: 0x7d7c78, steel: 0x8b9298, darkSteel: 0x4b5157, galvanized: 0xb4b9bc, corrugated: 0x9ea5a8, brick: 0x8a4a35,
  glass: 0x2b3d4a, roofDark: 0x55595c, asphalt: 0x2f3133, ballast: 0x6f6a63, sleeper: 0x4a3a2e, rail: 0x6b6460, yellow: 0xd9a52a, navy: 0x2a3b5a,
  rust: 0x7a3b23, tankWhite: 0xe6e4de, safetyYellow: 0xe8c12c, black: 0x1d1e20, red: 0xa8322b, white: 0xf1f1ee, green: 0x2e5b3c,
};

/** Scale BoxGeometry UVs into real-world metres (tile m per repeat) so PBR brick/concrete/steel never stretches on wide walls. */
function scaleBoxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile = 5.5): THREE.BoxGeometry {
  const uv = geo.getAttribute('uv');
  if (!uv || uv.count !== 24) return geo;
  // BoxGeometry face order: +x (d x h), -x (d x h), +y (w x d), -y (w x d), +z (w x h), -z (w x h)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const su = Math.max(0.25, dims[f][0] / tile), sv = Math.max(0.25, dims[f][1] / tile);
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Scale CylinderGeometry UVs into real-world metres around circumference and height. */
function scaleCylUV(geo: THREE.CylinderGeometry, r: number, h: number, tile = 5.0): THREE.CylinderGeometry {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const su = Math.max(1, (2 * Math.PI * Math.max(0.2, r)) / tile);
  const sv = Math.max(0.25, h / tile);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** Scale ExtrudeGeometry UVs (which Three generates in raw world units) to consistent tile metres. */
function scaleExtrudeUV(geo: THREE.BufferGeometry, tile = 5.5): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const inv = 1 / tile;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * inv, uv.getY(i) * inv);
  uv.needsUpdate = true;
  return geo;
}

export class Kit {
  readonly g: THREE.Group;
  constructor(name: string) { this.g = new THREE.Group(); this.g.name = name; }
  private add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = shadow; mesh.receiveShadow = true; this.g.add(mesh); return mesh;
  }
  /** a box centred at (x, y, z) with world-metre PBR UVs */
  box(x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, ry = 0): THREE.Mesh {
    return this.add(scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d), m, x, y, z, ry);
  }
  /** a box standing on y0 */
  slab(x: number, y0: number, z: number, w: number, h: number, d: number, m: THREE.Material, ry = 0): THREE.Mesh { return this.box(x, y0 + h / 2, z, w, h, d, m, ry); }
  /** an upright cylinder standing on y0 */
  cyl(x: number, y0: number, z: number, r: number, h: number, m: THREE.Material, seg = 16, rTop = r): THREE.Mesh {
    return this.add(scaleCylUV(new THREE.CylinderGeometry(rTop, r, h, seg), Math.max(r, rTop), h), m, x, y0 + h / 2, z);
  }
  /** a cylinder lying along local x (pipes, tank cars) */
  cylX(x: number, y: number, z: number, r: number, len: number, m: THREE.Material, seg = 14): THREE.Mesh {
    return this.add(scaleCylUV(new THREE.CylinderGeometry(r, r, len, seg), r, len), m, x, y, z, 0, 0, Math.PI / 2);
  }
  /** a cylinder lying along local z */
  cylZ(x: number, y: number, z: number, r: number, len: number, m: THREE.Material, seg = 14): THREE.Mesh {
    return this.add(scaleCylUV(new THREE.CylinderGeometry(r, r, len, seg), r, len), m, x, y, z, 0, Math.PI / 2, 0);
  }
  sphere(x: number, y: number, z: number, r: number, m: THREE.Material, seg = 18): THREE.Mesh { return this.add(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), m, x, y, z); }
  /** a dome (upper hemisphere) of radius r, flattened to height h, on y0 */
  dome(x: number, y0: number, z: number, r: number, h: number, m: THREE.Material): THREE.Mesh { const g = new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, h / r, 1); return this.add(g, m, x, y0, z); }
  /** a gable roof over a w x d footprint (ridge along z), eaves at y0, ridge h above */
  gable(x: number, y0: number, z: number, w: number, d: number, h: number, m: THREE.Material, ry = 0): THREE.Mesh {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = scaleExtrudeUV(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })); g.translate(0, 0, -d / 2);
    return this.add(g, m, x, y0, z, ry);
  }
  /** one sawtooth bay (a north-light roof): vertical glazed face toward -z, slope down to +z; w across, d along the slope */
  sawtooth(x: number, y0: number, z: number, w: number, d: number, h: number, m: THREE.Material): THREE.Mesh {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(-d / 2, h); s.closePath();
    const g = scaleExtrudeUV(new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false })); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2);
    return this.add(g, m, x, y0, z);
  }
  /** a thin round bar from a to b (handrails, struts, lattice members) */
  beam(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material): THREE.Mesh {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb) || 0.01;
    const mesh = this.add(new THREE.CylinderGeometry(r, r, len, 6), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0, 0, 0, r > 0.08);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    return mesh;
  }
}
