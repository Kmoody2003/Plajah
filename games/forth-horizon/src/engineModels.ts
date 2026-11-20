// High-detail sculpted multi-architecture 3D engine bays derived from the 24 real engine-stand videos
// in the 3D Vehicle Asset Library. Opening the hood/deck shows authentic sculpted 3D mechanical hardware:
// twin-lobe ribbed supercharger V8, carbon twin-turbo hypercar V8 with curved titanium charge pipes,
// gold-foil V10, crimson 12-runner V12, turbo inline-6/5/4 with tubular manifolds, rotary ITB,
// everyday factory-covered V6/I4, turbo diesel, or HV EV inverter pack.
import * as THREE from 'three';

export type EngineArch =
  | 'sc-v8'
  | 'tt-v8'
  | 'na-v10'
  | 'v12'
  | 'w16-quad'
  | 'muscle-v8'
  | 'sports-v8'
  | 'i6-turbo'
  | 'i5-turbo'
  | 'i4-turbo'
  | 'rotary'
  | 'commuter-i4'
  | 'suv-v6'
  | 'v6-sedan'
  | 'pickup-v8'
  | 'diesel-i4'
  | 'diesel-v8'
  | 'hybrid'
  | 'ev';

const std = (color: number, roughness = 0.55, metalness = 0.5): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const bayTexCache = new Map<string, THREE.Texture>();
function loadBayTex(url?: string): THREE.Texture | null {
  if (!url) return null;
  let t = bayTexCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    bayTexCache.set(url, t);
  }
  return t;
}

function addTube(
  g: THREE.Group,
  pts: [number, number, number][],
  radius: number,
  mat: THREE.Material,
  tubularSegs = 14,
  radialSegs = 8
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const me = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, false), mat);
  g.add(me);
  return me;
}

function addTurboSnail(
  g: THREE.Group,
  x: number,
  y: number,
  z: number,
  scale: number,
  facingX: number,
  alu: THREE.Material,
  iron: THREE.Material,
  burntTi: THREE.Material,
  dark: THREE.Material
): void {
  const s = scale;
  const t = new THREE.Group();
  t.position.set(x, y, z);
  const comp = new THREE.Mesh(new THREE.TorusGeometry(0.068 * s, 0.032 * s, 12, 22), alu);
  t.add(comp);
  const compCap = new THREE.Mesh(new THREE.CylinderGeometry(0.052 * s, 0.058 * s, 0.055 * s, 18), alu);
  compCap.rotation.x = Math.PI / 2;
  compCap.position.z = 0.025 * s;
  t.add(compCap);
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * s, 0.034 * s, 0.04 * s, 16), dark);
  inlet.rotation.x = Math.PI / 2;
  inlet.position.z = 0.042 * s;
  t.add(inlet);
  const hot = new THREE.Mesh(new THREE.TorusGeometry(0.062 * s, 0.028 * s, 10, 20), iron);
  hot.position.z = -0.055 * s;
  t.add(hot);
  const downpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.032 * s, 0.036 * s, 0.18 * s, 14), burntTi);
  downpipe.position.set(facingX * 0.04 * s, -0.04 * s, -0.11 * s);
  downpipe.rotation.x = 0.85;
  downpipe.rotation.z = -facingX * 0.35;
  t.add(downpipe);
  g.add(t);
}

export interface EngineBuildOpts {
  z: number;
  arch?: EngineArch;
  layout?: 'front-v8' | 'mid-v8' | 'ev';
  texUrl?: string;
}

