// Score each Cyber Forest species against its sheet cut-outs and fit a few knobs to raise the score.
// npx tsx scripts/vegetation/fitSpecies.ts <cutoutDir>   (cutoutDir/<tree>/cut_front.png + cut_left|cut_profile.png)
import sharp from 'sharp';
import fs from 'node:fs';
import { CF_BLUE, CF_MANGROVE, CF_VIOLET, CF_WILLOW } from '../../services/vegetation/catalog/cyberForest';
import { fitSpecies } from '../../services/vegetation/fromArt/score';
import type { Mask } from '../../services/vegetation/fromArt/profile';
const load = async (f: string): Promise<Mask> => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height, stride: 4, channel: 3 }; };
const dir = process.argv[2];
const map: [string, typeof CF_BLUE][] = [['tree_bio', CF_VIOLET], ['tree_willow', CF_WILLOW], ['tree_blue', CF_BLUE], ['tree_mangrove', CF_MANGROVE]];
const out: Record<string, unknown> = {};
for (const [folder, sp] of map) {
  const side = fs.existsSync(`${dir}/${folder}/cut_left.png`) ? `${dir}/${folder}/cut_left.png` : `${dir}/${folder}/cut_profile.png`;
  const art = { front: await load(`${dir}/${folder}/cut_front.png`), side: await load(side) };
  const t0 = Date.now();
  const r = fitSpecies(sp, art, 2);
  out[sp.id] = { before: r.before, after: r.after, scores: r.scores, leavesSize: +r.species.leaves.size.toFixed(2), attractors: r.species.crown.attractors, perTip: r.species.leaves.perTip, profileScale: +(r.species.crown.profile[3].r / sp.crown.profile[3].r).toFixed(3), trunkRadius: +r.species.trunk.radius.toFixed(3), rootReach: +r.species.trunk.rootReach.toFixed(2), ms: Date.now() - t0 };
  console.log(sp.id, JSON.stringify(out[sp.id]));
}
fs.writeFileSync('services/vegetation/catalog/cyberForest.fit.json', JSON.stringify(out, null, 1));
