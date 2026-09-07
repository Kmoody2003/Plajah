// telaGallery — render every Tela template to one HTML proof sheet for visual QA.
//
//   npx tsx scripts/telaGallery.ts out.html                # everything
//   npx tsx scripts/telaGallery.ts out.html eras            # only style eras
//   npx tsx scripts/telaGallery.ts out.html eras gothic,punk
//   npx tsx scripts/telaGallery.ts out.html pub|creative|lower
//
// Prints lint results to stdout (exit 1 on errors) so it doubles as a checker.
import { writeFileSync, mkdirSync } from 'node:fs';
import { objectsToSvg } from '../services/tela/telaSvg';
import { lintPage, formatIssues, pageSignature } from '../services/tela/templateLint';
import { FONTS, fontKeysInStacks } from '../services/tela/telaFonts';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from '../services/tela/telaTemplateRegistry';

const [, , outPath = 'tela-gallery.html', which = 'all', onlyIds = ''] = process.argv;
const only = new Set(onlyIds.split(',').map(s => s.trim()).filter(Boolean));

const pick = (t: TelaDesignTemplate) => {
  if (only.size && !only.has(t.id) && !only.has(t.family || '')) return false;
  if (which === 'all') return true;
  if (which === 'eras') return t.collection === 'DESIGN_HISTORY';
  if (which === 'pub') return t.collection === 'PUBLICATION';
  if (which === 'lower') return t.collection === 'LOWER_THIRD';
  if (which === 'creative') return !['DESIGN_HISTORY', 'PUBLICATION', 'LOWER_THIRD'].includes(t.collection);
  return t.collection === which.toUpperCase();
};

const templates = TELA_TEMPLATE_GALLERY.filter(pick);
let errors = 0; const cards: string[] = []; const sigs = new Map<string, string>(); const fontKeys = new Set<string>();
for (const t of templates) {
  const pageHtml: string[] = [];
  t.pages.forEach((p, i) => {
    let objects; try { objects = p.build(); } catch (e: any) { errors++; console.log(`  [error] ${t.name} / ${p.label}: build threw ${e?.message}`); return; }
    const issues = lintPage(objects, t.width, t.height, { requireHeadline: i === 0 && t.collection !== 'LOWER_THIRD', minObjects: t.collection === 'LOWER_THIRD' ? 3 : 10 });
    const errs = issues.filter(x => x.severity === 'error'); errors += errs.length;
    if (issues.length) console.log(formatIssues(`${t.name} / ${p.label}`, issues));
    const sig = pageSignature(objects); const prev = sigs.get(sig);
    if (prev && !prev.startsWith(t.id)) { errors++; console.log(`  [error] ${t.name} / ${p.label}: identical geometry to ${prev} (palette swap)`); }
    sigs.set(sig, `${t.id} / ${p.label}`);
    for (const k of fontKeysInStacks(objects.map(o => o.fontFamily))) fontKeys.add(k);
    const svg = objectsToSvg(objects, t.width, t.height).replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?">/, ' style="width:100%;height:auto;display:block">');
    pageHtml.push(`<figure><div class="page" style="aspect-ratio:${t.width}/${t.height}">${svg}</div><figcaption>${p.label} · ${objects.length} objects${errs.length ? ` · <b style="color:#f66">${errs.length} errors</b>` : ''}</figcaption></figure>`);
  });
  cards.push(`<section class="card"><header><h2>${t.name}</h2><div class="meta">${t.collection} · ${t.group} · ${t.width}×${t.height}</div><p>${t.tagline}</p><div class="pal">${t.palette.map(c => `<i style="background:${c}"></i>`).join('')}</div></header><div class="pages">${pageHtml.join('')}</div><aside><b>Lesson</b> ${t.lesson.principle}<br/><b>History</b> ${t.lesson.history}</aside></section>`);
}
const links = [...fontKeys].map(k => (FONTS as any)[k]?.google).filter(Boolean);
const html = `<!doctype html><meta charset="utf-8"><title>Tela template proof sheet</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${links.map(s => `family=${s}`).join('&')}&display=swap">
<style>body{margin:0;background:#141118;color:#eee;font:13px/1.4 Inter,system-ui,sans-serif;padding:24px}h1{font-weight:800;margin:0 0 18px}.card{background:#1d1824;border:1px solid #2c2535;border-radius:14px;padding:16px;margin-bottom:22px}header h2{margin:0;font-size:18px}.meta{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9a90a8;margin:4px 0}.pal i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:4px;border:1px solid rgba(255,255,255,.2)}.pages{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px}figure{margin:0;width:${which === 'lower' ? 520 : 330}px}.page{background:#fff;box-shadow:0 12px 30px rgba(0,0,0,.5);overflow:hidden}figcaption{font-size:10px;color:#9a90a8;margin-top:6px}aside{margin-top:10px;font-size:11px;color:#b8b0c4;max-width:900px}</style>
<h1>Tela template proof sheet — ${templates.length} templates · ${which}</h1>${cards.join('')}`;
if (outPath.endsWith('/') || outPath.endsWith('\\')) {
  // PER-TEMPLATE mode: one small HTML per template (the Browser pane cannot snapshot a 1 MB sheet) + an index.
  mkdirSync(outPath, { recursive: true });
  const shell = (body: string, ttl: string) => html.replace(/<h1>[\s\S]*$/, `<h1>${ttl}</h1>${body}`);
  templates.forEach((t, i) => {
    // Only this template's fonts — a 40-family stylesheet makes the pane's snapshot time out.
    const own = new Set<string>(); t.pages.forEach(p => { try { fontKeysInStacks(p.build().map(o => o.fontFamily)).forEach(k => own.add(k)); } catch { /* reported above */ } });
    const ownLinks = [...own].map(k => (FONTS as any)[k]?.google).filter(Boolean);
    const page = shell(cards[i], t.name).replace(/<link rel="stylesheet"[^>]*>/, `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${ownLinks.map(s => `family=${s}`).join('&')}&display=swap">`);
    writeFileSync(`${outPath}${t.id.replace(/[^a-z0-9]+/gi, '-')}.html`, page);
  });
  writeFileSync(`${outPath}index.html`, shell(templates.map(t => `<p><a style="color:#f0c3ff" href="${t.id.replace(/[^a-z0-9]+/gi, '-')}.html">${t.name}</a> · ${t.collection}</p>`).join(''), 'Proof index'));
} else writeFileSync(outPath, html);
console.log(`\n${templates.length} templates → ${outPath}${errors ? `\n${errors} lint ERRORS` : '\nlint clean'}`);
if (errors) process.exit(1);
