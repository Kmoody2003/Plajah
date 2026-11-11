/**
 * weapons.ts — swords built from their period construction, in socket space: +y runs from the hilt toward the tip,
 * +x is the cutting edge's side. A socket on the hand or in the obi carries them (docs/character-forge.md §3).
 */
import type { Vec3 } from '../engine';
import { MeshBuilder, sheet, tube } from './wardrobe';

export interface Blade { meshes: Map<string, MeshBuilder>; base: Vec3; tip: Vec3 }

/** A curved single-edged blade (shinogi-zukuri) with habaki, tsuba and a cord-wrapped tsuka. Origin at the tsuba. */
export function nihonto(opts: { nagasa: number; tsuka: number; sori: number; width: number; bone: string }): Blade {
  const meshes = new Map<string, MeshBuilder>();
  const M = (m: string) => { let b = meshes.get(m); if (!b) { b = new MeshBuilder(); meshes.set(m, b); } return b; };
  const { nagasa, tsuka, sori, width, bone } = opts;
  const y0 = 0.03, y1 = y0 + nagasa;
  // the curve: the back (mune) bows away from the edge, deepest near the hilt third (koshi-zori)
  const curve = (t: number) => -sori * Math.sin(Math.PI * Math.min(1, t * 0.85)) * (0.6 + 0.4 * t);
  // cross-section around the blade: edge (ha) → shinogi ridge → mune, both faces
  const section = (t: number): [number, number][] => {
    const w = width * (1 - 0.32 * t), th = 0.0072 * (1 - 0.35 * t);
    const kissaki = t > 0.93 ? (t - 0.93) / 0.07 : 0;
    const wk = w * (1 - kissaki * 0.97);
    return [[wk / 2, 0], [-wk * 0.15, th / 2], [-wk / 2, th * 0.32], [-wk / 2, -th * 0.32], [-wk * 0.15, -th / 2]];
  };
  const steel = M('katana_steel');
  sheet(steel, 5, 60, (u, v) => {
    const s = section(v);
    const f = u * 5, i = Math.floor(f) % 5, k = f - Math.floor(f);
    const a = s[i], b = s[(i + 1) % 5];
    const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
    return [x + curve(v), y0 + nagasa * v, z];
  }, bone, [1, 4]);
  // habaki (gold collar) and tsuba (iron guard)
  tube(M('gold'), [[curve(0), 0.002, 0], [curve(0), y0, 0]], width * 0.62, 10, bone, 0.45);
  tube(M('iron'), [[0, -0.004, 0], [0, 0.004, 0]], 0.038, 24, bone);
  // tsuka: oval grip in its silk wrap, with the iron kashira cap
  tube(M('silk'), [[0, -0.006, 0], [0, -tsuka * 0.5, 0], [0, -tsuka + 0.012, 0]], (t) => 0.0145 + 0.0015 * Math.sin(t * Math.PI), 14, bone, 0.78);
  tube(M('iron'), [[0, -tsuka + 0.014, 0], [0, -tsuka, 0]], 0.0145, 12, bone, 0.78);
  return { meshes, base: [curve(0.05), y0 + 0.04, 0], tip: [curve(1), y1, 0] };
}

/** A lacquered scabbard: mouth at the origin, running down −y. With `hilt`, a sheathed sword's grip and guard above. */
export function saya(opts: { length: number; sori: number; bone: string; hilt?: number }): Map<string, MeshBuilder> {
  const meshes = new Map<string, MeshBuilder>();
  const M = (m: string) => { let b = meshes.get(m); if (!b) { b = new MeshBuilder(); meshes.set(m, b); } return b; };
  const { length, sori, bone, hilt } = opts;
  const pts: Vec3[] = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([-sori * Math.sin(Math.PI * t * 0.85), -t * length, 0]); }
  tube(M('lacquerBlack'), pts, (t) => 0.016 * (1 - t * 0.15), 12, bone, 0.62);
  tube(M('iron'), [pts[16], [pts[16][0], pts[16][1] - 0.012, 0]], 0.0138, 10, bone, 0.62);
  tube(M('gold'), [[0, 0.004, 0], [0, -0.012, 0]], 0.0172, 12, bone, 0.62); // koiguchi
  // sageo: the cord tied at the kurikata
  const sageo: Vec3[] = [];
  for (let k = 0; k <= 10; k++) sageo.push([0.018 + k * 0.004, -0.11 - k * 0.012, Math.sin(k) * 0.004]);
  tube(M('silk'), sageo, 0.0035, 5, bone, 0.4);
  if (hilt) {
    tube(M('iron'), [[0, 0.008, 0], [0, 0.016, 0]], 0.032, 20, bone);
    tube(M('silk'), [[0, 0.016, 0], [0, hilt * 0.5, 0], [0, hilt - 0.01, 0]], (t) => 0.013 + 0.0015 * Math.sin(t * Math.PI), 12, bone, 0.78);
    tube(M('iron'), [[0, hilt - 0.01, 0], [0, hilt + 0.002, 0]], 0.013, 10, bone, 0.78);
  }
  return meshes;
}
