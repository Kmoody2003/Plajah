// Score the Cyber Forest fungi against their sprites (front silhouettes) and write a side-by-side debug image.
// npx tsx scripts/vegetation/scoreFungi.ts [out.png]
import sharp from 'sharp';
import { CYBER_FOREST_FUNGI } from '../../services/vegetation/catalog/cyberForestFungi';
import { buildFungus } from '../../services/vegetation/fungi/build';
import { artGrid, compare, meshSilhouette, type Grid } from '../../services/vegetation/fromArt/score';
import type { Mask } from '../../services/vegetation/fromArt/profile';
const SPR = '../../public/games/rift-realm/assets/cyberforest/';
const map: Record<string, string> = { 'cf-neon-cluster': 'shroom_a', 'cf-toadstool': 'toadstool', 'cf-jelly-tall': 'shroom_tall', 'cf-spore-bulb': 'spore_pod' };
const load = async (f: string): Promise<Mask> => { const { data, info } = await sharp(new URL(f, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height, stride: 4, channel: 3 }; };
const tiles: Buffer[] = [];
const toRGB = (a: Grid, b: Grid) => { const o = Buffer.alloc(96 * 96 * 3); for (let i = 0; i < 96 * 96; i++) { const p = a.v[i] > 0.5, q = b.v[i] > 0.5; o[i * 3] = p && !q ? 230 : p && q ? 230 : 20; o[i * 3 + 1] = p && q ? 210 : !p && q ? 200 : 20; o[i * 3 + 2] = 20; } return o; };
for (const sp of CYBER_FOREST_FUNGI) {
  const spr = map[sp.id]; if (!spr) continue;
  const art = artGrid(await load(SPR + spr + '.webp'));
  const scores = [1, 2, 3].map((s) => { const m = buildFungus(sp, s); return compare(art, meshSilhouette(m.position, m.index, 'front')).score; });
  const m = buildFungus(sp, 1);
  console.log(sp.id, 'score', (scores.reduce((a, b) => a + b) / 3).toFixed(3), 'tris', m.index.length / 3, 'h', m.height.toFixed(2));
  tiles.push(toRGB(art, meshSilhouette(m.position, m.index, 'front')));
}
const out = process.argv[2];
if (out) {
  const W = 96 * tiles.length, img = Buffer.alloc(W * 96 * 3);
  tiles.forEach((t, k) => { for (let j = 0; j < 96; j++) t.copy(img, (j * W + k * 96) * 3, j * 96 * 3, (j + 1) * 96 * 3); });
  await sharp(img, { raw: { width: W, height: 96, channels: 3 } }).resize(W * 3, 288, { kernel: 'nearest' }).png().toFile(out);
}
