// Node smoke test over real PSDs: structure, report, no crash. Run through vite-node/tsx.
import fs from 'fs';
import { importPsdDocument } from '../services/tela/import/psdImport';
const files = process.argv.slice(2);
for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(f)); const t0 = Date.now(); let puts = 0, px = 0;
  try {
    const r = await importPsdDocument(bytes, { fileName: f.split(/[\\/]/).pop()!, env: {
      putImage: async (im, name) => { puts++; px += im.width * im.height; return { src: `mem:${name}` }; },
      resolveFonts: async names => Object.fromEntries(names.map(n => [n, { requested: n, css: `"${n}"`, family: n, weight: 400, italic: false, status: 'substitute' as const }])),
    } });
    const kinds: Record<string, number> = {}; for (const p of r.pages) for (const o of p.objects) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    console.log('\n==', r.report.fileName, `${Date.now() - t0}ms`, `${r.report.width}x${r.report.height}`, r.report.colorMode, r.report.bits, 'layers', r.report.layers, 'pages', r.pages.length, kinds, 'puts', puts, 'Mpx', (px / 1e6).toFixed(1), 'composite', !!r.composite);
    console.log(r.report.features.map(x => `${x.status}:${x.feature}x${x.count}`).join(' | '));
    if (r.report.warnings.length) console.log('warn', r.report.warnings.slice(0, 4));
    console.log('sample', JSON.stringify(r.pages[0].objects.slice(-2).map(o => ({ k: o.kind, l: o.objectLabel, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h), masks: o.geom?.masks?.length, mat: o.geom?.material?.preset, g: o.groupId && 'g', blend: o.blendMode }))));
  } catch (e) { console.log('\n== FAIL', f, (e as Error).stack?.slice(0, 500)); }
}

