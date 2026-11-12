/**
 * forgeKit.ts — every piece of a Forge character's armour, wardrobe and weapons as its own 3D asset.
 *
 * The character is built from these pieces (the wardrobe tags each vertex with its piece), so the assets and the worn
 * kit are the same geometry. Each piece leaves as one GLB in its own frame (origin at the bottom of its middle), split
 * into nodes by what moves on its own (each tasset, each shoulder guard, left and right), with its materials and their
 * detail maps, and a manifest says what it is, its era and evidence, its size, the bone it hangs from, and where it sits
 * as worn, so a game can loot it, show it on a stand, or put it on someone else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeGlb, type GMaterial, type GMesh, type GNode, type GPrim } from '../../services/argilla/creature/gltfWriter';
import { MeshBuilder, unitBox, type Wardrobe } from '../../services/argilla/creature/wardrobe';
import { nihonto, saya } from '../../services/argilla/creature/weapons';
import type { Vec3 } from '../../services/argilla/engine';

export interface KitAsset {
  id: string; label: string; era: string; refs: string[]; file: string;
  /** Metres: width (x), height (y), depth (z). */
  size: [number, number, number];
  tris: number; nodes: string[];
  /** As worn: the bone it hangs from, and where the asset's origin sits in the character's rest pose. */
  attach: string; restOrigin: Vec3;
  kind: 'armour' | 'garment' | 'weapon';
}

const GARMENTS = new Set(['hakama', 'kosode', 'eri', 'obi']);
const ATTACH: Record<string, string> = { do: 'Spine1', kusazuri: 'Hips', sode: 'Spine2', kote: 'Spine2', suneate: 'Hips', haidate: 'Hips', kabuto: 'Head', hakama: 'Hips', kosode: 'Spine1', eri: 'Spine2', obi: 'Hips' };
/** The node a vertex goes in: its bone, less a chain link's number (Kusazuri3_2 -> Kusazuri3). */
const family = (bone: string) => bone.replace(/_\d+$/, '');

