// broadcastProofs — write every broadcast identity to proof pages for design review.
//
//   npx tsx scripts/broadcastProofs.ts [family|all] [packId,packId…]
//
// One HTML page per identity under .tela-proofs/broadcast/each/, plus index.html. The SVGs are
// inline (so Google Fonts apply, the way the library shows them) and the page links the faces
// each identity uses. Rasterise with `node scripts/broadcastContactSheet.cjs`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FABULA_BROADCAST_PACKS } from '../services/fabula/broadcastPacks';
import { fontKeysFor, makeBroadcastTemplate, renderBroadcastTemplateSvg, stillBroadcastSvg, type FabulaBroadcastTemplate } from '../services/fabula/broadcastTemplateFactory';
import { BROADCAST_DESIGNS } from '../services/fabula/broadcastDesigns';
import { FONTS } from '../services/tela/telaFonts';

const which = process.argv[2] || 'all';
const only = process.argv[3]?.split(',').filter(Boolean);
const dir = resolve('.tela-proofs/broadcast/each'); mkdirSync(dir, { recursive: true });

const packs = FABULA_BROADCAST_PACKS.filter(p => (which === 'all' || p.family === which) && (!only || only.includes(p.id)));
const KINDS: FabulaBroadcastTemplate['kind'][] = ['OPENER', 'LOWER_THIRD', 'FULL_PAGE', 'SCORE_STRIP', 'BUG', 'STINGER', 'TRANSITION', 'OVERLAY', 'CREDITS'];
const fontLink = (keys: string[]) => { const g = keys.map(k => (FONTS as any)[k]?.google).filter(Boolean); return g.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${g.map(s => `family=${s}`).join('&')}&display=swap">` : ''; };
// Freeze motion at its held state so the proof shows the composition, not the first frame.
const still = stillBroadcastSvg;

const cards: string[] = [];
for (const p of packs) {
  const d = BROADCAST_DESIGNS[p.id];
  const keys = fontKeysFor(p.id);
  const cells = KINDS.map(kind => {
    const t = makeBroadcastTemplate(p, kind); t.controls.motionSpeed = 40;
    const svg = still(renderBroadcastTemplateSvg(t)).replace(/<svg /, '<svg style="width:100%;height:auto;display:block" ');
    const checker = kind === 'LOWER_THIRD' || kind === 'BUG' || kind === 'OVERLAY';
    return `<figure class="cell ${kind === 'OPENER' ? 'big' : ''}"><div class="frame${checker ? ' chk' : ''}">${svg}</div><figcaption>${kind.replace('_', ' ')}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${p.name}</title>${fontLink(keys)}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">
<style>body{margin:0;background:#141118;color:#e8e2ea;font:13px/1.5 Inter,system-ui,sans-serif}.card{padding:28px;width:1180px}.head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}h1{font-size:22px;margin:0}.meta{font-size:11px;color:#a89fb0;letter-spacing:.06em;text-transform:uppercase}.idea{font-style:italic;color:#cfc6d6;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.cell{margin:0}.big{grid-column:span 2}.frame{background:#000;border:1px solid #2b2530}.chk{background:repeating-conic-gradient(#2a2a2e 0 25%,#1c1c20 0 50%) 0 0/24px 24px}figcaption{font-size:10px;letter-spacing:.1em;color:#a89fb0;margin-top:4px}.sw{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:3px;vertical-align:middle}</style>
<div class="card"><div class="head"><h1>${p.name}</h1><span class="meta">${p.family} · ${p.councilStyle} · ${d ? [d.type.display, d.type.text, d.type.utility].map(k => (FONTS as any)[k]?.family).join(' / ') : 'no design'}</span></div>
<p class="idea">${d?.idea ?? ''}</p><div style="margin-bottom:10px">${p.palette.map(c => `<span class="sw" style="background:${c}"></span>`).join('')}</div>
<div class="grid">${cells}</div></div>`;
  writeFileSync(resolve(dir, `broadcast-${p.id}.html`), html);
  cards.push(`<a href="each/broadcast-${p.id}.html">${p.name}</a>`);
}
writeFileSync(resolve('.tela-proofs/broadcast/index.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;padding:24px;columns:3}a{display:block}</style>${cards.join('')}`);
console.log(packs.length, 'identities →', dir);