export function buildDetailedEngine(opts: EngineBuildOpts): THREE.Group {
  const { z, layout = 'front-v8', texUrl } = opts;
  const arch: EngineArch = opts.arch ?? (layout === 'mid-v8' ? 'tt-v8' : layout === 'ev' ? 'ev' : 'sc-v8');
  const g = new THREE.Group();
  const add = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    pz: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, pz);
    me.rotation.set(rx, ry, rz);
    g.add(me);
    return me;
  };

  // Shared photoreal PBR engine-bay materials (high metallic contrast, crisp clearcoat carbon, weathered cast iron)
  const bay = std(0x0b0c0f, 0.86, 0.18);
  const blockIron = std(0x1f2228, 0.52, 0.84);
  const gunmetal = std(0x3a3f48, 0.34, 0.90);
  const castAlu = std(0xaeb4be, 0.28, 0.94);
  const polAlu = std(0xe0e5ee, 0.12, 0.98);
  const steel = std(0x7c828c, 0.28, 0.95);
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0x16181d, roughness: 0.24, metalness: 0.38, clearcoat: 0.82, clearcoatRoughness: 0.14 });
  const redCrinkle = new THREE.MeshPhysicalMaterial({ color: 0xb8161e, roughness: 0.44, metalness: 0.30, clearcoat: 0.22 });
  const anBlue = std(0x1656b8, 0.26, 0.90);
  const burntTi = std(0x635592, 0.24, 0.96);
  const headerBrass = std(0x8e7452, 0.32, 0.92);
  const goldFoil = std(0xd8a828, 0.24, 0.95);
  const hvOrange = std(0xf26419, 0.36, 0.18);
  const blackRubber = std(0x090a0c, 0.78, 0.08);
  const darkPlastic = std(0x131519, 0.58, 0.18);
  const filterRed = std(0xa01c22, 0.82, 0.06);

  // Use extracted engine video frame ONLY as a subtle weathered roughness/bump patina on cast housings (never a pasted photo decal!)
  const bayTex = loadBayTex(texUrl);
  const weatheredCast = bayTex
    ? new THREE.MeshStandardMaterial({ color: 0x8f96a0, roughness: 0.34, metalness: 0.88, bumpMap: bayTex, bumpScale: 0.008 })
    : castAlu;

  const isMid = layout === 'mid-v8';

  // ---- Engine bay enclosure (floor, side aprons, firewall, radiator support, plumbing) ----
  add(new THREE.BoxGeometry(1.30, 0.045, 1.12), bay, 0, 0.40, z + 0.04);
  const wallMat = arch === 'na-v10' || arch === 'tt-v8' ? goldFoil : bay;
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.038, 0.32, 1.02), wallMat, sx * 0.61, 0.57, z + 0.04);
  }
  add(new THREE.BoxGeometry(1.26, 0.38, 0.04), wallMat, 0, 0.59, z - 0.49);
  if (!isMid) {
    // Radiator fan shroud + gleaming aluminum radiator core + upper coolant hose
    add(new THREE.BoxGeometry(1.10, 0.30, 0.05), blackRubber, 0, 0.55, z + 0.58);
    add(new THREE.BoxGeometry(0.92, 0.23, 0.03), castAlu, 0, 0.55, z + 0.62);
    add(new THREE.BoxGeometry(0.96, 0.04, 0.06), polAlu, 0, 0.68, z + 0.60); // billet radiator top tank
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 14), redCrinkle, 0.22, 0.71, z + 0.60); // pressure cap
    // Twin forged strut-tower brace + CNC strut hats
    add(new THREE.CylinderGeometry(0.014, 0.014, 1.24, 12), polAlu, 0, 0.845, z - 0.38, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.072, 0.088, 0.042, 20), gunmetal, sx * 0.60, 0.825, z - 0.38);
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.052, 14), polAlu, sx * 0.60, 0.835, z - 0.38);
    }
    // Auxiliaries: AGM battery with red terminal, aluminum coolant surge tank, washer tank, silicone hoses
    add(new THREE.BoxGeometry(0.21, 0.17, 0.16), darkPlastic, -0.49, 0.52, z - 0.30);
    add(new THREE.BoxGeometry(0.04, 0.025, 0.04), redCrinkle, -0.44, 0.615, z - 0.26);
    add(new THREE.CylinderGeometry(0.068, 0.068, 0.17, 18), castAlu, 0.49, 0.54, z + 0.34);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.028, 12), redCrinkle, 0.49, 0.64, z + 0.34);
    // Curved silicone radiator hose from engine front to radiator tank
    addTube(g, [[0.14, 0.72, z + 0.32], [0.24, 0.71, z + 0.45], [0.34, 0.67, z + 0.57]], 0.020, blackRubber, 12, 8);
    addTube(g, [[-0.24, 0.64, z + 0.30], [-0.36, 0.62, z + 0.46], [-0.38, 0.64, z + 0.57]], 0.016, blackRubber, 10, 8);
  }

  // ---- Architecture-specific sculpted 3D engine centerpiece ----
  if (arch === 'ev') {
    add(new THREE.BoxGeometry(0.68, 0.16, 0.56), weatheredCast, 0, 0.52, z);
    add(new THREE.BoxGeometry(0.60, 0.04, 0.48), carbon, 0, 0.62, z);
    for (let i = -4; i <= 4; i++) add(new THREE.BoxGeometry(0.014, 0.024, 0.44), polAlu, i * 0.062, 0.648, z);
    for (const sx of [-1, 1]) {
      addTube(g, [[sx * 0.34, 0.56, z + 0.22], [sx * 0.38, 0.56, z - 0.18], [sx * 0.22, 0.56, z - 0.36]], 0.018, hvOrange, 12, 8);
    }
    return g;
  }

  if (arch === 'sc-v8') {
    // Sculpted Twin-Screw Supercharged V8: cast block, finned red/aluminum valve covers, 8 coils,
    // 8 curved tubular exhaust headers, twin-lobe rounded billet supercharger housing, CNC cooling ribs,
    // braided AN fuel rails, exposed serpentine belt drive with idler pulleys, and carbon cold-air intake!
    add(new THREE.BoxGeometry(0.44, 0.24, 0.68), blockIron, 0, 0.53, z);
    for (const sx of [-1, 1]) {
      // Angled cylinder heads + sculpted ribbed crinkle-red valve covers
      add(new THREE.BoxGeometry(0.18, 0.18, 0.64), weatheredCast, sx * 0.21, 0.64, z, 0, 0, -sx * 0.36);
      add(new THREE.BoxGeometry(0.16, 0.042, 0.60), redCrinkle, sx * 0.28, 0.745, z, 0, 0, -sx * 0.36);
      for (let r = -1; r <= 1; r++) {
        add(new THREE.BoxGeometry(0.008, 0.010, 0.56), polAlu, sx * (0.28 + r * 0.032), 0.772 - r * 0.012, z, 0, 0, -sx * 0.36);
      }
      // 4 sculpted coil packs + spark plug boots + anodized billet fuel rail & AN fittings per bank
      for (let i = 0; i < 4; i++) {
        const pz = z - 0.21 + i * 0.14;
        add(new THREE.BoxGeometry(0.042, 0.028, 0.048), darkPlastic, sx * 0.30, 0.785, pz, 0, 0, -sx * 0.36);
        add(new THREE.BoxGeometry(0.034, 0.008, 0.036), redCrinkle, sx * 0.305, 0.802, pz, 0, 0, -sx * 0.36);
        // Individual curved tubular exhaust header runner sweeping down into collector
        addTube(g, [
          [sx * 0.27, 0.62, pz],
          [sx * 0.39, 0.60, pz - 0.02],
          [sx * 0.43, 0.51, pz - 0.08],
          [sx * 0.38, 0.44, z - 0.30],
        ], 0.016, headerBrass, 10, 7);
      }
      // Anodized fuel rail + braided crossover line
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.56, 10), anBlue, sx * 0.175, 0.775, z, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.022, 8), redCrinkle, sx * 0.175, 0.775, z + 0.29, Math.PI / 2, 0, 0);
    }
    // Sculpted Twin-Screw Supercharger Housing (twin rounded rotor barrels + chamfered central intercooler lid!)
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.072, 0.072, 0.54, 18), weatheredCast, sx * 0.078, 0.805, z - 0.02, Math.PI / 2, 0, 0);
    }
    add(new THREE.BoxGeometry(0.18, 0.125, 0.55), gunmetal, 0, 0.818, z - 0.02);
    // Sculpted dark-carbon / billet intercooler top lid with beveled edges & 9 CNC cooling ribs (ZERO flat photo stickers!)
    add(new THREE.BoxGeometry(0.24, 0.032, 0.50), carbon, 0, 0.882, z - 0.02);
    add(new THREE.BoxGeometry(0.11, 0.014, 0.44), gunmetal, 0, 0.902, z - 0.02);
    for (let i = -4; i <= 4; i++) {
      const h = i === 0 ? 0.016 : 0.012;
      add(new THREE.BoxGeometry(0.008, h, 0.47), polAlu, i * 0.026, 0.904, z - 0.02);
    }
    // Engraved billet plaque + red anodized hex bolts around lid perimeter
    add(new THREE.BoxGeometry(0.10, 0.008, 0.085), polAlu, 0, 0.912, z + 0.08);
    add(new THREE.BoxGeometry(0.082, 0.009, 0.068), redCrinkle, 0, 0.913, z + 0.08);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        add(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 6), polAlu, sx * 0.112, 0.902, z - 0.22 + i * 0.135);
      }
    }
    // Tapered machined supercharger snout + ribbed billet pulley + crank pulley + tensioner + belt loop
    add(new THREE.CylinderGeometry(0.042, 0.058, 0.22, 18), weatheredCast, 0, 0.815, z + 0.34, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.056, 0.056, 0.034, 24), polAlu, 0, 0.815, z + 0.455, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.038, 20), redCrinkle, 0, 0.815, z + 0.458, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.032, 20), gunmetal, 0, 0.56, z + 0.445, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.026, 16), polAlu, 0.11, 0.69, z + 0.45, Math.PI / 2, 0, 0); // idler
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.026, 16), steel, -0.12, 0.67, z + 0.45, Math.PI / 2, 0, 0); // alternator pulley
    // Serpentine belt runs
    add(new THREE.BoxGeometry(0.018, 0.26, 0.028), blackRubber, -0.055, 0.69, z + 0.45, 0, 0, -0.10);
    add(new THREE.BoxGeometry(0.018, 0.15, 0.028), blackRubber, 0.065, 0.75, z + 0.45, 0, 0, 0.38);
    add(new THREE.BoxGeometry(0.018, 0.15, 0.028), blackRubber, 0.062, 0.62, z + 0.45, 0, 0, -0.35);
    // Curved carbon cold-air intake tube sweeping from billet throttle body to red conical filter
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.08, 18), polAlu, 0, 0.82, z - 0.33, Math.PI / 2, 0, 0);
    addTube(g, [[0, 0.82, z - 0.35], [-0.14, 0.81, z - 0.40], [-0.30, 0.76, z - 0.22], [-0.38, 0.72, z + 0.14]], 0.042, carbon, 16, 10);
    add(new THREE.CylinderGeometry(0.054, 0.070, 0.15, 18), filterRed, -0.39, 0.71, z + 0.26, Math.PI / 2, 0, 0);
  } else if (arch === 'tt-v8' || arch === 'w16-quad') {
    // Sculpted Hypercar Twin-Turbo V8 / Quad-Turbo W16: twin angled dry-carbon plenums, titanium X-brace,
    // prominent exposed compressor snails, curved titanium charge pipes & heat-blued exhaust headers!
    add(new THREE.BoxGeometry(0.48, 0.24, 0.70), blockIron, 0, 0.52, z);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.20, 0.18, 0.66), gunmetal, sx * 0.22, 0.63, z, 0, 0, -sx * 0.38);
      add(new THREE.BoxGeometry(0.18, 0.045, 0.60), carbon, sx * 0.28, 0.74, z, 0, 0, -sx * 0.38);
      // Sculpted twin parallel dry-carbon intake plenums with billet runners
      add(new THREE.CylinderGeometry(0.058, 0.066, 0.56, 16), carbon, sx * 0.115, 0.815, z - 0.02, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.085, 0.024, 0.52), redCrinkle, sx * 0.115, 0.865, z - 0.02);
      for (let i = 0; i < 4; i++) {
        const pz = z - 0.20 + i * 0.13;
        add(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 10), polAlu, sx * 0.20, 0.77, pz, 0, 0, sx * 0.85);
      }
      // Prominent exposed twin turbos + curved burnt-titanium charge pipes sweeping into plenums
      addTurboSnail(g, sx * 0.23, 0.75, z + 0.25, 1.15, sx, polAlu, blockIron, burntTi, blackRubber);
      addTube(g, [[sx * 0.23, 0.79, z + 0.26], [sx * 0.20, 0.85, z + 0.29], [sx * 0.12, 0.83, z + 0.25]], 0.026, burntTi, 12, 8);
      if (arch === 'w16-quad') {
        addTurboSnail(g, sx * 0.25, 0.74, z - 0.17, 1.05, sx, polAlu, blockIron, burntTi, blackRubber);
      }
    }
    // Sculpted structural titanium X-brace across engine bay
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.78, 10), burntTi, 0, 0.895, z - 0.02, Math.PI / 2, 0.52, 0);
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.78, 10), burntTi, 0, 0.895, z - 0.02, Math.PI / 2, -0.52, 0);
    add(new THREE.BoxGeometry(0.11, 0.018, 0.14), polAlu, 0, 0.895, z - 0.02);
  } else if (arch === 'na-v10') {
    add(new THREE.BoxGeometry(0.48, 0.24, 0.76), blockIron, 0, 0.52, z);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.18, 0.18, 0.72), gunmetal, sx * 0.22, 0.63, z, 0, 0, -sx * 0.36);
      add(new THREE.CylinderGeometry(0.062, 0.068, 0.64, 16), carbon, sx * 0.13, 0.79, z, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.044, 0.044, 0.10, 16), polAlu, sx * 0.13, 0.79, z + 0.36, Math.PI / 2, 0, 0);
      for (let i = 0; i < 5; i++) {
        add(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 12), polAlu, sx * 0.22, 0.74, z - 0.24 + i * 0.12, 0, 0, sx * 0.9);
      }
    }
    add(new THREE.BoxGeometry(0.06, 0.022, 0.58), redCrinkle, 0, 0.82, z);
  } else if (arch === 'v12') {
    add(new THREE.BoxGeometry(0.50, 0.24, 0.82), blockIron, 0, 0.52, z);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.17, 0.055, 0.78), redCrinkle, sx * 0.30, 0.73, z, 0, 0, -sx * 0.32);
      add(new THREE.CylinderGeometry(0.052, 0.052, 0.74, 16), polAlu, sx * 0.11, 0.80, z, Math.PI / 2, 0, 0);
      for (let i = 0; i < 6; i++) {
        add(new THREE.TorusGeometry(0.075, 0.017, 8, 16, Math.PI), polAlu, sx * 0.18, 0.75, z - 0.30 + i * 0.12, 0, 0, sx * 0.3);
      }
    }
  } else if (arch === 'i6-turbo' || arch === 'i5-turbo' || arch === 'i4-turbo') {
    const len = arch === 'i6-turbo' ? 0.74 : arch === 'i5-turbo' ? 0.64 : 0.52;
    add(new THREE.BoxGeometry(0.28, 0.28, len), blockIron, 0.06, 0.56, z);
    add(new THREE.BoxGeometry(0.24, 0.065, len - 0.04), arch === 'i6-turbo' ? redCrinkle : weatheredCast, 0.06, 0.73, z);
    add(new THREE.BoxGeometry(0.16, 0.036, len - 0.08), carbon, 0.06, 0.785, z);
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.008, 0.008, len - 0.12), polAlu, 0.06 + i * 0.032, 0.808, z);
    addTurboSnail(g, -0.22, 0.68, z + 0.08, 1.25, -1, polAlu, blockIron, burntTi, blackRubber);
    add(new THREE.CylinderGeometry(0.048, 0.066, 0.16, 18), filterRed, -0.24, 0.70, z + 0.30, Math.PI / 2, 0, 0);
    addTube(g, [[-0.22, 0.74, z + 0.10], [-0.14, 0.79, z + 0.26], [0.16, 0.77, z + 0.26]], 0.026, polAlu, 14, 8);
    const cyls = arch === 'i6-turbo' ? 6 : arch === 'i5-turbo' ? 5 : 4;
    for (let i = 0; i < cyls; i++) {
      const pz = z - (len * 0.4) + (i / Math.max(1, cyls - 1)) * (len * 0.8);
      addTube(g, [[-0.04, 0.68, pz], [-0.15, 0.66, pz], [-0.21, 0.64, z + 0.04]], 0.017, burntTi, 10, 7);
    }
  } else if (arch === 'rotary') {
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 24), weatheredCast, 0, 0.56, z, Math.PI / 2, 0, 0);
    add(new THREE.BoxGeometry(0.32, 0.09, 0.38), polAlu, 0, 0.72, z);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.048, 0.036, 0.16, 18), polAlu, sx * 0.11, 0.78, z + 0.24, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 16), blackRubber, sx * 0.11, 0.78, z + 0.32, Math.PI / 2, 0, 0);
    }
    addTurboSnail(g, -0.24, 0.62, z - 0.06, 1.1, -1, polAlu, blockIron, burntTi, blackRubber);
  } else if (arch === 'muscle-v8' || arch === 'sports-v8') {
    add(new THREE.BoxGeometry(0.46, 0.25, 0.70), blockIron, 0, 0.54, z);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.19, 0.19, 0.66), gunmetal, sx * 0.21, 0.65, z, 0, 0, -sx * 0.34);
      add(new THREE.BoxGeometry(0.17, 0.046, 0.60), arch === 'muscle-v8' ? redCrinkle : weatheredCast, sx * 0.28, 0.76, z, 0, 0, -sx * 0.34);
      for (let i = 0; i < 4; i++) {
        const pz = z - 0.20 + i * 0.135;
        addTube(g, [[sx * 0.26, 0.62, pz], [sx * 0.38, 0.58, pz - 0.03], [sx * 0.38, 0.45, z - 0.28]], 0.016, headerBrass, 10, 7);
      }
    }
    add(new THREE.BoxGeometry(0.30, 0.10, 0.56), arch === 'sports-v8' ? carbon : darkPlastic, 0, 0.81, z);
    for (let i = -3; i <= 3; i++) add(new THREE.BoxGeometry(0.010, 0.012, 0.50), polAlu, i * 0.038, 0.866, z);
    if (arch === 'muscle-v8') {
      addTube(g, [[0, 0.80, z + 0.26], [-0.18, 0.80, z + 0.32], [-0.34, 0.76, z + 0.36]], 0.040, polAlu, 12, 10);
      add(new THREE.CylinderGeometry(0.056, 0.072, 0.18, 18), filterRed, -0.36, 0.76, z + 0.37, 0, 0.3, Math.PI / 2);
    }
  } else {
    // Everyday commuter-i4, suv-v6, v6-sedan, pickup-v8, diesel-i4, diesel-v8, hybrid
    const isV = arch === 'suv-v6' || arch === 'v6-sedan' || arch === 'pickup-v8' || arch === 'diesel-v8';
    const isDiesel = arch === 'diesel-i4' || arch === 'diesel-v8';
    add(new THREE.BoxGeometry(isV ? 0.44 : 0.30, 0.26, 0.62), blockIron, 0, 0.54, z);
    add(new THREE.BoxGeometry(isV ? 0.46 : 0.34, 0.075, 0.52), darkPlastic, 0, 0.74, z);
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.016, 0.012, 0.44), gunmetal, i * (isV ? 0.08 : 0.055), 0.782, z);
    add(new THREE.BoxGeometry(0.14, 0.010, 0.06), polAlu, 0, 0.785, z + 0.12);
    addTube(g, [[0, 0.72, z + 0.24], [-0.20, 0.72, z + 0.24], [-0.36, 0.68, z + 0.28]], 0.034, blackRubber, 10, 8);
    add(new THREE.BoxGeometry(0.20, 0.14, 0.24), darkPlastic, -0.38, 0.66, z + 0.28);
    if (isDiesel) {
      addTurboSnail(g, 0.26, 0.68, z + 0.06, 1.15, 1, weatheredCast, blockIron, steel, blackRubber);
    }
    if (arch === 'hybrid') {
      add(new THREE.BoxGeometry(0.24, 0.12, 0.26), weatheredCast, 0.32, 0.66, z - 0.04);
      addTube(g, [[0.30, 0.68, z - 0.16], [0.26, 0.68, z - 0.34], [0.16, 0.64, z - 0.44]], 0.014, hvOrange, 10, 8);
    }
  }

  if (isMid) {
    g.position.y = -0.17;
    g.scale.set(0.80, 0.72, 0.80);
  }
  return g;
}
