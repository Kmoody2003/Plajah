// Real-file smoke test for the Illustrator importers. npx tsx scripts/testTelaImportAi.mts <files...>
import fs from 'fs';
import { importPdfDocument } from '../services/tela/import/pdfVector';
import { importAiNative } from '../services/tela/import/aiNative';
import { deviceToSvg } from '../services/tela/geometry/serialize';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const outDir = process.env.OUT;
for (const f of process.argv.slice(2)) {
  const bytes = new Uint8Array(fs.readFileSync(f)); const name = f.split(/[\\/]/).pop()!; const t0 = Date.now();
  const env = { putImage: async (im: { width: number; height: number }, n: string) => ({ src: `mem:${n}:${im.width}x${im.height}` }), resolveFonts: async (ns: string[]) => Object.fromEntries(ns.map(n => [n, { requested: n, css: `"${n}"`, family: n, weight: 400, italic: false, status: 'substitute' as const }])) };
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50;
  try {
    const r = isPdf ? await importPdfDocument(bytes, { fileName: name, format: /\.ai$/i.test(name) ? 'ai' : 'pdf', env, pdfjs }) : await importAiNative(bytes, { fileName: name, format: /\.eps$/i.test(name) ? 'eps' : 'ai', env });
    if (!r) { console.log('\n==', name, 'no result'); continue; }
    const kinds: Record<string, number> = {}; for (const p of r.pages) for (const o of p.objects) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    console.log('\n==', name, `${Date.now() - t0}ms`, r.pages.map(p => `${Math.round(p.width)}x${Math.round(p.height)}`).join(','), kinds, 'groups', r.pages.map(p => Object.values(p.studio.groups || {}).map(g => g.name).slice(0, 8).join('/')));
    console.log(r.report.features.map(x => `${x.status}:${x.feature}x${x.count}`).join(' | '));
    console.log('fonts', r.report.fonts.map(x => x.requested).join(', '));
    console.log('text', r.pages[0].objects.filter(o => o.kind === 'TEXT').slice(0, 5).map(o => [o.text, Math.round(o.x), Math.round(o.y), Math.round(o.fontSize || 0)]));
    if (outDir) r.pages.forEach((p, i) => fs.writeFileSync(`${outDir}/${name}.${i}.svg`, deviceToSvg(p as never, { background: '#fff' })));
  } catch (e) { console.log('\n== FAIL', name, (e as Error).stack?.slice(0, 700)); }
}
