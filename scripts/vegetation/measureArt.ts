// Measure trees from their sheet cut-outs (front + side PNGs with alpha) → TreeMeasure JSON for species files.
// npx tsx scripts/vegetation/measureArt.ts <front.png> [side.png]
import sharp from 'sharp';
import { measureTree, type Mask } from '../../services/vegetation/fromArt/profile';
const load = async (f: string): Promise<Mask> => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height, stride: 4, channel: 3 }; };
const [front, side] = process.argv.slice(2);
const m = measureTree(await load(front), side ? await load(side) : undefined);
console.log(JSON.stringify(m));
