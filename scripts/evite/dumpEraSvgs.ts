// Write every design-era plate as an 816×1224 SVG (text-free) for offline rasterising (scripts/evite/ogImages.mjs).
//   npx tsx scripts/evite/dumpEraSvgs.ts <outDir> [era,ids]
import { writeFileSync, mkdirSync } from 'node:fs';
import { ERA_EVITES, eraPlateSvg } from '../../services/evite/eraEvites';
const out = process.argv[2]; const only = process.argv[3]?.split(',');
if (!out) { console.error('usage: dumpEraSvgs.ts <outDir> [ids]'); process.exit(1); }
mkdirSync(out, { recursive: true });
let n = 0;
for (const e of ERA_EVITES) { const name = e.id.replace(/^era\//, ''); if (only && !only.includes(name)) continue; writeFileSync(`${out}/${name}.svg`, eraPlateSvg(e.id, { W: 816, H: 1224 })); n++; }
console.log(`wrote ${n} era SVGs to ${out}`);
