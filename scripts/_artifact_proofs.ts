import { writeFileSync, mkdirSync } from 'node:fs';
import { objectsToSvg } from '../services/tela/telaSvg';
import { TELA_TEMPLATE_GALLERY } from '../services/tela/telaTemplateRegistry';
import { fontKeysInStacks, FONTS } from '../services/tela/telaFonts';
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const want = new Set((process.argv[3] || '').split(',').filter(Boolean));
const svg = (objs: any[], w: number, h: number) => objectsToSvg(objs, w, h).replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?">/, ' style="width:100%;height:auto;display:block">');
const fonts = new Set<string>(); const list: string[] = [];
for (const t of TELA_TEMPLATE_GALLERY) {
  if (want.size && !want.has(t.id)) continue;
  t.pages.forEach((p, i) => { const o = p.build(); const name = `${t.id.replace(/[:]/g, '-')}-${i}`; writeFileSync(`${out}/${name}.svg`, svg(o, t.width, t.height)); fontKeysInStacks(o.map(x => x.fontFamily)).forEach(k => fonts.add(k)); list.push(name); });
}
writeFileSync(`${out}/fonts.txt`, [...fonts].map(k => (FONTS as any)[k].google).join('\n'));
console.log(list.length, 'svgs');