export function exportKit(opts: {
  kit: Wardrobe; materials: GMaterial[]; images: (Uint8Array | { bytes: Uint8Array; mime: string })[]; materialIndex: Record<string, number>;
  outDir: string; character: string;
}) {
  const { kit, outDir } = opts;
  fs.mkdirSync(outDir, { recursive: true });
  const assets: KitAsset[] = [];
  // gather each tagged piece's triangles, by node and material
  type Part = Map<string, Map<string, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>>;
  const byPiece = new Map<string, Part>();
  const take = (mat: string, mb: MeshBuilder) => {
    const remaps = new Map<object, Map<number, number>>(); // per group: a vertex shared by two groups is copied into each
    for (let t = 0; t < mb.idx.length; t += 3) {
      const vs = [mb.idx[t], mb.idx[t + 1], mb.idx[t + 2]];
      const tag = mb.tags[vs[0]];
      if (!tag || vs.some((v) => mb.tags[v] !== tag)) continue;
      let part = byPiece.get(tag); if (!part) { part = new Map(); byPiece.set(tag, part); }
      const fam = family(mb.bone[vs[0]]);
      let node = part.get(fam); if (!node) { node = new Map(); part.set(fam, node); }
      let g = node.get(mat); if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; node.set(mat, g); }
      let remap = remaps.get(g); if (!remap) { remap = new Map(); remaps.set(g, remap); }
      for (const v of vs) {
        let i = remap.get(v);
        if (i === undefined) {
          i = g.pos.length / 3; remap.set(v, i);
          g.pos.push(mb.pos[v * 3], mb.pos[v * 3 + 1], mb.pos[v * 3 + 2]); g.nor.push(mb.nor[v * 3], mb.nor[v * 3 + 1], mb.nor[v * 3 + 2]); g.uv.push(mb.uv[v * 2], mb.uv[v * 2 + 1]);
        }
        g.idx.push(i);
      }
    }
  };
  for (const [mat, mb] of kit.armour) take(mat, mb);
  for (const [mat, mb] of kit.cloth) take(mat, mb);
  for (const [mat, mb] of kit.kabuto) take(mat, mb);
  // the dō's kebiki lacing is GPU-instanced on the character: here it becomes real cords on the dō
  const box = unitBox();
  for (const l of kit.lacing) {
    const node = byPiece.get('do')?.get(l.bone) ?? (() => { const part = byPiece.get('do') ?? new Map(); byPiece.set('do', part); const n = new Map(); part.set(l.bone, n); return n; })();
    let g = node.get('silk'); if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; node.set('silk', g); }
    for (let k = 0; k < l.t.length / 3; k++) {
      const [qx, qy, qz, qw] = [l.r[k * 4], l.r[k * 4 + 1], l.r[k * 4 + 2], l.r[k * 4 + 3]];
      const rot = (v: number[]): Vec3 => { // q * v * q^-1
        const ix = qw * v[0] + qy * v[2] - qz * v[1], iy = qw * v[1] + qz * v[0] - qx * v[2], iz = qw * v[2] + qx * v[1] - qy * v[0], iw = -qx * v[0] - qy * v[1] - qz * v[2];
        return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
      };
      const base = g.pos.length / 3;
      for (let v = 0; v < box.count; v++) {
        const p = rot([box.pos[v * 3] * l.s[k * 3], box.pos[v * 3 + 1] * l.s[k * 3 + 1], box.pos[v * 3 + 2] * l.s[k * 3 + 2]]);
        g.pos.push(p[0] + l.t[k * 3], p[1] + l.t[k * 3 + 1], p[2] + l.t[k * 3 + 2]);
        const n = rot([box.nor[v * 3], box.nor[v * 3 + 1], box.nor[v * 3 + 2]]); g.nor.push(n[0], n[1], n[2]); g.uv.push(box.uv[v * 2], box.uv[v * 2 + 1]);
      }
      for (const i of box.idx) g.idx.push(base + i);
    }
  }
  const label = new Map(kit.pieces.map((p) => [p.id, p]));
  const write = (id: string, part: Part, kind: KitAsset['kind'], attach: string, meta = label.get(id)) => {
    // the asset's frame: the bottom of its middle
    let mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const node of part.values()) for (const g of node.values()) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
    const origin: Vec3 = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
    const matUsed = new Map<number, number>(), imgUsed = new Map<number, number>();
    const materials: GMaterial[] = [], images: typeof opts.images = [];
    const matOf = (name: string) => {
      const src = opts.materialIndex[name] ?? 0;
      let i = matUsed.get(src);
      if (i === undefined) {
        const m: GMaterial = { ...opts.materials[src] };
        for (const k of ['baseColorTexture', 'normalTexture', 'ormTexture'] as const) {
          const t = m[k]; if (t === undefined) continue;
          let j = imgUsed.get(t); if (j === undefined) { j = images.length; images.push(opts.images[t]); imgUsed.set(t, j); }
          m[k] = j;
        }
        i = materials.length; materials.push(m); matUsed.set(src, i);
      }
      return i;
    };
    const nodes: GNode[] = [{ name: id, children: [] }];
    const meshes: GMesh[] = [];
    let tris = 0;
    for (const [fam, node] of part) {
      const prims: GPrim[] = [];
      for (const [mat, g] of node) {
        const pos = new Float32Array(g.pos.length);
        for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = g.pos[i + k] - origin[k];
        prims.push({ positions: pos, normals: new Float32Array(g.nor), uvs: new Float32Array(g.uv), indices: new Uint32Array(g.idx), material: matOf(mat) });
        tris += g.idx.length / 3;
      }
      meshes.push({ name: `${id}_${fam}`, primitives: prims });
      nodes[0].children!.push(nodes.length);
      nodes.push({ name: fam, mesh: meshes.length - 1 });
    }
    const file = `${id}.glb`;
    fs.writeFileSync(path.join(outDir, file), writeGlb({ nodes, roots: [0], meshes, materials, images, skins: [], extras: { forgeKit: { id, character: opts.character } } }));
    assets.push({
      id, label: meta?.label ?? id, era: meta?.era ?? '', refs: meta?.refs ?? [], file, kind, attach, restOrigin: origin.map((v) => +v.toFixed(4)) as Vec3,
      size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +v.toFixed(3)) as [number, number, number], tris, nodes: [...part.keys()],
    });
  };
  for (const [id, part] of byPiece) write(id, part, GARMENTS.has(id) ? 'garment' : 'armour', ATTACH[id] ?? 'Hips');

  // ---- weapons: built on their own, in their own frame (blade along +y from the hilt's end) ------------------------
  const asPart = (meshes: Map<string, MeshBuilder>, fam: string): Part => new Map([[fam, new Map([...meshes].map(([mat, mb]) => [mat, { pos: [...mb.pos], nor: [...mb.nor], uv: [...mb.uv], idx: [...mb.idx] }]))]]);
  const katana = nihonto({ nagasa: 0.7, tsuka: 0.25, sori: 0.016, width: 0.032, bone: '' });
  const weaponMeta = (id: string, text: string) => ({ id, label: text, era: 'Sengoku–early Edo (c. 1570–1620)', refs: ['Momoyama uchigatana koshirae, the Met'] });
  write('katana', asPart(katana.meshes, 'katana'), 'weapon', 'RightHand', weaponMeta('katana', 'Katana: 70 cm blade, ray-skin and silk tsuka, iron tsuba'));
  // the scabbard as the art draws it worn: with the sheathed sword's hilt standing out of it
  write('katana_saya', asPart(saya({ length: 0.76, sori: 0.016, bone: '', hilt: 0.25 }), 'saya'), 'weapon', 'Hips', weaponMeta('katana_saya', 'Katana in its saya: black lacquer, navy sageo, the hilt out of the mouth'));
  write('wakizashi', asPart(saya({ length: 0.54, sori: 0.012, bone: '', hilt: 0.17 }), 'wakizashi'), 'weapon', 'Hips', weaponMeta('wakizashi', 'Wakizashi in its saya'));

  fs.writeFileSync(path.join(outDir, 'kit.json'), JSON.stringify({ character: opts.character, assets }, null, 2));
  return assets;
}
