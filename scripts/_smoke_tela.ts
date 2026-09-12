import { rect, text, imageSlot, frame, columns, folio, dropCap, mix } from '../services/tela/templateKit';
import { objectsToSvg } from '../services/tela/telaSvg';
import { starTessellation, sunburstPath, wavePath } from '../services/tela/ornaments';
import { path } from '../services/tela/templateKit';
import { copy } from '../services/tela/copy';
import { writeFileSync } from 'node:fs';
const fr = frame(816, 1056, 60);
const cols = columns(fr.x, fr.w, 3, 20);
const objs = [
  rect(0,0,816,1056,'#F3E9D2',{role:'GROUND'}),
  path(fr.x, 80, fr.w, 200, sunburstPath(11), '#A65B36', {opacity:.25}),
  text(fr.x, 120, fr.w, copy.headline('editorial'), {size:52, font:'playfair', weight:700, color:'#28231D', leading:1.02}),
  text(fr.x, 260, fr.w*.7, copy.deck('editorial'), {size:16, font:'lora', italic:true, color:mix('#28231D',.2)}),
  ...dropCap(cols[0].x, 340, cols[0].w+cols[1].w+20, copy.body('editorial'), {color:'#28231D'}),
  ...imageSlot(cols[2].x, 340, cols[2].w, 300),
  path(fr.x, 700, fr.w, 60, wavePath(4, 30, 20), '#C5A66A'),
  ...starTessellation(fr.x, 800, fr.w, 120, 60, '#A65B36', '#C5A66A'),
  ...folio(fr, 'Greco-Roman Classical', 'Page 1', '#28231D'),
];
const svg = objectsToSvg(objs, 816, 1056);
writeFileSync(process.argv[2], `<html><body style="background:#222;margin:0;display:grid;place-items:center;min-height:100vh"><div style="width:600px;background:#fff">${svg}</div></body></html>`);
console.log('objects', objs.length, 'svg bytes', svg.length);
for (const o of objs) if (o.kind==='TEXT') console.log(o.objectLabel, o.h, JSON.stringify(o.text?.slice(0,30)));
