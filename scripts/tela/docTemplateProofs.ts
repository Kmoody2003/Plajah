// docTemplateProofs — proof sheets of the word-page template library: every template's pages
// drawn by the real text engine, six to a sheet, so the designs can be looked at.
//
// Run: node node_modules/tsx/dist/cli.mjs scripts/tela/docTemplateProofs.ts <outDir> [idFilter…]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createTextSystem } from '../../services/text';
import { DOC_TEMPLATES, structureById, themeById } from '../../services/tela/docTemplates/library';
import { previewPage, previewSvg } from '../../services/tela/docTemplates/preview';

const out = process.argv[2] || path.join('docs', 'tela', 'doc-templates', 'proofs');
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

(async () => {
  const sys = await createTextSystem();
  const list = DOC_TEMPLATES.filter(t => !only.length || only.some(o => t.id.includes(o)));
  const tiles: { id: string; png: Buffer }[] = [];
  for (const t of list) {
    const st = structureById(t.structureId)!, th = themeById(t.themeId)!;
    for (let i = 0; i < st.pages.length; i++) {
      const pv = await previewPage(sys, st.pages[i], th);
      if (pv.overflow || pv.missing) console.log(`! ${t.id} p${i + 1}: overflow=${pv.overflow} missingRuns=${pv.missing}`);
      tiles.push({ id: `${t.id}${st.pages.length > 1 ? `#${i + 1}` : ''}`, png: await sharp(Buffer.from(previewSvg(pv)), { density: 96 }).resize(612).png().toBuffer() });
    }
  }
  const per = 6, W = 612, H = 792, g = 16;
  for (let i = 0; i < tiles.length; i += per) {
    const group = tiles.slice(i, i + per);
    const sheet = sharp({ create: { width: 3 * (W + g) + g, height: 2 * (H + g) + g, channels: 3, background: '#2a2630' } })
      .composite(group.map((b, k) => ({ input: b.png, left: g + (k % 3) * (W + g), top: g + Math.floor(k / 3) * (H + g) })));
    const f = path.join(out, `proof-${String(i / per + 1).padStart(2, '0')}.png`);
    writeFileSync(f, await sheet.png().toBuffer());
    console.log(f, '::', group.map(t => t.id).join(' | '));
  }
})().catch(e => { console.error(e); process.exit(1); });
