// Plajah Vegetation — bark and leaf materials with the wind sway (TSL, WebGPU).
//
// Instanced: each instance carries aInst = (world x, world z, yaw, height scale), so the wind is sampled where the tree
// stands and turned into the tree's own frame. Sway = trunk bow (height²) + bend (flexibility summed from the base —
// continuous at joints) + each branch's own swing (phase per branch) + leaf flutter (leaves only).
import * as THREE from 'three/webgpu';
import { attribute, color, float, max, mix, normalView, positionLocal, positionViewDirection, sin, smoothstep, texture, time, uniform, uv, vec2, vec3, normalGeometry, positionGeometry } from 'three/tsl';
import type { TreeSpecies } from '../species';
import { pushAt, toLocal, windAt } from '../wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
const pending = new Set<Promise<void>>();
/** Resolves when every texture the tree materials asked for has loaded (bakes must wait for it). */
export const texturesReady = () => Promise.all([...pending]).then(() => undefined);
function tex(url: string, srgb: boolean, repeat: boolean) {
  const k = url + srgb + repeat;
  let t = cache.get(k);
  if (!t) {
    let done!: () => void;
    const pr = new Promise<void>((r) => { done = r; });
    pending.add(pr);
    t = loader.load(url, () => done(), undefined, () => done());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    cache.set(k, t);
  }
  return t;
}

/** The swayed local position (shared by wood and leaves). */
function swayed(sp: TreeSpecies, height: number, leaves: boolean): N {
  const inst: N = attribute('aInst', 'vec4'), sw: N = attribute('aSway', 'vec4');
  const pushL: N = toLocal(pushAt(inst.xy), inst.z);
  const w: N = windAt(inst.xy);
  const trunk: N = pushL.mul(sw.x.mul(sp.wind.trunk * height * 0.05));
  const bend: N = pushL.mul(sw.y.mul(sp.wind.branch * 0.3));
  // each branch's own swing: across the wind and a little up/down, its own rhythm
  const ph: N = sw.z.mul(6.283);
  const swing: N = sin(time.mul(float(1.3).add(sw.z.mul(1.1))).add(ph)).mul(w.mul(0.6).add(0.08)).mul(sw.w).mul(sp.wind.branch * 0.12);
  const across: N = vec2(pushL.y.negate(), pushL.x).add(vec2(0.3, 0.3));
  let off: N = vec3(trunk.x.add(bend.x).add(across.x.mul(swing)), trunk.dot(trunk).add(bend.dot(bend)).mul(-0.25).add(swing.mul(0.35)), trunk.y.add(bend.y).add(across.y.mul(swing)));
  if (leaves) {
    const fl: N = sin(time.mul(8.5).add(ph.mul(7)).add(positionLocal.x.mul(2.3)).add(positionLocal.y.mul(1.7))).mul(w.mul(0.8).add(0.15)).mul(sp.wind.flutter * 0.07);
    off = off.add(vec3(fl, fl.mul(0.6), fl.negate()));
  }
  return positionLocal.add(off);
}

export interface TreeMaterials { wood: THREE.MeshStandardNodeMaterial; leaves: THREE.MeshStandardNodeMaterial; cables: THREE.MeshStandardNodeMaterial | null }

