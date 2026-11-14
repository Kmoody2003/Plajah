// Real-file test for the preset parsers. npx tsx scripts/testTelaPresets.mts <files...>
import fs from 'fs';
import { parsePresetFile } from '../services/tela/import/presets';
for (const f of process.argv.slice(2)) {
  const name = f.split(/[\\/]/).pop()!;
  try {
    const r = parsePresetFile(name, new Uint8Array(fs.readFileSync(f)));
    console.log('==', name, `brushes ${r.brushes.length} shapes ${r.shapes.length} swatches ${r.swatches.length} patterns ${r.patterns.length}`, r.warnings.slice(0, 2));
    if (r.brushes[0]) { const b = r.brushes[0]; console.log('  brush', b.name, 'size', b.size, 'tip', b.tip && `${b.tip.width}x${b.tip.height}`, 'spacing', b.spacing, 'unsupported', b.unsupported); }
    if (r.shapes[0]) console.log('  shape', r.shapes[0].name, r.shapes[0].d.slice(0, 60));
    if (r.swatches[0]) console.log('  swatches', r.swatches.slice(0, 4).map(s => `${s.name}=${s.color}`).join(', '));
    if (r.patterns[0]) { const p = r.patterns[0]; const d = p.image.data; console.log('  pattern', p.name, p.width, p.height, 'first px', d[0], d[1], d[2], d[3], 'mid', d[d.length / 2 | 0], d[(d.length / 2 | 0) + 1]); }
  } catch (e) { console.log('== FAIL', name, (e as Error).message); }
}