export function treeMaterials(sp: TreeSpecies, height: number, o: { beat?: N } = {}): TreeMaterials {
  const beat: N = o.beat ?? uniform(0);
  // ── bark: the art's bark set, tinted; glowing conduit veins in long bands (Cyber Forest) ──
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const barkMap = tex(sp.bark.map, true, true);
  wood.colorNode = texture(barkMap, uv()).rgb.mul(color(sp.bark.tint)).mul(1.6);
  if (sp.bark.normal) { wood.normalMap = tex(sp.bark.normal, false, true); wood.normalScale.set(1.5, 1.5); }
  if (sp.bark.moss) {
    // moss: on the tops of limbs and up the lower trunk (wettest), thickest in the bark's dark crevices
    const bark: N = texture(barkMap, uv()).rgb, crev: N = float(1).sub(bark.dot(vec3(0.3, 0.55, 0.15)).mul(1.6)).clamp(0, 1);
    const upF: N = smoothstep(float(0.15), float(0.75), normalGeometry.y);
    const low: N = smoothstep(float(height * 0.22), float(0), positionGeometry.y);
    // patches, not a wash: a coarse second read of the bark breaks the moss up, and it keeps to the crevices (the bark's
    // own colour and relief stay readable between patches)
    const patch: N = smoothstep(float(0.38), float(0.62), texture(barkMap, uv().mul(vec2(0.23, 0.11))).g);
    const mask: N = max(upF, low.mul(0.85)).mul(crev.mul(0.8).add(0.2)).mul(patch).mul(sp.bark.moss.amount).clamp(0, 1);
    const mossC: N = color(sp.bark.moss.color).mul(bark.g.mul(0.9).add(0.45));
    wood.colorNode = mix(wood.colorNode as N, mossC, mask);
  }
  if (sp.bark.veins) {
    const cond: N = texture(tex(sp.bark.veins.map, true, true), uv().mul(vec2(0.9, 0.5))).rgb;
    const band: N = smoothstep(float(0.55), float(0.62), sin(uv().x.mul(5.3).add(sin(uv().y.mul(0.7)).mul(1.4))).mul(0.5).add(0.5));
    const lit: N = smoothstep(float(0.45), float(0.8), max(cond.b, cond.g));
    wood.emissiveNode = color(sp.bark.veins.color).mul(lit).mul(band).mul(float(sp.bark.veins.strength).mul(float(0.8).add(sin(time.mul(1.7)).mul(0.25))).add(beat.mul(0.6)));
  }
  wood.positionNode = swayed(sp, height, false);

  // ── leaves: clusters cut from the art; light through the leaves when looking toward the light side; art glow ──
  const leaves = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42, roughness: 0.8 });
  const atlas = tex(sp.leaves.atlas, true, false);
  const c: N = texture(atlas, uv());
  leaves.colorNode = c.rgb.mul(color(sp.leaves.tint));
  leaves.opacityNode = c.a;
  // translucency: cards seen edge-on / from behind glow softly with the transmission colour (cheap, no extra pass)
  const back: N = float(1).sub(normalView.dot(positionViewDirection).abs()).mul(0.5).add(0.15);
  let em: N = c.rgb.mul(color(sp.leaves.transmission)).mul(back.mul(0.35));
  if (sp.leaves.glow) {
    const g = sp.leaves.glow;
    const glowMask: N = smoothstep(float(0.05), float(0.35), max(c.b.sub(c.r), c.g.sub(c.r).mul(0.6)));
    em = em.add(mix(c.rgb, color(g.color), 0.35).mul(glowMask).mul(float(g.strength).add(beat.mul(g.beat))));
  }
  leaves.emissiveNode = em;
  leaves.positionNode = swayed(sp, height, true);
  // ── conduit cables: dark cords with light running up them, brighter on the beat ──
  let cables: THREE.MeshStandardNodeMaterial | null = null;
  if (sp.bark.conduits) {
    cables = new THREE.MeshStandardNodeMaterial({ color: 0x15191c, roughness: 0.35, metalness: 0.6 });
    const ph: N = uv().x.mul(0.22).sub(time.mul(0.55)).fract();
    const pulse: N = smoothstep(float(0), float(0.08), ph).mul(smoothstep(float(0.4), float(0.1), ph));
    cables.emissiveNode = color(sp.bark.conduits.color).mul(float(0.22).add(pulse.mul(1.8)).add(beat.mul(1.0)));
    cables.positionNode = swayed(sp, height, false);
  }
  return { wood, leaves, cables };
}
